import test from 'node:test';
import assert from 'node:assert/strict';
import { basisTitel, feedTitel, feedZeilen, grundpreis, tnmPreisZeilen } from '../scripts/feed-titel.mjs';

const v = (opts) => ({ selectedOptions: Object.entries(opts).map(([name, value]) => ({ name, value })) });

test('basisTitel entfernt Shopnamen und Breitenlisten', () => {
  assert.equal(basisTitel('Vallora Teppichboden 400cm 500cm'), 'Vallora Teppichboden');
  assert.equal(basisTitel('Terracora Eiche Fischgrät – Vinylboden von der Rolle, 200/400 cm'), 'Terracora Eiche Fischgrät – Vinylboden von der Rolle');
  assert.equal(basisTitel('Bergen Beton – Klickvinyl 6mm | Teppich Paradies'), 'Bergen Beton – Klickvinyl 6mm');
});

test('feedTitel: Farbe bei mehreren Farben, Breite als "breit", Wunschmass ohne Zusatz', () => {
  assert.equal(feedTitel('Vallora Teppichboden 400cm 500cm', v({ Farbe: 'Salbeigrün (081)', Breite: '400 cm' }), 12), 'Vallora Teppichboden Salbeigrün (081), 400 cm breit');
  assert.equal(feedTitel('Hestia Teppichboden 400cm', v({ Farbe: 'Steingrau (173)', Breite: 'Wunschmaß' }), 8), 'Hestia Teppichboden Steingrau (173)');
  assert.equal(feedTitel('Zafira Teppichboden 400cm 500cm', v({ Farbe: 'Haselnuss (420)', Breite: '500cm' }), 5), 'Zafira Teppichboden Haselnuss (420), 500 cm breit');
});

test('feedTitel: keine Filterfarbe bei Einzeldekor', () => {
  assert.equal(feedTitel('Landora Eiche Beige – Vinylboden von der Rolle', v({ Breite: '300 cm', Farbe: 'Beige Braun' }), 1), 'Landora Eiche Beige – Vinylboden von der Rolle, 300 cm breit');
});

test('feedZeilen baut die offerId der Shopify-App', () => {
  const jsonl = [
    { id: 'gid://shopify/Product/1', title: 'Hestia Teppichboden 400cm' },
    { id: 'gid://shopify/ProductVariant/11', __parentId: 'gid://shopify/Product/1', ...v({ Farbe: 'Grau', Breite: '400 cm' }) },
    { id: 'gid://shopify/ProductVariant/12', __parentId: 'gid://shopify/Product/1', ...v({ Farbe: 'Sand', Breite: '400 cm' }) },
  ].map((o) => JSON.stringify(o)).join('\n');
  assert.deepEqual(feedZeilen(jsonl), [
    ['shopify_ZZ_1_11', 'Hestia Teppichboden Grau, 400 cm breit', '', '', 'DE:50.00 EUR'],
    ['shopify_ZZ_1_12', 'Hestia Teppichboden Sand, 400 cm breit', '', '', 'DE:50.00 EUR'],
  ]);
});

const mess = (quantityValue, quantityUnit = 'M2', referenceValue = 1, referenceUnit = 'M2') => ({ quantityUnit, quantityValue, referenceUnit, referenceValue });

test('grundpreis: Paketware in m², nur wenn Shopify den Grundpreis zeigt', () => {
  assert.deepEqual(grundpreis({ showUnitPrice: true, unitPriceMeasurement: mess(2.21) }), ['2.21 sqm', '1 sqm']);
  assert.deepEqual(grundpreis({ showUnitPrice: true, unitPriceMeasurement: mess(2.5, 'M', 1, 'M') }), ['2.5 m', '1 m']);
  assert.deepEqual(grundpreis({ showUnitPrice: true, unitPriceMeasurement: mess(1.7999999, 'M2') }), ['1.8 sqm', '1 sqm'], 'Fliesskomma gerundet');
  assert.deepEqual(grundpreis({ showUnitPrice: false, unitPriceMeasurement: mess(2.21) }), ['', ''], 'Grundpreis aus');
  assert.deepEqual(grundpreis({ showUnitPrice: true, unitPriceMeasurement: null }), ['', '']);
  assert.deepEqual(grundpreis({ showUnitPrice: true, unitPriceMeasurement: mess(0) }), ['', ''], 'Menge 0');
  assert.deepEqual(grundpreis({ showUnitPrice: true, unitPriceMeasurement: mess(20, 'MM', 1, 'MM') }), ['', ''], 'unbekannte Einheit nicht raten');
  assert.deepEqual(grundpreis(undefined), ['', '']);
});

test('feedZeilen: Grundpreis-Spalten aus der Bulk-Abfrage', () => {
  const jsonl = [
    { id: 'gid://shopify/Product/2', title: 'Rostavo Eiche Rustikal – Klickvinyl 5,2mm' },
    { id: 'gid://shopify/ProductVariant/21', __parentId: 'gid://shopify/Product/2', selectedOptions: [], showUnitPrice: true, unitPriceMeasurement: mess(2.21) },
  ].map((o) => JSON.stringify(o)).join('\n');
  assert.deepEqual(feedZeilen(jsonl), [['shopify_ZZ_2_21', 'Rostavo Eiche Rustikal – Klickvinyl 5,2mm', '2.21 sqm', '1 sqm', 'DE:50.00 EUR']]);
});

test('Teppich nach Maß: Preis je m² statt je 0,01 m², Grundpreis 1 sqm', () => {
  const jsonl = [
    { id: 'gid://shopify/Product/3', title: 'Piumera Teppich nach Maß', productType: 'Teppich nach Maß' },
    { id: 'gid://shopify/ProductVariant/31', __parentId: 'gid://shopify/Product/3', price: '0.85', compareAtPrice: '0.89', selectedOptions: [], showUnitPrice: true, unitPriceMeasurement: mess(0.01) },
    { id: 'gid://shopify/ProductVariant/32', __parentId: 'gid://shopify/Product/3', price: '0.25', compareAtPrice: null, selectedOptions: [], showUnitPrice: true, unitPriceMeasurement: mess(0.01) },
    { id: 'gid://shopify/ProductVariant/33', __parentId: 'gid://shopify/Product/3', price: '0.00', compareAtPrice: null, selectedOptions: [] },
    { id: 'gid://shopify/Product/4', title: 'Hestia Teppichboden 400cm', productType: 'Teppichboden' },
    { id: 'gid://shopify/ProductVariant/41', __parentId: 'gid://shopify/Product/4', price: '0.85', compareAtPrice: null, selectedOptions: [] },
  ].map((o) => JSON.stringify(o)).join('\n');
  assert.deepEqual(tnmPreisZeilen(jsonl), [
    ['shopify_ZZ_3_31', '89.00 EUR', '85.00 EUR', '1 sqm', '1 sqm'],
    ['shopify_ZZ_3_32', '25.00 EUR', '', '1 sqm', '1 sqm'],
  ], 'ohne Preis keine Zeile, andere Produktarten nicht');
  const titel = feedZeilen(jsonl).filter((z) => z[0].startsWith('shopify_ZZ_3_'));
  assert.ok(titel.every((z) => z[2] === '1 sqm' && z[3] === '1 sqm'), 'tp-feedtitel.txt setzt keinen 0,01-m²-Grundpreis');
});
