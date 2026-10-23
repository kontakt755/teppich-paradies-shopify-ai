/**
 * Bestandsabgleich mit der Bestandsdatei eines Lieferanten (Dropshipping).
 *
 * Der Lieferant stellt taeglich eine CSV (Semikolon) mit item_no, EAN1 und
 * available bereit. Jede Shopify-Variante des Lieferanten (SKU = item_no,
 * Barcode = EAN1) bekommt am eigenen Standort genau diesen Wert als
 * "available". available = 0 heisst ausverkauft; die Varianten stehen auf
 * inventoryPolicy DENY, damit nichts ohne Bestand verkauft wird.
 *
 * Reine Funktionen - Netz und Shopify haengen in operations/scripts/bestand-abgleich.mjs.
 */

/** Mindestzeilen einer plausiblen Bestandsdatei (Teillieferung = Abbruch). */
export const MIN_ZEILEN = 1000;
/** Fehlt mehr als dieser Anteil unserer Varianten in der Datei, wird nichts geschrieben. */
export const MAX_ANTEIL_FEHLEND = 0.2;
/** Fallen mehr als dieser Anteil auf 0, wird nichts geschrieben (kaputte Datei). */
export const MAX_ANTEIL_AUF_NULL = 0.5;

/** CSV (Semikolon, erste Zeile Kopf) -> Map item_no -> {ean, verfuegbar}. */
export function leseBestandCsv(text) {
  const zeilen = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((z) => z.trim() !== '');
  if (zeilen.length < 2) throw new Error('Bestandsdatei ist leer');
  const kopf = zeilen[0].split(';').map((s) => s.trim());
  const iSku = kopf.indexOf('item_no');
  const iEan = kopf.indexOf('EAN1');
  const iVerf = kopf.indexOf('available');
  if (iSku < 0 || iVerf < 0) throw new Error(`Bestandsdatei ohne Spalten item_no/available (Kopf: ${kopf.join(';').slice(0, 120)})`);
  const nachSku = new Map();
  const nachEan = new Map();
  for (const zeile of zeilen.slice(1)) {
    const f = zeile.split(';');
    const sku = (f[iSku] || '').trim();
    if (!sku) continue;
    const roh = (f[iVerf] || '').trim().replace(',', '.');
    const zahl = Number(roh);
    const eintrag = { sku, ean: iEan >= 0 ? (f[iEan] || '').trim() : '', verfuegbar: Number.isFinite(zahl) ? Math.max(0, Math.floor(zahl)) : 0 };
    nachSku.set(sku, eintrag);
    if (eintrag.ean) nachEan.set(eintrag.ean, eintrag);
  }
  return { nachSku, nachEan, zeilen: nachSku.size };
}

/**
 * Plant die Aenderungen. varianten: [{sku, barcode, inventoryItemId, verfuegbar}]
 * (verfuegbar = aktueller Shopify-Wert am Standort). Varianten, die in der
 * Datei fehlen, gehen auf 0 - der Lieferant fuehrt sie nicht mehr.
 */
export function planeAbgleich(bestand, varianten, { minZeilen = MIN_ZEILEN, maxFehlend = MAX_ANTEIL_FEHLEND, maxAufNull = MAX_ANTEIL_AUF_NULL } = {}) {
  const aenderungen = [];
  const fehlend = [];
  let aufNull = 0;
  for (const v of varianten) {
    const treffer = bestand.nachSku.get(v.sku) || (v.barcode ? bestand.nachEan.get(v.barcode) : undefined);
    if (!treffer) fehlend.push(v.sku);
    const soll = treffer ? treffer.verfuegbar : 0;
    if (soll === 0) aufNull++;
    if (soll !== v.verfuegbar) aenderungen.push({ sku: v.sku, inventoryItemId: v.inventoryItemId, von: v.verfuegbar, auf: soll });
  }
  const gruende = [];
  if (bestand.zeilen < minZeilen) gruende.push(`Bestandsdatei hat nur ${bestand.zeilen} Artikel (mindestens ${minZeilen})`);
  if (varianten.length && fehlend.length / varianten.length > maxFehlend) gruende.push(`${fehlend.length} von ${varianten.length} Varianten fehlen in der Datei`);
  if (varianten.length && aufNull / varianten.length > maxAufNull) gruende.push(`${aufNull} von ${varianten.length} Varianten waeren ausverkauft`);
  return { aenderungen, fehlend, aufNull, varianten: varianten.length, sperre: gruende.length ? gruende.join('; ') : null };
}

/** Aenderungen -> Eingaben fuer inventorySetQuantities (je hoechstens 250). */
export function bauePakete(aenderungen, locationId, groesse = 250) {
  const pakete = [];
  for (let i = 0; i < aenderungen.length; i += groesse) {
    pakete.push({
      name: 'available',
      reason: 'correction',
      quantities: aenderungen.slice(i, i + groesse).map((a) => ({
        inventoryItemId: a.inventoryItemId,
        locationId,
        quantity: a.auf,
        changeFromQuantity: a.von,
      })),
    });
  }
  return pakete;
}
