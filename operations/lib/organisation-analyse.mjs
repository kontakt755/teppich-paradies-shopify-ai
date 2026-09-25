/**
 * Eingaben einsortieren: aus einem hingeschriebenen Satz einen Vorschlag
 * machen - Aufgabe oder Notiz, wer, welcher Bereich, wie dringend, bis wann.
 *
 * Bewusst regelbasiert und ohne Netz: die Schnellerfassung muss auch dann
 * funktionieren, wenn kein Modell erreichbar ist (Auftrag: "Das Aufgabenmodul
 * soll auch funktionieren, wenn Claude temporaer nicht verfuegbar ist").
 * Jeder Vorschlag ist aenderbar und nennt seine Begruendung.
 */

import { alsTag, STANDARD_BEREICHE } from './organisation.mjs';

/** Woerter, die eine Handlung anzeigen - daran erkennt man eine Aufgabe. */
const HANDLUNG = [
  'soll', 'muss', 'bitte', 'machen', 'mache', 'erledigen', 'prüfen', 'pruefen', 'kontrollieren',
  'bestellen', 'anrufen', 'schreiben', 'ändern', 'aendern', 'austauschen', 'tauschen', 'einbauen',
  'anlegen', 'erstellen', 'aktualisieren', 'nachfragen', 'klären', 'klaeren', 'abholen', 'liefern',
  'einpflegen', 'hochladen', 'korrigieren', 'reparieren', 'messen', 'aufmessen', 'verlegen', 'senden',
];

/** Woerter, die eine reine Feststellung anzeigen - daran erkennt man eine Notiz. */
const FESTSTELLUNG = ['steht', 'stehen', 'liegt', 'liegen', 'ist neu', 'wurde geändert', 'wurde geaendert', 'info', 'hinweis', 'zur info', 'merken'];

const BEREICH_WOERTER = {
  'Online-Shop': ['shop', 'shopify', 'online', 'webshop', 'website', 'webseite', 'produktseite', 'artikel online'],
  Laden: ['laden', 'ladengeschäft', 'ladengeschaeft', 'theke', 'ausstellung', 'schaufenster'],
  Baustelle: ['baustelle', 'verlegen', 'verlegung', 'aufmaß', 'aufmass', 'montage'],
  Kunden: ['kunde', 'kundin', 'kundenanfrage', 'reklamation', 'rückruf', 'rueckruf'],
  'Angebote / Lexware': ['angebot', 'lexware', 'rechnung', 'kostenvoranschlag'],
  Einkauf: ['einkauf', 'bestellen', 'bestellung', 'nachbestellen', 'order'],
  Lieferanten: ['lieferant', 'jordan', 'grosshändler', 'grosshaendler', 'lieferung'],
  Marketing: ['marketing', 'newsletter', 'werbung', 'google', 'anzeige', 'logo', 'social'],
  Buchhaltung: ['buchhaltung', 'buchen', 'steuer', 'datev', 'beleg'],
  Mitarbeiter: ['mitarbeiter', 'urlaub', 'schicht', 'krank', 'arbeitszeit'],
  Lager: ['lager', 'regal', 'rolle', 'rollen', 'muster', 'bestand', 'inventur'],
  Fahrzeuge: ['fahrzeug', 'transporter', 'auto', 'tüv', 'tuev', 'werkstatt'],
};

const DRINGEND_WOERTER = ['dringend', 'sofort', 'eilt', 'asap', 'schnellstmöglich', 'schnellstmoeglich', 'notfall'];
const HOCH_WOERTER = ['wichtig', 'bald', 'zeitnah', 'vorrangig'];
const NIEDRIG_WOERTER = ['irgendwann', 'gelegentlich', 'wenn zeit', 'unwichtig', 'idee'];

const WOCHENTAGE = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];

function nurText(s) { return String(s || '').toLowerCase(); }

/** Fälligkeit aus dem Satz. Gibt null zurueck, wenn nichts Eindeutiges dasteht. */
export function erkenneFaelligkeit(text, jetzt = new Date()) {
  const t = nurText(text);
  const tag = (versatz) => alsTag(new Date(jetzt.getTime() + versatz * 86400000));

  const datum = t.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})?\b/);
  if (datum) {
    const [, d, m, j] = datum;
    const jahr = j ? (j.length === 2 ? 2000 + Number(j) : Number(j)) : jetzt.getFullYear();
    const iso = `${jahr}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
    return { faellig: iso, grund: 'Datum im Text' };
  }
  if (/\b(heute|sofort|jetzt)\b/.test(t)) return { faellig: tag(0), grund: '„heute"' };
  if (/\bmorgen\b/.test(t)) return { faellig: tag(1), grund: '„morgen"' };
  if (/\bübermorgen|uebermorgen\b/.test(t)) return { faellig: tag(2), grund: '„übermorgen"' };
  if (/\bnächste woche|naechste woche\b/.test(t)) return { faellig: tag(7), grund: '„nächste Woche"' };
  if (/\bdiese woche\b/.test(t)) return { faellig: tag(7 - jetzt.getDay() || 7), grund: '„diese Woche"' };
  for (const [i, name] of WOCHENTAGE.entries()) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      const diff = (i - jetzt.getDay() + 7) % 7 || 7;
      return { faellig: tag(diff), grund: `„${name.charAt(0).toUpperCase()}${name.slice(1)}"` };
    }
  }
  return null;
}

/** Wen meint der Satz? Vergleicht gegen die vorhandenen Mitarbeiter, nie gegen eine feste Liste. */
export function erkennePerson(text, mitarbeiter = []) {
  const t = nurText(text);
  for (const m of mitarbeiter) {
    const namen = [m.name, m.kuerzel].filter(Boolean).map(nurText);
    for (const n of namen) {
      if (n && n.length > 1 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`).test(t)) {
        return { kuerzel: m.kuerzel || m.name, name: m.name, grund: `Name „${m.name}" im Text` };
      }
    }
  }
  return null;
}

export function erkenneBereich(text) {
  const t = nurText(text);
  let bester = null;
  for (const [bereich, woerter] of Object.entries(BEREICH_WOERTER)) {
    const treffer = woerter.filter(w => t.includes(w));
    if (treffer.length && (!bester || treffer.length > bester.treffer.length)) bester = { bereich, treffer };
  }
  return bester ? { bereich: bester.bereich, grund: `„${bester.treffer[0]}" im Text` } : null;
}

export function erkennePrioritaet(text) {
  const t = nurText(text);
  if (DRINGEND_WOERTER.some(w => t.includes(w))) return { prioritaet: 'URGENT', grund: 'Dringlichkeitswort im Text' };
  if (HOCH_WOERTER.some(w => t.includes(w))) return { prioritaet: 'HIGH', grund: '„wichtig"/„bald" im Text' };
  if (NIEDRIG_WOERTER.some(w => t.includes(w))) return { prioritaet: 'LOW', grund: 'kein Zeitdruck erkennbar' };
  return null;
}

export function erkenneTyp(text) {
  const t = nurText(text);
  const handlung = HANDLUNG.filter(w => t.includes(w));
  const feststellung = FESTSTELLUNG.filter(w => t.includes(w));
  if (handlung.length && !feststellung.length) return { typ: 'TASK', grund: `„${handlung[0]}" deutet auf etwas zu Erledigendes` };
  if (feststellung.length && !handlung.length) return { typ: 'NOTE', grund: `„${feststellung[0]}" klingt nach einer Information` };
  if (handlung.length) return { typ: 'TASK', grund: `„${handlung[0]}" im Text` };
  return { typ: 'NOTE', grund: 'keine Handlung erkennbar' };
}

/** Titel: erster Satz, gekuerzt - der Rest bleibt Beschreibung. */
export function titelAus(text) {
  const roh = String(text || '').trim().replace(/\s+/g, ' ');
  const satz = roh.split(/(?<=[.!?])\s/)[0] || roh;
  return satz.length > 90 ? `${satz.slice(0, 87)}…` : satz;
}

/**
 * Mehrere Aufgaben in einem Satz? "Logo ändern, Vinylpreise kontrollieren und
 * Newsletter einbauen" sind drei Dinge. Nur vorschlagen, nie automatisch teilen.
 */
/** Nebensaetze beginnen mit diesen Woertern - sie sind kein eigenes Vorhaben. */
const NEBENSATZ = ['ob', 'dass', 'wenn', 'weil', 'damit', 'falls', 'wie', 'was', 'wer', 'wo', 'warum',
  'der', 'die', 'das', 'welche', 'welcher', 'welches', 'sondern', 'aber'];

export function teileAuf(text) {
  const roh = String(text || '').trim();
  if (!roh) return [];
  const stuecke = roh
    .split(/\s*(?:,|;|\bund\b|\bsowie\b|\bdanach\b|\bausserdem\b|\baußerdem\b)\s*/i)
    .map(s => s.trim().replace(/[.!?]+$/, ''))
    .filter(s => s.length > 8);
  if (stuecke.length < 2) return [];
  const eigenstaendig = stuecke.filter(s => {
    const erstes = nurText(s).split(/\s+/)[0];
    if (NEBENSATZ.includes(erstes)) return false;             // "ob die Muster angekommen sind"
    return HANDLUNG.some(w => nurText(s).includes(w)) || /\b\w{4,}(en|ieren)\b/.test(nurText(s));
  });
  return eigenstaendig.length >= 2 ? eigenstaendig : [];
}

/**
 * Vollstaendiger Vorschlag zu einer Eingabe. Alles darf der Benutzer aendern -
 * deshalb liegt zu jedem Punkt eine Begruendung bei.
 */
export function analysiere(text, { mitarbeiter = [], bereiche = STANDARD_BEREICHE, jetzt = new Date(), benutzer = null } = {}) {
  const typ = erkenneTyp(text);
  const person = erkennePerson(text, mitarbeiter);
  const bereich = erkenneBereich(text);
  const prio = erkennePrioritaet(text);
  const faellig = erkenneFaelligkeit(text, jetzt);
  const teile = teileAuf(text);

  const eigen = benutzer?.kuerzel || benutzer?.name || null;
  const fuerMich = !person && typ.typ === 'TASK';

  return {
    typ: typ.typ,
    titel: titelAus(text),
    beschreibung: String(text || '').trim(),
    verantwortlich: person?.kuerzel ?? (fuerMich ? eigen : null),
    bereich: bereich?.bereich ?? (bereiche.includes('Sonstiges') ? 'Sonstiges' : null),
    prioritaet: prio?.prioritaet ?? 'NORMAL',
    faellig: faellig?.faellig ?? null,
    // Eine Notiz ueber jemand anderen ist eine Team-Notiz, eigene Gedanken sind privat.
    sichtbarkeit: typ.typ === 'NOTE' ? (person || bereich ? 'TEAM' : 'PRIVAT') : 'TEAM',
    mehrereAufgaben: teile,
    begruendung: [typ.grund, person?.grund, bereich?.grund, prio?.grund, faellig?.grund].filter(Boolean),
  };
}
