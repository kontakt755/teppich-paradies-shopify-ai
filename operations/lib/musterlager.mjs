/**
 * Musterlager: welche Muster wir selbst da haben - und welche Musterbestellung
 * daraus bedient wird, statt beim Lieferanten zu bestellen.
 *
 * Inhaber 2026-10-13: Bei PVC und Linoleum bekommen wir vom Lieferanten keine
 * kleinen Muster, sondern ein Probestueck 2 x 1 m - daraus schneiden wir viele
 * Muster. Kuenftig kommen von den gaengigsten Teppichboden-Farben Bahnen
 * 4 m x 20 cm dazu. Was davon da ist und wo es liegt, steht hier.
 *
 * Wirkung: Eine offene Musterposition, deren Muster hier vorraetig ist, steht
 * automatisch auf "aus dem Musterlager - verschicken" (dieselben Felder wie die
 * Wahl "haben wir da" aus musterherkunft.mjs). Sie faellt damit aus der
 * Bestellmail, aus "Muster noch zu bestellen" und aus dem To-do "beim Lieferanten
 * bestellen". Eine ausdrueckliche Wahl im Dialog "Woher kommen die Muster?"
 * geht immer vor.
 *
 * Abzaehlen: Einzelmuster gehen so raus, wie sie kommen - jedes verschickte
 * zaehlt ab, bei 0 bestellen wir wieder beim Lieferanten. Von Probestueck und
 * Bahn schneiden wir zu; dort setzt jemand "leer", wenn nichts mehr da ist.
 * Verschickt ist ein Muster, sobald seine Position "An Kunden raus" erreicht
 * (oder "Kunde hat Muster"): dann haengt der Server ein Ereignis mit `lagerId` an
 * musterherkunft.json an. So bleibt die Zuordnung fest, auch wenn das Muster
 * spaeter leer gesetzt oder aus dem Lager genommen wird.
 *
 * Ablage: $TP_PRIVAT_DIR/musterlager.json - nie im Repository, Shopify wird nie
 * geschrieben. Schreiben ist atomar (tmp-Datei + rename).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { restRegel, wirdVerlegt } from './reste.mjs';

export const LAGER_ARTEN = Object.freeze({
  einzel: 'Einzelmuster',
  probestueck: 'Probestück 2 × 1 m',
  bahn: 'Bahn 4 m × 20 cm',
  // Regel 2026-10-21: Reste vom Verlegen (A/C-Ware) heben wir auf und schneiden daraus Muster.
  rest: 'Verlegerest',
});
export const LAGER_ART_WERTE = Object.freeze(Object.keys(LAGER_ARTEN));

/** Einzelmuster werden abgezaehlt; von Probestueck und Bahn schneiden wir zu. */
export const ZAEHLBAR = Object.freeze(['einzel']);

/**
 * Inhaber 2026-10-15: ein zugeschnittenes Muster ist A5 (14,8 x 21 cm). Damit rechnet das Lager
 * "reicht noch fuer ca. N Muster". Masse in cm.
 * - Probestueck 2 x 1 m: 13 x 4 = 52 hochkant, 9 x 6 = 54 quer - die bessere Lage zaehlt.
 * - Bahn 4 m x 20 cm: die Bahnbreite ist die lange A5-Seite (20 statt 21 cm, der Zentimeter
 *   faellt nicht ins Gewicht); abgeschnitten wird alle 14,8 cm -> 27 Muster.
 */
export const MUSTER_GROESSE = Object.freeze({ name: 'A5', breite: 14.8, hoehe: 21 });
const STUECK_MASSE = Object.freeze({ probestueck: [200, 100], bahn: [400, 20] });
/** Toleranz fuer die Bahn: 20 cm Bahnbreite gelten als volle A5-Hoehe. */
const TOLERANZ_CM = 1;

/** Wie viele A5-Muster aus einem Probestueck bzw. einer Bahn kommen; null bei Einzelmustern. */
export function musterJeStueck(art) {
  const m = STUECK_MASSE[art];
  if (!m) return null;
  const [l, b] = m;
  const { breite: kurz, hoehe: lang } = MUSTER_GROESSE;
  const passt = (laenge, seite) => Math.floor((laenge + TOLERANZ_CM) / seite);
  return Math.max(passt(l, kurz) * passt(b, lang), passt(l, lang) * passt(b, kurz));
}

/** Ab so wenigen restlichen Mustern steht ein Eintrag auf "knapp" (09.11.: hoechstens 3); nur Anzeige, bestellt wird nichts. */
export const KNAPP_AB = 3;

/** Preis eines Probestuecks 2 x 1 m beim Lieferanten (Inhaber 2026-10-15), nur zur Anzeige. */
export const PROBESTUECK_PREIS = '8–15 € je nach Qualität';

/** Produktgruppen, bei denen der Lieferant statt eines Musters ein grosses Stueck schickt (Rest einlagern). */
export const GROSSE_STUECKE = Object.freeze(['Vinyl von der Rolle', 'Linoleumboden']);

/** Vorschlaege: so weit zurueck zaehlen Anfragen, ab so vielen lohnt das Einlagern. */
export const GEFRAGT_TAGE = 120;
export const GEFRAGT_AB = 2;
/** Eingetroffene grosse Stuecke werden so lange als "Rest einlagern?" vorgeschlagen. */
export const EINGETROFFEN_TAGE = 45;

const TAG_MS = 86400000;
const UNGEKLAERT = 'UNGEKLAERT';

export class MusterlagerFehler extends Error {}

export function musterlagerPfad(privatDir) {
  return path.join(privatDir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse'), 'musterlager.json');
}

const norm = v => String(v ?? '').trim().toUpperCase();

/**
 * Schluessel eines Musters: SKU ohne "M-" (Mustervarianten tragen M-<SKU der Quellvariante>,
 * bei "Teppich nach Maß" bewusst die der Teppichboden-Qualitaet - dasselbe physische Muster).
 * Sammelprodukt "Kostenloses Muster" (TP-MUSTER): SKU der Quellvariante.
 */
export function musterSchluessel(pos) {
  const sku = norm(pos?.sku);
  if (sku.startsWith('M-')) return sku.slice(2) || null;
  if (sku.startsWith('TP-MUSTER')) {
    const q = norm(pos?.musterQuelle?.sku);
    return q && q !== UNGEKLAERT ? q : null;
  }
  return sku && sku !== UNGEKLAERT ? sku : null;
}

function clip(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Liest das Lager. Fehlende Datei = leer. Eine beschaedigte Datei wirft - sonst
 * schriebe der naechste Klick ein Lager mit genau einem Eintrag (wie auftragsstatus.mjs).
 */
export function leseLager(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e?.code === 'ENOENT') return { eintraege: [], entfernt: [] };
    throw new MusterlagerFehler(`${path.basename(file)} ist nicht lesbar (${e?.code || e?.message}) – bitte aus der Sicherung holen`);
  }
  if (!text.trim()) return { eintraege: [], entfernt: [] };
  let roh;
  try { roh = JSON.parse(text); } catch {
    throw new MusterlagerFehler(`${path.basename(file)} ist beschädigt – bitte aus der Sicherung holen (npm run daten:sichern legt sie an)`);
  }
  const gueltig = e => e && typeof e.id === 'string' && Array.isArray(e.schluessel) && LAGER_ART_WERTE.includes(e.art);
  return {
    eintraege: Array.isArray(roh?.eintraege) ? roh.eintraege.filter(gueltig) : [],
    entfernt: Array.isArray(roh?.entfernt) ? roh.entfernt.filter(gueltig) : [],
  };
}

function schreibeLager(file, lager) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, eintraege: lager.eintraege, entfernt: lager.entfernt }, null, 2));
  fs.renameSync(tmp, file);
}

function anzahlAus(wert) {
  if (wert === null || wert === undefined || wert === '') return null;
  const n = Number(String(wert).replace(',', '.'));
  if (!Number.isInteger(n) || n < 0 || n > 999) throw new MusterlagerFehler('Anzahl muss eine ganze Zahl zwischen 0 und 999 sein');
  return n;
}

function verlaufMit(e, eintrag) {
  return [...(e.verlauf || []), eintrag].slice(-20);
}

/**
 * Muster einlagern. Gibt es dasselbe Muster (ein gemeinsamer Schluessel) in derselben Art
 * schon, kommt die Anzahl dazu und der Lagerplatz wird aktualisiert - ein Muster soll nicht
 * zweimal in der Liste stehen.
 * @returns {{eintrag: object, neu: boolean}}
 */
export function einlagern(file, { titel, farbe, handle = null, schluessel = [], art, anzahl = 1, ort = null, notiz = null, actor, jetzt = new Date(), verbrauchtVon = () => 0 } = {}) {
  if (!actor) throw new MusterlagerFehler('actor ist Pflicht');
  if (!LAGER_ART_WERTE.includes(art)) throw new MusterlagerFehler(`Unbekannte Art „${art}"`);
  const keys = [...new Set((schluessel || []).map(norm).filter(k => k && k !== UNGEKLAERT))];
  if (!keys.length) throw new MusterlagerFehler('Ohne Artikelnummer (SKU) lässt sich das Muster keiner Bestellung zuordnen');
  const t = clip(titel, 160);
  if (!t) throw new MusterlagerFehler('Produkt fehlt');
  const n = anzahlAus(anzahl) ?? 1;
  const am = jetzt.toISOString();
  const lager = leseLager(file);
  const vorhanden = lager.eintraege.find(e => e.art === art && e.schluessel.some(k => keys.includes(k)));
  if (vorhanden) {
    vorhanden.schluessel = [...new Set([...vorhanden.schluessel, ...keys])];
    // Leeres Zuschnitt-Stueck: das Neue ersetzt den Rest, und Abgeschnittenes zaehlt ab jetzt neu.
    const ersetzt = vorhanden.leer && !ZAEHLBAR.includes(art);
    // Leeres Einzelmuster: in der Schublade lag nichts, die alte Gesamtzahl darf nicht wieder aufleben.
    // Gesamt = schon verschickt + neu, sonst stuende mehr als "da", als wirklich liegt.
    const aufgefuellt = vorhanden.leer && ZAEHLBAR.includes(art);
    vorhanden.anzahl = ersetzt ? n : aufgefuellt ? verbrauchtVon(vorhanden.id) + n : (vorhanden.anzahl ?? 0) + n;
    if (ersetzt) vorhanden.basisAm = am;
    if (clip(ort, 80)) vorhanden.ort = clip(ort, 80);
    if (clip(notiz, 300)) vorhanden.notiz = clip(notiz, 300);
    vorhanden.leer = false;
    vorhanden.geaendertAm = am;
    vorhanden.geaendertVon = String(actor);
    vorhanden.verlauf = verlaufMit(vorhanden, { am, von: String(actor), was: `+${n} eingelagert` });
    schreibeLager(file, lager);
    return { eintrag: vorhanden, neu: false };
  }
  const eintrag = {
    id: `ml-${jetzt.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    titel: t,
    farbe: clip(farbe, 120) || null,
    handle: clip(handle, 200) || null,
    schluessel: keys,
    art,
    anzahl: n,
    ort: clip(ort, 80) || null,
    notiz: clip(notiz, 300) || null,
    leer: false,
    angelegtAm: am,
    angelegtVon: String(actor),
    geaendertAm: am,
    geaendertVon: String(actor),
    verlauf: [{ am, von: String(actor), was: `${n} eingelagert` }],
    // Ab hier zaehlen verschickte Muster gegen den Zuschnitt-Vorrat (siehe wendeLagerAn).
    basisAm: am,
  };
  lager.eintraege.push(eintrag);
  schreibeLager(file, lager);
  return { eintrag, neu: true };
}

/** Lagerplatz, Anzahl, Art, Notiz oder "leer" aendern. Nur die uebergebenen Felder. */
export function aendern(file, id, felder = {}, { actor, jetzt = new Date() } = {}) {
  if (!actor) throw new MusterlagerFehler('actor ist Pflicht');
  const lager = leseLager(file);
  const e = lager.eintraege.find(x => x.id === id);
  if (!e) throw new MusterlagerFehler('Dieses Muster steht nicht (mehr) im Musterlager');
  const was = [];
  let neuGezaehlt = false;
  if ('art' in felder) {
    if (!LAGER_ART_WERTE.includes(felder.art)) throw new MusterlagerFehler(`Unbekannte Art „${felder.art}"`);
    if (felder.art !== e.art) { e.art = felder.art; was.push(`Art: ${LAGER_ARTEN[e.art]}`); neuGezaehlt = true; }
  }
  if ('anzahl' in felder) {
    const n = anzahlAus(felder.anzahl);
    if (n !== null && n !== e.anzahl) { e.anzahl = n; was.push(`Anzahl ${n}`); neuGezaehlt = true; }
  }
  if ('ort' in felder) { const o = clip(felder.ort, 80) || null; if (o !== e.ort) { e.ort = o; was.push(o ? `Platz: ${o}` : 'Platz entfernt'); } }
  if ('notiz' in felder) { const nz = clip(felder.notiz, 300) || null; if (nz !== e.notiz) { e.notiz = nz; was.push('Notiz'); } }
  if ('leer' in felder) { const l = !!felder.leer; if (l !== !!e.leer) { e.leer = l; was.push(l ? 'leer' : 'wieder da'); if (!l) neuGezaehlt = true; } }
  if (!was.length) return e;
  const am = jetzt.toISOString();
  // Zuschnitt-Stueck neu gezaehlt oder wieder aufgefuellt: was vorher abgeschnitten wurde, zaehlt
  // nicht mehr gegen den Vorrat. Bei Einzelmustern ist `anzahl` die Gesamtzahl - dort nie.
  if (neuGezaehlt && !ZAEHLBAR.includes(e.art)) e.basisAm = am;
  e.geaendertAm = am;
  e.geaendertVon = String(actor);
  e.verlauf = verlaufMit(e, { am, von: String(actor), was: was.join(', ') });
  schreibeLager(file, lager);
  return e;
}

/** Aus dem Lager nehmen. Der Eintrag bleibt unter `entfernt` lesbar (wer, wann). */
export function entfernen(file, id, { actor, jetzt = new Date() } = {}) {
  if (!actor) throw new MusterlagerFehler('actor ist Pflicht');
  const lager = leseLager(file);
  const i = lager.eintraege.findIndex(x => x.id === id);
  if (i < 0) throw new MusterlagerFehler('Dieses Muster steht nicht (mehr) im Musterlager');
  const [e] = lager.eintraege.splice(i, 1);
  e.entferntAm = jetzt.toISOString();
  e.entferntVon = String(actor);
  lager.entfernt = [...lager.entfernt, e].slice(-200);
  schreibeLager(file, lager);
  return e;
}

/** Was eine Position ueber ihren Lagereintrag zeigt (ohne Verlauf und interne Felder). */
function lagerInfo(e, rest = null) {
  return { id: e.id, art: e.art, artLabel: LAGER_ARTEN[e.art], ort: e.ort || null, rest, zaehlbar: ZAEHLBAR.includes(e.art) };
}

const posKey = (orderId, lineItemId) => `${orderId}::${lineItemId}`;

/**
 * Traegt das Lager an die Musterpositionen des Bestellmodells (Auftraege, Testauftraege,
 * Mustergruppen) - nach wendeAufModellAn() aus musterherkunft.mjs.
 *
 * Felder an der Position (alle additiv):
 * - `musterLager`        {id, art, artLabel, ort, rest, zaehlbar} - kommt aus dem Lager
 * - `musterHerkunft`     'eigen_versand' bei automatischer Zuordnung (wie die Wahl "haben wir da")
 * - `musterHerkunftQuelle` 'lager' bei automatischer Zuordnung
 * - `musterLagerLeer`    {id, artLabel, ort} - steht im Lager, ist aber leer bzw. aufgebraucht
 * - `musterLagerReserviert` true bei ausdruecklicher Wahl "haben wir da", wenn ein Stueck dafuer zurueckliegt
 * - `musterLagerMoeglich` {id, artLabel, ort} - beim Lieferanten bestellt (oder so gewaehlt), liegt aber im
 *                         Lager: Knopf "Aus dem Lager genommen" in der Packstation (09.11.)
 *
 * Automatisch zugeordnet wird nur, was noch offen ist: Muster ohne Auftragsfluss-Stand und
 * ohne ausdrueckliche Wahl, in offenen Auftraegen. Die aelteste Bestellung kommt zuerst dran,
 * damit das letzte Einzelmuster an den geht, der am laengsten wartet.
 *
 * @param {object} modell
 * @param {{eintraege: object[]}} lager
 * @param {object} [opt]
 * @param {object} [opt.statusAlle] auftragsstatus.json -> positionen
 * Zuschnitt-Stuecke (Probestueck, Bahn): `reichtNoch` = anzahl x Muster je Stueck (A5) minus
 * verschickte seit `basisAm` minus reservierte - eine Schaetzung ("ca."), kein Abzaehlen.
 *
 * @returns {Map<string, {verbraucht: number, reserviert: number, rest: number|null, reichtNoch: number|null, jeStueck: number|null}>} je Lagereintrag
 */
export function wendeLagerAn(modell, lager, { statusAlle = {} } = {}) {
  const stand = new Map();
  if (!modell) return stand;
  const eintraege = lager?.eintraege ?? [];
  for (const e of eintraege) stand.set(e.id, { verbraucht: 0, reserviert: 0, rest: null, reichtNoch: null, jeStueck: musterJeStueck(e.art), seitBasis: 0 });
  if (!eintraege.length && !(lager?.entfernt ?? []).length) return stand;
  const jeId = new Map([...(lager?.entfernt ?? []), ...eintraege].map(e => [e.id, e]));
  const jeSchluessel = new Map();
  for (const e of eintraege) for (const k of e.schluessel) {
    if (!jeSchluessel.has(k)) jeSchluessel.set(k, []);
    jeSchluessel.get(k).push(e);
  }
  // Einzelmuster zuerst: sie gehen ohne Zuschneiden raus.
  for (const liste of jeSchluessel.values()) liste.sort((a, b) => ZAEHLBAR.includes(b.art) - ZAEHLBAR.includes(a.art));

  const gesetzt = new Map(); // orderId::lineItemId -> Felder (fuer die Mustergruppen)
  const kandidaten = [];
  const spaeter = []; // Bestellt bzw. Lieferant gewaehlt - nur Angebot "aus dem Lager genommen"
  const auftraege = [...(modell.auftraege ?? []).map(a => ({ a, test: false })), ...(modell.testauftraege ?? []).map(a => ({ a, test: true }))];
  for (const { a, test } of auftraege) {
    for (const p of a.positionen ?? []) {
      if (!p?.istMuster || !p.lineItemId) continue;
      // Schon verschickt: die Zuordnung steht fest (Ereignis mit lagerId).
      if (p.musterLagerId) {
        const e = jeId.get(p.musterLagerId);
        if (e) {
          p.musterLager = lagerInfo(e);
          if (!test && stand.has(e.id)) {
            const st = stand.get(e.id);
            st.verbraucht += 1;
            if (!e.basisAm || !p.musterHerkunftAm || String(p.musterHerkunftAm) >= String(e.basisAm)) st.seitBasis += 1;
          }
          gesetzt.set(posKey(a.id, p.lineItemId), { musterLager: p.musterLager });
        }
        continue;
      }
      const key = musterSchluessel(p);
      const passend = key ? jeSchluessel.get(key) : null;
      if (!passend) continue;
      const gewaehlt = p.musterHerkunft === 'eigen_versand' || p.musterHerkunft === 'eigen_vorbei';
      const status = statusAlle[posKey(a.id, p.lineItemId)]?.status;
      // Beim Lieferanten bestellt (oder so gewaehlt), aber inzwischen im Lager: der Packer darf es von dort nehmen.
      if (!gewaehlt && (!status || status === 'bestellt') && a.offen !== false && (p.menge ?? 1) > 0) spaeter.push({ a, p, passend });
      if (p.musterHerkunft && !gewaehlt) continue; // "Beim Lieferanten bestellen" gewaehlt
      // Status gesetzt, in Shopify schon versendet (offene Menge 0) oder Auftrag zu: nichts mehr zu verschicken.
      if (status || a.offen === false || (p.menge ?? 1) <= 0) {
        // Die Wahl "haben wir da" behaelt den Lagerplatz als Auskunft, belegt aber kein Stueck.
        const e = gewaehlt ? passend.find(x => !x.leer) || null : null;
        if (e) { p.musterLager = lagerInfo(e); gesetzt.set(posKey(a.id, p.lineItemId), { musterLager: p.musterLager }); }
        continue;
      }
      kandidaten.push({ a, p, test, passend, gewaehlt, datum: String(p.orderDatum || a.datum || '') });
    }
  }

  // Rest je Einzelmuster nach dem, was schon verschickt ist.
  const rest = new Map();
  for (const e of eintraege) if (ZAEHLBAR.includes(e.art)) rest.set(e.id, Math.max(0, (e.anzahl ?? 0) - stand.get(e.id).verbraucht));

  // Wer ausdruecklich "haben wir da" gewaehlt hat, nimmt ein Stueck in die Hand - das geht vor, sonst
  // wuerde dasselbe letzte Muster zweimal versprochen. Danach die aelteste Bestellung zuerst.
  kandidaten.sort((x, y) => y.gewaehlt - x.gewaehlt || x.datum.localeCompare(y.datum));
  for (const { a, p, test, passend, gewaehlt } of kandidaten) {
    const e = passend.find(x => !x.leer && (!ZAEHLBAR.includes(x.art) || rest.get(x.id) > 0)) || null;
    if (!e && gewaehlt) continue; // Die Wahl bleibt, aus dem Lager kommt dieses Muster aber nicht.
    if (!e) {
      const leer = passend[0];
      p.musterLagerLeer = { id: leer.id, artLabel: LAGER_ARTEN[leer.art], ort: leer.ort || null };
      gesetzt.set(posKey(a.id, p.lineItemId), { musterLagerLeer: p.musterLagerLeer });
      continue;
    }
    if (ZAEHLBAR.includes(e.art) && !test) rest.set(e.id, rest.get(e.id) - 1);
    if (!test) stand.get(e.id).reserviert += 1;
    const info = lagerInfo(e, ZAEHLBAR.includes(e.art) ? rest.get(e.id) : null);
    const felder = gewaehlt ? { musterLager: info, musterLagerReserviert: true } : {
      musterHerkunft: 'eigen_versand',
      musterHerkunftQuelle: 'lager',
      musterHerkunftAm: e.geaendertAm || e.angelegtAm || null,
      musterHerkunftVon: 'Musterlager',
      musterLager: info,
    };
    Object.assign(p, felder);
    gesetzt.set(posKey(a.id, p.lineItemId), felder);
  }
  // Nach der Verteilung: nur was dann noch uebrig ist, darf ein Packer von Hand nehmen.
  for (const { a, p, passend } of spaeter) {
    if (p.musterLager) continue;
    const e = passend.find(x => !x.leer && (!ZAEHLBAR.includes(x.art) || rest.get(x.id) > 0));
    if (!e) continue;
    p.musterLagerMoeglich = { id: e.id, artLabel: LAGER_ARTEN[e.art], ort: e.ort || null };
    gesetzt.set(posKey(a.id, p.lineItemId), { ...gesetzt.get(posKey(a.id, p.lineItemId)), musterLagerMoeglich: p.musterLagerMoeglich });
  }
  for (const g of modell.musterGruppen ?? []) {
    for (const p of g.positionen ?? []) {
      const f = gesetzt.get(posKey(p.orderId, p.lineItemId));
      if (f) Object.assign(p, f);
    }
  }
  for (const e of eintraege) {
    const st = stand.get(e.id);
    if (ZAEHLBAR.includes(e.art)) st.rest = rest.get(e.id);
    else if (st.jeStueck) st.reichtNoch = e.leer ? 0 : Math.max(0, (e.anzahl ?? 1) * st.jeStueck - st.seitBasis - st.reserviert);
    delete st.seitBasis;
  }
  return stand;
}

/**
 * Fuer diese Musterposition liegt ein Stueck im Lager zurueck und ist noch nicht verschickt. Solange das
 * gilt, wird sie nicht beim Lieferanten bestellt (Inhaber 02.11.: nichts doppelt, bis der Bestand 0 ist).
 */
export function lagerGedeckt(p) {
  return !!(p?.istMuster && p.musterLager?.id && !p.musterLagerId && (p.musterHerkunftQuelle === 'lager' || p.musterLagerReserviert));
}

/**
 * Musterpositionen, die beim Verschicken festgeschrieben werden muessen: automatisch aus dem
 * Lager zugeordnet, noch ohne Ereignis. Der Server haengt fuer jede ein musterherkunft-Ereignis
 * mit `lagerId` an.
 * @param {object} auftrag  Auftrag aus dem Modell (nach wendeLagerAn)
 * @param {string[]|null} [lineItemIds]  nur diese Positionen; null = alle
 */
export function festzuschreiben(auftrag, lineItemIds = null) {
  return (auftrag?.positionen ?? []).filter(p => p.istMuster && p.lineItemId && lagerGedeckt(p)
    && p.musterLager?.id && !p.musterLagerId && (!lineItemIds || lineItemIds.includes(p.lineItemId)));
}

const LIEFERANT_UNTERWEGS = [undefined, null, '', 'bestellt'];
const ROUTEN_OHNE_LIEFERANT = ['SAMPLE_STOCK', 'SAMPLE_CUT'];
/** "Haben wir da" - wie musterEigen() in docs/ai-dashboard/lib/todos.mjs. */
function musterEigen(p) {
  if (p.musterHerkunft === 'eigen_versand' || p.musterHerkunft === 'eigen_vorbei') return true;
  if (p.musterHerkunft === 'lieferant') return false;
  return ROUTEN_OHNE_LIEFERANT.includes(p.route) || ROUTEN_OHNE_LIEFERANT.includes(p.musterRoute);
}

/**
 * Gemischte Musterbestellung (Inhaber 2026-10-15): ein Teil liegt im Lager, ein Teil kommt vom
 * Lieferanten - alles geht zusammen raus, sobald die Lieferanten-Muster da sind. True, solange
 * ein Muster dieser Bestellung noch beim Lieferanten aussteht (nicht bestellt oder bestellt).
 * Spiegel von lieferantMusterAusstehend() in docs/ai-dashboard/lib/todos.mjs.
 */
export function wartetAufLieferant(auftrag, statusAlle = {}) {
  return (auftrag?.positionen ?? []).some(p => p?.istMuster && p.lineItemId && (p.menge ?? 1) > 0
    && !p.musterLager && !musterEigen(p)
    && LIEFERANT_UNTERWEGS.includes(statusAlle[posKey(auftrag.id, p.lineItemId)]?.status));
}

/**
 * Lieferant je Muster-Schluessel aus den Lexikon-Varianten (`einkauf.lieferant`). Die Ware geht vor dem
 * Musterprodukt: Das Musterprodukt fuehrt oft keinen eigenen Lieferanten.
 * @param {object[]} produkte  Lexikon-Produkte
 * @param {(wert: string) => (string|null)} kennungVon  gueltige Kennung aus dem Lexikon-Wert, sonst null
 * @returns {Map<string, string>} Schluessel -> Lieferant-Kennung
 */
export function lieferantJeSchluessel(produkte = [], kennungVon = w => w || null) {
  const je = new Map();
  const istMuster = p => p?.produktgruppe === 'Musterservice';
  for (const p of [...produkte.filter(x => !istMuster(x)), ...produkte.filter(istMuster)]) {
    for (const v of p?.varianten ?? []) {
      const k = musterSchluessel({ sku: v?.sku });
      const id = k ? kennungVon(v?.einkauf?.lieferant) : null;
      if (id && !je.has(k)) je.set(k, id);
    }
  }
  return je;
}

/** Lieferant eines Lagereintrags: der erste Schluessel mit Treffer; null = unbekannt. */
export function lieferantVonEintrag(eintrag, jeSchluessel) {
  for (const k of eintrag?.schluessel ?? []) if (jeSchluessel.has(k)) return jeSchluessel.get(k);
  return null;
}

/** Titel ohne angehaengte Rollenbreiten ("Vellana Teppichboden 400cm 500cm" -> "Vellana Teppichboden"). */
export function kurzTitel(titel) {
  // Danach haengende Trenner weg: "Rustica 5578 – Restposten, 500 cm" -> "Rustica 5578 – Restposten".
  return String(titel ?? '').replace(/^\s*Muster\s*:?\s*/i, '').replace(/(\s+\d{2,3}\s?cm)+\s*(-\s*\d+)?$/i, '').replace(/[\s,;–-]+$/, '').trim();
}

/**
 * Farben eines Lexikon-Produkts mit ihren Schluesseln - fuer "Muster einlagern".
 * Hat das Produkt ein eigenes Musterprodukt, kommen dessen SKUs dazu (bei "Teppich nach Maß"
 * tragen nur die Muster eine SKU). Alle Breiten einer Farbe teilen sich einen Eintrag.
 * @param {object} produkt        Lexikon-Produkt
 * @param {object|null} muster    Lexikon-Eintrag des Musterprodukts (muster-<handle>) oder null
 * @returns {{farbe: string, schluessel: string[]}[]}
 */
export function farbenFuer(produkt, muster = null) {
  const je = new Map();
  const dazu = (farbe, sku) => {
    const f = String(farbe ?? '').trim();
    const k = musterSchluessel({ sku });
    if (!f) return;
    if (!je.has(f)) je.set(f, new Set());
    if (k) je.get(f).add(k);
  };
  for (const v of muster?.varianten ?? []) dazu(v.farbe, v.sku);
  for (const v of produkt?.varianten ?? []) dazu(v.farbe, v.sku);
  const farben = [...je].filter(([, s]) => s.size).map(([farbe, s]) => ({ farbe, schluessel: [...s] }));
  if (farben.length || [...(muster?.varianten ?? []), ...(produkt?.varianten ?? [])].some(v => String(v?.farbe ?? '').trim())) return farben;
  // Artikel ganz ohne Farboption (Restrolle, Zuschnitt, Sonderposten): die Farbe steckt im Titel.
  // Ohne diesen einen Eintrag liess sich so ein Artikel nicht einlagern (2026-11-06, Restrolle).
  const skus = [...new Set([...(muster?.varianten ?? []), ...(produkt?.varianten ?? [])].map(v => musterSchluessel({ sku: v?.sku })).filter(Boolean))];
  return skus.length ? [{ farbe: GANZER_ARTIKEL, ganzerArtikel: true, schluessel: skus }] : [];
}

/** Auswahlname fuer Artikel ohne Farboption; gespeichert wird dann keine Farbe (Titel reicht). */
export const GANZER_ARTIKEL = 'Ganzer Artikel';

/**
 * Vorschlaege fuer das Lager, aus den Bestellungen abgeleitet:
 * - "eingetroffen": ein grosses Stueck (PVC/Linoleum) kam vom Lieferanten - der Rest gehoert ins Lager.
 * - "verlegerest": Teppichboden oder Vinyl zum Verlegen ist da (reste.mjs) - von A/C immer, von
 *   anderen nur, wenn A oder C dieselbe Ware fuehrt (`acTreffer`). Der Rest kommt beschriftet ins
 *   Lager, unter der Artikelnummer der A/C-Variante.
 * - "gefragt": dieselbe Farbe wurde mehrfach als Muster bestellt - einlagern spart Bestellungen.
 * Muster, die schon im Lager stehen, fallen weg.
 *
 * @param {object} modell                  nach wendeLagerAn
 * @param {object} opt
 * @param {{eintraege: object[]}} opt.lager
 * @param {object} [opt.statusAlle]
 * @param {(handle: string) => (string|null)} [opt.produktgruppe]  Produktgruppe aus dem Lexikon
 * @param {(position: object) => object[]} [opt.acTreffer]  A/C-Treffer fuer Ware anderer Quelle (reste.mjs acTrefferFuer)
 * @param {Date} [opt.jetzt]
 */
export function vorschlaege(modell, { lager, statusAlle = {}, produktgruppe = () => null, acTreffer = () => [], jetzt = new Date() } = {}) {
  const imLager = new Set((lager?.eintraege ?? []).flatMap(e => e.schluessel));
  const je = new Map();
  const reste = new Map();
  for (const a of modell?.auftraege ?? []) {
    if (a.storniert) continue;
    for (const p of a.positionen ?? []) {
      if (p && !p.istMuster) { verlegerest(a, p); continue; }
      if (!p?.istMuster) continue;
      const key = musterSchluessel(p);
      if (!key || imLager.has(key)) continue;
      const tage = Math.floor((jetzt.getTime() - new Date(p.orderDatum || a.datum).getTime()) / TAG_MS);
      if (!(tage >= 0) || tage > GEFRAGT_TAGE) continue;
      const handle = p.musterQuelle?.produktHandle || String(p.handle || '').replace(/^muster-/, '') || null;
      if (!je.has(key)) je.set(key, { schluessel: key, titel: kurzTitel(p.titel), farbe: p.farbe && p.farbe !== '–' ? p.farbe : null, handle, anzahl: 0, auftraege: [], eingetroffen: null, zuletzt: null });
      const v = je.get(key);
      v.anzahl += 1;
      v.auftraege.push(a.name);
      if (!v.zuletzt || String(a.datum) > v.zuletzt) v.zuletzt = a.datum;
      const s = p.lineItemId ? statusAlle[posKey(a.id, p.lineItemId)] : null;
      const kam = s?.geliefertAm || null;
      const gross = handle && GROSSE_STUECKE.includes(produktgruppe(handle));
      if (gross && kam && p.musterHerkunft !== 'eigen_versand' && p.musterHerkunft !== 'eigen_vorbei') {
        const vor = Math.floor((jetzt.getTime() - new Date(kam).getTime()) / TAG_MS);
        if (vor >= 0 && vor <= EINGETROFFEN_TAGE && (!v.eingetroffen || kam > v.eingetroffen.am)) v.eingetroffen = { am: kam, orderName: a.name };
      }
    }
  }
  // Ein Verlegerest ersetzt den Vorschlag "gefragt" derselben Farbe: das Material ist ja schon da.
  for (const k of reste.keys()) je.delete(k);
  const RANG = { eingetroffen: 0, verlegerest: 1, gefragt: 2 };
  return [
    ...[...je.values()]
      .filter(v => v.eingetroffen || v.anzahl >= GEFRAGT_AB)
      .map(v => ({ ...v, grund: v.eingetroffen ? 'eingetroffen' : 'gefragt', artVorschlag: v.eingetroffen ? 'probestueck' : 'einzel', auftraege: [...new Set(v.auftraege)].slice(0, 5) })),
    ...reste.values(),
  ]
    .sort((x, y) => RANG[x.grund] - RANG[y.grund] || y.anzahl - x.anzahl || String(y.zuletzt).localeCompare(String(x.zuletzt)))
    .slice(0, 25);

  /** Warenposition: eingetroffene Verlegeware, deren Rest ins Lager gehoert. */
  function verlegerest(a, p) {
    const handle = p.handle || null;
    const regel = handle ? restRegel({ lieferant: p.lieferant, produktgruppe: produktgruppe(handle) }) : null;
    if (!regel || !p.lineItemId || !wirdVerlegt(p, a)) return;
    const kam = statusAlle[posKey(a.id, p.lineItemId)]?.geliefertAm || null;
    const vor = kam ? Math.floor((jetzt.getTime() - new Date(kam).getTime()) / TAG_MS) : -1;
    if (!(vor >= 0) || vor > EINGETROFFEN_TAGE) return;
    let ziel;
    if (regel === 'aufheben') {
      const k = norm(p.sku);
      if (!k || k === UNGEKLAERT) return;
      ziel = { schluessel: k, schluesselAlle: [k], titel: kurzTitel(p.titel), farbe: p.farbe && p.farbe !== '–' ? p.farbe : null, handle, ueber: null };
    } else {
      // Andere Quelle: nur mit belegtem A/C-Gegenstueck in derselben Farbe.
      const t = (acTreffer(p) || []).find(x => x.farbeGefunden && x.farben?.length);
      if (!t) return;
      const skus = t.farben.map(f => norm(f.sku)).filter(Boolean);
      ziel = { schluessel: skus[0], schluesselAlle: skus, titel: kurzTitel(t.titel), farbe: t.farben[0].farbe || null, handle: t.handle, ueber: t.lieferant };
    }
    if (ziel.schluesselAlle.some(k => imLager.has(k))) return;
    const alt = reste.get(ziel.schluessel);
    if (alt && alt.verlegerest.am >= kam) { alt.auftraege = [...new Set([...alt.auftraege, a.name])].slice(0, 5); return; }
    const { ueber, ...angaben } = ziel;
    reste.set(ziel.schluessel, {
      ...angaben, anzahl: 1, auftraege: [...new Set([...(alt?.auftraege ?? []), a.name])].slice(0, 5), zuletzt: a.datum, eingetroffen: null,
      grund: 'verlegerest', artVorschlag: 'rest',
      verlegerest: { am: kam, orderName: a.name, lieferant: String(p.lieferant || '').toUpperCase() || null, ueber },
    });
  }
}

/**
 * Schluessel (SKU ohne "M-") aller Muster, die jetzt sofort aus dem Lager gehen koennen - fuer den
 * Hinweis "Muster sofort lieferbar" im Shop (Shop-Metafeld custom.muster_sofort, 09.11.).
 * Einzelmuster: Rest nach Verschicktem und Reserviertem > 0. Zuschnitt-Stuecke: nicht leer und
 * die Schaetzung reicht noch fuer mindestens ein Muster. Sortiert, damit gleicher Stand gleich vergleicht.
 * @param {{eintraege: object[]}} lager
 * @param {Map<string, {rest: number|null, reichtNoch: number|null}>} stand  aus wendeLagerAn
 * @returns {string[]}
 */
export function sofortLieferbar(lager, stand = new Map()) {
  return [...freiJeSchluessel(lager, stand).keys()].sort();
}

/**
 * Wie viele Muster je Schluessel jetzt frei aus dem Lager gehen koennen (nur > 0). Einzelmuster: Rest nach
 * Verschicktem und Reserviertem; Zuschnitt-Stuecke: die Schaetzung "reicht noch"; leer zaehlt nicht.
 * Mehrere Eintraege zu einem Schluessel addieren sich.
 * @param {{eintraege: object[]}} lager
 * @param {Map<string, {rest: number|null, reichtNoch: number|null}>} stand  aus wendeLagerAn
 * @returns {Map<string, number>}
 */
export function freiJeSchluessel(lager, stand = new Map()) {
  const je = new Map();
  for (const e of lager?.eintraege ?? []) {
    if (e.leer) continue;
    const st = stand.get(e.id);
    const n = ZAEHLBAR.includes(e.art) ? (st ? st.rest : e.anzahl ?? 0) : (st?.reichtNoch ?? 1);
    if (n > 0) for (const k of e.schluessel) je.set(k, (je.get(k) || 0) + n);
  }
  return je;
}

/**
 * Ersatz fuer ein Muster, das nicht kommt (Packstation, "Kunde informieren"): Farben desselben Produkts,
 * von denen jetzt ein Muster frei im Lager liegt. Das Produkt samt "Teppich nach Maß"-Gegenstueck steckt
 * in `farben` (farbenFuer): beide teilen sich die Schluessel einer Farbe. Groesster Posten zuerst,
 * hoechstens `max`; die nicht kommende Farbe selbst (`ausser`) nie.
 * @param {{farbe: string, schluessel: string[], ganzerArtikel?: boolean}[]} farben  aus farbenFuer
 * @param {Map<string, number>} frei  aus freiJeSchluessel
 * @param {string|null} ausser        Schluessel des Musters, das nicht kommt
 * @returns {{farbe: string, frei: number}[]}
 */
export function ersatzAusLager(farben, frei, ausser = null, max = 3) {
  const liste = [];
  for (const f of farben ?? []) {
    if (f.ganzerArtikel || (ausser && f.schluessel.includes(ausser))) continue;
    // Alle Breiten einer Farbe stehen im selben Lagereintrag: der groesste Wert, nicht die Summe.
    const n = Math.max(0, ...f.schluessel.map(k => frei.get(k) || 0));
    if (n > 0) liste.push({ farbe: f.farbe, frei: n });
  }
  return liste.sort((a, b) => b.frei - a.frei || a.farbe.localeCompare(b.farbe, 'de')).slice(0, max);
}
