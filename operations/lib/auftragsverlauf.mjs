/**
 * Zeitleiste je Auftrag und der eine naechste Schritt.
 *
 * Der Inhaber will pro Kunde/Bestellung sofort sehen, wo es steht ("der Kunde
 * hat die Muster bekommen"), und mit einem Klick weiterkommen. Dafuer gibt es
 * zwei Strecken:
 *
 *   Muster: angefragt -> beim Lieferanten bestellt -> bei uns angekommen ->
 *           gelabelt und an Kunden verschickt -> Kunde hat Muster ->
 *           nachgefasst -> Ergebnis (Kunde hat bestellt | kein Interesse)
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
import path from 'node:path';
import os from 'node:os';
import { positionKey, STATUS_ORDER } from './auftragsstatus.mjs';
import { WARTE_NACHHAKEN_TAGE, WARTE_PROBLEM_TAGE, warnstufe } from './lieferanten.mjs';
import { kundenSchluessel } from './kundensuche.mjs';
import { ROUTE } from './route.mjs';

/** Nachfassen wird so viele Tage nach "Kunde hat Muster" faellig. */
export const NACHFASSEN_NACH_TAGEN = 5;
/** Ab so vielen Tagen seit Versand wird "Kunde hat Muster" als Annahme vorgeschlagen (nie still gesetzt). */
export const MUSTER_ANGEKOMMEN_ANNAHME_TAGE = 3;
/** So lange nach dem Nachfassen wartet der Auftrag ruhig auf den Kunden, danach: Ergebnis klaeren. */
export const ERGEBNIS_KLAEREN_NACH_TAGEN = 14;
/** Ware "an Kunden raus": nach so vielen Tagen wird das Abschliessen faellig. */
export const WARE_ABSCHLIESSEN_NACH_TAGEN = 7;

export const AUFTRAGSART = Object.freeze({ MUSTER: 'muster', WARE: 'ware' });

/** Schritte, die je Auftrag (nicht je Position) gespeichert werden. */
export const AUFTRAGS_SCHRITTE = Object.freeze(['kunde_hat_muster', 'nachgefasst', 'kunde_hat_bestellt', 'kein_interesse']);
const ERGEBNIS_SCHRITTE = Object.freeze(['kunde_hat_bestellt', 'kein_interesse']);
/** Alles, was POST /api/einkauf/auftragsstatus mit aktion "schritt" annimmt. */
export const SCHRITT_WERTE = Object.freeze([...STATUS_ORDER, ...AUFTRAGS_SCHRITTE, 'notiz', 'zurueck']);

export const SCHRITT_LABEL = Object.freeze({
  muster: Object.freeze({
    angefragt: 'Muster angefragt',
    bestellt: 'Muster beim Lieferanten bestellt',
    geliefert: 'Muster bei uns angekommen',
    raus: 'Gelabelt und an Kunden verschickt',
    kunde_hat_muster: 'Kunde hat Muster',
    nachgefasst: 'Nachgefasst',
    ergebnis: 'Ergebnis',
    kunde_hat_bestellt: 'Kunde hat bestellt',
    kein_interesse: 'Kein Interesse',
    erledigt: 'Abgeschlossen',
  }),
  ware: Object.freeze({
    kunde_hat_bestellt: 'Kunde hat bestellt',
    bestellt: 'Ware beim Lieferanten bestellt',
    geliefert: 'Geliefert an uns',
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
export function leseVerlauf(file) {
  try {
    const roh = JSON.parse(fs.readFileSync(file, 'utf8'));
    return roh && typeof roh === 'object' && roh.auftraege && typeof roh.auftraege === 'object' ? roh.auftraege : {};
  } catch {
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
export function haengeEreignisAn(file, { orderId, schritt, actor, notiz = null, bezug = null, jetzt = new Date() } = {}) {
  const id = String(orderId ?? '').trim();
  if (!id) throw new AuftragsverlaufFehler('orderId ist Pflicht');
  if (!actor) throw new AuftragsverlaufFehler('actor ist Pflicht');
  if (![...AUFTRAGS_SCHRITTE, 'notiz', 'zurueck'].includes(schritt)) throw new AuftragsverlaufFehler(`Unbekannter Schritt "${schritt}"`);
  if (schritt === 'notiz' && !clip(notiz, 2000)) throw new AuftragsverlaufFehler('Die Notiz ist leer');
  if (schritt === 'zurueck' && !AUFTRAGS_SCHRITTE.includes(bezug)) throw new AuftragsverlaufFehler('Welcher Schritt zurückgenommen wird, fehlt');

  const alle = leseVerlauf(file);
  const ereignis = { schritt, am: jetzt.toISOString(), von: String(actor) };
  if (notiz && clip(notiz, 2000)) ereignis.notiz = clip(notiz, 2000);
  if (schritt === 'zurueck') ereignis.bezug = bezug;
  const bisher = Array.isArray(alle[id]?.ereignisse) ? alle[id].ereignisse : [];
  alle[id] = { ...(alle[id] || {}), ereignisse: [...bisher, ereignis] };

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, auftraege: alle }, null, 2));
  fs.renameSync(tmp, file);
  return ereignis;
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
  const eintraege = positionen.map(p => statusAlle[positionKey(auftrag.id, p.lineItemId)] || null);
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

const DIREKT_ROUTEN = new Set([ROUTE.SUPPLIER_DIRECT, ROUTE.SUPPLIER_TO_SITE]);
const MUSTER_OHNE_LIEFERANT = new Set([ROUTE.SAMPLE_STOCK, ROUTE.SAMPLE_CUT]);

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
export function zeitleiste(auftrag, { statusAlle = {}, ereignisse = [], folge = null, jetzt = new Date() } = {}) {
  const art = auftragsart(auftrag);
  const label = SCHRITT_LABEL[art];
  const pos = positionsStand(auftrag, statusAlle);
  const { jeSchritt, notizen } = wirksameEreignisse(ereignisse);
  const versand = versandBeleg(auftrag);
  const positionen = auftrag?.positionen ?? [];

  const ausPosition = (status, extra = {}) => {
    const s = pos.schritt(status);
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
  if (art === AUFTRAGSART.MUSTER) {
    const brauchtLieferant = !positionen.every(p => MUSTER_OHNE_LIEFERANT.has(p.route));
    schritte.push(start('angefragt'));
    if (brauchtLieferant) schritte.push(ausPosition('bestellt'), ausPosition('geliefert'));
    schritte.push(ausVersand());

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
    const ware = positionen.filter(p => !p.istMuster);
    direkt = ware.length > 0 && ware.every(p => DIREKT_ROUTEN.has(p.route));
    schritte.push(start('kunde_hat_bestellt'), ausPosition('bestellt'));
    if (!direkt) schritte.push(ausPosition('geliefert'));
    schritte.push(ausVersand(), ausPosition('erledigt'));
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

  const ergebnis = { auftragsart: art, verlauf, verlaufNotizen: notizen, abgeschlossen, direktversand: direkt };
  return { ...ergebnis, naechsterSchritt: naechsterSchritt(ergebnis, { auftrag, versand, nachverfolgbar: pos.gesamt > 0, jetzt }) };
}

/**
 * Genau ein naechster Schritt je offenem Auftrag - reine Funktion.
 *
 * @param {object} stand  Ergebnis von zeitleiste() ({ auftragsart, verlauf, abgeschlossen, direktversand })
 * @param {object} [kontext]
 * @param {object} [kontext.auftrag]        fuer das Bestelldatum als Rueckfallebene
 * @param {object} [kontext.versand]        Sendungsbeleg (intern)
 * @param {boolean} [kontext.nachverfolgbar] false, wenn keine Position eine Kennung hat
 * @param {Date}   [kontext.jetzt]
 * @returns {null | { wer: 'wir'|'lieferant'|'kunde', text, detail, aktion, knopf, stufe, faelligSeitTagen, wartetSeitTagen, annahme }}
 *   null = nichts zu tun (abgeschlossen oder storniert).
 *   stufe: "faellig" (wir sind dran), "warten" (jemand anderes ist dran, in der Frist),
 *          "nachhaken" (ab 7 Tagen), "problem" (ab 14 Tagen).
 *   faelligSeitTagen: seit wie vielen Tagen der Schritt faellig ist (0 = heute), null solange gewartet wird.
 */
export function naechsterSchritt(stand, { auftrag = null, versand = null, nachverfolgbar = true, jetzt = new Date() } = {}) {
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
    const ws = warnstufe(tage);
    const kopf = ws === 'problem' ? `Problem: ${sache} seit ${tageText(tage)} bestellt und nicht da`
      : ws === 'nachhaken' ? `Beim Lieferanten nachhaken: ${sache} seit ${tageText(tage)} bestellt`
      : text;
    const detail = ws ? `Üblich ist weniger als ${WARTE_NACHHAKEN_TAGE} Tage – ab ${WARTE_PROBLEM_TAGE} Tagen ist es ein Problem.` : `Bestellt vor ${tageText(tage)}.`;
    return schritt('lieferant', kopf + teil, detail, aktion, knopf, ws || 'warten', ws ? tage - WARTE_NACHHAKEN_TAGE : null, tage);
  };
  if (!nachverfolgbar && STATUS_ORDER.includes(aktuell.schritt)) {
    return schritt('wir', 'Stand im Shopify-Admin prüfen', 'Die Positionen dieser Bestellung haben keine Kennung – der Stand lässt sich hier nicht festhalten.', null, null, 'faellig', tage, tage);
  }

  if (muster) {
    switch (aktuell.schritt) {
      case 'bestellt':
        return schritt('wir', `Muster beim Lieferanten bestellen${teil}`, 'Die Muster kommen zu uns in den Laden und gehen von dort an den Kunden.', 'bestellt', 'Muster sind bestellt', 'faellig', tage, tage);
      case 'geliefert':
        return beimLieferanten('Lieferant schickt die Muster an uns', 'geliefert', 'Muster sind angekommen');
      case 'raus':
        return schritt('wir', `Muster labeln und an den Kunden schicken${teil}`, 'Neu labeln, eintüten, verschicken.', 'raus', 'Muster sind verschickt', 'faellig', tage, tage);
      case 'kunde_hat_muster':
        if (tage >= MUSTER_ANGEKOMMEN_ANNAHME_TAGE) {
          return { ...schritt('wir', `Muster vor ${tageText(tage)} verschickt – sind sie angekommen?`, 'Vermutlich ja. Bestätigen, dann läuft die Frist zum Nachfassen.', 'kunde_hat_muster', 'Ja, Kunde hat Muster', 'faellig', tage - MUSTER_ANGEKOMMEN_ANNAHME_TAGE, tage), annahme: true };
        }
        return schritt('kunde', 'Muster sind unterwegs zum Kunden', `Verschickt vor ${tageText(tage)}.`, 'kunde_hat_muster', 'Kunde hat Muster', 'warten', null, tage);
      case 'nachgefasst':
        if (tage >= NACHFASSEN_NACH_TAGEN) {
          return schritt('wir', `Nachfassen: Muster liegen seit ${tageText(tage)} beim Kunden`, 'Kunden anrufen und fragen, ob etwas gefällt.', 'nachgefasst', 'Nachgefasst', 'faellig', tage - NACHFASSEN_NACH_TAGEN, tage);
        }
        return schritt('kunde', 'Kunde schaut sich die Muster an', `Nachfassen in ${tageText(NACHFASSEN_NACH_TAGEN - tage)}.`, 'nachgefasst', 'Schon nachgefasst', 'warten', null, tage);
      case 'ergebnis':
        if (tage >= ERGEBNIS_KLAEREN_NACH_TAGEN) {
          return schritt('wir', `Seit ${tageText(tage)} keine Rückmeldung – Ergebnis klären`, 'Nochmal nachfassen oder den Auftrag als „kein Interesse“ abschließen.', 'ergebnis', 'Ergebnis eintragen …', 'faellig', tage - ERGEBNIS_KLAEREN_NACH_TAGEN, tage);
        }
        return schritt('kunde', 'Kunde überlegt', `Nachgefasst vor ${tageText(tage)}. Ergebnis eintragen, sobald er sich meldet.`, 'ergebnis', 'Ergebnis eintragen …', 'warten', null, tage);
      default:
        return null;
    }
  }

  switch (aktuell.schritt) {
    case 'bestellt':
      return schritt('wir', `Ware beim Lieferanten bestellen${teil}`, null, 'bestellt', 'Ware ist bestellt', 'faellig', tage, tage);
    case 'geliefert':
      return beimLieferanten('Lieferant liefert die Ware an uns', 'geliefert', 'Ware ist angekommen');
    case 'raus':
      if (stand.direktversand) return beimLieferanten('Lieferant liefert direkt an den Kunden', 'raus', 'Ist an den Kunden raus');
      return schritt('wir', `Ware an den Kunden übergeben oder verschicken${teil}`, null, 'raus', 'An Kunden raus', 'faellig', tage, tage);
    case 'erledigt':
      if (versand?.zugestellt || tage >= WARE_ABSCHLIESSEN_NACH_TAGEN) {
        return schritt('wir', 'Ware ist beim Kunden – Auftrag abschließen', versand?.zugestellt ? 'Laut Sendungsverfolgung zugestellt.' : `Seit ${tageText(tage)} an den Kunden raus.`, 'erledigt', 'Abschließen', 'faellig', versand?.zugestellt ? 0 : tage - WARE_ABSCHLIESSEN_NACH_TAGEN, tage);
      }
      return schritt('kunde', 'Ware ist unterwegs zum Kunden', `An den Kunden raus vor ${tageText(tage)}.`, 'erledigt', 'Abschließen', 'warten', null, tage);
    default:
      return null;
  }
}

function schritt(wer, text, detail, aktion, knopf, stufe, faelligSeitTagen, wartetSeitTagen) {
  return { wer, text, detail: detail || null, aktion, knopf, stufe, faelligSeitTagen: faelligSeitTagen ?? null, wartetSeitTagen: wartetSeitTagen ?? null, annahme: false };
}

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
export function zeitleistenFuerModell(modell, { statusAlle = {}, verlaufAlle = {}, jetzt = new Date() } = {}) {
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
    ergebnis.set(a.id, zeitleiste(a, { statusAlle, ereignisse: verlaufAlle[a.id]?.ereignisse ?? [], folge, jetzt }));
  }
  return ergebnis;
}

/** Welche Schritte sich fuer einen Auftrag setzen lassen (fuer "Etwas anderes ist passiert ..."). */
export function setzbareSchritte(art) {
  return art === AUFTRAGSART.MUSTER
    ? ['bestellt', 'geliefert', 'raus', 'kunde_hat_muster', 'nachgefasst', 'kunde_hat_bestellt', 'kein_interesse']
    : ['bestellt', 'geliefert', 'raus', 'erledigt'];
}
