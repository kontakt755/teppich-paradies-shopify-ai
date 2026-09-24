/**
 * Abgebrochene Warenkoerbe (AbandonedCheckout) der letzten N Tage - verlorener
 * Umsatz, den das Control Center heute nicht zeigt. Gleicher Zugang wie
 * sync/orders.mjs (workflow/graphql-proxy.mjs, D6).
 */

export const SEITENGROESSE = 50;
export const STANDARD_TAGE_FENSTER = 30;

export const ABANDONED_CHECKOUTS_QUERY = `
query OpsAbandonedCheckouts($first: Int!, $after: String, $query: String) {
  abandonedCheckouts(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name createdAt updatedAt completedAt abandonedCheckoutUrl
      customer { displayName defaultEmailAddress { emailAddress } defaultPhoneNumber { phoneNumber } }
      totalPriceSet { shopMoney { amount currencyCode } }
      subtotalPriceSet { shopMoney { amount currencyCode } }
      billingAddress { name city country }
      shippingAddress { name city country }
      lineItems(first: 50) {
        nodes {
          title quantity
        }
      }
    }
  }
}`;

/** Baut die Query fuer "letzte tageFenster Tage, noch nicht abgeschlossen". */
export function baueQuery(tageFenster = STANDARD_TAGE_FENSTER, jetzt = () => Date.now()) {
  const cutoff = new Date(jetzt() - tageFenster * 24 * 60 * 60 * 1000).toISOString();
  return `created_at:>='${cutoff}'`;
}

/**
 * Abgebrochene Warenkoerbe der letzten `tageFenster` Tage, vollstaendig
 * paginiert. `completedAt` bleibt im Datensatz - ein inzwischen doch noch
 * abgeschlossener Checkout wird nicht stillschweigend geraten, sondern die
 * Aufbereitung (lib/warenkoerbe.mjs) entscheidet sichtbar.
 *
 * @returns {Promise<{checkouts:Array, seiten:number, gesammelt:boolean, query:string}>}
 */
export async function fetchAbandonedCheckouts(proxy, { tageFenster = STANDARD_TAGE_FENSTER, first = SEITENGROESSE, warten, jetzt } = {}) {
  if (!proxy || typeof proxy.execute !== 'function') throw new Error('fetchAbandonedCheckouts: proxy fehlt');
  const { wartenBeiThrottle } = await import('./orders.mjs');
  const query = baueQuery(tageFenster, jetzt);
  const checkouts = [];
  let after = null;
  let seiten = 0;
  for (;;) {
    const data = await proxy.execute(ABANDONED_CHECKOUTS_QUERY, { first, after, query });
    if (data === null) return { checkouts: [], seiten, gesammelt: true, query };
    seiten += 1;
    const conn = data?.abandonedCheckouts;
    if (!conn) throw new Error('fetchAbandonedCheckouts: Antwort ohne abandonedCheckouts');
    checkouts.push(...(conn.nodes ?? []));
    if (!conn.pageInfo?.hasNextPage) break;
    if (!conn.pageInfo.endCursor) throw new Error('fetchAbandonedCheckouts: hasNextPage ohne endCursor');
    after = conn.pageInfo.endCursor;
    await wartenBeiThrottle(proxy, warten ? { warten } : undefined);
  }
  return { checkouts, seiten, gesammelt: false, query };
}
