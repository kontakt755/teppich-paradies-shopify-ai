/**
 * Woher kommt ein Muster? Beim Lieferanten bestellen (Standard) oder aus dem
 * eigenen Bestand/Katalog - dann entweder verschicken oder persoenlich
 * vorbeibringen (Kunde in der Naehe).
 *
 * Der Inhaber hat viele Kataloge und Muster selbst da und faehrt bei Kunden in
 * der Naehe vorbei. Solche Muster duerfen nicht in der Bestellmail landen, nicht
 * als "Muster noch zu bestellen" zaehlen und kein To-do "beim Lieferanten
 * bestellen" erzeugen.
 *
 * Ablage: $TP_PRIVAT_DIR/musterherkunft.json, nur anhaengen (wer, wann, was).
 * Eine Wahl gilt fuer eine ganze Bestellung (lineItemId null) oder eine
 * Position; das spaetere Ereignis gewinnt - eine Wahl fuer die ganze Bestellung
 * ueberstimmt also fruehere Einzelwahlen derselben Bestellung. Shopify wird
 * nie geschrieben.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ROUTE } from './route.mjs';

export const HERKUNFT = Object.freeze({ LIEFERANT: 'lieferant', VERSAND: 'eigen_versand', VORBEI: 'eigen_vorbei' });
export const HERKUNFT_WERTE = Object.freeze(Object.values(HERKUNFT));
export const HERKUNFT_LABEL = Object.freeze({
  lieferant: 'Beim Lieferanten bestellen',
  eigen_versand: 'Aus eigenem Bestand/Katalog – verschicken',
  eigen_vorbei: 'Aus eigenem Bestand/Katalog – persönlich vorbeibringen',
});

/** Routen, die schon heute "ohne Bestellung" bedeuten (eigenes Musterlager, Zuschnitt). */
const ROUTEN_OHNE_LIEFERANT = new Set([ROUTE.SAMPLE_STOCK, ROUTE.SAMPLE_CUT]);

/** Muss dieses Muster NICHT beim Lieferanten bestellt werden? Nur fuer Muster-Positionen sinnvoll. */
export function musterOhneLieferant(pos) {
  if (!pos) return false;
  if (pos.musterHerkunft === HERKUNFT.VERSAND || pos.musterHerkunft === HERKUNFT.VORBEI) return true;
  if (pos.musterHerkunft === HERKUNFT.LIEFERANT) return false;
  return ROUTEN_OHNE_LIEFERANT.has(pos.route) || ROUTEN_OHNE_LIEFERANT.has(pos.musterRoute);
}

export class MusterherkunftFehler extends Error {}

export function musterherkunftPfad(privatDir) {
  return path.join(privatDir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse'), 'musterherkunft.json');
}

/** Alle Ereignisse; fehlende oder kaputte Datei = leer. */
export function leseEreignisse(file) {
  try {
    const roh = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(roh?.ereignisse) ? roh.ereignisse.filter(e => e && e.orderId && HERKUNFT_WERTE.includes(e.herkunft)) : [];
  } catch {
    return [];
  }
}

function clip(text, max) {
  const s = String(text ?? '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Haengt eine Wahl an (atomar: tmp-Datei + rename). Bestehende Ereignisse bleiben unveraendert.
 * @param {string} file
 * @param {object} p
 * @param {string} p.orderId
 * @param {string|null} [p.lineItemId]  null = ganze Bestellung
 * @param {string} p.herkunft           einer aus HERKUNFT_WERTE
 * @param {string} p.actor
 * @param {string} [p.notiz]
 * @param {Date}   [p.jetzt]
 */
export function haengeWahlAn(file, { orderId, lineItemId = null, herkunft, actor, notiz = null, jetzt = new Date() } = {}) {
  const id = String(orderId ?? '').trim();
  if (!id) throw new MusterherkunftFehler('orderId ist Pflicht');
  if (!actor) throw new MusterherkunftFehler('actor ist Pflicht');
  if (!HERKUNFT_WERTE.includes(herkunft)) throw new MusterherkunftFehler(`Unbekannte Herkunft „${herkunft}"`);
  const ereignis = { orderId: id, lineItemId: lineItemId ? String(lineItemId) : null, herkunft, am: jetzt.toISOString(), von: String(actor) };
  if (notiz && clip(notiz, 500)) ereignis.notiz = clip(notiz, 500);
  const alle = leseEreignisse(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, ereignisse: [...alle, ereignis] }, null, 2));
  fs.renameSync(tmp, file);
  return ereignis;
}

/**
 * Wirksame Wahl je Bestellung/Position (rein).
 * @returns {Map<string, {standard: object|null, positionen: Map<string, object>}>}  orderId -> Stand; Werte sind die Ereignisse
 */
export function wirksameWahl(ereignisse = []) {
  const je = new Map();
  const sortiert = [...ereignisse].sort((a, b) => String(a.am).localeCompare(String(b.am)));
  for (const e of sortiert) {
    if (!je.has(e.orderId)) je.set(e.orderId, { standard: null, positionen: new Map() });
    const stand = je.get(e.orderId);
    if (e.lineItemId) stand.positionen.set(e.lineItemId, e);
    else { stand.standard = e; stand.positionen = new Map(); }
  }
  return je;
}

/** Ereignis, das fuer eine Position gilt, oder null (= nichts gewaehlt). */
export function wahlFuer(wahl, orderId, lineItemId) {
  const stand = wahl.get(orderId);
  if (!stand) return null;
  return (lineItemId && stand.positionen.get(lineItemId)) || stand.standard || null;
}

/**
 * Traegt die Wahl an alle Muster-Positionen des Bestellmodells (Auftraege, Testauftraege,
 * Mustergruppen) ein: `musterHerkunft`, `musterHerkunftAm`, `musterHerkunftVon`, dazu
 * `musterRoute` (die Route vor der Gruppierung - in den Mustergruppen steht dort "MUSTER").
 * Veraendert das Modell an Ort und Stelle und gibt es zurueck. Ware bleibt unberuehrt.
 */
export function wendeAufModellAn(modell, ereignisse = []) {
  if (!modell) return modell;
  const wahl = wirksameWahl(ereignisse);
  const routeJe = new Map();
  const auftraege = [...(modell.auftraege ?? []), ...(modell.testauftraege ?? [])];
  for (const a of auftraege) for (const p of a.positionen ?? []) if (p.istMuster && p.lineItemId) routeJe.set(`${a.id}::${p.lineItemId}`, p.route);
  const setze = (p) => {
    if (!p?.istMuster) return;
    const route = routeJe.get(`${p.orderId}::${p.lineItemId}`);
    if (route && route !== 'MUSTER') p.musterRoute = route;
    const e = wahlFuer(wahl, p.orderId, p.lineItemId);
    if (!e) return;
    p.musterHerkunft = e.herkunft;
    p.musterHerkunftAm = e.am;
    p.musterHerkunftVon = e.von;
  };
  for (const a of auftraege) for (const p of a.positionen ?? []) setze(p);
  for (const g of modell.musterGruppen ?? []) for (const p of g.positionen ?? []) setze(p);
  return modell;
}
