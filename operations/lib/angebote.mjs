// Angebote/Entwuerfe (DraftOrder) fuers Control Center - Mass- und
// Verlegeangebote, die noch keine Bestellung sind.

export function ladeAngebote(daten) {
  const j = typeof daten === 'string' ? JSON.parse(daten) : daten;
  if (Array.isArray(j)) return j;
  if (Array.isArray(j?.draftOrders)) return j.draftOrders;
  if (Array.isArray(j?.draftOrders?.nodes)) return j.draftOrders.nodes;
  if (j?.data?.draftOrders?.nodes) return j.data.draftOrders.nodes;
  throw new Error('Eingabe hat kein draftOrders-Feld');
}

function betrag(d) {
  const n = Number(d?.totalPriceSet?.shopMoney?.amount);
  return Number.isFinite(n) ? n : 0;
}

/** Ein Angebot fuers Dashboard: Nummer, Kunde, Betrag, Status, Positionen. */
export function angebotEintrag(d) {
  return {
    id: d.id,
    nummer: d.name || null,
    status: d.status || null,
    kunde: d.customer?.displayName || d.email || null,
    email: d.customer?.defaultEmailAddress?.emailAddress || d.email || null,
    // Ohne Telefonnummer stand in der Angebotsliste immer "keine Kontaktdaten
    // hinterlegt", obwohl der Entwurf oder der Kunde eine Nummer traegt.
    telefon: d.phone || d.customer?.defaultPhoneNumber?.phoneNumber || d.customer?.phone
      || d.shippingAddress?.phone || d.billingAddress?.phone || null,
    betrag: betrag(d),
    waehrung: d.totalPriceSet?.shopMoney?.currencyCode || 'EUR',
    erstelltAm: d.createdAt || null,
    aktualisiertAm: d.updatedAt || null,
    abgeschlossenAm: d.completedAt || null,
    rechnungGesendetAm: d.invoiceSentAt || null,
    rechnungUrl: d.invoiceUrl || null,
    notiz: d.note2 || null,
    positionen: (d.lineItems?.nodes ?? []).map(li => ({
      titel: li.title, variante: li.variantTitle || null, sku: li.sku || null,
      menge: Number(li.quantity) || 0,
      einzelpreis: Number(li.originalUnitPriceSet?.shopMoney?.amount) || 0,
    })),
  };
}

/**
 * Aufbereitetes Modell fuer $TP_PRIVAT_DIR/angebote/angebote.json.
 * Offene (OPEN/INVOICE_SENT) zuerst, dann abgeschlossene - im Alltag zaehlt,
 * was noch Aufmerksamkeit braucht.
 */
export function aufbereiten(daten, opt = {}) {
  const angebote = ladeAngebote(daten).map(angebotEintrag);
  const rang = { OPEN: 0, INVOICE_SENT: 1, COMPLETED: 2 };
  angebote.sort((a, b) => (rang[a.status] ?? 9) - (rang[b.status] ?? 9) || (b.erstelltAm || '').localeCompare(a.erstelltAm || ''));
  return {
    erstellt: (opt.jetzt ?? new Date()).toISOString(),
    anzahl: angebote.length,
    offen: angebote.filter(a => a.status === 'OPEN' || a.status === 'INVOICE_SENT').length,
    angebote,
  };
}
