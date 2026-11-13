#!/usr/bin/env node
/**
 * Dieselzuschlag der Spedition (GEL) nachtragen - woechentlich, ohne KI (launchd-Dienst
 * net.teppich-paradies.gel-diesel, dienstags und montags vormittags):
 *
 *   npm run -s gel-diesel:nachtragen
 *
 * Laedt https://www.gel-express.de/de/kraftstoff-zuschlag/, liest den Wert der laufenden ISO-Woche
 * (Berliner Datum) und schreibt "GEL Diesel", "GEL gültig von" und "GEL gültig bis" gemeinsam in
 * $TP_PRIVAT_DIR/versandkosten/tarife.json (operations/lib/gel-diesel.mjs). Ohne Aenderung wird
 * nichts geschrieben. Eine Zeile Ausgabe; ein Fehler steht im Dienstprotokoll, und der Status
 * unter $TP_PRIVAT_DIR/routinen/gel-diesel/ macht ein rotes To-do im Control Center (wie bei den
 * anderen Mac-Diensten, operations/lib/routinen.mjs), die Mac-Mitteilung nur beim ersten Fehler.
 * Nur lesender Abruf der oeffentlichen Seite; nichts im Shop, bei GLS oder GEL wird gebucht.
 */
import fs from 'node:fs';
import { setTimeout as warten } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { privatDir, berlinZeit, schreibStatus } from '../lib/routinen.mjs';
import { versandtarifePfad } from '../lib/versandtarife.mjs';
import { mitteilung } from '../lib/mac-mitteilung.mjs';
import { GEL_SEITE, gelDieselNachtragen, gelDieselMeldung } from '../lib/gel-diesel.mjs';
import { fetchWithServerErrorRetry, isTransientHttpStatus } from '../../workflow/retry.mjs';

export const TITEL = 'GEL-Dieselzuschlag';
const PAUSE_MS = 30_000;

/** Seite laden; bei Netzfehler oder 5xx genau ein weiterer Versuch (MAX_IMMEDIATE_SCRIPT_RETRIES). */
export async function ladeSeite({ fetchImpl = fetch, pauseMs = PAUSE_MS } = {}) {
  for (let versuch = 1; ; versuch += 1) {
    let fehler;
    try {
      const { response } = await fetchWithServerErrorRetry(GEL_SEITE, { waitsMs: [], fetchImpl });
      if (response.ok) return await response.text();
      fehler = new Error(`GEL-Seite antwortet mit HTTP ${response.status}.`);
      if (!isTransientHttpStatus(response.status)) throw fehler;
    } catch (e) {
      if (e === fehler) throw e;
      fehler = new Error(`GEL-Seite nicht erreichbar: ${e.message}`);
    }
    if (versuch >= 2) throw fehler;
    await warten(pauseMs);
  }
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const env = deps.env || process.env;
  const aus = deps.aus || console.log;
  const fehlerAus = deps.fehler || console.error;
  const jetzt = deps.jetzt || new Date();
  if (argv.length) { fehlerAus(`Unbekanntes Argument: ${argv.join(' ')}`); return 2; }
  const privat = privatDir(env);
  try {
    const seite = await (deps.ladeSeite || ladeSeite)();
    const text = gelDieselMeldung(gelDieselNachtragen(versandtarifePfad(privat), seite, berlinZeit(jetzt).datum));
    aus(`${jetzt.toISOString()} ${text}`);
    schreibStatus(privat, 'gel-diesel', { ok: true, art: null, meldung: text }, jetzt);
    return 0;
  } catch (e) {
    fehlerAus(`${jetzt.toISOString()} GEL-Diesel FEHLER: ${e.message}`);
    const { mitteilen } = schreibStatus(privat, 'gel-diesel', { ok: false, art: 'nachtragen', meldung: e.message }, jetzt);
    if (mitteilen) (deps.melde || mitteilung)(TITEL, e.message);
    return 1;
  }
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  process.exitCode = await main();
}
