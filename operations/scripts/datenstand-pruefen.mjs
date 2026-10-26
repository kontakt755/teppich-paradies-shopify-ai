#!/usr/bin/env node
/**
 * Datenstand des Sync-Dienstes pruefen - stuendlich, ohne Claude (launchd-Dienst
 * net.teppich-paradies.datenstand). Ersetzt den Datenteil der App-Aufgabe "shop-zahlen-export":
 * die Daten holt laengst der Sync-Dienst (net.teppich-paradies.sync); hier wird nur geprueft,
 * dass er sie auch liefert.
 *
 *   node operations/scripts/datenstand-pruefen.mjs            # pruefen, Status schreiben
 *   node operations/scripts/datenstand-pruefen.mjs --trocken  # nur anzeigen
 *
 * Gesund (operations/lib/routinen.mjs, pruefeGesundheit): aktualisierung.json hoechstens
 * 60 Minuten alt, jeder Teil erfolgreich, Lexikon/Bestand hoechstens 3 Stunden. Sonst ein
 * Status unter $TP_PRIVAT_DIR/routinen/datenstand/, eine Mitteilung auf dem Mac (nur bei neuem
 * Fehler) und ein rotes To-do im Control Center (Heute). Der Systemzustand des Dashboards zeigt
 * dieselbe Datei nur als Kachel - ohne To-do und ohne Mitteilung; das Nachziehen des
 * Dienst-Checkouts (#1715) prueft sie nicht.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privatDir, schreibStatus, pruefeGesundheit } from '../lib/routinen.mjs';
import { mitteilung } from './claude-lauf.mjs';

export const TITEL = 'Datenstand des Sync-Dienstes';

export function main(argv = process.argv.slice(2), deps = {}) {
  const env = deps.env || process.env;
  const aus = deps.aus || console.log;
  const jetzt = deps.jetzt || new Date();
  const melde = deps.melde || mitteilung;
  const unbekannt = argv.filter(a => a !== '--trocken');
  if (unbekannt.length) { (deps.fehler || console.error)(`Unbekanntes Argument: ${unbekannt.join(' ')}`); return 2; }
  const privat = privatDir(env);
  let aktualisierung = null;
  try { aktualisierung = JSON.parse(fs.readFileSync(path.join(privat, 'aktualisierung.json'), 'utf8')); } catch { aktualisierung = null; }
  const g = pruefeGesundheit(aktualisierung, jetzt);
  aus(`${jetzt.toISOString()} Datenstand: ${g.ok ? 'ok' : `FEHLER (${g.art})`} – ${g.meldung}`);
  if (!argv.includes('--trocken')) {
    const { mitteilen } = schreibStatus(privat, 'daten-gesundheit', { ok: g.ok, art: g.art, meldung: g.meldung }, jetzt);
    if (mitteilen) melde(TITEL, g.meldung);
  }
  return g.ok ? 0 : 1;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  process.exitCode = main();
}
