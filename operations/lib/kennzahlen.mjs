// Shop-Kennzahlen fuer das Control Center: Bestellungen, Umsatz und
// Durchschnittsbon je Zeitraum. Stornierte Bestellungen zaehlen nicht mit,
// unbezahlte ebenso wenig - gezaehlt wird, was tatsaechlich Geld gebracht hat.

import { istTestbestellung } from './testbestellung.mjs';

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

  const zeitraeume = {};
  for (const t of tage) {
    const ab = new Date(jetzt.getTime() - t * 24 * 60 * 60 * 1000);
    const drin = orders.filter(o => {
      const d = new Date(o?.createdAt ?? 0);
      return Number.isFinite(d.getTime()) && d >= ab && d <= jetzt;
    });
    const gezaehlt = drin.filter(zaehlt);
    const umsatz = gezaehlt.reduce((s, o) => s + betrag(o), 0);
    zeitraeume[String(t)] = {
      bestellungen: gezaehlt.length,
      umsatz: runden(umsatz),
      waehrung,
      durchschnitt: gezaehlt.length ? runden(umsatz / gezaehlt.length) : 0,
      storniert: drin.length - gezaehlt.length,
      // Bezahlte Bestellungen ohne Betrag - in der Praxis kostenlose Musterbestellungen.
      // Damit erklaert das Dashboard "Umsatz 0 €" statt wie ein Datenfehler auszusehen.
      kostenlos: gezaehlt.filter(o => betrag(o) === 0).length,
    };
  }

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

  return { erstellt: jetzt.toISOString(), zeitraeume, topProdukte };
}
