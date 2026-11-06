/** Gemeinsame Grenzen fuer Auswahl, Vorschau und den physischen Drucktransport. */
export const DRUCK_LIMIT = Object.freeze({ positionen: 1000, etiketten: 5000, transport: 100, vorschau: 12 });

/** Web Crypto bleibt auch im privaten HTTP-Netz verfuegbar, randomUUID dagegen nicht ueberall. */
export function neueKennung(krypto = globalThis.crypto) {
  if (typeof krypto?.randomUUID === 'function') return krypto.randomUUID();
  if (typeof krypto?.getRandomValues !== 'function') throw new Error('Dieser Browser kann keine sichere Vorgangskennung erzeugen. Bitte einen aktuellen Browser verwenden.');
  const b = krypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(n => n.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Identische Kopien erhalten eine gemeinsame Vorschau; gedruckt wird weiterhin jedes Stueck. */
/** Gleiche Angaben = gleiches Motiv; Vorschau und Auswahl zum Drucken fassen damit Kopien zusammen. */
export const motivSchluessel = e => JSON.stringify([e.serie, e.farbe, e.sku, e.url, e.technik, e.fehlt, ...(e.schriften ? [e.schriften] : [])]);

export function druckVorschau(etiketten = []) {
  const je = new Map();
  for (const [index, e] of etiketten.entries()) {
    const key = motivSchluessel(e);
    const alt = je.get(key);
    if (alt) alt.anzahl++;
    else je.set(key, { index, anzahl: 1 });
  }
  return { motive: je.size, eintraege: [...je.values()].slice(0, DRUCK_LIMIT.vorschau) };
}

/**
 * Stueckzahl eines Motivs setzen. Die Kopien bleiben an der Stelle des Motivs zusammen,
 * andere Motive behalten Reihenfolge und Menge. Ungueltige Werte aendern nichts.
 */
export function setzeMotivAnzahl(etiketten = [], schluessel, anzahl) {
  const treffer = etiketten.filter(e => motivSchluessel(e) === schluessel);
  if (!treffer.length || !Number.isInteger(anzahl) || anzahl < 1) return etiketten;
  const n = Math.min(anzahl, DRUCK_LIMIT.etiketten - (etiketten.length - treffer.length));
  const neu = [];
  let eingefuegt = false;
  for (const e of etiketten) {
    if (motivSchluessel(e) !== schluessel) { neu.push(e); continue; }
    if (!eingefuegt) { for (let i = 0; i < n; i++) neu.push(treffer[0]); eingefuegt = true; }
  }
  return neu;
}

/** Kleine Transportauftraege begrenzen den Druckerpuffer, ohne Kopien zu verlieren. */
export function* druckBloecke(etiketten = []) {
  for (let start = 0; start < etiketten.length; start += DRUCK_LIMIT.transport) {
    yield { start, etiketten: etiketten.slice(start, start + DRUCK_LIMIT.transport) };
  }
}

/**
 * Weiterdrucken nach einem Abbruch (06.11.2026: der B1 brach nach 12 von 13 Aufklebern mit
 * "DataError" ab, der Rest musste von Hand neu eingetippt werden).
 *
 * Ab welchem Aufkleber (0-basiert) es weitergeht: Meldet der Drucker im Statusabruf schon fertige
 * Seiten, zaehlt das; sonst die Seiten, die vollstaendig an den Drucker gingen. Lieber einen
 * Aufkleber doppelt als einen zu wenig - deshalb nie mehr als gesendet. 0 = nichts zum Weiterdrucken
 * (alles neu drucken), ebenso wenn schon alles draussen ist.
 * @param {{gesendet: number, gedruckt?: number|null, gesamt: number}} stand
 */
export function weiterAbSchaetzen({ gesendet = 0, gedruckt = null, gesamt = 0 } = {}) {
  const n = Math.trunc(Number(gesamt)) || 0;
  const s = Math.max(0, Math.trunc(Number(gesendet)) || 0);
  const g = gedruckt === null || gedruckt === undefined ? s : Math.min(s, Math.max(0, Math.trunc(Number(gedruckt)) || 0));
  return g > 0 && g < n ? g : 0;
}

/** Fertig gedruckte Seiten aus einer printprogress-Meldung: die laufende Seite zaehlt erst, wenn sie ganz draussen ist. */
export const fertigeSeiten = ({ page = 0, pagePrintProgress = 0, pageFeedProgress = 0 } = {}) =>
  Math.max(0, (Math.trunc(Number(page)) || 0) - (pagePrintProgress >= 100 && pageFeedProgress >= 100 ? 0 : 1));

/** Kennung einer Auswahl: Weiterdrucken gilt nur, solange dieselben Aufkleber in derselben Reihenfolge gewaehlt sind. */
export const auswahlSignatur = (etiketten = []) => `${etiketten.length}:${etiketten.map(motivSchluessel).join('\u0001')}`;

/**
 * Gueltiger Startpunkt zum Weiterdrucken fuer die aktuelle Auswahl, sonst 0.
 * @param {object[]} alle   alle gewaehlten Aufkleber in Druckreihenfolge
 * @param {{ab: number, signatur: string}|null} weiter
 */
export function weiterAbFuer(alle = [], weiter = null) {
  if (!weiter || !(weiter.ab > 0) || weiter.ab >= alle.length) return 0;
  return weiter.signatur === auswahlSignatur(alle) ? Math.trunc(weiter.ab) : 0;
}
