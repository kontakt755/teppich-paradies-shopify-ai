/**
 * Lieferanten: Stammdaten, Uebersicht je Lieferant und fertige Bestellmails.
 *
 * Bisher war der Lieferant nur ein Gruppierungsmerkmal (Kuerzel A-D aus
 * bestelluebersicht.mjs). Dieses Modul legt Stammdaten daneben - Bestellweg,
 * Ansprechperson, Kundennummer - und baut daraus die Bestellung, die der
 * Mitarbeiter nur noch abschicken muss.
 *
 * Grenzen:
 * - Die Stammdaten liegen ausschliesslich privat unter
 *   $TP_PRIVAT_DIR/lieferanten/stammdaten.json. Im Repository steht nur
 *   lieferanten.beispiel.json mit Pseudonymen (AGENTS.md Punkt 8).
 * - Es wird NICHTS versendet (D8). bestellmail() liefert Text und einen
 *   mailto:-Link; abschicken tut ein Mensch im eigenen Mailprogramm.
 * - Nichts wird geraten. Positionen ohne Artikelnummer, Menge oder
 *   Lieferanschrift landen in `fehlt`, nie stillschweigend in der Mail.
 * - Keine Preise: die Antworten werden Feld fuer Feld aufgebaut, das
 *   Positionsobjekt der Bestelluebersicht (mit `preis` und dem ganzen
 *   `einkauf`-Block) wird nie durchgereicht. Aus den Stammdaten kommen nur
 *   die hier bekannten Felder zurueck - traegt jemand dort Konditionen ein,
 *   verlassen sie den Rechner nicht ueber diese Endpunkte.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { UNGEKLAERT, formatDe } from './umrechnung.mjs';
import { ROUTE } from './route.mjs';
import { positionKey, filterGruppe } from './auftragsstatus.mjs';
import { musterOhneLieferant, HERKUNFT } from './musterherkunft.mjs';
import { KETTEL_PUFFER_CM, kettelZuschnitt, wirdGekettelt } from './kettelpuffer.mjs';

export { KETTEL_PUFFER_CM, kettelZuschnitt };

export const BESTELLWEGE = Object.freeze(['portal', 'mail', 'telefon']);
export const MUSTER_LIEFERUNG = Object.freeze(['kunde', 'laden']);
// Ware kann zusaetzlich an unseren Kettelservice gehen (Inhaber 2026-10-19): Zuschnitt
// ungekettelt dorthin, wir ketteln dort guenstiger und liefern selbst bzw. verschicken von dort.
export const WARE_LIEFERUNG = Object.freeze(['kunde', 'laden', 'kettler']);
/** PLZ-Bereiche, in die wir selbst liefern koennen: Berlin (10-14) und unser Umland (16). */
const KETTLER_NAH_PLZ = /^1[0-46]/;

/**
 * Wartezeit-Schwellen: ab 7 Tagen beim Lieferanten nachhaken, ab 14 Tagen ist
 * es ein Problem. Dieselben Werte wie AF_WARTE_WARN / AF_WARTE_CRIT im
 * Frontend (docs/ai-dashboard) - das ist ein Browser-Skript und laesst sich
 * hier nicht importieren; operations/tests/lieferanten.test.mjs prueft, dass
 * beide Seiten dieselben Zahlen tragen.
 */
export const WARTE_NACHHAKEN_TAGE = 7;
export const WARTE_PROBLEM_TAGE = 14;

/**
 * Obergrenze fuer den ganzen mailto:-Link. Es gibt keine genormte Grenze;
 * Outlook unter Windows und einige Browser schneiden um 2000 Zeichen ab. Ist
 * der Link laenger, traegt er nur Empfaenger und Betreff - der Text wird dann
 * kopiert statt uebergeben, damit keine halbe Bestellung im Mailfenster steht.
 */
export const MAILTO_MAX = 1800;

const NICHT_HINTERLEGT = null;

function defaultPrivatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

export function stammdatenPfad(privatDir) {
  return path.join(privatDir || defaultPrivatDir(), 'lieferanten', 'stammdaten.json');
}

// ---------------------------------------------------------------- Pruefung

const MAIL_RE = /^[^\s@<>,;:?&"'%]+@[^\s@<>,;:?&"'%]+\.[a-z]{2,}$/i;
const TELEFON_RE = /^[+0-9][0-9 ()/-]{2,39}$/;
const KENNUNG_RE = /^[A-Z0-9][A-Z0-9_-]{0,19}$/;

function istObjekt(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Kennung so, wie bestelluebersicht.mjs (kuerzelAus) sie fuehrt: Grossbuchstaben. */
export function kennung(wert) {
  return String(wert ?? '').trim().toUpperCase();
}

function pruefer(fehler, ort) {
  const melde = (feld, text) => { fehler.push(`${ort}.${feld}: ${text}`); return NICHT_HINTERLEGT; };
  const text = (roh, feld, max = 300) => {
    if (roh === undefined || roh === null) return NICHT_HINTERLEGT;
    if (typeof roh !== 'string' && typeof roh !== 'number') return melde(feld, 'muss Text sein');
    const s = String(roh).trim();
    if (!s) return NICHT_HINTERLEGT;
    return s.length > max ? s.slice(0, max) : s;
  };
  return {
    text,
    auswahl(roh, feld, erlaubt) {
      const s = text(roh, feld);
      if (s === null) return null;
      return erlaubt.includes(s.toLowerCase()) ? s.toLowerCase() : melde(feld, `"${s}" ist nicht erlaubt (${erlaubt.join(' | ')})`);
    },
    mail(roh, feld) {
      const s = text(roh, feld);
      if (s === null) return null;
      return MAIL_RE.test(s) ? s : melde(feld, 'keine gueltige Mailadresse');
    },
    telefon(roh, feld) {
      const s = text(roh, feld);
      if (s === null) return null;
      return TELEFON_RE.test(s) ? s : melde(feld, 'keine gueltige Telefonnummer');
    },
    url(roh, feld) {
      const s = text(roh, feld, 500);
      if (s === null) return null;
      try {
        const u = new URL(s);
        if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString();
      } catch { /* faellt unten durch */ }
      return melde(feld, 'keine gueltige http(s)-Adresse');
    },
    werktage(roh, feld) {
      if (roh === undefined || roh === null || roh === '') return null;
      const n = Number(roh);
      return Number.isInteger(n) && n >= 1 && n <= 365 ? n : melde(feld, 'muss eine ganze Zahl von 1 bis 365 sein');
    },
    domains(roh, feld) {
      if (roh === undefined || roh === null) return [];
      if (!Array.isArray(roh)) { melde(feld, 'muss eine Liste sein'); return []; }
      const ok = [];
      for (const d of roh.slice(0, 10)) {
        const s = String(d ?? '').trim().toLowerCase().replace(/^@/, '');
        if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(s)) ok.push(s); else melde(feld, `"${String(d).slice(0, 60)}" ist keine Domain`);
      }
      return [...new Set(ok)];
    },
    objekt(roh, feld) {
      if (roh === undefined || roh === null) return {};
      if (!istObjekt(roh)) { melde(feld, 'muss ein Objekt sein'); return {}; }
      return roh;
    },
  };
}

function anschrift(roh, p, feld) {
  const a = p.objekt(roh, feld);
  const o = {
    name: p.text(a.name, `${feld}.name`),
    strasse: p.text(a.strasse, `${feld}.strasse`),
    plz: p.text(a.plz, `${feld}.plz`, 12),
    ort: p.text(a.ort, `${feld}.ort`),
    land: p.text(a.land, `${feld}.land`),
  };
  return o.strasse && o.plz && o.ort ? o : null;
}

function pruefeLieferant(id, roh, fehler) {
  const p = pruefer(fehler, `lieferanten.${id}`);
  const w = p.objekt(roh.ware, 'ware');
  const m = p.objekt(roh.muster, 'muster');
  const ml = p.objekt(roh.mail, 'mail');
  const l = {
    id,
    anzeigename: p.text(roh.anzeigename, 'anzeigename'),
    kundennummer: p.text(roh.kundennummer, 'kundennummer', 60),
    ware: {
      weg: p.auswahl(w.weg, 'ware.weg', BESTELLWEGE),
      portalUrl: p.url(w.portalUrl, 'ware.portalUrl'),
      mail: p.mail(w.mail, 'ware.mail'),
      telefon: p.telefon(w.telefon, 'ware.telefon'),
      // Ohne Eintrag geht Ware direkt an die Kunden (Inhaber 2026-10-14); "laden" nur als Ausnahme.
      lieferung: p.auswahl(w.lieferung, 'ware.lieferung', MUSTER_LIEFERUNG),
      // Wie muster.nachBezeichnung: die Warenmail nennt die Bezeichnung des Herstellers.
      nachBezeichnung: w.nachBezeichnung === true,
    },
    muster: {
      weg: p.auswahl(m.weg, 'muster.weg', BESTELLWEGE),
      ansprechperson: p.text(m.ansprechperson, 'muster.ansprechperson', 120),
      mail: p.mail(m.mail, 'muster.mail'),
      telefon: p.telefon(m.telefon, 'muster.telefon'),
      portalUrl: p.url(m.portalUrl, 'muster.portalUrl'),
      lieferung: p.auswahl(m.lieferung, 'muster.lieferung', MUSTER_LIEFERUNG),
      // Hersteller, die unsere Artikelnummer nicht kennen (sie ist dort unsere eigene SKU):
      // die Mustermail nennt ihre Bezeichnung aus einkauf.farbname (Qualitaet + Farbnummer).
      nachBezeichnung: m.nachBezeichnung === true,
    },
    // Absenderdomains im Postfach, falls ABs und Lieferscheine von anderen Adressen kommen als
    // die Bestellungen hingehen (Lieferantenbelege, docs/ai-dashboard/lib/lieferbelege.mjs).
    postfachDomains: p.domains(roh.postfachDomains, 'postfachDomains'),
    lieferzeitWerktage: p.werktage(roh.lieferzeitWerktage, 'lieferzeitWerktage'),
    mindestmenge: p.text(roh.mindestmenge, 'mindestmenge', 500),
    hinweise: p.text(roh.hinweise, 'hinweise', 2000),
    mail: {
      anrede: p.text(ml.anrede, 'mail.anrede', 200),
      gruss: p.text(ml.gruss, 'mail.gruss', 400),
      duzen: ml.duzen === true,
    },
  };
  l.fehlend = fehlendeAngaben(l);
  l.hinterlegt = istHinterlegt(l);
  l.name = l.anzeigename ?? anzeigeName(id);
  return l;
}

const KONTAKT_JE_WEG = { portal: 'portalUrl', mail: 'mail', telefon: 'telefon' };

/** Was der Inhaber noch eintragen muss, damit Bestellen ohne Nachschlagen geht. */
function fehlendeAngaben(l) {
  const f = [];
  if (!l.anzeigename) f.push('anzeigename');
  if (!l.kundennummer) f.push('kundennummer');
  for (const art of ['ware', 'muster']) {
    const weg = l[art].weg;
    if (!weg) { f.push(`${art}.weg`); continue; }
    const kontakt = KONTAKT_JE_WEG[weg];
    if (!l[art][kontakt]) f.push(`${art}.${kontakt}`);
  }
  if (!l.muster.lieferung) f.push('muster.lieferung');
  if (!l.lieferzeitWerktage) f.push('lieferzeitWerktage');
  return f;
}

function istHinterlegt(l) {
  return !!(l.anzeigename || l.kundennummer || l.ware.weg || l.muster.weg || l.ware.mail || l.muster.mail
    || l.ware.portalUrl || l.ware.telefon || l.muster.telefon || l.muster.portalUrl || l.lieferzeitWerktage);
}

export function anzeigeName(id) {
  return id === UNGEKLAERT ? 'Lieferant nicht zugeordnet' : `Lieferant ${id}`;
}

/** Leerer Datensatz fuer einen Lieferanten ohne Stammdaten - alles "nicht hinterlegt". */
export function leererLieferant(id) {
  return pruefeLieferant(id, {}, []);
}

/**
 * Prueft den Inhalt der Stammdatendatei. Wirft nie: ungueltige Werte werden
 * zu "nicht hinterlegt" und stehen als Klartext in `fehler`.
 *
 * @returns {{absender:object, lieferanten:Object<string,object>, fehler:string[]}}
 */
export function pruefeStammdaten(roh) {
  const fehler = [];
  const leer = { absender: pruefeAbsender({}, fehler), lieferanten: {}, fehler };
  if (!istObjekt(roh)) { fehler.push('Die Datei muss ein JSON-Objekt mit "lieferanten" enthalten.'); return leer; }
  const absender = pruefeAbsender(istObjekt(roh.absender) ? roh.absender : {}, fehler);
  if (roh.lieferanten !== undefined && !istObjekt(roh.lieferanten)) {
    fehler.push('lieferanten: muss ein Objekt sein (Kennung -> Angaben).');
    return { ...leer, absender };
  }
  const lieferanten = {};
  for (const [schluessel, wert] of Object.entries(roh.lieferanten ?? {})) {
    if (schluessel.startsWith('_')) continue; // Kommentarfelder im Geruest
    const id = kennung(schluessel);
    if (!KENNUNG_RE.test(id)) { fehler.push(`lieferanten.${schluessel}: Kennung ungueltig (erwartet z. B. "A").`); continue; }
    if (!istObjekt(wert)) { fehler.push(`lieferanten.${id}: muss ein Objekt sein.`); continue; }
    if (lieferanten[id]) { fehler.push(`lieferanten.${id}: Kennung doppelt (Gross-/Kleinschreibung).`); continue; }
    lieferanten[id] = pruefeLieferant(id, wert, fehler);
  }
  return { absender, lieferanten, fehler };
}

function pruefeAbsender(roh, fehler) {
  const p = pruefer(fehler, 'absender');
  return {
    firma: p.text(roh.firma, 'firma'),
    kontaktName: p.text(roh.kontaktName, 'kontaktName', 120),
    telefon: p.telefon(roh.telefon, 'telefon'),
    mail: p.mail(roh.mail, 'mail'),
    lieferanschrift: anschrift(roh.lieferanschrift, p, 'lieferanschrift'),
    kettelservice: kettelservice(roh.kettelservice, p),
  };
}

/** Unser Kettelservice: Anschrift plus Telefon fuer die Spedition. Name/Adresse nur privat. */
function kettelservice(roh, p) {
  const a = anschrift(roh, p, 'kettelservice');
  if (!a) return null;
  return { ...a, telefon: p.telefon(istObjekt(roh) ? roh.telefon : null, 'kettelservice.telefon') };
}

/**
 * Liest die private Stammdatendatei. Fehlt sie, ist das kein Fehler:
 * `vorhanden:false`, alle Lieferanten gelten als "nicht hinterlegt".
 */
export function leseStammdaten(file = stammdatenPfad()) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (e) {
    const fehlt = e?.code === 'ENOENT';
    return { vorhanden: false, quelle: file, ...pruefeStammdaten({}), fehler: fehlt ? [] : [e?.code === 'EACCES' ? 'Keine Leserechte für die Datei.' : String(e?.message || e).slice(0, 200)] };
  }
  let roh;
  try { roh = JSON.parse(text); }
  catch { return { vorhanden: true, quelle: file, ...pruefeStammdaten({}), fehler: ['Die Datei ist beschädigt (kein gültiges JSON).'] }; }
  return { vorhanden: true, quelle: file, ...pruefeStammdaten(roh) };
}

export function stammdatenFuer(stammdaten, id) {
  return stammdaten?.lieferanten?.[kennung(id)] ?? leererLieferant(kennung(id) || UNGEKLAERT);
}

// --------------------------------------------------------------- Positionen

function tageZwischen(iso, jetzt) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const tage = Math.floor((jetzt.getTime() - t) / 864e5);
  return tage >= 0 ? tage : null;
}

/** Wie afWartetage() im Frontend: seit wann steht die Position auf "bestellt" bzw. "geliefert". */
export function wartetage(eintrag, jetzt = new Date()) {
  const seit = eintrag?.status === 'bestellt' ? eintrag.bestelltAm : eintrag?.status === 'geliefert' ? eintrag.geliefertAm : null;
  return tageZwischen(seit, jetzt);
}

export function warnstufe(tage) {
  if (tage === null || tage === undefined) return null;
  if (tage >= WARTE_PROBLEM_TAGE) return 'problem';
  if (tage >= WARTE_NACHHAKEN_TAGE) return 'nachhaken';
  return null;
}

const geklaert = v => (v === undefined || v === null || v === UNGEKLAERT || String(v).trim() === '' || v === '–' ? null : v);

const GRUPPE_FELD = { offen: 'zuBestellen', bestellt: 'bestellt', unterwegs: 'unterwegs' };

/** Schlanke Position fuer die API - bewusst ohne `preis` und ohne den `einkauf`-Block. */
function schlankePosition(pos, statusAlle, jetzt) {
  const key = positionKey(pos.orderId, pos.lineItemId);
  const eintrag = key ? statusAlle[key] : null;
  const status = eintrag?.status ?? null;
  const tage = wartetage(eintrag, jetzt);
  const farbnummer = pos.istMuster ? geklaert(pos.musterQuelle?.farbnummer) : geklaert(pos.einkauf?.farbnummer);
  return {
    orderId: pos.orderId ?? null,
    orderName: pos.orderName ?? null,
    orderDatum: pos.orderDatum ?? null,
    lineItemId: pos.lineItemId ?? null,
    titel: pos.titel ?? null,
    farbe: geklaert(pos.farbe),
    kunde: geklaert(pos.kunde),
    ausfuehrung: Array.isArray(pos.ausfuehrung) ? pos.ausfuehrung : [],
    ausRolleCm: pos.ausRolleCm ?? null,
    sku: geklaert(pos.sku),
    artikelnummer: geklaert(pos.grosshaendlerId),
    farbnummer,
    bezeichnung: geklaert(pos.istMuster ? pos.musterQuelle?.bezeichnung : pos.einkauf?.farbname),
    menge: geklaert(pos.bestellmenge?.menge),
    einheit: geklaert(pos.bestellmenge?.einheit),
    mengeText: geklaert(pos.bestellmenge?.text),
    mengeHinweis: pos.bestellmenge?.grund ?? null,
    kundenmenge: pos.kundenmenge ?? null,
    route: geklaert(pos.route),
    istMuster: !!pos.istMuster,
    // Additiv: Muster aus dem eigenen Bestand (musterherkunft.mjs) - nicht beim Lieferanten bestellen.
    musterHerkunft: pos.musterHerkunft ?? null,
    ohneLieferant: !!pos.istMuster && musterOhneLieferant(pos),
    // Additiv: Lagerplatz, wenn das Muster aus dem Musterlager kommt (musterlager.mjs).
    musterLager: pos.musterLager ? { artLabel: pos.musterLager.artLabel, ort: pos.musterLager.ort } : null,
    lieferantUrl: geklaert(pos.lieferantUrl),
    status,
    gruppe: GRUPPE_FELD[filterGruppe(status)] ?? 'erledigt',
    lieferantBestellnummer: eintrag?.lieferantBestellnummer ?? null,
    bestelltAm: eintrag?.bestelltAm ?? null,
    wartetage: tage,
    warnstufe: warnstufe(tage),
    kundenbestellungTage: tageZwischen(pos.orderDatum, jetzt),
  };
}

function leereStufen() {
  // eigenerBestand: Muster, die wir selbst da haben - weder "zu bestellen" noch beim Lieferanten.
  return { zuBestellen: [], bestellt: [], unterwegs: [], eigenerBestand: [] };
}

function sammle(modell, statusAlle, jetzt) {
  const je = new Map();
  const fuer = (id) => {
    if (!je.has(id)) je.set(id, { ware: leereStufen(), muster: leereStufen(), gruppen: [] });
    return je.get(id);
  };
  const verteile = (gruppen, art) => {
    for (const g of gruppen ?? []) {
      const ziel = fuer(g.lieferant);
      let zuBestellen = 0;
      for (const pos of g.positionen ?? []) {
        const s = schlankePosition(pos, statusAlle, jetzt);
        if (!ziel[art][s.gruppe]) continue; // erledigt
        if (s.gruppe === 'zuBestellen' && s.ohneLieferant) { ziel[art].eigenerBestand.push(s); continue; }
        ziel[art][s.gruppe].push(s);
        if (s.gruppe === 'zuBestellen') zuBestellen += 1;
      }
      if (art === 'ware') {
        ziel.gruppen.push({ schluessel: g.schluessel, route: geklaert(g.route), lieferziel: String(g.lieferziel).split(':')[0], zuBestellen });
      }
    }
  };
  verteile(modell?.gruppen, 'ware');
  verteile(modell?.musterGruppen, 'muster');
  return je;
}

const anzahl = stufen => ({ zuBestellen: stufen.zuBestellen.length, bestellt: stufen.bestellt.length, unterwegs: stufen.unterwegs.length });
const maxOderNull = werte => { const w = werte.filter(v => v !== null && v !== undefined); return w.length ? Math.max(...w) : null; };

function eintragFuer(id, daten, stammdaten, { mitPositionen = false } = {}) {
  const d = daten ?? { ware: leereStufen(), muster: leereStufen(), gruppen: [] };
  const offen = [...d.ware.bestellt, ...d.ware.unterwegs, ...d.muster.bestellt, ...d.muster.unterwegs];
  const ueberfaellig = offen.filter(p => p.warnstufe).sort((a, b) => b.wartetage - a.wartetage);
  const st = stammdatenFuer(stammdaten, id);
  const eintrag = {
    id,
    name: st.name,
    zugeordnet: id !== UNGEKLAERT,
    stammdaten: st,
    positionen: anzahl(d.ware),
    muster: anzahl(d.muster),
    // Additiv: offene Muster, die wir selbst da haben (nicht beim Lieferanten zu bestellen).
    musterEigenerBestand: d.muster.eigenerBestand.length,
    // Aelteste Bestellung beim Lieferanten, die noch nicht bei uns ist.
    aeltesteOffeneBestellungTage: maxOderNull([...d.ware.bestellt, ...d.muster.bestellt].map(p => p.wartetage)),
    // Aelteste Kundenbestellung, fuer die noch gar nichts bestellt wurde.
    aeltesteUnbestellteTage: maxOderNull([...d.ware.zuBestellen, ...d.muster.zuBestellen].map(p => p.kundenbestellungTage)),
    ueberfaellig: {
      nachhaken: ueberfaellig.filter(p => p.warnstufe === 'nachhaken').length,
      problem: ueberfaellig.filter(p => p.warnstufe === 'problem').length,
    },
    gruppen: d.gruppen,
  };
  if (mitPositionen) {
    eintrag.ware = d.ware;
    eintrag.musterPositionen = d.muster;
    eintrag.ueberfaelligePositionen = ueberfaellig;
  }
  return eintrag;
}

function sortiert(ids) {
  return [...ids].sort((a, b) => (a === UNGEKLAERT) - (b === UNGEKLAERT) || a.localeCompare(b));
}

/**
 * Uebersicht aller Lieferanten: die aus den Stammdaten und die, die in den
 * offenen Positionen vorkommen (auch UNGEKLAERT - "nicht zugeordnet").
 *
 * @param {object|null} modell   Rueckgabe von bestelluebersicht.aufbereiten(), null wenn keine Bestelldaten
 */
export function lieferantenUebersicht(modell, { statusAlle = {}, stammdaten = null, jetzt = new Date() } = {}) {
  const daten = sammle(modell, statusAlle, jetzt);
  const ids = new Set([...Object.keys(stammdaten?.lieferanten ?? {}), ...daten.keys()]);
  // Ueberfaellige zuerst (Inhaber 22.10.): mehr rote, dann mehr bernsteinfarbene Posten, dann die
  // aelteste offene Bestellung; ohne offene Posten A-Z. "Nicht zugeordnet" bleibt hinten.
  const lieferanten = sortiert(ids).map(id => eintragFuer(id, daten.get(id), stammdaten))
    .sort((a, b) => (a.id === UNGEKLAERT) - (b.id === UNGEKLAERT)
      || b.ueberfaellig.problem - a.ueberfaellig.problem || b.ueberfaellig.nachhaken - a.ueberfaellig.nachhaken
      || (b.aeltesteOffeneBestellungTage ?? -1) - (a.aeltesteOffeneBestellungTage ?? -1)
      || a.id.localeCompare(b.id));
  const k = stammdaten?.absender?.kettelservice;
  return {
    schwellen: { nachhakenTage: WARTE_NACHHAKEN_TAGE, problemTage: WARTE_PROBLEM_TAGE },
    // Nur Name und Ort: reicht fuer "geht an unseren Kettler" im Einkauf.
    kettelservice: adresseOk(k) ? { name: k.name ?? null, ort: k.ort } : null,
    lieferanten,
  };
}

/** Ein Lieferant mit allen offenen Positionen; null, wenn die Kennung nirgends vorkommt. */
export function lieferantDetail(modell, id, { statusAlle = {}, stammdaten = null, jetzt = new Date() } = {}) {
  const k = kennung(id);
  if (!k) return null;
  const daten = sammle(modell, statusAlle, jetzt);
  if (!daten.has(k) && !stammdaten?.lieferanten?.[k]) return null;
  return eintragFuer(k, daten.get(k), stammdaten, { mitPositionen: true });
}

// --------------------------------------------------------------- Bestellmail

/**
 * mailto:-Link nach RFC 6068: Zeilenumbrueche als %0D%0A, Leerzeichen als %20
 * (nie "+"). Ist der Link mit Text zu lang, traegt er nur Empfaenger und
 * Betreff; `gekuerzt` sagt der Oberflaeche, dass der Text kopiert werden muss.
 */
export function mailtoLink({ an, betreff = '', text = '' } = {}) {
  if (!an || !MAIL_RE.test(an)) return { mailto: null, gekuerzt: false };
  const kodiert = s => encodeURIComponent(String(s).replace(/\r\n|\r|\n/g, '\r\n'));
  const basis = `mailto:${encodeURIComponent(an).replace(/%40/g, '@')}?subject=${kodiert(betreff)}`;
  const voll = `${basis}&body=${kodiert(text)}`;
  if (voll.length <= MAILTO_MAX) return { mailto: voll, gekuerzt: false };
  return { mailto: basis, gekuerzt: true };
}

function adresseOk(a) {
  return !!(a && geklaert(a.strasse) && geklaert(a.plz) && geklaert(a.ort));
}

function adressZeilen(a, { telefon = false } = {}) {
  const tel = telefon && geklaert(a.telefon) && a.telefon !== '–' ? `Tel. ${a.telefon}` : null;
  return [geklaert(a.name), geklaert(a.strasse), `${a.plz} ${a.ort}`, geklaert(a.land), tel].filter(Boolean);
}

function kundenAdressen(modell) {
  const m = new Map();
  for (const a of modell?.auftraege ?? []) m.set(a.id, a.details?.lieferadresse ?? null);
  return m;
}

// Interne Vermerke aus der Mengenumrechnung gehoeren in die Hinweise, nicht zum Lieferanten.
const mailMenge = t => String(t ?? '').replace(/\s*\(Lieferantenraster ungeklärt[^)]*\)/, '');

/**
 * Woran der Lieferant den Artikel erkennt: Artikel- und Farbnummer, bei Herstellern mit
 * muster.nachBezeichnung bzw. ware.nachBezeichnung deren eigene Bezeichnung. Keine Shop-Produktnamen und
 * Shop-Farbwoerter: die kennt der Lieferant nicht, sie verwirren nur (Inhaber 2026-10-14).
 */
function artikelKopf(p, { nachBezeichnung = false } = {}) {
  const mitBezeichnung = nachBezeichnung && !!p.bezeichnung;
  const kopf = [mitBezeichnung ? p.bezeichnung : `Art.-Nr. ${p.artikelnummer}`];
  // Farbnummer nicht doppelt nennen: als ganzes Wort in der Bezeichnung ("Testflor 3786/072")
  // oder gleich der Artikelnummer. Kein Teilstring - "4" steckt auch in "TEPDOLCE4_004".
  const schonDrin = mitBezeichnung ? p.bezeichnung.split(/[\s/]+/).includes(p.farbnummer) : p.farbnummer === p.artikelnummer;
  if (p.farbnummer && !schonDrin) kopf.push(`Farb-Nr. ${p.farbnummer}`);
  return kopf.join(' · ');
}

function positionsZeilen(p, nr, { mitKunde = true, nachBezeichnung = false } = {}) {
  const ausfuehrung = p.ausfuehrung ?? [];
  // Massanfertigung: "1 Stueck nach Mass", Fertig- bzw. Zuschnittmass steht in der Zeile darunter.
  const massStueck = ausfuehrung.some(z => z.startsWith('Fertigmaß:') || z.startsWith('Zuschnittmaß:')) && p.einheit === 'stueck';
  const menge = massStueck ? `${p.menge} Stück nach Maß` : mailMenge(p.mengeText ?? `${p.menge} ${p.einheit}`);
  const zeilen = [`${nr}. ${artikelKopf(p, { nachBezeichnung })}`, `   Menge: ${menge}`, ...ausfuehrung.map(z => `   ${z}`)];
  if (p.orderName) zeilen.push(`   Kommission: ${[p.orderName, mitKunde ? p.kunde : null].filter(Boolean).join(' · ')}`);
  return zeilen;
}

function kurzListe(namen, max = 3) {
  const eindeutig = [...new Set(namen.filter(Boolean))];
  return eindeutig.length > max ? `${eindeutig.slice(0, max).join(', ')} u. a.` : eindeutig.join(', ');
}

function fehltEintrag(p, gruende) {
  return { orderId: p.orderId, orderName: p.orderName, lineItemId: p.lineItemId, titel: p.titel, farbe: p.farbe, istMuster: p.istMuster, gruende };
}

function hinweiseFuer(aufgenommen) {
  const h = [];
  const ohneFarbnr = aufgenommen.filter(p => !p.farbnummer).length;
  if (ohneFarbnr) h.push(`${ohneFarbnr} Position(en) ohne Farbnummer – vor dem Senden prüfen, ob die Artikelnummer die Farbe schon enthält.`);
  for (const p of aufgenommen) if (p.mengeHinweis) h.push(`${p.orderName ?? ''} ${p.titel ?? ''}: ${p.mengeHinweis}`.trim());
  return h;
}

function rahmen({ st, absender, anredeStandard }) {
  const anrede = st.mail.anrede ?? anredeStandard;
  const gruss = st.mail.gruss ?? [st.mail.duzen ? 'Viele Grüße' : 'Mit freundlichen Grüßen', absender?.kontaktName, absender?.firma ?? 'Teppich Paradies'].filter(Boolean).join('\n');
  return { anrede, gruss };
}

function fertigeMail({ st, art, an, betreff, zeilen, aufgenommen, fehlt, extra = {} }) {
  const weg = st[art].weg;
  const text = zeilen.join('\n');
  // Ohne aufgenommene Position gibt es nichts zu bestellen - dann auch keinen Link.
  const link = aufgenommen.length ? mailtoLink({ an, betreff, text }) : { mailto: null, gekuerzt: false };
  const stammdatenFehlt = [];
  if (!st.kundennummer) stammdatenFehlt.push('kundennummer');
  if (!weg) stammdatenFehlt.push(`${art}.weg`);
  // Verlangt wird der Kontakt des gewaehlten Wegs; ohne Weg die Mailadresse, weil
  // der Text sonst nur kopiert werden kann.
  const kontakt = KONTAKT_JE_WEG[weg ?? 'mail'];
  if (!st[art][kontakt]) stammdatenFehlt.push(`${art}.${kontakt}`);
  return {
    art,
    weg,
    an: an ?? null,
    ansprechperson: art === 'muster' ? st.muster.ansprechperson : null,
    portalUrl: st[art].portalUrl,
    telefon: st[art].telefon,
    betreff: aufgenommen.length ? betreff : null,
    text: aufgenommen.length ? text : null,
    mailto: link.mailto,
    mailtoGekuerzt: link.gekuerzt,
    positionen: aufgenommen,
    fehlt,
    stammdatenFehlt,
    hinweise: hinweiseFuer(aufgenommen),
    ...extra,
  };
}

const ZIEL_JE_AUFTRAG = new Set([ROUTE.SUPPLIER_DIRECT, ROUTE.SUPPLIER_TO_SITE]);

/** Kettel-/Einfassungszeile aus der Kundenbestellung ("Einfassung: Gekettelt, umlaufend ..."). */
const istEinfassung = z => /^Einfassung:/.test(z);

/** Kuerzere Seite des Fertigmasses in cm ("200 × 300 cm", "Ø 160 cm"); null, wenn keins da ist. */
export function kuerzereSeiteCm(ausfuehrung = []) {
  const z = ausfuehrung.find(t => t.startsWith('Fertigmaß:'));
  if (!z) return null;
  const zahlen = (z.match(/\d+(?:[.,]\d+)?/g) || []).map(n => Number(n.replace(',', '.'))).filter(n => n > 0);
  return zahlen.length ? Math.min(...zahlen.slice(0, 2)) : null;
}

/**
 * Massteppich mit Einfassung geht nach der Regel zum Kettler, egal wie gross (Inhaber
 * 2026-10-19 abends, bis dahin nur unter 2 m): er schneidet zu und kettelt, wir holen ab bzw.
 * er verschickt (bis 200 cm kurze Seite per Paket, darueber per Spedition). Ohne Fertigmass
 * kann der Lieferant nicht zuschneiden - dann bleibt es beim normalen Weg.
 */
export function kettlerAutomatisch(p) {
  if (!(p.ausfuehrung ?? []).some(istEinfassung)) return false;
  return kuerzereSeiteCm(p.ausfuehrung) !== null;
}

/**
 * Warum sich eine Kettel-Position fuer unseren Kettler anbietet - ein Vorschlag fuer Mails,
 * in denen die Regel oben nicht greift (Ziel im Dialog gewaehlt). Ohne Fertigmass nur, wenn
 * der Kunde in der Naehe wohnt (wir liefern selbst bis in die Wohnung).
 */
export function kettlerGrund(p, adresse) {
  if (!(p.ausfuehrung ?? []).some(istEinfassung)) return null;
  if (kettlerAutomatisch(p)) return 'gekettelt – Ketteln beim Kettler';
  if (adresse?.plz && KETTLER_NAH_PLZ.test(String(adresse.plz).trim())) return `Kunde in der Nähe (${String(adresse.plz).trim()} ${adresse.ort ?? ''}`.trim() + ') – wir liefern selbst';
  return null;
}

/**
 * Was vor einer Bestellung ueber den Kettler geklaert sein muss: ohne lesbares Fertigmass gibt
 * es kein Zuschnittmass, und passt das Zuschnittmass nicht mehr in die Rolle, aus der
 * zugeschnitten wird, faellt es nicht still auf das Fertigmass zurueck.
 */
function kettelPufferGruende(p) {
  if (!wirdGekettelt(p.ausfuehrung)) return [];
  const z = kettelZuschnitt(p.ausfuehrung);
  if (!z) return [`Kein lesbares Fertigmaß (Breite × Länge in cm) – Zuschnitt mit +${KETTEL_PUFFER_CM} cm Kettelpuffer von Hand klären`];
  const rolle = Number(p.ausRolleCm);
  if (rolle > 0 && Math.min(z.breiteCm, z.laengeCm) > rolle) {
    return [`Zuschnittmaß ${z.zuschnitt} (Fertigmaß + ${KETTEL_PUFFER_CM} cm Kettelpuffer) passt nicht in die Rollenbreite ${rolle} cm – vor der Bestellung klären`];
  }
  return [];
}

/**
 * Ueber den Kettler kettelt nicht der Lieferant. Massteppiche bestellen wir dann im
 * Zuschnittmass (Fertigmass + Kettelpuffer), nur ohne Einfassung: der Lieferant berechnet beim
 * Raummass nur die echte Flaeche (Beleg AB 19.10.), Meterware aus voller Rollenbreite waere
 * mehr Flaeche als noetig (Inhaber 2026-10-20). Der Lieferant sieht nur das Zuschnittmass, damit
 * er nicht versehentlich im Fertigmass schneidet. Ketteln macht der Kettler - auf das Fertigmass.
 */
function fuerKettler(p) {
  const ausfuehrung = p.ausfuehrung ?? [];
  if (!ausfuehrung.some(istEinfassung)) return p;
  const ohne = ausfuehrung.filter(x => !istEinfassung(x));
  const z = wirdGekettelt(ausfuehrung) ? kettelZuschnitt(ausfuehrung) : null;
  // Nicht gekettelt (Raummass, Matte, Band ...): wie bisher im Fertigmass, ohne Puffer.
  if (!z) return { ...p, ausfuehrung: [...ohne, 'Ohne Einfassung – bitte im Fertigmaß zuschneiden, nicht ketteln (Ketteln macht unser Kettelservice)'] };
  const zeilen = ohne.map(x => (x.startsWith('Fertigmaß:') ? `Zuschnittmaß: ${z.zuschnitt}${z.form ? ` (${z.form})` : ''}` : x));
  return { ...p, ausfuehrung: [...zeilen, 'Ohne Einfassung – bitte genau im Zuschnittmaß zuschneiden, nicht ketteln (Ketteln macht unser Kettelservice)'] };
}

function wareMail(gruppe, { st, absender, statusAlle, adressen, jetzt, ziel, auswahl = null, automatisch = false }) {
  const alle = (gruppe.positionen ?? []).filter(p => !auswahl || auswahl(p)).map(p => schlankePosition(p, statusAlle, jetzt));
  const offen = alle.filter(p => p.gruppe === 'zuBestellen');
  // Die Kettler-Regel gilt auch fuer Ware, die der Lieferant sonst direkt zum Kunden schickt:
  // abgetrennte Positionen gehen an unseren Kettler (Issue #1453).
  const direkt = ZIEL_JE_AUFTRAG.has(gruppe.route) && !(automatisch && ziel === 'kettler');
  const kettler = absender?.kettelservice ?? null;
  // Regel des Inhabers (2026-10-14): Ware geht direkt an die Kunden, je Kommission mit
  // Anschrift. "laden" ist die seltene Ausnahme - per Umschalter im Dialog oder als
  // ware.lieferung in den Stammdaten. "kettler" nur per Umschalter (2026-10-19).
  // Baustellenlieferungen bleiben, wie sie sind.
  const lieferung = WARE_LIEFERUNG.includes(ziel) ? ziel : (st.ware.lieferung ?? 'kunde');
  const anKunden = !direkt && lieferung === 'kunde';
  const anKettler = !direkt && lieferung === 'kettler';
  const zielAdresse = direkt ? adressen.get(gruppe.positionen?.[0]?.orderId) : anKettler ? kettler : absender?.lieferanschrift;
  const aufgenommen = [];
  const fehlt = [];
  for (const p of offen) {
    const gruende = [];
    if (gruppe.lieferant === UNGEKLAERT) gruende.push('Lieferant nicht zugeordnet');
    if (!p.artikelnummer) gruende.push('Artikelnummer beim Lieferanten fehlt');
    if (p.menge === null || !p.einheit) gruende.push(`Bestellmenge ungeklärt${p.mengeHinweis ? ` (${p.mengeHinweis})` : ''}`);
    if (direkt && !adresseOk(zielAdresse)) gruende.push('Lieferanschrift des Kunden fehlt');
    if (anKunden && !adresseOk(adressen.get(p.orderId))) gruende.push('Lieferanschrift des Kunden fehlt');
    if (anKettler && !adresseOk(kettler)) gruende.push('Anschrift unseres Kettelservice fehlt (Stammdaten absender.kettelservice)');
    if (anKettler) gruende.push(...kettelPufferGruende(p));
    if (gruende.length) fehlt.push(fehltEintrag(p, gruende)); else aufgenommen.push(p);
  }
  // Fuer den Dialog: Fertig- und Zuschnittmass je Teppich nebeneinander, direkt vor dem Senden.
  const kettelPuffer = anKettler
    ? aufgenommen.map(p => ({ p, z: wirdGekettelt(p.ausfuehrung) ? kettelZuschnitt(p.ausfuehrung) : null })).filter(x => x.z)
      .map(({ p, z }) => ({ orderName: p.orderName, lineItemId: p.lineItemId, titel: p.titel, fertigmass: z.fertig, zuschnittmass: z.zuschnitt,
        // Ohne bekannte Rollenbreite kann der Server nicht pruefen, ob das Zuschnittmass passt.
        rolleUnbekannt: !(Number(p.ausRolleCm) > 0) }))
    : [];
  const { anrede, gruss } = rahmen({ st, absender, anredeStandard: 'Sehr geehrte Damen und Herren,' });
  const du = st.mail.duzen;
  // Die Kommission (#Shop-Bestellnummer) in der AB macht die automatische Zuordnung moeglich (lib/lieferbelege.mjs).
  const bestaetigen = du ? 'Bitte bestätige uns den Auftrag mit dem voraussichtlichen Liefertermin und gib dabei unsere Kommission an.' : 'Bitte bestätigen Sie uns den Auftrag mit dem voraussichtlichen Liefertermin und geben Sie dabei unsere Kommission an.';
  const einleitung = anKunden ? 'wir bestellen folgende Ware – bitte direkt an unsere Kunden liefern:'
    : anKettler ? 'wir bestellen folgende Ware – bitte an unseren Kettelservice liefern (Anschrift unten):'
      : 'wir bestellen folgende Ware:';
  const zeilen = [anrede, '', einleitung, ''];
  if (st.kundennummer) zeilen.push(`Unsere Kundennummer: ${st.kundennummer}`, '');
  const nachBezeichnung = st.ware.nachBezeichnung;
  if (anKunden) {
    // Je Kommission ein Block: Anschrift (mit Telefon fuer die Spedition), darunter die Positionen.
    const jeAuftrag = new Map();
    for (const p of aufgenommen) { if (!jeAuftrag.has(p.orderId)) jeAuftrag.set(p.orderId, []); jeAuftrag.get(p.orderId).push(p); }
    let nr = 0;
    for (const [orderId, liste] of jeAuftrag) {
      zeilen.push(`Kommission ${liste[0].orderName} – Lieferanschrift:`, ...adressZeilen(adressen.get(orderId), { telefon: true }).map(z => `   ${z}`), '');
      for (const p of liste) { nr += 1; zeilen.push(...positionsZeilen(p, nr, { mitKunde: false, nachBezeichnung }), ''); }
    }
  } else if (anKettler) {
    // Ketteln macht der Kettelservice - der Lieferant schneidet nur zu. Kundennamen gehen
    // nicht mit: der Kettler ordnet ueber die Kommission zu.
    aufgenommen.forEach((p, i) => zeilen.push(...positionsZeilen(fuerKettler(p), i + 1, { mitKunde: false, nachBezeichnung }), ''));
  } else {
    aufgenommen.forEach((p, i) => zeilen.push(...positionsZeilen(p, i + 1, { nachBezeichnung }), ''));
  }
  if (direkt) {
    zeilen.push(gruppe.route === ROUTE.SUPPLIER_TO_SITE ? (du ? 'Bitte liefere direkt an die Baustelle:' : 'Bitte liefern Sie direkt an die Baustelle:') : (du ? 'Bitte liefere direkt an unseren Kunden:' : 'Bitte liefern Sie direkt an unseren Kunden:'));
    if (adresseOk(zielAdresse)) zeilen.push(...adressZeilen(zielAdresse, { telefon: true }));
  } else if (anKunden) {
    zeilen.push('Bitte vor der Anlieferung beim Kunden telefonisch avisieren.');
  } else if (anKettler) {
    zeilen.push(du ? 'Bitte liefere an unseren Kettelservice:' : 'Bitte liefern Sie an unseren Kettelservice:');
    if (adresseOk(kettler)) zeilen.push(...adressZeilen(kettler, { telefon: true }));
    zeilen.push('', 'Bitte die Kommission gut lesbar auf jedem Stück vermerken.');
  } else if (adresseOk(zielAdresse)) {
    zeilen.push('Lieferanschrift:', ...adressZeilen(zielAdresse));
  } else {
    zeilen.push('Lieferung bitte an unsere bekannte Geschäftsadresse.');
  }
  zeilen.push('', bestaetigen, '', gruss);
  const betreff = ['Bestellung', st.kundennummer ? `Kd.-Nr. ${st.kundennummer}` : null, anKettler ? 'Lieferung an Kettelservice' : null, kurzListe(aufgenommen.map(p => p.orderName))].filter(Boolean).join(' – ');
  // Vorschlag fuer den Dialog: welche offenen Positionen sich fuer den Kettler anbieten.
  const kettlerVorschlag = !ZIEL_JE_AUFTRAG.has(gruppe.route) && adresseOk(kettler)
    ? offen.map(p => ({ p, grund: kettlerGrund(p, adressen.get(p.orderId)) })).filter(x => x.grund)
      .map(({ p, grund }) => ({ orderId: p.orderId, orderName: p.orderName, lineItemId: p.lineItemId, titel: p.titel, grund }))
    : [];
  return fertigeMail({
    st, art: 'ware', an: st.ware.mail, betreff, zeilen, aufgenommen, fehlt,
    extra: {
      gruppe: gruppe.schluessel,
      route: geklaert(gruppe.route),
      lieferziel: direkt ? (gruppe.route === ROUTE.SUPPLIER_TO_SITE ? 'baustelle' : 'kunde') : anKunden ? 'kunde' : anKettler ? 'kettler' : 'laden',
      // Nur Ware, die sonst in den Laden geht, kann im Dialog umgeschaltet werden.
      // Bei Direktversand ist das Ziel fest - auch die nach der Regel abgetrennte Kettler-Mail
      // (#1453) wird nicht umgeschaltet, sonst faellt sie zurueck in den Direktversand.
      zielWaehlbar: !ZIEL_JE_AUFTRAG.has(gruppe.route),
      // Kettler nur anbieten, wenn seine Anschrift in den privaten Stammdaten steht.
      kettlerMoeglich: !ZIEL_JE_AUFTRAG.has(gruppe.route) && adresseOk(kettler),
      kettlerVorschlag,
      // Nach der Regel "gekettelt zum Kettler" abgetrennt, nicht von Hand gewaehlt.
      kettlerAutomatisch: automatisch,
      kettelPuffer,
      bereitsBestellt: alle.length - offen.length,
    },
  });
}

/** Muster, die nicht beim Lieferanten bestellt werden (eigenes Musterlager, Zuschnitt aus der Rolle). */
const MUSTER_OHNE_LIEFERANT = new Set([ROUTE.SAMPLE_STOCK, ROUTE.SAMPLE_CUT]);

function ohneBestellungGrund(p) {
  if (p.musterLager && p.musterHerkunft !== HERKUNFT.VORBEI) return `aus dem Musterlager${p.musterLager.ort ? ` (${p.musterLager.ort})` : ''} – wird von uns verschickt`;
  if (p.musterHerkunft === HERKUNFT.VORBEI) return 'aus eigenem Bestand – wird persönlich vorbeigebracht';
  if (p.musterHerkunft === HERKUNFT.VERSAND) return 'aus eigenem Bestand – wird von uns verschickt';
  return p.route === ROUTE.SAMPLE_CUT ? 'Muster wird selbst zugeschnitten' : 'Muster aus dem eigenen Musterlager';
}

function musterMail(gruppen, { st, absender, statusAlle, adressen, jetzt, ziel }) {
  const alle = gruppen.flatMap(g => g.positionen ?? []).map(p => schlankePosition(p, statusAlle, jetzt));
  const offen = alle.filter(p => p.gruppe === 'zuBestellen');
  const lieferung = MUSTER_LIEFERUNG.includes(ziel) ? ziel : st.muster.lieferung;
  const aufgenommen = [];
  const fehlt = [];
  const ohneBestellung = [];
  for (const p of offen) {
    if (p.ohneLieferant || MUSTER_OHNE_LIEFERANT.has(p.route)) { ohneBestellung.push(fehltEintrag(p, [ohneBestellungGrund(p)])); continue; }
    const gruende = [];
    if (!p.artikelnummer) gruende.push('Artikelnummer beim Lieferanten fehlt');
    if (!(p.menge > 0)) gruende.push('Anzahl fehlt');
    if (!lieferung) gruende.push('Lieferziel für Muster nicht festgelegt (Stammdaten muster.lieferung oder ziel=kunde|laden)');
    else if (lieferung === 'kunde' && !adresseOk(adressen.get(p.orderId))) gruende.push('Lieferanschrift des Kunden fehlt');
    if (gruende.length) fehlt.push(fehltEintrag(p, gruende)); else aufgenommen.push(p);
  }
  const person = st.muster.ansprechperson;
  const { anrede, gruss } = rahmen({ st, absender, anredeStandard: person ? `Guten Tag ${person},` : 'Sehr geehrte Damen und Herren,' });
  const du = st.mail.duzen;
  const zeilen = [anrede, '', du ? 'bitte schick uns folgende Muster:' : 'bitte senden Sie uns folgende Muster:', ''];
  if (st.kundennummer) zeilen.push(`Unsere Kundennummer: ${st.kundennummer}`, '');
  const nachBezeichnung = st.muster.nachBezeichnung;
  const musterZeile = (p, nr) => {
    const z = positionsZeilen({ ...p, mengeText: `${p.menge} Muster` }, nr, { nachBezeichnung });
    return lieferung === 'kunde' ? z.filter(t => !t.startsWith('   Kommission:')) : z;
  };
  if (lieferung === 'kunde') {
    zeilen[2] = du ? 'bitte schick folgende Muster direkt an unsere Kunden:' : 'bitte senden Sie folgende Muster direkt an unsere Kunden:';
    const jeAuftrag = new Map();
    for (const p of aufgenommen) { if (!jeAuftrag.has(p.orderId)) jeAuftrag.set(p.orderId, []); jeAuftrag.get(p.orderId).push(p); }
    let nr = 0;
    for (const [orderId, liste] of jeAuftrag) {
      zeilen.push(`Lieferanschrift (Kommission ${liste[0].orderName}):`, ...adressZeilen(adressen.get(orderId)), '');
      for (const p of liste) { nr += 1; zeilen.push(...musterZeile(p, nr)); }
      zeilen.push('');
    }
  } else {
    // An den Laden: bewusst kurz - eine Zeile je Muster, ohne Kommission, ohne
    // Anschrift und ohne unsere Shop-Namen, die der Lieferant nicht kennt
    // (Inhaberentscheidung 2026-10-01). Auch kein Farbname: es sind unsere Shop-Farbwoerter -
    // die Bezeichnung des Herstellers (muster.nachBezeichnung) ist dagegen seine eigene.
    for (const p of aufgenommen) {
      zeilen.push(`${p.menge}× ${artikelKopf(p, { nachBezeichnung })}`);
    }
    zeilen.push('');
  }
  zeilen.push('Vielen Dank.', '', gruss);
  const stueck = aufgenommen.reduce((s, p) => s + Number(p.menge || 0), 0);
  const betreff = lieferung !== 'kunde' ? 'Musterbestellung' : ['Musterbestellung', st.kundennummer ? `Kd.-Nr. ${st.kundennummer}` : null, `${stueck} Muster`, kurzListe(aufgenommen.map(p => p.orderName))].filter(Boolean).join(' – ');
  return fertigeMail({
    st, art: 'muster', an: st.muster.mail, betreff, zeilen, aufgenommen, fehlt,
    extra: { gruppe: null, route: 'MUSTER', lieferziel: lieferung ?? null, bereitsBestellt: alle.length - offen.length, ohneBestellung },
  });
}

/**
 * Ware einer Gruppe als Mail(s). Ohne gewaehltes Ziel gilt die Regel des Inhabers (2026-10-19):
 * gekettelte Massteppiche gehen in eine eigene Mail an unseren Kettler, der Rest wie bisher.
 * Ein Ziel aus dem Dialog (Kunden/Laden/Kettler) gilt dagegen fuer die ganze Gruppe.
 */
function wareMailsFuer(gruppe, kontext) {
  // Auch Direktversand des Lieferanten (#1453); nur Baustellenlieferungen bleiben, wie sie sind.
  // Ein Ziel aus dem Dialog gilt nur fuer waehlbare Gruppen - Direktversand behaelt die Regel.
  const zielGilt = Boolean(kontext.ziel) && !ZIEL_JE_AUFTRAG.has(gruppe.route);
  const automatisch = !zielGilt && adresseOk(kontext.absender?.kettelservice) && gruppe.route !== ROUTE.SUPPLIER_TO_SITE;
  // Nur offene Positionen: schon Bestelltes (auch von vor der Regel) bleibt in der normalen Mail.
  const offen = p => schlankePosition(p, kontext.statusAlle, kontext.jetzt).gruppe === 'zuBestellen';
  const zumKettler = p => kettlerAutomatisch(p) && offen(p);
  if (!automatisch || !(gruppe.positionen ?? []).some(zumKettler)) return [wareMail(gruppe, kontext)];
  const kettler = wareMail(gruppe, { ...kontext, ziel: 'kettler', auswahl: zumKettler, automatisch: true });
  const rest = (gruppe.positionen ?? []).some(p => !zumKettler(p)) ? [wareMail(gruppe, { ...kontext, auswahl: p => !zumKettler(p) })] : [];
  return [kettler, ...rest];
}

export class LieferantenFehler extends Error {}

/**
 * Fertige Bestellung(en) fuer einen Lieferanten - nur Text, es wird nichts gesendet.
 *
 * @param {object} p
 * @param {object} p.modell        aus bestelluebersicht.aufbereiten()
 * @param {string} p.lieferant     Kennung (z. B. "A")
 * @param {'ware'|'muster'} [p.art]
 * @param {string} [p.gruppe]      nur Ware: Gruppenschluessel "<lieferant>|<route>|<lieferziel>"; ohne Angabe alle Gruppen
 * @param {'kunde'|'laden'|'kettler'} [p.ziel] Muster: ueberstimmt muster.lieferung aus den Stammdaten;
 *                                 Ware: ueberstimmt ware.lieferung (Standard 'kunde' - direkt an die Kunden);
 *                                 'kettler' nur fuer Ware (Anschrift aus absender.kettelservice)
 * @returns {{lieferant:string, name:string, art:string, mails:object[]}}
 */
export function bestellmail({ modell, lieferant, art = 'ware', gruppe = null, ziel = null, statusAlle = {}, stammdaten = null, jetzt = new Date() } = {}) {
  const id = kennung(lieferant);
  if (!id) throw new LieferantenFehler('lieferant ist Pflicht');
  if (!['ware', 'muster'].includes(art)) throw new LieferantenFehler('art muss "ware" oder "muster" sein');
  if (ziel && !(art === 'ware' ? WARE_LIEFERUNG : MUSTER_LIEFERUNG).includes(ziel)) {
    throw new LieferantenFehler(art === 'ware' ? 'ziel muss "kunde", "laden" oder "kettler" sein' : 'ziel muss "kunde" oder "laden" sein');
  }
  const st = stammdatenFuer(stammdaten, id);
  const kontext = { st, absender: stammdaten?.absender ?? null, statusAlle, adressen: kundenAdressen(modell), jetzt, ziel };
  let mails;
  if (art === 'muster') {
    const gruppen = (modell?.musterGruppen ?? []).filter(g => g.lieferant === id);
    mails = gruppen.length ? [musterMail(gruppen, kontext)] : [];
  } else {
    const gruppen = (modell?.gruppen ?? []).filter(g => g.lieferant === id && (!gruppe || g.schluessel === gruppe));
    if (gruppe && !gruppen.length) throw new LieferantenFehler('Gruppe nicht gefunden - Bestelldaten evtl. inzwischen aktualisiert');
    mails = gruppen.flatMap(g => wareMailsFuer(g, kontext));
  }
  // Mails ohne offene Position (alles schon bestellt) bleiben sichtbar, aber leer - so
  // sieht die Oberflaeche "nichts mehr zu bestellen" statt eines Fehlers.
  return { lieferant: id, name: st.name, art, automatischGesendet: false, mails };
}

// ------------------------------------------------------ Schnellzugriff (Lexikon)

/**
 * Kuerzel aus dem Lexikon: der Export fuehrt "B", aeltere Daten "Lieferant B". null, wenn
 * daraus keine gueltige Kennung wird (leer, UNGEKLAERT, Freitext).
 */
export function kennungAusLexikon(wert) {
  const k = kennung(String(wert ?? '').trim().replace(/^lieferant\s+/i, ''));
  return k && k !== UNGEKLAERT && KENNUNG_RE.test(k) ? k : null;
}

function schnellMail(st, art, artikel, absender) {
  const { anrede, gruss } = rahmen({ st, absender, anredeStandard: 'Sehr geehrte Damen und Herren,' });
  const nr = geklaert(artikel.artikelnummer);
  const farbe = geklaert(artikel.farbnummer);
  const kopf = [nr ? `Art.-Nr. ${nr}` : null, farbe ? `Farb-Nr. ${farbe}` : null].filter(Boolean).join(' · ');
  // Nur die Bezeichnung des Lieferanten - unsere Shop-Namen kennt er nicht (wie musterMail).
  const bezeichnung = geklaert(artikel.produktname);
  const zeilen = [anrede, ''];
  if (art === 'muster') {
    zeilen.push(st.mail.duzen ? 'bitte schick uns folgendes Muster:' : 'bitte senden Sie uns folgendes Muster:', '');
    if (st.kundennummer) zeilen.push(`Unsere Kundennummer: ${st.kundennummer}`, '');
    zeilen.push(`1× ${kopf || bezeichnung || ''}`.trim(), '', 'Vielen Dank.', '', gruss);
  } else {
    zeilen.push('wir bestellen folgende Ware:', '');
    if (st.kundennummer) zeilen.push(`Unsere Kundennummer: ${st.kundennummer}`, '');
    if (kopf) zeilen.push(kopf);
    if (bezeichnung) zeilen.push(kopf ? `   ${bezeichnung}` : bezeichnung);
    // Menge und Anschrift kennt das Lexikon nicht - leer zum Ausfuellen, nie geraten.
    zeilen.push(`${kopf || bezeichnung ? '   ' : ''}Menge: `, '', 'Lieferanschrift: ', '',
      st.mail.duzen ? 'Bitte bestätige uns den Auftrag mit dem voraussichtlichen Liefertermin.' : 'Bitte bestätigen Sie uns den Auftrag mit dem voraussichtlichen Liefertermin.', '', gruss);
  }
  const betreff = [art === 'muster' ? 'Musterbestellung' : 'Bestellung', st.kundennummer ? `Kd.-Nr. ${st.kundennummer}` : null, nr ? `Art.-Nr. ${nr}` : null].filter(Boolean).join(' – ');
  const text = zeilen.join('\n');
  return { an: st[art].mail, betreff, text, mailto: mailtoLink({ an: st[art].mail, betreff, text }).mailto };
}

/**
 * Schnellzugriff zum Lieferanten fuer eine Lexikon-Variante, die weder einen Direkt- noch einen
 * Suchlink hat (Auftrag des Inhabers: bei Ware und Mustern immer ein Weg zum Lieferanten). Manche
 * Lieferanten haben online keine Produktseiten - dann ist ihr Bestellweg aus den Stammdaten der
 * Schnellzugriff: Bestellmail (fertig mit Artikel- und Farbnummer), Portal oder Telefon, der
 * hinterlegte Hauptweg zuerst. Ohne Stammdaten bleibt `aktionen` leer und `hinweis` sagt, was
 * fehlt. Wie bestellmail(): Es wird nichts gesendet, und aus den Stammdaten gehen nur Kontakt
 * und Kundennummer hinaus.
 *
 * @param {object} stammdaten  Rueckgabe von leseStammdaten() (oder null)
 * @param {string} lieferant   Kuerzel aus dem Lexikon ("B" oder "Lieferant B")
 * @param {{artikel?:object, art?:'ware'|'muster'}} [opt]  artikel: { artikelnummer, farbnummer, produktname }
 * @returns {object|null} null, wenn kein Lieferant zugeordnet ist
 */
export function lexikonSchnellzugriff(stammdaten, lieferant, { artikel = {}, art = 'ware' } = {}) {
  const id = kennungAusLexikon(lieferant);
  if (!id) return null;
  const st = stammdatenFuer(stammdaten, id);
  const s = st[art];
  const reihenfolge = s.weg === 'portal' ? ['portal', 'mail', 'telefon'] : s.weg === 'telefon' ? ['telefon', 'mail', 'portal'] : ['mail', 'portal', 'telefon'];
  const aktionen = [];
  for (const weg of reihenfolge) {
    if (weg === 'mail' && s.mail) {
      aktionen.push({ weg, label: `${art === 'muster' ? 'Musterbestellung' : 'Bestellmail'} an ${st.name}`, ...schnellMail(st, art, artikel ?? {}, stammdaten?.absender ?? null) });
    }
    if (weg === 'portal' && s.portalUrl) aktionen.push({ weg, label: 'Im Portal bestellen', href: s.portalUrl });
    if (weg === 'telefon' && s.telefon) aktionen.push({ weg, label: 'Anrufen', nummer: s.telefon });
  }
  return {
    lieferant: id,
    name: st.name,
    art,
    weg: aktionen[0]?.weg ?? null,
    aktionen,
    kundennummer: st.kundennummer,
    // Nur mit Eintrag zeigt der Einkauf eine Lieferantenseite ("was fehlt?"); ohne Eintrag und
    // ohne offene Bestellung meldet er "nicht gefunden" - dann nennt der Hinweis die Datei.
    stammdatenEintrag: Boolean(stammdaten?.lieferanten?.[id]),
    hinweis: aktionen.length ? null
      : `${art === 'muster' ? 'Musterbestellweg' : 'Bestellweg'} von ${st.name} nicht hinterlegt – Mail, Portal oder Telefon in den Lieferanten-Stammdaten eintragen${stammdaten?.lieferanten?.[id] ? '' : ' (private Datei lieferanten/stammdaten.json auf dem Büro-Mac, Inhaber)'}.`,
  };
}

/**
 * Lexikon-Produkt mit Schnellzugriff an jeder Variante ohne Direkt- und Suchlink:
 * echte Varianten an `link.schnellzugriff` (Bestellweg Ware), Mustervarianten an
 * `original.schnellzugriff` (Bestellweg Muster). Varianten mit Link bleiben unveraendert;
 * das Exportobjekt selbst wird nicht veraendert.
 */
export function lexikonProduktMitSchnellzugriff(produkt, stammdaten) {
  if (!produkt) return produkt;
  const varianten = (produkt.varianten ?? []).map(v => {
    if (v.original) {
      const o = v.original;
      if (!o.gefunden || o.url || o.suchlink) return v;
      const sz = lexikonSchnellzugriff(stammdaten, o.lieferant, { artikel: o, art: 'muster' });
      return sz ? { ...v, original: { ...o, schnellzugriff: sz } } : v;
    }
    if (!v.link || v.link.status === 'vorhanden' || v.link.suchlink) return v;
    const sz = lexikonSchnellzugriff(stammdaten, v.einkauf?.lieferant, { artikel: v.einkauf ?? {}, art: 'ware' });
    return sz ? { ...v, link: { ...v.link, schnellzugriff: sz } } : v;
  });
  return { ...produkt, varianten };
}
