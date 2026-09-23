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
import { ladeEnvLocal } from '../sync/zugang.mjs';
import { aktualisiere } from './aktualisieren.mjs';

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
  return Boolean(env.SHOPIFY_ADMIN_TOKEN) || Boolean(env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET);
}

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
  lauf = () => aktualisiere(),
  protokoll = console,
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
  if (!hatZugang()) {
    console.error('[sync-dienst] Kein Zugang: weder SHOPIFY_ADMIN_TOKEN noch SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET in .env.local oder der Umgebung.');
    console.error('[sync-dienst] Einrichtung: npm run operations:einrichten (siehe domains/shopify/admin-token-oauth.md). Ohne Zugang beendet sich der Dienst - er laeuft nie still ohne Wirkung.');
    process.exitCode = 1;
    return;
  }
  let intervallMinuten;
  try {
    intervallMinuten = leseIntervallMinuten();
  } catch (err) {
    console.error(`[sync-dienst] ${err.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[sync-dienst] Start - Intervall ${intervallMinuten} Minute(n), Ziel $TP_PRIVAT_DIR`);
  const controller = new AbortController();
  const beenden = (signal) => {
    console.log(`[sync-dienst] ${signal} empfangen - beende nach dem aktuellen Lauf`);
    controller.abort();
  };
  process.once('SIGTERM', () => beenden('SIGTERM'));
  process.once('SIGINT', () => beenden('SIGINT'));
  await starteDienst({ intervallMinuten, signal: controller.signal });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`[sync-dienst] Fehler: ${err.message}`); process.exit(1); });
}
