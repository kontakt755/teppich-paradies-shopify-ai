import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { katalogJsonl, katalogProdukte, katalogHash, pruefeUmfang, datei, metaZeilen, metaDatei, META_KOPF, vorbereiten, verifizierteEntnahmen } from '../scripts/feed-tnm-abruf.mjs';

const seite = (nodes, endCursor = null) => ({ products: { pageInfo: { hasNextPage: Boolean(endCursor), endCursor }, nodes } });
const produkt = (id = 1, variants = [{ id: 'gid://shopify/ProductVariant/11', price: '0.85', compareAtPrice: null, availableForSale: true }]) => ({
  id: `gid://shopify/Product/${id}`, title: `P${id}`, productType: 'Teppich nach Maß', status: 'ACTIVE',
  updatedAt: '2026-10-23T10:00:00Z', onlineStoreUrl: `https://www.teppich-paradies.net/products/p${id}`,
  handle: `p${id}`, vendor: 'Teppich Paradies', description: 'Weich und dicht.',
  featuredMedia: { preview: { image: { url: 'https://cdn/p.jpg' } } },
  variants: { pageInfo: { hasNextPage: false }, nodes: variants },
});
const angebot = (id = '11') => ({ googleId: `shopify_ZZ_1_${id}`, metaId: id, itemGroupId: '1', handle: 'p1',
  title: 'P1 Sand, 80 x 150 cm', description: 'Weich. Beispielgroesse 80 x 150 cm.', availability: 'in_stock',
  price: '189.40 EUR', salePrice: '', link: `https://www.teppich-paradies.net/products/p1?variant=${id}&breite=80&laenge=150`,
  flaeche: '1.2 sqm', imageLink: 'https://cdn/p.jpg', brand: 'Teppich Paradies', farbe: 'Sand', endpreisCent: 18940 });
const vorher = 'id\tprice\nshopify_ZZ_1_11\t85.00 EUR\n';
const metaVorher = 'id\titem_group_id\n11\t1\n';
const erzeugt = (zeilen = [angebot()]) => ({ zeilen, pruefung: { format: 'tp-tnm-endpreis-v1', varianten: zeilen.length, zeilen: zeilen.length, ausgelassen: [] } });

test('vorhandener Proxy blaettert durch den kompletten Katalog mit Meta-/Aktualitaetsfeldern', async () => {
  const seiten = [seite([produkt()], 'c1'), seite([produkt(2, [{ id: 'gid://shopify/ProductVariant/21', price: '0.50' }])])];
  const aufrufe = [];
  const jsonl = await katalogJsonl({ execute: async (q, v) => { aufrufe.push(v.nach); assert.match(q, /updatedAt/); assert.match(q, /onlineStoreUrl/); return seiten.shift(); } });
  assert.deepEqual(aufrufe, [null, 'c1']);
  const ps = katalogProdukte(jsonl);
  assert.equal(ps.length, 2);
  assert.equal(ps[0].bild, 'https://cdn/p.jpg');
  assert.equal(ps[0].variants[0].id, 'gid://shopify/ProductVariant/11');
  assert.equal(ps[0].updatedAt, '2026-10-23T10:00:00Z');
});

test('unvollstaendige API-Seiten und wiederholte Cursor brechen ab', async () => {
  await assert.rejects(katalogJsonl({ execute: async () => ({}) }), /keine products/);
  const p = produkt(); p.variants.pageInfo.hasNextPage = true;
  await assert.rejects(katalogJsonl({ execute: async () => seite([p]) }), /unvollstaendig/);
  await assert.rejects(katalogJsonl({ execute: async () => seite([], 'gleich') }), /Cursor/);
});

test('jede fehlende Vorher-ID braucht einen belegten Entnahmegrund, auch bei gleichbleibender Anzahl', () => {
  assert.throws(() => pruefeUmfang([], vorher), /Keine/);
  assert.throws(() => pruefeUmfang([['shopify_ZZ_1_12']], vorher), /fehlen/);
  assert.throws(() => pruefeUmfang([['shopify_ZZ_1_11'], ['shopify_ZZ_1_11']], vorher), /doppelte/);
  assert.doesNotThrow(() => pruefeUmfang([['shopify_ZZ_1_11'], ['shopify_ZZ_1_12']], vorher));
  assert.doesNotThrow(() => pruefeUmfang([['shopify_ZZ_1_12']], vorher, [{ variantId: 'gid://shopify/ProductVariant/11', status: 'ARCHIVED' }]));
});

test('Meta bleibt zwoelfspaltiger Vollkatalog mit unveraenderten IDs, Bild, Zustand und Beispiel-Endpreis', () => {
  const a = angebot(); a.availability = 'out_of_stock';
  const rows = metaZeilen([a]);
  const m = Object.fromEntries(META_KOPF.map((k, i) => [k, rows[0][i]]));
  assert.deepEqual(META_KOPF, ['id', 'item_group_id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'link', 'image_link', 'brand', 'color']);
  assert.equal(m.id, '11'); assert.equal(m.item_group_id, '1');
  assert.equal(m.price, '189.40 EUR'); assert.equal(m.sale_price, '');
  assert.equal(m.availability, 'out of stock'); assert.equal(m.condition, 'new');
  assert.equal(m.image_link, 'https://cdn/p.jpg'); assert.equal(m.brand, 'Teppich Paradies');
  assert.equal(m.color, 'Sand'); assert.match(m.description, /Beispielgroesse/);
  assert.match(m.link, /breite=80&laenge=150/);
  assert.equal(metaDatei(rows).split('\n')[0], META_KOPF.join('\t'));
  assert.equal(datei([['id']]).split('\n')[0], 'id\ttitle\tprice\tsale_price\tlink\tunit_pricing_measure\tunit_pricing_base_measure\tfree_shipping_threshold\tavailability');
});

test('Endpreis- und Meta-Datei kommen aus einem geprueften Snapshot; Aktionsende leert sale_price', async () => {
  const proxy = { execute: async () => seite([produkt()]) };
  const r = await vorbereiten({ proxy, vorher, metaVorher, erzeugen: async () => erzeugt() });
  assert.match(r.google, /189\.40 EUR\t\thttps/);
  assert.match(r.meta, /189\.40 EUR\t\thttps/);
  assert.equal(r.pruefung.entnahmen.length, 0);
  assert.equal(r.pruefung.vorherGoogle, 1);
  assert.match(r.pruefung.katalogHash, /^[a-f0-9]{64}$/);
});

test('eine ungueltige/fehlende Zeile verhindert die gesamte Vorbereitung', async () => {
  const proxy = { execute: async () => seite([produkt()]) };
  await assert.rejects(vorbereiten({ proxy, vorher, metaVorher, erzeugen: async () => ({ zeilen: [], pruefung: { varianten: 1, ausgelassen: [{ grund: 'stale' }] } }) }), /keine Feeddatei ersetzt/);
});

test('Katalogaenderung waehrend des Abrufs wird erkannt', async () => {
  let calls = 0;
  const proxy = { execute: async () => { const p = produkt(); if (calls++) p.updatedAt = '2026-10-23T10:01:00Z'; return seite([p]); } };
  await assert.rejects(vorbereiten({ proxy, vorher, metaVorher, erzeugen: async () => erzeugt() }), /waehrend der Erzeugung/);
  const a = await katalogJsonl({ execute: async () => seite([produkt()]) });
  assert.equal(katalogHash(a), katalogHash(a.split('\n').reverse().join('\n')));
});

test('archivierte, Entwurfs-, geloeschte und umklassifizierte Varianten duerfen dokumentiert entfallen', async () => {
  const ids = [1, 2, 3, 4].map((id) => `gid://shopify/ProductVariant/${id}`);
  const nodes = ids.map((id, i) => i === 2 ? null : ({ id, product: { id: 'gid://shopify/Product/1', status: i === 0 ? 'ARCHIVED' : i === 1 ? 'DRAFT' : 'ACTIVE', productType: i === 3 ? 'Teppichboden' : 'Teppich nach Maß' } }));
  const r = await verifizierteEntnahmen({ execute: async () => ({ nodes }) }, ids);
  assert.deepEqual(r.map((e) => e.status), ['ARCHIVED', 'DRAFT', 'DELETED', 'NOT_TNM']);
  await assert.rejects(verifizierteEntnahmen({ execute: async () => ({ nodes: [{ id: ids[0], product: { status: 'ACTIVE', productType: 'Teppich nach Maß' } }] }) }, [ids[0]]), /aktiver Teppich/);
  await assert.rejects(verifizierteEntnahmen({ execute: async () => ({ nodes: [] }) }, [ids[0]]), /unvollstaendige/);
});

test('belegte Entnahme verhindert keinen spaeteren erfolgreichen Tageslauf', async () => {
  const previous = `${vorher}shopify_ZZ_1_12\t85.00 EUR\n`;
  const previousMeta = `${metaVorher}12\t1\n`;
  const proxy = { execute: async (q, v) => q.includes('TnmEntnahmen') ? { nodes: v.ids.map((id) => ({ id, product: { id: 'gid://shopify/Product/1', status: 'ARCHIVED', productType: 'Teppich nach Maß' } })) } : seite([produkt()]) };
  const r = await vorbereiten({ proxy, vorher: previous, metaVorher: previousMeta, erzeugen: async () => erzeugt() });
  assert.equal(r.pruefung.entnahmen.length, 1);
  assert.equal(r.pruefung.entnahmen[0].variantId, 'gid://shopify/ProductVariant/12');
});

test('veralteter m2-CLI kann keine produktive Endpreisdatei ueberschreiben', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tp-feed-test-'));
  const out = path.join(dir, 'tp-tnm-preise.txt');
  try {
    writeFileSync(out, 'bekannter Endpreis');
    const r = spawnSync(process.execPath, ['operations/scripts/feed-titel.mjs', '--tnm-aus', out], { encoding: 'utf8' });
    assert.equal(r.status, 2); assert.match(r.stderr, /deaktiviert/);
    assert.equal(readFileSync(out, 'utf8'), 'bekannter Endpreis');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('der eine bestehende Workflow nutzt Proxy-Entry und veroeffentlicht beide Quellen samt Manifest', () => {
  const yml = readFileSync(new URL('../../.github/workflows/feed-tnm-preise.yml', import.meta.url), 'utf8');
  assert.match(yml, /shopify-oauth\.mjs --grant client-credentials/);
  assert.match(yml, /node operations\/scripts\/feed-tnm-abruf\.mjs.*--pruefung tp-tnm-pruefung\.json/);
  assert.match(yml, /git add tp-tnm-preise\.txt tp-tnm-meta\.tsv tp-tnm-pruefung\.json/);
  assert.doesNotMatch(yml, /shopify store execute|tnmPreisZeilen|erster Lauf/);
});
