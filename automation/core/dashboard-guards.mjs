import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RiskGuard, globMatches, highestRisk, loadRiskMap } from './risk-guard.mjs';

// Der Dashboard-Pfad lief bisher ohne jede Nachkontrolle: Was der Worker
// tatsaechlich angefasst hat, wurde nie gegen die Risiko-Karte gehalten. Der
// Roadmap-Pfad (runner.mjs) hat diese Guards seit jeher - hier fehlten sie.
//
// Bewusst KEINE Allowlist-Mechanik wie im runner: die braucht ein Manifest mit
// allowedFiles/allowedOperations, das es fuer freie Dashboard-Auftraege nicht
// gibt. Geprueft wird stattdessen das, was ohne Manifest belegbar ist: der
// echte Git-Diff gegen Pfad-Risiko und Umfang.
//
// BEKANNTE GRENZE: Der Guard sieht nur den Git-Arbeitsbaum. Aenderungen an
// gitignorierten Dateien und alles ausserhalb des Repositories (Heimverzeichnis,
// Shopify ueber die Admin-API, GitHub) erkennt er nicht. Er ist die zweite
// Verteidigungslinie hinter `--permission-mode plan`, nicht die einzige - und
// ersetzt kein Human Gate fuer geschuetzte externe Aktionen.

export const DEFAULT_RISK_MAP = 'domains/shopify/risk-map.json';
export const DEFAULT_MAX_FILES = Number(process.env.DASHBOARD_GUARD_MAX_FILES ?? 25);
export const DEFAULT_MAX_CHANGED_LINES = Number(process.env.DASHBOARD_GUARD_MAX_CHANGED_LINES ?? 1500);

// Diese Dateien entstehen durch den Lauf selbst (Zustand, Berichte, Evidence)
// und sind kein inhaltlicher Teil der Aenderung.
const NON_BUDGET_PATTERNS = ['.router/**', '.workflow/**', 'reports/**', '**/*.log'];

function normalize(filePath) {
  return String(filePath).replace(/\\/g, '/').replace(/^\.\//, '');
}

export function parseNumstat(output) {
  return String(output || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      const [added, deleted, file] = line.split('\t');
      if (!file) return [];
      // Binaerdateien melden "-" statt einer Zeilenzahl.
      return [{ file: normalize(file), added: Number(added) || 0, deleted: Number(deleted) || 0 }];
    });
}

// Der Zustand VOR dem Lauf. Ohne diesen Bezugspunkt wuerden bereits vorher
// uncommittete Aenderungen dem Worker angelastet.
export function snapshotWorkingTree({ cwd = process.cwd(), exec = execFileSync, io = fs } = {}) {
  const run = args => {
    try { return exec('git', args, { cwd, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }); }
    catch { return ''; }
  };
  // --no-renames: sonst komprimiert git Umbenennungen zu "dir/{alt => neu}.txt",
  // was kein echter Pfad ist und die Risiko-Zuordnung verfehlen wuerde. Ohne die
  // Option erscheint eine Umbenennung sauber als Loeschung plus Neuanlage.
  const tracked = parseNumstat(`${run(['diff', '--numstat', '--no-renames'])}\n${run(['diff', '--cached', '--numstat', '--no-renames'])}`);
  const untracked = String(run(['ls-files', '--others', '--exclude-standard']))
    .split('\n').map(line => line.trim()).filter(Boolean).map(normalize);
  const byFile = new Map();
  for (const entry of tracked) {
    const previous = byFile.get(entry.file) ?? { file: entry.file, added: 0, deleted: 0 };
    byFile.set(entry.file, { file: entry.file, added: previous.added + entry.added, deleted: previous.deleted + entry.deleted });
  }
  // Untracked Dateien liefert git ohne Zeilenzahlen. Wuerde hier nur die Existenz
  // vermerkt, bliebe eine INHALTSaenderung an einer schon vorher vorhandenen
  // untracked Datei unsichtbar - Vorher- und Nachher-Snapshot waeren identisch.
  // Groesse und Zeitstempel machen solche Aenderungen sichtbar.
  for (const file of untracked) {
    if (byFile.has(file)) continue;
    let size = 0;
    let modifiedAt = 0;
    try {
      const stats = io.statSync(path.resolve(cwd, file));
      size = stats.size;
      modifiedAt = stats.mtimeMs;
    } catch { /* Datei ist zwischenzeitlich verschwunden */ }
    byFile.set(file, { file, added: 0, deleted: 0, untracked: true, size, modifiedAt });
  }
  return byFile;
}

// Nur was der Lauf zusaetzlich veraendert hat.
export function diffSinceSnapshot(before, after) {
  const changes = [];
  for (const [file, entry] of after) {
    const previous = before.get(file);
    if (!previous) { changes.push(entry); continue; }
    const added = entry.added - previous.added;
    const deleted = entry.deleted - previous.deleted;
    if (added !== 0 || deleted !== 0) { changes.push({ file, added: Math.max(added, 0), deleted: Math.max(deleted, 0) }); continue; }
    // Untracked Datei mit gleicher Zeilenbilanz, aber veraendertem Inhalt.
    if (entry.untracked && (entry.size !== previous.size || entry.modifiedAt !== previous.modifiedAt)) {
      changes.push({ file, added: 0, deleted: 0, untracked: true });
    }
  }
  return changes;
}

export function evaluateDashboardGuards({
  taskType,
  risk = 'LOW',
  changes,
  riskMap,
  maxFiles = DEFAULT_MAX_FILES,
  maxChangedLines = DEFAULT_MAX_CHANGED_LINES,
}) {
  // Ein Analyse-Lauf, der Dateien veraendert, ist immer ein Fehler - egal wie
  // harmlos die Datei ist. Genau dieser Fall blieb frueher unbemerkt.
  if (taskType === 'ANALYSIS' && changes.length) {
    return {
      status: 'READ_ONLY_VIOLATED',
      changedFiles: changes.map(change => change.file),
      message: `Der Auftrag war als reine Analyse eingestuft, hat aber ${changes.length} Datei(en) verändert: ${changes.slice(0, 5).map(change => change.file).join(', ')}${changes.length > 5 ? ' …' : ''}. Die Änderungen wurden nicht zurückgenommen und stehen weiter in der Arbeitskopie.`,
    };
  }
  if (!changes.length) return { status: 'PASS', changedFiles: [], files: 0, changedLines: 0, effectiveRisk: 'LOW' };

  const guard = new RiskGuard({ riskMap });
  const files = [...new Set(changes.map(change => change.file))];
  const pathRisk = highestRisk(...files.map(file => guard.pathRisk(file)));
  if (pathRisk === 'HIGH' && risk !== 'HIGH') {
    const risky = files.filter(file => guard.pathRisk(file) === 'HIGH');
    return {
      status: 'RISK_EXCEEDED',
      changedFiles: files,
      effectiveRisk: pathRisk,
      declaredRisk: risk,
      message: `Der Lauf hat besonders geschützte Dateien verändert (${risky.slice(0, 5).join(', ')}), obwohl er als ${risk} eingestuft war. Das braucht eine ausdrückliche Freigabe.`,
    };
  }

  const budgetChanges = changes.filter(change => !NON_BUDGET_PATTERNS.some(pattern => globMatches(change.file, pattern)));
  const budgetFiles = new Set(budgetChanges.map(change => change.file)).size;
  const changedLines = budgetChanges.reduce((sum, change) => sum + change.added + change.deleted, 0);
  if (budgetFiles > maxFiles || changedLines > maxChangedLines) {
    return {
      status: 'BUDGET_EXCEEDED',
      changedFiles: files,
      files: budgetFiles,
      changedLines,
      effectiveRisk: pathRisk,
      message: `Der Lauf hat ${budgetFiles} Datei(en) mit ${changedLines} geänderten Zeilen angefasst (erlaubt: ${maxFiles} Dateien / ${maxChangedLines} Zeilen). Bitte vor der Übernahme selbst durchsehen.`,
    };
  }
  return { status: 'PASS', changedFiles: files, files: budgetFiles, changedLines, effectiveRisk: pathRisk };
}

export function loadDashboardRiskMap({ cwd = process.cwd(), riskMapPath = DEFAULT_RISK_MAP, io = fs } = {}) {
  const absolute = path.isAbsolute(riskMapPath) ? riskMapPath : path.join(cwd, riskMapPath);
  if (!io.existsSync(absolute)) return null;
  try { return loadRiskMap(absolute); } catch { return null; }
}
