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
 * "Wieder verfuegbar" stellt den Stand vor der Sperre wieder her (der steht im ersten
 * Sperr-Ereignis): war die Variante vorher ohne Bestandsverfolgung, wird sie es wieder - sonst
 * waere sie mit Bestand 1 nach der naechsten Musterbestellung von selbst wieder gesperrt. War sie
 * verfolgt, kommt die alte Menge zurueck, mindestens 1.
 *
 * Feste Reihenfolge beim Schreiben (wie sonderposten.mjs):
 *   1. Rechte pruefen (currentAppInstallation.accessScopes): ohne write_inventory und
 *      write_products wird nichts geschrieben - die Sperre steht dann als "im Shop noch zu sperren".
 *   2. Variante per SKU frisch lesen - nie dem Browser glauben.
 *   3. Bestand -> 0 (Compare-and-swap, @idempotent), Richtlinie -> DENY, Verfolgung -> an.
 *      In dieser Reihenfolge: erst die Verfolgung macht die Sperre wirksam, vorher aendert nichts
 *      die Bestellbarkeit.
 *   4. Gegenprobe: erneut lesen, availableForSale muss false sein. userErrors: [] ist kein Beleg.
 *      Kommt auf eine Mutation keine Antwort, entscheidet ebenfalls das erneute Lesen.
 *
 * Ablage $TP_PRIVAT_DIR/mustersperre.json - nur anhaengen, nie ueberschreiben. Je Ereignis: SKU,
 * Farbe, Produkt, orderId, wer, wann, Grund ("nicht verfuegbar" | "wieder verfuegbar") und ob der
 * Shopify-Stand geschrieben wurde (samt Fehler). Der Stand je SKU ergibt sich aus der Folge.
 * Protokoll und Audit schreibt der Aufrufer (scripts/dashboard-api.mjs).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
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
    },
  };
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
 *   imShop: boolean, shopPruefen: boolean, fehler: string|null, fehlerGrund: string|null, variantId, productId, vorher, freigabeFehler}>}
 *   Nur aktive Sperren; "wieder verfuegbar" (erfolgreich oder sicher ohne moegliche Shop-Aenderung) nimmt sie heraus.
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
      s = { sku: e.sku, farbe: null, produkt: null, handle: null, seit: e.am, von: e.von, auftraege: [], imShop: false, shopPruefen: false, fehler: null, fehlerGrund: null, variantId: null, productId: null, vorher: null, freigabeFehler: null };
      aktiv.set(e.sku, s);
    }
    // Alte Ereignisse koennen bereits teilweise geschrieben sein, ohne eine bestaetigte Sperre.
    // Ein bekannter Vorstand bleibt deshalb auch nach spaeter fehlendem Zugang pruefpflichtig.
    const altUnklar = typeof sh.aenderungMoeglich !== 'boolean' && (Boolean(sh.vorher)
      || !['kein-zugang', 'nicht-erreichbar', 'recht-fehlt', 'keine-mustervariante', 'mehrdeutig', 'kein-standort'].includes(sh.fehlerGrund));
    s.shopPruefen ||= sh.geschrieben === true || sh.aenderungMoeglich === true || altUnklar;
    s.farbe = e.farbe || s.farbe;
    s.produkt = e.produkt || s.produkt;
    s.handle = e.handle || s.handle;
    if (e.orderId && !s.auftraege.some(a => a.orderId === e.orderId)) s.auftraege.push({ orderId: e.orderId, orderName: e.orderName || null });
    s.variantId = sh.variantId || s.variantId;
    s.productId = sh.productId || s.productId;
    // Der Stand VOR der ersten Sperre zaehlt fuer "wieder verfuegbar" - spaetere Ereignisse lesen schon den gesperrten Stand.
    if (!s.vorher && sh.vorher && !sh.bereits) s.vorher = sh.vorher;
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
  productVariants(first: 10, query: $q) {
    nodes {
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

/**
 * Mustervariante per SKU frisch lesen. Nur exakte Treffer; bei mehreren gewinnt die aus einem
 * Musterprodukt (muster-*). null = keine solche Variante im Shop.
 */
export async function leseVariante(proxy, sku, { standortId = STANDORT_ID } = {}) {
  const s = norm(sku);
  const d = await proxy.execute(VARIANTE_QUERY, { q: `sku:"${s.replace(/"/g, '')}"`, locationId: standortId });
  const treffer = (d?.productVariants?.nodes || []).filter(v => norm(v?.sku) === s);
  const muster = treffer.filter(v => String(v.product?.handle || '').startsWith('muster-'));
  const wahl = muster.length ? muster : treffer;
  if (wahl.length > 1) throw new MustersperreFehler(409, `Die Artikelnummer ${s} gibt es im Shop mehrfach – bitte in Shopify von Hand sperren.`, { grund: 'mehrdeutig' });
  return wahl.length ? zustand(wahl[0]) : null;
}

const istGesperrt = z => Boolean(z && z.tracked && z.policy === 'DENY' && (z.menge ?? 0) <= 0);
const kurz = z => (z ? { tracked: z.tracked, policy: z.policy, menge: z.menge } : null);

async function leseOderNull(proxy, sku, standortId) {
  try { return await leseVariante(proxy, sku, { standortId }); } catch { return null; }
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
      throw new MustersperreFehler(409, 'Der Bestand wurde gerade gleichzeitig geändert – nichts gesperrt. Bitte noch einmal versuchen.', { grund: 'bestand' });
    }
    throw new MustersperreFehler(502, `Shopify hat die Änderung abgelehnt: ${fehler.map(e => e.message).join('; ')}`, { grund: 'abgelehnt' });
  }
  return false;
}

/**
 * Stellt die Variante auf `ziel` ({tracked, policy, menge}) - in der Reihenfolge, in der jeder
 * Zwischenstand harmlos ist: beim Sperren erst Bestand und Richtlinie, zuletzt die Verfolgung;
 * beim Freigeben genauso (die Verfolgung aus macht sie sofort wieder bestellbar).
 */
async function stelleEin(proxy, v, ziel, { referenz, schluessel, standortId }) {
  let verloren = false;
  let aenderungMoeglich = false;
  const schreibe = async (...args) => {
    try {
      const weg = await fuehreAus(proxy, ...args);
      aenderungMoeglich = true;
      return weg;
    } catch (e) {
      e.extra = { ...e.extra, aenderungMoeglich };
      throw e;
    }
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
 * Sperrt die Mustervariante einer SKU im Shop. Wirft MustersperreFehler (grund: keine-mustervariante,
 * kein-standort, mehrdeutig, recht-fehlt, abgelehnt, bestand, unklar, gegenprobe).
 * @returns {Promise<{status: 'gesperrt'|'bereits', variantId, productId, vorher, nachher, verfuegbar, antwortVerloren}>}
 */
export async function sperreImShop(proxy, { sku, referenz = null, standortId = STANDORT_ID, schluessel = randomUUID() } = {}) {
  let v;
  try { v = await leseVariante(proxy, sku, { standortId }); } catch (e) {
    e.extra = { ...e.extra, aenderungMoeglich: false };
    throw e;
  }
  if (!v) {
    throw new MustersperreFehler(404, `Im Shop gibt es keine Mustervariante M-… zu dieser Farbe (${norm(sku)}) – das Muster läuft vermutlich über „Kostenloses Muster“ und lässt sich nicht je Farbe sperren.`, { grund: 'keine-mustervariante', aenderungMoeglich: false });
  }
  const basis = { variantId: v.variantId, productId: v.productId };
  if (istGesperrt(v)) {
    if (!v.verfuegbar) return { status: 'bereits', ...basis, vorher: kurz(v), nachher: kurz(v), verfuegbar: false, antwortVerloren: false };
    throw new MustersperreFehler(502, 'Gegenprobe: Trotz Bestand 0 am Standort ist das Muster weiter bestellbar – bitte weitere Standorte und die Verfügbarkeit in Shopify prüfen.', { grund: 'gegenprobe', ...basis, vorher: kurz(v), nachher: kurz(v), aenderungMoeglich: false });
  }
  if (!v.levelDa) {
    throw new MustersperreFehler(409, 'Für diese Mustervariante ist am Standort kein Bestand angelegt – bitte in Shopify von Hand sperren.', { grund: 'kein-standort', ...basis, aenderungMoeglich: false });
  }
  let verloren;
  try {
    verloren = await stelleEin(proxy, v, { menge: 0, policy: 'DENY', tracked: true }, { referenz: referenz || `gid://shopify/ProductVariant/${String(v.variantId).split('/').pop()}`, schluessel, standortId });
  } catch (e) {
    if (e instanceof MustersperreFehler) e.extra = { ...e.extra, ...basis, vorher: kurz(v) };
    throw e;
  }
  const n = await leseOderNull(proxy, sku, standortId);
  if (istGesperrt(n) && !n.verfuegbar) return { status: 'gesperrt', ...basis, vorher: kurz(v), nachher: kurz(n), verfuegbar: false, antwortVerloren: verloren };
  if (!n) {
    throw new MustersperreFehler(504, 'Ob das Muster im Shop gesperrt ist, ist unklar: die Gegenprobe war nicht lesbar. Bitte in Shopify nachsehen.', { grund: 'unklar', ...basis, vorher: kurz(v), aenderungMoeglich: true });
  }
  throw new MustersperreFehler(502, verloren
    ? 'Ob das Muster im Shop gesperrt ist, ist unklar: Shopify hat nicht geantwortet und zeigt es weiter als bestellbar. Bitte noch einmal versuchen.'
    : 'Gegenprobe: Shopify zeigt das Muster weiter als bestellbar – bitte in Shopify ansehen.', { grund: verloren ? 'unklar' : 'gegenprobe', ...basis, vorher: kurz(v), nachher: kurz(n), aenderungMoeglich: true });
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
 * Gibt die Mustervariante wieder frei (Stand vor der Sperre). Wirft MustersperreFehler wie sperreImShop.
 * @returns {Promise<{status: 'frei'|'bereits', variantId, productId, nachher, verfuegbar, antwortVerloren}>}
 */
export async function freigebenImShop(proxy, { sku, vorher = null, referenz = null, standortId = STANDORT_ID, schluessel = randomUUID() } = {}) {
  const v = await leseVariante(proxy, sku, { standortId });
  if (!v) throw new MustersperreFehler(404, `Im Shop gibt es keine Mustervariante zu ${norm(sku)} mehr – nichts freizugeben.`, { grund: 'keine-mustervariante' });
  const basis = { variantId: v.variantId, productId: v.productId };
  const ziel = freigabeZiel(vorher);
  const passt = z => Boolean(z) && z.tracked === ziel.tracked && z.policy === ziel.policy && (z.levelDa ? z.menge === ziel.menge : !ziel.tracked);
  if (passt(v) && v.verfuegbar) return { status: 'bereits', ...basis, nachher: kurz(v), verfuegbar: v.verfuegbar, antwortVerloren: false };
  // Ohne Bestandsverfolgung zaehlt die Menge nicht - dann nur zuruecksetzen, wenn sie am Standort gefuehrt wird.
  const verloren = await stelleEin(proxy, v, { ...ziel, menge: v.levelDa ? ziel.menge : null }, { referenz: referenz || `gid://shopify/ProductVariant/${String(v.variantId).split('/').pop()}`, schluessel, standortId });
  const n = await leseOderNull(proxy, sku, standortId);
  if (passt(n) && n.verfuegbar) return { status: 'frei', ...basis, nachher: kurz(n), verfuegbar: n.verfuegbar, antwortVerloren: verloren };
  throw new MustersperreFehler(n ? 502 : 504, n ? 'Gegenprobe: Der Stand vor der Sperre ist noch nicht vollständig wiederhergestellt oder das Muster ist weiter nicht bestellbar – bitte erneut versuchen oder in Shopify ansehen.' : 'Ob das Muster wieder freigegeben ist, ist unklar: die Gegenprobe war nicht lesbar.', { grund: n ? 'gegenprobe' : 'unklar', ...basis });
}
