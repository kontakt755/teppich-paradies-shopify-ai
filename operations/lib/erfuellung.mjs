// Erfuellungen (Sendungen) und Rueckerstattungen je Bestellung, damit
// "versendet" und "erstattet" im Dashboard belegt sind - nicht neu
// abgerufen, sondern aus den Bestelldaten gelesen, die sync/orders.mjs
// bereits mit fulfillments{status trackingInfo} und refunds{totalRefundedSet}
// mitliefert (ORDERS_QUERY).

import { ladeBestellungen } from './kennzahlen.mjs';

function betragRefund(r) {
  const n = Number(r?.totalRefundedSet?.shopMoney?.amount);
  return Number.isFinite(n) ? n : 0;
}

/** Erfuellungen/Rueckerstattungen einer einzelnen Bestellung. */
export function erfuellungEintrag(order) {
  const sendungen = (order.fulfillments ?? []).map(f => ({
    status: f.displayStatus || f.status || null,
    erstelltAm: f.createdAt || null,
    aktualisiertAm: f.updatedAt || null,
    sendungen: (f.trackingInfo ?? []).map(t => ({ nummer: t.number || null, traeger: t.company || null, url: t.url || null })),
  }));
  const erstattungen = (order.refunds ?? []).map(r => ({
    id: r.id, erstelltAm: r.createdAt || null, grund: r.note || null,
    betrag: betragRefund(r), waehrung: r.totalRefundedSet?.shopMoney?.currencyCode || 'EUR',
  }));
  return {
    orderId: order.id,
    bestellnummer: order.name || null,
    fulfillmentStatus: order.displayFulfillmentStatus || null,
    sendungen,
    erstattungen,
    erstattetGesamt: Math.round(erstattungen.reduce((s, r) => s + r.betrag, 0) * 100) / 100,
  };
}

/**
 * Aufbereitetes Modell fuer $TP_PRIVAT_DIR/erfuellung/erfuellung.json.
 * Nur Bestellungen mit mindestens einer Sendung oder Erstattung - eine
 * komplett offene Bestellung traegt hier nichts bei, dafuer gibt es die
 * Bestelluebersicht (lib/bestelluebersicht.mjs).
 */
export function aufbereiten(daten, opt = {}) {
  const orders = ladeBestellungen(daten);
  const eintraege = orders.map(erfuellungEintrag).filter(e => e.sendungen.length || e.erstattungen.length);
  return {
    erstellt: (opt.jetzt ?? new Date()).toISOString(),
    anzahl: eintraege.length,
    versendet: eintraege.filter(e => e.sendungen.length).length,
    erstattet: eintraege.filter(e => e.erstattungen.length).length,
    eintraege,
  };
}
