/**
 * Bestellungen aus der Admin API lesen und Auftragszustand zurueckschreiben.
 *
 * Einziger Client ist workflow/graphql-proxy.mjs (D6). Ohne
 * SHOPIFY_ADMIN_TOKEN laeuft der Proxy im Sammelmodus: execute() liefert
 * null, die Query landet nur im requestLog - dann gibt es hier keine
 * Bestellungen, aber auch keinen Fehler.
 */

import { GraphQLProxy } from '../../workflow/graphql-proxy.mjs';

export { GraphQLProxy };

export const SEITENGROESSE = 50;

// Erste Seite und Nachladeabfrage muessen dieselben Positionsdaten liefern.
const LINE_ITEM_FELDER = `
          id sku title variantTitle quantity currentQuantity unfulfilledQuantity
          originalUnitPriceSet { shopMoney { amount currencyCode } }
          # Gesamtwert nach allen Rabatten, ohne entfernte/erstattete Mengen und ohne Steuern.
          # discountedTotalSet laesst Bestellrabatte aus und waere kein Kaufnachweis.
          priceAfterAllDiscountsBeforeTaxesSet { shopMoney { amount currencyCode } }
          customAttributes { key value }
          # Bundle-Komponente (z. B. Rollenware unter "Zuschnitt von der Rolle"):
          # die Zeile ist ein Bestandsabgang, kein eigener Zuschnitt.
          lineItemGroup { id title quantity customAttributes { key value } }
          image { url altText }
          variant {
            id sku title
            image { url altText }
            metafields(namespace: "einkauf", first: 20) { nodes { namespace key type value } }
            lieferant: metafields(namespace: "lieferant", first: 10) { nodes { namespace key type value } }
            custom: metafields(namespace: "custom", first: 20) { nodes { namespace key type value } }
            product {
              id handle title productType
              featuredMedia { preview { image { url altText } } }
              metafields(namespace: "custom", first: 20) { nodes { namespace key type value } }
              grosshandel: metafields(namespace: "grosshandel", first: 5) { nodes { namespace key type value } }
            }
          }`;

export const ORDERS_QUERY = `
query OpsOrders($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name createdAt updatedAt cancelledAt closedAt note tags test
      displayFinancialStatus displayFulfillmentStatus
      email phone
      sourceName
      customer { id displayName email phone numberOfOrders }
      totalPriceSet { shopMoney { amount currencyCode } }
      subtotalPriceSet { shopMoney { amount currencyCode } }
      totalShippingPriceSet { shopMoney { amount currencyCode } }
      totalTaxSet { shopMoney { amount currencyCode } }
      shippingLine { title code source }
      paymentGatewayNames
      customAttributes { key value }
      shippingAddress { name address1 address2 zip city country countryCodeV2 phone }
      billingAddress { name address1 address2 zip city country countryCodeV2 phone }
      fulfillments(first: 10) {
        status displayStatus createdAt updatedAt
        trackingInfo { number url company }
      }
      refunds(first: 10) {
        id createdAt note
        totalRefundedSet { shopMoney { amount currencyCode } }
      }
      metafields(namespace: "ops", first: 20) { nodes { namespace key type value } }
      lineItems(first: 50) {
        pageInfo { hasNextPage endCursor }
        nodes {
          ${LINE_ITEM_FELDER}
        }
      }
    }
  }
}`;

export const ORDER_LINE_ITEMS_QUERY = `
query OpsOrderLineItems($id: ID!, $first: Int!, $after: String) {
  order(id: $id) {
    id updatedAt
    lineItems(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { ${LINE_ITEM_FELDER} }
    }
  }
}`;

export const ORDER_STATE_QUERY = `
query OpsOrderState($id: ID!) {
  order(id: $id) {
    id tags
    metafields(namespace: "ops", first: 20) { nodes { namespace key type value } }
  }
}`;

export const METAFIELDS_SET = `
mutation OpsMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { namespace key value }
    userErrors { field message code }
  }
}`;

export const TAGS_ADD = `
mutation OpsTagsAdd($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) {
    node { id }
    userErrors { field message }
  }
}`;

/**
 * Fuehrt die Varianten-Metafeld-Aliasse (einkauf, lieferant, custom, grosshandel)
 * zu einer Liste zusammen, damit resolve.metafeldMap sie versteht.
 */
export function normalisiereLineItem(li) {
  if (!li?.variant) return li;
  const v = li.variant;
  // custom liegt auf BEIDEN Ebenen: rollenbreite und preis_pro_001_qm stehen bei
  // Flaechenware je Variante, farbcode ebenfalls. Fehlte der Namensraum hier,
  // blieb die Einkaufsmenge UNGEKLAERT, obwohl der Wert im Shop steht.
  const vNodes = [...(v.metafields?.nodes ?? []), ...(v.lieferant?.nodes ?? []), ...(v.custom?.nodes ?? [])];
  const p = v.product;
  const pNodes = p ? [...(p.metafields?.nodes ?? []), ...(p.grosshandel?.nodes ?? [])] : [];
  // Produktbild: Shopify liefert es unter featuredMedia.preview.image; die
  // Karte sucht es als featuredImage. Einmal hier umhaengen, nicht dort raten.
  const pBild = p?.featuredMedia?.preview?.image ?? null;
  return {
    ...li,
    variant: {
      id: v.id, sku: v.sku, title: v.title,
      image: v.image ?? null,
      metafields: vNodes,
      product: p ? { id: p.id, handle: p.handle, title: p.title, productType: p.productType, featuredImage: pBild, metafields: pNodes } : null,
    },
  };
}

/**
 * Wartet vor dem naechsten Seitenaufruf, wenn der zuletzt gemeldete
 * throttleStatus (extensions.cost.throttleStatus der Admin GraphQL API) wenig
 * Leaky-Bucket-Guthaben mehr uebrig laesst. Ohne Wartung wirft die naechste
 * Seite THROTTLED, und die Bestellliste bricht mittendrin ab.
 *
 * Sicherheitsabstand: 10% von maximumAvailable. Bleibt currentlyAvailable
 * darunter, wird bis knapp darueber gewartet (Zeit = fehlendes Guthaben /
 * restoreRate Punkte pro Sekunde).
 */
export async function wartenBeiThrottle(proxy, { warten = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const status = proxy.requestLog?.at(-1)?.throttleStatus;
  if (!status || !(status.restoreRate > 0)) return 0;
  const { currentlyAvailable, restoreRate, maximumAvailable = 1000 } = status;
  const puffer = maximumAvailable * 0.1;
  if (currentlyAvailable >= puffer) return 0;
  const ms = Math.ceil(((puffer - currentlyAvailable) / restoreRate) * 1000);
  await warten(ms);
  return ms;
}

/** Keine unvollstaendige API-Antwort als leere, erfolgreich geladene Seite behandeln. */
function pruefeSeite(conn, fehlerPraefix) {
  if (!conn || !Array.isArray(conn.nodes) || typeof conn.pageInfo?.hasNextPage !== 'boolean') {
    throw new Error(`${fehlerPraefix}: unvollstaendige Antwort (nodes oder pageInfo fehlen)`);
  }
  if (conn.pageInfo.hasNextPage && (typeof conn.pageInfo.endCursor !== 'string' || !conn.pageInfo.endCursor.trim())) {
    throw new Error(`${fehlerPraefix}: hasNextPage ohne endCursor`);
  }
  if (conn.nodes.some(n => !n || typeof n.id !== 'string' || !n.id.trim()) || (conn.pageInfo.hasNextPage && !conn.nodes.length)) {
    throw new Error(`${fehlerPraefix}: unvollstaendige Antwort (ungueltige oder fehlende Eintraege)`);
  }
}

function naechsterCursor(conn, gesehen, fehlerPraefix) {
  if (!conn.pageInfo.hasNextPage) return null;
  const cursor = conn.pageInfo.endCursor;
  if (gesehen.has(cursor)) throw new Error(`${fehlerPraefix}: wiederholter endCursor`);
  gesehen.add(cursor);
  return cursor;
}

/** Shopify kann dieselbe Feldliste erst mit kleinerer Seitengroesse annehmen. */
async function seitenAbfrage(proxy, abfrage, variablen) {
  let first = variablen.first;
  for (;;) {
    try {
      return { data: await proxy.execute(abfrage, { ...variablen, first }), first };
    } catch (e) {
      if (first > 1 && /exceeds the single query max cost limit/i.test(String(e?.message))) {
        first = Math.max(1, Math.floor(first / 2));
        continue;
      }
      throw e;
    }
  }
}

/** Eine grosse Bestellung ist erst vollstaendig, wenn auch ihre letzte Position da ist. */
async function vollstaendigePositionen(proxy, order, { warten, fehlerPraefix }) {
  const praefix = `${fehlerPraefix} Bestellpositionen`;
  let conn = order.lineItems;
  const positionen = [];
  const ids = new Set();
  const cursor = new Set();
  let first = 50;
  for (;;) {
    pruefeSeite(conn, praefix);
    const after = naechsterCursor(conn, cursor, praefix);
    for (const li of conn.nodes) {
      if (ids.has(li.id)) throw new Error(`${praefix}: doppelte Positionskennung`);
      ids.add(li.id);
      positionen.push(normalisiereLineItem(li));
    }
    if (!after) return { nodes: positionen };
    await wartenBeiThrottle(proxy, warten ? { warten } : undefined);
    const r = await seitenAbfrage(proxy, ORDER_LINE_ITEMS_QUERY, { id: order.id, first, after });
    first = r.first;
    const nachgeladen = r.data?.order;
    // Aenderungen waehrend des Blaetterns koennen Mengen oder Cursor verschieben.
    // Dann bleibt der vorherige Export stehen, statt zwei Bestellstaende zu mischen.
    if (!nachgeladen || nachgeladen.id !== order.id || !order.updatedAt || nachgeladen.updatedAt !== order.updatedAt) {
      throw new Error(`${praefix}: Bestellung fehlt oder wurde waehrend des Abrufs geaendert`);
    }
    conn = nachgeladen.lineItems;
  }
}

/** Gemeinsame Blaetterlogik ueber Bestellungen und alle ihre Positionen. */
async function paginiereOrders(proxy, query, { first = SEITENGROESSE, warten, fehlerPraefix }) {
  const orders = [];
  const ids = new Set();
  const cursor = new Set();
  let after = null;
  let seiten = 0;
  for (;;) {
    const r = await seitenAbfrage(proxy, ORDERS_QUERY, { first, after, query });
    first = r.first;
    if (r.data === null && seiten === 0) return { orders: [], seiten, gesammelt: true };
    seiten += 1;
    const conn = r.data?.orders;
    pruefeSeite(conn, fehlerPraefix);
    const weiter = naechsterCursor(conn, cursor, fehlerPraefix);
    for (const o of conn.nodes) {
      if (ids.has(o.id)) throw new Error(`${fehlerPraefix}: doppelte Bestellkennung`);
      ids.add(o.id);
      orders.push({ ...o, lineItems: await vollstaendigePositionen(proxy, o, { warten, fehlerPraefix }) });
    }
    if (!weiter) break;
    after = weiter;
    await wartenBeiThrottle(proxy, warten ? { warten } : undefined);
  }
  return { orders, seiten, gesammelt: false };
}

/**
 * Alle Bestellungen mit updated_at > sinceIso, paginiert (first 50, kein
 * festes Gesamtlimit - es wird geblaettert, bis hasNextPage false ist).
 *
 * @returns {Promise<{orders:Array, seiten:number, gesammelt:boolean}>}
 */
export async function fetchOrdersSince(proxy, sinceIso, { first = SEITENGROESSE, warten } = {}) {
  if (!proxy || typeof proxy.execute !== 'function') throw new Error('fetchOrdersSince: proxy fehlt');
  if (!sinceIso || Number.isNaN(new Date(sinceIso).getTime())) throw new Error('fetchOrdersSince: sinceIso ungueltig');
  const query = `updated_at:>'${new Date(sinceIso).toISOString()}'`;
  return paginiereOrders(proxy, query, { first, warten, fehlerPraefix: 'fetchOrdersSince' });
}

export const STANDARD_TAGE_FENSTER = 90;

/**
 * Baut die Abgrenzungs-Query fuer den Betrieb: alle Bestellungen, die
 * innerhalb von `tageFenster` Tagen ANGELEGT wurden (created_at, nicht
 * updated_at - eine 40 Tage alte, seither unveraenderte Bestellung soll nicht
 * aus dem Fenster fallen, nur weil sie lange nicht angefasst wurde), ODER
 * unabhaengig vom Alter noch nicht vollstaendig erfuellt sind
 * (fulfillment_status unfulfilled/partial) oder noch auf Zahlung warten. Eine vor Monaten aufgegebene,
 * nie ausgelieferte Bestellung darf im Control Center nicht verschwinden,
 * nur weil sie aelter als das Zeitfenster ist. Dasselbe gilt fuer bereits
 * versandte, aber noch nicht bezahlte Bestellungen - genau das war der Auftrag
 * des Inhabers: Vollstaendigkeit statt fester Obergrenze von 50 Bestellungen.
 */
export function baueRelevantQuery(tageFenster = STANDARD_TAGE_FENSTER, jetzt = () => Date.now()) {
  const cutoff = new Date(jetzt() - tageFenster * 24 * 60 * 60 * 1000).toISOString();
  return `(created_at:>='${cutoff}') OR (fulfillment_status:unfulfilled) OR (fulfillment_status:partial) OR (financial_status:pending) OR (financial_status:authorized) OR (financial_status:partially_paid)`;
}

/**
 * Alle fuer den Betrieb relevanten Bestellungen: die letzten `tageFenster`
 * Tage plus alle offenen/teil-erfuellten und noch nicht bezahlten unabhaengig vom Alter, vollstaendig
 * paginiert (kein festes Limit 50). Ersetzt die bisherige "letzte 50
 * Bestellungen, dann nach updatedAt kuerzen"-Regel aus aktualisieren.mjs, die
 * eine um 15 Uhr eingegangene Bestellung bei genug Nebenaktivitaet erst am
 * naechsten automatischen Lauf zeigte.
 *
 * @returns {Promise<{orders:Array, seiten:number, gesammelt:boolean, query:string}>}
 */
export async function fetchOrdersRelevant(proxy, { tageFenster = STANDARD_TAGE_FENSTER, first = SEITENGROESSE, warten, jetzt } = {}) {
  if (!proxy || typeof proxy.execute !== 'function') throw new Error('fetchOrdersRelevant: proxy fehlt');
  if (!(tageFenster > 0)) throw new Error('fetchOrdersRelevant: tageFenster muss > 0 sein');
  const query = baueRelevantQuery(tageFenster, jetzt);
  const r = await paginiereOrders(proxy, query, { first, warten, fehlerPraefix: 'fetchOrdersRelevant' });
  return { ...r, query };
}

function alsMetafeld(orderId, key, wert) {
  const json = typeof wert === 'object' && wert !== null;
  return {
    ownerId: orderId,
    namespace: 'ops',
    key,
    type: json ? 'json' : 'single_line_text_field',
    value: json ? JSON.stringify(wert) : String(wert),
  };
}

function normJson(text) {
  try { return JSON.stringify(JSON.parse(text)); } catch { return text; }
}

/**
 * Schreibt ops.* Metafelder und Tags, liest danach gegen.
 * `userErrors: []` ist kein Beleg - Beleg ist der zurueckgelesene Wert.
 *
 * @param {object} ops  {status, freigabe_von, beratung, gruppen, problem, ...}, optional `tags:[...]`
 * @returns {Promise<{ok:boolean, gesammelt:boolean, abweichungen:string[], userErrors:Array}>}
 */
export async function writeOrderState(proxy, orderId, ops = {}) {
  if (!proxy || typeof proxy.execute !== 'function') throw new Error('writeOrderState: proxy fehlt');
  if (!/^gid:\/\/shopify\/Order\/\d+$/.test(String(orderId))) throw new Error(`writeOrderState: orderId ungueltig: ${orderId}`);
  const { tags = [], ...felder } = ops;
  const metafields = Object.entries(felder)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => alsMetafeld(orderId, k, v));
  if (!metafields.length && !tags.length) throw new Error('writeOrderState: nichts zu schreiben');

  const userErrors = [];
  if (metafields.length) {
    const r = await proxy.execute(METAFIELDS_SET, { metafields });
    if (r === null) return { ok: false, gesammelt: true, abweichungen: [], userErrors };
    userErrors.push(...(r.metafieldsSet?.userErrors ?? []));
  }
  if (tags.length) {
    const r = await proxy.execute(TAGS_ADD, { id: orderId, tags });
    if (r === null) return { ok: false, gesammelt: true, abweichungen: [], userErrors };
    userErrors.push(...(r.tagsAdd?.userErrors ?? []));
  }

  // Gegenlesen.
  const check = await proxy.execute(ORDER_STATE_QUERY, { id: orderId });
  const abweichungen = [];
  const istMf = {};
  for (const n of check?.order?.metafields?.nodes ?? []) istMf[n.key] = n.value;
  for (const mf of metafields) {
    const ist = istMf[mf.key];
    if (ist === undefined) abweichungen.push(`ops.${mf.key}: nicht gefunden`);
    else if (mf.type === 'json' ? normJson(ist) !== normJson(mf.value) : ist !== mf.value) abweichungen.push(`ops.${mf.key}: erwartet ${mf.value}, ist ${ist}`);
  }
  const istTags = new Set(check?.order?.tags ?? []);
  for (const t of tags) if (!istTags.has(t)) abweichungen.push(`Tag fehlt: ${t}`);

  return { ok: userErrors.length === 0 && abweichungen.length === 0, gesammelt: false, abweichungen, userErrors };
}
