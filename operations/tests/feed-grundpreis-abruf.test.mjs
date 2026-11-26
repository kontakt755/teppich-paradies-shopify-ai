import test from 'node:test';
import assert from 'node:assert/strict';
import { katalog, zeilen, idsAus, datei, pruefeUmfang, ABFRAGE } from '../scripts/feed-grundpreis-abruf.mjs';

const m2 = { quantityUnit: 'M2', quantityValue: 1, referenceUnit: 'M2', referenceValue: 1 };
const v = (id, showUnitPrice = false, unitPriceMeasurement = m2) => ({ id: `gid://shopify/ProductVariant/${id}`, showUnitPrice, unitPriceMeasurement });
const p = (id, productType, nodes) => ({ id: `gid://shopify/Product/${id}`, productType, variants: { pageInfo: { hasNextPage: false }, nodes } });

test('nur m²-Varianten ohne sichtbaren Grundpreis, ohne IDs der anderen Quellen', () => {
  const rows = zeilen([
    p(1, 'Teppichboden', [v(11), v(12, true), v(13, false, null), v(14, false, { ...m2, quantityUnit: 'M' })]),
    p(2, 'Vinyl von der Rolle', [v(21)]),
    p(3, 'Teppich nach Maß', [v(31)]),
    p(4, 'Sauberlauf', [v(41)]),
  ], new Set(['shopify_ZZ_4_41']));
  assert.deepEqual(rows, [['shopify_ZZ_1_11', '1 sqm', '1 sqm'], ['shopify_ZZ_2_21', '1 sqm', '1 sqm']]);
  assert.equal(datei(rows).split('\n')[0], 'id\tunit_pricing_measure\tunit_pricing_base_measure');
});

test('Abfrage filtert Google-Kanal und Warenarten, blaettert und bricht bei >250 Varianten ab', async () => {
  assert.match(ABFRAGE, /publication_ids:367654764878/);
  assert.match(ABFRAGE, /product_type:'Vinyl von der Rolle'/);
  const seiten = [{ products: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [p(1, 'Teppichboden', [v(11)])] } },
    { products: { pageInfo: { hasNextPage: false }, nodes: [p(2, 'Sauberlauf', [v(21)])] } }];
  assert.equal((await katalog({ execute: async () => seiten.shift() })).length, 2);
  const zuViele = { ...p(3, 'Teppichboden', []), variants: { pageInfo: { hasNextPage: true }, nodes: [] } };
  await assert.rejects(katalog({ execute: async () => ({ products: { pageInfo: { hasNextPage: false }, nodes: [zuViele] } }) }), /250/);
});

test('IDs aus TSV ohne Kopf, Umfangspruefung 80 %', () => {
  assert.deepEqual([...idsAus('id\tprice\nshopify_ZZ_1_11\t1\n\n')], ['shopify_ZZ_1_11']);
  assert.throws(() => pruefeUmfang(0, 0), /Keine/);
  assert.throws(() => pruefeUmfang(79, 100), /80 %/);
  pruefeUmfang(80, 100);
  pruefeUmfang(5, 0);
});
