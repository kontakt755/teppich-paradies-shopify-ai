// PR-022: local original-source audit. No network or shop mutation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const blockFile = 'blocks/tp-rollware-rechner.liquid', artFile = 'assets/tp-rollware-art.js';
const source = read(blockFile);
function between(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Missing source anchors ${start} / ${end}`);
  return source.slice(a, b);
}
const stripDocs = (s) => s.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const liquid = new Liquid({ relativeReference: false, fs: {
  resolve: (_dir, file) => path.join(root, 'snippets', file + '.liquid'),
  exists: async (file) => existsSync(file), existsSync,
  readFile: async (file) => stripDocs(readFileSync(file, 'utf8')),
  readFileSync: (file) => stripDocs(readFileSync(file, 'utf8')), contains: () => true,
} });
liquid.registerFilter('json', (v) => JSON.stringify(v ?? null));
const contract = between('{%- liquid', '\n<div class="tp-rwc-') +
  between('<script type="application/json" data-rwc-data-', '\n<style>');
const val = (value) => ({ value });
const baseCatalog = [
  { width: 80, price: 935 }, { width: 120, price: 1400 },
  { width: 180, price: 1900 }, { width: 200, price: 2400 },
];
function productData(o) {
  const main = [400, 500, 'Wunschmaß'].map((width) => ({
    id: `audit-main-${width}`, title: `Auditfarbe / ${width}`, available: o.mainAvailable ?? true,
    options: ['Auditfarbe', typeof width === 'number' ? width + 'cm' : width],
    price: width === 'Wunschmaß' ? (o.cmExact ? 89 : 8900) : (o.cmExact ? 66 : 6590),
    metafields: { custom: { rollenbreite: val(typeof width === 'number' ? width / 100 : null), farbcode: val('TEST') },
      service: { einfassen: val(o.release ?? 'Verfügbar'), raummass: val('Verfügbar') } },
  }));
  const catalog = o.catalog ?? baseCatalog;
  const haft = catalog.map((v, i) => ({ id: `audit-haft-${i}`, title: v.title ?? `1 mm, ${v.width} cm breit (je lfm)`, price: v.price, available: v.available ?? true }));
  return {
    product: { id: 'audit-product', title: 'Synthetic roll fixture', variants: main,
      selected_or_first_available_variant: main[0],
      options_with_values: [{ name: 'Farbe', position: 1, values: ['Auditfarbe'] }, { name: 'Breite', position: 2, values: ['400cm', '500cm', 'Wunschmaß'] }],
      metafields: { custom: { preis_pro_001_qm: val(o.cmExact ?? false) }, service: { einfass_gruppe: val([]) } } },
    block: { id: 'audit_roll', settings: {
      haftunterlage_produkt: o.configured === false ? null : { variants: haft },
      kettelleisten_produkt: { variants: [{ id: 'audit-leiste', title: '5 cm', price: 1095, available: true }] },
    } },
  };
}
async function renderData(o) {
  const html = await liquid.parseAndRender(contract, productData(o));
  return JSON.parse(html.match(/<script[^>]+>([\s\S]*?)<\/script>/)[1]);
}
class Element {
  constructor(value = '', tagName = 'DIV') {
    this.value = value; this.tagName = tagName; this.textContent = ''; this.hidden = false;
    this.disabled = false; this.checked = false; this.validity = { badInput: false };
    this.children = []; this.options = []; this.attributes = new Map(); this.listeners = new Map();
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  appendChild(el) {
    this.children.push(el);
    if (this.tagName === 'SELECT') { this.options.push(el); if (!this.value) this.value = el.value; }
  }
  removeChild(el) { this.children.splice(this.children.indexOf(el), 1); }
  get firstChild() { return this.children[0] ?? null; }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) ?? null; }
  removeAttribute(k) { this.attributes.delete(k); }
  addEventListener(event, fn) { this.listeners.set(event, fn); }
  emit(event) { this.listeners.get(event)?.(); }
  focus() {}
}
const helpers = between('  function norm(s)', '\n  // Schritt 2 je Farbe') +
  between('  function getEffectiveLengthCm()', '\n  var SVG_NS') +
  between('  function fehlendesFeld()', '\n  var target =');
const extrasSource = between('  var leisteBox =', '\n  var einfassBox =');
const calculateSource = between('  function calculate() {', '\n  // Zuschnitt und Kettelung');
const submitSource = between("  cta.addEventListener('click', function () {", '\n\n  calculate();\n}');
const selectionSource = between('      var beste = null;', '\n      if (hHint)');
const select = vm.runInNewContext(`(function(w, len, haftVarianten) { var showH = true; ${selectionSource} return beste; })`);
const ceilRatio = (a, b) => Math.floor((a + b - 1) / b);
const money = (c) => (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
function candidates(w, length, catalog) {
  // Independent integer oracle; each candidate has its own explicit known cm width.
  return catalog.map((v) => {
    const strips = ceilRatio(w, v.width), meters = strips * ceilRatio(length, 100);
    return { id: v.id, width: v.width, strips, meters, cents: meters * v.price };
  }).sort((a, b) => a.cents - b.cents);
}
function allowedCatalog(o) {
  if (o.configured === false || (o.release ?? 'Verfügbar') !== 'Verfügbar') return [];
  return (o.catalog ?? baseCatalog).map((v, i) => ({ ...v, id: `audit-haft-${i}` }))
    .filter((v) => v.available !== false && v.price > 0 && !v.unrecognized);
}
const observations = [];
async function runCase(name, o = {}) {
  const data = await renderData(o);
  const width = o.width ?? 400, length = o.length ?? 200, mode = o.mode ?? 'meter';
  const nodes = Object.fromEntries(['messRaum','wunschError','errComma','errMin','errMax','errStock','calcBox','drawFigure',
    'formulaArea','formulaRound','formulaPrice','outTotal','cta','ctaHint','cartLink','meterTipp','widthSeg'].map((n) => [n, new Element()]));
  const fields = new Map();
  const q = (s) => {
    if (!fields.has(s)) fields.set(s, new Element('', s === '[data-leiste-hoehe]' ? 'SELECT' : 'DIV'));
    return fields.get(s);
  };
  const haftBox = new Element(), leisteBox = new Element(), formulaExtras = new Element();
  haftBox.querySelector = leisteBox.querySelector = q;
  q('[data-haft-an]').checked = o.underlay !== false;
  q('[data-leiste-an]').checked = !!o.skirt;
  if (o.skirtLength !== undefined) { q('[data-leiste-meter]').value = String(o.skirtLength); q('[data-leiste-meter]').setAttribute('data-touched', '1'); }
  const wunschInput = new Element(String(width), 'INPUT'), lengthInput = new Element(String(length), 'INPUT');
  const rootEl = { querySelector: (s) => {
    if (s === '[data-extra="haft"]') return o.configured === false ? null : haftBox;
    if (s === '[data-extra="leiste"]') return leisteBox;
    if (s === '[data-formula-extras]') return formulaExtras;
    return { value: String(width) };
  } };
  const requests = [], events = [];
  const context = vm.createContext({
    ...nodes, data, variants: data.variants.filter(Boolean), cmExact: data.cm_exact,
    wunschInput, lengthInput, root: rootEl, wIdx: 1, widths: [400,500], farbBreiten: [400,500],
    WUNSCH_MIN_CM: 50, MAX_LENGTH_CM: 5000, target: null, inFlight: false,
    artMode: () => mode, syncArtUi() {}, updateEinfassChips() {}, draw() {},
    renumberSteps() {}, applyServiceState() {}, clearInvalid() {}, markInvalid() {}, updateMeterTipp() {}, setTimeout() {},
    window: { location: { search: '' } }, URLSearchParams,
    document: { querySelector: () => null, createElement: (tag) => new Element('', tag.toUpperCase()),
      dispatchEvent: (event) => events.push(event.detail) },
    CustomEvent: class { constructor(_type, init) { this.detail = init.detail; } },
    fetch: async (url, options) => { requests.push({ url, method: options.method, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ intercepted: true }) }; },
  });
  vm.runInContext(read(artFile), context, { filename: artFile, timeout: 1000 });
  vm.runInContext('var ART=window.TPRollwareArt; function maxRaumBreite() { return ART.maxRaumBreite(farbBreiten); }', context);
  assert.equal(context.ART.findWidthOption(data.options), 1);
  vm.runInContext(helpers + extrasSource + calculateSource + submitSource, context, { filename: blockFile, timeout: 1000 });
  vm.runInContext('calculate()', context, { timeout: 1000 });
  const before = { total: nodes.outTotal.textContent, hint: q('[data-haft-hint]').textContent,
    advertisedMinimum: q('[data-haft-preis]').textContent, underlayHidden: o.configured === false || haftBox.hidden,
    lines: formulaExtras.children.map((c) => c.textContent), ariaDisabled: nodes.cta.getAttribute('aria-disabled') };
  nodes.cta.emit('click');
  if (o.doubleClick) { vm.runInContext('calculate()', context); nodes.cta.emit('click'); }
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, o.blocked ? 0 : 1, name);
  const result = { name, input: { ...o, width, length, mode }, renderedUnderlay: data.haft.filter(Boolean),
    parsedUnderlay: JSON.parse(JSON.stringify(context.haftVarianten)), before, request: requests[0] ?? null };
  if (!o.blocked) {
    const items = requests[0].body.items || [requests[0].body];
    const w = Math.ceil(Number(width)), len = Math.ceil(Number(length));
    const available = allowedCatalog(o), expectedCandidates = candidates(w, len, available);
    const wantUnderlay = o.underlay !== false && available.length > 0;
    const haftItem = items.find((item) => item.id.startsWith('audit-haft-'));
    const expectedMain = data.variants.find((v) => v && v.id === items[0].id);
    let cents = items[0].quantity * expectedMain.price;
    if (wantUnderlay) {
      assert.ok(haftItem, name + ' underlay included');
      const chosen = expectedCandidates.find((v) => v.id === haftItem.id);
      assert.equal(chosen.cents, expectedCandidates[0].cents, name + ' cheapest uniform layout');
      assert.equal(haftItem.quantity, chosen.meters);
      assert.equal(haftItem.properties.Bahnen, String(chosen.strips));
      assert.equal(haftItem.properties['Ausführung'], data.haft.find((v) => v?.id === haftItem.id).title);
      assert.ok(chosen.strips * chosen.width >= w && chosen.meters * 100 >= chosen.strips * len);
      cents += chosen.cents;
      result.oracle = { candidates: expectedCandidates, chosen, priceMatchesUniformMinimum: true, coverageSufficient: true };
    } else assert.equal(haftItem, undefined);
    const skirtItem = items.find((item) => item.id === 'audit-leiste');
    const wantSkirt = !!o.skirt && (o.release ?? 'Verfügbar') === 'Verfügbar';
    if (wantSkirt) {
      assert.ok(skirtItem);
      const qty = o.skirtLength === undefined ? ceilRatio(2 * (w + len), 100) : Math.ceil(Number(o.skirtLength));
      assert.equal(skirtItem.quantity, qty);
      cents += qty * 1095;
    } else assert.equal(skirtItem, undefined);
    assert.equal(items.length, 1 + Number(wantUnderlay) + Number(wantSkirt));
    assert.equal(before.total, money(cents), name + ' display/payload');
    if (items.length > 1) {
      assert.ok(items[0].properties._Gruppe);
      assert.ok(items.every((item) => item.properties._Gruppe === items[0].properties._Gruppe));
    } else assert.equal(items[0].properties._Gruppe, undefined);
    assert.equal(events.length, 1);
    assert.equal(events[0].data.itemCount, items.reduce((sum, item) => sum + item.quantity, 0));
    result.payloadTotalCents = cents;
    result.eventItemCount = events[0].data.itemCount;
    for (const item of items) if (item.properties._Gruppe) item.properties._Gruppe = 'T-AUDIT';
  }
  observations.push(result);
}
await runCase('historical hint geometry, synthetic single-price fixture', { catalog: [{ width: 80, price: 935 }] });
await runCase('four-width synthetic catalog');
await runCase('with valid footstrip suggested perimeter', { skirt: true });
await runCase('with valid footstrip custom length', { skirt: true, skirtLength: 7 });
await runCase('underlay off, footstrip on', { underlay: false, skirt: true });
await runCase('underlay off', { underlay: false });
await runCase('underlay not configured', { configured: false });
for (const w of [50,79,80,81,119,120,121,179,180,181,199,200,201,239,240,241,399,400,401,495]) {
  await runCase(`room width ${w} length 201`, { width: w, length: 201, mode: 'raum' });
}
for (const length of [100,101,199,201,299,300,301,4999,5000]) await runCase(`meter length ${length}`, { length });
await runCase('meter 500 cm width', { width: 500 });
await runCase('rotated synthetic dimensions 201x400', { width: 201, length: 400, mode: 'raum' });
await runCase('decimal dimensions', { width: 179.1, length: 200.1, mode: 'raum' });
await runCase('cmExact material mode', { width: 400, length: 201, cmExact: true });
await runCase('lowest meter price is not lowest total', { catalog: [{ width: 80, price: 1000 },{ width: 200, price: 2100 }] });
await runCase('unavailable cheapest variant excluded', { catalog: [{ width: 80, price: 1, available: false },{ width: 200, price: 2100 }] });
await runCase('zero and negative price excluded', { catalog: [{ width: 80, price: 0 },{ width: 120, price: -100 },{ width: 200, price: 2100 }] });
await runCase('title without width excluded', { catalog: [{ width: 80, price: 1, title: 'Unbekannte Breite', unrecognized: true },{ width: 180, price: 1900 }] });
await runCase('single compact width title', { catalog: [{ width: 180, price: 1900, title: '180cm' }] });
await runCase('no recognized width', { catalog: [{ width: 80, price: 935, title: 'Unbekannte Breite', unrecognized: true }] });
await runCase('no available underlay variants', { catalog: [{ width: 80, price: 935, available: false }] });
await runCase('duplicate widths choose cheaper', { catalog: [{ width: 180, price: 1900 },{ width: 180, price: 1500 }] });
await runCase('equal total candidates', { catalog: [{ width: 100, price: 1000 },{ width: 200, price: 2000 }] });
await runCase('cent tie candidates', { catalog: [{ width: 100, price: 123 },{ width: 200, price: 246 }] });
await runCase('double submit with extras', { doubleClick: true, skirt: true });
for (const release of ['', 'Verfuegbar', 'Nicht verfügbar']) await runCase(`release ${release || 'empty'}`, { release, skirt: true });
for (const [name, o] of [
  ['empty length', { length: '' }], ['zero length', { length: 0 }], ['negative length', { length: -1 }],
  ['short length', { length: 99 }], ['too long', { length: 5001 }],
  ['room width over max', { width: 496, mode: 'raum' }], ['main unavailable', { mainAvailable: false }],
]) await runCase(name, { ...o, blocked: true });

// Every integer cm width in the room domain plus full 500-cm roll, and both
// sides of every full-metre rounding boundary; independent from PR-020 area grid.
const widths = [...Array.from({ length: 446 }, (_, i) => i + 50), 500];
const lengths = [...new Set(Array.from({ length: 50 }, (_, i) => (i + 1) * 100)
  .flatMap((x) => [x-1,x,x+1]).filter((x) => x >= 100 && x <= 5000))];
const gridCatalogs = [baseCatalog, [{ width: 80, price: 1000 },{ width: 200, price: 2100 }],
  [{ width: 100, price: 123 },{ width: 200, price: 246 }]];
let gridCases = 0;
for (const catalog of gridCatalogs) {
  const vars = catalog.map((v, i) => ({ ...v, id: 'grid-' + i, breite: v.width }));
  for (const w of widths) for (const len of lengths) {
    const actual = select(w, len, vars), expected = candidates(w, len, vars);
    const chosen = expected.find((x) => x.id === actual.v.id);
    assert.equal(chosen.cents, expected[0].cents);
    assert.equal(actual.meter, chosen.meters);
    assert.equal(actual.bahnen, chosen.strips);
    assert.equal(Math.round(actual.summe * 100), chosen.cents);
    gridCases++;
  }
}
// Alternative physical layouts are hypothetical: no material-direction or
// supplier/cutting permission inferred. They are NOT bug assertions.
const mixedCatalog = [{ width: 80, price: 935 },{ width: 120, price: 1400 }];
const alternativeLayouts = {
  rotation: { inputCm: [400,201], sameDirection: candidates(400,201,baseCatalog)[0],
    rotated: candidates(201,400,baseCatalog)[0], allowedInPractice: 'unknown' },
  mixedWidths: { inputCm: [200,300], singleVariant: candidates(200,300,mixedCatalog)[0],
    hypotheticalMixedCents: 3 * 935 + 3 * 1400, strips: [{width:80,meters:3},{width:120,meters:3}], allowedInPractice: 'unknown' },
};
const manifest = JSON.parse(read('audit/evidence/source-manifest.json'));
const sourceIntegrity = [blockFile, artFile, 'templates/product.rolle.json', 'snippets/tp-farbe-daten.liquid'].map((file) => ({
  file, currentSha256: sha(read(file)), historicalLiveSha256: manifest.files[file].live.sha256,
  matchesHistoricalLive: sha(read(file)) === manifest.files[file].live.sha256,
}));
assert.ok(sourceIntegrity.every((s) => s.matchesHistoricalLive));
process.stdout.write(JSON.stringify({
  status: 'PASS', session: 'S04', matrix: 'PR-022', generatedAt: new Date().toISOString(), sourceIntegrity,
  cases: observations.length, requests: observations.filter((o) => o.request).length,
  grid: { cases: gridCases, widths: widths.length, lengths: lengths.length, catalogs: gridCatalogs.length, mismatches: 0,
    scope: 'Uniform single-variant strips in fixed orientation; full-metre boundary +/-1 cm; no exhaustive browser or live-product claim' },
  fixture: { ids: 'all synthetic', currentLiveData: false,
    note: 'Historical runtime shows 80 cm / 5 strips / 10 lfm and advertised minimum 935c per lfm at 400x200. It does not establish the exact width/price pairing or a complete live variant list. All catalogs here are explicitly synthetic.',
    baseCatalog, referenceMainPrices: 'Historical 6590c per m² meterware / 8900c room; cmExact fixture 66/89c is synthetic.',
    footstripPrice: '1095c synthetic pairing based on historical advertised minimum, not API-verified.' },
  limitations: ['No browser, current MAIN verification, product data read, real cart/server response or checkout.',
    'Local LiquidJS contract + original JS functions; not Shopify Liquid proof.',
    'Drawing, section lifecycle, service UI, actual color/width events and meterware tip excluded; isolated main variant state supplied.',
    'No price or SKU changed. Optional-service absence is not automatically a bug.',
    'Fixed orientation and one chosen width match source policy; rotation/mixed-width alternatives require business/material confirmation.'],
  alternativeLayouts, observations,
}, null, 2) + '\n');
