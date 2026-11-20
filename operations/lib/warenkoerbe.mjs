// Abgebrochene Warenkoerbe (AbandonedCheckout) fuers Control Center -
// verlorener Umsatz, den heute niemand sieht.

import { istTestkontakt } from './kundenfaelle.mjs';
import { istMusterPosition, istNurMusterBestellung } from './muster.mjs';

export function ladeWarenkoerbe(daten) {
  const j = typeof daten === 'string' ? JSON.parse(daten) : daten;
  if (Array.isArray(j)) return j;
  if (Array.isArray(j?.checkouts)) return j.checkouts;
  if (Array.isArray(j?.abandonedCheckouts)) return j.abandonedCheckouts;
  if (Array.isArray(j?.abandonedCheckouts?.nodes)) return j.abandonedCheckouts.nodes;
  if (j?.data?.abandonedCheckouts?.nodes) return j.data.abandonedCheckouts.nodes;
  throw new Error('Eingabe hat kein checkouts/abandonedCheckouts-Feld');
}

function betrag(c) {
  const n = Number(c?.totalPriceSet?.shopMoney?.amount ?? c?.subtotalPriceSet?.shopMoney?.amount);
  return Number.isFinite(n) ? n : 0;
}

/** Ein abgebrochener Warenkorb: Zeitpunkt, Kunde/E-Mail, Wert, Positionen. */
export function warenkorbEintrag(c) {
  const adresse = c.shippingAddress || c.billingAddress || null;
  const positionen = (c.lineItems?.nodes ?? []).map(li => ({
    titel: li.title,
    menge: Number(li.quantity) || 0,
    sku: li.sku || null,
    istMuster: istMusterPosition({ sku: li.sku, produktTyp: li.variant?.product?.productType }),
  }));
  return {
    id: c.id,
    nummer: c.name || null,
    kunde: c.customer?.displayName || adresse?.name || null,
    email: c.customer?.defaultEmailAddress?.emailAddress || null,
    telefon: c.customer?.defaultPhoneNumber?.phoneNumber || null,
    wert: betrag(c),
    waehrung: c.totalPriceSet?.shopMoney?.currencyCode || c.subtotalPriceSet?.shopMoney?.currencyCode || 'EUR',
    zeitpunkt: c.createdAt || null,
    aktualisiertAm: c.updatedAt || null,
    abgeschlossenAm: c.completedAt || null,
    wiederhergestelltUrl: c.abandonedCheckoutUrl || null,
    ort: adresse ? [adresse.city, adresse.country].filter(Boolean).join(', ') || null : null,
    positionen,
    nurMuster: istNurMusterBestellung(positionen),
  };
}

/**
 * Aufbereitetes Modell fuer $TP_PRIVAT_DIR/warenkoerbe/warenkoerbe.json.
 * `completedAt` gesetzt heisst: der Kunde hat doch noch bestellt - zaehlt
 * dann nicht als verlorener Umsatz, bleibt aber im Datensatz sichtbar statt
 * geloescht zu werden.
 */
export function aufbereiten(daten, opt = {}) {
  const alle = ladeWarenkoerbe(daten).map(warenkorbEintrag);
  // Testkaeufe (qa-test@example.com aus den Shop-Pruefungen) sind kein
  // verlorener Umsatz - sie machten am 2026-10-12 rund 3.150 von 3.338 € aus.
  const offen = alle.filter(c => !c.abgeschlossenAm && !istTestkontakt(c));
  offen.sort((a, b) => (b.zeitpunkt || '').localeCompare(a.zeitpunkt || ''));
  // Reine Musterkoerbe (ab 01.12. 4,99 € Versand) zaehlen getrennt: kein verlorener Warenumsatz.
  const ware = offen.filter(c => !c.nurMuster);
  const muster = offen.filter(c => c.nurMuster);
  const gesamtwert = ware.reduce((s, c) => s + c.wert, 0);
  return {
    erstellt: (opt.jetzt ?? new Date()).toISOString(),
    anzahl: alle.length,
    offenAnzahl: ware.length,
    musterOffenAnzahl: muster.length,
    musterOffenWert: Math.round(muster.reduce((s, c) => s + c.wert, 0) * 100) / 100,
    offenWert: Math.round(gesamtwert * 100) / 100,
    warenkoerbe: offen,
    // Nachtraeglich doch abgeschlossene bleiben belegbar, aber getrennt.
    nachtraeglichAbgeschlossen: alle.filter(c => c.abgeschlossenAm).length,
    testAusgeblendet: alle.filter(c => !c.abgeschlossenAm && istTestkontakt(c)).length,
  };
}
