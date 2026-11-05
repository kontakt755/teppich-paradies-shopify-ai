// Shop-Kennzahlen fuer das Control Center: Bestellungen, Umsatz und
// Durchschnittsbon je Zeitraum (nur ueber Bestellungen mit Betrag). Stornierte Bestellungen zaehlen nicht mit,
// unbezahlte ebenso wenig - gezaehlt wird, was tatsaechlich Geld gebracht hat.
//
// Warenumsatz (ware.umsatz): was zahlende Warenkunden fuer Ware bezahlt haben, brutto wie im
// Shop, ohne Versand und ohne Muster. Grundlage ist currentSubtotalPriceSet, der Stand nach
// Bestellaenderungen und Erstattungen (#1056: bei Bestellung das Doppelte des bezahlten Betrags).
// Dienstleistungen auf der Warenbestellung (Kettelservice, Fertigungspauschale) gehoeren zum
// Kauf und zaehlen mit; allein machen sie niemanden zum Warenkunden (istWarenPosition).

import { istTestbestellung } from './testbestellung.mjs';
import { istMusterPosition, istNurMusterBestellung } from './muster.mjs';
import { positionen, istWarenPosition, kundenZuordnung } from './muster-kauf.mjs';

export const ZEITRAEUME = [7, 30];

/** Bestellungen aus dem Admin-API-Export auf eine flache Liste bringen. */
export function ladeBestellungen(daten) {
  const j = typeof daten === 'string' ? JSON.parse(daten) : daten;
  if (Array.isArray(j)) return j;
  if (Array.isArray(j?.orders)) return j.orders;
  if (Array.isArray(j?.orders?.nodes)) return j.orders.nodes;
  if (j?.data?.orders?.nodes) return j.data.orders.nodes;
  throw new Error('Eingabe hat kein orders-Feld');
}

function betrag(order) {
  const a = order?.currentTotalPriceSet?.shopMoney?.amount ?? order?.totalPriceSet?.shopMoney?.amount;
  const n = Number(a);
  return Number.isFinite(n) ? n : 0;
}

const zahlOder = (set) => {
  const n = Number(set?.shopMoney?.amount ?? NaN);
  return Number.isFinite(n) ? n : null;
};

/**
 * Warenanteil einer Bestellung, brutto, ohne Versand und Muster. Die Positionen liefern nur
 * Nettowerte; deshalb wird die Bruttozwischensumme im Verhaeltnis geteilt. Muster kosten
 * praktisch immer 0 €, dann ist es genau die Zwischensumme.
 */
export function warenBetrag(order) {
  const zeilen = positionen(order);
  if (!zeilen.some(istWarenPosition)) return 0;
  const brutto = zahlOder(order?.currentSubtotalPriceSet)
    ?? betrag(order) - (zahlOder(order?.currentShippingPriceSet) ?? zahlOder(order?.totalShippingPriceSet) ?? 0);
  const alle = zeilen.reduce((s, p) => s + p.betrag, 0);
  const ohneMuster = zeilen.filter((p) => !istMusterPosition(p)).reduce((s, p) => s + p.betrag, 0);
  return alle > 0 ? brutto * (ohneMuster / alle) : brutto;
}

/** Ware und Muster eines Zeitraums, getrennt. Eine Bestellung mit Ware und Muster ist Ware. */
function warenUndMuster(orders, kundeVon) {
  const kundeOder = (o) => kundeVon(o) ?? o?.id ?? o?.name;
  const ware = orders.filter((o) => positionen(o).some(istWarenPosition));
  const muster = orders.filter((o) => istNurMusterBestellung(positionen(o)));
  return {
    ware: {
      umsatz: runden(ware.reduce((s, o) => s + warenBetrag(o), 0)),
      kunden: new Set(ware.map(kundeOder)).size,
      bestellungen: ware.length,
    },
    muster: { bestellungen: muster.length, kunden: new Set(muster.map(kundeOder)).size },
  };
}

function waehrungVon(orders) {
  for (const o of orders) {
    const w = o?.currentTotalPriceSet?.shopMoney?.currencyCode ?? o?.totalPriceSet?.shopMoney?.currencyCode;
    if (w) return w;
  }
  return 'EUR';
}

/** Zaehlt eine Bestellung fuer den Umsatz? Storniert nie, unbezahlt nie, Testbestellung nie. */
export function zaehlt(order) {
  if (order?.cancelledAt) return false;
  if (istTestbestellung(order)) return false;
  const status = String(order?.displayFinancialStatus ?? '').toUpperCase();
  return status === 'PAID' || status === 'PARTIALLY_REFUNDED';
}

function runden(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Baut den Schnappschuss fuer das Dashboard.
 * @param {object|Array|string} daten  Export der Admin API
 * @param {{jetzt?: Date, zeitraeume?: number[]}} [opt]
 */
export function schnappschuss(daten, opt = {}) {
  const orders = ladeBestellungen(daten);
  const jetzt = opt.jetzt ?? new Date();
  const tage = opt.zeitraeume ?? ZEITRAEUME;
  const waehrung = waehrungVon(orders);
  const kundeVon = kundenZuordnung(orders.filter(zaehlt));
  const TAG_MS = 24 * 60 * 60 * 1000;
  const imFenster = (o, ab, bis) => {
    const d = new Date(o?.createdAt ?? 0);
    return Number.isFinite(d.getTime()) && d >= ab && d <= bis;
  };

  const zeitraeume = {};
  for (const t of tage) {
    const ab = new Date(jetzt.getTime() - t * TAG_MS);
    const drin = orders.filter(o => imFenster(o, ab, jetzt));
    const gezaehlt = drin.filter(zaehlt);
    const umsatz = gezaehlt.reduce((s, o) => s + betrag(o), 0);
    // Der Schnitt nur ueber Bestellungen mit Betrag: kostenlose Musterbestellungen (oft die
    // Mehrheit) drueckten ihn sonst auf einen Wert, den kein Kunde je bezahlt hat.
    const mitBetrag = gezaehlt.filter(o => betrag(o) > 0).length;
    zeitraeume[String(t)] = {
      bestellungen: gezaehlt.length,
      umsatz: runden(umsatz),
      waehrung,
      mitBetrag,
      durchschnitt: mitBetrag ? runden(umsatz / mitBetrag) : 0,
      storniert: drin.length - gezaehlt.length,
      // Bezahlte Bestellungen ohne Betrag - in der Praxis kostenlose Musterbestellungen.
      // Damit erklaert das Dashboard "Umsatz 0 €" statt wie ein Datenfehler auszusehen.
      kostenlos: gezaehlt.filter(o => betrag(o) === 0).length,
      ...warenUndMuster(gezaehlt, kundeVon),
    };
  }

  // Die 7 Tage davor, gleich lang und gleich gerechnet: der Vergleich neben dem Warenumsatz.
  // Die Millisekunde Abstand haelt eine Bestellung auf der Grenze aus einem der beiden Fenster.
  const abVorwoche = new Date(jetzt.getTime() - 14 * TAG_MS);
  const bisVorwoche = new Date(jetzt.getTime() - 7 * TAG_MS - 1);
  const vorwoche = {
    von: abVorwoche.toISOString(), bis: bisVorwoche.toISOString(),
    ...warenUndMuster(orders.filter(o => zaehlt(o) && imFenster(o, abVorwoche, bisVorwoche)), kundeVon),
  };

  // Meistverkauft im laengsten Zeitraum, nach Menge.
  const langster = Math.max(...tage);
  const ab = new Date(jetzt.getTime() - langster * 24 * 60 * 60 * 1000);
  const mengen = new Map();
  for (const o of orders) {
    if (!zaehlt(o) || new Date(o?.createdAt ?? 0) < ab) continue;
    for (const li of o?.lineItems?.nodes ?? []) {
      const titel = li?.title;
      if (titel) mengen.set(titel, (mengen.get(titel) ?? 0) + (Number(li.quantity) || 0));
    }
  }
  const topProdukte = [...mengen.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([titel, menge]) => ({ titel, menge }));

  return { erstellt: jetzt.toISOString(), zeitraeume, vorwoche, topProdukte };
}
