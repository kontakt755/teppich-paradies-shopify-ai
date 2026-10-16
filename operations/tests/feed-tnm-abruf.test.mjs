import test from 'node:test';
import assert from 'node:assert/strict';
import { katalogJsonl, pruefeUmfang, datei, metaZeilen, metaDatei, META_KOPF } from '../scripts/feed-tnm-abruf.mjs';
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

test('metaZeilen: vollstaendige Katalogzeile je m2 mit Varianten-ID, Bild-Rueckfall und ohne Tabs', async () => {
  const p = {
    id: 'gid://shopify/Product/7', title: 'Piumera Teppich nach Maß', productType: 'Teppich nach Maß',
    handle: 'piumera-tnm', vendor: 'Teppich Paradies', description: 'Weich\tund\n dicht.',
    featuredMedia: { preview: { image: { url: 'https://cdn/p.jpg' } } },
    variants: { pageInfo: { hasNextPage: false }, nodes: [
      { id: 'gid://shopify/ProductVariant/71', price: '0.85', compareAtPrice: '0.89', availableForSale: true,
        selectedOptions: [{ name: 'Farbe', value: 'Graphit' }], image: { url: 'https://cdn/v.jpg' } },
      { id: 'gid://shopify/ProductVariant/72', price: '0.85', compareAtPrice: null, availableForSale: false,
        selectedOptions: [{ name: 'Farbe', value: 'Sand' }], image: null },
    ] },
  };
  const andere = { ...p, id: 'gid://shopify/Product/8', productType: 'Teppichboden', variants: { pageInfo: { hasNextPage: false }, nodes: [{ id: 'gid://shopify/ProductVariant/81', price: '30' }] } };
  const proxy = { execute: async () => seite([p, andere]) };
  const zeilen = metaZeilen(await katalogJsonl(proxy));
  assert.equal(zeilen.length, 2, 'nur Teppich nach Mass');
  const [a, b] = zeilen.map((z) => Object.fromEntries(META_KOPF.map((k, i) => [k, z[i]])));
  assert.equal(a.id, '71');
  assert.equal(a.item_group_id, '7');
  assert.equal(a.price, '89.00 EUR');
  assert.equal(a.sale_price, '85.00 EUR');
  assert.equal(a.image_link, 'https://cdn/v.jpg');
  assert.equal(a.link, 'https://www.teppich-paradies.net/products/piumera-tnm?variant=71');
  assert.equal(a.description, 'Weich und dicht. Preis je m².');
  assert.match(a.title, /Graphit/);
  assert.equal(b.price, '85.00 EUR');
  assert.equal(b.sale_price, '');
  assert.equal(b.availability, 'out of stock');
  assert.equal(b.image_link, 'https://cdn/p.jpg', 'ohne Variantenbild das Produktbild');
  const text = metaDatei(zeilen);
  assert.equal(text.split('\n')[0], META_KOPF.join('\t'));
  assert.ok(text.split('\n').filter(Boolean).every((z) => z.split('\t').length === META_KOPF.length));
});
