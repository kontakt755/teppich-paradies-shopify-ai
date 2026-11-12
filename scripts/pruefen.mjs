#!/usr/bin/env node
// Eine Pruefung fuer alles, was AGENTS.md "Vor jedem Commit" verlangt - lokal
// und in der PR-Validierung derselbe Befehl.
//
// Bis 2026-10-24 standen dort acht einzelne Befehle, und die CI startete nur
// einen Teil davon: ohne schrift:guard, ohne themecheck:guard und ohne fuenf
// der acht Testsuiten (Dashboard, Betrieb, Hooks, Social, Lexware). Was lokal
// vergessen wurde, fiel erst im Deploy oder im Betrieb auf.
//
//   npm run -s pruefen                         alle Schritte, Exit 1 bei einem Fehler
//   npm run -s pruefen -- --ohne themecheck    ohne Shopify CLI (Remote-Session); steht im Ergebnis
//   npm run -s pruefen -- --nur tests,schrift  einzelne Schritte
//
// Alle Schritte laufen auch nach einem Fehler weiter: ein Lauf meldet alle
// Befunde auf einmal (wie workflow:doctor), danach je Fehler die letzten Zeilen.
//
// Seit 2026-11-07 starten alle Schritte gleichzeitig: sie lesen nur und haengen
// nicht voneinander ab. Vorher liefen sie nacheinander, und die CI wartete nach
// den Tests (69 s) noch auf Theme Check (20 s) und Python (9 s). Der Bericht
// bleibt in der Reihenfolge von SCHRITTE.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Reihenfolge = Ausgabe. `npm` ist ein Skript aus package.json, `befehl` ein direkter Aufruf. */
export const SCHRITTE = [
  { name: 'tests', npm: 'test' },
  { name: 'python', befehl: ['python3', '-m', 'unittest', 'tests/test_bild_qualitaetstest.py', 'tests/test_ebay_einstellen.py', 'tests/test_lernlauf.py'] },
  { name: 'liquid', npm: 'liquid:guard' },
  { name: 'schema', npm: 'schema:guard' },
  { name: 'template', npm: 'template:guard' },
  { name: 'theme', npm: 'theme:guard' },
  { name: 'schrift', npm: 'schrift:guard' },
  { name: 'changelog', npm: 'changelog:guard' },
  { name: 'bewertung', npm: 'bewertung:guard' },
  { name: 'themecheck', npm: 'themecheck:guard' },
  { name: 'secrets', npm: 'secret:scan' },
];

const NAMEN = SCHRITTE.map((s) => s.name);

export function auswahl(argv) {
  const liste = (wert, flag) => {
    if (!wert || wert.startsWith('--')) throw new Error(`${flag} braucht eine Liste, z. B. ${flag} themecheck`);
    const namen = wert.split(',').map((n) => n.trim()).filter(Boolean);
    const unbekannt = namen.filter((n) => !NAMEN.includes(n));
    if (unbekannt.length) throw new Error(`Unbekannter Schritt: ${unbekannt.join(', ')} (bekannt: ${NAMEN.join(', ')})`);
    return namen;
  };
  let nur = null;
  let ohne = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--nur') nur = liste(argv[++i], '--nur');
    else if (argv[i] === '--ohne') ohne = liste(argv[++i], '--ohne');
    else throw new Error(`Unbekannte Option ${argv[i]} (erlaubt: --nur, --ohne)`);
  }
  return SCHRITTE.map((s) => ({
    ...s,
    ausgelassen: (nur && !nur.includes(s.name)) || ohne.includes(s.name),
  }));
}

/** npm aus dem laufenden npm (npm_execpath) - so klappt es auch unter Windows ohne Shell. */
export function aufruf(schritt, env = process.env) {
  if (schritt.befehl) {
    const [bin, ...args] = schritt.befehl;
    return { bin: bin === 'python3' && process.platform === 'win32' ? 'python' : bin, args };
  }
  if (env.npm_execpath) return { bin: process.execPath, args: [env.npm_execpath, 'run', '-s', schritt.npm] };
  return { bin: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', '-s', schritt.npm] };
}

// Zeilen, die den Fehler benennen. Die letzten Zeilen allein reichen nicht: beim
// ersten CI-Lauf (#1667) waren es 30 Zeilen Chrome-Stacktrace ohne Testnamen.
const MARKE = /^\s*(?:✖|not ok\b|FEHLER\b|ERROR\b|\[FATAL|\[\d+:\d+:[\d/.]+:(?:FATAL|ERROR)|[A-Za-z]*Error\b)/;

export function fehlerzeilen(ausgabe, max = 20) {
  const gesehen = new Set();
  for (const zeile of String(ausgabe || '').split('\n')) {
    if (MARKE.test(zeile)) gesehen.add(zeile.trimEnd());
    if (gesehen.size >= max) break;
  }
  return [...gesehen];
}

export function bericht(ergebnisse, { zeilen = 30 } = {}) {
  const z = [];
  for (const e of ergebnisse) {
    const status = e.ausgelassen ? 'AUSGELASSEN' : e.ok ? 'OK' : 'FEHLER';
    const dauer = e.ausgelassen ? '' : ` (${Math.round(e.ms / 1000)} s)`;
    z.push(`${status.padEnd(11)} ${e.name}${dauer}${e.grund ? ` - ${e.grund}` : ''}`);
  }
  for (const e of ergebnisse.filter((x) => !x.ausgelassen && !x.ok)) {
    const marken = fehlerzeilen(e.ausgabe);
    if (marken.length) z.push('', `--- ${e.name}: Fehlerzeilen ---`, ...marken);
    z.push('', `--- ${e.name}: letzte Zeilen ---`);
    z.push(...String(e.ausgabe || '').trimEnd().split('\n').slice(-zeilen));
  }
  const fehler = ergebnisse.filter((e) => !e.ausgelassen && !e.ok).length;
  const aus = ergebnisse.filter((e) => e.ausgelassen).map((e) => e.name);
  z.push('', fehler
    ? `PRUEFEN: ${fehler} von ${ergebnisse.length - aus.length} Schritten fehlgeschlagen.`
    : `PRUEFEN: alle ${ergebnisse.length - aus.length} Schritte bestanden.${aus.length ? ` Ausgelassen: ${aus.join(', ')}.` : ''}`);
  return { text: z.join('\n'), exitCode: fehler ? 1 : 0 };
}

/** Startet einen Schritt und loest mit seinem Ergebnis auf (stdout und stderr in Reihenfolge des Eintreffens). */
export function starte(schritt, { cwd = WURZEL } = {}) {
  const { bin, args } = aufruf(schritt);
  const start = Date.now();
  return new Promise((resolve) => {
    let ausgabe = '';
    let fertig = false;
    const ende = (ok, grund) => {
      if (fertig) return;
      fertig = true;
      console.error(`${ok ? 'OK    ' : 'FEHLER'} ${schritt.name}`);
      resolve({ ...schritt, ok, ms: Date.now() - start, grund, ausgabe });
    };
    const kind = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    kind.stdout.on('data', (d) => { ausgabe += d; });
    kind.stderr.on('data', (d) => { ausgabe += d; });
    kind.on('error', (e) => ende(false, `${bin} nicht startbar (${e.code})`));
    kind.on('close', (status, signal) => ende(status === 0, status === 0 ? '' : `Exit ${status ?? signal}`));
  });
}

async function main() {
  let schritte;
  try { schritte = auswahl(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  const ergebnisse = await Promise.all(schritte.map((s) => (s.ausgelassen ? s : starte(s))));
  const { text, exitCode } = bericht(ergebnisse);
  console.log(text);
  process.exit(exitCode);
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
