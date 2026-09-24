/**
 * Kunden aus der Admin API lesen - eigene Datenart, nicht nur aus
 * Bestellungen abgeleitet. Liefert verlaessliche Lebenszeit-Zahlen
 * (numberOfOrders, amountSpent) statt Summen aus einem Zeitfenster, und
 * zeigt auch Kunden ohne aktuelle Bestellung.
 *
 * Einziger Client ist workflow/graphql-proxy.mjs (D6), wie sync/orders.mjs.
 * Ohne SHOPIFY_ADMIN_TOKEN liefert proxy.execute() null (Sammelmodus) - dann
 * gibt es hier keine Kunden, aber auch keinen Fehler.
 */

export const SEITENGROESSE = 100;

export const CUSTOMERS_QUERY = `
query OpsCustomers($first: Int!, $after: String) {
  customers(first: $first, after: $after, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id displayName firstName lastName note createdAt updatedAt
      numberOfOrders
      amountSpent { amount currencyCode }
      tags
      verifiedEmail
      defaultEmailAddress { emailAddress marketingState marketingOptInLevel }
      defaultPhoneNumber { phoneNumber marketingState }
      defaultAddress { name address1 address2 zip city country countryCodeV2 phone }
      addressesV2(first: 5) { nodes { name address1 address2 zip city country countryCodeV2 phone } }
    }
  }
}`;

/**
 * Alle Kunden, vollstaendig paginiert (kein festes Limit). Nutzt dieselbe
 * Throttle-Wartung wie sync/orders.mjs, damit ein grosser Kundenstamm nicht
 * mit THROTTLED abbricht.
 *
 * @returns {Promise<{customers:Array, seiten:number, gesammelt:boolean}>}
 */
export async function fetchCustomers(proxy, { first = SEITENGROESSE, warten } = {}) {
  if (!proxy || typeof proxy.execute !== 'function') throw new Error('fetchCustomers: proxy fehlt');
  const { wartenBeiThrottle } = await import('./orders.mjs');
  const customers = [];
  let after = null;
  let seiten = 0;
  for (;;) {
    const data = await proxy.execute(CUSTOMERS_QUERY, { first, after });
    if (data === null) return { customers: [], seiten, gesammelt: true };
    seiten += 1;
    const conn = data?.customers;
    if (!conn) throw new Error('fetchCustomers: Antwort ohne customers');
    customers.push(...(conn.nodes ?? []));
    if (!conn.pageInfo?.hasNextPage) break;
    if (!conn.pageInfo.endCursor) throw new Error('fetchCustomers: hasNextPage ohne endCursor');
    after = conn.pageInfo.endCursor;
    await wartenBeiThrottle(proxy, warten ? { warten } : undefined);
  }
  return { customers, seiten, gesammelt: false };
}
