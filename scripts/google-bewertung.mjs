#!/usr/bin/env node
/**
 * Google-Bewertung im Shop: Note und Anzahl einmal im Monat nachziehen.
 *
 *   npm run -s google-bewertung                          # lesen und vergleichen, nichts schreiben
 *   npm run -s google-bewertung -- --schreiben           # Metafeld setzen, Gegenprobe, Stand ablegen
 *   npm run -s google-bewertung -- --schreiben --monatlich   # Dienst: nur, wenn in diesem Monat noch kein Erfolg
 *   npm run -s google-bewertung -- --schreiben --trotzdem    # auffaellige Werte nach eigener Pruefung uebernehmen
 *   npm run -s google-bewertung -- --zugang cli|token    # Shopify-CLI oder Token aus .env.local
 *
 * ─── Warum ─────────────────────────────────────
 * Die Theme-Einstellung "TP Google-Bewertung" wurde von Hand abgeschrieben und
 * zeigte am 03.11.2026 noch den Stand vom 12.09. ("ueber 240" bei 246 Rezensionen).
 * Jede Aenderung dort waere ein Theme-Deploy. Das Shop-Metafeld custom.google_bewertung
 * aendert die Anzeige ohne Deploy; das Theme liest es zuerst und faellt ohne Metafeld
 * auf die Theme-Einstellung zurueck (qa/bewertung-guard.mjs haelt das zusammen).
 *
 * ─── Quelle ────────────────────────────────────
 * Die Datenquelle des Bewertungs-Widgets auf unserer Startseite (Elfsight), genau die
 * Abfrage, die das Widget selbst stellt. Sie ist nicht dokumentiert und verlangt die
 * Abfrageform samt Origin, sonst antwortet sie mit 400. Am 03.11.2026 stimmte sie mit
 * Google Maps ueberein (4,9 und 246). Bricht sie weg, bleibt der letzte Wert im Shop
 * stehen und das Control Center meldet es; geschaetzt wird nie.
 *
 * ─── Grenzen ───────────────────────────────────
 * Auffaellige Spruenge (GRENZEN) werden nicht uebernommen, sondern gemeldet: Eine kaputte
 * Antwort darf den Shop nicht falsch beschriften, und ein echter Einbruch soll ein Mensch
 * sehen. Geschrieben wird genau dieses eine Metafeld. Der Stand liegt unter
 * $TP_PRIVAT_DIR/google-bewertung/status.json und erscheint bei Stoerung als To-do
 * im Control Center (docs/ai-dashboard/lib/todos.mjs, ausGoogleBewertung).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fehlerAus, zugang } from './preisfilter-abgleich.mjs';

export const PLATZ_ID = 'ChIJkTM63bIAqUcRtIIBoboi7Ao';
export const QUELLE = `https://service-reviews-ultimate.elfsight.com/data/sources?uris%5B%5D=${PLATZ_ID}&summary=true&translate=de`;
export const HERKUNFT = 'https://www.teppich-paradies.net';
export const NAMESPACE = 'custom';
export const KEY = 'google_bewertung';
export const TYP = 'json';
/** Groesster Sprung, der ohne Blick eines Menschen in den Shop darf. */
export const GRENZEN = Object.freeze({ wert: 0.2, anzahlRunter: 10, anzahlHoch: 60 });

export const ABFRAGE = `{ shop { id metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value } } }`;

const gql = (s) => JSON.stringify(String(s));

export function setzenMutation(shopId, wert) {
  return `mutation{ metafieldsSet(metafields:[{ ownerId:${gql(shopId)}, namespace:${gql(NAMESPACE)}, key:${gql(KEY)}, type:${gql(TYP)}, value:${gql(wert)} }]) { metafields { value } userErrors { field message } } }`;
}

/** Liest und prueft die Antwort der Quelle; wirft, statt einen zweifelhaften Wert durchzulassen. */
export function leseQuelle(antwort) {
  if (antwort?.status !== 'success') throw new Error(`Quelle meldet Status ${antwort?.status ?? 'keiner'}`);
  const liste = antwort.result?.data;
  if (!Array.isArray(liste) || liste.length !== 1) throw new Error('Quelle liefert nicht genau ein Profil');
  const q = liste[0];
  if (q?.uri !== PLATZ_ID || q?.supplier !== 'google') throw new Error('Quelle liefert ein anderes Profil');
  if (!/teppich paradies/i.test(q.meta?.name || '')) throw new Error(`Quelle nennt einen anderen Namen: ${q.meta?.name ?? 'keinen'}`);
  const wert = q.rating === null || q.rating === '' ? NaN : Number(q.rating);
  const anzahl = q.reviews_number === null || q.reviews_number === '' ? NaN : Number(q.reviews_number);
  if (!Number.isFinite(wert) || wert < 1 || wert > 5) throw new Error(`Note unbrauchbar: ${q.rating}`);
  if (!Number.isInteger(anzahl) || anzahl < 1) throw new Error(`Anzahl unbrauchbar: ${q.reviews_number}`);
  return { wert, anzahl };
}

export const wertText = (wert) => wert.toFixed(1).replace('.', ',');

/** Tag in deutscher Zeit, damit ein Lauf kurz nach Mitternacht am Monatsersten zum neuen Monat zaehlt. */
export function heuteBerlin(jetzt = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt);
}

export function metafeldWert({ wert, anzahl }, stand) {
  return JSON.stringify({ wert: wertText(wert), anzahl, stand });
}

/** Wert aus dem Metafeld; alles Unlesbare zaehlt als "kein Vergleichswert", nie als Fehler im Shop. */
export function leseMetafeld(value) {
  if (!value) return null;
  try {
    const d = JSON.parse(value);
    const wert = Number(String(d?.wert ?? '').replace(',', '.'));
    if (!wert || !Number.isInteger(d?.anzahl)) return null;
    return { wert, anzahl: d.anzahl, stand: d.stand ?? null };
  } catch {
    return null;
  }
}

/** Gruende, die neuen Werte nicht ohne Blick eines Menschen zu uebernehmen. */
export function auffaellig(neu, alt) {
  if (!alt) return [];
  const gruende = [];
  // In Zehnteln vergleichen: 4.9 - 4.7 ist als Kommazahl 0.2000000000000002.
  if (Math.round(Math.abs(neu.wert - alt.wert) * 10) > Math.round(GRENZEN.wert * 10)) {
    gruende.push(`Note springt von ${wertText(alt.wert)} auf ${wertText(neu.wert)}`);
  }
  if (neu.anzahl < alt.anzahl - GRENZEN.anzahlRunter) gruende.push(`Anzahl faellt von ${alt.anzahl} auf ${neu.anzahl}`);
  if (neu.anzahl > alt.anzahl + GRENZEN.anzahlHoch) gruende.push(`Anzahl springt von ${alt.anzahl} auf ${neu.anzahl}`);
  return gruende;
}

/** Erfolg in diesem Kalendermonat? Der Dienst startet am 1., 2. und 3., damit ein Ausfall nachgeholt wird. */
export function schonDiesenMonat(stand, jetzt = new Date()) {
  if (!stand?.letzterErfolg) return false;
  const erfolg = new Date(stand.letzterErfolg);
  if (Number.isNaN(erfolg.getTime())) return false;
  return heuteBerlin(erfolg).slice(0, 7) === heuteBerlin(jetzt).slice(0, 7);
}

export function argumente(argv) {
  const a = { schreiben: false, monatlich: false, trotzdem: false, zugang: null, datei: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--schreiben') a.schreiben = true;
    else if (k === '--monatlich') a.monatlich = true;
    else if (k === '--trotzdem') a.trotzdem = true;
    else if (k === '--zugang') a.zugang = argv[++i];
    else if (k === '--stand-datei') a.datei = argv[++i];
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  if (a.monatlich && !a.schreiben) throw new Error('--monatlich gilt nur mit --schreiben');
  if (a.trotzdem && !a.schreiben) throw new Error('--trotzdem gilt nur mit --schreiben');
  return a;
}

function liesStand(datei) {
  try {
    return JSON.parse(fs.readFileSync(datei, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    // Kaputter Stand: lieber einmal zu viel abrufen, als einen Monat zu fehlen.
    return null;
  }
}

function schreibStand(datei, stand) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(stand, null, 2)}\n`);
  fs.renameSync(tmp, datei);
}

async function holeQuelle(abruf) {
  const r = await abruf(QUELLE, {
    headers: { Origin: HERKUNFT, Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Quelle antwortet mit HTTP ${r.status}`);
  return r.json();
}

/** 0 = in Ordnung, 1 = auffaellig (nichts geschrieben), 2 = Fehler (nichts geaendert oder Gegenprobe falsch). */
export async function main(argv = process.argv.slice(2), deps = {}) {
  const a = argumente(argv);
  const aus = deps.aus || console.log;
  const jetzt = deps.jetzt || new Date();
  const privat = process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
  const datei = a.datei || path.join(privat, 'google-bewertung', 'status.json');
  const vorher = liesStand(datei);
  if (a.monatlich && schonDiesenMonat(vorher, jetzt)) return 0;

  const melde = (ampel, meldung, erfolg = false) => {
    if (!a.schreiben) return;
    schreibStand(datei, {
      geprueftAm: jetzt.toISOString(), ampel, meldung,
      letzterErfolg: erfolg ? jetzt.toISOString() : vorher?.letzterErfolg ?? null,
    });
  };

  try {
    const neu = leseQuelle(await holeQuelle(deps.fetch || globalThis.fetch));
    const z = deps.zugang || await zugang(a.zugang);
    const d = await z.frage(ABFRAGE);
    if (!d?.shop?.id) throw new Error('Shop-Abfrage ohne Ergebnis');
    const alt = leseMetafeld(d.shop.metafield?.value);
    const zeile = `Google ${wertText(neu.wert)} aus ${neu.anzahl}, im Metafeld ${alt ? `${wertText(alt.wert)} aus ${alt.anzahl} (Stand ${alt.stand})` : 'nichts'}`;
    const gruende = a.trotzdem ? [] : auffaellig(neu, alt);
    if (gruende.length) {
      const meldung = gruende.join('; ');
      aus(`${heuteBerlin(jetzt)} ${zeile}: AUFFAELLIG, nicht uebernommen: ${meldung}`);
      melde('gelb', meldung);
      return 1;
    }
    if (!a.schreiben) {
      aus(`${zeile}. Nichts geschrieben (ohne --schreiben).`);
      return 0;
    }
    const wert = metafeldWert(neu, heuteBerlin(jetzt));
    const r = await z.schreibe(setzenMutation(d.shop.id, wert));
    const fehler = fehlerAus(r);
    if (fehler.length) throw new Error(`metafieldsSet: ${fehler.join('; ')}`);
    // userErrors leer ist kein Beleg: frisch lesen und vergleichen.
    const probe = leseMetafeld((await z.frage(ABFRAGE))?.shop?.metafield?.value);
    if (probe?.anzahl !== neu.anzahl || wertText(probe?.wert ?? 0) !== wertText(neu.wert)) {
      throw new Error('Gegenprobe: Metafeld enthaelt nicht den geschriebenen Wert');
    }
    aus(`${heuteBerlin(jetzt)} ${zeile}. Geschrieben, Gegenprobe gleich.`);
    melde('gruen', `${wertText(neu.wert)} aus ${neu.anzahl}`, true);
    return 0;
  } catch (e) {
    aus(`${heuteBerlin(jetzt)} Fehler: ${e.message}`);
    melde('rot', e.message);
    return 2;
  }
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((e) => {
    console.error(`Fehler: ${e.message}`);
    process.exitCode = 2;
  });
}
