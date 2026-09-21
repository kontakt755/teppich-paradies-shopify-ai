// S07 / PR-023b.2: local original-source diagnosis only. No network or shop writes.
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
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Missing anchors ${start} / ${end}`);
  return source.slice(a, b);
}
const strip = (s) => s.replace(/{%-?\s*(doc|schema|stylesheet)\s*-?%}[\s\S]*?{%-?\s*end\1\s*-?%}/g, '');
const liquid = new Liquid({ relativeReference: false, fs: {
  resolve: (_dir, file) => path.join(root, 'snippets', file + '.liquid'),
  exists: async (file) => existsSync(file), existsSync,
  readFile: async (file) => strip(readFileSync(file, 'utf8')),
  readFileSync: (file) => strip(readFileSync(file, 'utf8')), contains: () => true,
} });
liquid.registerFilter('json', (v) => JSON.stringify(v ?? null));
const val = (value) => ({ value });
const money = (c) => (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
class Element {
  constructor(value = '') {
    this.value = value; this.textContent = ''; this.hidden = false; this.disabled = false;
    this.checked = false; this.validity = { badInput: false }; this.attributes = new Map();
    this.listeners = new Map(); this.children = []; this.events = [];
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  get firstChild() { return this.children[0] ?? null; }
  appendChild(el) { this.children.push(el); }
  removeChild(el) { this.children.splice(this.children.indexOf(el), 1); }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) ?? null; }
  removeAttribute(k) { this.attributes.delete(k); }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  dispatchEvent(event) { this.events.push(event.type); this.listeners.get(event.type)?.(event); return true; }
  emit(type) { this.dispatchEvent({ type, target: this }); }
  contains(el) { return el === this; }
  focus() {}
}

// PVC: preserve both historical metre labels and a centimetre control contract.
// Source fragments match S04 boundaries; only new product/variant contracts are tested.
const rollFile = 'blocks/tp-rollware-rechner.liquid', artFile = 'assets/tp-rollware-art.js';
const rollSource = read(rollFile), r = (a, b) => between(rollSource, a, b);
const rollContract = r('{%- liquid', '\n<div class="tp-rwc-') + r('<script type="application/json" data-rwc-data-', '\n<style>');
const rollInit = r('  var ART = window.TPRollwareArt;', '\n  root.style.display');
const rollFunctions = r('  function norm(s)', '\n  // Schritt 2 je Farbe') +
  r('  function selectedMeterWidth()', '\n\n  function artMode()') +
  r('  function syncArtUi()', '\n  // Im Raummass sagen') +
  r('  function getEffectiveLengthCm()', '\n  var SVG_NS') +
  r('  function fehlendesFeld()', '\n  var target =') +
  r('  var leisteBox =', '\n  var einfassBox =') +
  r('  function calculate() {', '\n  // Zuschnitt und Kettelung') +
  r("  cta.addEventListener('click', function () {", '\n\n  calculate();\n}');
const rollCases = [];
async function rollCase(name, o = {}) {
  const widths = o.widths ?? [200, 400], selected = o.selected ?? 0;
  const labels = widths.map((w) => o.labels === 'cm' ? `${w} cm` : `${(w / 100).toFixed(2).replace('.', ',')} m`);
  const variants = widths.map((w, i) => ({ id: `audit-pvc-${w}`, title: labels[i], options: [labels[i]],
    available: !(o.unavailable && i === selected), price: i === 0 ? 2490 : 2790,
    metafields: { custom: { rollenbreite: val(w / 100) }, service: {} } }));
  const product = { id: 'audit-pvc', title: 'Synthetic PVC price fixture', variants,
    selected_or_first_available_variant: variants[selected],
    options_with_values: [{ name: 'Breite', position: 1, values: labels }],
    metafields: { custom: { preis_pro_001_qm: val(false) }, service: { einfass_gruppe: val([]) } } };
  const html = await liquid.parseAndRender(rollContract, { product, block: { id: 'audit_pvc', settings: {} } });
  const data = JSON.parse(html.match(/<script[^>]+>([\s\S]*?)<\/script>/)[1]);
  const nodes = Object.fromEntries(['messRaum','wunschError','errComma','errMin','errMax','errStock','calcBox','drawFigure',
    'formulaArea','formulaRound','formulaPrice','outTotal','cta','ctaHint','cartLink','meterTipp','widthSeg'].map((n) => [n, new Element()]));
  const length = o.length ?? 201, requests = [];
  const context = vm.createContext({ ...nodes, data, variants: data.variants.filter(Boolean), options: data.options,
    lengthInput: new Element(String(length)), wunschInput: new Element(),
    root: { querySelector: (s) => s.includes('tp-rwc-width-') ? new Element(String(widths[selected])) : null },
    WUNSCH_MIN_CM: 50, MAX_LENGTH_CM: 5000, target: null, inFlight: false,
    artMode: () => 'meter', updateEinfassChips() {}, draw() {}, renumberSteps() {},
    artField: null, widthField: null, widthStep: null, widthLabel: null, wunschBox: null, lengthNumber: null,
    artRaumCard: null, artRadios: [], artSubMeter: null, artSubRaum: null,
    applyServiceState() {}, clearInvalid() {}, markInvalid() {}, updateMeterTipp() {}, setTimeout() {},
    window: { location: { search: `?variant=${variants[selected].id}` } }, URLSearchParams,
    document: { querySelector: () => null, createElement: () => new Element(), dispatchEvent() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    fetch: async (url, config) => { requests.push({ url, method: config.method, body: JSON.parse(config.body) });
      return { ok: true, json: async () => ({ intercepted: true }) }; },
  });
  vm.runInContext(read(artFile), context, { filename: artFile, timeout: 1000 });
  const init = vm.runInContext(`(function() { ${rollInit}; return { ART, wIdx, widths, cmExact }; })()`, context);
  assert.ok(init, name + ' initializes');
  Object.assign(context, init, { farbBreiten: init.widths });
  context.chipByWidth = Object.fromEntries(init.widths.map((w) => [w, { input: new Element(String(w)), label: new Element() }]));
  vm.runInContext('function maxRaumBreite() { return ART.maxRaumBreite(farbBreiten); }' + rollFunctions, context, { filename: rollFile, timeout: 1000 });
  vm.runInContext('calculate()', context, { timeout: 1000 });
  const display = { total: nodes.outTotal.textContent, area: nodes.formulaArea.textContent, round: nodes.formulaRound.textContent,
    ariaDisabled: nodes.cta.getAttribute('aria-disabled'), widthCm: vm.runInContext('selectedWidth()', context) };
  nodes.cta.emit('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, o.blocked ? 0 : 1, name);
  const expectedQuantity = Math.floor((widths[selected] * Math.ceil(length) + 9999) / 10000);
  const result = { name, labels, selectedVariant: variants[selected].id, lengthCm: length,
    recognizedWidthIndex: init.wIdx, initializedWidths: [...init.widths], fallbackWidthCm: data.fallback_width_cm,
    display, request: requests[0] ?? null, expectedQuantity, expectedCents: expectedQuantity * variants[selected].price };
  if (!o.blocked) {
    const item = requests[0].body.items?.[0] ?? requests[0].body;
    assert.equal(item.id, variants[selected].id, name + ' chosen variant');
    assert.equal(requests[0].body.items?.length ?? 1, 1, name + ' no services');
    assert.equal(item.properties._Gruppe, undefined);
    assert.equal(item.properties.Rollenbreite, `${display.widthCm} cm`);
    result.actualQuantity = item.quantity;
    result.actualCents = item.quantity * variants[selected].price;
    assert.equal(display.total, money(result.actualCents), name + ' display and payload agree');
    result.quantityMatchesSelectedWidth = item.quantity === expectedQuantity;
    assert.equal(result.quantityMatchesSelectedWidth, !o.knownWidthMismatch, name + ' width contract');
    if (o.knownWidthMismatch) {
      assert.equal(display.widthCm, widths[0]);
      assert.notEqual(display.widthCm, widths[selected]);
      result.issue = 'TP-009';
    }
  }
  rollCases.push(result);
}
await rollCase('metre labels first width');
await rollCase('metre labels second width', { selected: 1, knownWidthMismatch: true });
await rollCase('metre labels second width exact area', { selected: 1, length: 250, knownWidthMismatch: true });
await rollCase('metre labels reordered variants', { widths: [400,200], selected: 1, length: 250, knownWidthMismatch: true });
await rollCase('single metre-label width fallback', { widths: [400], length: 250 });
await rollCase('centimetre labels first width', { labels: 'cm' });
await rollCase('centimetre labels second width', { labels: 'cm', selected: 1 });
await rollCase('centimetre labels second width exact area', { labels: 'cm', selected: 1, length: 250 });
await rollCase('unavailable selected PVC variant', { labels: 'cm', selected: 1, unavailable: true, blocked: true });
await rollCase('empty PVC length', { labels: 'cm', length: '', blocked: true });

// Fixed-price/accessory: render the complete block, then use its original class
// to write a shared input consumed by the complete product-form class.
const fixedFile = 'blocks/tp-zubehoer-menge.liquid', formFile = 'assets/product-form.js';
const fixedSource = read(fixedFile), formSource = read(formFile).replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');
const fetchSource = between(read('assets/utilities.js'), 'export function fetchConfig(', '\n\n/**').replace(/^export /, '');
const lengths = JSON.parse(read('domains/shopify/leisten-stangenlaenge/stangenlaenge.json')).produkte;
const lengthOf = (handle) => Number(lengths.find((p) => p.handle === handle).stangenlaenge_m);
const fixedCases = [];
async function fixedCase(name, o = {}) {
  const specs = o.variants ?? [{ title: o.title ?? 'Weiss', options: [o.title ?? 'Weiss'] }];
  const variants = specs.map((v, i) => ({ id: `audit-fixed-${i}`, available: true, price: 1295 + i * 400,
    title: v.title, options: v.options, option1: v.options[0], option2: v.options[1],
    metafields: { custom: { reichweite_m2: val(o.coverage) } } }));
  const product = { id: 'audit-fixed', variants, selected_or_first_available_variant: variants[0],
    options_with_values: [{ name: o.optionName ?? 'Ausführung', position: 1, values: specs.map((v) => v.options[0]) }],
    metafields: { custom: { stangenlaenge: val(o.stange), bandlaenge: val(o.band) } } };
  const html = await liquid.parseAndRender(strip(fixedSource), { product, block: { id: 'audit_fixed' } });
  const mapMatch = html.match(/data-map='([^']+)'/);
  assert.equal(Boolean(mapMatch), !o.noHelper, name + ' Liquid gate');
  const qty = new Element(String(o.manualQuantity ?? 1)), id = new Element(variants[0].id);
  const parts = Object.fromEntries(['box','label','input','unit','result','hint'].map((n) => [`[data-${n}]`, new Element()]));
  const registry = new Map(), requests = [];
  const context = vm.createContext({ HTMLElement: Element, Component: class extends Element {}, AbortController,
    Event: class { constructor(type) { this.type = type; } },
    customElements: { get: (n) => registry.get(n), define: (n, cls) => registry.set(n, cls) },
    document: { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] },
    setTimeout: () => 0, clearTimeout() {}, Theme: { routes: { cart_add_url: '/cart/add.js' } },
    // Model successful controls only; native HTML constraint validation is not covered.
    FormData: class extends Map { constructor(form) { super(form.controls.map(([n, e]) => [n, e.value])); } append(n, v) { this.set(n, v); } },
    // Leave response pending: this step proves serialization, not cart lifecycle.
    fetch: (url, config) => { requests.push({ url, method: config.method, headers: { ...config.headers }, body: Object.fromEntries(config.body) });
      return new Promise(() => {}); },
  });
  let helper, renderedMap;
  if (mapMatch) {
    renderedMap = JSON.parse(mapMatch[1]);
    vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context, { filename: fixedFile, timeout: 1000 });
    const Helper = registry.get('tp-zubehoer-menge'); helper = new Helper();
    helper.dataset = { map: mapMatch[1], selected: variants[0].id };
    helper.querySelector = (s) => parts[s] ?? null;
    helper.closest = () => ({ querySelector: (s) => s.includes('name="quantity"') ? qty : id });
    helper.connectedCallback();
    parts['[data-input]'].value = String(o.input);
    parts['[data-input]'].emit('input');
    if (o.selected) { id.value = variants[o.selected].id; helper.render(); }
    assert.equal(renderedMap[id.value].m, o.mode, name + ' mode');
    assert.equal(qty.value, String(o.expected), name + ' calculated field');
    assert.match(parts['[data-result]'].textContent, /Die Menge ist eingetragen\./);
    assert.deepEqual(qty.events.slice(-2), ['input','change']);
  }
  vm.runInContext(fetchSource + '\n' + formSource, context, { filename: formFile, timeout: 1000 });
  const Form = registry.get('product-form-component'), form = new Form();
  const button = { refs: { addToCartButton: { disabled: Boolean(o.disabled) } }, disable() {}, enable() {} };
  form.refs = { variantId: id, quantitySelector: { getValue: () => Number(qty.value), canAddToCart: () => ({ canAdd: !o.maxBlocked, maxQuantity: 2 }) } };
  form.dataset = {};
  form.querySelectorAll = () => [button];
  form.querySelector = (s) => s === 'form' ? { controls: [['id',id], ['quantity',qty]] } : null;
  let prevented = false;
  form.handleSubmit({ preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.equal(requests.length, o.disabled || o.maxBlocked ? 0 : 1, name + ' requests');
  if (requests.length) {
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].body.id, id.value);
    assert.equal(requests[0].body.quantity, String(o.expected ?? o.manualQuantity));
    assert.deepEqual(Object.keys(requests[0].body).sort(), ['id','quantity']);
    assert.ok(Number.isSafeInteger(Number(qty.value)) && Number(qty.value) > 0);
  }
  fixedCases.push({ name, input: o, renderedMap: renderedMap ?? null, selectedVariant: id.value,
    quantity: qty.value, helperText: parts['[data-result]'].textContent, helperUnit: parts['[data-unit]'].textContent,
    request: requests[0] ?? null, modeledCartCents: requests.length ? Number(qty.value) * variants[o.selected ?? 0].price : null });
}
await fixedCase('Feldwin 2.5m rods', { stange: lengthOf('feldwin-sockelleiste-40mm'), input: '12', mode: 'stange', expected: 5 });
await fixedCase('Skarven 5.15m rods exact', { stange: lengthOf('skarven-sockelleiste-60mm'), input: '10,3', mode: 'stange', expected: 2 });
await fixedCase('Cortessa 2.4m floating boundary', { stange: lengthOf('cortessa-sockelleiste'), input: '7.2', mode: 'stange', expected: 3 });
const profiles = [{ title: '270 cm', options: ['270 cm'] }, { title: '100 cm', options: ['100 cm'] }];
await fixedCase('profile cm first variant', { variants: profiles, optionName: 'Länge', input: '5', mode: 'stange', expected: 2 });
await fixedCase('profile cm changed form ID', { variants: profiles, optionName: 'Länge', input: '5', selected: 1, mode: 'stange', expected: 5 });
await fixedCase('profile metre comma', { title: '2,7 m', optionName: 'Laenge', input: '5.5', mode: 'stange', expected: 3 });
await fixedCase('metafield tape length prepared data only', { band: 50, input: '51', mode: 'stange', expected: 2 });
await fixedCase('tape title length', { title: 'Rolle 70 mm × 25 m', input: '26', mode: 'stange', expected: 2 });
await fixedCase('underlay per running metre', { title: '1 mm, 80 cm breit (je lfm)', input: '20.1', mode: 'lfm', expected: 26 });
await fixedCase('underlay per square metre', { title: 'Unterlage (je m²)', input: '20.1', mode: 'qm', expected: 21 });
await fixedCase('roll area comma', { title: 'Rolle 30,14 m²', input: '60.28', mode: 'gebinde', expected: 2 });
await fixedCase('folded plate area', { title: 'Faltplatte 15 m²', input: '15.1', mode: 'gebinde', expected: 2 });
await fixedCase('roll dimensions', { title: 'Rolle 50 m x 100 cm', input: '50.1', mode: 'gebinde', expected: 2 });
await fixedCase('adhesive set explicit qm', { title: 'Set - 125 qm, 16 kg', input: '125.1', mode: 'gebinde', expected: 2 });
await fixedCase('coverage metafield prepared data only', { coverage: 40, input: '40.1', mode: 'gebinde', expected: 2 });
await fixedCase('ambiguous adhesive no helper', { title: 'RollFix 10 kg', noHelper: true, manualQuantity: 3 });
await fixedCase('contradictory roll area no helper', { title: 'Rolle 75 cm x 25 m (20 m²)', noHelper: true, manualQuantity: 2 });
await fixedCase('fixed size mat no helper', { title: 'Sauberlaufmatte 60 x 90 cm', noHelper: true, manualQuantity: 4 });
await fixedCase('disabled buy button blocks submit', { title: 'Stück', noHelper: true, manualQuantity: 1, disabled: true });
await fixedCase('standard maximum guard result blocks submit', { stange: 2.5, input: '12', mode: 'stange', expected: 5, maxBlocked: true });

const files = [rollFile, artFile, 'snippets/tp-farbe-daten.liquid', fixedFile, formFile, 'assets/utilities.js',
  'templates/product.rolle.json', 'templates/product.fixpreis.json', 'templates/product.zubehoer.json'];
const manifest = JSON.parse(read('audit/evidence/source-manifest.json'));
const sourceIntegrity = files.map((file) => ({ file, sha256: sha(read(file)), historicalLiveSha256: manifest.files[file]?.live?.sha256 ?? null }));
for (const s of sourceIntegrity) if (s.historicalLiveSha256) assert.equal(s.sha256, s.historicalLiveSha256, s.file);
process.stdout.write(JSON.stringify({ status: 'PASS', session: 'S07', matrix: 'PR-023b.2', generatedAt: new Date().toISOString(),
  cases: rollCases.length + fixedCases.length, requests: [...rollCases, ...fixedCases].filter((c) => c.request).length,
  confirmedIssues: ['TP-009'], sourceIntegrity,
  fixture: { allIdsSynthetic: true, allPricesSynthetic: true, currentLiveData: false,
    pvc: 'Historical title and two metre labels from GOOGLE_ROLLENWARE_EXCLUSION_LIST.csv:84; metafield pairing 2/4m modeled, not a current product read. Prices 2490/2790c per m² synthetic.',
    fixed: 'Historical rod lengths read from stangenlaenge.json. Accessory title rules from rechner-zuordnung/block; optional metafields are prepared-only test configurations. Prices 1295/1695c synthetic.' },
  limitations: ['Original Liquid via LiquidJS, not current Shopify rendering.',
    'Roll initial width selection, syncArtUi, calculation/submit functions executed. Drawing, service UI, lifecycle and real picker events excluded. Isolated URL-selected variant.',
    'Accessory full original class writes shared modeled input; complete product-form class and original fetchConfig serialize it. FormData and DOM mocked, quantity validation return supplied.',
    'Fixed form response deliberately stays pending; no server/cart response, real cart price rendering, sections/queue/morph, browser number sanitization, layout or checkout proof.',
    'TP-009 is a local conditional multi-width fallback defect; historical metre labels do not prove current live product configuration.',
    'No shop changes, no S01-S06 replay.' ], rollCases, fixedCases,
}, null, 2) + '\n');
