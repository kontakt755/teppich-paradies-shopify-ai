// Kunden als eigene Datenart fuers Control Center - nicht nur aus
// Bestellungen abgeleitet. Zeigt auch Kunden ohne aktuelle Bestellung und
// liefert verlaessliche Lebenszeit-Zahlen (numberOfOrders, amountSpent)
// statt Summen aus einem 90-Tage-Fenster.

/** Bringt den Admin-API-Export auf eine flache Liste. */
export function ladeKunden(daten) {
  const j = typeof daten === 'string' ? JSON.parse(daten) : daten;
  if (Array.isArray(j)) return j;
  if (Array.isArray(j?.customers)) return j.customers;
  if (Array.isArray(j?.customers?.nodes)) return j.customers.nodes;
  if (j?.data?.customers?.nodes) return j.data.customers.nodes;
  throw new Error('Eingabe hat kein customers-Feld');
}

function anschrift(a) {
  if (!a) return null;
  return {
    name: a.name || null, strasse: [a.address1, a.address2].filter(Boolean).join(', ') || null,
    plz: a.zip || null, ort: a.city || null, land: a.countryCodeV2 || a.country || null, telefon: a.phone || null,
  };
}

/** Ein Kunde fuers Dashboard: Kontakt, Zahlen, Adressen, Einwilligung. */
export function kundenEintrag(c) {
  const betrag = Number(c?.amountSpent?.amount);
  return {
    id: c.id,
    name: c.displayName || [c.firstName, c.lastName].filter(Boolean).join(' ') || null,
    email: c.defaultEmailAddress?.emailAddress || null,
    telefon: c.defaultPhoneNumber?.phoneNumber || null,
    anzahlBestellungen: Number(c.numberOfOrders) || 0,
    gesamtumsatz: Number.isFinite(betrag) ? betrag : 0,
    waehrung: c.amountSpent?.currencyCode || 'EUR',
    tags: c.tags || [],
    notiz: c.note || null,
    marketingEinwilligung: {
      email: c.defaultEmailAddress?.marketingState || null,
      telefon: c.defaultPhoneNumber?.marketingState || null,
    },
    erstelltAm: c.createdAt || null,
    aktualisiertAm: c.updatedAt || null,
    anschrift: anschrift(c.defaultAddress),
    weitereAnschriften: (c.addressesV2?.nodes ?? []).map(anschrift).filter(Boolean),
  };
}

/**
 * Aufbereitetes Modell fuer $TP_PRIVAT_DIR/kunden/kunden.json.
 * @param {object|Array|string} daten  Export der Admin API
 */
export function aufbereiten(daten, opt = {}) {
  const kunden = ladeKunden(daten).map(kundenEintrag);
  kunden.sort((a, b) => b.gesamtumsatz - a.gesamtumsatz);
  return {
    erstellt: (opt.jetzt ?? new Date()).toISOString(),
    anzahl: kunden.length,
    kunden,
  };
}
