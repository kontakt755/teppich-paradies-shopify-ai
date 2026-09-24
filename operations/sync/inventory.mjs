/**
 * Lagerbestand je Standort und Variante (InventoryLevel) - beantwortet
 * "haben wir das da?" fuer die Bestelluebersicht und den Einkauf. Gleicher
 * Zugang wie sync/orders.mjs (workflow/graphql-proxy.mjs, D6).
 *
 * Shopify fuehrt Lagerbestand nur, wenn eine Variante `inventoryItem.tracked`
 * hat und mindestens ein Standort existiert - hat der Shop das nicht
 * eingerichtet, liefert dieser Abruf eine leere Liste. Das ist dann kein
 * Fehler, sondern ein Tatbestand: aktualisieren.mjs haelt das im Bericht fest,
 * statt Nullen zu erfinden.
 */

export const SEITENGROESSE = 100;

export const LOCATIONS_QUERY = `
query OpsLocations($first: Int!, $after: String) {
  locations(first: $first, after: $after, includeLegacy: false, includeInactive: false) {
    pageInfo { hasNextPage endCursor }
    nodes { id name isActive fulfillsOnlineOrders }
  }
}`;

export const INVENTORY_LEVELS_QUERY = `
query OpsInventoryLevels($locationId: ID!, $first: Int!, $after: String) {
  location(id: $locationId) {
    id name
    inventoryLevels(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        quantities(names: ["available", "on_hand", "committed", "incoming"]) { name quantity }
        item {
          id sku tracked
          variant {
            id sku title
            product { id handle title }
          }
        }
      }
    }
  }
}`;

/** Alle aktiven Standorte, vollstaendig paginiert. */
export async function fetchLocations(proxy, { first = SEITENGROESSE, warten } = {}) {
  if (!proxy || typeof proxy.execute !== 'function') throw new Error('fetchLocations: proxy fehlt');
  const { wartenBeiThrottle } = await import('./orders.mjs');
  const locations = [];
  let after = null;
  for (;;) {
    const data = await proxy.execute(LOCATIONS_QUERY, { first, after });
    if (data === null) return { locations: [], gesammelt: true };
    const conn = data?.locations;
    if (!conn) throw new Error('fetchLocations: Antwort ohne locations');
    locations.push(...(conn.nodes ?? []));
    if (!conn.pageInfo?.hasNextPage) break;
    if (!conn.pageInfo.endCursor) throw new Error('fetchLocations: hasNextPage ohne endCursor');
    after = conn.pageInfo.endCursor;
    await wartenBeiThrottle(proxy, warten ? { warten } : undefined);
  }
  return { locations, gesammelt: false };
}

/** Alle Lagerbestaende eines Standorts, vollstaendig paginiert. */
async function fetchLevelsFuerStandort(proxy, locationId, { first, warten } = {}) {
  const { wartenBeiThrottle } = await import('./orders.mjs');
  const levels = [];
  let after = null;
  for (;;) {
    const data = await proxy.execute(INVENTORY_LEVELS_QUERY, { locationId, first, after });
    if (data === null) return { levels: [], gesammelt: true };
    const conn = data?.location?.inventoryLevels;
    if (!conn) throw new Error(`fetchInventoryLevels: Antwort ohne inventoryLevels fuer ${locationId}`);
    levels.push(...(conn.nodes ?? []));
    if (!conn.pageInfo?.hasNextPage) break;
    if (!conn.pageInfo.endCursor) throw new Error('fetchInventoryLevels: hasNextPage ohne endCursor');
    after = conn.pageInfo.endCursor;
    await wartenBeiThrottle(proxy, warten ? { warten } : undefined);
  }
  return { levels, gesammelt: false };
}

/**
 * Lagerbestand aller Standorte fuer alle getrackten Varianten. Laeuft
 * zunaechst alle Standorte, dann je Standort alle inventoryLevels - bewusst
 * nacheinander (kein Promise.all ueber Standorte), damit die
 * Throttle-Wartung greift wie in sync/orders.mjs.
 *
 * @returns {Promise<{standorte:Array, bestand:Array, gesammelt:boolean}>}
 */
export async function fetchInventoryLevels(proxy, { first = SEITENGROESSE, warten } = {}) {
  if (!proxy || typeof proxy.execute !== 'function') throw new Error('fetchInventoryLevels: proxy fehlt');
  const { locations, gesammelt: locGesammelt } = await fetchLocations(proxy, { warten });
  if (locGesammelt) return { standorte: [], bestand: [], gesammelt: true };
  const bestand = [];
  for (const loc of locations) {
    // eslint-disable-next-line no-await-in-loop -- Standorte bewusst nacheinander, siehe oben.
    const { levels, gesammelt } = await fetchLevelsFuerStandort(proxy, loc.id, { first, warten });
    if (gesammelt) return { standorte: locations, bestand: [], gesammelt: true };
    for (const l of levels) bestand.push({ ...l, standort: { id: loc.id, name: loc.name } });
  }
  return { standorte: locations, bestand, gesammelt: false };
}
