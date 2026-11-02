#!/usr/bin/env node
// Changelog des Control Centers: ein Eintrag = eine Datei unter docs/control-center/changelog/.
//
//   npm run changelog:guard                      # Exit 1 bei einem Verstoss
//   node scripts/changelog-guard.mjs --wurzel X  # anderes Repository (Tests)
//
// Warum Einzeldateien: Bis 2026-10-29 schrieb jeder PR seinen Eintrag oben in
// docs/control-center/CHANGELOG.md. Lokal loeste `merge=union` (.gitattributes) das auf,
// GitHub wertet Merge-Treiber aber nicht aus: nach jedem Merge nach main standen alle
// anderen offenen PRs mit Eintrag als CONFLICTING, die PR-Validierung startete nicht, und
// jemand zog origin/main von Hand in jeden Branch (27 Nachzieh-Merges allein am 29.10.).
// Eine Datei je Eintrag beruehrt keine fremde Zeile - es gibt nichts mehr zu mergen.
// Hintergrund: docs/lessons/pr-basis-und-historie.md.
//
// Geprueft wird:
//   1. Dateiname JJJJ-MM-TT-<kurzname>.md (Kleinbuchstaben, Ziffern, Bindestrich); README.md ausgenommen
//   2. erste Zeile "## JJJJ-MM-TT · Titel" mit dem Datum aus dem Dateinamen
//   3. Pflichtabschnitte Geaendert, Getestet, Risiken/Annahmen, Naechste Stufe
//   4. CHANGELOG.md ist eingefroren: keine Ueberschrift mit Datum nach dem Einfrierdatum
//
// Aus den Dateien wird nichts erzeugt und committet - ein mit-committetes Sammeldokument
// haette denselben Konflikt wie die alte Datei.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const EINFRIERDATUM = '2026-10-29';
export const ORDNER = path.join('docs', 'control-center', 'changelog');
export const ALTE_DATEI = path.join('docs', 'control-center', 'CHANGELOG.md');
export const DATEINAME = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
export const KOPF = /^## (\d{4}-\d{2}-\d{2}) · \S/;
const ALTE_UEBERSCHRIFT = /^## (\d{4}-\d{2}-\d{2})/;

// Die Abschnittsnamen stehen seit September in beiden Schreibweisen in CHANGELOG.md
// (Geaendert/Geaendert mit Umlaut, Naechste/Naechste mit Umlaut, Risiken mit und ohne
// /Annahmen). Beide gelten; die README nennt die bevorzugte Form.
export const PFLICHT = [
  { name: 'Geaendert', muster: /^\s*- \*\*Ge(?:ae|ä)ndert:?\*\*/m },
  { name: 'Getestet', muster: /^\s*- \*\*Getestet:?\*\*/m },
  { name: 'Risiken/Annahmen', muster: /^\s*- \*\*(?:Offene )?Risiken(?:\/Annahmen)?:?\*\*/m },
  { name: 'Nächste Stufe', muster: /^\s*- \*\*N(?:ae|ä)chste Stufe:?\*\*/m },
];

function gueltigesDatum(d) {
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/** Fehler eines einzelnen Eintrags (Dateiname + Inhalt); leer = in Ordnung. */
export function pruefeEintrag(name, text) {
  const fehler = [];
  const m = DATEINAME.exec(name);
  if (!m) {
    fehler.push(`${name}: Dateiname muss JJJJ-MM-TT-<kurzname>.md sein (Kleinbuchstaben, Ziffern, Bindestrich).`);
    return fehler;
  }
  const datum = m[1];
  if (!gueltigesDatum(datum)) fehler.push(`${name}: ${datum} ist kein gueltiges Datum.`);
  const erste = String(text || '').split(/\r?\n/, 1)[0];
  const k = KOPF.exec(erste);
  if (!k) fehler.push(`${name}: erste Zeile muss "## ${datum} · Titel" sein, ist: "${erste.slice(0, 60)}".`);
  else if (k[1] !== datum) fehler.push(`${name}: Datum in der Kopfzeile (${k[1]}) weicht vom Dateinamen (${datum}) ab.`);
  for (const p of PFLICHT) {
    if (!p.muster.test(text)) fehler.push(`${name}: Abschnitt "- **${p.name}:**" fehlt.`);
  }
  return fehler;
}

/** Die alte Sammeldatei: nach dem Einfrierdatum darf keine neue Ueberschrift mehr dazukommen. */
export function pruefeAlteDatei(text, einfrierdatum = EINFRIERDATUM) {
  const fehler = [];
  for (const zeile of String(text || '').split(/\r?\n/)) {
    const m = ALTE_UEBERSCHRIFT.exec(zeile);
    if (m && m[1] > einfrierdatum) {
      fehler.push(`${ALTE_DATEI}: Eintrag "${zeile.slice(0, 70)}" ist neuer als das Einfrierdatum ${einfrierdatum} - als Datei unter ${ORDNER}/ anlegen.`);
    }
  }
  return fehler;
}

/** Alle Eintraege (ohne README.md), nach Dateiname sortiert - neueste zuerst. */
export function ladeEintraege(wurzel = WURZEL) {
  const ordner = path.join(wurzel, ORDNER);
  if (!fs.existsSync(ordner)) return [];
  return fs.readdirSync(ordner)
    .filter((d) => d !== 'README.md' && !d.startsWith('.'))
    .sort()
    .reverse()
    .map((name) => ({ name, pfad: path.join(ordner, name), text: fs.readFileSync(path.join(ordner, name), 'utf8') }));
}

export function pruefe(wurzel = WURZEL, { einfrierdatum = EINFRIERDATUM } = {}) {
  const fehler = [];
  if (!fs.existsSync(path.join(wurzel, ORDNER))) fehler.push(`${ORDNER}/ fehlt.`);
  const eintraege = ladeEintraege(wurzel);
  for (const e of eintraege) fehler.push(...pruefeEintrag(e.name, e.text));
  const alt = path.join(wurzel, ALTE_DATEI);
  if (fs.existsSync(alt)) fehler.push(...pruefeAlteDatei(fs.readFileSync(alt, 'utf8'), einfrierdatum));
  return { fehler, anzahl: eintraege.length };
}

function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--wurzel');
  const wurzel = i >= 0 ? path.resolve(argv[i + 1] || '') : WURZEL;
  const { fehler, anzahl } = pruefe(wurzel);
  if (fehler.length) {
    for (const f of fehler) console.error(`FEHLER ${f}`);
    console.error(`changelog:guard: ${fehler.length} Verstoss/Verstoesse (${anzahl} Eintraege unter ${ORDNER}/). Format: ${ORDNER}/README.md`);
    process.exit(1);
  }
  console.log(`changelog:guard: ${anzahl} Eintraege unter ${ORDNER}/ in Ordnung, ${ALTE_DATEI} eingefroren seit ${EINFRIERDATUM}.`);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
