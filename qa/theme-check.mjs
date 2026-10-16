import fs from 'node:fs';
import path from 'node:path';
import { parseJsonProcessOutput, runProcess, shopifyInvocations } from './process-runner.mjs';

/**
 * Theme Check gegen die Baseline - die eine Quelle fuer beide Stellen:
 * die volle QA (qa/run-qa.mjs, Schritt FULL_QA in workflow preview) und
 * den Guard vor dem Commit (qa/run-themecheck-guard.mjs).
 *
 * Neu ist jeder Befund, dessen Fingerabdruck ohne Zeile/Spalte nicht in
 * qa/theme-check-baseline.json steht. Die Meldung gehoert zum Abdruck: steigt
 * z. B. ExcessiveSettingsCount von 44 auf 45, ist das ein neuer Befund.
 * Gleiche Abdruecke werden gezaehlt: Kennt die Baseline drei gleiche
 * HardcodedRoutes in einer Datei, ist die vierte neu.
 * Vorfall 15.10.2026: Der Guard pruefte nur Fehler, FULL_QA brach an zwei
 * neuen Warnungen ab und main war bis zum Folge-PR blockiert.
 */

export const BASELINE_FILE = 'qa/theme-check-baseline.json';

export function fingerprint(root, file, offense) {
  const relative = path.relative(root, file.path || file).replaceAll('\\', '/');
  return `${offense.severity}|${offense.check}|${relative}|${offense.start_row}:${offense.start_column}|${offense.message}`;
}

// Theme pulls can shift JSON/Liquid lines without changing a finding. Keep the
// recorded position for diagnostics, but exclude it when matching the baseline.
export function stableFingerprint(value) {
  return value.replace(/\|\d+:\d+\|/, '|*|');
}

export function findingsFromFiles(root, files) {
  return files.flatMap(file => file.offenses.map(offense => ({
    fingerprint: fingerprint(root, file, offense), file: path.relative(root, file.path).replaceAll('\\', '/'),
    check: offense.check, severity: offense.severity, line: offense.start_row + 1, message: offense.message
  })));
}

export function summarizeFindings(findings) {
  return {
    errors: findings.filter(x => x.severity === 'error').length,
    warnings: findings.filter(x => x.severity === 'warning').length
  };
}

export async function runThemeCheck({ root }) {
  const themeArgs = ['theme', 'check', '--output', 'json', '--no-color'];
  const attempts = [];
  let parsed;
  for (const invocation of shopifyInvocations()) {
    const result = await runProcess(invocation.command, [...invocation.args, ...themeArgs], { cwd: root });
    parsed = parseJsonProcessOutput(result, { label: `Theme Check (${invocation.label})`, allowedExitCodes: [0, 1] });
    attempts.push({ label: invocation.label, failed: parsed.failed, kind: parsed.kind });
    if (!parsed.failed) break;
  }
  if (parsed?.failed) return { ...parsed, attempts };
  const files = parsed?.value;
  if (!Array.isArray(files)) return { failed: true, kind: 'invalid-output', error: 'Theme Check: JSON-Ausgabe ist kein Datei-Array' };
  const findings = findingsFromFiles(root, files);
  return {
    failed: false, findings,
    ...summarizeFindings(findings),
    recoveredProcessFailures: attempts.filter(attempt => attempt.failed)
  };
}

export function readBaseline(baselinePath) {
  return fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : { errors: 0, warnings: 0, fingerprints: [] };
}

export function writeBaseline(baselinePath, findings, generatedAt = new Date()) {
  fs.writeFileSync(baselinePath, JSON.stringify({
    generatedAt: generatedAt.toISOString(), ...summarizeFindings(findings),
    fingerprints: findings.map(x => x.fingerprint).sort()
  }, null, 2) + '\n');
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}

function take(counts, key) {
  const left = counts.get(key) || 0;
  if (left) counts.set(key, left - 1);
  return left > 0;
}

// Die Baseline ist eine Multimenge: jeder Eintrag deckt genau einen Befund.
// Zuerst gleiche Position paaren, damit bei unverschobenen Zeilen genau das
// hinzugekommene Vorkommen gemeldet wird, danach den Rest ohne Position.
export function newFindings(findings, baseline) {
  const fingerprints = baseline.fingerprints || [];
  const exact = countBy(fingerprints);
  const stable = countBy(fingerprints.map(stableFingerprint));
  const paired = new Set(findings.filter(x => take(exact, x.fingerprint)));
  for (const x of paired) take(stable, stableFingerprint(x.fingerprint));
  return findings.filter(x => !paired.has(x) && !take(stable, stableFingerprint(x.fingerprint)));
}

// Fuer die Meldung: Wie oft steht ein neuer Befund schon in der Baseline,
// wie oft kommt er jetzt vor? Sonst sieht ein gezaehltes Vorkommen aus wie
// eine bekannte Warnung.
function repeatNote(x, findings, baseline) {
  const key = stableFingerprint(x.fingerprint);
  const known = (baseline.fingerprints || []).filter(value => stableFingerprint(value) === key).length;
  if (!known) return '';
  const now = findings.filter(y => stableFingerprint(y.fingerprint) === key).length;
  return ` (gleicher Befund jetzt ${now}-mal in der Datei, Baseline kennt ${known})`;
}

// Guard vor dem Commit: blockiert, was die Deploy-Kette spaeter abbricht -
// jeder Fehler (theme push --strict, auch wenn er in der Baseline steht) und
// jeder neue Befund gegenueber der Baseline (FULL_QA).
export function evaluateGuard(findings, baseline) {
  const fresh = new Set(newFindings(findings, baseline));
  const blocking = findings.filter(x => x.severity === 'error' || fresh.has(x));
  const lines = blocking.map(x => `${fresh.has(x) ? 'NEU' : 'FEHLER'} ${x.severity} ${x.file}:${x.line} ${x.check} – ${x.message}`
    + (fresh.has(x) ? repeatNote(x, findings, baseline) : ''));
  const current = summarizeFindings(findings);
  const freshCount = summarizeFindings([...fresh]);
  lines.push(`Theme-Check-Guard: ${current.errors} Fehler, ${freshCount.warnings} neue Warnungen `
    + `(Baseline ${baseline.errors ?? 0} Fehler / ${baseline.warnings ?? 0} Warnungen, aktuell ${current.errors} / ${current.warnings}).`);
  if (blocking.length) {
    lines.push('An diesen Befunden bricht die Deploy-Kette ab (FULL_QA in workflow preview bzw. theme push --strict). '
      + 'Beheben; bleibt eine Warnung bewusst, die Baseline mit "npm run themecheck:guard -- --update-baseline" neu schreiben und mitcommitten.');
  }
  return { newFindings: [...fresh], blocking, lines, exitCode: blocking.length ? 1 : 0 };
}
