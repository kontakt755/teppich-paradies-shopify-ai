/**
 * Muster im Shop sperren, wenn eine Farbe nicht verfuegbar ist (Inhaber 2026-10-16:
 * "die Farben sollten im Shop sofort als keine Muster verfuegbar angezeigt werden").
 *
 * Modell: jedes Muster ist eine Variante des Musterprodukts `muster-<handle>` mit SKU
 * `M-<Quell-SKU>`. Der Musterkonfigurator im Theme wertet `variant.available` aus. Heute stehen
 * die Mustervarianten ohne Bestandsverfolgung da (Lesprobe 16.10.: 249 von 249 untracked, DENY,
 * Bestand 0) - sie sind deshalb immer bestellbar. Gesperrt heisst:
 *   Bestand verfolgen (inventoryItem tracked true) + "nicht verkaufen, wenn ausverkauft"
 *   (inventoryPolicy DENY) + Bestand 0 am Standort.
 * Nie werden Varianten geloescht, Preise oder SKUs geaendert oder das Quellprodukt angefasst.
 *
 * Dieselbe Farbe steht oft in zwei Musterprodukten (Teppichboden-Muster `muster-<linie>-teppichboden-…`
 * und Nach-Mass-Muster `muster-<linie>-teppich-nach-mass`; Lexikon 28.10.: 2028 von 3911 Muster-SKUs).
 * Gesperrt und freigegeben wird deshalb je SKU jede Mustervariante mit dieser SKU, jede mit eigenem
 * Vorstand. Liegt die SKU mehrfach und dabei auch ausserhalb eines Musterprodukts, ist unklar, was
 * gemeint ist - dann wird nichts geschrieben (grund "mehrdeutig").
 *
 * "Wieder verfuegbar" stellt je Variante den Stand vor der Sperre wieder her (der steht im ersten
 * Sperr-Ereignis): war die Variante vorher ohne Bestandsverfolgung, wird sie es wieder - sonst
 * waere sie mit Bestand 1 nach der naechsten Musterbestellung von selbst wieder gesperrt. War sie
 * verfolgt, kommt die alte Menge zurueck, mindestens 1. Varianten, die keine Sperre angefasst hat,
 * bleiben unberuehrt.
 *
 * Feste Reihenfolge beim Schreiben (wie sonderposten.mjs):
 *   1. Rechte pruefen (currentAppInstallation.accessScopes): ohne write_inventory und
 *      write_products wird nichts geschrieben - die Sperre steht dann als "im Shop noch zu sperren".
 *   2. Varianten per SKU frisch lesen - nie dem Browser glauben.
 *   3. Je Variante: Bestand -> 0 (Compare-and-swap, @idempotent), Richtlinie -> DENY, Verfolgung -> an.
 *      In dieser Reihenfolge: erst die Verfolgung macht die Sperre wirksam, vorher aendert nichts
 *      die Bestellbarkeit.
 *   4. Gegenprobe: erneut lesen, availableForSale muss bei jeder Variante false sein. userErrors: []
 *      ist kein Beleg. Kommt auf eine Mutation keine Antwort, entscheidet ebenfalls das erneute Lesen.
 *
 * Ablage $TP_PRIVAT_DIR/mustersperre.json - nur anhaengen, nie ueberschreiben. Je Ereignis: SKU,
 * Farbe, Produkt, orderId, wer, wann, Grund ("nicht verfuegbar" | "wieder verfuegbar") und ob der
 * Shopify-Stand geschrieben wurde (samt Fehler), dazu `shopify.varianten` mit jeder Variante und ihrem
 * Vorstand. Aeltere Ereignisse kennen nur eine Variante (variantId/vorher direkt unter `shopify`).
 * Der Stand je SKU ergibt sich aus der Folge. Protokoll und Audit schreibt der Aufrufer
 * (scripts/dashboard-api.mjs).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { STORE } from '../sync/zugang.mjs';
import { STANDORT_ID } from './sonderposten.mjs';

export const GRUND = Object.freeze({ GESPERRT: 'nicht verfuegbar', FREI: 'wieder verfuegbar' });
const GRUND_WERTE = Object.values(GRUND);

/** Schreibrechte, ohne die nichts geschrieben wird (Bestand/Verfolgung bzw. Richtlinie der Variante). */
export const NOETIGE_RECHTE = Object.freeze(['write_inventory', 'write_products']);

export class MustersperreFehler extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.grund = extra.grund || null;
    this.extra = extra;
  }
}

// ---------------------------------------------------------------------------
// Ablage
// ---------------------------------------------------------------------------

export function mustersperrePfad(privatDir) {
  return path.join(privatDir || process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse'), 'mustersperre.json');
}

const norm = v => String(v ?? '').trim().toUpperCase();
function clip(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Alle Ereignisse. Nur eine FEHLENDE (oder leere) Datei gilt als leer; eine beschaedigte wirft -
 * sonst schriebe der naechste Klick eine Datei mit genau einem Ereignis.
 */
export function leseSperren(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e?.code === 'ENOENT') return [];
    throw new MustersperreFehler(500, `${path.basename(file)} ist nicht lesbar (${e?.code || e?.message}) – bitte aus der Sicherung holen`, { grund: 'ablage' });
  }
  if (!text.trim()) return [];
  let roh;
  try { roh = JSON.parse(text); } catch { roh = null; }
  if (!roh || typeof roh !== 'object' || !Array.isArray(roh.ereignisse)) {
    throw new MustersperreFehler(500, `${path.basename(file)} ist beschädigt – bitte aus der Sicherung holen (npm run daten:sichern legt sie an). Es wurde nichts verändert.`, { grund: 'ablage' });
  }
  return roh.ereignisse.filter(e => e && typeof e.sku === 'string' && GRUND_WERTE.includes(e.grund) && e.am);
}

/** Baut ein Ereignis (ohne zu schreiben) - wirft bei fehlenden Pflichtangaben. */
export function ereignis({ sku, farbe = null, produkt = null, handle = null, orderId = null, orderName = null, von, grund, shopify = {}, jetzt = new Date() } = {}) {
  const s = norm(sku);
  if (!s) throw new MustersperreFehler(400, 'Ohne Artikelnummer (SKU) lässt sich kein Muster sperren', { grund: 'eingabe' });
  if (!von) throw new MustersperreFehler(400, 'Wer gesperrt hat, fehlt', { grund: 'eingabe' });
  if (!GRUND_WERTE.includes(grund)) throw new MustersperreFehler(400, `Unbekannter Grund „${grund}"`, { grund: 'eingabe' });
  const sh = shopify || {};
  const varianten = (Array.isArray(sh.varianten) ? sh.varianten : []).filter(v => v?.variantId).map(v => ({
    variantId: String(v.variantId), productId: v.productId || null, handle: clip(v.handle, 200) || null,
    ...(v.bereits ? { bereits: true } : {}),
    ...(typeof v.aenderungMoeglich === 'boolean' ? { aenderungMoeglich: v.aenderungMoeglich } : {}),
    ...(v.vorher ? { vorher: v.vorher } : {}),
    ...(v.nachher ? { nachher: v.nachher } : {}),
    ...(typeof v.verfuegbar === 'boolean' ? { verfuegbar: v.verfuegbar } : {}),
  }));
  return {
    sku: s, farbe: clip(farbe, 120) || null, produkt: clip(produkt, 200) || null, handle: clip(handle, 200) || null,
    orderId: orderId ? String(orderId) : null, orderName: orderName ? clip(orderName, 40) : null,
    von: String(von), am: jetzt.toISOString(), grund,
    shopify: {
      geschrieben: sh.geschrieben === true,
      ...(typeof sh.aenderungMoeglich === 'boolean' ? { aenderungMoeglich: sh.aenderungMoeglich } : {}),
      ...(sh.bereits ? { bereits: true } : {}),
      fehler: sh.fehler ? clip(sh.fehler, 400) : null,
      ...(sh.fehlerGrund ? { fehlerGrund: sh.fehlerGrund } : {}),
      variantId: sh.variantId || null,
      productId: sh.productId || null,
      ...(sh.vorher ? { vorher: sh.vorher } : {}),
      ...(sh.nachher ? { nachher: sh.nachher } : {}),
      ...(typeof sh.verfuegbar === 'boolean' ? { verfuegbar: sh.verfuegbar } : {}),
      ...(varianten.length ? { varianten } : {}),
    },
  };
}

/**
 * Die Varianten eines Ereignisses. Neue Ereignisse fuehren `shopify.varianten`; aeltere kennen nur
 * eine Variante direkt unter `shopify` (variantId, vorher, bereits) - sie gelten als Liste mit einer.
 */
export function variantenVon(sh = {}) {
  if (Array.isArray(sh.varianten) && sh.varianten.length) return sh.varianten.filter(v => v?.variantId);
  if (!sh.variantId) return [];
  return [{ variantId: sh.variantId, productId: sh.productId || null, vorher: sh.vorher || null, ...(sh.bereits ? { bereits: true } : {}) }];
}

/** Haengt Ereignisse an (tmp-Datei + rename). Liest streng: eine beschaedigte Ablage bleibt unberuehrt. */
export function haengeAn(file, neue = []) {
  if (!neue.length) return [];
  const alle = leseSperren(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, ereignisse: [...alle, ...neue] }, null, 2));
  fs.renameSync(tmp, file);
  return neue;
}

/**
 * Stand je SKU aus der Ereignisfolge.
 * @returns {Map<string, {sku, farbe, produkt, handle, seit, von, auftraege: {orderId, orderName}[],
 *   imShop: boolean, shopPruefen: boolean, fehler: string|null, fehlerGrund: string|null, variantId, productId, vorher, freigabeFehler,
 *   varianten: {variantId, productId, handle, vorher, betroffen}[]}>}
 *   Nur aktive Sperren; "wieder verfuegbar" (erfolgreich oder sicher ohne moegliche Shop-Aenderung) nimmt sie heraus.
 *   `varianten` traegt je Variante ihren eigenen Rueckweg; `variantId`/`vorher` direkt am Stand sind der
 *   einvariantige Stand aelterer Ereignisse (bei mehreren Varianten null).
 */
export function stand(ereignisse = []) {
  const aktiv = new Map();
  const liste = [...ereignisse].sort((a, b) => String(a.am).localeCompare(String(b.am)));
  for (const e of liste) {
    const sh = e.shopify || {};
    let s = aktiv.get(e.sku);
    if (e.grund === GRUND.FREI) {
      if (!s) continue;
      if (sh.geschrieben || !s.shopPruefen) aktiv.delete(e.sku);
      else {
        s.imShop = false; // Nach einer fehlgeschlagenen Freigabe ist auch die Sperre nicht mehr bestaetigt.
        s.freigabeFehler = sh.fehler || 'Im Shop nicht wieder freigegeben';
      }
      continue;
    }
    if (!s) {
      s = { sku: e.sku, farbe: null, produkt: null, handle: null, seit: e.am, von: e.von, auftraege: [], imShop: false, shopPruefen: false, fehler: null, fehlerGrund: null, variantId: null, productId: null, vorher: null, freigabeFehler: null, varianten: [], vorherOhneId: null };
      aktiv.set(e.sku, s);
    }
    // Alte Ereignisse koennen bereits teilweise geschrieben sein, ohne eine bestaetigte Sperre.
    // Ein bekannter Vorstand bleibt deshalb auch nach spaeter fehlendem Zugang pruefpflichtig.
    const altUnklar = typeof sh.aenderungMoeglich !== 'boolean' && (Boolean(sh.vorher)
      || !['kein-zugang', 'nicht-erreichbar', 'recht-fehlt', 'keine-mustervariante', 'mehrdeutig', 'kein-standort'].includes(sh.fehlerGrund));
    const aenderungMoeglich = sh.geschrieben === true || sh.aenderungMoeglich === true || altUnklar;
    s.shopPruefen ||= aenderungMoeglich;
    s.farbe = e.farbe || s.farbe;
    s.produkt = e.produkt || s.produkt;
    s.handle = e.handle || s.handle;
    if (e.orderId && !s.auftraege.some(a => a.orderId === e.orderId)) s.auftraege.push({ orderId: e.orderId, orderName: e.orderName || null });
    s.variantId = sh.variantId || s.variantId;
    s.productId = sh.productId || s.productId;
    // Erst die erste moegliche Aenderung legt den Rueckweg fest. Ein sicher abgelehnter
    // Versuch darf spaeter frisch gelesenen Bestand nicht durch einen alten Vorstand ersetzen.
    if (!s.vorher && sh.vorher && !sh.bereits && aenderungMoeglich) s.vorher = sh.vorher;
    // Dieselbe Regel je Variante: eine schon vorher gesperrte (bereits) oder sicher nicht angefasste
    // Variante legt keinen Rueckweg fest - auch wenn eine andere Variante im selben Versuch geschrieben wurde.
    const liste = variantenVon(sh);
    // Sehr alte Ereignisse tragen einen Vorstand ohne variantId. Er gehoert zu der einen Variante von damals
    // und geht als frueherer Rueckweg vor: an die erste, die ein spaeteres Ereignis nennt - eindeutig nur,
    // wenn es genau eine nennt oder genau eine davon schon gesperrt vorfand.
    if (!liste.length && sh.vorher && !sh.bereits && aenderungMoeglich) s.vorherOhneId ||= sh.vorher;
    if (s.vorherOhneId && !s.varianten.length && liste.length) {
      const damals = liste.length === 1 ? liste : liste.filter(v => v.bereits);
      if (damals.length === 1) s.varianten.push({ variantId: damals[0].variantId, productId: damals[0].productId || null, handle: damals[0].handle || null, vorher: s.vorherOhneId, betroffen: true });
    }
    for (const v of liste) {
      let k = s.varianten.find(x => x.variantId === v.variantId);
      if (!k) { k = { variantId: v.variantId, productId: v.productId || null, handle: v.handle || null, vorher: null, betroffen: false }; s.varianten.push(k); }
      const moeglich = typeof v.aenderungMoeglich === 'boolean' ? v.aenderungMoeglich : aenderungMoeglich;
      if (!k.vorher && v.vorher && !v.bereits && moeglich) k.vorher = v.vorher;
      // Betroffen = gesperrt vorgefunden oder womoeglich angefasst. Nur betroffene gibt "Wieder verfuegbar"
      // frei; eine nach einem Abbruch nie angefasste Variante bleibt, wie sie ist.
      k.betroffen ||= Boolean(v.bereits) || moeglich;
    }
    if (sh.geschrieben) { s.imShop = true; s.fehler = null; s.fehlerGrund = null; s.freigabeFehler = null; }
    else if (!s.imShop) { s.fehler = sh.fehler || s.fehler; s.fehlerGrund = sh.fehlerGrund || s.fehlerGrund; }
  }
  return aktiv;
}

/** Schon gesperrt fuer genau diesen Auftrag? Dann ist ein zweiter Klick ein No-op (Idempotenz). */
export function schonErledigt(aktiv, sku, orderId) {
  const s = aktiv.get(norm(sku));
  return Boolean(s && s.imShop && (!orderId || s.auftraege.some(a => a.orderId === String(orderId))));
}

/** Admin-Link: zur Variante, sonst die Produktsuche nach der SKU. */
export function adminLink({ sku, variantId = null, productId = null } = {}) {
  const num = gid => String(gid || '').split('/').pop();
  if (variantId && productId) return `https://admin.shopify.com/store/${STORE}/products/${num(productId)}/variants/${num(variantId)}`;
  return `https://admin.shopify.com/store/${STORE}/products?${new URLSearchParams({ query: sku || '' })}`;
}

// ---------------------------------------------------------------------------
// Shopify
// ---------------------------------------------------------------------------

export const RECHTE_QUERY = 'query MustersperreRechte { currentAppInstallation { accessScopes { handle } } }';

export const VARIANTE_QUERY = `
query MustersperreVariante($q: String!, $locationId: ID!) {
  productVariants(first: 25, query: $q) {
    pageInfo { hasNextPage }
    nodes {
      id sku inventoryPolicy availableForSale
      product { id handle title }
      inventoryItem { id tracked inventoryLevel(locationId: $locationId) { quantities(names: ["available"]) { name quantity } } }
    }
  }
}`;

/** Bekannte Varianten per ID - fuer die Freigabe, auch wenn sich die SKU inzwischen geaendert hat. */
export const VARIANTEN_NACH_ID_QUERY = `
query MustersperreVariantenNachId($ids: [ID!]!, $locationId: ID!) {
  nodes(ids: $ids) {
    ... on ProductVariant {
      id sku inventoryPolicy availableForSale
      product { id handle title }
      inventoryItem { id tracked inventoryLevel(locationId: $locationId) { quantities(names: ["available"]) { name quantity } } }
    }
  }
}`;

export const BESTAND_MUTATION = `
mutation MustersperreBestand($input: InventorySetQuantitiesInput!, $schluessel: String!) {
  inventorySetQuantities(input: $input) @idempotent(key: $schluessel) {
    inventoryAdjustmentGroup { id }
    userErrors { field message code }
  }
}`;

export const RICHTLINIE_MUTATION = `
mutation MustersperreRichtlinie($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id inventoryPolicy }
    userErrors { field message }
  }
}`;

export const VERFOLGUNG_MUTATION = `
mutation MustersperreVerfolgung($id: ID!, $input: InventoryItemInput!) {
  inventoryItemUpdate(id: $id, input: $input) {
    inventoryItem { id tracked }
    userErrors { field message }
  }
}`;

export function istZugriffVerweigert(err) {
  return /access denied|ACCESS_DENIED|HTTP 403|write_inventory|write_products/i.test(String(err?.message || err));
}

export function rechtFehltText(fehlend = NOETIGE_RECHTE) {
  return `Im Shop nicht gesperrt: dem Control Center fehlt das Shopify-Recht ${fehlend.join(' und ')} `
    + '(Inhaber schaltet es im Dev Dashboard frei, danach den Dashboard-Dienst neu starten). Bis dahin die Variante über den Link in Shopify sperren.';
}

/** Welche der noetigen Rechte fehlen? Wirft bei Lesefehlern (dann ist nichts bekannt). */
export async function pruefeRechte(proxy) {
  const d = await proxy.execute(RECHTE_QUERY, {});
  const erteilt = new Set((d?.currentAppInstallation?.accessScopes || []).map(s => s?.handle));
  return { fehlend: NOETIGE_RECHTE.filter(r => !erteilt.has(r)) };
}

const menge = level => level?.quantities?.find(q => q.name === 'available')?.quantity ?? null;

/** Stand einer Variante in der Form, die Ablage und Vergleich brauchen. */
function zustand(v) {
  return {
    variantId: v.id, productId: v.product?.id || null, handle: v.product?.handle || null, produkt: v.product?.title || null,
    inventoryItemId: v.inventoryItem?.id || null, tracked: Boolean(v.inventoryItem?.tracked), policy: v.inventoryPolicy || null,
    menge: menge(v.inventoryItem?.inventoryLevel), levelDa: Boolean(v.inventoryItem?.inventoryLevel), verfuegbar: v.availableForSale === true,
  };
}

const istMusterprodukt = v => String(v?.product?.handle || '').startsWith('muster-');

/**
 * Alle Varianten einer Muster-SKU frisch lesen. Nur exakte Treffer. Liegt die SKU mehrfach, gelten
 * alle - aber nur, wenn jede in einem Musterprodukt (muster-*) liegt; ein Treffer ausserhalb macht
 * die SKU mehrdeutig. Eine einzelne Variante gilt wie bisher auch ausserhalb. [] = keine im Shop.
 */
export async function leseVarianten(proxy, sku, { standortId = STANDORT_ID } = {}) {
  const s = norm(sku);
  const d = await proxy.execute(VARIANTE_QUERY, { q: `sku:"${s.replace(/"/g, '')}"`, locationId: standortId });
  // Mehr als eine Seite: welche Varianten die SKU tragen, waere nicht vollstaendig bekannt.
  if (d?.productVariants?.pageInfo?.hasNextPage) {
    throw new MustersperreFehler(409, `Zur Artikelnummer ${s} findet Shopify zu viele Varianten – bitte in Shopify von Hand sperren.`, { grund: 'mehrdeutig' });
  }
  const treffer = (d?.productVariants?.nodes || []).filter(v => norm(v?.sku) === s);
  if (treffer.length > 1 && !treffer.every(istMusterprodukt)) {
    const fremd = [...new Set(treffer.filter(v => !istMusterprodukt(v)).map(v => v.product?.handle || v.id))];
    throw new MustersperreFehler(409, `Die Artikelnummer ${s} gibt es im Shop mehrfach, auch außerhalb der Musterprodukte (${fremd.join(', ')}) – bitte in Shopify von Hand sperren.`, { grund: 'mehrdeutig' });
  }
  return treffer.map(zustand);
}

/** Varianten per ID frisch lesen; geloeschte fehlen im Ergebnis. */
export async function leseVariantenNachId(proxy, ids, { standortId = STANDORT_ID } = {}) {
  const d = await proxy.execute(VARIANTEN_NACH_ID_QUERY, { ids, locationId: standortId });
  return (d?.nodes || []).filter(v => v?.id).map(zustand);
}

const istGesperrt = z => Boolean(z && z.tracked && z.policy === 'DENY' && (z.menge ?? 0) <= 0);
const kurz = z => (z ? { tracked: z.tracked, policy: z.policy, menge: z.menge } : null);

/** variantId/productId direkt am Ergebnis nur bei genau einer Variante (Ablage aelterer Form, Admin-Link). */
const einzeln = vs => (vs.length === 1 ? { variantId: vs[0].variantId, productId: vs[0].productId } : { variantId: null, productId: null });

/** Je Variante ein eigener @idempotent-Schluessel - derselbe fuer zwei verschiedene Mutationen waere falsch. */
function schluesselFuer(schluessel, i) {
  if (!i) return schluessel;
  const h = createHash('sha256').update(`${schluessel}:${i}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const variantenReferenz = v => `gid://shopify/ProductVariant/${String(v.variantId).split('/').pop()}`;

async function leseOderNull(proxy, sku, standortId) {
  try { return await leseVarianten(proxy, sku, { standortId }); } catch { return null; }
}

/**
 * Eine Mutation ausfuehren. Fehlende Rechte -> Abbruch (sicher nichts geschrieben); userErrors ->
 * Abbruch mit Shopifys Text; keine Antwort -> weiter, die Gegenprobe entscheidet.
 * @returns {Promise<boolean>} true = Antwort verloren
 */
async function fuehreAus(proxy, mutation, variablen, feld) {
  let antwort;
  try { antwort = await proxy.execute(mutation, variablen); } catch (err) {
    if (istZugriffVerweigert(err)) {
      const recht = String(err?.message || '').match(/(write_[a-z_]+)/)?.[1];
      throw new MustersperreFehler(403, rechtFehltText(recht ? [recht] : NOETIGE_RECHTE), { grund: 'recht-fehlt' });
    }
    return true;
  }
  const fehler = antwort?.[feld]?.userErrors ?? [];
  if (fehler.length) {
    if (fehler.some(e => /STALE|COMPARE/i.test(e.code || ''))) {
      throw new MustersperreFehler(409, 'Der Bestand wurde gerade gleichzeitig geändert – bitte noch einmal versuchen.', { grund: 'bestand' });
    }
    throw new MustersperreFehler(502, `Shopify hat die Änderung abgelehnt: ${fehler.map(e => e.message).join('; ')}`, { grund: 'abgelehnt' });
  }
  return false;
}

/**
 * Stellt die Variante auf `ziel` ({tracked, policy, menge}) - in der Reihenfolge, in der jeder
 * Zwischenstand harmlos ist: beim Sperren erst Bestand und Richtlinie, zuletzt die Verfolgung;
 * beim Freigeben genauso (die Verfolgung aus macht sie sofort wieder bestellbar).
 * `geaendert` sammelt die Varianten, an denen eine Mutation ausgefuehrt worden sein kann (auch mit
 * verlorener Antwort) - nach einem Abbruch entscheidet das je Variante, ob ihr Vorstand als Rueckweg gilt.
 */
async function stelleEin(proxy, v, ziel, { referenz, schluessel, standortId, geaendert }) {
  let verloren = false;
  const schreibe = async (...args) => {
    const weg = await fuehreAus(proxy, ...args);
    geaendert.add(v.variantId);
    return weg;
  };
  if (ziel.menge !== null && ziel.menge !== undefined && v.menge !== ziel.menge) {
    verloren = await schreibe(BESTAND_MUTATION, {
      schluessel,
      input: { name: 'available', reason: 'correction', referenceDocumentUri: referenz, quantities: [{ inventoryItemId: v.inventoryItemId, locationId: standortId, quantity: ziel.menge, changeFromQuantity: v.menge ?? 0 }] },
    }, 'inventorySetQuantities') || verloren;
  }
  if (ziel.policy && v.policy !== ziel.policy) {
    verloren = await schreibe(RICHTLINIE_MUTATION, { productId: v.productId, variants: [{ id: v.variantId, inventoryPolicy: ziel.policy }] }, 'productVariantsBulkUpdate') || verloren;
  }
  if (typeof ziel.tracked === 'boolean' && v.tracked !== ziel.tracked) {
    verloren = await schreibe(VERFOLGUNG_MUTATION, { id: v.inventoryItemId, input: { tracked: ziel.tracked } }, 'inventoryItemUpdate') || verloren;
  }
  return verloren;
}

/**
 * Sperrt alle Mustervarianten einer SKU im Shop. Erst werden alle geprueft, dann geschrieben: eine
 * Vorbedingung, die eine Variante verletzt, sperrt keine. Wirft MustersperreFehler (grund:
 * keine-mustervariante, kein-standort, mehrdeutig, recht-fehlt, abgelehnt, bestand, unklar, gegenprobe);
 * `extra.varianten` nennt dann je Variante Vorstand und ob sie schon angefasst sein kann.
 * @returns {Promise<{status: 'gesperrt'|'bereits', variantId, productId, vorher, nachher, verfuegbar, antwortVerloren,
 *   varianten: {variantId, productId, handle, vorher, nachher, verfuegbar, bereits?, aenderungMoeglich}[]}>}
 *   variantId/productId/vorher/nachher direkt am Ergebnis nur bei genau einer Variante, sonst null.
 */
export async function sperreImShop(proxy, { sku, referenz = null, standortId = STANDORT_ID, schluessel = randomUUID() } = {}) {
  let vs;
  try { vs = await leseVarianten(proxy, sku, { standortId }); } catch (e) {
    e.extra = { ...e.extra, aenderungMoeglich: false };
    throw e;
  }
  if (!vs.length) {
    throw new MustersperreFehler(404, `Im Shop gibt es keine Mustervariante M-… zu dieser Farbe (${norm(sku)}) – das Muster läuft vermutlich über „Kostenloses Muster“ und lässt sich nicht je Farbe sperren.`, { grund: 'keine-mustervariante', aenderungMoeglich: false });
  }
  const basis = einzeln(vs);
  const vorher = vs.length === 1 ? kurz(vs[0]) : null;
  const geaendert = new Set();
  // Je Variante fuer die Ablage; `n` ist der gegengepruefte Stand (fehlt er, gibt es kein nachher).
  const liste = (n = null) => vs.map(v => {
    const x = n?.find(y => y.variantId === v.variantId);
    return {
      variantId: v.variantId, productId: v.productId, handle: v.handle, vorher: kurz(v),
      ...(x ? { nachher: kurz(x), verfuegbar: x.verfuegbar } : {}),
      ...(istGesperrt(v) ? { bereits: true } : {}), aenderungMoeglich: geaendert.has(v.variantId),
    };
  });
  if (vs.some(v => istGesperrt(v) && v.verfuegbar)) {
    throw new MustersperreFehler(502, 'Gegenprobe: Trotz Bestand 0 am Standort ist das Muster weiter bestellbar – bitte weitere Standorte und die Verfügbarkeit in Shopify prüfen.', { grund: 'gegenprobe', ...basis, vorher, nachher: vorher, varianten: liste(vs), aenderungMoeglich: false });
  }
  const offen = vs.filter(v => !istGesperrt(v));
  if (!offen.length) return { status: 'bereits', ...basis, vorher, nachher: vorher, verfuegbar: false, antwortVerloren: false, varianten: liste(vs) };
  if (offen.some(v => !v.levelDa)) {
    throw new MustersperreFehler(409, `Für ${vs.length > 1 ? 'eine der Mustervarianten' : 'diese Mustervariante'} ist am Standort kein Bestand angelegt – bitte in Shopify von Hand sperren.`, { grund: 'kein-standort', ...basis, aenderungMoeglich: false });
  }
  let verloren = false;
  try {
    for (const [i, v] of offen.entries()) {
      // eslint-disable-next-line no-await-in-loop -- je Variante nacheinander, hoechstens eine Handvoll.
      verloren = await stelleEin(proxy, v, { menge: 0, policy: 'DENY', tracked: true }, { referenz: referenz || variantenReferenz(v), schluessel: schluesselFuer(schluessel, i), standortId, geaendert }) || verloren;
    }
  } catch (e) {
    e.extra = { ...e.extra, ...basis, vorher, aenderungMoeglich: geaendert.size > 0, varianten: liste() };
    throw e;
  }
  const n = await leseOderNull(proxy, sku, standortId);
  const nach = v => n?.find(x => x.variantId === v.variantId) || null;
  const nachher = vs.length === 1 ? kurz(nach(vs[0])) : null;
  if (n && vs.every(v => istGesperrt(nach(v)) && !nach(v).verfuegbar)) {
    return { status: 'gesperrt', ...basis, vorher, nachher, verfuegbar: false, antwortVerloren: verloren, varianten: liste(n) };
  }
  if (!n) {
    throw new MustersperreFehler(504, 'Ob das Muster im Shop gesperrt ist, ist unklar: die Gegenprobe war nicht lesbar. Bitte in Shopify nachsehen.', { grund: 'unklar', ...basis, vorher, aenderungMoeglich: true, varianten: liste() });
  }
  throw new MustersperreFehler(502, verloren
    ? 'Ob das Muster im Shop gesperrt ist, ist unklar: Shopify hat nicht geantwortet und zeigt es weiter als bestellbar. Bitte noch einmal versuchen.'
    : 'Gegenprobe: Shopify zeigt das Muster weiter als bestellbar – bitte in Shopify ansehen.', { grund: verloren ? 'unklar' : 'gegenprobe', ...basis, vorher, nachher, aenderungMoeglich: true, varianten: liste(n) });
}

/**
 * Ziel fuer "wieder verfuegbar": der Stand vor der Sperre. Ohne bekannten Vorstand: Bestand 1
 * (Verfolgung bleibt). War die Variante verfolgt und gesperrt verkaufbar (DENY), mindestens 1.
 */
export function freigabeZiel(vorher) {
  if (!vorher) return { tracked: true, policy: 'DENY', menge: 1 };
  const alt = Number.isFinite(vorher.menge) ? vorher.menge : 0;
  if (vorher.tracked && vorher.policy === 'DENY') return { tracked: true, policy: 'DENY', menge: Math.max(alt, 1) };
  return { tracked: Boolean(vorher.tracked), policy: vorher.policy || 'DENY', menge: alt };
}

/**
 * Gibt die Mustervarianten einer SKU wieder frei, jede auf ihren Stand vor der Sperre. `varianten` sind
 * die aus den Sperr-Ereignissen bekannten ({variantId, vorher, betroffen}, siehe stand().varianten). Nur
 * betroffene werden angefasst, gelesen per ID - auch wenn ihre SKU sich inzwischen geaendert hat; eine
 * geloeschte ist nichts mehr freizugeben. Eine Variante derselben SKU, die keine Sperre beruehrt hat, bleibt,
 * wie sie ist. Kennt die Ablage keine betroffene Variante (aelteste Ablage ohne variantId), gilt `vorher`
 * fuer die Variante der SKU, bei mehreren nur fuer die nicht bestellbaren. Wirft MustersperreFehler wie sperreImShop.
 * @returns {Promise<{status: 'frei'|'bereits', variantId, productId, nachher, verfuegbar, antwortVerloren,
 *   varianten: {variantId, productId, handle, nachher, verfuegbar}[]}>}
 */
export async function freigebenImShop(proxy, { sku, vorher = null, varianten = null, referenz = null, standortId = STANDORT_ID, schluessel = randomUUID() } = {}) {
  const bekannt = new Map((varianten || []).filter(v => v?.variantId && v.betroffen !== false).map(v => [v.variantId, v.vorher || null]));
  const lies = () => (bekannt.size ? leseVariantenNachId(proxy, [...bekannt.keys()], { standortId }) : leseVarianten(proxy, sku, { standortId }));
  const vs = await lies();
  if (!vs.length) throw new MustersperreFehler(404, `Im Shop gibt es keine Mustervariante zu ${norm(sku)} mehr – nichts freizugeben.`, { grund: 'keine-mustervariante' });
  const ziele = bekannt.size
    ? vs.map(v => ({ v, ziel: freigabeZiel(bekannt.get(v.variantId)) }))
    : (vs.length > 1 ? vs.filter(v => !v.verfuegbar) : vs).map(v => ({ v, ziel: freigabeZiel(vorher) }));
  const basis = einzeln(ziele.map(z => z.v));
  const passt = (z, ziel) => Boolean(z) && z.tracked === ziel.tracked && z.policy === ziel.policy && (z.levelDa ? z.menge === ziel.menge : !ziel.tracked);
  const fertig = (z, ziel) => passt(z, ziel) && z.verfuegbar;
  const nachIn = (n, v) => n?.find(x => x.variantId === v.variantId) || null;
  const ergebnis = (status, n, verloren) => ({
    status, ...basis, nachher: ziele.length === 1 ? kurz(nachIn(n, ziele[0].v)) : null, verfuegbar: true, antwortVerloren: verloren,
    varianten: ziele.map(({ v }) => { const x = nachIn(n, v); return { variantId: v.variantId, productId: v.productId, handle: v.handle, nachher: kurz(x), verfuegbar: Boolean(x?.verfuegbar) }; }),
  });
  if (ziele.every(({ v, ziel }) => fertig(v, ziel))) return ergebnis('bereits', vs, false);
  const geaendert = new Set();
  let verloren = false;
  for (const [i, { v, ziel }] of ziele.entries()) {
    if (fertig(v, ziel)) continue;
    // Ohne Bestandsverfolgung zaehlt die Menge nicht - dann nur zuruecksetzen, wenn sie am Standort gefuehrt wird.
    // eslint-disable-next-line no-await-in-loop -- je Variante nacheinander, hoechstens eine Handvoll.
    verloren = await stelleEin(proxy, v, { ...ziel, menge: v.levelDa ? ziel.menge : null }, { referenz: referenz || variantenReferenz(v), schluessel: schluesselFuer(schluessel, i), standortId, geaendert }) || verloren;
  }
  let n = null;
  try { n = await lies(); } catch { /* Gegenprobe nicht lesbar - unten "unklar" */ }
  if (n && ziele.every(({ v, ziel }) => fertig(nachIn(n, v), ziel))) return ergebnis('frei', n, verloren);
  throw new MustersperreFehler(n ? 502 : 504, n ? 'Gegenprobe: Der Stand vor der Sperre ist noch nicht vollständig wiederhergestellt oder das Muster ist weiter nicht bestellbar – bitte erneut versuchen oder in Shopify ansehen.' : 'Ob das Muster wieder freigegeben ist, ist unklar: die Gegenprobe war nicht lesbar.', { grund: n ? 'gegenprobe' : 'unklar', ...basis });
}
