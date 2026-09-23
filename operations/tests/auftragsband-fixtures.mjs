// Erfundene Testdaten fuer das Auftragsband. Keine echten Kunden, keine
// echten Bestellnummern, Lieferanten nur als Pseudonyme A-D.

const mf = (namespace, key, value) => ({ namespace, key, value });

export function zeile({ id, sku, title, variantTitle = null, quantity = 1, attrs = [], einkauf = [], lieferant = [], custom = [], gh = null, handle = 'testprodukt', bild = null }) {
  return {
    id: `gid://shopify/LineItem/${id}`, sku, title, variantTitle, quantity, currentQuantity: quantity, unfulfilledQuantity: quantity,
    customAttributes: attrs,
    variant: {
      id: `gid://shopify/ProductVariant/${id}`, sku, title: variantTitle ?? 'Default Title',
      image: bild ? { url: bild } : null,
      metafields: { nodes: einkauf.map(([k, v]) => mf('einkauf', k, v)) },
      lieferant: { nodes: lieferant.map(([k, v]) => mf('lieferant', k, v)) },
      product: {
        id: `gid://shopify/Product/${id}`, handle, title,
        metafields: { nodes: custom.map(([k, v]) => mf('custom', k, v)) },
        grosshandel: { nodes: gh ? [mf('grosshandel', 'sku', gh)] : [] },
      },
    },
  };
}

export function bestellung(nr, zeilen, extra = {}) {
  return {
    id: `gid://shopify/Order/9000${nr}`,
    name: `#T${nr}`,
    createdAt: extra.createdAt || '2026-01-05T10:00:00Z',
    cancelledAt: null,
    displayFinancialStatus: 'PAID',
    displayFulfillmentStatus: 'UNFULFILLED',
    customAttributes: [],
    email: `test${nr}@example.invalid`,
    phone: '+49 000 000000',
    customer: { firstName: 'Test', lastName: 'Kundin', email: `test${nr}@example.invalid`, phone: '+49 000 000000' },
    shippingAddress: { name: 'Test Kundin', address1: 'Teststrasse 1', zip: '00000', city: 'Teststadt', country: 'Deutschland' },
    billingAddress: { name: 'Test Kundin', address1: 'Teststrasse 1', zip: '00000', city: 'Teststadt', country: 'Deutschland' },
    totalPriceSet: { shopMoney: { amount: '499.00', currencyCode: 'EUR' } },
    fulfillments: [],
    lineItems: { nodes: zeilen },
    ...extra,
  };
}

export const paketzeile = zeile({
  id: 1, sku: 'TEST-PAKET-1', title: 'Testdiele Eiche', variantTitle: 'Natur', quantity: 3,
  einkauf: [['lieferant', 'B'], ['bestelleinheit', 'paket'], ['route', 'SUPPLIER_TO_TP'], ['farbnummer', '0815']],
  lieferant: [['lieferant_b_artikelnummer', 'B-4711']],
  custom: [['qm_pro_paket', '2,2']],
  bild: 'https://cdn.example.invalid/test.jpg',
});

export const zeileOhneId = zeile({
  id: 2, sku: 'TEST-OHNE-ID', title: 'Testware ohne Stammdaten', quantity: 1,
  einkauf: [['bestelleinheit', 'paket']],
});

/** Drei Bestellungen: alt/neu und eine mit Beratungswunsch ohne Telefon. */
export function daten() {
  return {
    orders: [
      bestellung(2, [zeile({ id: 3, sku: 'TEST-PAKET-2', title: 'Testdiele Esche', quantity: 1, einkauf: [['lieferant', 'A'], ['bestelleinheit', 'paket'], ['route', 'SUPPLIER_TO_TP']], lieferant: [['lieferant_a_artikelnummer', 'A-1000']], custom: [['qm_pro_paket', '2']] })], { createdAt: '2026-01-02T08:00:00Z' }),
      bestellung(1, [paketzeile], { createdAt: '2026-01-01T08:00:00Z' }),
      bestellung(3, [zeileOhneId], { createdAt: '2026-01-03T08:00:00Z', customAttributes: [{ key: 'Beratung', value: 'ja' }] }),
    ],
    quellvarianten: [],
  };
}
