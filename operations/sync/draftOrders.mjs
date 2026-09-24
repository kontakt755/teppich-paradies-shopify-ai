/**
 * Angebote/Entwuerfe (DraftOrder) aus der Admin API - fuer Mass- und
 * Verlegeangebote, die noch keine Bestellung sind. Gleicher Zugang wie
 * sync/orders.mjs (workflow/graphql-proxy.mjs, D6).
 */

export const SEITENGROESSE = 50;

export const DRAFT_ORDERS_QUERY = `
query OpsDraftOrders($first: Int!, $after: String, $query: String) {
  draftOrders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name status createdAt updatedAt completedAt invoiceSentAt invoiceUrl
      tags note2
      email phone
      customer { displayName defaultEmailAddress { emailAddress } defaultPhoneNumber { phoneNumber } }
      totalPriceSet { shopMoney { amount currencyCode } }
      subtotalPriceSet { shopMoney { amount currencyCode } }
      totalQuantityOfLineItems
      lineItems(first: 50) {
        nodes {
          title quantity sku variantTitle
          originalUnitPriceSet { shopMoney { amount currencyCode } }
        }
      }
    }
  }
}`;

/**
 * Alle Entwuerfe, vollstaendig paginiert. Ohne Filter (query=null) liefert
 * Shopify alle Status (OPEN, INVOICE_SENT, COMPLETED) - COMPLETED bleibt
 * sichtbar, weil ein einmal angenommenes Angebot als Beleg wichtig bleibt.
 *
 * @returns {Promise<{draftOrders:Array, seiten:number, gesammelt:boolean}>}
 */
export async function fetchDraftOrders(proxy, { first = SEITENGROESSE, warten, query = null } = {}) {
  if (!proxy || typeof proxy.execute !== 'function') throw new Error('fetchDraftOrders: proxy fehlt');
  const { wartenBeiThrottle } = await import('./orders.mjs');
  const draftOrders = [];
  let after = null;
  let seiten = 0;
  for (;;) {
    const data = await proxy.execute(DRAFT_ORDERS_QUERY, { first, after, query });
    if (data === null) return { draftOrders: [], seiten, gesammelt: true };
    seiten += 1;
    const conn = data?.draftOrders;
    if (!conn) throw new Error('fetchDraftOrders: Antwort ohne draftOrders');
    draftOrders.push(...(conn.nodes ?? []));
    if (!conn.pageInfo?.hasNextPage) break;
    if (!conn.pageInfo.endCursor) throw new Error('fetchDraftOrders: hasNextPage ohne endCursor');
    after = conn.pageInfo.endCursor;
    await wartenBeiThrottle(proxy, warten ? { warten } : undefined);
  }
  return { draftOrders, seiten, gesammelt: false };
}
