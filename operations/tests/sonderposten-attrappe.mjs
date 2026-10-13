// Attrappe der Shopify Admin API fuer die Sonderposten-Tests (operations/tests und
// docs/ai-dashboard/tests). Kein Test spricht echtes Shopify. Die Attrappe merkt sich
// jeden Aufruf, damit ein Test belegen kann, was NICHT geschrieben wurde.

export const PRODUKT_ID = 'gid://shopify/Product/9001';
export const ITEM_ID = 'gid://shopify/InventoryItem/7001';

function produkt(z) {
  return {
    id: z.id, title: z.titel, status: z.status, handle: z.handle || 'test-reststueck', productType: z.productType,
    tags: z.tags || [], rollenbreite: null,
    featuredMedia: null,
    metafields: { nodes: Object.entries(z.felder).map(([key, value]) => ({ key, value })) },
    variants: { nodes: [{
      id: 'gid://shopify/ProductVariant/8001', sku: z.sku, price: z.preis || '149.00', inventoryPolicy: z.policy,
      rollenbreite: z.rollenbreite ? { value: z.rollenbreite } : null,
      inventoryItem: { id: ITEM_ID, tracked: z.tracked, inventoryLevel: z.available === null ? null : { quantities: [{ name: 'available', quantity: z.available }, { name: 'on_hand', quantity: z.available }] } },
    }] },
  };
}

/**
 * @param {object} o
 * @param {number|null} [o.available=1]
 * @param {boolean} [o.verweigert=false]   inventorySetQuantities scheitert mit ACCESS_DENIED
 * @param {boolean} [o.felderFehler=false] metafieldsSet meldet userErrors
 * @param {string} [o.policy='DENY']       inventoryPolicy der Variante (CONTINUE = Ueberverkauf erlaubt)
 * @param {'nach'|'vor'|null} [o.antwortWeg=null]  Bestandsmutation endet ohne Antwort (Netzfehler):
 *        'nach' = Shopify hat gebucht, nur die Antwort fehlt; 'vor' = nie angekommen
 * @param {number[]} [o.lesenScheitert=[]] Nummern der SonderpostenEinzeln-Lesungen (1 = erste), die mit Netzfehler enden
 * @param {boolean} [o.rolle=false]        Restrolle statt Einzelstueck: Teppichboden mit Tag "sonderposten",
 *        Rollenbreite 4 m an der Variante, Bestand in m2 (Standard 80), ohne SKU
 * @param {object[]} [o.weitere=[]]        zusaetzliche Produkte fuer die Liste (rohe Admin-API-Knoten)
 */
export { produkt as rohProdukt };

export function attrappe({ available, verweigert = false, felderFehler = false, productType, sku, titel, tracked = true, policy = 'DENY', antwortWeg = null, lesenScheitert = [], rolle = false, weitere = [] } = {}) {
  const z = rolle
    ? {
      id: PRODUKT_ID, titel: titel ?? 'TEST Restrolle – nicht kaufen', status: 'ACTIVE', productType: productType ?? 'Teppichboden',
      sku: sku ?? null, tracked, available: available === undefined ? 80 : available, policy, handle: 'test-restrolle',
      tags: ['art: teppichboden', 'sonderposten'], rollenbreite: '4.0', preis: '41.95', felder: {},
    }
    : {
      id: PRODUKT_ID, titel: titel ?? 'TEST Reststück – nicht kaufen', status: 'DRAFT', productType: productType ?? 'Sonderposten',
      sku: sku ?? 'SP-TEST-0001', tracked, available: available === undefined ? 1 : available, policy,
      felder: { art: 'Reststück', zustand: 'Neuware', breite_m: '4.0', laenge_m: '2.35', lagerort: 'Regal 3' },
    };
  const aufrufe = [];
  let lesungen = 0;
  const proxy = {
    live: true,
    async execute(query, variables = {}) {
      const name = query.match(/(query|mutation)\s+(\w+)/)?.[2];
      aufrufe.push({ name, variables });
      if (name === 'SonderpostenEinzeln') {
        lesungen += 1;
        if (lesenScheitert.includes(lesungen)) throw new Error('Shopify Admin API: fetch failed (ECONNRESET)');
        return { product: variables.id === z.id ? produkt(z) : null };
      }
      if (name === 'SonderpostenListe') {
        const vorlage = { ...produkt({ ...z, id: 'gid://shopify/Product/1', titel: 'VORLAGE Sonderposten', sku: 'SP-0000', available: 0, felder: {} }) };
        return { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [produkt(z), vorlage, ...weitere] } };
      }
      if (name === 'SonderpostenLadenverkauf') {
        if (verweigert) throw new Error('Shopify GraphQL: Access denied for inventorySetQuantities field. Required access: `write_inventory` access scope.');
        if (antwortWeg === 'vor') throw new Error('Shopify Admin API: The operation was aborted due to timeout');
        const q = variables.input.quantities[0];
        if (q.changeFromQuantity !== z.available) {
          return { inventorySetQuantities: { inventoryAdjustmentGroup: null, userErrors: [{ field: ['input'], message: 'stale', code: 'CHANGE_FROM_QUANTITY_STALE' }] } };
        }
        z.available = q.quantity;
        if (antwortWeg === 'nach') throw new Error('Shopify Admin API: The operation was aborted due to timeout');
        return { inventorySetQuantities: { inventoryAdjustmentGroup: { id: 'gid://shopify/InventoryAdjustmentGroup/1', reason: 'correction', referenceDocumentUri: variables.input.referenceDocumentUri, changes: [] }, userErrors: [] } };
      }
      if (name === 'SonderpostenVerkauftFelder') {
        if (felderFehler) return { metafieldsSet: { metafields: [], userErrors: [{ field: ['metafields'], message: 'Wert nicht erlaubt', code: 'INVALID_VALUE' }] } };
        for (const m of variables.metafields) z.felder[m.key] = m.value;
        return { metafieldsSet: { metafields: variables.metafields.map(m => ({ key: m.key, value: m.value })), userErrors: [] } };
      }
      throw new Error(`Attrappe kennt ${name} nicht`);
    },
  };
  const namen = () => aufrufe.map(a => a.name);
  return { proxy, zustand: z, aufrufe, namen };
}
