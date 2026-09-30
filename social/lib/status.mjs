/**
 * Statusmodell: ein Inhalt (Material) wird zu einem oder mehreren Beitraegen.
 *
 * Der Inhalt traegt den Weg des Materials (NEU -> IN_PRUEFUNG ->
 * CONTENT_ERSTELLT), der Beitrag den Weg zur Veroeffentlichung (FREIGABE ->
 * GEPLANT -> VEROEFFENTLICHT -> ARCHIV). Nach aussen erscheint beides als eine
 * Kette, genau wie im Auftrag beschrieben.
 */

export const INHALT_STATUS = Object.freeze({
  NEU: 'NEU',
  IN_PRUEFUNG: 'IN_PRUEFUNG',
  CONTENT_ERSTELLT: 'CONTENT_ERSTELLT',
  ARCHIV: 'ARCHIV',
  VERWORFEN: 'VERWORFEN',
});

export const BEITRAG_STATUS = Object.freeze({
  FREIGABE: 'FREIGABE',
  GEPLANT: 'GEPLANT',
  // Der Publisher hat den Beitrag gerade in der Hand. Nur er kommt hier heraus -
  // so kann kein zweiter Lauf und kein Klick in der Zentrale dazwischenfunken.
  IN_ARBEIT: 'IN_ARBEIT',
  VEROEFFENTLICHT: 'VEROEFFENTLICHT',
  ARCHIV: 'ARCHIV',
  VERWORFEN: 'VERWORFEN',
  FEHLER: 'FEHLER',
});

export const STATUS_LABEL = Object.freeze({
  NEU: 'Neu',
  IN_PRUEFUNG: 'In Prüfung',
  CONTENT_ERSTELLT: 'Content erstellt',
  FREIGABE: 'Freigabe',
  GEPLANT: 'Geplant',
  IN_ARBEIT: 'Wird veröffentlicht',
  VEROEFFENTLICHT: 'Veröffentlicht',
  ARCHIV: 'Archiv',
  VERWORFEN: 'Verworfen',
  FEHLER: 'Fehler',
});

const INHALT_WEGE = {
  NEU: ['IN_PRUEFUNG', 'VERWORFEN'],
  IN_PRUEFUNG: ['CONTENT_ERSTELLT', 'VERWORFEN', 'NEU'],
  CONTENT_ERSTELLT: ['ARCHIV', 'IN_PRUEFUNG', 'VERWORFEN'],
  ARCHIV: ['IN_PRUEFUNG'],            // gute alte Inhalte duerfen wiederverwendet werden
  VERWORFEN: ['NEU'],
};

const BEITRAG_WEGE = {
  FREIGABE: ['GEPLANT', 'VERWORFEN'],
  GEPLANT: ['IN_ARBEIT', 'FREIGABE', 'VERWORFEN', 'FEHLER'],
  IN_ARBEIT: ['VEROEFFENTLICHT', 'GEPLANT', 'FREIGABE', 'FEHLER'],
  FEHLER: ['GEPLANT', 'FREIGABE', 'VERWORFEN'],
  VEROEFFENTLICHT: ['ARCHIV'],
  ARCHIV: [],
  VERWORFEN: ['FREIGABE'],
};

export class StatusFehler extends Error {}

export function darfInhalt(von, nach) {
  return (INHALT_WEGE[von] ?? []).includes(nach);
}

export function darfBeitrag(von, nach) {
  return (BEITRAG_WEGE[von] ?? []).includes(nach);
}

export function pruefeInhaltWechsel(von, nach) {
  if (von === nach) return nach;
  if (!darfInhalt(von, nach)) throw new StatusFehler(`Inhalt: ${von} -> ${nach} ist nicht vorgesehen`);
  return nach;
}

export function pruefeBeitragWechsel(von, nach) {
  if (von === nach) return nach;
  if (!darfBeitrag(von, nach)) throw new StatusFehler(`Beitrag: ${von} -> ${nach} ist nicht vorgesehen`);
  return nach;
}

/** Inhaltsarten. `quelle` sagt, woher das Material kommt, `typ`, was daraus wird. */
export const QUELLEN = Object.freeze(['baustelle', 'shopify', 'referenz', 'laden', 'wissen']);

export const TYPEN = Object.freeze({
  kundenprojekt: { label: 'Kundenprojekt', gruppe: 'handwerk' },
  vorher_nachher: { label: 'Vorher/Nachher', gruppe: 'handwerk' },
  baustelle_einblick: { label: 'Baustellen-Einblick', gruppe: 'handwerk' },
  referenz: { label: 'Referenz', gruppe: 'handwerk' },
  produkt_neu: { label: 'Neu im Shop', gruppe: 'produkt' },
  produkt_farben: { label: 'Farbvorstellung', gruppe: 'produkt' },
  produkt_woche: { label: 'Produkt der Woche', gruppe: 'produkt' },
  raumidee: { label: 'Raumidee', gruppe: 'produkt' },
  angebot: { label: 'Angebot', gruppe: 'angebot' },
  tipp: { label: 'Tipp / Bodenwissen', gruppe: 'wissen' },
  laden: { label: 'Laden & Team', gruppe: 'betrieb' },
});

export const FORMATE = Object.freeze(['feed', 'karussell', 'story', 'reel']);
export const PLATTFORMEN = Object.freeze(['instagram', 'facebook']);
