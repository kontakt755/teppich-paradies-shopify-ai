/**
 * Sonderposten (Reststuecke, Einzelstuecke) fuer das Control Center:
 * Liste lesen und ein Stueck als "im Laden verkauft" buchen.
 *
 * Ein Sonderposten ist ein Shopify-Produkt mit productType "Sonderposten",
 * genau einer Variante (SKU "SP-xxxx") und gefuehrtem Bestand 1 am einzigen
 * Standort. Verkauft = Bestand 0; die Kollektion im Shop nimmt das Stueck
 * dann selbst heraus. Konzept: docs/weiterentwicklung/sonderposten.md,
 * Abschnitt 6 (Weg B).
 *
 * Anders als die uebrigen Quellen des Control Centers liest diese Liste live
 * aus Shopify statt aus einem Export unter $TP_PRIVAT_DIR: wer im Laden
 * "verkauft" klickt, muss den Bestand von jetzt sehen, nicht den von heute
 * frueh. Der Zugang ist derselbe (operations/sync/zugang.mjs, erzeugeProxy).
 *
 * Schreiben (verkaufeImLaden) haelt sich an eine feste Reihenfolge:
 *   1. Produkt serverseitig neu lesen - nie dem Browser glauben.
 *   2. Nur bei Bestand genau 1 weiter, sonst Abbruch (409), nichts geschrieben.
 *   3. Bestand per inventorySetQuantities auf 0, mit changeFromQuantity: 1
 *      (Compare-and-swap: zwei gleichzeitige Klicks buchen nicht doppelt) und
 *      @idempotent (ab API 2026-04 Pflicht fuer Bestandsmutationen).
 *   4. Erst wenn der Bestand gebucht ist: verkauft_am/_von/_kanal setzen.
 *      Scheitert schon Schritt 3 (z. B. fehlt write_inventory), bleiben die
 *      Felder unberuehrt - sonst stuende "verkauft" an einem Stueck, das
 *      online noch kaufbar ist.
 *   5. Gegenprobe: Produkt erneut lesen. userErrors: [] allein ist kein Beleg.
 * Das Protokoll schreibt der Aufrufer (scripts/dashboard-api.mjs), weil nur er
 * den angemeldeten Benutzer kennt.
 */

import { randomUUID } from 'node:crypto';
import { STORE } from '../sync/zugang.mjs';

/** Der einzige Standort (Saarlandstrasse 73). */
export const STANDORT_ID = 'gid://shopify/Location/98426814798';
export const PRODUKTART = 'Sonderposten';
export const NAMENSRAUM = 'sonderposten';
const MAX_SEITEN = 10; // 10 x 100 Stueck - weit ueber dem, was im Laden liegt

/** Fehler mit HTTP-Status fuer die API; `grund` laesst die Oberflaeche die Faelle unterscheiden. */
export class SonderpostenFehler extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

/** Die Meldung, wenn dem Dashboard-Zugang das Schreibrecht fuer den Bestand fehlt. */
export const RECHT_FEHLT = 'Bestand kann nicht geändert werden: dem Control Center fehlt das Shopify-Recht write_inventory '
  + '(Inhaber schaltet es im Dev Dashboard frei). Bis dahin: Bestand in der Shopify-App auf 0 setzen.';

const VARIANTEN_FELDER = `variants(first: 2) { nodes { id sku price inventoryItem { id tracked
  inventoryLevel(locationId: $locationId) { quantities(names: ["available", "on_hand"]) { name quantity } } } } }`;

export const LISTE_QUERY = `
query SonderpostenListe($first: Int!, $after: String, $query: String!, $locationId: ID!) {
  products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title status handle productType
      featuredMedia { preview { image { url(transform: {maxWidth: 240, maxHeight: 240}) altText } } }
      metafields(namespace: "${NAMENSRAUM}", first: 30) { nodes { key value } }
      ${VARIANTEN_FELDER}
    }
  }
}`;

export const EINZELN_QUERY = `
query SonderpostenEinzeln($id: ID!, $locationId: ID!) {
  product(id: $id) {
    id title status handle productType
    metafields(namespace: "${NAMENSRAUM}", first: 30) { nodes { key value } }
    ${VARIANTEN_FELDER}
  }
}`;

export const BESTAND_MUTATION = `
mutation SonderpostenLadenverkauf($input: InventorySetQuantitiesInput!, $schluessel: String!) {
  inventorySetQuantities(input: $input) @idempotent(key: $schluessel) {
    inventoryAdjustmentGroup { id reason referenceDocumentUri changes { name delta quantityAfterChange } }
    userErrors { field message code }
  }
}`;

export const FELDER_MUTATION = `
mutation SonderpostenVerkauftFelder($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { key value }
    userErrors { field message code }
  }
}`;

/** Suche: nur Sonderposten, archivierte nie (die sind erledigt). */
export const SUCHE = `product_type:${PRODUKTART} AND (status:active OR status:draft)`;

const STATUS_TEXT = { ACTIVE: 'im Shop', DRAFT: 'Entwurf', ARCHIVED: 'archiviert', UNLISTED: 'nicht gelistet' };

function zahl(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function menge(level, name) {
  const q = (level?.quantities ?? []).find(x => x.name === name);
  return q ? zahl(q.quantity) : null;
}

function felder(produkt) {
  const f = {};
  for (const m of produkt?.metafields?.nodes ?? []) f[m.key] = m.value;
  return f;
}

/** Vorlagen sind Kopiervorlagen fuer neue Stuecke, keine Ware. */
export function istVorlage(produkt) {
  const sku = produkt?.variants?.nodes?.[0]?.sku || '';
  return sku.toUpperCase() === 'SP-0000' || /^\s*VORLAGE/i.test(produkt?.title || '');
}

/** Numerische ID aus einer GID ("gid://shopify/Product/123" -> "123"). */
export function numId(gid) {
  return String(gid || '').split('/').pop();
}

export function adminLink(gid) {
  return `https://admin.shopify.com/store/${STORE}/products/${numId(gid)}`;
}

/** Ein Produkt aus der Admin API -> Eintrag fuer die Oberflaeche. Felder einzeln, nichts durchgereicht. */
export function eintragAus(produkt) {
  const variante = produkt.variants?.nodes?.[0] || null;
  const item = variante?.inventoryItem || null;
  const f = felder(produkt);
  const breite = zahl(f.breite_m);
  const laenge = zahl(f.laenge_m);
  const flaecheFeld = zahl(f.flaeche_m2);
  // Fehlt die Flaeche, aber beide Masse stehen da, ist sie eine Rechnung, keine Annahme.
  const flaeche = flaecheFeld ?? (breite !== null && laenge !== null ? Math.round(breite * laenge * 100) / 100 : null);
  const bestand = item?.tracked ? menge(item.inventoryLevel, 'available') : null;
  const bild = produkt.featuredMedia?.preview?.image || null;
  return {
    id: produkt.id,
    titel: produkt.title || '',
    status: produkt.status || null,
    statusText: STATUS_TEXT[produkt.status] || String(produkt.status || '').toLowerCase(),
    handle: produkt.handle || null,
    sku: variante?.sku || null,
    preis: zahl(variante?.price),
    variantenAnzahl: produkt.variants?.nodes?.length ?? 0,
    inventoryItemId: item?.id || null,
    getrackt: Boolean(item?.tracked),
    // null = Bestand wird nicht gefuehrt oder ist am Standort nicht angelegt.
    bestand,
    breiteM: breite,
    laengeM: laenge,
    flaecheM2: flaeche,
    art: f.art || null,
    zustand: f.zustand || null,
    farbe: f.farbe || null,
    lagerort: f.lagerort || null,
    versand: f.versand || null,
    bild: bild?.url || null,
    bildAlt: bild?.altText || null,
    verkauftAm: f.verkauft_am || null,
    verkauftVon: f.verkauft_von || null,
    verkauftKanal: f.verkauft_kanal || null,
    adminUrl: adminLink(produkt.id),
    // Der Knopf "Im Laden verkauft" erscheint nur hier - dieselbe Regel wie im Server.
    verkaufbar: Boolean(item?.tracked) && bestand === 1 && produkt.status !== 'ARCHIVED',
  };
}

/** Alle Sonderposten (ohne Vorlagen und archivierte), neueste Aenderung zuerst. */
export async function leseListe(proxy, { standortId = STANDORT_ID, jetzt = new Date() } = {}) {
  const eintraege = [];
  let after = null;
  for (let seite = 0; seite < MAX_SEITEN; seite++) {
    // eslint-disable-next-line no-await-in-loop -- Seiten nacheinander, der Cursor kommt aus der Antwort.
    const data = await proxy.execute(LISTE_QUERY, { first: 100, after, query: SUCHE, locationId: standortId });
    if (data === null) return null; // kein Zugang (Sammelmodus)
    const conn = data?.products;
    if (!conn) throw new Error('Sonderposten: Antwort ohne products');
    for (const p of conn.nodes ?? []) {
      if (p.productType !== PRODUKTART || p.status === 'ARCHIVED' || istVorlage(p)) continue;
      eintraege.push(eintragAus(p));
    }
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return {
    abgerufenAm: jetzt.toISOString(),
    anzahl: eintraege.length,
    verfuegbarAnzahl: eintraege.filter(e => e.verkaufbar).length,
    eintraege,
  };
}

/** Ein Produkt neu lesen; liefert den Eintrag oder wirft 404. */
export async function leseEinzeln(proxy, id, { standortId = STANDORT_ID } = {}) {
  const data = await proxy.execute(EINZELN_QUERY, { id, locationId: standortId });
  if (data === null) throw new SonderpostenFehler(503, 'Kein Zugang zu Shopify eingerichtet.', { grund: 'kein-zugang' });
  const p = data?.product;
  if (!p) throw new SonderpostenFehler(404, 'Dieses Stück gibt es in Shopify nicht (mehr). Bitte die Liste neu laden.');
  return { produkt: p, eintrag: eintragAus(p) };
}

/** Shopify-Datumsfeld date_time: ISO ohne Millisekunden. */
export function alsDateTime(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Fehlt dem Zugang ein Recht? Shopify meldet das als GraphQL-Fehler "Access denied ..." (Code ACCESS_DENIED). */
export function istZugriffVerweigert(err) {
  return /access denied|ACCESS_DENIED|HTTP 403|write_inventory/i.test(String(err?.message || err));
}

/**
 * Bucht ein Stueck als im Laden verkauft. Wirft SonderpostenFehler (Status
 * und Klartext fuer die Oberflaeche); alles andere ist ein unerwarteter Fehler.
 *
 * @param {object} proxy        GraphQLProxy (oder Attrappe mit execute())
 * @param {object} p
 * @param {string} p.produktId  gid://shopify/Product/...
 * @param {string} [p.inventoryItemId]  aus der Liste - nur zum Abgleich, gebucht wird mit dem frisch gelesenen
 * @param {string} p.verkauftVon  Anzeigename des angemeldeten Benutzers
 * @param {Date}   p.jetzt
 */
export async function verkaufeImLaden(proxy, { produktId, inventoryItemId = null, verkauftVon, jetzt = new Date(), standortId = STANDORT_ID, schluessel = randomUUID() } = {}) {
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(String(produktId || ''))) {
    throw new SonderpostenFehler(400, 'Ungültige Produkt-ID.');
  }
  // 1. Frisch lesen.
  const { produkt, eintrag: vorher } = await leseEinzeln(proxy, produktId, { standortId });
  if (produkt.productType !== PRODUKTART) throw new SonderpostenFehler(400, 'Das ist kein Sonderposten – hier wird nichts gebucht.');
  if (istVorlage(produkt)) throw new SonderpostenFehler(400, 'Die Vorlage ist kein verkaufbares Stück.');
  if (vorher.variantenAnzahl !== 1) throw new SonderpostenFehler(409, 'Dieses Stück hat mehr als eine Variante – bitte in Shopify prüfen, hier wird nichts gebucht.');
  if (!vorher.getrackt || !vorher.inventoryItemId) {
    throw new SonderpostenFehler(409, 'Für dieses Stück wird in Shopify kein Bestand geführt – bitte dort „Bestand verfolgen“ einschalten.');
  }
  if (inventoryItemId && inventoryItemId !== vorher.inventoryItemId) {
    throw new SonderpostenFehler(409, 'Die Angaben haben sich in Shopify geändert. Bitte die Liste neu laden.');
  }
  // 2. Nur bei Bestand genau 1.
  if (vorher.bestand !== 1) {
    const text = vorher.bestand === 0
      ? 'Dieses Stück ist bereits verkauft (Bestand 0) – nichts gebucht.'
      : `Bestand ist nicht 1 (aktuell ${vorher.bestand ?? 'nicht angelegt'}) – nichts gebucht. Bitte in Shopify prüfen.`;
    throw new SonderpostenFehler(409, text, { grund: 'bestand', bestand: vorher.bestand });
  }

  // 3. Bestand auf 0 - mit Compare-and-swap gegen Doppelbuchung.
  const zeit = alsDateTime(jetzt);
  const referenz = `tp://laden-verkauf/${encodeURIComponent(vorher.sku || numId(produktId))}/${zeit}`;
  let bestandAntwort;
  try {
    bestandAntwort = await proxy.execute(BESTAND_MUTATION, {
      schluessel,
      input: {
        name: 'available',
        reason: 'correction',
        referenceDocumentUri: referenz,
        quantities: [{ inventoryItemId: vorher.inventoryItemId, locationId: standortId, quantity: 0, changeFromQuantity: 1 }],
      },
    });
  } catch (err) {
    if (istZugriffVerweigert(err)) throw new SonderpostenFehler(403, RECHT_FEHLT, { grund: 'recht-fehlt' });
    throw err;
  }
  const bestandFehler = bestandAntwort?.inventorySetQuantities?.userErrors ?? [];
  if (bestandFehler.length) {
    if (bestandFehler.some(e => /STALE|COMPARE/i.test(e.code || ''))) {
      throw new SonderpostenFehler(409, 'Jemand hat den Bestand gerade gleichzeitig geändert – nichts gebucht. Bitte die Liste neu laden.', { grund: 'bestand' });
    }
    throw new SonderpostenFehler(502, `Shopify hat die Bestandsänderung abgelehnt: ${bestandFehler.map(e => e.message).join('; ')}`);
  }

  // 4. Verkaufsangaben. Der Bestand ist ab hier gebucht - ein Fehler bei den
  // Feldern macht ihn nicht rueckgaengig, er wird als Hinweis zurueckgegeben.
  const metafields = [
    { ownerId: produktId, namespace: NAMENSRAUM, key: 'verkauft_am', type: 'date_time', value: zeit },
    { ownerId: produktId, namespace: NAMENSRAUM, key: 'verkauft_von', type: 'single_line_text_field', value: String(verkauftVon || 'unbekannt').slice(0, 100) },
    { ownerId: produktId, namespace: NAMENSRAUM, key: 'verkauft_kanal', type: 'single_line_text_field', value: 'Laden' },
  ];
  let felderFehler = null;
  try {
    const antwort = await proxy.execute(FELDER_MUTATION, { metafields });
    const ue = antwort?.metafieldsSet?.userErrors ?? [];
    if (ue.length) felderFehler = ue.map(e => e.message).join('; ');
  } catch (err) {
    felderFehler = String(err?.message || err).slice(0, 300);
  }

  // 5. Gegenprobe.
  const { eintrag: nachher } = await leseEinzeln(proxy, produktId, { standortId });
  const felderGesetzt = nachher.verkauftAm !== null && nachher.verkauftKanal === 'Laden' && nachher.verkauftVon !== null;
  return {
    ok: nachher.bestand === 0,
    sku: vorher.sku,
    titel: vorher.titel,
    referenz,
    bestandVorher: vorher.bestand,
    bestandNachher: nachher.bestand,
    felderGesetzt,
    felderFehler: felderFehler || (felderGesetzt ? null : 'Verkaufsangaben sind nach dem Speichern nicht in Shopify zu sehen.'),
    eintrag: nachher,
  };
}
