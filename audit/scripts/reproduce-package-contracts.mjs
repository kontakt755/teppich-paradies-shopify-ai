// S06 / PR-023b.1. Original package-data and price-view integration only.
// No replay of S01 invalid-input tests. No network, writes or real cart.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const strip = (s) => s.replace(/{%-?\s*(doc|schema|stylesheet|style)\s*-?%}[\s\S]*?{%-?\s*end\1\s*-?%}/g, '');
const clean = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const money = (c) => (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function makeEngine(integerDivision = false) {
  const engine = new Liquid({ relativeReference: false, fs: {
    resolve: (_, name) => path.join(root, 'snippets', name + '.liquid'),
    exists: async (p) => existsSync(p), existsSync,
    readFile: async (p) => strip(readFileSync(p, 'utf8')),
    readFileSync: (p) => strip(readFileSync(p, 'utf8')), contains: () => true,
  } });
  engine.registerFilter('money_without_currency', (v) => money(Number(v)));
  engine.registerFilter('money', (v) => money(Number(v)) + ' €');
  engine.registerFilter('money_with_currency', (v) => money(Number(v)) + ' EUR');
  engine.registerFilter('t', (v) => v);
  // Cart snippet has only divided_by:100 with an integer-rounded dividend.
  // LiquidJS defaults to JS float division. Shopify's integer division is
  // explicitly modeled here, only in this separate engine, without editing source.
  if (integerDivision) engine.registerFilter('divided_by', (a, b) => Math.floor(Number(a) / Number(b)));
  return engine;
}
const engine = makeEngine(), cartEngine = makeEngine(true);
const render = (file, ctx, eng = engine) => eng.parseAndRender(strip(read(file)), ctx);
const val = (value) => ({ value });
function product(o = {}) {
  const custom = { qm_pro_paket: val(o.sqm ?? null), stueck_pro_paket: val(o.pieces ?? null),
    stueck_bezeichnung: val(o.label ?? null), format_cm: val(o.format ?? null),
    rollenbreite: val(o.rollWidth ?? null), stangenlaenge: val(o.barLength ?? null) };
  const variants = o.variants ?? [{ id: 'audit-package-a', title: o.title ?? 'Default', price: o.price ?? 10337,
    compare_at_price: o.compare ?? null, available: true, metafields: { custom: {} } }];
  return { id: 'audit-product', handle: 'synthetic-package', type: o.type ?? 'Klebevinyl', tags: o.tags ?? [],
    variants, selected_or_first_available_variant: variants[0], price_min: Math.min(...variants.map(v => v.price)),
    price_max: Math.max(...variants.map(v => v.price)), metafields: { custom } };
}
class Element {
  constructor() { this.value = ''; this.textContent = ''; this.hidden = false; this.checked = false;
    this.disabled = false; this.listeners = new Map(); this.attributes = new Map(); }
  addEventListener(t, fn) { this.listeners.set(t, fn); }
  emit(t, ev = {}) { this.listeners.get(t)?.(ev); }
  setAttribute(k, v) { this.attributes.set(k, v); }
  removeAttribute(k) { this.attributes.delete(k); }
}
const observations = [];
async function packageCase(name, o, input, waste = true, update = null) {
  const p = product(o), block = { id: 'audit_package', settings: {} };
  const html = await render('blocks/paket-auswahl.liquid', { product: p, block });
  const art = clean(await render('snippets/tp-verkaufseinheit.liquid', { product: p }));
  const hasBlock = html.includes('<carpet-package-selector-');
  if (!(o.sqm > 0)) {
    assert.equal(hasBlock, false); observations.push({ name, kind: 'gate', art, hasBlock }); return;
  }
  assert.equal(art, 'paket'); assert.ok(hasBlock);
  assert.equal(html.slice(0, html.indexOf('<script>')).includes('data-pieces-line'), !!o.pieces,
    name + ': rendered piece line follows actual metadata');
  const el = new Element();
  el.dataset = Object.fromEntries([...html.matchAll(/data-([a-z-]+)="([^"]*)"/g)]
    .map(([, k, v]) => [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]));
  const selectors = ['sqm-input', 'need-label', 'need-display', 'sqm-display', 'package-display',
    'package-word', 'unit-hint', 'pieces-line', 'total-display', 'waste-checkbox', 'add-to-cart', 'cart-message'];
  const nodes = Object.fromEntries(selectors.map(s => ['[data-' + s + ']', new Element()]));
  if (!o.pieces) nodes['[data-pieces-line]'] = null;
  nodes['[data-waste-checkbox]'].checked = waste;
  el.querySelector = (s) => { assert.ok(s in nodes, s); return nodes[s]; };
  const section = new Element(); el.closest = () => section;
  const requests = [], events = [];
  const doc = { querySelector(s) {
    if (s === 'carpet-package-selector-auditpackage') return el;
    if (s === 'cart-drawer-component') return null;
    throw new Error('Unmodeled selector: ' + s);
  }, dispatchEvent(ev) { events.push(ev); } };
  const js = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(js, { document: doc, window: { location: {} }, setTimeout() {},
    CustomEvent: class { constructor(type, init) { Object.assign(this, { type, ...init }); } },
    fetch: async (url, init) => {
      assert.equal(url, '/cart/add.js'); requests.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({}) };
    },
  }, { filename: 'blocks/paket-auswahl.liquid' });
  const field = nodes['[data-sqm-input]']; field.value = input; field.emit('input'); field.emit('blur');
  if (update) section.emit('variant:update', { detail: update });
  const displays = { total: nodes['[data-total-display]'].textContent, area: nodes['[data-sqm-display]'].textContent,
    pieces: nodes['[data-pieces-line]']?.textContent ?? null };
  el.emit('click', { target: { closest: (s) => s === '[data-add-to-cart]' ? nodes[s] : null },
    preventDefault() {}, stopPropagation() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 1); const payload = requests[0];
  const areaMilli = Math.round(o.sqm * 1000), needCenti = Math.round(Number(input.replace(',', '.')) * 100);
  const numerator = BigInt(needCenti) * BigInt(waste ? 105 : 100);
  const denominator = BigInt(areaMilli) * 10n;
  const units = Number((numerator + denominator - 1n) / denominator);
  assert.equal(payload.quantity, Math.max(1, units));
  const applicableUpdate = update && update.data.productId === p.id ? update.resource : null;
  const price = applicableUpdate?.price ?? p.selected_or_first_available_variant.price;
  assert.equal(payload.id, applicableUpdate?.id ?? p.selected_or_first_available_variant.id);
  assert.equal(displays.total, money(payload.quantity * price) + ' €');
  assert.equal(events[0].data?.itemCount ?? events[0].detail.data.itemCount, payload.quantity);
  const decimals = Math.min(3, Math.max(2, (String(o.sqm).split('.')[1] || '').length));
  const area = areaMilli * payload.quantity / 1000;
  const exactText = area.toFixed(decimals).replace('.', ',');
  assert.equal(payload.properties._qm_gesamt, exactText);
  assert.equal(displays.area, exactText + ' m²');
  if (o.pieces) assert.ok(displays.pieces.startsWith(String(o.pieces * payload.quantity) + ' '));

  const pdp = clean(await render('snippets/tp-price-per-sqm.liquid', {
    selected_variant: p.selected_or_first_available_variant, sqm_per_package: o.sqm, product: p,
  }));
  const expectedSqmCents = Math.round(p.selected_or_first_available_variant.price / o.sqm);
  assert.ok(pdp.includes(money(expectedSqmCents) + ' €/m²'));
  const views = {};
  for (const surface of ['collection', 'product']) {
    const text = clean(await render('snippets/price.liquid', {
      product_resource: p, product: p, template: { name: surface }, settings: {},
    }));
    assert.ok(text.includes(money(expectedSqmCents)), name + ' ' + surface);
    assert.ok(text.includes('€/m²')); views[surface] = text;
  }
  // Preserve the real payload. Cart display is independently recomputed from
  // current line quantity, including a second render with a changed quantity.
  const cartViews = [];
  for (const quantity of [payload.quantity, payload.quantity + 1]) {
    const line = { product: p, quantity, properties: payload.properties };
    const text = clean(await render('snippets/tp-cart-paketzeile.liquid', { line_item: line }, cartEngine));
    const exactMilli = areaMilli * quantity;
    const shown = text.match(/Gesamtfläche: ([\d,]+) m²/)[1];
    const shownMilli = Math.round(Number(shown.replace(',', '.')) * 1000);
    assert.equal(shownMilli, Math.round(exactMilli / 10) * 10);
    assert.ok(text.includes(quantity + ' Originalpaket'));
    if (o.pieces) assert.ok(text.includes(o.pieces * quantity + ' ' + o.label));
    cartViews.push({ quantity, text, exactAreaMilli: exactMilli, displayedAreaMilli: shownMilli,
      precisionLostMilli: exactMilli - shownMilli });
  }
  observations.push({ name, kind: 'package', fixture: o, input, waste, renderedDataset: el.dataset,
    art, payload, cents: payload.quantity * price, displays, pdp, views, cartViews,
    disclaimer: 'Fixture data; no current Shopify product, browser or cart response verified.' });
}

const quadra = { sqm: 5, price: 29450, type: 'Teppichboden', pieces: 20, label: 'Fliesen', format: '50 × 50 cm' };
const klebe = { sqm: 3.34, price: 10337, type: 'Klebevinyl' }; // Synthetic pair; NOT claimed as current Alvora data.
await packageCase('missing package metafield', { type: 'Zubehör' }, '1');
await packageCase('zero package metafield', { sqm: 0, type: 'Zubehör' }, '1');
await packageCase('negative package metafield', { sqm: -1, type: 'Zubehör' }, '1');
await packageCase('Quadra historical price contract no waste', quadra, '20', false);
await packageCase('Quadra 5 percent reserve', quadra, '20');
await packageCase('Quadra subpackage requirement', quadra, '0,25');
await packageCase('package precedence over contradictory roll field', { ...quadra, rollWidth: 4 }, '20', false);
await packageCase('package compare-at price', { ...quadra, compare: 35000 }, '20', false);
await packageCase('Klebe synthetic 6 packages 20.04 sqm', klebe, '19');
await packageCase('Klebe synthetic next package', klebe, '20');
await packageCase('Klebe missing content fields remain absent', { ...klebe, pieces: 0 }, '19');
await packageCase('Klebe synthetic pieces fixture', { ...klebe, pieces: 10, label: 'Planken', format: '100 × 33,4 cm' }, '19');
await packageCase('three decimals 0.794 single package', { sqm: 0.794, price: 4125 }, '0,75');
await packageCase('three decimals 0.794 two packages', { sqm: 0.794, price: 4125 }, '1,5');
await packageCase('three decimals 1.892 sixteen packages', { sqm: 1.892, price: 9829 }, '28');
await packageCase('variant event changes price and ID', quadra, '20', false,
  { data: { productId: 'audit-product' }, resource: { id: 'audit-package-b', price: 29950 } });
await packageCase('other product variant event ignored', quadra, '20', false,
  { data: { productId: 'audit-unrelated' }, resource: { id: 'audit-package-unrelated', price: 100 } });

// Read-only mapping, not a PVC or fixed-price calculator/submit test.
const unitContracts = [];
for (const [name, fixture, expected] of [
  ['PVC variant width', { type: 'Vinyl von der Rolle', variants: [{ id: 'audit-pvc', title: '2,00 m', price: 2490,
    metafields: { custom: { rollenbreite: val(2) } } }] }, 'rolle'],
  ['fixed bar product', { type: 'Sockelleisten', barLength: 2.5 }, 'stueck'],
  ['plain item', { type: 'Reinigungsmittel' }, 'einzel'],
]) {
  const actual = clean(await render('snippets/tp-verkaufseinheit.liquid', { product: product(fixture) }));
  assert.equal(actual, expected); unitContracts.push({ name, actual });
}
const templateMapping = [];
for (const file of ['product.planken.json', 'product.fliese.json', 'product.rolle.json', 'product.fixpreis.json', 'product.zubehoer.json']) {
  const json = JSON.parse(read('templates/' + file).replace(/^\/\*[\s\S]*?\*\//, '').trim());
  const blocks = [];
  function walk(node, inheritedDisabled = false) {
    if (!node || typeof node !== 'object') return;
    const disabled = inheritedDisabled || node.disabled === true;
    if (['paket-auswahl', 'tp-rollware-rechner', 'tp-zubehoer-menge', 'buy-buttons'].includes(node.type)) blocks.push({ type: node.type, disabled });
    for (const child of Object.values(node)) if (typeof child === 'object') walk(child, disabled);
  }
  walk(json); templateMapping.push({ file, blocks });
  if (file.includes('planken') || file.includes('fliese')) {
    assert.ok(blocks.some(b => b.type === 'paket-auswahl' && !b.disabled));
    assert.ok(blocks.filter(b => b.type === 'buy-buttons').every(b => b.disabled));
  }
}
const manifest = JSON.parse(read('audit/evidence/source-manifest.json'));
const files = ['blocks/paket-auswahl.liquid', 'snippets/tp-verkaufseinheit.liquid', 'snippets/tp-price-per-sqm.liquid',
  'snippets/tp-paketinhalt.liquid', 'snippets/price.liquid', 'snippets/tp-cart-paketzeile.liquid',
  ...templateMapping.map(m => 'templates/' + m.file)];
const sourceIntegrity = files.map(file => {
  const sha256 = createHash('sha256').update(read(file)).digest('hex');
  assert.equal(sha256, manifest.files[file].live.sha256, file);
  return { file, sha256, historicalLiveMatch: true };
});
const report = { date: '2026-09-20', scope: 'PR-023b.1', reproductionStatus: 'PASS',
  caseCount: observations.length, interceptedRequests: observations.filter(o => o.payload).length,
  localCartRenders: observations.reduce((n, o) => n + (o.cartViews?.length ?? 0), 0),
  sourceIntegrity, templateMapping, unitContracts, observations,
  limitations: ['Synthetic IDs and data; Quadra reference contract is documented historically, not freshly verified.',
    'LiquidJS plus documented Shopify-money and integer-division adapters; original source files unchanged.',
    'Minimal DOM, full original package script; no real browser input, layout, drawer, checkout or server response.',
    'PVC/fixed-price mapped only. Their payload integration is PR-023b.2, still open.',
    'S01 input defects and completed price grids were not replayed. PASS is diagnosis, not fix QA.'] };
writeFileSync(path.join(root, 'audit/evidence/package-contracts-2026-09-20.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.reproductionStatus, cases: report.caseCount,
  requests: report.interceptedRequests, cartRenders: report.localCartRenders, hashes: sourceIntegrity.length }));
