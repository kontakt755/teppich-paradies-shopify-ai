/**
 * Wie alt duerfen die Betriebsdaten sein? Eine Grenze je Quelle aus aktualisierung.json.
 *
 * Gilt im Server (scripts/dashboard-api.mjs setzt damit `veraltet` je Teil) und in der
 * Oberflaeche (Zeile "Stand: vor 3 Min." und der Hinweis fuer alle, wenn eine Quelle zu alt ist).
 * Reine Funktionen ohne DOM und ohne Netz.
 *
 * Die Grenzen folgen dem Takt des Sync-Dienstes (operations/scripts/sync-dienst.mjs): Bestellungen,
 * Kunden, Angebote und Warenkoerbe kommen alle 10 Minuten, Lexikon und Lagerbestand stuendlich.
 * Drei verpasste Laeufe sind kein Zufall mehr - dann soll es jemand merken.
 */

const MIN = 60_000;
const STD = 60 * MIN;

export const DATENSTAND_GRENZEN_MS = Object.freeze({
  bestellungen: 30 * MIN,
  kunden: 30 * MIN,
  angebote: 30 * MIN,
  warenkoerbe: 30 * MIN,
  kennzahlen: 2 * STD,
  lexikon: 24 * STD,
  bestand: 24 * STD,
});
/** Fuer Quellen ohne eigene Grenze (neue Teile) - die fruehere Pauschale. */
export const DATENSTAND_GRENZE_STANDARD_MS = 24 * STD;

/** Namen fuer Menschen - dieselben Woerter wie im Menue (docs/control-center/BEGRIFFE.md). */
export const DATENSTAND_LABEL = Object.freeze({
  bestellungen: 'Bestellungen', kunden: 'Kunden', angebote: 'Angebote', warenkoerbe: 'Warenkörbe',
  kennzahlen: 'Kennzahlen', lexikon: 'Lexikon', bestand: 'Lagerbestand',
});

/** Welche Quelle zeigt eine Seite? Ihr Alter steht oben als "Stand: …". */
const SEITEN_QUELLE = Object.freeze({
  heute: 'bestellungen', kunden: 'kunden', einkauf: 'bestellungen', lexikon: 'lexikon', insights: 'kennzahlen',
});
export function quelleFuerSeite(view) { return SEITEN_QUELLE[view] || null; }

export function grenzeFuer(teil) {
  return DATENSTAND_GRENZEN_MS[teil] ?? DATENSTAND_GRENZE_STANDARD_MS;
}

/** true/false nach Grenze; null, wenn der Zeitpunkt fehlt oder unlesbar ist. */
export function istVeraltet(teil, zeitpunkt, jetzt = new Date()) {
  const t = zeitpunkt ? new Date(zeitpunkt).getTime() : NaN;
  if (!Number.isFinite(t)) return null;
  return jetzt.getTime() - t > grenzeFuer(teil);
}

/** "gerade eben", "vor 3 Min.", "vor 2 Stunden", "vor 3 Tagen". */
export function vorText(zeitpunkt, jetzt = new Date()) {
  const t = zeitpunkt ? new Date(zeitpunkt).getTime() : NaN;
  if (!Number.isFinite(t)) return 'unbekannt';
  const ms = Math.max(0, jetzt.getTime() - t);
  if (ms < MIN) return 'gerade eben';
  if (ms < STD) return `vor ${Math.floor(ms / MIN)} Min.`;
  if (ms < 48 * STD) { const h = Math.floor(ms / STD); return `vor ${h} ${h === 1 ? 'Stunde' : 'Stunden'}`; }
  return `vor ${Math.floor(ms / (24 * STD))} Tagen`;
}

/** "seit 40 Min.", "seit einer Stunde", "seit 3 Tagen" - fuer den Hinweissatz. */
export function seitText(zeitpunkt, jetzt = new Date()) {
  const t = zeitpunkt ? new Date(zeitpunkt).getTime() : NaN;
  if (!Number.isFinite(t)) return 'seit unbekannter Zeit nicht';
  const ms = Math.max(0, jetzt.getTime() - t);
  if (ms < STD) return `seit ${Math.max(1, Math.floor(ms / MIN))} Min.`;
  if (ms < 48 * STD) { const h = Math.floor(ms / STD); return h === 1 ? 'seit einer Stunde' : `seit ${h} Stunden`; }
  return `seit ${Math.floor(ms / (24 * STD))} Tagen`;
}

/**
 * Quellen, deren letzter ERFOLGREICHER Stand aelter als ihre Grenze ist. Ein fehlgeschlagener
 * Lauf ohne frueheren Erfolg zaehlt ebenfalls (die Daten sind dann gar nicht frisch).
 * Antwort von /api/aktualisierung als Eingabe; ohne Datei oder ohne Teile: leere Liste.
 */
export function veralteteQuellen(aktualisierung, jetzt = new Date()) {
  if (!aktualisierung?.verfuegbar) return [];
  return Object.entries(aktualisierung.teile || {})
    .filter(([teil, s]) => DATENSTAND_LABEL[teil] && s && (s.erfolg || s.letzterFehler || s.zeitpunkt))
    .map(([teil, s]) => ({ teil, label: DATENSTAND_LABEL[teil], zeitpunkt: s.erfolg ? s.zeitpunkt : null, grenzeMs: grenzeFuer(teil) }))
    .filter(q => q.zeitpunkt === null || istVeraltet(q.teil, q.zeitpunkt, jetzt))
    .map(q => ({ ...q, seit: q.zeitpunkt ? `${seitText(q.zeitpunkt, jetzt)} nicht` : 'gerade nicht' }));
}

/** Ein Satz fuer alle: "Bestellungen sind seit 2 Stunden nicht aktualisiert – Inhaber Bescheid geben." */
export function hinweisSatz(veraltet, { inhaber = false } = {}) {
  if (!veraltet.length) return '';
  const handlung = inhaber ? 'bitte den Sync-Dienst prüfen.' : 'bitte dem Inhaber Bescheid geben.';
  if (veraltet.length === 1) {
    const q = veraltet[0];
    return `${q.label} ${q.label === 'Lexikon' || q.label === 'Lagerbestand' ? 'ist' : 'sind'} ${q.seit} aktualisiert – ${handlung}`;
  }
  // Der aelteste Stand bestimmt den Satz - "seit 2 Stunden" sagt mehr als "nicht mehr aktuell".
  const aeltester = [...veraltet].sort((a, b) => String(a.zeitpunkt || '').localeCompare(String(b.zeitpunkt || '')))[0];
  return `${veraltet.map(q => q.label).join(', ')} sind ${aeltester.seit} aktualisiert – ${handlung}`;
}

/** To-do fuer den Inhaber, solange eine Quelle veraltet ist. Verschwindet von selbst. */
export function datenstandTodo(veraltet) {
  if (!veraltet.length) return [];
  const kritisch = veraltet.some(q => ['bestellungen', 'kunden'].includes(q.teil));
  return [{
    id: 'datenstand', art: 'datenstand', bereich: 'laden', ton: kritisch ? 'crit' : 'warn', alterTage: null,
    titel: `Daten-Abgleich prüfen: ${veraltet.map(q => q.label).join(', ')} nicht aktuell`,
    kontext: `${veraltet.map(q => `${q.label} ${q.seit} aktualisiert`).join(' · ')} – Sync-Dienst oder Shopify-Zugang prüfen`,
    knopf: { text: 'Ansehen', href: '#/insights' },
  }];
}
