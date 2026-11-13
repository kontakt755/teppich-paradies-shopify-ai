#!/usr/bin/env node
/**
 * Kontoauszug je Empfaenger auflisten (Inhaber 03.11.2026): Lastschrift oder Ueberweisung, Summe,
 * grobe Zuordnung zu den archivierten Belegen.
 *
 *   npm run -s belege:bank -- <datei.csv|datei.xml|kontoauszug.pdf>
 *
 * PDF heisst hier der monatliche Kontoauszug (mit altem und neuem Kontostand), nicht die
 * Umsatzuebersicht: deren Verwendungszweck ist gekuerzt.
 *
 * Liest die Datei und die Manifeste aus belege-archiv; schreibt nur nach
 * $TP_PRIVAT_DIR/belege-archiv/bank/. Die Ausgabe nennt nur Zahlen, Namen und IBAN stehen nur in
 * den privaten Dateien. Kein Bankzugang, keine PIN: nur der vom Menschen geladene Export.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auszugLesen, kontoauszugPdfLesen, zuordnen, jeEmpfaenger, listeCsv } from '../lib/belege-bank.mjs';
import { belegeOrdner, monatDavor, istPdf } from '../lib/belege.mjs';
import { pdfAnalyse } from './belege-monat.mjs';

/** Belege der Buchungsmonate und des Monats davor: Rechnungen werden oft spaeter bezahlt. */
export function belegeZuMonaten(monate, privat) {
  const alle = new Set();
  for (const m of monate) { alle.add(m); alle.add(monatDavor(m)); }
  const belege = [];
  const gelesen = [];
  for (const m of [...alle].sort()) {
    const [j, mm] = m.split('-');
    try {
      const inhalt = JSON.parse(fs.readFileSync(path.join(belegeOrdner(privat), j, mm, 'manifest.json'), 'utf8'));
      belege.push(...(inhalt.belege || []).filter(b => !b.nichtMehrGefunden));
      gelesen.push(m);
    } catch { /* Monat noch nicht archiviert: zaehlt nur nicht mit */ }
  }
  return { belege, gelesen };
}

/** @returns zahlen fuer die Ausgabe (keine Namen, keine IBAN) */
export function bankLauf({ datei, privat, jetzt = new Date(), pdf = pdfAnalyse }) {
  const inhalt = fs.readFileSync(datei);
  const auszug = istPdf(inhalt) ? kontoauszugPdfLesen(pdf(inhalt).text) : auszugLesen(inhalt);
  const monate = [...new Set(auszug.buchungen.map(b => b.datum.slice(0, 7)))].sort();
  const { belege, gelesen } = belegeZuMonaten(monate, privat);
  const { buchungen, ohneBuchung } = zuordnen(auszug.buchungen, belege);
  const empfaenger = jeEmpfaenger(buchungen);
  const ausgaben = buchungen.filter(b => b.betrag < 0);
  const arten = {};
  for (const b of ausgaben) arten[b.art] = (arten[b.art] || 0) + 1;
  const guete = {};
  for (const b of ausgaben) if (b.beleg) guete[b.beleg.guete] = (guete[b.beleg.guete] || 0) + 1;
  const zeitraum = monate.length ? `${monate[0]}_${monate[monate.length - 1]}` : 'leer';
  const ordner = path.join(belegeOrdner(privat), 'bank');
  fs.mkdirSync(ordner, { recursive: true, mode: 0o700 });
  const json = path.join(ordner, `liste-${zeitraum}.json`);
  const csv = path.join(ordner, `liste-${zeitraum}.csv`);
  fs.writeFileSync(json, `${JSON.stringify({ erzeugt: jetzt.toISOString(), format: auszug.format, monate, belegeAus: gelesen, nichtLesbar: auszug.nichtLesbar, empfaenger, belegeOhneBuchung: ohneBuchung.map(b => ({ datei: b.datei, anbieter: b.anbieter, tag: b.tag, brutto: b.brutto })) }, null, 1)}\n`, { mode: 0o600 });
  fs.writeFileSync(csv, listeCsv(empfaenger), { mode: 0o600 });
  return {
    format: auszug.format, monate, buchungen: buchungen.length, ausgaben: ausgaben.length, nichtLesbar: auszug.nichtLesbar,
    empfaenger: empfaenger.length, arten, zugeordnet: guete, belegeAus: gelesen, belegeOhneBuchung: ohneBuchung.length, ordner,
  };
}

function main(args) {
  const datei = args.find(a => !a.startsWith('--'));
  if (!datei) throw new Error('Aufruf: belege:bank -- <datei.csv|datei.xml|kontoauszug.pdf>');
  const e = bankLauf({ datei, privat: process.env.TP_PRIVAT_DIR || undefined });
  console.log(JSON.stringify(e, null, 1));
  if (e.nichtLesbar) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(String(e?.message || e));
    process.exitCode = 1;
  }
}
