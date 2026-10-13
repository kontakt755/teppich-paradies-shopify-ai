/**
 * Lokaler Auftragsfluss-Status je Bestellposition (Einkauf-Tab).
 *
 * Rein lokale Ablage unter $TP_PRIVAT_DIR/auftragsstatus.json - nie im
 * Repository, nie auf GitHub Pages. Schluessel ist orderId + lineItemId,
 * damit jede Position (nicht nur jeder Auftrag) einzeln durch den Ablauf
 * "Bestellt -> Geliefert an uns -> An Kunden raus -> Erledigt" laeuft.
 *
 * Schreiben ist atomar (tmp-Datei + rename) und schreibt bei jedem Aufruf
 * den ganzen Datensatz der Position neu - "last write wins" je Schluessel,
 * bewusst ohne Merge zwischen gleichzeitigen Schreibern auf denselben
 * Schluessel (siehe CLAUDE.md "Auftragsstatus").
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const STATUS_ORDER = Object.freeze(['bestellt', 'geliefert', 'raus', 'erledigt']);

export const STATUS_LABEL = Object.freeze({
  bestellt: 'Bestellt',
  geliefert: 'Geliefert an uns',
  raus: 'An Kunden raus',
  erledigt: 'Erledigt',
});

/** Filtergruppen fuer die Uebersicht: offen / bestellt / unterwegs / erledigt. */
export function filterGruppe(status) {
  if (!status) return 'offen';
  if (status === 'bestellt') return 'bestellt';
  if (status === 'geliefert' || status === 'raus') return 'unterwegs';
  if (status === 'erledigt') return 'erledigt';
  return 'offen';
}

export function positionKey(orderId, lineItemId) {
  const o = String(orderId ?? '').trim();
  const l = String(lineItemId ?? '').trim();
  if (!o || !l) return null;
  return `${o}::${l}`;
}

export function auftragsstatusPfad(privatDir) {
  return path.join(privatDir || defaultPrivatDir(), 'auftragsstatus.json');
}

function defaultPrivatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

/**
 * Liest die Statusdatei; fehlende Datei ist kein Fehler, sondern leerer Zustand.
 *
 * Nur das Fehlen gilt als leer. Eine unlesbare oder beschaedigte Datei wirft -
 * frueher kam dann {} zurueck, und der naechste Klick auf "→ Bestellt" schrieb
 * eine Datei mit genau dieser einen Position: der Stand aller anderen war weg.
 */
export function leseAlle(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e?.code === 'ENOENT') return {};
    throw new Error(`${path.basename(file)} ist nicht lesbar (${e?.code || e?.message}) – bitte aus der Sicherung holen`);
  }
  if (!text.trim()) return {};
  let raw;
  try { raw = JSON.parse(text); } catch {
    throw new Error(`${path.basename(file)} ist beschädigt – bitte aus der Sicherung holen (npm run daten:sichern legt sie an)`);
  }
  return raw && typeof raw === 'object' && raw.positionen && typeof raw.positionen === 'object' ? raw.positionen : {};
}

/** Atomarer Schreibvorgang: tmp-Datei im selben Verzeichnis, dann rename. */
export function schreibeAlle(file, positionen) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, positionen }, null, 2));
  fs.renameSync(tmp, file);
}

export class AuftragsstatusFehler extends Error {}

/** Begrenzt Freitext (Bestellnummer, Notiz) auf eine sinnvolle Laenge - sonst kann ein
 *  versehentlich sehr langer Text (Copy-Paste-Unfall) die gemeinsame Datei und die Anzeige
 *  im Control Center sprengen. */
function clip(text, max) {
  const s = String(text ?? '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Setzt den Status einer Position und schreibt sofort. Gibt den neuen
 * Datensatz der Position zurueck.
 *
 * @param {string} file
 * @param {object} p
 * @param {string} p.orderId
 * @param {string} p.lineItemId
 * @param {string} p.status          einer aus STATUS_ORDER
 * @param {string} p.actor           gh-Login, der die Aktion ausgeloest hat
 * @param {string} [p.lieferantBestellnummer]  Freitext, nur bei "bestellt" sinnvoll
 * @param {string} [p.notiz]
 * @param {string} [p.sendungsnummer]  nur bei "raus": Sendungsnummer des Pakets (geht mit der Versandbuchung an Shopify)
 * @param {string} [p.versanddienst]   nur bei "raus", z. B. "GLS"
 * @param {Date}   [p.jetzt]
 */
export function setzeStatus(file, { orderId, lineItemId, status, actor, lieferantBestellnummer = null, notiz = null, sendungsnummer = null, versanddienst = null, jetzt = new Date() } = {}) {
  const key = positionKey(orderId, lineItemId);
  if (!key) throw new AuftragsstatusFehler('orderId und lineItemId sind Pflicht');
  if (!STATUS_ORDER.includes(status)) throw new AuftragsstatusFehler(`Unbekannter Status "${status}"`);
  if (!actor) throw new AuftragsstatusFehler('actor (gh-Login) ist Pflicht');

  const alle = leseAlle(file);
  const bisher = alle[key] || {};
  const zeit = jetzt.toISOString();
  const eintrag = {
    ...bisher,
    orderId: String(orderId),
    lineItemId: String(lineItemId),
    status,
    aktualisiertAm: zeit,
    aktualisiertVon: actor,
    [`${status}Am`]: zeit,
    [`${status}Von`]: actor,
  };
  if (status === 'bestellt') {
    eintrag.lieferantBestellnummer = lieferantBestellnummer ? clip(lieferantBestellnummer, 200) : (bisher.lieferantBestellnummer || null);
  }
  if (notiz) eintrag[`${status}Notiz`] = clip(notiz, 2000);
  if (status === 'raus') {
    // Kommt die Position von einem Schritt davor, ist es ein neuer Versand: Nummer und
    // Buchungsvermerk eines frueheren Durchlaufs gelten nicht mehr. Ein zweiter Klick auf
    // "raus" (oder die Korrektur von "erledigt" zurueck) ist dieselbe Sendung - der Vermerk
    // bleibt, damit niemand doppelt bucht.
    const neuerVersand = STATUS_ORDER.indexOf(bisher.status) < STATUS_ORDER.indexOf('raus');
    if (neuerVersand || sendungsnummer) {
      eintrag.sendungsnummer = sendungsnummer ? clip(sendungsnummer, 60) : null;
      eintrag.versanddienst = sendungsnummer && versanddienst ? clip(versanddienst, 40) : null;
    }
    if (neuerVersand) delete eintrag.shopifyVersand;
  }

  alle[key] = eintrag;
  schreibeAlle(file, alle);
  return eintrag;
}

/**
 * Haengt das Ergebnis der Versandbuchung in Shopify an eine Position (operations/lib/versand.mjs),
 * ohne ihren Schritt zu aendern. `vermerk`: { status: gebucht|bereits|fehler|unklar|uebersprungen,
 * grund?, meldung?, am, fulfillmentId?, kundeBenachrichtigt? }. Daran erkennt das Control Center,
 * dass die Position seit der Einfuehrung (13.10.) gebucht wurde - aeltere tragen keinen Vermerk und
 * werden nie nachtraeglich gebucht.
 */
export function vermerkeShopifyVersand(file, { orderId, lineItemId, vermerk } = {}) {
  const key = positionKey(orderId, lineItemId);
  if (!key) throw new AuftragsstatusFehler('orderId und lineItemId sind Pflicht');
  const alle = leseAlle(file);
  const bisher = alle[key];
  if (!bisher) return null;
  const v = vermerk || {};
  const eintrag = {
    ...bisher,
    shopifyVersand: {
      status: String(v.status || 'fehler'),
      grund: v.grund ? String(v.grund) : null,
      meldung: v.meldung ? clip(v.meldung, 400) : null,
      am: v.am || new Date().toISOString(),
      fulfillmentId: v.fulfillmentId || null,
      kundeBenachrichtigt: v.kundeBenachrichtigt === undefined ? null : Boolean(v.kundeBenachrichtigt),
    },
  };
  alle[key] = eintrag;
  schreibeAlle(file, alle);
  return eintrag;
}

/**
 * Schritt, auf den eine erledigte Position beim Wiederoeffnen zurueckfaellt: der letzte
 * Schritt vor "Erledigt", der im Datensatz belegt ist (z. B. "An Kunden raus"), sonst
 * gar keiner (= noch nicht bestellt, typisch nach "Ohne Einkauf abschliessen").
 * Nur Zeitstempel VOR dem Abschluss zaehlen - so bleibt ein Schritt aus einem
 * frueheren Durchlauf nicht faelschlich haengen.
 */
export function statusVorErledigt(eintrag) {
  if (!eintrag) return null;
  const bis = eintrag.erledigtAm || '';
  for (const s of ['raus', 'geliefert', 'bestellt']) {
    const am = eintrag[`${s}Am`];
    if (am && (!bis || am <= bis)) return s;
  }
  return null;
}

/**
 * Oeffnet eine erledigte Position wieder (macht "Ohne Einkauf abschliessen" oder einen
 * versehentlichen Abschluss rueckgaengig). Der Abschluss wird nicht geloescht, sondern
 * wandert mit Zeitpunkt, Person und Grund in `verlauf` - wer wann was getan hat, bleibt
 * nachvollziehbar. Nur Positionen im Status "erledigt" lassen sich wieder oeffnen.
 *
 * @param {string} file
 * @param {object} p
 * @param {string} p.orderId
 * @param {string} p.lineItemId
 * @param {string} p.actor
 * @param {string} [p.notiz]
 * @param {Date}   [p.jetzt]
 */
export function oeffneWieder(file, { orderId, lineItemId, actor, notiz = null, jetzt = new Date() } = {}) {
  const key = positionKey(orderId, lineItemId);
  if (!key) throw new AuftragsstatusFehler('orderId und lineItemId sind Pflicht');
  if (!actor) throw new AuftragsstatusFehler('actor (gh-Login) ist Pflicht');

  const alle = leseAlle(file);
  const bisher = alle[key];
  if (!bisher || bisher.status !== 'erledigt') throw new AuftragsstatusFehler('Nur erledigte Positionen lassen sich wieder öffnen');
  const zeit = jetzt.toISOString();
  const zurueck = statusVorErledigt(bisher);
  const { erledigtAm, erledigtVon, erledigtNotiz, ...rest } = bisher;
  const protokoll = { aktion: 'wieder geöffnet', am: zeit, von: actor, zurueckAuf: zurueck, abgeschlossenAm: erledigtAm || null, abgeschlossenVon: erledigtVon || null, abschlussGrund: erledigtNotiz || null };
  if (notiz) protokoll.notiz = clip(notiz, 2000);
  const eintrag = {
    ...rest,
    status: zurueck,
    aktualisiertAm: zeit,
    aktualisiertVon: actor,
    wiederGeoeffnetAm: zeit,
    wiederGeoeffnetVon: actor,
    // Begrenzen, damit eine oft hin- und hergeschobene Position die Datei nicht aufblaeht.
    verlauf: [...(Array.isArray(bisher.verlauf) ? bisher.verlauf : []), protokoll].slice(-20),
  };
  alle[key] = eintrag;
  schreibeAlle(file, alle);
  return eintrag;
}

/**
 * Setzt eine Position von jedem Schritt (bestellt/geliefert/raus/erledigt) zurueck auf
 * "noch zu bestellen" - fuer Versehen wie "als bestellt markiert, aber nie bestellt".
 * Nichts geht verloren: der bisherige Stand (Schritte mit Zeit/Person/Notiz,
 * Lieferanten-Bestellnummer) wandert mit wer/wann/von-welchem-Status in `verlauf`.
 * Die Schrittfelder verschwinden aus dem Datensatz, damit ein spaeterer neuer Durchlauf
 * (Wartezeit, statusVorErledigt) nicht mit alten Zeitstempeln rechnet.
 * Gibt null zurueck, wenn die Position schon offen ist (Sammelaktionen ueberspringen sie).
 *
 * @param {string} file
 * @param {object} p
 * @param {string} p.orderId
 * @param {string} p.lineItemId
 * @param {string} p.actor
 * @param {string} [p.notiz]
 * @param {Date}   [p.jetzt]
 */
export function setzeZurueckAufOffen(file, { orderId, lineItemId, actor, notiz = null, jetzt = new Date() } = {}) {
  const key = positionKey(orderId, lineItemId);
  if (!key) throw new AuftragsstatusFehler('orderId und lineItemId sind Pflicht');
  if (!actor) throw new AuftragsstatusFehler('actor (gh-Login) ist Pflicht');
  const alle = leseAlle(file);
  const bisher = alle[key];
  if (!bisher || !bisher.status) return null;
  const zeit = jetzt.toISOString();
  const vorher = {};
  const rest = { ...bisher };
  for (const s of STATUS_ORDER) {
    for (const feld of [`${s}Am`, `${s}Von`, `${s}Notiz`]) {
      if (rest[feld] !== undefined) { vorher[feld] = rest[feld]; delete rest[feld]; }
    }
  }
  if (rest.lieferantBestellnummer) vorher.lieferantBestellnummer = rest.lieferantBestellnummer;
  delete rest.lieferantBestellnummer;
  // Versandangaben gehoeren zum alten Durchlauf. Eine Buchung in Shopify bleibt dort bestehen;
  // hier wandert nur der Vermerk in den Verlauf.
  for (const feld of ['sendungsnummer', 'versanddienst', 'shopifyVersand']) {
    if (rest[feld] !== undefined && rest[feld] !== null) vorher[feld] = rest[feld];
    delete rest[feld];
  }
  const protokoll = { aktion: 'zurück auf offen', am: zeit, von: actor, vonStatus: bisher.status, vorher };
  if (notiz) protokoll.notiz = clip(notiz, 2000);
  const eintrag = {
    ...rest,
    orderId: String(orderId),
    lineItemId: String(lineItemId),
    status: null,
    aktualisiertAm: zeit,
    aktualisiertVon: actor,
    zurueckGesetztAm: zeit,
    zurueckGesetztVon: actor,
    zurueckGesetztVonStatus: bisher.status,
    verlauf: [...(Array.isArray(bisher.verlauf) ? bisher.verlauf : []), protokoll].slice(-20),
  };
  alle[key] = eintrag;
  schreibeAlle(file, alle);
  return eintrag;
}
