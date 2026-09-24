// Lagerbestand je Standort und Variante fuers Control Center - beantwortet
// "haben wir das da?". Fuehrt der Shop keinen Bestand (keine getrackten
// Varianten, keine Standorte), haelt aufbereiten() das ausdruecklich fest
// statt Nullen zu erfinden (verfuegbar:false mit Grund).

export function ladeBestand(daten) {
  const j = typeof daten === 'string' ? JSON.parse(daten) : daten;
  if (j?.bestand && j?.standorte) return j;
  throw new Error('Eingabe hat kein {standorte, bestand}-Format (siehe sync/inventory.mjs fetchInventoryLevels)');
}

function mengeVon(quantities, name) {
  const n = Number((quantities ?? []).find(q => q.name === name)?.quantity);
  return Number.isFinite(n) ? n : 0;
}

/** Ein Lagerbestandseintrag: Standort, Variante/SKU, verfuegbar/vorraetig/reserviert/unterwegs. */
export function bestandEintrag(level) {
  const v = level.item?.variant;
  return {
    standort: level.standort?.name || null,
    standortId: level.standort?.id || null,
    sku: level.item?.sku || v?.sku || null,
    produkt: v?.product?.title || null,
    handle: v?.product?.handle || null,
    variante: v?.title || null,
    getrackt: Boolean(level.item?.tracked),
    verfuegbar: mengeVon(level.quantities, 'available'),
    vorraetig: mengeVon(level.quantities, 'on_hand'),
    reserviert: mengeVon(level.quantities, 'committed'),
    unterwegs: mengeVon(level.quantities, 'incoming'),
  };
}

/**
 * Aufbereitetes Modell fuer $TP_PRIVAT_DIR/bestand/bestand.json.
 * Ohne Standorte oder ohne getrackte Varianten: `gefuehrt:false` mit
 * `hinweis` - der Shop fuehrt dann schlicht keinen Lagerbestand, das ist
 * kein Fehler des Abrufs (CLAUDE.md Punkt "nichts erfinden").
 */
export function aufbereiten(daten, opt = {}) {
  const { standorte, bestand } = ladeBestand(daten);
  const erstellt = (opt.jetzt ?? new Date()).toISOString();
  if (!standorte.length) {
    return { erstellt, gefuehrt: false, hinweis: 'Keine aktiven Standorte im Shop gefunden.', standorte: [], anzahl: 0, eintraege: [] };
  }
  const eintraege = bestand.map(bestandEintrag);
  const getrackte = eintraege.filter(e => e.getrackt);
  if (!getrackte.length) {
    return {
      erstellt, gefuehrt: false,
      hinweis: 'Keine Variante im Shop ist als Lagerbestand-gefuehrt (tracked) markiert - der Shop fuehrt aktuell keinen Lagerbestand.',
      standorte: standorte.map(s => s.name), anzahl: eintraege.length, eintraege: [],
    };
  }
  return {
    erstellt, gefuehrt: true,
    standorte: standorte.map(s => s.name),
    anzahl: getrackte.length,
    eintraege: getrackte,
    knapp: getrackte.filter(e => e.verfuegbar <= 0).length,
  };
}
