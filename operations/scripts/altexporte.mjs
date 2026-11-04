#!/usr/bin/env node
/**
 * Alte Arbeitsordner mit Bestellexporten aufraeumen (w-169). Ohne Flag nur Trockenlauf.
 *
 *   npm run -s altexporte                      # zeigt die Liste, aendert nichts
 *   npm run -s altexporte -- --verschieben     # Stufe 1: faellige Ordner in den Papierkorb
 *   npm run -s altexporte -- --zurueck <Name>  # Rueckweg aus dem Papierkorb
 *   npm run -s altexporte -- --endgueltig      # Stufe 2: Papierkorb nach Ablauf leeren
 *
 * Liste: operations/altexporte-ordner.json. Kein Dienst startet diesen Lauf; wer ihn einplant,
 * braucht die Freigabe des Inhabers (operations/README.md, Abschnitt "Alte Bestellexporte").
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRIST_TAGE, PAPIERKORB_TAGE, inPapierkorb, papierkorbLeeren, papierkorbStand, pruefeListe, zurueckholen } from '../lib/altexporte.mjs';
import { SICHERUNGSPFADE, STANDARD_PRIVAT_DIR } from './sicherung.mjs';

const LISTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'altexporte-ordner.json');
const tag = iso => (iso ? iso.slice(0, 10) : '–');
const mb = b => `${Math.round((b || 0) / 1e6)} MB`;

export function zeile(b) {
  if (b.stand === 'gesperrt') return `gesperrt  ${b.name}: ${b.grund}`;
  if (b.stand === 'fehlt') return `fehlt     ${b.name}`;
  return `${b.stand === 'faellig' ? 'faellig ' : 'zu jung '}  ${b.name}  (zuletzt ${tag(b.juengste)}, ${b.dateien} Dateien, ${mb(b.bytes)}, faellig ab ${tag(b.faelligAb)})`;
}

function cli(argv) {
  const privatDir = process.env.TP_PRIVAT_DIR || STANDARD_PRIVAT_DIR;
  const i = argv.indexOf('--zurueck');
  const name = i >= 0 ? argv[i + 1] : null;
  const unbekannt = argv.filter((a, n) => !['--verschieben', '--endgueltig', '--zurueck'].includes(a) && !(i >= 0 && n === i + 1));
  const aktionen = ['--verschieben', '--endgueltig', '--zurueck'].filter(a => argv.includes(a));
  if (unbekannt.length || aktionen.length > 1 || (i >= 0 && !name)) {
    console.error('Aufruf: altexporte [--verschieben | --endgueltig | --zurueck <Name>]');
    return 2;
  }
  if (name) { zurueckholen({ privatDir, name }); console.log(`Zurueck an alter Stelle: ${name}`); return 0; }
  if (argv.includes('--endgueltig')) {
    const weg = papierkorbLeeren({ privatDir });
    console.log(weg.length ? `Endgueltig entfernt: ${weg.join(', ')}` : 'Im Papierkorb ist nichts abgelaufen.');
    return 0;
  }
  const { ordner } = JSON.parse(fs.readFileSync(LISTE, 'utf8'));
  const befund = pruefeListe({ privatDir, liste: ordner, geschuetzt: SICHERUNGSPFADE });
  befund.forEach(b => console.log(zeile(b)));
  const faellig = befund.filter(b => b.stand === 'faellig');
  console.log(`\n${faellig.length} von ${befund.length} Ordnern faellig (Frist ${FRIST_TAGE} Tage seit der letzten Aenderung), zusammen ${mb(faellig.reduce((s, b) => s + b.bytes, 0))}.`);
  if (argv.includes('--verschieben')) {
    const r = inPapierkorb({ privatDir, befund });
    console.log(`In den Papierkorb: ${r.length}. Rueckweg ${PAPIERKORB_TAGE} Tage: --zurueck <Name>.`);
    return 0;
  }
  const korb = papierkorbStand({ privatDir });
  if (korb.length) console.log(`Im Papierkorb: ${korb.map(k => `${k.name}${k.abgelaufen ? ' (abgelaufen)' : ''}`).join(', ')}`);
  console.log('Trockenlauf: nichts geaendert.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = cli(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
