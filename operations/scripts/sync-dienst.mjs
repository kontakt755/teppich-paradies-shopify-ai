#!/usr/bin/env node
/**
 * Dauerlauf fuer die Aktualisierung: fuehrt operations/scripts/aktualisieren.mjs
 * in einer Schleife aus, statt nur zweimal taeglich - sonst taucht eine um
 * 15 Uhr eingegangene Bestellung erst am naechsten Morgen im Control Center auf.
 *
 *   node operations/scripts/sync-dienst.mjs
 *   TP_SYNC_INTERVALL_MINUTEN=5 node operations/scripts/sync-dienst.mjs
 *
 * Intervall: TP_SYNC_INTERVALL_MINUTEN (Minuten, Standard 10). Ein Lauf
 * startet sofort, dann nach jedem Intervall wieder - unabhaengig davon, wie
 * lange der vorherige Lauf brauchte (kein Ueberlappen: die Wartezeit beginnt
 * erst, wenn aktualisieren() fertig ist).
 *
 * Fehler in einem Lauf (Ratenlimit, Netzwerk, einzelner Teil kaputt) werden
 * protokolliert; der Dienst laeuft weiter und versucht es beim naechsten
 * Intervall erneut - genau wie aktualisieren.mjs selbst, das bei einem
 * fehlschlagenden Teil die vorhandene Datei stehen laesst.
 *
 * Das Lexikon (teure Massenabfrage) laeuft nur alle TP_SYNC_LEXIKON_MINUTEN
 * (Standard 60) mit, der Lagerbestand nur alle TP_SYNC_BESTAND_MINUTEN
 * (Standard 60), alle anderen Teile in jedem Intervall.
 *
 * Jede Protokollzeile beginnt mit der Uhrzeit (ISO, UTC) - ohne sie war im
 * Protokoll nicht zu sehen, wann ein Lauf scheiterte.
 *
 * Ohne Token (SHOPIFY_ADMIN_TOKEN oder SHOPIFY_CLIENT_ID/SECRET in
 * .env.local) startet der Dienst NICHT still folgenlos: er meldet das
 * Fehlen klar auf stderr und beendet sich mit Exit-Code 1 - siehe
 * operations/sync/zugang.mjs und domains/shopify/admin-token-oauth.md.
 *
 * Sauberes Beenden: SIGTERM/SIGINT brechen die Wartezeit ab (nicht einen
 * laufenden Aktualisierungslauf) und beenden den Prozess danach regulaer -
 * fuer launchd (siehe operations/launchagents/) und fuer `kill`/Strg-C von Hand.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ladeEnvLocal, hatZugangsdaten, KEIN_ZUGANG } from '../sync/zugang.mjs';
import { aktualisiere } from './aktualisieren.mjs';
import { mitZeitstempel } from '../lib/zeitstempel.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const STANDARD_INTERVALL_MINUTEN = 10;

/** @returns {number} Minuten, wirft bei ungueltigem Wert statt still auf den Standard zu fallen. */
export function leseIntervallMinuten(env = process.env) {
  const roh = env.TP_SYNC_INTERVALL_MINUTEN;
  if (roh === undefined || roh === '') return STANDARD_INTERVALL_MINUTEN;
  const n = Number(roh);
  if (!(n > 0)) throw new Error(`TP_SYNC_INTERVALL_MINUTEN ungueltig: "${roh}" (muss eine Zahl > 0 sein)`);
  return n;
}

/** Gleiche Zugangspruefung wie sync/zugang.mjs erzeugeProxy: shpat_-Token oder Client-Credentials. */
export function hatZugang(env = { ...ladeEnvLocal(path.join(REPO, '.env.local')), ...process.env }) {
  return hatZugangsdaten(env);
}

/**
 * Das Lexikon ist der teure Teil (Massenabfrage ueber alle Produkte) und
 * aendert sich selten - es laeuft deshalb nicht in jedem Intervall mit,
 * sondern hoechstens alle TP_SYNC_LEXIKON_MINUTEN (Standard 60).
 *
 * Der Lagerbestand ebenso (TP_SYNC_BESTAND_MINUTEN, Standard 60): er blaettert
 * durch die Bestandsliste jedes Artikels am Standort (rund 3.300), um am Ende
 * die knapp 150 gefuehrten zu behalten, und kostete so rund 90 von 100
 * Sekunden je Zehn-Minuten-Lauf. Das Abbuchen von Sonderposten ("Im Laden
 * verkauft") liest und schreibt den Bestand live in Shopify und haengt nicht
 * an dieser Datei.
 *
 * Bestellungen, Kennzahlen, Kunden, Angebote und Warenkoerbe bleiben im kurzen Takt.
 */
export const STANDARD_LEXIKON_MINUTEN = 60;
export const STANDARD_BESTAND_MINUTEN = 60;
const SCHNELLE_TEILE = ['bestellungen', 'kennzahlen', 'kunden', 'angebote', 'warenkoerbe'];

function leseMinuten(env, name, standard) {
  const roh = env[name];
  if (roh === undefined || roh === '') return standard;
  const n = Number(roh);
  if (!(n > 0)) throw new Error(`${name} ungueltig: "${roh}" (muss eine Zahl > 0 sein)`);
  return n;
}

export function leseLexikonMinuten(env = process.env) {
  return leseMinuten(env, 'TP_SYNC_LEXIKON_MINUTEN', STANDARD_LEXIKON_MINUTEN);
}

export function leseBestandMinuten(env = process.env) {
  return leseMinuten(env, 'TP_SYNC_BESTAND_MINUTEN', STANDARD_BESTAND_MINUTEN);
}

/**
 * Baut die Lauf-Funktion des Dienstes. Lexikon und Bestand laufen im ersten
 * Lauf und danach erst wieder, wenn ihr letzter ERFOLGREICHER Lauf
 * lexikonMinuten bzw. bestandMinuten zurueckliegt - nach einem Fehlschlag also
 * gleich im naechsten Intervall.
 */
export function erzeugeLauf({ lexikonMinuten = leseLexikonMinuten(), bestandMinuten = leseBestandMinuten(), aktualisiereFn = aktualisiere, jetzt = Date.now } = {}) {
  const takt = { lexikon: lexikonMinuten, bestand: bestandMinuten };
  const erfolgAm = { lexikon: null, bestand: null };
  return async () => {
    const faellig = Object.keys(takt).filter((teil) => erfolgAm[teil] === null || jetzt() - erfolgAm[teil] >= takt[teil] * 60000);
    // Reihenfolge wie bisher: Lexikon zuerst, Bestand zuletzt.
    const nur = [...(faellig.includes('lexikon') ? ['lexikon'] : []), ...SCHNELLE_TEILE, ...(faellig.includes('bestand') ? ['bestand'] : [])];
    const r = await aktualisiereFn({ nur });
    for (const teil of faellig) {
      if ((r?.ergebnisse ?? []).some((e) => e.teil === teil && e.erfolg)) erfolgAm[teil] = jetzt();
    }
    return r;
  };
}

// Protokoll mit Uhrzeit vor jeder Zeile: liegt seit 2026-10-26 in operations/lib/zeitstempel.mjs
// (auch Shop-Wache und Aufgabenwaechter); hier weiter exportiert fuer bestehende Aufrufer.
export { mitZeitstempel };

function warteStandard(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    if (signal.aborted) { clearTimeout(timer); resolve(); return; }
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

/**
 * Fuehrt `lauf()` in einer Schleife aus, getrennt durch `intervallMinuten`.
 * Bricht ab, sobald `signal` aborted ist (auch waehrend der Wartezeit) oder
 * `maxLaeufe` erreicht ist (fuer Tests; im Dienstbetrieb Infinity).
 *
 * @returns {Promise<number>} Anzahl ausgefuehrter Laeufe.
 */
export async function starteDienst({
  intervallMinuten = leseIntervallMinuten(),
  lauf = erzeugeLauf(),
  protokoll = mitZeitstempel(console),
  warten = warteStandard,
  signal = new AbortController().signal,
  maxLaeufe = Infinity,
} = {}) {
  let laeufe = 0;
  while (!signal.aborted && laeufe < maxLaeufe) {
    laeufe += 1;
    const start = Date.now();
    try {
      const { ergebnisse } = await lauf();
      const fehlgeschlagen = (ergebnisse ?? []).filter((r) => !r.erfolg);
      const dauerMs = Date.now() - start;
      if (fehlgeschlagen.length) {
        protokoll.warn?.(`[sync-dienst] Lauf ${laeufe}: ${fehlgeschlagen.length} Teil(e) fehlgeschlagen (${dauerMs}ms) - ${fehlgeschlagen.map((f) => `${f.teil}: ${f.meldung}`).join('; ')}`);
      } else {
        protokoll.log?.(`[sync-dienst] Lauf ${laeufe}: OK (${dauerMs}ms)`);
      }
    } catch (err) {
      // Ein Fehler im Lauf selbst (z. B. unerwarteter Absturz) beendet den
      // Dienst nicht - protokollieren und beim naechsten Intervall erneut.
      protokoll.error?.(`[sync-dienst] Lauf ${laeufe}: Fehler - ${err.message}`);
    }
    if (signal.aborted || laeufe >= maxLaeufe) break;
    // eslint-disable-next-line no-await-in-loop -- die Schleife ist absichtlich sequenziell (ein Intervall-Dienst, kein Batch).
    await warten(intervallMinuten * 60000, signal);
  }
  protokoll.log?.(`[sync-dienst] beendet nach ${laeufe} Lauf/Laeufen`);
  return laeufe;
}

async function main() {
  const protokoll = mitZeitstempel(console);
  if (!hatZugang()) {
    protokoll.error(`[sync-dienst] ${KEIN_ZUGANG}`);
    protokoll.error(`[sync-dienst] Gesucht in: ${path.join(REPO, '.env.local')}. Ohne Zugang beendet sich der Dienst - er laeuft nie still ohne Wirkung.`);
    process.exitCode = 1;
    return;
  }
  let intervallMinuten;
  let lexikonMinuten;
  let bestandMinuten;
  try {
    intervallMinuten = leseIntervallMinuten();
    lexikonMinuten = leseLexikonMinuten();
    bestandMinuten = leseBestandMinuten();
  } catch (err) {
    protokoll.error(`[sync-dienst] ${err.message}`);
    process.exitCode = 1;
    return;
  }
  protokoll.log(`[sync-dienst] Start - Intervall ${intervallMinuten} Minute(n), Lexikon alle ${lexikonMinuten}, Lagerbestand alle ${bestandMinuten} Minute(n), Ziel $TP_PRIVAT_DIR`);
  const controller = new AbortController();
  const beenden = (signal) => {
    protokoll.log(`[sync-dienst] ${signal} empfangen - beende nach dem aktuellen Lauf`);
    controller.abort();
  };
  process.once('SIGTERM', () => beenden('SIGTERM'));
  process.once('SIGINT', () => beenden('SIGINT'));
  await starteDienst({ intervallMinuten, lauf: erzeugeLauf({ lexikonMinuten, bestandMinuten }), protokoll, signal: controller.signal });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { mitZeitstempel(console).error(`[sync-dienst] Fehler: ${err.message}`); process.exit(1); });
}
