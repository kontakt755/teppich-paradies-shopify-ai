import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planeRestEntwuerfe, bindeRestPlan, privaterAusgabeordner, REST_ENTWURF_TAG } from '../../operations/lib/restposten-entwurf.mjs';
const locationId = 'gid://shopify/Location/1';
const row = (code = 'TPR0001', breite = 400) => ({
  tprBarcode: code, SumUpItemId: code, nameOriginal: 'Beispiel', colourCodeOriginal: '05',
  bekannteRollenbreiteCm: breite, ladenPreisQm: 29.95, onlineMaterialPreisQm: 34.95,
  tatsaechlicheRestlaengeM: null, tatsaechlicheNutzbreiteCm: null, stueckzahlPhysisch: null,
});
test('Neue Entwuerfe sind gesperrt, ohne erfundene Masse, Fotos, Hersteller und Freigaben', () => {
  const plan = planeRestEntwuerfe({ records: [row()] }, { locationId });
  assert.equal(plan.products.length, 4);
  assert.ok(plan.products.every(p => p.input.status === 'DRAFT'));
  assert.ok(plan.products.flatMap(p => p.input.variants).every(v => v.inventoryPolicy === 'DENY'));
  assert.equal(plan.products[0].input.vendor, '');
  assert.equal(plan.products[0].input.variants[0].inventoryQuantities[0].quantity, 0);
  assert.ok(!plan.metafields.some(m => m.key === 'einfassen'));
  assert.ok(plan.metafields.filter(m => m.key.startsWith('max_')).every(m => m.value === '0'));
  assert.ok(!plan.products.some(p => p.input.files || p.input.compareAtPrice));
});
test('Materialpreis bleibt centgenau, Wunschmasspreis nutzt delegierte volle Euro', () => {
  const plan = planeRestEntwuerfe({ records: [row()] }, { locationId });
  assert.equal(plan.products[0].input.variants[0].price, '34.95');
  assert.equal(plan.products.find(p => p.role === 'raummass').input.variants[0].price, '0.47');
  assert.equal(plan.preise[0].wunschmassQm, '47.00');
  assert.ok(plan.products.find(p => p.role === 'zuschnitt').input.variants.every(v => v.price === '0.47'));
});
test('Vier- und Fuenfmeterquellen bleiben separat, jedes Raster hat exakte m²-Komponenten', () => {
  const plan = planeRestEntwuerfe({ records: [row(), row('TPR0002', 500)] }, { locationId });
  assert.equal(plan.relationships.length, 90);
  assert.equal(plan.relationships.find(r => r.component === 'tpr0001:quelle').title, '25 cm');
  assert.equal(plan.relationships.find(r => r.component === 'tpr0002:quelle').title, '20 cm');
  assert.ok(plan.relationships.every(r => Number.isInteger(r.quantity) && r.quantity >= 1));
  assert.equal(plan.metafields.filter(m => m.key === 'rollenzuschnitt_richtung' && m.value === 'laengs').length, 4);
});
test('Fehlende/mehrdeutige Kennungen, Preisabweichungen und echte Bestandsdaten werden abgewiesen', () => {
  for (const records of [[row(), row()], [{ ...row(), onlineMaterialPreisQm: 35 }], [{ ...row(), stueckzahlPhysisch: 1 }], [{ ...row(), tatsaechlicheRestlaengeM: 12 }]]) {
    assert.throws(() => planeRestEntwuerfe({ records }, { locationId }));
  }
});
test('Verknuepfen erfordert frische, vollstaendige, unveroeffentlichte Drafts ohne Bestand', () => {
  const plan = planeRestEntwuerfe({ records: [row()] }, { locationId });
  let counter = 100;
  const live = plan.products.map(p => ({
    id: `gid://shopify/Product/${counter++}`, handle: p.input.handle, status: 'DRAFT', tags: [REST_ENTWURF_TAG],
    variants: p.input.variants.map(v => ({ id: `gid://shopify/ProductVariant/${counter++}`, title: v.optionValues[0].name, inventoryQuantity: 0, inventoryPolicy: 'DENY', price: v.price, inventoryItem: { tracked: v.inventoryItem.tracked }, requiresComponents: Boolean(v.requiresComponents) })),
  }));
  const bound = bindeRestPlan(plan, live);
  assert.equal(bound.relationships.length, 40);
  assert.ok(bound.metafields.every(m => m.compareDigest === null));
  assert.ok(bound.metafields.filter(m => m.key === 'basisvariante').every(m => m.value === live[0].variants[0].id));
  const refs = new Map(live.flatMap(p => [[p.id, p], ...p.variants.map(v => [v.id, v])]));
  for (const m of bound.metafields) {
    const own = refs.get(m.ownerId);
    own.metafields ??= { nodes: [] };
    own.metafields.nodes.push({ namespace: m.namespace, key: m.key, value: m.value, type: m.type });
  }
  for (const r of bound.relationships) {
    const variant = refs.get(r.parentProductVariantId);
    variant.price = r.priceInput.price;
    variant.productVariantComponents = { nodes: [{ quantity: r.productVariantRelationshipsToCreate[0].quantity, productVariant: { id: r.productVariantRelationshipsToCreate[0].id } }] };
  }
  const second = bindeRestPlan(plan, live);
  assert.equal(second.metafields.length, 0);
  assert.equal(second.relationships.length, 0);
  assert.equal(second.expectedMetafields.length, bound.metafields.length);
  assert.throws(() => bindeRestPlan(plan, live.slice(1)));
  assert.throws(() => bindeRestPlan(plan, live.map((p, i) => i ? p : { ...p, status: 'ACTIVE' })));
  assert.throws(() => bindeRestPlan(plan, live.map((p, i) => i ? p : { ...p, publishedAt: '2026-01-01' })));
  assert.throws(() => bindeRestPlan(plan, live.map((p, i) => i ? p : { ...p, variants: p.variants.map(v => ({ ...v, inventoryQuantity: 1 })) })));
  for (const inventoryQuantity of [undefined, null, '0', false, NaN]) {
    assert.throws(() => bindeRestPlan(plan, live.map((p, i) => i ? p : { ...p, variants: p.variants.map(v => ({ ...v, inventoryQuantity })) })), /Bestand 0 ist nicht bestaetigt/);
  }
  assert.throws(() => bindeRestPlan(plan, [...live, live[0]]));
});
test('Private Ausgaben sperren Repository-Root, Unterordner und Symlinks hinein', () => {
  const temp = mkdtempSync(join(tmpdir(), 'rest-plan-'));
  try {
    const repo = join(temp, 'repo');
    const ausserhalb = join(temp, 'repo-privat');
    mkdirSync(repo); mkdirSync(ausserhalb);
    symlinkSync(repo, join(temp, 'link-ins-repo'), 'dir');
    assert.throws(() => privaterAusgabeordner(repo, repo), /ausserhalb/);
    assert.throws(() => privaterAusgabeordner(join(repo, 'neu', 'plan'), repo), /ausserhalb/);
    assert.throws(() => privaterAusgabeordner(join(temp, 'link-ins-repo', 'neu'), repo), /ausserhalb/);
    assert.equal(privaterAusgabeordner(join(ausserhalb, 'neu'), repo), join(realpathSync(ausserhalb), 'neu'));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
