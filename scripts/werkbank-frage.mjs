#!/usr/bin/env node
/**
 * Fragen von Claude-Laeufen an den Benutzer (Fragebogen im Control Center, "Entscheidungen").
 *
 *   npm run -s werkbank:frage -- neu --datei frage.json   legt eine Frage an, gibt die id aus
 *   npm run -s werkbank:frage -- offen                    unbeantwortete Fragen (JSON)
 *   npm run -s werkbank:frage -- beantwortet              beantwortet, noch nicht uebernommen (JSON)
 *   npm run -s werkbank:frage -- uebernommen <id>         Antwort ist verarbeitet
 *
 * Speicher: $TP_PRIVAT_DIR/werkbank-fragen.json (operations/lib/werkbank-fragen.mjs).
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fragenPfad, leseFragen, frageAnlegen, frageUebernommen, offeneFragen, beantworteteFragen, WerkbankFrageFehler } from '../operations/lib/werkbank-fragen.mjs';

const HILFE = 'Aufruf: werkbank:frage -- neu --datei <json> | offen | beantwortet | uebernommen <id>';

export function main(argv = process.argv.slice(2), { datei = fragenPfad(), aus = console.log } = {}) {
  const [befehl, ...rest] = argv;
  if (befehl === 'neu') {
    const i = rest.indexOf('--datei');
    if (i < 0 || !rest[i + 1]) throw new WerkbankFrageFehler(`--datei fehlt. ${HILFE}`);
    let eingabe;
    try { eingabe = JSON.parse(fs.readFileSync(rest[i + 1], 'utf8')); } catch (e) {
      throw new WerkbankFrageFehler(`${rest[i + 1]} nicht lesbar: ${e.message}`);
    }
    const { frage, doppelt } = frageAnlegen(datei, eingabe);
    aus(doppelt ? `${frage.id} (gab es schon, unbeantwortet)` : frage.id);
  } else if (befehl === 'offen') {
    aus(JSON.stringify(offeneFragen(leseFragen(datei)), null, 2));
  } else if (befehl === 'beantwortet') {
    aus(JSON.stringify(beantworteteFragen(leseFragen(datei)), null, 2));
  } else if (befehl === 'uebernommen') {
    if (!rest[0]) throw new WerkbankFrageFehler(`id fehlt. ${HILFE}`);
    aus(`${frageUebernommen(datei, rest[0]).id} uebernommen`);
  } else {
    throw new WerkbankFrageFehler(HILFE);
  }
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) {
    console.error(e instanceof WerkbankFrageFehler ? e.message : e);
    process.exit(1);
  }
}
