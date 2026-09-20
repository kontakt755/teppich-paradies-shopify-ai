// PR-021 audit only: original Liquid data contract + original JS functions.
// No browser, network, cart mutation, product mutation or notification send.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const jsFile = 'assets/tp-einfass-konfigurator.js';
const blockFile = 'blocks/tp-einfass-konfigurator.liquid';
const mathFile = 'assets/tp-masstepich-rechnung.js';
const mailFile = 'domains/shopify/benachrichtigungen/interne-bestellmail-block.liquid';
const js = read(jsFile), block = read(blockFile);
function slice(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Missing source anchors: ${start} / ${end}`);
  return source.slice(a, b);
}
const stripDocs = (s) => s.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const engine = new Liquid({
  relativeReference: false,
  fs: {
    resolve: (_dir, file) => path.join(root, 'snippets', file + '.liquid'),
    exists: async (file) => existsSync(file), existsSync,
    readFile: async (file) => stripDocs(readFileSync(file, 'utf8')),
    readFileSync: (file) => stripDocs(readFileSync(file, 'utf8')),
    contains: () => true,
  },
});
engine.registerFilter('json', (value) => JSON.stringify(value ?? null));
// Exact Liquid guards/assignments and JSON output; layout/form/stylesheet/schema
// omitted. Real local color/band snippets are rendered, not fabricated output.
const liquidContract = slice(block, '{%- liquid', '\n  <div class="tp-ek') +
  slice(block, '    <script type="application/json" data-tp-ek-daten>', '\n    <script src=') +
  '\n{%- endif -%}';
const val = (value) => ({ value });
function fixture(o = {}) {
  const variant = {
    id: 'audit-einfass-material', price: o.price ?? 89, available: o.available ?? true,
    options: ['Auditfarbe'], featured_image: null,
    metafields: { service: { einfassen: val(o.release ?? 'Verfügbar') }, custom: { farbcode: val('TEST') } },
  };
  const product = {
    title: 'Synthetic Einfass fixture', variants: [variant], selected_or_first_available_variant: variant,
    options_with_values: [{ name: 'Farbe', position: 1 }],
    metafields: {
      custom: { preis_pro_001_qm: val(o.cmExact ?? true) },
      service: {
        einfassung: val(o.art ?? 'Ketteln'), max_breite_cm: val(o.maxW ?? 400), max_laenge_cm: val(o.maxL ?? 600),
        mindestpreis: val(o.minimum ?? 99), formen: val(o.forms ?? ['Rechteck']),
        einfass_basis: val({ variants: [400, 500].map((width) => ({ metafields: { custom: { rollenbreite: val(width / 100) } } })) }),
      },
    },
  };
  const service = o.service === 'missing' ? null : {
    selected_or_first_available_variant: {
      id: 'audit-einfass-edge', price: o.edgePrice ?? 19, available: o.service !== 'unavailable',
    },
  };
  return { product, block: { id: 'audit_block', settings: { kettelservice_produkt: service } } };
}
async function dataFor(o) {
  const text = await engine.parseAndRender(liquidContract, fixture(o));
  const match = text.match(/<script[^>]+>([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}
class Element {
  constructor(value = '') {
    this.value = value; this.textContent = ''; this.hidden = false; this.disabled = false;
    this.validity = { badInput: false }; this.attributes = new Map(); this.style = {};
    this.classList = { add() {}, remove() {} };
  }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) ?? null; }
  querySelectorAll() { return []; }
}
// Original function bodies only. Drawing, presets and numbering are explicit
// no-ops; band selection is supplied from rendered band data. No DOM lifecycle test.
const runnerSource = slice(js, '(function () {', '  function svgEl(') +
  slice(js, '  function init(root) {', '    function form() {') +
  slice(js, '    function form() {', '    function nummerieren() {') +
  slice(js, '    function lesen(input) {', '\n    /*\n      Eine Kachel') +
  slice(js, '    function anfrageZeigen(f) {', '\n    raeumeAufbauen();') + `
    function zeichnen() {}
    function groessenAufbauen() {}
    function nummerieren() {}
    if (auditBandSelected) band = baender[0] || null;
    rechnen();
    return {
      calculate: rechnen, add: hinzufuegen,
      state: function () { return stand && JSON.parse(JSON.stringify(stand)); }
    };
  }
  globalThis.auditInit = init;
})();`;
const money = (cents) => (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const format = (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Independent cm² integer oracle. Ellipse perimeter via numerical integration
// is recorded separately: original code intentionally uses Ramanujan's approximation.
function preciseEdgeCm(form, w, l, n = 4096) {
  if (form === 'rechteck') return 2 * (w + l);
  if (form === 'rund') return Math.PI * w;
  const a = w / 2, b = l / 2, step = Math.PI / 2 / n;
  const f = (t) => Math.hypot(a * Math.sin(t), b * Math.cos(t));
  let sum = f(0) + f(Math.PI / 2);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * f(i * step);
  return 4 * step * sum / 3;
}
const observations = [];
async function runCase(name, o = {}) {
  const data = await dataFor(o);
  if (!data) {
    assert.equal(o.expectGate, true, name);
    const result = { name, fixture: o, liquidRendered: false, request: null };
    observations.push(result); return result;
  }
  assert.ok(!o.expectGate, name);
  const selectedForm = o.form ?? data.formen[0];
  assert.ok(data.formen.includes(selectedForm), 'Every tested form must be explicitly rendered/allowed in its fixture');
  const nodes = new Map();
  const q = (s) => {
    if (!nodes.has(s)) nodes.set(s, new Element());
    return nodes.get(s);
  };
  q('[data-tp-ek-daten]').textContent = JSON.stringify(data);
  q('input[name^="tp-ek-form-"]:checked').value = selectedForm;
  q('[data-breite]').value = String(o.width ?? 200);
  q('[data-laenge]').value = String(o.length ?? 300);
  if (o.badInput) q('[data-breite]').validity.badInput = true;
  const el = new Element(); el.id = 'audit-root'; el.querySelector = q; el.querySelectorAll = () => [];
  const requests = [], events = [];
  let syncs = 0;
  const context = vm.createContext({
    URLSearchParams, auditBandSelected: o.bandSelected ?? false,
    window: { location: { search: o.query ?? '' }, TPZuschnitt: { abgleichen: async () => { syncs++; } } },
    document: { querySelectorAll: () => [], querySelector: () => null, dispatchEvent: (e) => events.push(e.type) },
    CustomEvent: class { constructor(type) { this.type = type; } },
    setTimeout() {},
    fetch: async (url, options) => {
      requests.push({ url, method: options.method, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ auditIntercepted: true }) };
    },
  });
  vm.runInContext(read(mathFile), context, { filename: mathFile, timeout: 1000 });
  vm.runInContext(runnerSource, context, { filename: jsFile, timeout: 1000 });
  const controller = context.auditInit(el);
  const state = controller?.state() ?? null;
  const before = {
    sum: q('[data-summe]').textContent, material: q('[data-material]').textContent,
    area: q('[data-flaeche]').textContent, edge: q('[data-kettelpreis]').textContent,
    minimumHint: q('[data-mindest-hinweis]').hidden ? null : q('[data-mindest-hinweis]').textContent,
    error: q('[data-fehler]').hidden ? null : q('[data-fehler]').textContent,
    ctaHidden: q('[data-cta]').hidden, ctaDisabled: q('[data-cta]').disabled,
    configurationHidden: q('[data-konfig]').hidden,
  };
  controller?.add();
  if (o.doubleClick) { controller.calculate(); controller.add(); }
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, o.expectBlocked ? 0 : 1, name + ' request count');
  const result = { name, fixture: o, liquidRendered: true,
    data: { art: data.art, forms: data.formen, minimumCents: data.mindestpreis_cent, kettel: data.kettel },
    state, before, request: requests[0] ?? null, syncCalls: syncs, events };
  if (requests.length) {
    const body = requests[0].body, items = body.items || [body], material = items[0];
    const w = Math.ceil(Number(o.width ?? 200)), l = selectedForm === 'rund' ? w : Math.ceil(Number(o.length ?? 300));
    const geometricUnits = Math.floor((w * l + 99) / 100);
    const edgeUnits = data.kettel ? state.kantenEinheiten : 0;
    const edgeCents = edgeUnits * (data.kettel?.price ?? 0);
    const unitCents = o.price ?? 89;
    const expectedQty = Math.max(geometricUnits, Math.floor((Math.max(0, data.mindestpreis_cent - edgeCents) + unitCents - 1) / unitCents));
    assert.equal(material.quantity, expectedQty, name + ' material qty');
    assert.equal(items.length, data.kettel ? 2 : 1);
    assert.equal(state.mindest, expectedQty > geometricUnits);
    assert.equal(state.flaeche, geometricUnits / 100);
    const actualSum = material.quantity * unitCents + edgeCents;
    assert.equal(before.sum, money(actualSum));
    assert.ok(actualSum >= data.mindestpreis_cent);
    assert.equal(material.id, 'audit-einfass-material');
    assert.equal(material.properties.Einfassung, { ketteln: 'Gekettelt', cover: 'Cover', einfassband: 'Einfassband', paspelband: 'Paspelband' }[data.art]);
    assert.equal(material.properties['Fläche (abgerechnet)'], state.mindest
      ? `${format(material.quantity / 100)} m² (Mindestpreis, gewünscht ${format(geometricUnits / 100)} m²)`
      : `${format(geometricUnits / 100)} m²`);
    const precise = preciseEdgeCm(selectedForm, w, l);
    if (selectedForm === 'oval') assert.ok(Math.abs(precise - preciseEdgeCm(selectedForm, w, l, 8192)) < 1e-7);
    if (items.length === 2) {
      assert.equal(items[1].id, 'audit-einfass-edge');
      assert.equal(items[1].quantity, edgeUnits);
      assert.equal(items[1].properties._Gruppe, material.properties._Gruppe);
      if (selectedForm !== 'oval') assert.equal(edgeUnits, Math.round(precise));
    }
    assert.equal(syncs, 1);
    assert.deepEqual(events, ['cart:update']);
    const mail = await engine.parseAndRender(read(mailFile), {
      name: '#AUDIT', created_at: '2026-09-20T00:00:00Z', email: 'audit@example.invalid',
      line_items: items.map((item, index) => ({ title: index ? 'Synthetic Kettelservice' : 'Synthetic Einfass fixture',
        quantity: item.quantity, properties: Object.entries(item.properties),
        product: { metafields: { custom: { preis_pro_001_qm: index === 0 } } }, variant: { metafields: {} } })),
    });
    result.oracle = { geometricUnits, expectedMaterialUnits: expectedQty, actualMaterialUnits: material.quantity,
      edgeUnits, actualSumCents: actualSum, displayMatchesPayload: true,
      preciseGeometricEdgeCm: precise, sourceEdgeCm: state.kante * 100,
      roundedPreciseEdgeUnits: Math.round(precise), edgeApproximationDifferenceUnits: edgeUnits ? edgeUnits - Math.round(precise) : null };
    result.notification = { warningTooSmall: mail.includes('MENGE ZU KLEIN'), stopCutting: mail.includes('NICHT ZUSCHNEIDEN') };
    assert.equal(result.notification.warningTooSmall, false, name + ' notification quantity');
    // Retain relation but strip unstable clock/random group token in saved output.
    for (const item of items) item.properties._Gruppe = 'K-AUDIT';
  } else assert.equal(syncs, 0);
  observations.push(result);
  return result;
}

await runCase('reference rectangle 200x300');
await runCase('minimum rectangle 50x50', { width: 50, length: 50 });
await runCase('minimum paid exactly', { width: 50, length: 50, minimum: 99.41 });
await runCase('one cent above minimum threshold', { width: 50, length: 50, minimum: 99.42 });
await runCase('money metafield minimum', { width: 50, length: 50, minimum: { amount: '99.00' } });
await runCase('minimum inactive 50x100', { width: 50, length: 100 });
await runCase('no minimum 50x50', { width: 50, length: 50, minimum: 0 });
for (const [w, l] of [[201,301], [250,333], [365,302], [333,200], [237,368], [350,420], [420,350], [400,600], [600,400]]) {
  await runCase(`rectangle ${w}x${l}`, { width: w, length: l });
}
await runCase('decimal dot dimensions ceil to cm', { width: 200.1, length: 300.1 });
await runCase('synthetic round 200', { forms: ['Rund'], form: 'rund', width: 200, length: '' });
await runCase('synthetic round minimum 50', { forms: ['Rund'], form: 'rund', width: 50 });
await runCase('synthetic round max 400', { forms: ['Rund'], form: 'rund', width: 400 });
await runCase('synthetic oval 200x300', { forms: ['Oval'], form: 'oval' });
await runCase('synthetic long oval 50x600', { forms: ['Oval'], form: 'oval', width: 50, length: 600 });
await runCase('cover with prepared maxWidth', { art: 'Cover', maxW: 390, width: 390 });
await runCase('cover prepared maxWidth exceeded', { art: 'Cover', maxW: 390, width: 391, length: 400, expectBlocked: true });
await runCase('band selected synthetic', { art: 'Einfassband', bandSelected: true });
await runCase('band missing blocks', { art: 'Einfassband', expectBlocked: true });
await runCase('paspel selected synthetic', { art: 'Paspelband', bandSelected: true });
await runCase('service unavailable', { service: 'unavailable' });
await runCase('service missing', { service: 'missing' });
await runCase('service zero price', { edgePrice: 0 });
await runCase('double submit during inFlight with recalculate', { doubleClick: true });
for (const [name, o] of [
  ['empty', { width: '' }], ['zero', { width: 0 }], ['negative', { width: -1 }],
  ['below minimum', { width: 49 }], ['above max short side', { width: 401, length: 420 }],
  ['above max length', { width: 400, length: 601 }],
  ['badInput state', { width: '', badInput: true }], ['variant unavailable', { available: false }],
  ['foreign query variant', { query: '?variant=audit-foreign' }],
  ['round over max', { forms: ['Rund'], form: 'rund', width: 401 }],
  ['inquiry sketch', { forms: ['Skizze'], form: 'skizze' }],
]) await runCase(name, { ...o, expectBlocked: true });
for (const [name, o] of [
  ['no cmExact product flag', { cmExact: false }], ['no max width', { maxW: 0 }],
  ['unknown art', { art: 'Unknown' }], ['no variant release', { release: '' }], ['zero material price', { price: 0 }],
]) await runCase(name, { ...o, expectGate: true });

const reference = observations.find((o) => o.name === 'reference rectangle 200x300');
const unavailable = observations.find((o) => o.name === 'service unavailable');
assert.equal(reference.oracle.actualSumCents, 72400);
assert.equal(unavailable.oracle.actualSumCents, 53400);
assert.equal(unavailable.data.kettel, null);
assert.equal(unavailable.before.ctaHidden, false);
assert.equal(unavailable.before.ctaDisabled, false);
assert.equal(unavailable.request.body.properties.Einfassung, 'Gekettelt');
assert.equal(unavailable.request.body.properties.Garn, 'Ton in Ton');
assert.equal(unavailable.request.body.items, undefined);
const conditionalServiceFailure = {
  condition: 'Configured separately billed service exists but selected variant available=false',
  referenceSumCents: reference.oracle.actualSumCents,
  unavailableServiceSumCents: unavailable.oracle.actualSumCents,
  missingEdgeCents: reference.oracle.actualSumCents - unavailable.oracle.actualSumCents,
  describedAsGekettelt: true, liveOccurrenceEstablished: false,
  scope: 'Missing optional service is separately recorded, not automatically a defect in an intentionally inclusive price model.',
};
const manifest = JSON.parse(read('audit/evidence/source-manifest.json'));
const sourceIntegrity = [jsFile, blockFile, mathFile, 'templates/product.einfassung.json', 'snippets/tp-farbe-daten.liquid', 'snippets/tp-bandfarben.liquid', mailFile].map((file) => ({
  file, currentSha256: hash(read(file)), historicalLiveSha256: manifest.files[file]?.live.sha256 ?? null,
  matchesHistoricalLive: manifest.files[file] ? hash(read(file)) === manifest.files[file].live.sha256 : null,
}));
assert.ok(sourceIntegrity.slice(0, 6).every((row) => row.matchesHistoricalLive));
const report = {
  reproductionStatus: 'PASS', session: 'S03', matrix: 'PR-021', generatedAt: new Date().toISOString(),
  fixture: { currentLiveData: false, ids: 'synthetic',
    reference: 'docs/produktseiten/piumera-referenzprodukt-inhalte.md, section 9 (2026-09-14; historical text, not current Admin data)',
    historicRules: 'Piumera rectangle only; 89c per 0.01 m² + 19c per 0.01 lfm; 99 EUR minimum, max 400x600 cm.',
    syntheticCapabilities: 'Other shapes/arts, service failures, availability and boundary inputs explicitly constructed.' },
  sourceIntegrity, conditionalServiceFailure, cases: observations.length,
  interceptedRequests: observations.filter((o) => o.request).length,
  liquidGateCases: observations.filter((o) => !o.liquidRendered).length,
  limitations: ['Local LiquidJS is not Shopify Liquid; no fresh MAIN or product verification.',
    'Original data contract and price/submit functions executed; drawing, presets, numbering, real form/band/color events and browser normalization excluded.',
    'Cut-attribute synchronization stubbed successful; network response is synthetic. Group cart handling/checkout remain untested.',
    'Round/oval/cover/bands are synthetic capability fixtures; historical Piumera allowed rectangle only.',
    'Current local notification rendered; its actual deployment and full order workflow unverified.',
    'Ellipse oracle quantifies documented Ramanujan approximation; business acceptability is not inferred from arithmetic alone.'],
  observations,
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
