import test from 'node:test';
import assert from 'node:assert/strict';
import { katalogJsonl, pruefeUmfang, datei } from '../scripts/feed-tnm-abruf.mjs';
import { tnmPreisZeilen } from '../scripts/feed-titel.mjs';

const seite = (nodes, endCursor = null) => ({
  products: { pageInfo: { hasNextPage: Boolean(endCursor), endCursor }, nodes },
});
const produkt = (id, varianten) => ({
  id: `gid://shopify/Product/${id}`, title: `P${id}`, productType: 'Teppich nach Maß',
  variants: { pageInfo: { hasNextPage: false }, nodes: varianten },
});

test('katalogJsonl blaettert alle Seiten durch und liefert das Bulk-Format', async () => {
  const seiten = [
    seite([produkt(1, [{ id: 'gid://shopify/ProductVariant/11', price: '0.85', compareAtPrice: '0.89' }])], 'c1'),
    seite([produkt(2, [{ id: 'gid://shopify/ProductVariant/21', price: '0.50', compareAtPrice: null }])]),
  ];
  const aufrufe = [];
  const proxy = { execute: async (_q, v) => { aufrufe.push(v.nach); return seiten.shift(); } };
  const zeilen = tnmPreisZeilen(await katalogJsonl(proxy));
  assert.deepEqual(aufrufe, [null, 'c1']);
  assert.deepEqual(zeilen, [
    ['shopify_ZZ_1_11', '89.00 EUR', '85.00 EUR', '1 sqm', '1 sqm'],
    ['shopify_ZZ_2_21', '50.00 EUR', '', '1 sqm', '1 sqm'],
  ]);
  assert.match(datei(zeilen), /^id\tprice\tsale_price\t/);
});

test('katalogJsonl bricht ohne products ab statt leer zu schreiben', async () => {
  await assert.rejects(katalogJsonl({ execute: async () => ({}) }), /keine products/);
});

test('pruefeUmfang: leer oder deutlich weniger Zeilen als vorher bricht ab', () => {
  const vorher = 'id\tprice\n' + Array.from({ length: 100 }, (_, i) => `shopify_ZZ_1_${i}\t1 EUR`).join('\n');
  assert.throws(() => pruefeUmfang(0, vorher), /Keine/);
  assert.throws(() => pruefeUmfang(79, vorher), /Nur 79 statt bisher 100/);
  assert.doesNotThrow(() => pruefeUmfang(80, vorher));
  assert.doesNotThrow(() => pruefeUmfang(5, ''), 'erster Lauf ohne Vorgaenger');
});
