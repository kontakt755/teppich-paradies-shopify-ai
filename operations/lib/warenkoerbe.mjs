// Abgebrochene Warenkoerbe (AbandonedCheckout) fuers Control Center -
// verlorener Umsatz, den heute niemand sieht.

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
    positionen: (c.lineItems?.nodes ?? []).map(li => ({ titel: li.title, menge: Number(li.quantity) || 0 })),
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
  const offen = alle.filter(c => !c.abgeschlossenAm);
  offen.sort((a, b) => (b.zeitpunkt || '').localeCompare(a.zeitpunkt || ''));
  const gesamtwert = offen.reduce((s, c) => s + c.wert, 0);
  return {
    erstellt: (opt.jetzt ?? new Date()).toISOString(),
    anzahl: alle.length,
    offenAnzahl: offen.length,
    offenWert: Math.round(gesamtwert * 100) / 100,
    warenkoerbe: offen,
    // Nachtraeglich doch abgeschlossene bleiben belegbar, aber getrennt.
    nachtraeglichAbgeschlossen: alle.filter(c => c.abgeschlossenAm).length,
  };
}
