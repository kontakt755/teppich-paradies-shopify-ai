#!/usr/bin/env node
// Arbeitskopien entfernen, deren Arbeit vollstaendig in origin/main steckt.
//
//   npm run -s worktrees:aufraeumen               nur anzeigen (Standard)
//   npm run -s worktrees:aufraeumen -- --entfernen entfernen, was alle Bedingungen erfuellt
//
// AGENTS.md: "Nach dem Merge wird der Worktree entfernt." Ohne Werkzeug passierte
// das nicht: am 16.10. lagen 14 gemergte Worktrees herum (docs/analyse/
// claude-system-2026-10-16.md, Nr. 10), am 24.10. waren es 33 von 40.
//
// Entfernt wird nur, wenn ALLES gilt - sonst bleibt die Kopie und der Grund steht da:
//   - nicht der Hauptcheckout, nicht die Kopie mit Branch main (Deploy), nicht die eigene;
//   - HEAD ist in origin/main enthalten (nach git fetch);
//   - keine geaenderten und keine unversionierten Dateien;
//   - ignorierte Dateien nur aus der Liste NEU_ERZEUGBAR - git worktree remove
//     loescht ignorierte Dateien ohne Rueckfrage;
//   - letzte Git-Aktivitaet (Reflog des Worktrees) aelter als 24 Stunden: eine frisch
//     auf origin/main angelegte Kopie ist "gemergt und sauber", aber gerade in Arbeit;
//   - kein laufender Prozess hat sein Arbeitsverzeichnis darin (lsof);
//   - kein LaunchAgent verweist hinein: der Betriebs-Checkout (~/tp-dashboard)
//     wuerde sonst entfernt, sobald sein Branch in main steckt und gerade kein
//     Dienst laeuft (zeitgesteuerte Jobs wie die Sicherung um 22:30).
// Der Branch bleibt bestehen; zurueckholen mit `git worktree add <pfad> <branch>`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NEU_ERZEUGBAR = [
  // node_modules ist oft ein Symlink auf einen anderen Checkout; entfernt wird nur der Link.
  // Nicht hier: .router/ (control-center-audit.jsonl, Nutzungsjournale - Protokolle, Codex-Review #1669).
  /^node_modules(\/|$)/, /^\.workflow\//, /^qa\/results\//, /^SEO_REPORT\.md$/,
  /^docs\/ai-dashboard\/(issues|bodenwissen)\.json$/, /(^|\/)\.DS_Store$/,
];
const RUHE_MS = 24 * 60 * 60 * 1000;

export function worktrees(porcelain) {
  const liste = [];
  let w = null;
  for (const zeile of porcelain.split('\n')) {
    if (zeile.startsWith('worktree ')) { w = { pfad: zeile.slice(9), branch: null, head: null }; liste.push(w); }
    else if (w && zeile.startsWith('HEAD ')) w.head = zeile.slice(5);
    else if (w && zeile.startsWith('branch ')) w.branch = zeile.slice(7).replace(/^refs\/heads\//, '');
  }
  return liste;
}

/** Grund, warum die Kopie bleibt - oder null, wenn sie weg darf. */
const darin = (pfad, wurzel) => pfad === wurzel || pfad.startsWith(wurzel + path.sep);

/** Absolute Pfade aus den <string>-Werten von LaunchAgent-Plists (XML). */
export function dienstPfade(plists) {
  return plists.flatMap((xml) => [...xml.matchAll(/<string>(\/[^<]+)<\/string>/g)].map((m) => m[1]));
}

export function grund(w, { haupt, eigene, gemergt, geaendert, ignoriert, letzteAktivitaet, prozessCwds, dienste = [], jetzt }) {
  if (w.pfad === haupt) return 'Hauptcheckout';
  if (w.pfad === eigene) return 'eigene Arbeitskopie';
  if (w.branch === 'main') return 'Branch main (Deploy-Worktree)';
  if (dienste == null) return 'LaunchAgents nicht pruefbar';
  if (dienste.some((d) => darin(d, w.pfad))) return 'Betriebs-Checkout (ein LaunchAgent verweist hinein)';
  if (!gemergt) return 'Arbeit nicht in origin/main';
  if (geaendert.length) return `${geaendert.length} geaenderte/unversionierte Dateien`;
  const fremd = ignoriert.filter((d) => !NEU_ERZEUGBAR.some((r) => r.test(d)));
  if (fremd.length) return `ignorierte Dateien, die nicht neu erzeugbar sind: ${fremd.slice(0, 3).join(', ')}${fremd.length > 3 ? ' …' : ''}`;
  if (letzteAktivitaet == null) return 'letzte Aktivitaet unbekannt';
  if (jetzt - letzteAktivitaet < RUHE_MS) return 'Git-Aktivitaet in den letzten 24 Stunden';
  if (prozessCwds == null) return 'laufende Prozesse nicht pruefbar (lsof fehlt)';
  if (prozessCwds.some((c) => darin(c, w.pfad))) return 'ein laufender Prozess arbeitet darin';
  return null;
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
}

function prozessArbeitsordner() {
  try {
    return execFileSync('lsof', ['-d', 'cwd', '-Fn'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
      .split('\n').filter((z) => z.startsWith('n')).map((z) => z.slice(1));
  } catch (e) {
    // lsof meldet Exit 1, wenn einzelne Prozesse nicht lesbar sind; die Ausgabe gilt trotzdem.
    if (e.stdout) return String(e.stdout).split('\n').filter((z) => z.startsWith('n')).map((z) => z.slice(1));
    return null;
  }
}

function launchAgents() {
  if (process.platform !== 'darwin') return [];
  const ordner = path.join(os.homedir(), 'Library', 'LaunchAgents');
  try {
    // plutil wandelt auch binaere Plists in XML; Sicherungskopien (*.plist.sicherung-*) zaehlen mit.
    return dienstPfade(fs.readdirSync(ordner).filter((d) => d.includes('.plist')).map((d) =>
      execFileSync('plutil', ['-convert', 'xml1', '-o', '-', path.join(ordner, d)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })));
  } catch { return null; }
}

function letzteAktivitaet(pfad) {
  try {
    const gitdir = git(['rev-parse', '--path-format=absolute', '--git-dir'], pfad).trim();
    return fs.statSync(path.join(gitdir, 'logs', 'HEAD')).mtimeMs;
  } catch { return null; }
}

function main() {
  const entfernen = process.argv.includes('--entfernen');
  const unbekannt = process.argv.slice(2).filter((a) => a !== '--entfernen');
  if (unbekannt.length) { console.error(`Unbekannte Option ${unbekannt[0]} (erlaubt: --entfernen)`); process.exit(2); }
  const eigene = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
  const haupt = path.dirname(git(['rev-parse', '--path-format=absolute', '--git-common-dir'], eigene).trim());
  try { git(['fetch', '-q', 'origin', 'main'], haupt); } catch { console.error('Hinweis: git fetch fehlgeschlagen - Vergleich mit dem letzten bekannten origin/main.'); }
  const prozessCwds = prozessArbeitsordner();
  const dienste = launchAgents();
  const jetzt = Date.now();
  const weg = [];
  const bleibt = [];
  for (const w of worktrees(git(['worktree', 'list', '--porcelain'], haupt))) {
    if (!fs.existsSync(w.pfad)) { bleibt.push([w, 'Ordner fehlt (git worktree prune)']); continue; }
    let gemergt = false;
    try { git(['merge-base', '--is-ancestor', w.head, 'origin/main'], haupt); gemergt = true; } catch { /* nicht enthalten */ }
    const status = gemergt ? git(['status', '--porcelain', '--ignored'], w.pfad).split('\n').filter(Boolean) : [];
    const geaendert = status.filter((z) => !z.startsWith('!! '));
    const ignoriert = status.filter((z) => z.startsWith('!! ')).map((z) => z.slice(3));
    const g = grund(w, { haupt, eigene, gemergt, geaendert, ignoriert, letzteAktivitaet: letzteAktivitaet(w.pfad), prozessCwds, dienste, jetzt });
    (g ? bleibt : weg).push([w, g]);
  }
  const name = (w) => `${w.pfad.replace(process.env.HOME || '', '~')}  ${w.branch ?? `(losgeloest ${w.head.slice(0, 8)})`}`;
  console.log(`${entfernen ? 'Entfernt' : 'Wuerde entfernen'}: ${weg.length}`);
  for (const [w] of weg) {
    if (entfernen) {
      try { git(['worktree', 'remove', w.pfad], haupt); console.log(`  - ${name(w)}`); } catch (e) { console.log(`  ! ${name(w)}: ${String(e.message).split('\n')[0]}`); }
    } else console.log(`  - ${name(w)}`);
  }
  console.log(`Bleibt: ${bleibt.length}`);
  for (const [w, g] of bleibt) if (!['Hauptcheckout', 'eigene Arbeitskopie'].includes(g)) console.log(`  = ${name(w)}  [${g}]`);
  if (entfernen) git(['worktree', 'prune'], haupt);
  else if (weg.length) console.log('Entfernen mit: npm run -s worktrees:aufraeumen -- --entfernen (Branches bleiben).');
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
