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
import { UNGEKLAERT } from './umrechnung.mjs';
import { ROUTE } from './route.mjs';
import { positionKey, filterGruppe } from './auftragsstatus.mjs';

export const BESTELLWEGE = Object.freeze(['portal', 'mail', 'telefon']);
export const MUSTER_LIEFERUNG = Object.freeze(['kunde', 'laden']);

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
    },
    muster: {
      weg: p.auswahl(m.weg, 'muster.weg', BESTELLWEGE),
      ansprechperson: p.text(m.ansprechperson, 'muster.ansprechperson', 120),
      mail: p.mail(m.mail, 'muster.mail'),
      telefon: p.telefon(m.telefon, 'muster.telefon'),
      portalUrl: p.url(m.portalUrl, 'muster.portalUrl'),
      lieferung: p.auswahl(m.lieferung, 'muster.lieferung', MUSTER_LIEFERUNG),
    },
    lieferzeitWerktage: p.werktage(roh.lieferzeitWerktage, 'lieferzeitWerktage'),
    mindestmenge: p.text(roh.mindestmenge, 'mindestmenge', 500),
    hinweise: p.text(roh.hinweise, 'hinweise', 2000),
    mail: {
      anrede: p.text(ml.anrede, 'mail.anrede', 200),
      gruss: p.text(ml.gruss, 'mail.gruss', 400),
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
  };
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
    sku: geklaert(pos.sku),
    artikelnummer: geklaert(pos.grosshaendlerId),
    farbnummer,
    menge: geklaert(pos.bestellmenge?.menge),
    einheit: geklaert(pos.bestellmenge?.einheit),
    mengeText: geklaert(pos.bestellmenge?.text),
    mengeHinweis: pos.bestellmenge?.grund ?? null,
    kundenmenge: pos.kundenmenge ?? null,
    route: geklaert(pos.route),
    istMuster: !!pos.istMuster,
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
  return { zuBestellen: [], bestellt: [], unterwegs: [] };
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
  const lieferanten = sortiert(ids).map(id => eintragFuer(id, daten.get(id), stammdaten));
  return {
    schwellen: { nachhakenTage: WARTE_NACHHAKEN_TAGE, problemTage: WARTE_PROBLEM_TAGE },
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

function adressZeilen(a) {
  return [geklaert(a.name), geklaert(a.strasse), `${a.plz} ${a.ort}`, geklaert(a.land)].filter(Boolean);
}

function kundenAdressen(modell) {
  const m = new Map();
  for (const a of modell?.auftraege ?? []) m.set(a.id, a.details?.lieferadresse ?? null);
  return m;
}

function positionsZeilen(p, nr) {
  const kopf = [`Art.-Nr. ${p.artikelnummer}`];
  if (p.farbnummer) kopf.push(`Farb-Nr. ${p.farbnummer}`);
  const bezeichnung = [p.titel, p.farbe].filter(Boolean).join(', ');
  const zeilen = [`${nr}. ${kopf.join(' · ')}`, `   ${bezeichnung}`, `   Menge: ${p.mengeText ?? `${p.menge} ${p.einheit}`}`];
  if (p.orderName) zeilen.push(`   Kommission: ${p.orderName}`);
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
  if (ohneFarbnr) h.push(`${ohneFarbnr} Position(en) ohne Farbnummer - die Farbe steht nur als Name in der Mail.`);
  for (const p of aufgenommen) if (p.mengeHinweis) h.push(`${p.orderName ?? ''} ${p.titel ?? ''}: ${p.mengeHinweis}`.trim());
  return h;
}

function rahmen({ st, absender, anredeStandard }) {
  const anrede = st.mail.anrede ?? anredeStandard;
  const gruss = st.mail.gruss ?? ['Mit freundlichen Grüßen', absender?.kontaktName, absender?.firma ?? 'Teppich Paradies'].filter(Boolean).join('\n');
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

function wareMail(gruppe, { st, absender, statusAlle, adressen, jetzt }) {
  const alle = (gruppe.positionen ?? []).map(p => schlankePosition(p, statusAlle, jetzt));
  const offen = alle.filter(p => p.gruppe === 'zuBestellen');
  const direkt = ZIEL_JE_AUFTRAG.has(gruppe.route);
  const zielAdresse = direkt ? adressen.get(gruppe.positionen?.[0]?.orderId) : absender?.lieferanschrift;
  const aufgenommen = [];
  const fehlt = [];
  for (const p of offen) {
    const gruende = [];
    if (gruppe.lieferant === UNGEKLAERT) gruende.push('Lieferant nicht zugeordnet');
    if (!p.artikelnummer) gruende.push('Artikelnummer beim Lieferanten fehlt');
    if (p.menge === null || !p.einheit) gruende.push(`Bestellmenge ungeklärt${p.mengeHinweis ? ` (${p.mengeHinweis})` : ''}`);
    if (direkt && !adresseOk(zielAdresse)) gruende.push('Lieferanschrift des Kunden fehlt');
    if (gruende.length) fehlt.push(fehltEintrag(p, gruende)); else aufgenommen.push(p);
  }
  const { anrede, gruss } = rahmen({ st, absender, anredeStandard: 'Sehr geehrte Damen und Herren,' });
  const zeilen = [anrede, '', 'wir bestellen folgende Ware:', ''];
  if (st.kundennummer) zeilen.push(`Unsere Kundennummer: ${st.kundennummer}`, '');
  aufgenommen.forEach((p, i) => zeilen.push(...positionsZeilen(p, i + 1), ''));
  if (direkt) {
    zeilen.push(gruppe.route === ROUTE.SUPPLIER_TO_SITE ? 'Bitte liefern Sie direkt an die Baustelle:' : 'Bitte liefern Sie direkt an unseren Kunden:');
    if (adresseOk(zielAdresse)) zeilen.push(...adressZeilen(zielAdresse));
  } else if (adresseOk(zielAdresse)) {
    zeilen.push('Lieferanschrift:', ...adressZeilen(zielAdresse));
  } else {
    zeilen.push('Lieferung bitte an unsere bekannte Geschäftsadresse.');
  }
  zeilen.push('', 'Bitte bestätigen Sie uns den Auftrag mit dem voraussichtlichen Liefertermin.', '', gruss);
  const betreff = ['Bestellung', st.kundennummer ? `Kd.-Nr. ${st.kundennummer}` : null, kurzListe(aufgenommen.map(p => p.orderName))].filter(Boolean).join(' – ');
  return fertigeMail({
    st, art: 'ware', an: st.ware.mail, betreff, zeilen, aufgenommen, fehlt,
    extra: {
      gruppe: gruppe.schluessel,
      route: geklaert(gruppe.route),
      lieferziel: direkt ? (gruppe.route === ROUTE.SUPPLIER_TO_SITE ? 'baustelle' : 'kunde') : 'laden',
      bereitsBestellt: alle.length - offen.length,
    },
  });
}

/** Muster, die nicht beim Lieferanten bestellt werden (eigenes Musterlager, Zuschnitt aus der Rolle). */
const MUSTER_OHNE_LIEFERANT = new Set([ROUTE.SAMPLE_STOCK, ROUTE.SAMPLE_CUT]);

function musterMail(gruppen, { st, absender, statusAlle, adressen, jetzt, ziel }) {
  const alle = gruppen.flatMap(g => g.positionen ?? []).map(p => schlankePosition(p, statusAlle, jetzt));
  const offen = alle.filter(p => p.gruppe === 'zuBestellen');
  const lieferung = MUSTER_LIEFERUNG.includes(ziel) ? ziel : st.muster.lieferung;
  const aufgenommen = [];
  const fehlt = [];
  const ohneBestellung = [];
  for (const p of offen) {
    if (MUSTER_OHNE_LIEFERANT.has(p.route)) { ohneBestellung.push(fehltEintrag(p, [p.route === ROUTE.SAMPLE_STOCK ? 'Muster aus dem eigenen Musterlager' : 'Muster wird selbst zugeschnitten'])); continue; }
    const gruende = [];
    if (!p.artikelnummer) gruende.push('Artikelnummer beim Lieferanten fehlt');
    if (!(p.menge > 0)) gruende.push('Anzahl fehlt');
    if (!lieferung) gruende.push('Lieferziel für Muster nicht festgelegt (Stammdaten muster.lieferung oder ziel=kunde|laden)');
    else if (lieferung === 'kunde' && !adresseOk(adressen.get(p.orderId))) gruende.push('Lieferanschrift des Kunden fehlt');
    if (gruende.length) fehlt.push(fehltEintrag(p, gruende)); else aufgenommen.push(p);
  }
  const person = st.muster.ansprechperson;
  const { anrede, gruss } = rahmen({ st, absender, anredeStandard: person ? `Guten Tag ${person},` : 'Sehr geehrte Damen und Herren,' });
  const zeilen = [anrede, '', 'bitte senden Sie uns folgende Muster:', ''];
  if (st.kundennummer) zeilen.push(`Unsere Kundennummer: ${st.kundennummer}`, '');
  const musterZeile = (p, nr) => {
    const z = positionsZeilen({ ...p, mengeText: `${p.menge} Muster` }, nr);
    return lieferung === 'kunde' ? z.filter(t => !t.startsWith('   Kommission:')) : z;
  };
  if (lieferung === 'kunde') {
    zeilen[2] = 'bitte senden Sie folgende Muster direkt an unsere Kunden:';
    const jeAuftrag = new Map();
    for (const p of aufgenommen) { if (!jeAuftrag.has(p.orderId)) jeAuftrag.set(p.orderId, []); jeAuftrag.get(p.orderId).push(p); }
    let nr = 0;
    for (const [orderId, liste] of jeAuftrag) {
      zeilen.push(`Lieferanschrift (Kommission ${liste[0].orderName}):`, ...adressZeilen(adressen.get(orderId)), '');
      for (const p of liste) { nr += 1; zeilen.push(...musterZeile(p, nr)); }
      zeilen.push('');
    }
  } else {
    aufgenommen.forEach((p, i) => zeilen.push(...musterZeile(p, i + 1), ''));
    if (adresseOk(absender?.lieferanschrift)) zeilen.push('Lieferanschrift:', ...adressZeilen(absender.lieferanschrift), '');
    else zeilen.push('Lieferung bitte an unsere bekannte Geschäftsadresse.', '');
  }
  zeilen.push('Vielen Dank.', '', gruss);
  const stueck = aufgenommen.reduce((s, p) => s + Number(p.menge || 0), 0);
  const betreff = ['Musterbestellung', st.kundennummer ? `Kd.-Nr. ${st.kundennummer}` : null, `${stueck} Muster`, kurzListe(aufgenommen.map(p => p.orderName))].filter(Boolean).join(' – ');
  return fertigeMail({
    st, art: 'muster', an: st.muster.mail, betreff, zeilen, aufgenommen, fehlt,
    extra: { gruppe: null, route: 'MUSTER', lieferziel: lieferung ?? null, bereitsBestellt: alle.length - offen.length, ohneBestellung },
  });
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
 * @param {'kunde'|'laden'} [p.ziel] nur Muster: ueberstimmt muster.lieferung aus den Stammdaten
 * @returns {{lieferant:string, name:string, art:string, mails:object[]}}
 */
export function bestellmail({ modell, lieferant, art = 'ware', gruppe = null, ziel = null, statusAlle = {}, stammdaten = null, jetzt = new Date() } = {}) {
  const id = kennung(lieferant);
  if (!id) throw new LieferantenFehler('lieferant ist Pflicht');
  if (!['ware', 'muster'].includes(art)) throw new LieferantenFehler('art muss "ware" oder "muster" sein');
  if (ziel && !MUSTER_LIEFERUNG.includes(ziel)) throw new LieferantenFehler('ziel muss "kunde" oder "laden" sein');
  const st = stammdatenFuer(stammdaten, id);
  const kontext = { st, absender: stammdaten?.absender ?? null, statusAlle, adressen: kundenAdressen(modell), jetzt, ziel };
  let mails;
  if (art === 'muster') {
    const gruppen = (modell?.musterGruppen ?? []).filter(g => g.lieferant === id);
    mails = gruppen.length ? [musterMail(gruppen, kontext)] : [];
  } else {
    const gruppen = (modell?.gruppen ?? []).filter(g => g.lieferant === id && (!gruppe || g.schluessel === gruppe));
    if (gruppe && !gruppen.length) throw new LieferantenFehler('Gruppe nicht gefunden - Bestelldaten evtl. inzwischen aktualisiert');
    mails = gruppen.map(g => wareMail(g, kontext));
  }
  // Mails ohne offene Position (alles schon bestellt) bleiben sichtbar, aber leer - so
  // sieht die Oberflaeche "nichts mehr zu bestellen" statt eines Fehlers.
  return { lieferant: id, name: st.name, art, automatischGesendet: false, mails };
}
