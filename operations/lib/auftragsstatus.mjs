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
import { darfWeiter, beschaffungsStand } from '../../docs/ai-dashboard/lib/beschaffung.mjs';

export const STATUS_ORDER = Object.freeze(['bestellt', 'geliefert', 'raus', 'erledigt']);

/**
 * Vermerk "ueber": welchen Weg die Ware geht (Lieferweg, docs/ai-dashboard/lib/lieferweg.mjs).
 * 'kettler' = Ware geht erst an unseren Kettelservice (#1453), 'kunde' = der Lieferant schickt
 * direkt an den Kunden: Muster (Herstellermuster, Lieferziel "Kunden" in der Bestellmail) oder
 * Ware mit Lieferziel Kunde/Baustelle, 'laden' = der Lieferant liefert zu uns (seit 06.11.2026),
 * 'lager' = wir schneiden aus eigener Lagerrolle zu und verschicken selbst (gesetzt von
 * "Zugeschnitten", setzeSelbstversand).
 */
export const UEBER_WERTE = Object.freeze(['kettler', 'kunde', 'laden', 'lager']);

/** Schritte vor dem Versand, die wir bei eigener Ware abhaken (Unterobjekt `selbstversand`). */
export const SELBST_SCHRITTE = Object.freeze(['zugeschnitten', 'gepackt']);

/**
 * Ungueltiges Unterobjekt `selbstversand`? Jeder Schritt ist null oder { am, von } (Text), "vorher"
 * ein Schritt oder null, "ueberVorher" (Vermerk vor "Zugeschnitten") einer aus UEBER_WERTE oder null.
 */
function selbstversandKaputt(sv) {
  if (sv == null) return false;
  if (typeof sv !== 'object' || Array.isArray(sv)) return true;
  return Object.entries(sv).some(([k, v]) => {
    if (!SELBST_SCHRITTE.includes(k)) return true;
    if (v == null) return false;
    if (typeof v !== 'object' || Array.isArray(v) || typeof v.am !== 'string' || typeof v.von !== 'string') return true;
    return (v.vorher != null && !STATUS_ORDER.includes(v.vorher)) || (v.ueberVorher != null && !UEBER_WERTE.includes(v.ueberVorher));
  });
}

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
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.positionen || typeof raw.positionen !== 'object' || Array.isArray(raw.positionen)
    || Object.values(raw.positionen).some(e => {
      if (!e || typeof e !== 'object' || Array.isArray(e)) return true;
      if (e.uebernahme != null && (typeof e.uebernahme !== 'object' || Array.isArray(e.uebernahme) || typeof e.uebernahme.id !== 'string' || typeof e.uebernahme.person !== 'string')) return true;
      if (selbstversandKaputt(e.selbstversand)) return true;
      const b = e.beschaffung;
      if (b != null && (typeof b !== 'object' || Array.isArray(b))) return true;
      if (b?.liefertermin != null && (typeof b.liefertermin !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.liefertermin) || !Number.isFinite(Date.parse(b.liefertermin)) || new Date(b.liefertermin).toISOString().slice(0, 10) !== b.liefertermin)) return true;
      if (b?.grund != null && typeof b.grund !== 'string') return true;
      if (['bestaetigtAm', 'bestaetigtVon'].some(k => b?.[k] != null && typeof b[k] !== 'string')) return true;
      // Lieferantenstand (operations/lib/beschaffung.mjs, setzeLieferantenstand): Anfrage, Bestelldaten, AB.
      const unterobjektKaputt = (o, textfelder) => o != null && (typeof o !== 'object' || Array.isArray(o) || textfelder.some(k => o[k] != null && typeof o[k] !== 'string'));
      if (unterobjektKaputt(b?.anfrage, ['am', 'lieferant', 'notiz', 'erfasstAm', 'erfasstVon']) || (b?.anfrage && typeof b.anfrage.am !== 'string')) return true;
      if (unterobjektKaputt(b?.bestellung, ['lieferwegOffen', 'notiz', 'erfasstAm', 'erfasstVon'])) return true;
      if (unterobjektKaputt(b?.ab, ['nummer', 'preis', 'belegId', 'link', 'abweichung', 'geprueftAm', 'geprueftVon']) || (b?.ab && (typeof b.ab.nummer !== 'string' || (b.ab.pruefung != null && (typeof b.ab.pruefung !== 'object' || Array.isArray(b.ab.pruefung)))))) return true;
      const w = b?.wareneingang;
      return w != null && (typeof w !== 'object' || Array.isArray(w) || !(w.soll > 0) || !['paket', 'stueck', 'muster', 'lfm', 'm2'].includes(w.einheit) || ['bestaetigtAm', 'bestaetigtVon'].some(k => w[k] != null && typeof w[k] !== 'string') || ['soll', 'angekommen', 'verwendbar'].some(k => !Number.isFinite(w[k]) || w[k] < 0) || w.verwendbar > w.angekommen || w.angekommen > w.soll);
    })) {
    throw new Error(`${path.basename(file)} ist beschädigt (ungültiges Positionsformat) – bitte aus der Sicherung holen`);
  }
  return raw.positionen;
}

/** Atomarer Schreibvorgang: tmp-Datei im selben Verzeichnis, dann rename. */
export function schreibeAlle(file, positionen) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, positionen }, null, 2));
  fs.renameSync(tmp, file);
}

export class AuftragsstatusFehler extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

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
 * @param {boolean} [p.versandMail]    nur bei "raus": bekommt der Kunde die Versandmail? (gilt auch beim Nachholen)
 * @param {'kettler'|'kunde'|null} [p.ueber]  nur bei "bestellt", Werte siehe UEBER_WERTE.
 *                                     null nimmt den Vermerk zurueck, ohne Angabe bleibt er, wie er war.
 * @param {Date}   [p.jetzt]
 */
function bereiteStatusVor(alle, { orderId, lineItemId, status, actor, bestellmenge, lieferantBestellnummer = null, notiz = null, sendungsnummer = null, versanddienst = null, versandMail = null, ueber, jetzt = new Date() } = {}) {
  const key = positionKey(orderId, lineItemId);
  if (!key) throw new AuftragsstatusFehler('orderId und lineItemId sind Pflicht');
  if (!STATUS_ORDER.includes(status)) throw new AuftragsstatusFehler(`Unbekannter Status "${status}"`);
  if (!actor) throw new AuftragsstatusFehler('actor (gh-Login) ist Pflicht');

  const bisher = alle[key] || {};
  if (bisher.uebernahme?.id === 'musterautomatik' && actor !== 'Musterautomatik') throw new AuftragsstatusFehler('Automatischer Mailversand läuft oder ist ungeklärt. Vor manueller Bestellung im Postfach prüfen und die Arbeit bewusst übernehmen.', 409);
  const stand = bestellmenge === undefined ? bisher : beschaffungsStand(bisher, bestellmenge);
  if (!darfWeiter(stand, status)) throw new AuftragsstatusFehler(stand.beschaffung?.klaerung || 'Die bestätigte Fehlmenge ist noch offen. Zuerst den Wareneingang vervollständigen.', 409);
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
    if (ueber !== undefined) eintrag.ueber = UEBER_WERTE.includes(ueber) ? ueber : null;
    // Beim Lieferanten Bestelltes kommt nie "aus Lager" - der Vermerk gehoert zu "Zugeschnitten".
    if (eintrag.ueber === 'lager') eintrag.ueber = null;
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
    if (typeof versandMail === 'boolean') eintrag.versandMail = versandMail;
    else if (neuerVersand) delete eintrag.versandMail;
  }
  // "Erledigt" bucht den Versand in Shopify ohne Mail an den Kunden (Inhaber 2026-10-19,
  // shopify-abgleich.mjs): wer abschliesst, hat die Ware beim Kunden - eine Mail "ist unterwegs"
  // verwirrt. Ausnahme seit 07.11.2026 (w-276): Ware, die "raus" uebersprungen hat, darf die
  // Versandmail bekommen, wenn die Rueckfrage sie angehakt laesst - dann kommt `versandMail: true`
  // (die Regel prueft der Aufrufer, lib/versand.mjs erledigtMitMailMoeglich). Die Wahl gilt auch,
  // wenn die Buchung erst spaeter nachgeholt wird. Eine schon gebuchte Sendung behaelt ihre damalige Wahl.
  if (status === 'erledigt' && !['gebucht', 'bereits'].includes(bisher.shopifyVersand?.status)) eintrag.versandMail = versandMail === true;

  alle[key] = eintrag;
  return eintrag;
}

/** Sammelschritte pruefen alle Positionen am selben frischen Stand und schreiben genau einmal. */
export function bereiteStatusPositionenVor(file, angaben) {
  const positionen = leseAlle(file);
  const eintraege = angaben.map(p => bereiteStatusVor(positionen, p));
  return { positionen, eintraege };
}

export function setzeStatusPositionen(file, angaben) {
  const vorbereitet = bereiteStatusPositionenVor(file, angaben);
  if (vorbereitet.eintraege.length) schreibeAlle(file, vorbereitet.positionen);
  return vorbereitet.eintraege;
}

export function setzeStatus(file, angaben = {}) {
  return setzeStatusPositionen(file, [angaben])[0];
}

/**
 * Haengt das Ergebnis der Versandbuchung in Shopify an eine Position (operations/lib/versand.mjs),
 * ohne ihren Schritt zu aendern. `vermerk`: { status: gebucht|bereits|fehler|unklar|uebersprungen|ausstehend,
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
 * Vermerkt nachtraeglich "direkt vom Lieferanten zum Kunden" (ueber 'kunde') an einer bestellten Position,
 * ohne Schritt und Bestelldatum zu aendern - fuer Bestellungen vor dem Vermerk im Bestellmail-Dialog (#1049).
 */
export function vermerkeDirektversand(file, { orderId, lineItemId, actor, jetzt = new Date() } = {}) {
  const key = positionKey(orderId, lineItemId);
  if (!key) throw new AuftragsstatusFehler('orderId und lineItemId sind Pflicht');
  if (!actor) throw new AuftragsstatusFehler('actor (gh-Login) ist Pflicht');
  const alle = leseAlle(file);
  const bisher = alle[key];
  if (bisher?.status !== 'bestellt') throw new AuftragsstatusFehler('Nur eine beim Lieferanten bestellte Position kann als Direktversand vermerkt werden.', 409);
  alle[key] = { ...bisher, ueber: 'kunde', aktualisiertAm: jetzt.toISOString(), aktualisiertVon: actor };
  schreibeAlle(file, alle);
  return alle[key];
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
  // "Zugeschnitten"/"Gepackt" gehoeren ebenfalls zum alten Durchlauf und wandern mit in den Verlauf.
  for (const feld of ['sendungsnummer', 'versanddienst', 'versandMail', 'shopifyVersand', 'selbstversand']) {
    if (rest[feld] !== undefined && rest[feld] !== null) vorher[feld] = rest[feld];
    delete rest[feld];
  }
  // Der Vermerk "aus Lager" kommt nur von "Zugeschnitten" und gehoert damit zum alten Durchlauf.
  // Bliebe er stehen, galt die Position fuer immer als Lagerware - auch ohne Regel (Pruefung 06.11.).
  // Andere Vermerke bleiben wie bisher; sie zaehlen ohne Schritt ohnehin nicht (lib/lieferweg.mjs).
  if (rest.ueber === 'lager') { vorher.ueber = rest.ueber; delete rest.ueber; }
  // Bestelldaten und AB gehoeren zur alten Bestellung (Lieferantenstand, beschaffung.mjs): sonst
  // stuende nach "Zurueck auf offen" eine bestaetigte AB an einer nicht bestellten Position.
  // Die Anfrage gehoert vor die Bestellung und bleibt.
  if (rest.beschaffung && (rest.beschaffung.ab || rest.beschaffung.bestellung)) {
    const { ab, bestellung, ...b } = rest.beschaffung;
    // Der Liefertermin kam mit dieser AB und gilt fuer eine neue Bestellung nicht mehr.
    if (ab) { vorher.ab = ab; if (b.liefertermin) { vorher.liefertermin = b.liefertermin; delete b.liefertermin; } }
    if (bestellung) vorher.bestellung = bestellung;
    if (Object.keys(b).length) rest.beschaffung = b; else delete rest.beschaffung;
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

/**
 * Ware, die wir selbst verschicken (Lieferweg "aus Lager" oder "über uns"): "Zugeschnitten" und
 * "Gepackt" je Position, gespeichert im Unterobjekt `selbstversand` ({ zugeschnitten: {am, von,
 * vorher}, gepackt: {am, von} }). Verschickt wird ueber den vorhandenen Schritt "raus".
 *
 * - zugeschnitten, an: aus leer (oder Altfall "bestellt") auf "geliefert" mit Vermerk "aus Lager";
 *   steht die Position schon auf "geliefert", kommt nur der Vermerk dazu. Fehlmenge offen: 409.
 *   Der Vermerk davor steht in `ueberVorher`.
 * - zugeschnitten, aus: zurueck auf den Schritt davor (`vorher`) und den Vermerk davor
 *   (`ueberVorher`), nur solange nicht gepackt - sonst bliebe "aus Lager" fuer immer stehen.
 * - gepackt, an/aus: nur bei "geliefert".
 * Direktversand des Lieferanten (ueber "kunde") lehnt beides ab. Ob die Position wirklich aus dem
 * Lager kommt bzw. kein Muster ist, prueft der Aufrufer (er kennt die Position). Jede Ruecknahme
 * steht mit Zeit und Person im Verlauf.
 *
 * @param {string} file
 * @param {object} p
 * @param {string} p.orderId
 * @param {string} p.lineItemId
 * @param {'zugeschnitten'|'gepackt'} p.schritt
 * @param {boolean} p.an
 * @param {string} p.actor
 * @param {object} [p.bestellmenge]  aktuelle Bestellmenge (wie setzeStatus), fuer die Fehlmengen-Sperre
 * @param {Date}   [p.jetzt]
 */
export function setzeSelbstversand(file, { orderId, lineItemId, schritt, an, actor, bestellmenge, jetzt = new Date() } = {}) {
  const key = positionKey(orderId, lineItemId);
  if (!key) throw new AuftragsstatusFehler('orderId und lineItemId sind Pflicht');
  if (!SELBST_SCHRITTE.includes(schritt)) throw new AuftragsstatusFehler(`Unbekannter Schritt „${schritt}“`);
  if (typeof an !== 'boolean') throw new AuftragsstatusFehler('Angabe „an“ (ja/nein) fehlt');
  if (!actor) throw new AuftragsstatusFehler('actor (gh-Login) ist Pflicht');
  const alle = leseAlle(file);
  const bisher = alle[key] || {};
  // Ein Vermerk zaehlt nur mit Schritt (lib/lieferweg.mjs): nach "Zurueck auf offen" ist er Vergangenheit.
  if (bisher.status && bisher.ueber === 'kunde') throw new AuftragsstatusFehler('Der Lieferant schickt diese Ware direkt an den Kunden – bei uns wird nichts zugeschnitten oder gepackt.', 409);
  const zeit = jetzt.toISOString();
  const sv = { ...(bisher.selbstversand || {}) };
  const status = bisher.status || null;
  let eintrag = { ...bisher, orderId: String(orderId), lineItemId: String(lineItemId), aktualisiertAm: zeit, aktualisiertVon: actor };
  const protokolliere = (aktion, extra = {}) => {
    eintrag.verlauf = [...(Array.isArray(bisher.verlauf) ? bisher.verlauf : []), { aktion, am: zeit, von: actor, ...extra }].slice(-20);
  };
  if (schritt === 'zugeschnitten' && an) {
    if (['raus', 'erledigt'].includes(status)) throw new AuftragsstatusFehler('Diese Position ist schon an den Kunden raus.', 409);
    if (sv.zugeschnitten && status === 'geliefert') return bisher;
    if (status !== 'geliefert') {
      const stand = bestellmenge === undefined ? bisher : beschaffungsStand(bisher, bestellmenge);
      if (!darfWeiter(stand, 'geliefert')) throw new AuftragsstatusFehler(stand.beschaffung?.klaerung || 'Die bestätigte Fehlmenge ist noch offen. Zuerst den Wareneingang vervollständigen.', 409);
      eintrag = { ...eintrag, status: 'geliefert', geliefertAm: zeit, geliefertVon: actor, geliefertNotiz: 'Aus eigenem Lager zugeschnitten' };
    }
    eintrag.ueber = 'lager';
    sv.zugeschnitten = { am: zeit, von: actor, vorher: status, ueberVorher: UEBER_WERTE.includes(bisher.ueber) && bisher.ueber !== 'lager' ? bisher.ueber : null };
  } else if (schritt === 'zugeschnitten') {
    if (!sv.zugeschnitten) throw new AuftragsstatusFehler('Diese Position ist nicht als zugeschnitten eingetragen.', 409);
    if (sv.gepackt) throw new AuftragsstatusFehler('Zuerst „Gepackt“ zurücknehmen.', 409);
    if (status !== 'geliefert') throw new AuftragsstatusFehler('Diese Position ist schon weiter – zurück nur über „Zurück auf offen…“.', 409);
    const vorher = sv.zugeschnitten.vorher ?? null;
    if (vorher !== 'geliefert') {
      eintrag.status = vorher;
      for (const feld of ['geliefertAm', 'geliefertVon', 'geliefertNotiz']) delete eintrag[feld];
    }
    // Vermerk wie vor dem Zuschnitt: ohne ihn ist die Position wieder, was Regeldatei und Stammroute sagen.
    const ueberVorher = sv.zugeschnitten.ueberVorher ?? null;
    if (ueberVorher) eintrag.ueber = ueberVorher; else delete eintrag.ueber;
    protokolliere('zugeschnitten zurückgenommen', { zugeschnittenAm: sv.zugeschnitten.am, zugeschnittenVon: sv.zugeschnitten.von, zurueckAuf: eintrag.status });
    delete sv.zugeschnitten;
  } else if (an) {
    if (status !== 'geliefert') throw new AuftragsstatusFehler('Gepackt geht erst, wenn die Ware bei uns ist (zugeschnitten bzw. eingetroffen).', 409);
    if (sv.gepackt) return bisher;
    sv.gepackt = { am: zeit, von: actor };
  } else {
    if (!sv.gepackt) throw new AuftragsstatusFehler('Diese Position ist nicht als gepackt eingetragen.', 409);
    if (status !== 'geliefert') throw new AuftragsstatusFehler('Diese Position ist schon weiter – zurück nur über „Zurück auf offen…“.', 409);
    protokolliere('gepackt zurückgenommen', { gepacktAm: sv.gepackt.am, gepacktVon: sv.gepackt.von });
    delete sv.gepackt;
  }
  if (Object.keys(sv).length) eintrag.selbstversand = sv; else delete eintrag.selbstversand;
  alle[key] = eintrag;
  schreibeAlle(file, alle);
  return eintrag;
}
