#!/usr/bin/env node
/**
 * PreToolUse-Hook der Routinelaeufe ("Wache"). claude-lauf.mjs haengt ihn per `--settings` an
 * jeden `claude -p`-Aufruf (operations/lib/routinen.mjs, wacheEinstellungen):
 *
 *   node operations/scripts/routine-wache.mjs <lauf> <privat-ordner> <dienst-checkout>
 *
 * Liest das Hook-Ereignis von stdin und lehnt jeden Aufruf ab, der nicht zur festen Liste des
 * Laufs passt (operations/lib/routine-wache.mjs). Erlaubte Aufrufe gibt die Wache nicht frei -
 * sie laesst sie nur weiter zur normalen Pruefung (--allowedTools, dontAsk).
 *
 * Faellt die Wache selbst aus (kaputte Eingabe, Ausnahme), lehnt sie ab: Exit 2 blockiert den
 * Aufruf; jeder andere Fehler-Exit liesse ihn durch.
 */

import { pruefeAufruf, wacheKontext } from '../lib/routine-wache.mjs';

function ablehnen(grund) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: grund },
  }));
  process.exitCode = 0;
}

function notbremse(e) {
  process.stderr.write(`Wache: Fehler (${String(e?.message || e).slice(0, 160)}) – Aufruf abgelehnt.\n`);
  process.exit(2);
}

process.on('uncaughtException', notbremse);

const [lauf, privat, dienst] = process.argv.slice(2);
let eingabe = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { eingabe += d; });
process.stdin.on('end', () => {
  try {
    const ereignis = JSON.parse(eingabe);
    const r = pruefeAufruf(lauf, ereignis, wacheKontext(lauf, { privat, dienst }));
    if (!r.erlaubt) ablehnen(r.grund);
  } catch (e) {
    notbremse(e);
  }
});
