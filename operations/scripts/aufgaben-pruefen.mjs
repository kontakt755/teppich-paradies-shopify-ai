#!/usr/bin/env node
/**
 * Aufgabenwaechter ausfuehren:
 *
 *   npm run aufgaben:pruefen            # alle pruefbaren Aufgaben messen
 *   npm run aufgaben:pruefen -- --id <id>
 *
 * Misst den tatsaechlichen Zustand und haelt das Ergebnis am Eintrag fest.
 * Erledigt wird nur, was nachweislich erfuellt ist (siehe
 * organisation-speicher.mjs::haltePruefungFest) - nie, weil jemand etwas
 * geaendert hat.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lies, schreib, dateiPfad, haltePruefungFest, privatDir } from '../lib/organisation-speicher.mjs';
import { pruefeAufgabe, pruefbar } from '../lib/aufgaben-waechter.mjs';

export function argumente(argv) {
  const a = { id: null, basis: 'https://www.teppich-paradies.net', hilfe: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--id') a.id = argv[++i];
    else if (k === '--basis') a.basis = argv[++i];
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  return a;
}

async function holen(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'teppich-paradies-aufgabenwaechter' } });
  } finally { clearTimeout(t); }
}

/** Ein Lauf ueber alle (oder eine) Aufgabe. Gibt die Zusammenfassung zurueck. */
export async function laufe({ datei = dateiPfad(privatDir()), id = null, basis, holenFn = holen, jetzt = new Date() } = {}) {
  const daten = lies(datei);
  const kandidaten = pruefbar(daten.eintraege).filter(e => !id || e.id === id);
  const ergebnisse = [];
  for (const aufgabe of kandidaten) {
    const vorher = aufgabe.status;
    const ergebnis = await pruefeAufgabe(aufgabe, { holen: holenFn, basis });
    haltePruefungFest(aufgabe, ergebnis, { jetzt, pruefer: 'Aufgabenwächter' });
    ergebnisse.push({ id: aufgabe.id, titel: aufgabe.titel, vorher, nachher: aufgabe.status, ...ergebnis });
  }
  if (ergebnisse.length) schreib(daten, datei);
  return {
    geprueftAm: jetzt.toISOString(),
    geprueft: ergebnisse.length,
    erfuellt: ergebnisse.filter(r => r.erfuellt === true).length,
    offen: ergebnisse.filter(r => r.erfuellt === false).length,
    unklar: ergebnisse.filter(r => r.erfuellt === null).length,
    ergebnisse,
  };
}

async function main() {
  const a = argumente(process.argv.slice(2));
  if (a.hilfe) { console.log('npm run aufgaben:pruefen -- [--id <id>] [--basis <url>]'); return; }
  const r = await laufe({ id: a.id, basis: a.basis });
  console.log(`Aufgabenwächter: ${r.geprueft} geprüft · ${r.erfuellt} erfüllt · ${r.offen} offen · ${r.unklar} unklar`);
  for (const e of r.ergebnisse) {
    console.log(`  [${e.erfuellt === true ? 'erfüllt' : e.erfuellt === false ? 'offen' : 'unklar'}] ${e.titel} (${e.vorher} → ${e.nachher}) · ${e.begruendung}`);
  }
  if (!r.geprueft) console.log('  (keine Aufgabe mit maschinell prüfbarer Vorgabe)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(`Fehler: ${err.message}`); process.exit(1); });
}
