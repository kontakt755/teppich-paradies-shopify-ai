/**
 * Zeitleiste je Auftrag und der eine naechste Schritt.
 *
 * Der Inhaber will pro Kunde/Bestellung sofort sehen, wo es steht ("der Kunde
 * hat die Muster bekommen"), und mit einem Klick weiterkommen. Dafuer gibt es
 * zwei Strecken:
 *
 *   Muster: angefragt -> beim Lieferanten bestellt -> bei uns angekommen ->
 *           gelabelt und an Kunden verschickt -> Kunde hat Muster ->
 *           nachgefasst -> Ergebnis (Kunde hat bestellt | kein Interesse |
 *           Muster nicht verfuegbar - Kunde informiert)
 *   Ware:   Kunde hat bestellt -> beim Lieferanten bestellt -> geliefert an uns
 *           (entfaellt bei Direktversand) -> an Kunden raus -> erledigt
 *
 * Muster gehen NICHT vom Lieferanten direkt zum Kunden: sie kommen in den
 * Laden, werden neu gelabelt und von uns verschickt (Inhabervorgabe).
 *
 * Woher die Schritte kommen:
 * - "bestellt / geliefert / raus / erledigt" sind die bestehenden Werte je
 *   Position aus auftragsstatus.mjs - dieselbe Datei, dasselbe Format, damit
 *   Einkauf und Zeitleiste nie auseinanderlaufen. Ein Schritt gilt als getan,
 *   wenn ALLE Positionen des Auftrags ihn erreicht haben (wie fortschritt()).
 * - "Kunde hat Muster / nachgefasst / Ergebnis / Notiz" gibt es nur je Auftrag.
 *   Sie liegen als Ereignisliste in $TP_PRIVAT_DIR/auftragsverlauf.json -
 *   es wird nur angehaengt, nie ueberschrieben; eine Korrektur ist selbst ein
 *   Ereignis ("zurueck"). Wer und wann steht an jedem Ereignis.
 * - Was sich sicher aus den Bestelldaten ergibt, wird abgeleitet und als
 *   `automatisch` gekennzeichnet: Bestelleingang, Versand (Shopify-Sendung),
 *   Zustellung (Sendungsstatus) und die spaetere Bestellung desselben Kunden
 *   nach einer Musterbestellung. Geschrieben wird dabei nichts.
 *
 * Die Ableitung (zeitleiste, naechsterSchritt) ist rein: gleiche Eingaben,
 * gleiches Ergebnis, keine Dateizugriffe.
 */

import fs from 'node:fs';
import { musterNachfassen, ERSTE_NACH_TAGEN, ERINNERUNG_NACH_TAGEN } from '../../docs/ai-dashboard/lib/muster-nachfassen.mjs';
import { beschaffungText, restmenge, beschaffungsStand } from '../../docs/ai-dashboard/lib/beschaffung.mjs';
import path from 'node:path';
import os from 'node:os';
import { positionKey, STATUS_ORDER } from './auftragsstatus.mjs';
import { WARTE_NACHHAKEN_TAGE, WARTE_PROBLEM_TAGE, warnstufe } from './lieferanten.mjs';
import { kundenSchluessel } from './kundensuche.mjs';
import { ROUTE } from './route.mjs';
import { wirdGekettelt } from './kettelpuffer.mjs';
import { musterOhneLieferant, HERKUNFT } from './musterherkunft.mjs';
import { lieferwegVon } from '../../docs/ai-dashboard/lib/lieferweg.mjs';
import { warteAmpel, dringendereAmpel } from '../../docs/ai-dashboard/lib/ampel.mjs';
import { NACHFRAGE_MAILS_HREF } from '../../docs/ai-dashboard/lib/nachfrage-mails.mjs';

/** Kompatibler Export: die Frist stammt aus dem vorhandenen Nachfassmodell (ab Versand). */
export const NACHFASSEN_NACH_TAGEN = ERSTE_NACH_TAGEN;
/** Historischer Export fuer bestehende Aufrufer; erzeugt keine Empfangsannahme mehr. */
export const MUSTER_ANGEKOMMEN_ANNAHME_TAGE = 3;
/** Historischer Export; Erinnerungen steuert ausschliesslich das vorhandene Nachfassmodell. */
export const ERGEBNIS_KLAEREN_NACH_TAGEN = 14;
/** Ware "an Kunden raus": nach so vielen Tagen wird das Abschliessen faellig. */
export const WARE_ABSCHLIESSEN_NACH_TAGEN = 7;

export const AUFTRAGSART = Object.freeze({ MUSTER: 'muster', WARE: 'ware' });

/** Schritte, die je Auftrag (nicht je Position) gespeichert werden. */
// "kunde_informiert" (Ware, seit 2026-10-20): Kunde weiss, dass die Ware da ist - Einkauf "Je Auftrag".
export const AUFTRAGS_SCHRITTE = Object.freeze(['kunde_hat_muster', 'nachgefasst', 'kunde_hat_bestellt', 'kein_interesse', 'muster_nicht_verfuegbar', 'kunde_informiert']);
/**
 * Ergebnisse schliessen die Musterstrecke ab. "Muster nicht verfuegbar" (Inhaber 2026-10-16):
 * der Lieferant hat die Farbe nicht, der Kunde ist informiert und bestellt bei Bedarf neue
 * Muster - der Auftrag ist damit fertig wie bei "kein Interesse".
 */
export const ERGEBNIS_SCHRITTE = Object.freeze(['kunde_hat_bestellt', 'kein_interesse', 'muster_nicht_verfuegbar']);
/** Ergebnisse, bei denen die Notiz Pflicht ist (sie nennt die betroffenen Farben). */
export const NOTIZ_PFLICHT = Object.freeze(['muster_nicht_verfuegbar']);
/** Alles, was POST /api/einkauf/auftragsstatus mit aktion "schritt" annimmt. */
export const SCHRITT_WERTE = Object.freeze([...STATUS_ORDER, ...AUFTRAGS_SCHRITTE, 'notiz', 'zurueck']);

export const SCHRITT_LABEL = Object.freeze({
  muster: Object.freeze({
    angefragt: 'Muster angefragt',
    bestellt: 'Muster beim Lieferanten bestellt',
    geliefert: 'Muster bei uns angekommen',
    raus: 'Gelabelt und an Kunden verschickt',
    raus_eigen: 'Aus eigenem Bestand an Kunden verschickt',
    raus_vorbei: 'Persönlich übergeben',
    raus_direkt: 'Vom Lieferanten direkt an den Kunden verschickt',
    kunde_hat_muster: 'Kunde hat Muster',
    nachgefasst: 'Nachgefasst',
    ergebnis: 'Ergebnis',
    kunde_hat_bestellt: 'Kunde hat bestellt',
    kein_interesse: 'Kein Interesse',
    muster_nicht_verfuegbar: 'Muster nicht verfügbar – Kunde informiert',
    erledigt: 'Abgeschlossen',
  }),
  ware: Object.freeze({
    kunde_hat_bestellt: 'Kunde hat bestellt',
    bestellt: 'Ware beim Lieferanten bestellt',
    geliefert: 'Geliefert an uns',
    // Nur Lagerware im Auftrag (#1995): nichts kommt an, wir schneiden aus eigener Rolle zu.
    geliefert_lager: 'Aus eigenem Lager zugeschnitten',
    kunde_informiert: 'Kunde informiert – Ware ist da',
    raus: 'An Kunden raus',
    erledigt: 'Erledigt',
  }),
});

export class AuftragsverlaufFehler extends Error {}

// ---------------------------------------------------------------------------
// Ablage: Ereignisse je Auftrag, nur anhaengen
// ---------------------------------------------------------------------------

export function auftragsverlaufPfad(privatDir) {
  return path.join(privatDir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse'), 'auftragsverlauf.json');
}

/** Liest alle Ereignisse ({ [orderId]: { ereignisse: [...] } }); fehlende oder kaputte Datei = leer. */
export function leseVerlauf(file, { streng = false } = {}) {
  try {
    const roh = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!roh || typeof roh !== 'object' || Array.isArray(roh) || !roh.auftraege || typeof roh.auftraege !== 'object' || Array.isArray(roh.auftraege)
      || Object.values(roh.auftraege).some(e => !e || typeof e !== 'object' || !Array.isArray(e.ereignisse))) throw new Error('ungültiges Verlaufsformat');
    return roh.auftraege;
  } catch (e) {
    if (streng && e?.code !== 'ENOENT') throw new AuftragsverlaufFehler('Der Auftragsverlauf ist nicht lesbar oder beschädigt. Es wurde nichts verändert.');
    return {};
  }
}

function clip(text, max) {
  const s = String(text ?? '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Haengt ein Ereignis an den Verlauf eines Auftrags an und schreibt atomar
 * (tmp-Datei + rename). Bestehende Ereignisse werden nie veraendert.
 *
 * @param {string} file
 * @param {object} p
 * @param {string} p.orderId
 * @param {string} p.schritt   einer aus AUFTRAGS_SCHRITTE, "notiz" oder "zurueck"
 * @param {string} p.actor     wer geklickt hat
 * @param {string} [p.notiz]   Pflicht bei "notiz"
 * @param {string} [p.bezug]   bei "zurueck": welcher Schritt zurueckgenommen wird
 * @param {Date}   [p.jetzt]
 */
export function bereiteEreignisVor(file, { orderId, schritt, actor, notiz = null, bezug = null, jetzt = new Date() } = {}) {
  const id = String(orderId ?? '').trim();
  if (!id) throw new AuftragsverlaufFehler('orderId ist Pflicht');
  if (!actor) throw new AuftragsverlaufFehler('actor ist Pflicht');
  if (![...AUFTRAGS_SCHRITTE, 'notiz', 'zurueck'].includes(schritt)) throw new AuftragsverlaufFehler(`Unbekannter Schritt "${schritt}"`);
  if (schritt === 'notiz' && !clip(notiz, 2000)) throw new AuftragsverlaufFehler('Die Notiz ist leer');
  if (NOTIZ_PFLICHT.includes(schritt) && !clip(notiz, 2000)) throw new AuftragsverlaufFehler('Bitte in der Notiz die betroffenen Farben nennen');
  if (schritt === 'zurueck' && !AUFTRAGS_SCHRITTE.includes(bezug)) throw new AuftragsverlaufFehler('Welcher Schritt zurückgenommen wird, fehlt');

  const alle = leseVerlauf(file, { streng: true });
  const ereignis = { schritt, am: jetzt.toISOString(), von: String(actor) };
  if (notiz && clip(notiz, 2000)) ereignis.notiz = clip(notiz, 2000);
  if (schritt === 'zurueck') ereignis.bezug = bezug;
  const bisher = Array.isArray(alle[id]?.ereignisse) ? alle[id].ereignisse : [];
  alle[id] = { ...(alle[id] || {}), ereignisse: [...bisher, ereignis] };
  return { auftraege: alle, ereignis };
}

export function schreibeVerlauf(file, auftraege) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, auftraege }, null, 2));
  fs.renameSync(tmp, file);
}

export function haengeEreignisAn(file, angaben = {}) {
  const vorbereitet = bereiteEreignisVor(file, angaben);
  schreibeVerlauf(file, vorbereitet.auftraege);
  return vorbereitet.ereignis;
}

// ---------------------------------------------------------------------------
// Ableitung (rein)
// ---------------------------------------------------------------------------

function tageSeit(iso, jetzt) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const tage = Math.floor((jetzt.getTime() - t) / 864e5);
  return tage >= 0 ? tage : 0;
}

const tageText = n => (n === 1 ? '1 Tag' : `${n} Tagen`);
const tagDatum = iso => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(iso));

/**
 * Wann der Umschlag dieses Auftrags in der Packstation gepackt wurde (#1709), sonst null.
 * `gepackt` ist der Stand aus muster-packen.json (Schluessel = sortierte Bestell-IDs des Kunden).
 */
export function gepacktAmFuer(orderId, gepackt = {}) {
  const zeiten = Object.entries(gepackt || {})
    .filter(([key, v]) => String(key).split(',').includes(String(orderId)) && Number.isFinite(Date.parse(v?.zeit)))
    .map(([, v]) => v.zeit).sort();
  return zeiten.at(-1) || null;
}

/** Reine Musterbestellung (jede Position ein Muster) = Musterstrecke, alles andere Warenstrecke. */
export function auftragsart(auftrag) {
  const positionen = auftrag?.positionen ?? [];
  return positionen.length > 0 && positionen.every(p => p.istMuster) ? AUFTRAGSART.MUSTER : AUFTRAGSART.WARE;
}

/**
 * Erste echte Warenbestellung desselben Kunden NACH diesem Auftrag - das
 * sichere Zeichen "Kunde hat bestellt" hinter einer Musterbestellung.
 * Test- und stornierte Bestellungen sowie weitere reine Musterbestellungen
 * zaehlen nicht.
 */
export function folgebestellung(auftrag, auftraegeDesKunden = []) {
  const ab = String(auftrag?.datum ?? '');
  if (!ab) return null;
  return [...auftraegeDesKunden]
    .filter(a => a && a.id !== auftrag.id && !a.testbestellung && !a.storniert && String(a.datum ?? '') > ab && auftragsart(a) === AUFTRAGSART.WARE)
    .sort((a, b) => String(a.datum).localeCompare(String(b.datum)))[0] || null;
}

/** Gueltige Ereignisse je Auftrags-Schritt: ein "zurueck" hebt alle frueheren Ereignisse seines Bezugs auf. */
function wirksameEreignisse(ereignisse = []) {
  const liste = (Array.isArray(ereignisse) ? ereignisse : []).filter(e => e && e.schritt && e.am)
    .slice().sort((a, b) => String(a.am).localeCompare(String(b.am)));
  const jeSchritt = {};
  for (const e of liste) {
    if (e.schritt === 'zurueck') { delete jeSchritt[e.bezug]; continue; }
    if (!AUFTRAGS_SCHRITTE.includes(e.schritt)) continue;
    (jeSchritt[e.schritt] ||= []).push(e);
  }
  return { jeSchritt, notizen: liste.filter(e => e.schritt === 'notiz').map(e => ({ am: e.am, von: e.von || null, text: e.notiz || '' })) };
}

/** Stand eines Positions-Schritts ueber alle nachverfolgbaren Positionen des Auftrags. */
function positionsStand(auftrag, statusAlle) {
  const positionen = (auftrag?.positionen ?? []).filter(p => p.lineItemId);
  const eintraege = positionen.map(p => beschaffungsStand(statusAlle[positionKey(auftrag.id, p.lineItemId)] || null, p.bestellSoll || p.bestellmenge));
  const stufen = eintraege.map(e => (e ? STATUS_ORDER.indexOf(e.status) + 1 : 0));
  const minStufe = stufen.length ? Math.min(...stufen) : 0;
  const schritt = (status) => {
    const i = STATUS_ORDER.indexOf(status) + 1;
    const erreicht = stufen.filter(s => s >= i).length;
    // Datum und Person: die Position, die den Schritt als letzte erreicht hat.
    let am = null; let von = null; let notiz = null;
    eintraege.forEach((e, n) => {
      if (!e || stufen[n] < i) return;
      const zeit = e[`${status}Am`];
      if (zeit && (!am || zeit > am)) { am = zeit; von = e[`${status}Von`] || null; notiz = e[`${status}Notiz`] || null; }
    });
    return { getan: positionen.length > 0 && erreicht === positionen.length, erreicht, gesamt: positionen.length, am, von, notiz };
  };
  return { gesamt: positionen.length, minStufe, schritt };
}

/** Shopify-Sendungen des Auftrags, soweit sie als Beleg taugen. */
function versandBeleg(auftrag) {
  const sendungen = (auftrag?.sendungen ?? []).filter(s => !/CANCEL|FAIL|ERROR/i.test(String(s.status ?? '')));
  const versendet = String(auftrag?.erfuellt ?? '').toUpperCase() === 'FULFILLED';
  if (!versendet) return null;
  const am = sendungen.map(s => s.am).filter(Boolean).sort().pop() || null;
  const zugestellt = sendungen.length > 0 && sendungen.every(s => String(s.status ?? '').toUpperCase() === 'DELIVERED');
  const zugestelltAm = zugestellt ? (sendungen.map(s => s.aktualisiertAm || s.am).filter(Boolean).sort().pop() || null) : null;
  const tracking = sendungen.flatMap(s => s.tracking ?? []).find(t => t?.nummer) || null;
  return { am, zugestellt, zugestelltAm, tracking };
}

/**
 * Muster aus dem eigenen Bestand (musterherkunft.mjs bzw. Route SAMPLE_STOCK/SAMPLE_CUT):
 * 'vorbei' (persoenlich vorbeibringen), 'versand' (wir verschicken) oder null (beim Lieferanten).
 * Gilt nur, wenn ALLE Muster des Auftrags ohne Lieferant auskommen.
 */
function eigenerBestand(positionen) {
  if (!positionen.length || !positionen.every(p => musterOhneLieferant(p))) return null;
  return positionen.every(p => p.musterHerkunft === HERKUNFT.VORBEI) ? 'vorbei' : 'versand';
}

/**
 * Zeitleiste eines Auftrags.
 *
 * @param {object} auftrag   Auftrag aus bestelluebersicht.aufbereiten()
 * @param {object} [opts]
 * @param {object} [opts.statusAlle]    Positionsstatus (auftragsstatus.mjs leseAlle)
 * @param {object[]} [opts.ereignisse]  Ereignisse dieses Auftrags (leseVerlauf()[orderId].ereignisse)
 * @param {object|null} [opts.folge]    folgebestellung() - spaetere Warenbestellung desselben Kunden
 * @param {Date} [opts.jetzt]
 * @returns {{ auftragsart, verlauf, verlaufNotizen, abgeschlossen, naechsterSchritt }}
 */
export function zeitleiste(auftrag, { statusAlle = {}, ereignisse = [], folge = null, gepacktAm = null, gesperrt = null, jetzt = new Date() } = {}) {
  const art = auftragsart(auftrag);
  const label = SCHRITT_LABEL[art];
  // Gesperrte Muster, die noch nicht bei uns sind (dieselbe Regel wie die Ampel "Gesperrt" und das To-do
  // "Muster nicht lieferbar"): sie kommen nie - nicht bestellen, nicht beim Lieferanten nachfragen. Sie halten
  // die Schritte nicht auf (Review 06.11.2026: sonst blieb ein gemischter Auftrag auf "bestellen" stehen),
  // ausser wenn sonst nichts uebrig bleibt - dann sagt naechsterSchritt "Muster kommt nicht".
  const sperre = gesperrt instanceof Set ? gesperrt : new Set(gesperrt || []);
  const standVon = p => statusAlle[positionKey(auftrag?.id, p.lineItemId)]?.status || null;
  const kommtNichtP = p => Boolean(p?.istMuster && p.lineItemId && (p.menge ?? 1) > 0 && sperre.has(p.lineItemId) && [null, 'bestellt'].includes(standVon(p)));
  const ohneGesperrte = (auftrag?.positionen ?? []).filter(p => !kommtNichtP(p));
  const zaehlen = sperre.size && ohneGesperrte.some(p => p.lineItemId) && ohneGesperrte.length < (auftrag?.positionen ?? []).length
    ? { ...auftrag, positionen: ohneGesperrte } : auftrag;
  const pos = positionsStand(zaehlen, statusAlle);
  const { jeSchritt, notizen } = wirksameEreignisse(ereignisse);
  const versand = versandBeleg(auftrag);
  const positionen = auftrag?.positionen ?? [];

  const ausPosition = (status, extra = {}, stand = pos) => {
    const s = stand.schritt(status);
    return { schritt: status, label: label[status], getan: s.getan, am: s.am, von: s.von, notiz: s.notiz, automatisch: false, quelle: s.getan ? 'manuell' : null,
      teil: !s.getan && s.erreicht > 0 ? { erledigt: s.erreicht, gesamt: s.gesamt } : null, ...extra };
  };
  const ausVersand = () => {
    const s = ausPosition('raus');
    if (s.getan || !versand) return s;
    return { ...s, getan: true, am: versand.am, von: null, automatisch: true, quelle: 'Shopify-Versand',
      hinweis: versand.tracking?.nummer ? `Sendung ${versand.tracking.nummer}${versand.tracking.traeger ? ` (${versand.tracking.traeger})` : ''}` : null, teil: null };
  };
  const start = (schritt) => ({ schritt, label: label[schritt], getan: true, am: auftrag?.datum ?? null, von: null, notiz: null, automatisch: true, quelle: 'Shopify-Bestellung', teil: null });

  const schritte = [];
  let direkt = false;
  let eigen = null;
  let wege = null;
  if (art === AUFTRAGSART.MUSTER) {
    eigen = eigenerBestand(positionen);
    // Mit Lieferziel "Kunden" bestellt (ueber: 'kunde'): der Hersteller verschickt die Muster
    // selbst. "Bei uns angekommen" gibt es dann nie - bis 2026-10-24 blieben solche Auftraege
    // dort haengen, ohne Shopify-Versand und ohne Nachfassen.
    direkt = !eigen && positionen.length > 0 && positionen.every(p => statusAlle[positionKey(auftrag.id, p.lineItemId)]?.ueber === 'kunde');
    schritte.push(start('angefragt'));
    // Aus eigenem Bestand: "beim Lieferanten bestellt" und "bei uns angekommen" entfallen;
    // beim Vorbeibringen heisst der Schritt "persoenlich uebergeben" statt "verschickt".
    if (!eigen) schritte.push(ausPosition('bestellt'));
    if (!eigen && !direkt) schritte.push(ausPosition('geliefert'));
    const raus = ausVersand();
    schritte.push(eigen === 'vorbei' ? { ...raus, label: label.raus_vorbei } : eigen === 'versand' ? { ...raus, label: label.raus_eigen }
      : direkt ? { ...raus, label: label.raus_direkt } : raus);

    const hat = jeSchritt.kunde_hat_muster?.at(-1);
    schritte.push(hat
      ? { schritt: 'kunde_hat_muster', label: label.kunde_hat_muster, getan: true, am: hat.am, von: hat.von || null, notiz: hat.notiz || null, automatisch: false, quelle: 'manuell', teil: null }
      : versand?.zugestellt
        ? { schritt: 'kunde_hat_muster', label: label.kunde_hat_muster, getan: true, am: versand.zugestelltAm, von: null, notiz: null, automatisch: true, quelle: 'Sendungsverfolgung', teil: null }
        : { schritt: 'kunde_hat_muster', label: label.kunde_hat_muster, getan: false, am: null, von: null, notiz: null, automatisch: false, quelle: null, teil: null });

    const nach = jeSchritt.nachgefasst ?? [];
    const letzt = nach.at(-1);
    schritte.push({ schritt: 'nachgefasst', label: label.nachgefasst, getan: Boolean(letzt), am: letzt?.am ?? null, von: letzt?.von ?? null, notiz: letzt?.notiz ?? null,
      automatisch: false, quelle: letzt ? 'manuell' : null, teil: null, anzahl: nach.length || undefined });

    // Ergebnis: ausdruecklich eingetragen > spaetere Bestellung erkannt > Positionen im alten Modell abgeschlossen.
    const ergebnis = ERGEBNIS_SCHRITTE.map(s => jeSchritt[s]?.at(-1)).filter(Boolean).sort((a, b) => String(a.am).localeCompare(String(b.am))).pop();
    const erledigt = pos.schritt('erledigt');
    if (ergebnis) schritte.push({ schritt: 'ergebnis', ergebnis: ergebnis.schritt, label: label[ergebnis.schritt], getan: true, am: ergebnis.am, von: ergebnis.von || null, notiz: ergebnis.notiz || null, automatisch: false, quelle: 'manuell', teil: null });
    else if (folge) schritte.push({ schritt: 'ergebnis', ergebnis: 'kunde_hat_bestellt', label: label.kunde_hat_bestellt, getan: true, am: folge.datum ?? null, von: null, notiz: null, automatisch: true, quelle: 'Spätere Bestellung', hinweis: folge.name ? `Bestellung ${folge.name}` : null, folgeOrderId: folge.id ?? null, folgeOrderName: folge.name ?? null, teil: null });
    else if (erledigt.getan) schritte.push({ schritt: 'ergebnis', ergebnis: 'erledigt', label: label.erledigt, getan: true, am: erledigt.am, von: erledigt.von, notiz: erledigt.notiz, automatisch: false, quelle: 'manuell', teil: null });
    else schritte.push({ schritt: 'ergebnis', ergebnis: null, label: label.ergebnis, getan: false, am: null, von: null, notiz: null, automatisch: false, quelle: null, teil: null });
  } else {
    // Eine mitgekaufte Eigenleistung (Kettelservice) hat keine Route und reist nicht mit.
    const ware = positionen.filter(p => !p.istMuster && !p.eigenleistung);
    // Lieferweg je Position (docs/ai-dashboard/lib/lieferweg.mjs, #1995): Vermerk beim Bestellen >
    // Lagerware > Stammroute. Ueber unseren Kettler bestellte Ware (ueber: 'kettler', #1453) kommt
    // erst zu uns zurueck, auch wenn der Lieferant sonst direkt verschickt. Hersteller-Direktware
    // kommt nie bei uns an; Lagerware wird nie bestellt - wir schneiden sie selbst zu.
    const eintragVon = p => statusAlle[positionKey(auftrag.id, p.lineItemId)] || null;
    const wegVon = p => lieferwegVon(p, eintragVon(p))?.weg;
    const istDirekt = p => wegVon(p) === 'hersteller' || wegVon(p) === 'baustelle';
    const stufe = p => STATUS_ORDER.indexOf(eintragVon(p)?.status) + 1;
    const lager = ware.filter(p => wegVon(p) === 'lager');
    const zuBestellen = ware.filter(p => wegVon(p) !== 'lager');
    // Was der Lieferant zu uns (bzw. zum Kettler und zurueck) bringt - nur das ist "Geliefert an uns".
    const vomLieferanten = ware.filter(p => !istDirekt(p) && wegVon(p) !== 'lager');
    direkt = ware.length > 0 && ware.every(istDirekt);
    // Gemischt (#1119: eine Position Hersteller → Kunde, eine aus Lager) zaehlt jeder Schritt nur
    // die Positionen, die ihn ueberhaupt gehen - sonst stuende "Lieferant liefert die Ware an uns"
    // fuer Ware, die nie zu uns kommt. Ebenso, wenn ein Teil schon bei uns liegt und raus soll
    // (#1104), waehrend der Rest noch unterwegs ist. Sonst rechnen Auftraege wie bisher ueber alle Positionen.
    const gemischt = lager.length > 0 || (!direkt && vomLieferanten.length < ware.length);
    const teilweise = vomLieferanten.some(p => stufe(p) === 2) && vomLieferanten.some(p => stufe(p) < 2);
    const jeWeg = gemischt || teilweise;
    const teil = liste => positionsStand({ ...auftrag, positionen: liste }, statusAlle);
    schritte.push(start('kunde_hat_bestellt'));
    if (!jeWeg) schritte.push(ausPosition('bestellt'));
    else if (zuBestellen.length) schritte.push(ausPosition('bestellt', {}, teil(zuBestellen)));
    // "Geliefert an uns" zaehlt nur Ware vom Lieferanten; Lagerware kommt nicht an, sie wird
    // zugeschnitten. Nur ohne Ware vom Lieferanten steht der Zuschnitt selbst als Schritt da.
    if (!direkt) schritte.push(ausPosition('geliefert', vomLieferanten.length ? {} : { label: label.geliefert_lager }, !jeWeg ? pos : teil(vomLieferanten.length ? vomLieferanten : lager)));
    schritte.push(ausVersand(), ausPosition('erledigt'));
    if (jeWeg) {
      wege = {
        lager: lager.length, direkt: ware.filter(istDirekt).length, gesamt: ware.length,
        direktOffen: ware.filter(p => istDirekt(p) && stufe(p) < 3).length,
        zuschneiden: lager.filter(p => stufe(p) < 2).length,
        zuUnsUnterwegs: vomLieferanten.filter(p => stufe(p) < 2).length,
        vonUnsRaus: [...vomLieferanten, ...lager].filter(p => stufe(p) === 2).length,
      };
    }
  }

  // Der weiteste getane Schritt bestimmt den Stand; Luecken davor sind "uebersprungen"
  // (z. B. Versand von Shopify erkannt, aber nie "bestellt" geklickt).
  const letzterGetan = schritte.reduce((m, s, i) => (s.getan ? i : m), 0);
  const storniert = Boolean(auftrag?.storniert);
  const fertigImAltenModell = pos.gesamt > 0 && pos.minStufe === STATUS_ORDER.length;
  const abgeschlossen = storniert || fertigImAltenModell || (letzterGetan === schritte.length - 1 && !schritte.at(-1).automatisch);
  const verlauf = schritte.map((s, i) => {
    const { getan, ...rest } = s;
    const zustand = getan ? 'erledigt' : i < letzterGetan ? 'uebersprungen' : (i === letzterGetan + 1 && !abgeschlossen) ? 'aktuell' : 'offen';
    return { ...rest, zustand };
  });

  const ergebnis = { auftragsart: art, verlauf, verlaufNotizen: notizen, abgeschlossen, direktversand: direkt, eigenerBestand: eigen,
    // Nur bei gemischten Wegen oder Lagerware (#1995): wie viele Positionen wo stehen - fuer den naechsten Schritt.
    ...(wege ? { wege } : {}),
    // Gepackt ist noch nicht versandt (#1709): nur als Angabe fuer den naechsten Schritt, kein eigener Zeitleistenschritt.
    ...(art === AUFTRAGSART.MUSTER && gepacktAm ? { gepacktAm } : {}) };
  const bestelltePos = ohneGesperrte.filter(p => p.lineItemId);
  const beschaffung = bestelltePos.map(p => beschaffungsStand(statusAlle[positionKey(auftrag.id, p.lineItemId)], p.bestellSoll || p.bestellmenge)).filter(e => e?.status === 'bestellt');
  // Ampel beim Lieferanten je Position ab ihrem Bestelldatum (lib/ampel.mjs warteAmpel), die dringendste -
  // nicht ab dem letzten Schritt des ganzen Auftrags: eine spaetere zweite Bestellung setzte die Zaehlung
  // sonst zurueck, waehrend "Je Auftrag" die erste schon rot zeigte (Review 06.11.2026). Lagerware kommt
  // nicht vom Lieferanten und zaehlt nicht mit.
  const ampeln = bestelltePos
    .filter(p => standVon(p) === 'bestellt' && (p.istMuster || lieferwegVon(p, statusAlle[positionKey(auftrag.id, p.lineItemId)])?.weg !== 'lager'))
    .map(p => warteAmpel(statusAlle[positionKey(auftrag.id, p.lineItemId)], { jetzt }));
  // Termin vorbei geht vor; sonst das laengste Warten. Nur Termine im Plan: keine Ampel (Regel wie bisher).
  const lieferantAmpel = ampeln.filter(a => a.grund === 'termin').reduce((m, a) => dringendereAmpel(m, a), null)
    || ampeln.filter(a => a.grund === 'wartet').sort((x, y) => y.tage - x.tage)[0] || null;
  const muster = positionen.filter(p => p?.istMuster && (p.menge ?? 1) > 0 && p.lineItemId);
  const kommtNicht = muster.filter(kommtNichtP).length;
  // "Alle": jedes noch nicht eingetroffene Muster ist gesperrt - nur dann ersetzt "Muster kommt nicht" den Schritt.
  const nichtDa = muster.filter(p => [null, 'bestellt'].includes(standVon(p)) && !musterOhneLieferant(p));
  const kommtNichtStand = kommtNicht ? { anzahl: kommtNicht, von: muster.length, alle: nichtDa.every(kommtNichtP) } : null;
  return { ...ergebnis, naechsterSchritt: naechsterSchritt(ergebnis, { auftrag, versand, beschaffung, lieferantAmpel, nachverfolgbar: pos.gesamt > 0, kommtNicht: kommtNichtStand, jetzt }) };
}

/**
 * Genau ein naechster Schritt je offenem Auftrag - reine Funktion.
 *
 * @param {object} stand  Ergebnis von zeitleiste() ({ auftragsart, verlauf, abgeschlossen, direktversand, gepacktAm })
 * @param {object} [kontext]
 * @param {object} [kontext.auftrag]        fuer das Bestelldatum als Rueckfallebene
 * @param {object} [kontext.versand]        Sendungsbeleg (intern)
 * @param {boolean} [kontext.nachverfolgbar] false, wenn keine Position eine Kennung hat
 * @param {{anzahl:number, von:number, alle?:boolean}|null} [kontext.kommtNicht] gesperrte Muster, noch nicht bei uns;
 *        alle = jedes noch fehlende Muster ist gesperrt (nur dann ersetzt "Muster kommt nicht" den Schritt)
 * @param {object|null} [kontext.lieferantAmpel] dringendste warteAmpel() der beim Lieferanten bestellten Positionen
 * @param {Date}   [kontext.jetzt]
 * @returns {null | { wer: 'wir'|'lieferant'|'kunde', text, detail, aktion, knopf, stufe, faelligSeitTagen, wartetSeitTagen, annahme, rot }}
 *   null = nichts zu tun (abgeschlossen oder storniert).
 *   stufe: "faellig" (wir sind dran), "warten" (jemand anderes ist dran, in der Frist),
 *          "nachhaken" (ab 7 Tagen), "problem" (ab 14 Tagen).
 *   faelligSeitTagen: seit wie vielen Tagen der Schritt faellig ist (0 = heute), null solange gewartet wird.
 *   rot: haelt den Auftrag auf (lib/ampel.mjs) - Muster gesperrt, ab 14 Tagen beim Lieferanten,
 *        bestaetigter Liefertermin vorbei, Wareneingang/Fehlmenge klaeren. Nur dann zeigt "Kunden › Zu tun"
 *        den roten Rand; "sofort" allein ist normale Arbeit.
 */
export function naechsterSchritt(stand, kontext = {}) {
  const basis = naechsterSchrittOhneSperre(stand, kontext);
  const k = kontext.kommtNicht;
  // Ein Teil der Muster kommt nicht, der Rest laeuft weiter (Review 06.11.2026): der normale Schritt bleibt -
  // auch ein echter Verzug beim Lieferanten -, dazu der Hinweis, rot. Ersetzt wird er nur, wenn jedes noch
  // fehlende Muster gesperrt ist (naechsterSchrittOhneSperre); dort steht der Hinweis schon im Text.
  if (!basis || !k?.anzahl || basis.kommtNicht) return basis;
  return { ...basis, text: `${basis.text} · ${k.anzahl === 1 ? '1 Muster kommt' : `${k.anzahl} Muster kommen`} nicht – Kunde informieren`, rot: true };
}

function naechsterSchrittOhneSperre(stand, { auftrag = null, versand = null, beschaffung = [], lieferantAmpel = null, nachverfolgbar = true, kommtNicht = null, jetzt = new Date() } = {}) {
  if (!stand || stand.abgeschlossen) return null;
  const { verlauf, auftragsart: art } = stand;
  const muster = art === AUFTRAGSART.MUSTER;
  const sache = muster ? 'Muster' : 'Ware';
  const ergebnisSchritt = verlauf.at(-1);

  // Spaetere Bestellung erkannt: der Musterauftrag ist inhaltlich fertig, es fehlt nur der Abschluss.
  if (muster && ergebnisSchritt.zustand === 'erledigt' && ergebnisSchritt.automatisch) {
    return schritt('wir', `Kunde hat bestellt${ergebnisSchritt.folgeOrderName ? ` (${ergebnisSchritt.folgeOrderName})` : ''} – Musterauftrag abschließen`,
      'Automatisch erkannt: derselbe Kunde hat nach den Mustern Ware bestellt.', 'kunde_hat_bestellt', 'Abschließen', 'faellig', tageSeit(ergebnisSchritt.am, jetzt), tageSeit(ergebnisSchritt.am, jetzt));
  }

  const aktuell = verlauf.find(s => s.zustand === 'aktuell');
  if (!aktuell) return null;
  // Seit wann der Auftrag in diesem Stand ist: Datum des letzten getanen Schritts, sonst Bestelldatum.
  const davor = verlauf.filter(s => s.zustand === 'erledigt' && s.am).map(s => s.am).sort().pop() || auftrag?.datum || null;
  const tage = tageSeit(davor, jetzt) ?? 0;
  const teil = aktuell.teil ? ` (${aktuell.teil.erledigt} von ${aktuell.teil.gesamt} Artikeln schon)` : '';
  const beimLieferanten = (text, aktion, knopf) => {
    // Mit Bestelldaten: die Ampel je Position (warteAmpel, wie "Je Auftrag"); sonst wie bisher ab dem letzten Schritt.
    const a = lieferantAmpel;
    if (a?.grund === 'termin') {
      return rot(schritt('wir', `Bestätigter Liefertermin überschritten – nachhaken${teil}`, null, aktion, knopf, 'nachhaken', a.tage ?? 0, tage));
    }
    const lt = a?.grund === 'wartet' && Number.isInteger(a.tage) ? a.tage : tage;
    const ws = a?.grund === 'wartet' ? (a.stufe === 'rot' ? 'problem' : a.stufe === 'gelb' ? 'nachhaken' : null) : warnstufe(tage);
    const kopf = ws === 'problem' ? `Problem: ${sache} seit ${tageText(lt)} bestellt und nicht da`
      : ws === 'nachhaken' ? `Beim Lieferanten nachhaken: ${sache} seit ${tageText(lt)} bestellt`
      : text;
    const detail = ws ? `Üblich ist weniger als ${WARTE_NACHHAKEN_TAGE} Tage – ab ${WARTE_PROBLEM_TAGE} Tagen ist es ein Problem.` : `Bestellt vor ${tageText(lt)}.`;
    return rot(schritt('lieferant', kopf + teil, detail, aktion, knopf, ws || 'warten', ws ? lt - WARTE_NACHHAKEN_TAGE : null, lt), ws === 'problem');
  };
  // Gesperrtes Muster (kommt nie): vor "bestellen" und vor "beim Lieferanten" - wie das To-do "Muster nicht
  // lieferbar" auf Heute und die Packstation ("Zu klären"). Bis 06.11. stand hier "seit 15 Tagen bestellt und
  // nicht da" bzw. "Muster beim Lieferanten bestellen" fuer ein Muster, das es nicht mehr gibt.
  if (muster && kommtNicht?.anzahl && kommtNicht.alle !== false && ['bestellt', 'geliefert'].includes(aktuell.schritt)) {
    const welche = kommtNicht.von > 1 ? ` (${kommtNicht.anzahl} von ${kommtNicht.von} Mustern)` : '';
    return { ...rot(schritt('wir', `Muster kommt nicht – Kunde informieren${welche}`, 'Der Lieferant kann es nicht liefern. Kunde informieren, weiter in der Packstation unter „Zu klären“.',
      null, 'Packstation', 'problem', tage, tage)), href: '#/kunden?tab=muster&mpbereich=klaeren', kommtNicht: true };
  }
  if (!nachverfolgbar && STATUS_ORDER.includes(aktuell.schritt)) {
    return schritt('wir', 'Stand im Shopify-Admin prüfen', 'Die Positionen dieser Bestellung haben keine Kennung – der Stand lässt sich hier nicht festhalten.', null, null, 'faellig', tage, tage);
  }
  if (aktuell.schritt === 'geliefert' && beschaffung.length) {
    const klaerung = beschaffung.find(e => e.beschaffung?.klaerung);
    if (klaerung) return rot(schritt('wir', 'Bestellmenge / Wareneingang klären', beschaffungText(klaerung), 'geliefert', 'Wareneingang prüfen', 'problem', 0, tage));
    const schaden = beschaffung.find(e => restmenge(e) > 0 && e.beschaffung.wareneingang.angekommen > e.beschaffung.wareneingang.verwendbar);
    if (schaden) return rot(schritt('wir', 'Nicht verwendbare Ware / Fehlmenge klären', beschaffungText(schaden), 'geliefert', 'Wareneingang prüfen', 'problem', 0, tage));
    if (beschaffung.every(e => e.beschaffung?.liefertermin)) {
      const termin = beschaffung.map(e => e.beschaffung.liefertermin).sort()[0];
      const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(jetzt);
      const detail = beschaffung.map(beschaffungText).filter(Boolean).join(' · ');
      return termin < heute ? rot(schritt('wir', 'Bestätigter Liefertermin überschritten – nachhaken', detail, 'geliefert', 'Wareneingang prüfen', 'nachhaken', 0, tage))
        : schritt('lieferant', `Lieferung zugesagt zum ${termin.split('-').reverse().join('.')}`, detail, 'geliefert', 'Wareneingang bestätigen', 'warten', null, tage);
    }
  }

  if (muster) {
    switch (aktuell.schritt) {
      case 'bestellt':
        return schritt('wir', `Muster beim Lieferanten bestellen${teil}`, 'Die Muster kommen zu uns in den Laden und gehen von dort an den Kunden.', 'bestellt', 'Muster sind bestellt', 'faellig', tage, tage);
      case 'geliefert':
        return beimLieferanten('Lieferant schickt die Muster an uns', 'geliefert', 'Muster sind angekommen');
      case 'raus':
        if (stand.direktversand) return beimLieferanten('Lieferant schickt die Muster direkt an den Kunden', 'raus', 'Ist an den Kunden raus…');
        if (stand.eigenerBestand) {
          // Persoenliche Uebergabe belegt Empfang; Postversand braucht seinen getrennten Versanddialog.
          const kunde = kundeUndOrt(auftrag);
          return stand.eigenerBestand === 'vorbei'
            ? schritt('wir', `Muster vorbeibringen bei ${kunde.name}`, `Aus eigenem Bestand/Katalog${kunde.ort ? ` · ${kunde.ort}` : ''} – nicht beim Lieferanten bestellen.`, 'kunde_hat_muster', 'Erledigt – Kunde hat Muster', 'faellig', tage, tage)
            : schritt('wir', `Muster verschicken an ${kunde.name}`, `Aus eigenem Bestand/Katalog${kunde.ort ? ` · ${kunde.ort}` : ''} – nicht beim Lieferanten bestellen.`, 'raus', 'Muster sind verschickt…', 'faellig', tage, tage);
        }
        if (stand.gepacktAm) {
          const seit = tageSeit(stand.gepacktAm, jetzt) ?? 0;
          return schritt('wir', `Umschlag gepackt am ${tagDatum(stand.gepacktAm)} – zur Post bringen und als verschickt eintragen`,
            'Gepackt ist noch nicht versandt. Ist der Umschlag schon raus, nur noch eintragen.', 'raus', 'Muster sind verschickt…', 'faellig', seit, seit);
        }
        return schritt('wir', `Muster labeln und an den Kunden schicken${teil}`, 'Neu labeln, eintüten, verschicken.', 'raus', 'Muster sind verschickt…', 'faellig', tage, tage);
      case 'kunde_hat_muster':
      case 'nachgefasst':
      case 'ergebnis': {
        const nach = musterNachfassen([{ orderId: auftrag?.id, orderName: auftrag?.name,
          auftragsart: 'muster', verlauf, auftrag, email: auftrag?.details?.kunde?.email,
          telefon: auftrag?.details?.kunde?.telefon, beratungOffen: auftrag?.checks?.beratung === 'Ja' }], { jetzt }).offen[0];
        if (nach) return { ...schritt('wir', nach.stufe === 'erinnerung' ? 'Muster-Erinnerung im bestehenden Ablauf prüfen' : 'Muster nach Versand nachfassen',
          'Die Nachfassansicht prüft Kontaktweg, Stoppliste und den Versandlauf. Versand ist kein Empfangsnachweis.',
          null, 'Nachfragen prüfen', 'faellig', Math.max(0, nach.tage - (nach.stufe === 'erinnerung' ? ERINNERUNG_NACH_TAGEN : ERSTE_NACH_TAGEN)), nach.tage), href: NACHFRAGE_MAILS_HREF };
        if (aktuell.schritt === 'kunde_hat_muster') return schritt('kunde', 'Muster sind unterwegs – Empfang noch nicht belegt',
          'Nur tatsächlichen Empfang bestätigen. Die bestehende Nachfassansicht führt ihre Fristen unabhängig vom Empfangsnachweis.',
          'kunde_hat_muster', 'Empfang bestätigt…', 'warten', null, tage);
        return { ...schritt('kunde', 'Kunde schaut sich die Muster an',
          'Nachfragen, Erinnerungen und Stoppliste im bestehenden Ablauf prüfen. Ein Ergebnis erst nach Rückmeldung festhalten.',
          null, 'Nachfassverlauf prüfen', 'warten', null, tage), href: NACHFRAGE_MAILS_HREF };
      }
      default:
        return null;
    }
  }

  // Gemischte Wege bzw. Lagerware (#1995, zeitleiste() wege): sagen, wer was bringt.
  const w = stand.wege || null;
  const vonUns = n => `${n === 1 ? '1 Position' : `${n} Positionen`} von uns`;
  const lagerDetail = 'Aus eigenem Lager – nicht beim Lieferanten bestellen. Zuschneiden, packen und verschicken unter „Von uns abschicken“.';
  switch (aktuell.schritt) {
    case 'bestellt':
      return schritt('wir', `Ware beim Lieferanten bestellen${teil}`, w?.lager ? `${vonUns(w.lager)} aus eigenem Lager – nicht bestellen, sondern zuschneiden und abschicken.` : null,
        'bestellt', 'Ware ist bestellt', 'faellig', tage, tage);
    case 'geliefert': {
      if (w && !w.zuUnsUnterwegs) {
        // Nichts ist mehr zu uns unterwegs - offen ist nur der Zuschnitt aus eigenem Lager.
        const text = w.lager === w.gesamt ? `Aus eigenem Lager zuschneiden und abschicken${teil}`
          : [w.direktOffen ? 'Hersteller liefert direkt' : null, `${vonUns(w.zuschneiden)} zuschneiden und abschicken`].filter(Boolean).join(' · ');
        return { ...schritt('wir', text, lagerDetail, null, 'Von uns abschicken', 'faellig', tage, tage), href: '#/heute' };
      }
      // Ware vom Lieferanten ist unterwegs zu uns; daneben steht, was wir selbst schon tun koennen
      // ("Von uns abschicken" auf Heute) - #1104: die Unterlage liegt da, der Teppich kommt noch.
      const r = beimLieferanten('Lieferant liefert die Ware an uns', 'geliefert', 'Ware ist angekommen');
      const dazu = [w?.zuschneiden ? `${vonUns(w.zuschneiden)} zuschneiden` : null, w?.vonUnsRaus ? `${vonUns(w.vonUnsRaus)} verschicken` : null].filter(Boolean);
      return dazu.length ? { ...r, text: [r.text, ...dazu].join(' · ') } : r;
    }
    case 'raus': {
      if (stand.direktversand) return beimLieferanten('Lieferant liefert direkt an den Kunden', 'raus', 'Ist an den Kunden raus…');
      // Bei uns liegt nichts mehr, offen ist nur der Zuschnitt aus eigenem Lager: kein Versand-Dialog,
      // sondern "Von uns abschicken" (sonst kreuzte der Dialog die ungeschnittene Rolle an).
      if (w?.zuschneiden && !w.vonUnsRaus) {
        const text = [w.direktOffen ? 'Hersteller liefert direkt' : null, `${vonUns(w.zuschneiden)} zuschneiden und abschicken`].filter(Boolean).join(' · ');
        return { ...schritt('wir', text, lagerDetail, null, 'Von uns abschicken', 'faellig', tage, tage), href: '#/heute' };
      }
      // Ware vom Lieferanten ist da, die Lagerware noch nicht zugeschnitten: steht dabei.
      const zuschnitt = w?.zuschneiden ? ` · ${vonUns(w.zuschneiden)} zuschneiden` : '';
      // Unsere Positionen sind raus, offen ist nur noch, was der Hersteller direkt schickt.
      if (w?.direktOffen && !w.vonUnsRaus) return beimLieferanten('Hersteller liefert direkt an den Kunden', 'raus', 'Ist an den Kunden raus…');
      if (w?.direktOffen) {
        // Der Versand-Dialog kreuzt die Direktware nicht vorab an (lib/versand.mjs vorauswahl).
        return schritt('wir', `Hersteller liefert direkt · ${vonUns(w.vonUnsRaus)} verschicken${zuschnitt}`, 'Die Direktware schickt der Hersteller; unsere Position packen und verschicken.',
          'raus', 'An Kunden raus…', 'faellig', tage, tage);
      }
      return schritt('wir', `Ware an den Kunden übergeben oder verschicken${teil}${zuschnitt}`, null, 'raus', 'An Kunden raus…', 'faellig', tage, tage);
    }
    case 'erledigt':
      if (versand?.zugestellt || tage >= WARE_ABSCHLIESSEN_NACH_TAGEN) {
        return schritt('wir', 'Ware ist beim Kunden – Auftrag abschließen', versand?.zugestellt ? 'Laut Sendungsverfolgung zugestellt.' : `Seit ${tageText(tage)} an den Kunden raus.`, 'erledigt', 'Abschließen', 'faellig', versand?.zugestellt ? 0 : tage - WARE_ABSCHLIESSEN_NACH_TAGEN, tage);
      }
      return schritt('kunde', 'Ware ist unterwegs zum Kunden', `An den Kunden raus vor ${tageText(tage)}.`, 'erledigt', 'Abschließen', 'warten', null, tage);
    default:
      return null;
  }
}

/**
 * Wer einen schon bestellten gekettelten Teppich kettelt, fuer die Kundenakte. Belegt ist das nur
 * durch den Vermerk beim Bestellen; fehlt er bei Direktversand, sagt die Akte genau das.
 */
export function kettelwegText(p, eintrag) {
  if (!wirdGekettelt(p?.ausfuehrung) || !eintrag?.status) return null;
  if (eintrag.ueber === 'kettler') return 'Unser Kettler';
  if (eintrag.ueber === 'kunde') return 'Lieferant, direkt an den Kunden';
  return p.route === ROUTE.SUPPLIER_DIRECT ? 'Nicht vermerkt, bitte klären' : null;
}

/** Name und Ort (Stadt der Lieferadresse) - damit man "Kunde in der Naehe" erkennt. */
export function kundeUndOrt(auftrag) {
  const d = auftrag?.details || {};
  const ok = v => v && v !== '–' ? String(v).trim() : '';
  return { name: ok(d.kunde?.name) || ok(d.lieferadresse?.name) || auftrag?.name || 'Kunde', ort: ok(d.lieferadresse?.ort) || null };
}

function schritt(wer, text, detail, aktion, knopf, stufe, faelligSeitTagen, wartetSeitTagen) {
  return { wer, text, detail: detail || null, aktion, knopf, stufe, faelligSeitTagen: faelligSeitTagen ?? null, wartetSeitTagen: wartetSeitTagen ?? null, annahme: false, rot: false };
}

/** Markiert einen Schritt als rot (haelt den Auftrag auf, lib/ampel.mjs). */
const rot = (s, ja = true) => (ja ? { ...s, rot: true } : s);

const STUFEN_RANG = { problem: 3, nachhaken: 2, faellig: 1, warten: 0 };

/** Der dringendste von mehreren naechsten Schritten (z. B. ueber alle Bestellungen eines Kunden). */
export function dringendsterSchritt(schritte = []) {
  return schritte.filter(Boolean).slice().sort((a, b) =>
    (STUFEN_RANG[b.stufe] ?? 0) - (STUFEN_RANG[a.stufe] ?? 0) || (b.faelligSeitTagen ?? -1) - (a.faelligSeitTagen ?? -1) || (b.wartetSeitTagen ?? 0) - (a.wartetSeitTagen ?? 0))[0] || null;
}

/**
 * Zeitleisten fuer das ganze Bestellmodell - eine Abfrage fuer Kundenakte,
 * Bestellliste und die Heute-Seite.
 *
 * @returns {Map<string, object>} orderId -> zeitleiste()
 */
/**
 * @param {(auftrag:object)=>string[]|Set<string>|null} [opt.gesperrtFuer] lineItemIds gesperrter Muster je Auftrag
 *        (Mustersperre, im Server aus mustersperre.json - dieselbe Liste wie `gesperrteMuster` der Bestellungen)
 */
export function zeitleistenFuerModell(modell, { statusAlle = {}, verlaufAlle = {}, gepackt = {}, gesperrtFuer = () => null, jetzt = new Date() } = {}) {
  const alle = [...(modell?.auftraege ?? []), ...(modell?.testauftraege ?? [])];
  const jeKunde = new Map();
  for (const a of alle) {
    const k = kundenSchluessel(a);
    if (!jeKunde.has(k)) jeKunde.set(k, []);
    jeKunde.get(k).push(a);
  }
  const ergebnis = new Map();
  for (const a of alle) {
    const folge = auftragsart(a) === AUFTRAGSART.MUSTER && !a.testbestellung ? folgebestellung(a, jeKunde.get(kundenSchluessel(a))) : null;
    ergebnis.set(a.id, zeitleiste(a, { statusAlle, ereignisse: verlaufAlle[a.id]?.ereignisse ?? [], folge, gepacktAm: gepacktAmFuer(a.id, gepackt), gesperrt: gesperrtFuer(a), jetzt }));
  }
  return ergebnis;
}

/** Welche Schritte sich fuer einen Auftrag setzen lassen (fuer "Etwas anderes ist passiert ..."). */
export function setzbareSchritte(art) {
  return art === AUFTRAGSART.MUSTER
    ? ['bestellt', 'geliefert', 'raus', 'kunde_hat_muster', 'nachgefasst', 'kunde_hat_bestellt', 'kein_interesse', 'muster_nicht_verfuegbar']
    : ['bestellt', 'geliefert', 'kunde_informiert', 'raus', 'erledigt'];
}
