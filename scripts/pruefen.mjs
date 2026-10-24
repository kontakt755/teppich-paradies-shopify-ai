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
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Reihenfolge = Ausgabe. `npm` ist ein Skript aus package.json, `befehl` ein direkter Aufruf. */
export const SCHRITTE = [
  { name: 'tests', npm: 'test' },
  { name: 'python', befehl: ['python3', '-m', 'unittest', 'tests/test_bild_qualitaetstest.py'] },
  { name: 'liquid', npm: 'liquid:guard' },
  { name: 'schema', npm: 'schema:guard' },
  { name: 'template', npm: 'template:guard' },
  { name: 'theme', npm: 'theme:guard' },
  { name: 'schrift', npm: 'schrift:guard' },
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

export function bericht(ergebnisse, { zeilen = 30 } = {}) {
  const z = [];
  for (const e of ergebnisse) {
    const status = e.ausgelassen ? 'AUSGELASSEN' : e.ok ? 'OK' : 'FEHLER';
    const dauer = e.ausgelassen ? '' : ` (${Math.round(e.ms / 1000)} s)`;
    z.push(`${status.padEnd(11)} ${e.name}${dauer}${e.grund ? ` - ${e.grund}` : ''}`);
  }
  for (const e of ergebnisse.filter((x) => !x.ausgelassen && !x.ok)) {
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

function main() {
  let schritte;
  try { schritte = auswahl(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  const ergebnisse = [];
  for (const s of schritte) {
    if (s.ausgelassen) { ergebnisse.push(s); continue; }
    const { bin, args } = aufruf(s);
    const start = Date.now();
    const r = spawnSync(bin, args, { cwd: WURZEL, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const ok = r.status === 0 && !r.error;
    const grund = r.error ? `${bin} nicht startbar (${r.error.code})` : ok ? '' : `Exit ${r.status ?? r.signal}`;
    ergebnisse.push({ ...s, ok, ms: Date.now() - start, grund, ausgabe: `${r.stdout || ''}${r.stderr || ''}` });
    console.error(`${ok ? 'OK    ' : 'FEHLER'} ${s.name}`);
  }
  const { text, exitCode } = bericht(ergebnisse);
  console.log(text);
  process.exit(exitCode);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
