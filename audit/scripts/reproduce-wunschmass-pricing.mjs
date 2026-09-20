// PR-023a: original dormant Wunschmass block, local fixtures only. No network.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const sourceFile = 'blocks/tp-teppich-wunschmass.liquid';
const source = read(sourceFile);
const mailFile = 'domains/shopify/benachrichtigungen/interne-bestellmail-block.liquid';
const engine = new Liquid({ relativeReference: false });
engine.registerFilter('json', (v) => JSON.stringify(v ?? null));
// Only Shopify metadata tags are removed; complete HTML, Liquid gates and JS remain.
const template = source.replace(/{% doc %}[\s\S]*?{% enddoc %}/g, '')
  .replace(/{% schema %}[\s\S]*?{% endschema %}/g, '');
const defaults = { shape: 'rechteck', minW: 50, maxW: 400, minL: 50, maxL: 600,
  minArea: 0, minimum: 0, surcharge: 0, price: 89, available: true, width: '200', length: '300' };
const fields = { minW: 'mindestbreite_cm', maxW: 'maximalbreite_cm', minL: 'mindestlaenge_cm',
  maxL: 'maximallaenge_cm', minArea: 'mindestflaeche_qm', minimum: 'mindestpreis',
  surcharge: 'fertigungszuschlag', shape: 'form' };
function fixture(o) {
  const variants = [
    { id: 'audit-wm-a', price: o.price, available: o.available },
    { id: 'audit-wm-b', price: 101, available: true },
    { id: 'audit-wm-unavailable', price: 89, available: false },
  ];
  return { block: { id: 'audit_wm', settings: {
    hide_price_block_id: 'audit_price', hide_buybuttons_block_id: 'audit_buy',
  } }, product: { variants, selected_or_first_available_variant: variants[0], metafields: {
    custom: Object.fromEntries(Object.entries(fields).filter(([k]) => o[k] !== null)
      .map(([k, v]) => ['wunschmass_' + v, { value: o[k] }])),
  } } };
}
class Element {
  constructor(value = '') { this.value = value; this.textContent = ''; this.disabled = false;
    this.attrs = new Map(); this.listeners = new Map(); }
  setAttribute(k, v) { this.attrs.set(k, v); }
  removeAttribute(k) { this.attrs.delete(k); }
  addEventListener(k, fn) { this.listeners.set(k, fn); }
  emit(k) { this.listeners.get(k)?.({ preventDefault() {} }); }
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function mount(o) {
  const html = await engine.parseAndRender(template, fixture(o));
  if (!html.includes('<teppich-wunschmass-')) return { hidden: true };
  const dataset = Object.fromEntries([...html.matchAll(/data-([a-z-]+)="([^"]*)"/g)]
    .map(([, k, v]) => [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]));
  const nodes = Object.fromEntries(['variants', 'range-hint', 'area-display', 'price-display',
    'note', 'add-to-cart', 'cart-message'].map((s) => [`[data-${s}]`, new Element()]));
  nodes['[data-variants]'].textContent = html.match(/<script type="application\/json" data-variants>([\s\S]*?)<\/script>/)[1];
  const width = new Element(o.width), length = html.includes('data-input="length"') ? new Element(o.length) : null;
  nodes['[data-input="width"]'] = width; nodes['[data-input="length"]'] = length;
  const button = nodes['[data-add-to-cart]'];
  const form = o.formId === undefined ? null : new Element(o.formId);
  const component = { dataset, querySelector(s) { assert.ok(s in nodes, s); return nodes[s]; } };
  const documentEvents = new Map(), requests = [], pending = [], location = { href: '' };
  const document = { querySelector(s) {
    if (s === 'teppich-wunschmass-auditwm') return component;
    if (s === 'form[action*="/cart/add"] input[name="id"]') return form;
    if (s === '[data-active-color]') return { textContent: 'Auditfarbe' };
    throw new Error('Unmodeled selector ' + s);
  }, addEventListener(k, fn) { documentEvents.set(k, fn); } };
  const js = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  // No pricing/validation/submit replacements. Full rendered IIFE is executed.
  vm.runInNewContext(js, { document, window: { location }, fetch(url, init) {
    assert.equal(url, '/cart/add.js'); assert.equal(init.method, 'POST');
    requests.push(JSON.parse(init.body));
    return new Promise((resolve) => pending.push(resolve));
  } }, { filename: sourceFile });
  return { nodes, width, length, button, form, requests, pending, location, dataset,
    render() { width.emit('input'); },
    click() { if (!button.disabled) button.emit('click'); },
    async finish(ok = true) {
      pending.splice(0).forEach((resolve) => resolve({ ok, json: async () => ({ description: 'Synthetic rejection' }) }));
      await flush();
    },
    view() { return { area: nodes['[data-area-display]'].textContent, price: nodes['[data-price-display]'].textContent,
      note: nodes['[data-note]'].textContent, enabled: !button.disabled,
      message: nodes['[data-cart-message]'].textContent }; },
  };
}

const ceilDiv = (a, b) => (a + b - 1n) / b;
function expectedUnits(o, shape, price) {
  // Integer hundredths of a cm; independent of the block's floating cm->m conversion.
  const w = BigInt(Math.round(Number(o.width) * 100));
  const l = shape === 'quadrat' || shape === 'rund' ? w : BigInt(Math.round(Number(o.length) * 100));
  let areaUnits;
  if (shape === 'rund' || shape === 'oval') {
    // Certified tight pi bracket for these finite test dimensions (not copied Math.PI formula).
    const lo = ceilDiv(w * l * 3141592653589793n, 4000000000000000000000n);
    const hi = ceilDiv(w * l * 3141592653589794n, 4000000000000000000000n);
    assert.equal(lo, hi, 'pi interval must yield an unambiguous hundredth unit');
    areaUnits = lo;
  } else areaUnits = ceilDiv(w * l, 1000000n);
  const unit = BigInt(price);
  const surcharge = ceilDiv(BigInt(Math.round(o.surcharge * 100)), unit);
  const minimum = ceilDiv(BigInt(Math.round(o.minimum * 100)), unit);
  return Number(areaUnits + surcharge > minimum ? areaUnits + surcharge : minimum);
}
async function mailResult(payload) {
  const html = await engine.parseAndRender(read(mailFile), {
    name: '#AUDIT', line_items: [{ title: 'Synthetic Wunschmass', quantity: payload.quantity,
      properties: Object.entries(payload.properties), product: { metafields: { custom: { preis_pro_001_qm: true } } },
      variant: { metafields: {} }, sku: 'AUDIT' }],
  });
  return { tooSmall: html.includes('MENGE ZU KLEIN'), stop: html.includes('NICHT ZUSCHNEIDEN') };
}
const observations = [];
async function run(name, options = {}, expect = {}) {
  const o = { ...defaults, ...options }, m = await mount(o);
  if (expect.hidden) {
    assert.ok(m.hidden); observations.push({ name, hidden: true }); return;
  }
  assert.ok(!m.hidden);
  const before = m.view();
  m.click();
  const count = expect.requests ?? (expect.blocked ? 0 : 1);
  assert.equal(m.requests.length, count, name);
  if (expect.blocked) assert.equal(before.enabled, false, name);
  let mail = null, cents = null;
  if (count === 1) {
    const payload = m.requests[0], price = o.formId === 'audit-wm-b' ? 101 : o.price;
    if (expect.finite !== false) {
      assert.equal(payload.quantity, expectedUnits(o, m.dataset.shape, price), name + ' quantity');
      cents = payload.quantity * price;
      assert.equal(before.price, (cents / 100).toFixed(2).replace('.', ',') + ' €', name + ' price');
      mail = await mailResult(payload);
      if (expect.mailWarning !== undefined) assert.equal(mail.tooSmall, expect.mailWarning, name + ' mail');
    } else assert.equal(payload.quantity, null, 'nonfinite quantity serializes to null');
    if (expect.properties) for (const [k, v] of Object.entries(expect.properties)) assert.equal(payload.properties[k], v, name);
    if (expect.id) assert.equal(payload.id, expect.id);
  }
  await m.finish(expect.serverOK !== false);
  if (count && expect.serverOK !== false) assert.equal(m.location.href, '/cart');
  if (expect.serverOK === false) {
    assert.equal(m.view().message, 'Synthetic rejection'); assert.equal(m.button.disabled, false);
  }
  observations.push({ name, fixture: o, before, requests: m.requests, cents, mail, after: m.view() });
}

await run('gate missing', { minW: null }, { hidden: true });
await run('gate zero', { minW: 0 }, { hidden: true });
await run('gate negative', { minW: -1 }, { hidden: true });
await run('rectangle 200x300', {}, { mailWarning: false, properties: { Breite: '200 cm', Länge: '300 cm' } });
await run('square 150', { shape: 'quadrat', width: '150' }, { mailWarning: false });
await run('circle 200', { shape: 'rund' }, { mailWarning: false });
await run('ellipse 200x300', { shape: 'oval' }, { mailWarning: false });
await run('shape trimmed and normalized', { shape: ' OVAL ' }, { mailWarning: false });
await run('unknown shape falls back to rectangle', { shape: 'hexagon' }, { mailWarning: false });
await run('exact hundredth rectangle', { width: '250', length: '332' }, { mailWarning: false });
await run('round up hundredth rectangle', { width: '201', length: '301' }, { mailWarning: false });
await run('minimum 99 EUR', { width: '50', length: '50', minimum: 99 }, { mailWarning: false });
await run('surcharge 10 EUR rounds to units', { surcharge: 10 }, { mailWarning: false });
await run('minimum covers surcharge', { width: '50', length: '50', minimum: 99, surcharge: 10 }, { mailWarning: false });
await run('area plus surcharge exceeds minimum', { minimum: 99, surcharge: 10 }, { mailWarning: false });
await run('minimum area exact', { minArea: 6 }, { mailWarning: false });
await run('minimum area below', { minArea: 6.01 }, { blocked: true });
await run('circle actual area minimum', { shape: 'rund', minArea: 3.5 }, { blocked: true });
await run('width lower boundary', { width: '50' }, { mailWarning: false });
await run('width upper boundary', { width: '400' }, { mailWarning: false });
await run('width below boundary', { width: '49.99' }, { blocked: true });
await run('width above boundary', { width: '400.01' }, { blocked: true });
await run('length lower boundary', { length: '50' }, { mailWarning: false });
await run('length upper boundary', { length: '600' }, { mailWarning: false });
await run('length below boundary', { length: '49.99' }, { blocked: true });
await run('length above boundary', { length: '600.01' }, { blocked: true });
for (const width of ['', '0', '-1', 'NaN', '1e309']) await run('invalid width ' + JSON.stringify(width), { width }, { blocked: true });
await run('empty length', { length: '' }, { blocked: true });
await run('zero price', { price: 0 }, { blocked: true });
await run('missing upper bounds valid finite input', { maxW: null, maxL: null }, { mailWarning: false });
await run('unbounded exponent overflow', { maxW: null, maxL: null, width: '1e309' }, { finite: false });
await run('decimal below half', { width: '200.4' }, { mailWarning: false, properties: { Breite: '200 cm' } });
await run('decimal half rounds property up', { width: '200.5' }, { mailWarning: true, properties: { Breite: '201 cm' } });
await run('decimal square', { width: '150.5', shape: 'quadrat' }, { mailWarning: true, properties: { Seitenlänge: '151 cm' } });
await run('decimal circle', { width: '200.5', shape: 'rund' }, { properties: { Durchmesser: '201 cm' } });
await run('decimal ellipse', { width: '200.5', shape: 'oval' }, { properties: { Breite: '201 cm' } });
await run('form points to known second variant', { formId: 'audit-wm-b' }, { id: 'audit-wm-b', mailWarning: false });
await run('no form retains initial variant', {}, { id: 'audit-wm-a', mailWarning: false });
await run('foreign form id retains old price', { formId: 'audit-foreign' }, { id: 'audit-foreign' });
await run('unavailable initial variant', { available: false }, { serverOK: false });
await run('server rejection restores button', {}, { serverOK: false });

// A native disabled button blocks an immediate second click. A legitimate input
// event during the pending request re-enables it because no inFlight gate exists.
const race = await mount(defaults);
race.click(); race.click();
assert.equal(race.requests.length, 1);
race.width.value = '201'; race.render();
assert.equal(race.button.disabled, false);
race.click();
assert.equal(race.requests.length, 2);
assert.deepEqual(race.requests.map((p) => p.quantity), [600, 603]);
await race.finish();
observations.push({ name: 'input during pending request permits second submit', requests: race.requests,
  immediateDoubleClickRequests: 1, afterInputRequests: 2 });

const manifest = JSON.parse(read('audit/evidence/source-manifest.json'));
const hashed = [sourceFile, 'templates/product.teppich.json', mailFile,
  'domains/shopify/rechner-zuordnung.md', 'domains/lieferanten/services/HANDOFF.md'];
const sourceIntegrity = hashed.map((file) => {
  const sha256 = createHash('sha256').update(read(file)).digest('hex');
  const historicalHash = manifest.files[file]?.live?.sha256;
  if (historicalHash) assert.equal(sha256, historicalHash, file);
  return { file, sha256, historicalLiveMatch: historicalHash ? true : null };
});
const report = { date: '2026-09-20', scope: 'PR-023a', reproductionStatus: 'PASS',
  sourceIntegrity, caseCount: observations.length,
  requestCount: observations.reduce((n, v) => n + (v.requests?.length ?? 0), 0),
  historicalProductScope: '09/11 September repository reports: no active product uses product.teppich. Current scope unverified.',
  limitations: [
    'All dimensions, prices, metafields and IDs are synthetic; no Shopify request, server response or real cart.',
    'Original full Liquid block and JS IIFE, except removed doc/schema metadata; LiquidJS is not Shopify Liquid.',
    'Minimal DOM adapter: no real number-input sanitization, layout, lifecycle or actual variant-picker events.',
    'Decimal numeric strings are passed directly; browser acceptance/step validation requires later browser evidence.',
    'Form IDs/unavailability/overflow are isolated conditional probes; no claim these occur on an active product.',
    'Mail is locally rendered from captured properties, not an actual order, deployed notification or sent email.',
    'PASS means diagnosis reproduced, not defect repaired or shop QA passed.',
  ], observations };
writeFileSync(path.join(root, 'audit/evidence/wunschmass-pricing-2026-09-20.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.reproductionStatus, cases: report.caseCount, requests: report.requestCount,
  sourceMatches: sourceIntegrity.filter((s) => s.historicalLiveMatch).length }));
