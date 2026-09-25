/**
 * Aufgaben und Notizen fuer den Betrieb - die fachliche Logik.
 *
 * Abgrenzung: die Ansicht "Arbeit" fuehrt Entwicklungsaufgaben als GitHub
 * Issues (CLAUDE.md: "GitHub Issues sind die einzige Aufgabenquelle"). Dieses
 * Modul ist etwas anderes: der Betriebsalltag - Laden, Lager, Baustelle,
 * Kunden, Lieferanten. Diese Daten sind teils personenbezogen und gehoeren
 * deshalb nie ins oeffentliche Repository, sondern unter $TP_PRIVAT_DIR.
 *
 * Reine Funktionen ohne Dateizugriff; das Lesen und Schreiben liegt in
 * organisation-speicher.mjs. So laesst sich alles ohne Browser und ohne
 * Datenbank testen.
 */

/** TASK = es ist etwas zu tun. NOTE = Information, ohne Erledigungspflicht. */
export const TYPEN = Object.freeze(['TASK', 'NOTE']);

export const STATUS = Object.freeze(['INBOX', 'PLANNED', 'IN_PROGRESS', 'REVIEW', 'WAITING', 'DEFERRED', 'DONE']);
export const STATUS_LABEL = Object.freeze({
  INBOX: 'Eingang', PLANNED: 'Geplant', IN_PROGRESS: 'In Arbeit', REVIEW: 'Prüfung',
  WAITING: 'Warten auf', DEFERRED: 'Zurückgestellt', DONE: 'Erledigt',
});

export const PRIORITAETEN = Object.freeze(['URGENT', 'HIGH', 'NORMAL', 'LOW']);
export const PRIORITAET_LABEL = Object.freeze({ URGENT: 'dringend', HIGH: 'hoch', NORMAL: 'normal', LOW: 'niedrig' });

/** Pruefbarkeit: wer darf eine Aufgabe abhaken und woran wird das gemessen. */
export const PRUEFTYPEN = Object.freeze(['AUTO', 'SEMI_AUTO', 'MANUAL', 'EXTERNAL']);
export const PRUEFTYP_LABEL = Object.freeze({
  AUTO: 'automatisch prüfbar', SEMI_AUTO: 'automatisch prüfbar, Mensch bestätigt',
  MANUAL: 'nur von Hand', EXTERNAL: 'hängt an jemandem von außen',
});

/** Startbereiche. Erweiterbar - die Liste steht in den Daten, nicht im Code fest. */
export const STANDARD_BEREICHE = Object.freeze([
  'Online-Shop', 'Laden', 'Baustelle', 'Kunden', 'Angebote / Lexware', 'Einkauf',
  'Lieferanten', 'Marketing', 'Buchhaltung', 'Mitarbeiter', 'Lager', 'Fahrzeuge', 'Sonstiges',
]);

const TAG_MS = 86400000;

export function istTag(iso) { return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso); }

/** Tagesdatum in lokaler Zeit - Faelligkeiten sind Kalendertage, keine Zeitpunkte. */
export function alsTag(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function tageBis(faellig, jetzt = new Date()) {
  if (!istTag(faellig)) return null;
  const heute = new Date(`${alsTag(jetzt)}T00:00:00`);
  const ziel = new Date(`${faellig}T00:00:00`);
  return Math.round((ziel - heute) / TAG_MS);
}

export function istUeberfaellig(t, jetzt = new Date()) {
  if (t.status === 'DONE' || t.typ !== 'TASK') return false;
  const d = tageBis(t.faellig, jetzt);
  return d !== null && d < 0;
}

/**
 * Sortierrang. Kleiner = weiter oben. Reihenfolge nach Vorgabe:
 * ueberfaellig, dringend, heute, hohe Prioritaet, diese Woche, normal, spaeter.
 * WAITING und DEFERRED mischen sich nicht in den Fokus - sie haben eigene
 * Ansichten und stehen sonst ganz unten.
 */
export function rang(t, jetzt = new Date()) {
  if (t.status === 'DONE') return 90;
  if (t.status === 'WAITING') return 80;
  if (t.status === 'DEFERRED') return 85;
  if (istUeberfaellig(t, jetzt)) return 0;
  if (t.prioritaet === 'URGENT') return 1;
  const d = tageBis(t.faellig, jetzt);
  if (d === 0) return 2;
  if (t.prioritaet === 'HIGH') return 3;
  if (d !== null && d <= 7) return 4;
  if (t.prioritaet === 'LOW') return 6;
  return 5;
}

export function sortiere(liste, jetzt = new Date()) {
  return [...liste].sort((a, b) => {
    const r = rang(a, jetzt) - rang(b, jetzt);
    if (r) return r;
    const fa = istTag(a.faellig) ? a.faellig : '9999-12-31';
    const fb = istTag(b.faellig) ? b.faellig : '9999-12-31';
    if (fa !== fb) return fa < fb ? -1 : 1;
    return String(a.erstelltAm || '').localeCompare(String(b.erstelltAm || ''));
  });
}

/** Ansichten von "Meine Aufgaben". `fokus` ist die Standardansicht. */
export const ANSICHTEN = Object.freeze(['fokus', 'heute', 'dringend', 'woche', 'spaeter', 'warten', 'pruefung', 'ueberfaellig', 'erledigt']);
export const ANSICHT_LABEL = Object.freeze({
  fokus: 'Fokus', heute: 'Heute', dringend: 'Dringend', woche: 'Diese Woche', spaeter: 'Später',
  warten: 'Warten auf', pruefung: 'In Prüfung', ueberfaellig: 'Überfällig', erledigt: 'Erledigt',
});

export function passtZuAnsicht(t, ansicht, jetzt = new Date()) {
  if (t.typ !== 'TASK') return false;
  const d = tageBis(t.faellig, jetzt);
  switch (ansicht) {
    case 'erledigt': return t.status === 'DONE';
    case 'warten': return t.status === 'WAITING';
    case 'pruefung': return t.status === 'REVIEW';
    case 'ueberfaellig': return istUeberfaellig(t, jetzt);
    case 'heute': return t.status !== 'DONE' && d === 0;
    case 'dringend': return t.status !== 'DONE' && t.prioritaet === 'URGENT';
    case 'woche': return t.status !== 'DONE' && d !== null && d >= 0 && d <= 7;
    case 'spaeter': return t.status !== 'DONE' && (t.status === 'DEFERRED' || (d === null && t.prioritaet === 'LOW'));
    case 'fokus':
    default:
      // Fokus = was jetzt zaehlt: nicht erledigt, nicht wartend, nicht
      // zurueckgestellt, und entweder faellig/ueberfaellig oder wichtig.
      if (['DONE', 'WAITING', 'DEFERRED'].includes(t.status)) return false;
      if (istUeberfaellig(t, jetzt)) return true;
      if (['URGENT', 'HIGH'].includes(t.prioritaet)) return true;
      return d !== null && d <= 7;
  }
}

/**
 * Wer darf was sehen? Persoenliche Notizen bleiben privat - auch vor dem
 * Inhaber. Alles andere richtet sich nach Sichtbarkeit und Rolle.
 */
export function darfSehen(eintrag, benutzer) {
  const kuerzel = benutzer?.kuerzel || benutzer?.name || null;
  const istEigen = eintrag.besitzer && kuerzel && eintrag.besitzer === kuerzel;
  if (eintrag.sichtbarkeit === 'PRIVAT') return Boolean(istEigen);
  if (eintrag.sichtbarkeit === 'PERSONEN') {
    return Boolean(istEigen || (eintrag.fuer ?? []).includes(kuerzel));
  }
  return true; // TEAM
}

/** Darf jemand diesen Eintrag aendern? Inhaber ja, sonst nur Eigenes oder Zugewiesenes. */
export function darfAendern(eintrag, benutzer) {
  if (!benutzer) return true;                       // Notzugang ohne benutzer.json
  if (benutzer.rolle === 'lesen') return false;
  if (benutzer.rolle === 'inhaber') return darfSehen(eintrag, benutzer);
  const kuerzel = benutzer.kuerzel || benutzer.name;
  return eintrag.besitzer === kuerzel || eintrag.verantwortlich === kuerzel;
}

// -- Texterkennung ----------------------------------------------------------

const STOPPWOERTER = new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer',
  'und', 'oder', 'aber', 'im', 'in', 'am', 'an', 'auf', 'fuer', 'für', 'von', 'vom', 'zu', 'zum', 'zur', 'mit',
  'ist', 'sind', 'war', 'wird', 'werden', 'soll', 'sollen', 'muss', 'muessen', 'müssen', 'noch', 'mal', 'bitte',
  'wir', 'ich', 'du', 'er', 'sie', 'es', 'man', 'nicht', 'auch', 'schon', 'dann', 'wenn', 'bei', 'nach', 'vor']);

/** Wortstamm nach deutschen Endungen - grob, aber ohne Fremdpaket und nachvollziehbar. */
export function stamm(wort) {
  let w = wort.toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
  for (const endung of ['ungen', 'ung', 'chen', 'lein', 'isch', 'lich', 'igen', 'ten', 'end', 'est', 'ern', 'en', 'er', 'es', 'em', 'st', 'e', 'n', 's']) {
    if (w.length > endung.length + 3 && w.endsWith(endung)) { w = w.slice(0, -endung.length); break; }
  }
  return w;
}

/** Woerter, die im Betrieb dasselbe meinen - sonst faende die Duplikatsuche nichts. */
const SYNONYME = [
  ['shop', 'shopify', 'onlineshop', 'webshop', 'website', 'webseite', 'seite'],
  ['austausch', 'tausch', 'wechsel', 'andern', 'anpass', 'einbau', 'ersetz', 'aktualisier'],
  ['preis', 'kost', 'betrag', 'euro'],
  ['prufen', 'prufung', 'kontrollier', 'check', 'nachsehen', 'schauen'],
  ['bestell', 'order', 'ordern'],
  ['kunde', 'kundin', 'kundschaft'],
  ['muster', 'probe'],
];
const SYNONYM_INDEX = new Map();
for (const [i, gruppe] of SYNONYME.entries()) for (const w of gruppe) SYNONYM_INDEX.set(w, `syn${i}`);

function kanon(st) {
  for (const [wort, gruppe] of SYNONYM_INDEX) if (st.startsWith(wort)) return gruppe;
  return st;
}

export function begriffe(text) {
  return new Set(String(text || '')
    .toLowerCase()
    .split(/[^a-zA-ZäöüÄÖÜß0-9]+/)
    .filter(w => w.length > 2 && !STOPPWOERTER.has(w))
    .map(w => kanon(stamm(w))));
}

/** Aehnlichkeit zweier Texte, 0..1 (Jaccard ueber kanonisierte Wortstaemme). */
export function aehnlichkeit(a, b) {
  const A = begriffe(a); const B = begriffe(b);
  if (!A.size || !B.size) return 0;
  let schnitt = 0;
  for (const w of A) if (B.has(w)) schnitt += 1;
  return schnitt / (A.size + B.size - schnitt);
}

/**
 * Moegliche Doppelgaenger: offene oder kuerzlich erledigte Aufgaben mit
 * aehnlichem Text. Wird nie automatisch zusammengefuehrt - die Entscheidung
 * trifft ein Mensch.
 */
export function findeDoppelgaenger(text, vorhandene, { jetzt = new Date(), schwelle = 0.34, tageZurueck = 30 } = {}) {
  const grenze = new Date(jetzt.getTime() - tageZurueck * TAG_MS).toISOString();
  return vorhandene
    .filter(t => t.typ === 'TASK')
    .filter(t => t.status !== 'DONE' || (t.erledigtAm && t.erledigtAm >= grenze))
    .map(t => ({ eintrag: t, wert: aehnlichkeit(text, `${t.titel} ${t.beschreibung || ''}`) }))
    .filter(x => x.wert >= schwelle)
    .sort((a, b) => b.wert - a.wert)
    .slice(0, 5);
}
