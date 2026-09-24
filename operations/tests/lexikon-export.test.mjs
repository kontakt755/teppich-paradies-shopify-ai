import test from 'node:test';
import assert from 'node:assert/strict';
import {
  argumente, jsonlZuProdukten, sammleMetaobjectGids, resolveMetaobjectReferenzen, loeseMetaobjekteAuf, STANDARD_ZIEL,
} from '../scripts/lexikon-export.mjs';

test('argumente: --jsonl ist ein gueltiger Weg neben --input/--live, --metaobjekte optional', () => {
  assert.deepEqual(argumente(['--jsonl', 'bulk.jsonl']), {
    input: null, ziel: STANDARD_ZIEL, live: false, jsonl: 'bulk.jsonl', metaobjekte: null, hilfe: false,
  });
  const mit = argumente(['--jsonl', 'bulk.jsonl', '--metaobjekte', 'gids.json', '--ziel', 'x.json']);
  assert.equal(mit.jsonl, 'bulk.jsonl');
  assert.equal(mit.metaobjekte, 'gids.json');
  assert.equal(mit.ziel, 'x.json');
  assert.throws(() => argumente([]), /--input.*--live.*--jsonl/);
});

test('sammleMetaobjectGids findet Referenzen aus custom.* und einkauf.lieferant, ignoriert andere Namespaces', () => {
  const produkte = [
    {
      id: 'gid://shopify/Product/1', handle: 'a', variants: [],
      metafields: [
        { namespace: 'custom', key: 'zimmer', value: '["gid://shopify/Metaobject/1","gid://shopify/Metaobject/2"]', type: 'list.metaobject_reference' },
        { namespace: 'custom', key: 'fusbodenheizung', value: 'gid://shopify/Metaobject/3', type: 'metaobject_reference' },
        { namespace: 'custom', key: 'material', value: 'Wolle', type: 'single_line_text_field' },
        { namespace: 'einkauf', key: 'lieferant', value: 'gid://shopify/Metaobject/99', type: 'metaobject_reference' },
        { namespace: 'einkauf', key: 'artikelnummer', value: '123456', type: 'single_line_text_field' },
        { namespace: 'ops', key: 'irgendwas', value: 'gid://shopify/Metaobject/77', type: 'metaobject_reference' },
      ],
    },
    {
      id: 'gid://shopify/Product/2', handle: 'b',
      metafields: [],
      variants: [{ id: 'gid://shopify/ProductVariant/1', metafields: [
        { namespace: 'custom', key: 'zimmer', value: '["gid://shopify/Metaobject/2"]', type: 'list.metaobject_reference' },
      ] }],
    },
  ];
  const gids = sammleMetaobjectGids(produkte);
  assert.deepEqual([...gids].sort(), [
    'gid://shopify/Metaobject/1', 'gid://shopify/Metaobject/2', 'gid://shopify/Metaobject/3',
    'gid://shopify/Metaobject/99',
  ]);
});

test('resolveMetaobjectReferenzen ersetzt GIDs durch Anzeigenamen, laesst Unaufloesbares weg statt die ID zu zeigen', () => {
  const produkte = [{
    id: 'gid://shopify/Product/1', handle: 'a', variants: [],
    metafields: [
      { namespace: 'custom', key: 'zimmer', value: '["gid://shopify/Metaobject/1","gid://shopify/Metaobject/2","gid://shopify/Metaobject/404"]', type: 'list.metaobject_reference' },
      { namespace: 'custom', key: 'fusbodenheizung', value: 'gid://shopify/Metaobject/3', type: 'metaobject_reference' },
      { namespace: 'custom', key: 'nichtaufloesbar', value: 'gid://shopify/Metaobject/999', type: 'metaobject_reference' },
      { namespace: 'custom', key: 'material', value: 'Wolle', type: 'single_line_text_field' },
    ],
  }];
  const gidZuName = new Map([
    ['gid://shopify/Metaobject/1', 'Wohnzimmer'],
    ['gid://shopify/Metaobject/2', 'Schlafzimmer'],
    ['gid://shopify/Metaobject/3', 'Ja'],
  ]);
  resolveMetaobjectReferenzen(produkte, gidZuName);
  const custom = Object.fromEntries(produkte[0].metafields.map((mf) => [mf.key, mf.value]));
  assert.deepEqual(custom.zimmer, ['Wohnzimmer', 'Schlafzimmer'], '404 nicht aufloesbar - faellt aus der Liste, wird nicht als ID gezeigt');
  assert.equal(custom.fusbodenheizung, 'Ja');
  assert.equal(custom.nichtaufloesbar, null, 'komplett unaufloesbare Einzelreferenz wird null, nie die rohe ID');
  assert.equal(custom.material, 'Wolle', 'Text-Metafelder bleiben unangetastet');
});

test('loeseMetaobjekteAuf fragt in Batches ab und baut eine gid->Anzeigename-Map', async () => {
  const aufrufe = [];
  const execute = async (query, variables) => {
    aufrufe.push(variables.ids);
    return { nodes: variables.ids.map((id) => ({ id, displayName: `Name-${id.split('/').pop()}` })) };
  };
  const gids = Array.from({ length: 5 }, (_, i) => `gid://shopify/Metaobject/${i}`);
  const map = await loeseMetaobjekteAuf(execute, gids, { batchSize: 2 });
  assert.equal(aufrufe.length, 3, 'fuenf GIDs in Batches von zwei -> drei Aufrufe');
  assert.equal(map.get('gid://shopify/Metaobject/3'), 'Name-3');
  assert.equal(map.size, 5);
});

test('jsonlZuProdukten: Produkt, Variante, Metafeld mit einzeln aufgeloester Referenz (unveraendert)', () => {
  const zeilen = [
    { id: 'gid://shopify/Product/1', handle: 'a', title: 'A' },
    { id: 'gid://shopify/ProductVariant/1', __parentId: 'gid://shopify/Product/1', title: 'Default', sku: 'X-1' },
    {
      namespace: 'einkauf', key: 'muster_variante', value: 'gid://shopify/ProductVariant/9', type: 'variant_reference',
      __parentId: 'gid://shopify/ProductVariant/1',
      reference: { id: 'gid://shopify/ProductVariant/9', product: { handle: 'muster-a' } },
    },
  ];
  const { produkte } = jsonlZuProdukten(zeilen.map((z) => JSON.stringify(z)).join('\n'));
  assert.equal(produkte.length, 1);
  assert.equal(produkte[0].variants.length, 1);
  const mf = produkte[0].variants[0].metafields[0];
  assert.equal(mf.namespace, 'einkauf');
  assert.equal(mf.key, 'muster_variante');
  assert.deepEqual(mf.value, { id: 'gid://shopify/ProductVariant/9', product: { handle: 'muster-a' } });
});

test('jsonlZuProdukten behaelt das Metafeld-"type" (sammleMetaobjectGids/resolveMetaobjectReferenzen brauchen es)', () => {
  const zeilen = [
    { id: 'gid://shopify/Product/1', handle: 'a', title: 'A' },
    {
      namespace: 'custom', key: 'zimmer', value: '["gid://shopify/Metaobject/1"]', type: 'list.metaobject_reference',
      __parentId: 'gid://shopify/Product/1',
    },
  ];
  const { produkte } = jsonlZuProdukten(zeilen.map((z) => JSON.stringify(z)).join('\n'));
  assert.equal(produkte[0].metafields[0].type, 'list.metaobject_reference');
  assert.deepEqual(sammleMetaobjectGids(produkte), ['gid://shopify/Metaobject/1']);
});

test('Metaobjekt-Namen werden auch beim MCP-Weg (--input) aufgeloest', async () => {
  const { resolveMetaobjectReferenzen, standardMetaobjektDatei } = await import('../scripts/lexikon-export.mjs');
  assert.equal(standardMetaobjektDatei('/tmp/lexikon/produkte.json'), '/tmp/lexikon/metaobjekte.json');
  const produkte = [{
    handle: 'muster-produkt',
    metafields: [{ namespace: 'custom', key: 'zimmer', type: 'list.metaobject_reference', value: '["gid://shopify/Metaobject/1","gid://shopify/Metaobject/2"]' }],
    variants: [],
  }];
  resolveMetaobjectReferenzen(produkte, new Map([
    ['gid://shopify/Metaobject/1', 'Wohnzimmer'],
    ['gid://shopify/Metaobject/2', 'Flur'],
  ]));
  assert.deepEqual(produkte[0].metafields[0].value, ['Wohnzimmer', 'Flur']);
});
