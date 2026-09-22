/**
 * Einkaufsbestellungen (09-PROCUREMENT.md).
 *
 * Gruppierung freigegebener Positionen nach (lieferant, route, lieferziel).
 * Direktversand-Positionen verschiedener Kunden werden nie gemischt: bei
 * SUPPLIER_DIRECT und SUPPLIER_TO_SITE ist das Lieferziel die Bestellung
 * (Kundenadresse bzw. Baustelle), sonst das eigene Lager "TP".
 */

import { UNGEKLAERT } from './umrechnung.mjs';
import { ROUTE } from './route.mjs';

export const EINKAUF_STATUS = Object.freeze({
  OFFEN: 'OFFEN',
  FREIGEGEBEN: 'FREIGEGEBEN',
  BESTELLT: 'BESTELLT',
  BESTAETIGT: 'BESTAETIGT',
  TEIL_GELIEFERT: 'TEIL_GELIEFERT',
  GELIEFERT: 'GELIEFERT',
  STORNIERT: 'STORNIERT',
  PROBLEM: 'PROBLEM',
});

// Werte ab TEIL_GELIEFERT sind Annahme (Masterprompt bricht nach "TEIL" ab, 12-OPEN-ITEMS.md).
export const EINKAUF_UEBERGAENGE = Object.freeze({
  OFFEN: ['FREIGEGEBEN', 'STORNIERT', 'PROBLEM'],
  FREIGEGEBEN: ['BESTELLT', 'OFFEN', 'STORNIERT', 'PROBLEM'],
  BESTELLT: ['BESTAETIGT', 'TEIL_GELIEFERT', 'GELIEFERT', 'STORNIERT', 'PROBLEM'],
  BESTAETIGT: ['TEIL_GELIEFERT', 'GELIEFERT', 'STORNIERT', 'PROBLEM'],
  TEIL_GELIEFERT: ['GELIEFERT', 'PROBLEM'],
  GELIEFERT: [],
  STORNIERT: [],
  PROBLEM: ['OFFEN', 'FREIGEGEBEN', 'BESTELLT', 'BESTAETIGT', 'TEIL_GELIEFERT', 'STORNIERT'],
});

export function einkaufUebergangErlaubt(von, nach) {
  return (EINKAUF_UEBERGAENGE[von] || []).includes(nach);
}

const ZIEL_JE_AUFTRAG = new Set([ROUTE.SUPPLIER_DIRECT, ROUTE.SUPPLIER_TO_SITE]);

/**
 * Lieferziel-Schluessel einer Position. Adressen werden nie in den Schluessel
 * geschrieben, nur die Bestellnummer/ID - so bleibt der Schluessel loggbar.
 */
export function lieferzielSchluessel(position) {
  const route = position.route;
  if (ZIEL_JE_AUFTRAG.has(route)) {
    const ref = position.orderId ?? position.orderName;
    if (!ref) throw new Error('lieferzielSchluessel: Direktversand-Position ohne orderId');
    return `${route === ROUTE.SUPPLIER_TO_SITE ? 'SITE' : 'KUNDE'}:${ref}`;
  }
  return 'TP';
}

/**
 * @param {Array} positionen  je {orderId, orderName, lineItemId, lieferant, route, ...}
 * @returns {Array<{schluessel:string, lieferant:string, route:string, lieferziel:string, positionen:Array}>}
 */
export function gruppieren(positionen = []) {
  const gruppen = new Map();
  for (const pos of positionen) {
    const lieferant = pos.lieferant || pos.einkauf?.lieferant || UNGEKLAERT;
    const route = pos.route || UNGEKLAERT;
    const lieferziel = lieferzielSchluessel({ ...pos, route });
    const schluessel = `${lieferant}|${route}|${lieferziel}`;
    if (!gruppen.has(schluessel)) {
      gruppen.set(schluessel, { schluessel, lieferant, route, lieferziel, positionen: [] });
    }
    gruppen.get(schluessel).positionen.push(pos);
  }
  return [...gruppen.values()];
}

function jjmmtt(datum) {
  const d = datum instanceof Date ? datum : new Date(datum);
  if (Number.isNaN(d.getTime())) throw new Error('einkaufsId: datum ungueltig');
  const jj = String(d.getUTCFullYear()).slice(-2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const tt = String(d.getUTCDate()).padStart(2, '0');
  return `${jj}${mm}${tt}`;
}

/** "TP-EK-JJMMTT-<KUERZEL>-NNN"; Kuerzel ist das Pseudonym (A-D), nie ein Klarname. */
export function einkaufsId({ datum, kuerzel, laufnummer } = {}) {
  if (!/^[A-D]$/.test(String(kuerzel || ''))) throw new Error(`einkaufsId: kuerzel muss Pseudonym A-D sein, nicht "${kuerzel}"`);
  const n = Number(laufnummer);
  if (!Number.isInteger(n) || n < 1 || n > 999) throw new Error('einkaufsId: laufnummer 1..999');
  return `TP-EK-${jjmmtt(datum)}-${kuerzel}-${String(n).padStart(3, '0')}`;
}

function wert(v) {
  return v === undefined || v === null || v === '' ? UNGEKLAERT : v;
}

/**
 * Erzeugt aus einer Gruppe den Bestellentwurf. Wird nie automatisch gesendet (D8).
 *
 * @param {object} gruppe   aus gruppieren()
 * @param {object} p
 * @param {Date|string} p.datum
 * @param {number} p.laufnummer
 * @param {object} [p.lieferziele]  {"KUNDE:<orderId>": {name, address1, zip, city, country}} - nur fuer Direktversand
 */
export function bestellungAusGruppe(gruppe, { datum = new Date(), laufnummer = 1, lieferziele = {} } = {}) {
  if (!gruppe || !Array.isArray(gruppe.positionen)) throw new Error('bestellungAusGruppe: gruppe fehlt');
  const kuerzel = gruppe.lieferant;
  const id = einkaufsId({ datum, kuerzel, laufnummer });
  const zielAdresse = gruppe.lieferziel === 'TP' ? { typ: 'TP' } : { typ: gruppe.lieferziel.split(':')[0], ...(lieferziele[gruppe.lieferziel] || { adresse: UNGEKLAERT }) };

  const positionen = gruppe.positionen.map((pos, i) => ({
    nr: i + 1,
    orderId: pos.orderId ?? null,
    lineItemId: pos.lineItemId ?? null,
    procurementId: wert(pos.procurementId ?? pos.einkauf?.procurement_id),
    artikelnummer: wert(pos.artikelnummer ?? pos.einkauf?.artikelnummer),
    farbe: wert(pos.farbe),
    farbnummer: wert(pos.farbnummer ?? pos.einkauf?.farbnummer),
    breite: wert(pos.breite),
    menge: wert(pos.menge),
    einheit: wert(pos.einheit ?? pos.einkauf?.bestelleinheit),
    kundenreferenz: wert(pos.orderName ?? pos.orderId),
    lieferziel: gruppe.lieferziel,
    bemerkung: pos.bemerkung ?? '',
    status: EINKAUF_STATUS.OFFEN,
  }));

  const ungeklaert = positionen.flatMap(p => Object.entries(p)
    .filter(([, v]) => v === UNGEKLAERT)
    .map(([k]) => `Position ${p.nr}: ${k}`));

  return {
    id,
    lieferant: kuerzel,
    route: gruppe.route,
    lieferziel: zielAdresse,
    status: EINKAUF_STATUS.OFFEN,
    erstellt_am: (datum instanceof Date ? datum : new Date(datum)).toISOString(),
    positionen,
    ungeklaert,
  };
}
