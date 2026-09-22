/**
 * Auftragsstatus (02-DATA-MODEL.md Abschnitt 3, Order-Metafeld ops.status).
 */

export const AUFTRAG_STATUS = Object.freeze({
  NEU: 'NEU',
  PRUEFUNG: 'PRUEFUNG',
  BERATUNG_OFFEN: 'BERATUNG_OFFEN',
  MASS_PRUEFUNG_OFFEN: 'MASS_PRUEFUNG_OFFEN',
  FREIGEGEBEN: 'FREIGEGEBEN',
  EINKAUF: 'EINKAUF',
  WARENEINGANG: 'WARENEINGANG',
  VERSAND: 'VERSAND',
  ABGESCHLOSSEN: 'ABGESCHLOSSEN',
  SPAETER: 'SPAETER',
  PROBLEM: 'PROBLEM',
});

export const AUFTRAG_STATI = Object.freeze(Object.values(AUFTRAG_STATUS));

/** Erlaubte Uebergaenge. SPAETER und PROBLEM sind von ueberall erreichbar (vor ABGESCHLOSSEN). */
export const UEBERGAENGE = Object.freeze({
  NEU: ['PRUEFUNG', 'BERATUNG_OFFEN', 'MASS_PRUEFUNG_OFFEN', 'SPAETER', 'PROBLEM'],
  PRUEFUNG: ['BERATUNG_OFFEN', 'MASS_PRUEFUNG_OFFEN', 'FREIGEGEBEN', 'SPAETER', 'PROBLEM'],
  BERATUNG_OFFEN: ['PRUEFUNG', 'MASS_PRUEFUNG_OFFEN', 'FREIGEGEBEN', 'SPAETER', 'PROBLEM'],
  MASS_PRUEFUNG_OFFEN: ['PRUEFUNG', 'BERATUNG_OFFEN', 'FREIGEGEBEN', 'SPAETER', 'PROBLEM'],
  FREIGEGEBEN: ['EINKAUF', 'PRUEFUNG', 'SPAETER', 'PROBLEM'],
  EINKAUF: ['WARENEINGANG', 'VERSAND', 'SPAETER', 'PROBLEM'],
  WARENEINGANG: ['VERSAND', 'PROBLEM'],
  VERSAND: ['ABGESCHLOSSEN', 'PROBLEM'],
  ABGESCHLOSSEN: [],
  SPAETER: ['PRUEFUNG', 'BERATUNG_OFFEN', 'MASS_PRUEFUNG_OFFEN', 'FREIGEGEBEN', 'PROBLEM'],
  PROBLEM: ['PRUEFUNG', 'BERATUNG_OFFEN', 'MASS_PRUEFUNG_OFFEN', 'FREIGEGEBEN', 'EINKAUF', 'WARENEINGANG', 'VERSAND', 'SPAETER'],
});

/** Stati, die den Einkauf sperren (09-PROCUREMENT.md "Blockaden vor Einkauf"). */
export const EINKAUF_SPERRE = Object.freeze([AUFTRAG_STATUS.BERATUNG_OFFEN, AUFTRAG_STATUS.MASS_PRUEFUNG_OFFEN, AUFTRAG_STATUS.PROBLEM]);

export function uebergangErlaubt(von, nach) {
  return (UEBERGAENGE[von] || []).includes(nach);
}

export function sperrtEinkauf(status) {
  return EINKAUF_SPERRE.includes(status);
}

function attribut(order, name) {
  const liste = Array.isArray(order?.customAttributes) ? order.customAttributes
    : Array.isArray(order?.attributes) ? order.attributes : [];
  const treffer = liste.find(a => a && String(a.key ?? a.name).toLowerCase() === name.toLowerCase());
  return treffer ? String(treffer.value ?? '').trim() : '';
}

/** Cart-Attribut Beratung: nur ein klares "ja" zaehlt (Pflichtfeld ohne Vorauswahl). */
export function beratungGewuenscht(order) {
  return attribut(order, 'Beratung').toLowerCase() === 'ja';
}

/**
 * Leitet den Startstatus einer Bestellung ab.
 *
 * @param {object} order
 * @param {Array}  [order.customAttributes]
 * @param {Array}  [order.positionen]  resolved items mit `masspruefung`
 * @param {object} [order.ops]         vorhandener Zustand {status}
 * @returns {{status:string, gruende:string[], beratung:object|null}}
 */
export function ableiten(order = {}) {
  const gruende = [];
  const aktuell = order.ops?.status;

  // Ein gesetzter Zustand jenseits der Pruefphase wird nicht zurueckgedreht.
  const spaetePhase = [AUFTRAG_STATUS.FREIGEGEBEN, AUFTRAG_STATUS.EINKAUF, AUFTRAG_STATUS.WARENEINGANG,
    AUFTRAG_STATUS.VERSAND, AUFTRAG_STATUS.ABGESCHLOSSEN, AUFTRAG_STATUS.SPAETER, AUFTRAG_STATUS.PROBLEM];
  if (spaetePhase.includes(aktuell)) {
    return { status: aktuell, gruende: ['ops.status bereits gesetzt'], beratung: null };
  }

  const positionen = Array.isArray(order.positionen) ? order.positionen : [];
  const massProbleme = positionen.filter(p => ['abweichung', 'unlesbar', 'waise'].includes(p?.masspruefung?.status));
  for (const p of massProbleme) gruende.push(`Masspruefung ${p.masspruefung.status}: ${p.sku ?? p.lineItemId ?? '?'}`);

  const beratung = beratungGewuenscht(order)
    ? { gewuenscht: true, telefon: attribut(order, 'Telefon') || null, zeitfenster: attribut(order, 'Zeitfenster') || null, anliegen: attribut(order, 'Anliegen') || null }
    : null;
  if (beratung) gruende.push('Cart-Attribut Beratung = ja');

  let status;
  if (massProbleme.length) status = AUFTRAG_STATUS.MASS_PRUEFUNG_OFFEN; // vor dem Zuschnitt, vor allem anderen
  else if (beratung) status = AUFTRAG_STATUS.BERATUNG_OFFEN;
  else status = aktuell === AUFTRAG_STATUS.PRUEFUNG ? AUFTRAG_STATUS.PRUEFUNG : AUFTRAG_STATUS.NEU;

  return { status, gruende, beratung };
}
