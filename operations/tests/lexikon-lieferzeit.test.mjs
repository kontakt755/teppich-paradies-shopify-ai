import test from 'node:test';
import assert from 'node:assert/strict';
import { aufbereiten } from '../lib/lexikon.mjs';
import { BULK_QUERY, jsonlZuProdukten } from '../scripts/lexikon-export.mjs';

// Nur erfundene Katalogdaten. Lieferzeit fuer die Muster-Nachfrage (Rundgang #7).
const JETZT = new Date('2026-01-20T12:00:00Z');
const produkt = (handle, extra = {}) => ({ id: `gid://shopify/Product/${handle.length}`, handle, title: 'Testvelours Teppich nach Maß', status: 'ACTIVE',
  productType: 'Teppich nach Maß', onlineStoreUrl: `https://www.teppich-paradies.net/products/${handle}`, tags: [], isGiftCard: false, musterBasis: null,
  metafields: [], variants: [], ...extra });

test('Lexikon: service.lieferzeit aus dem Massenexport, ohne Wert kein Schluessel', () => {
  assert.match(BULK_QUERY, /lieferzeit:\s*metafield\(namespace:\s*"service",\s*key:\s*"lieferzeit"\)\s*\{\s*value\s*\}/);
  const roh = jsonlZuProdukten([
    produkt('mit-lz', { lieferzeit: { value: ' ca. 5–8 Werktage inkl. Ketteln ' } }),
    produkt('ohne-lz', { lieferzeit: null }),
    produkt('alt'),
  ].map(x => JSON.stringify(x)).join('\n'));
  const [mit, ohne, alt] = aufbereiten(roh, { jetzt: JETZT }).produkte;
  assert.equal(mit.lieferzeit, 'ca. 5–8 Werktage inkl. Ketteln');
  assert.equal(Object.hasOwn(ohne, 'lieferzeit'), false);
  assert.equal(Object.hasOwn(alt, 'lieferzeit'), false);
});
