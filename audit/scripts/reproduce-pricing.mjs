// Audit-only reproduction. No network, browser, Shopify or theme writes.
// Executes the actual repository scripts in a small DOM adapter. The adapter
// is NOT browser evidence; the inherited runtime.json supplies historical UI evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const sha = (text) => createHash('sha256').update(text).digest('hex');
const packageFile = 'blocks/paket-auswahl.liquid';
const rollFile = 'blocks/tp-rollware-rechner.liquid';
const packageSource = read(packageFile);
const rollSource = read(rollFile);
const manifest = JSON.parse(read('audit/evidence/source-manifest.json'));
const historical = JSON.parse(read('audit/evidence/runtime.json'));
const packageScripts = [...packageSource.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)];
assert.equal(packageScripts.length, 1, 'Expected exactly one package calculator script');
const packageScript = packageScripts[0][1];

class Element {
  constructor(value = '') {
    this.value = value;
    this.textContent = '';
    this.hidden = false;
    this.checked = false;
    this.disabled = false;
    this.options = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  emit(type, event = {}) { return this.listeners.get(type)?.(event); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  appendChild(node) { this.options.push(node); }
}

const observations = [];
const finite = (value) => Number.isFinite(value) ? value : String(value);

async function packageCase(raw, { waste = true, blur = true, action = null } = {}) {
  const selectors = ['sqm-input', 'need-label', 'need-display', 'sqm-display',
    'package-display', 'package-word', 'unit-hint', 'pieces-line', 'total-display',
    'waste-checkbox', 'add-to-cart', 'cart-message'];
  const nodes = Object.fromEntries(selectors.map((s) => [`[data-${s}]`, new Element()]));
  nodes['[data-waste-checkbox]'].checked = waste;
  const component = new Element();
  // The numeric fixture is from the inherited Marlow cart payload. No invented product data.
  component.dataset = { sqmPerPackage: '2.08', packagePriceCents: '10598',
    variantId: '60332523127118', initialPackages: '1', pieceCount: '6', pieceLabel: 'Planken' };
  component.querySelector = (selector) => nodes[selector] ?? null;
  component.closest = () => null;
  const doc = new Element();
  doc.querySelector = (selector) => selector.startsWith('carpet-package-selector-') ? component : null;
  doc.dispatchEvent = () => {};
  const requests = [];
  const context = vm.createContext({
    document: doc, window: { location: {} }, setTimeout() {},
    CustomEvent: class { constructor(type, detail) { Object.assign(this, { type, ...detail }); } },
    fetch: async (url, options) => {
      requests.push({ url, method: options.method, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({}) };
    },
  });
  // Liquid identifiers remain literal, consistently in both query and handler.
  // No pricing/validation functions are replaced or reimplemented.
  vm.runInContext(packageScript, context, { filename: packageFile, timeout: 1000 });
  const input = nodes['[data-sqm-input]'];
  if (raw !== null) {
    input.value = raw;
    input.emit('input');
    if (blur) input.emit('blur');
  }
  const click = (selector) => component.emit('click', {
    target: { closest: (query) => query === selector ? nodes[query] ?? {} : null },
    preventDefault() {}, stopPropagation() {},
  });
  if (action) click(`[data-${action}]`);
  const result = {
    kind: 'package', input: raw, blur, waste, action,
    normalizedInput: input.value,
    required: nodes['[data-need-display]'].textContent,
    packages: nodes['[data-package-display]'].textContent,
    actualArea: nodes['[data-sqm-display]'].textContent,
    total: nodes['[data-total-display]'].textContent,
    errorBeforeSubmit: nodes['[data-cart-message]'].textContent,
    buttonDisabledBeforeSubmit: nodes['[data-add-to-cart]'].disabled,
  };
  click('[data-add-to-cart]');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1, 'Current code submits once in this single-click adapter');
  result.payload = requests[0];
  result.safeIntegerQuantity = Number.isSafeInteger(result.payload.body.quantity);
  observations.push(result);
  return result;
}

// Positive controls, compared with independent hand-calculated quantities/cents.
const normal = await packageCase('20');
assert.equal(normal.payload.body.quantity, 11);
assert.equal(normal.total, '1.165,78 €');
assert.equal((await packageCase('20', { waste: false })).payload.body.quantity, 10);
for (const raw of ['1,5', '1.5']) {
  const result = await packageCase(raw);
  assert.equal(result.payload.body.properties._bedarf_qm, '1,50');
  assert.equal(result.payload.body.quantity, 1);
}
for (const raw of [null, '', '0', '-1']) {
  assert.equal((await packageCase(raw)).payload.body.quantity, 1);
}
assert.equal((await packageCase('20.8', { waste: false })).payload.body.quantity, 10);
assert.equal((await packageCase('20.8')).payload.body.quantity, 11);
assert.equal((await packageCase(null, { action: 'increase-packages' })).payload.body.quantity, 2);

// Defect observations, not acceptance tests declaring the broken behavior correct.
const mixed = await packageCase('1.234,56');
assert.equal(mixed.payload.body.quantity, 1);
assert.equal(mixed.payload.body.properties._bedarf_qm, '1,23');
const trailing = await packageCase('20abc');
assert.equal(trailing.payload.body.quantity, 11);
assert.equal(trailing.errorBeforeSubmit, '');
const infinity = await packageCase('Infinity');
assert.equal(infinity.total, '∞ €');
assert.equal(infinity.payload.body.quantity, null, 'JSON serializes Infinity as null');
assert.equal(infinity.buttonDisabledBeforeSubmit, false);
const huge = await packageCase('999999999999999999999');
assert.equal(huge.safeIntegerQuantity, false);

// Exercise actual extras function and click listener. Only valid main dimensions
// and product/service context are fixtures; invalid extras remain real inputs.
const extrasStart = rollSource.indexOf('  function updateExtras(w, len, area) {');
const extrasEnd = rollSource.indexOf('\n  var einfassBox', extrasStart);
const missingStart = rollSource.indexOf('  function fehlendesFeld() {');
const missingEnd = rollSource.indexOf('\n  var target =', missingStart);
const clickStart = rollSource.indexOf("  cta.addEventListener('click', function () {");
const clickEnd = rollSource.indexOf('\n\n  calculate();\n}', clickStart);
assert.ok([extrasStart, extrasEnd, missingStart, missingEnd, clickStart, clickEnd].every((n) => n >= 0));

async function rollCase(raw, checked = true) {
  const fields = Object.fromEntries(['hoehe', 'an', 'felder', 'meter', 'hint', 'preis']
    .map((s) => [`[data-leiste-${s}]`, new Element()]));
  fields['[data-leiste-hoehe]'].value = 'audit-leiste';
  fields['[data-leiste-hoehe]'].options = [{}];
  fields['[data-leiste-an]'].checked = checked;
  fields['[data-leiste-meter]'].value = raw;
  fields['[data-leiste-meter]'].setAttribute('data-touched', '1');
  const leisteBox = { querySelector: (s) => fields[s] ?? null };
  const cta = new Element();
  const requests = [];
  const context = vm.createContext({
    leisteBox, haftBox: null, formulaExtras: null,
    // Synthetic service fixture: title and displayed minimum price occur in
    // historical text, but their exact variant/price pairing is not API-verified.
    leisteVarianten: [{ id: 'audit-leiste', title: '5 cm', price: 1095 }],
    haftVarianten: [], extrasAllowed: () => true, farbeText: () => 'Sand Hell – 004',
    fmt: (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    fmtArea: (n) => String(n),
    data: { product_title: 'Piumera Teppichboden 400cm 500cm' },
    inFlight: false, cta, ctaHint: new Element(), cartLink: new Element(),
    target: { id: 60330695491918, price: 6590, available: true,
      farbnummer: '004', farbe_intern: 'Sand Hell – 004' },
    cmExact: false, selectedWidth: () => 400, getEffectiveLengthCm: () => 200,
    artMode: () => 'meter', lengthInput: new Element('200'), MAX_LENGTH_CM: 1000,
    clearInvalid() {}, markInvalid() {}, calculate() {}, setTimeout() {},
    document: { dispatchEvent() {}, querySelector: () => null },
    CustomEvent: class {},
    fetch: async (url, options) => {
      requests.push({ url, method: options.method, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({}) };
    },
  });
  vm.runInContext(rollSource.slice(extrasStart, extrasEnd), context, { filename: rollFile, timeout: 1000 });
  vm.runInContext(rollSource.slice(missingStart, missingEnd), context, { filename: rollFile, timeout: 1000 });
  const extras = vm.runInContext('updateExtras(400, 200, 8)', context, { timeout: 1000 });
  vm.runInContext(rollSource.slice(clickStart, clickEnd), context, { filename: rollFile, timeout: 1000 });
  cta.emit('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1);
  // Remove nondeterministic group identifiers from synthetic results.
  for (const item of requests[0].body.items ?? [requests[0].body]) {
    if (item.properties?._Gruppe) item.properties._Gruppe = '[synthetic-group]';
  }
  const result = { kind: 'roll-extra', input: raw, checked,
    extraItems: JSON.parse(JSON.stringify(extras.items)), sum: finite(extras.sum),
    hint: fields['[data-leiste-hint]'].textContent, payload: requests[0] };
  observations.push(result);
  return result;
}
const rollNormal = await rollCase('12');
assert.equal(rollNormal.payload.body.items.length, 2);
assert.equal(rollNormal.payload.body.items[0].quantity, 8);
assert.equal(rollNormal.payload.body.items[1].quantity, 12);
assert.equal(Math.round(rollNormal.sum * 100), 13140);
assert.equal((await rollCase('2,5')).payload.body.items[1].quantity, 3);
assert.equal((await rollCase('12', false)).payload.body.quantity, 8);
for (const raw of ['', '0', '-1']) {
  const result = await rollCase(raw);
  assert.equal(result.extraItems.length, 0);
  assert.equal(result.payload.body.quantity, 8);
  assert.match(result.hint, /Bitte Höhe und Länge/);
}

const inheritedCases = historical.tests.map((t, index) => {
  let excerpt;
  if (t.text) {
    const start = t.text.includes('IHRE BESTELLUNG') ? t.text.indexOf('IHRE BESTELLUNG') : t.text.indexOf('4\nPASSENDE');
    const end = t.text.indexOf('Lieferzeit:', start);
    excerpt = start >= 0 ? t.text.slice(start, end > start ? end : start + 1800) : undefined;
  }
  return { index, label: t.label, viewport: t.viewport, overflow: t.overflow,
    status: t.status, payload: t.payload, cart: t.cart, total: t.total,
    diag: t.diag, excerpt };
});
const evidenceAgreement = [];
for (const width of [1440, 390]) {
  const find = (label) => historical.tests.find((t) => t.label === label && t.viewport.width === width);
  assert.deepEqual(normal.payload.body, find('package add 20').payload);
  assert.equal(find('package add 20').total, 116578);
  assert.equal(find('leiste checked empty submitted').payload.quantity, 8);
  assert.equal(find('leiste checked empty submitted').cart.length, 1);
  assert.match(find('package input "Infinity"').text, /Infinity/);
  evidenceAgreement.push({ width, normalPackagePayload: 'MATCH', rollEmptyExtraOmitted: 'MATCH', infinityDisplay: 'MATCH' });
}

const report = {
  generatedAt: new Date().toISOString(),
  scope: 'Local source execution + inherited live evidence; no new browser/API tests',
  reproductionStatus: 'PASS: observations reproduced; defects remain unfixed',
  historicalAt: historical.at,
  historicalBrowser: historical.browser,
  sourceBaseline: manifest.repository_commit,
  sourceIntegrity: [packageFile, rollFile].map((file) => ({ file,
    currentSha256: sha(read(file)), historicalLiveSha256: manifest.files[file].live.sha256,
    matchesHistoricalLive: sha(read(file)) === manifest.files[file].live.sha256 })),
  fixtureNotes: ['Package fixture from historical Marlow payload.',
    'Roll main fixture from historical Piumera payload; optional-service id is synthetic. The 1095-cent price comes from the displayed minimum; its pairing with 5 cm is not API-verified.',
    'DOM adapter cannot prove browser validation, layout, event ordering or server response.',
    'Invalid package payloads are intercepted; Shopify acceptance/rejection is unknown.'],
  evidenceAgreement,
  observations,
  inheritedCases,
};
assert.ok(report.sourceIntegrity.every((s) => s.matchesHistoricalLive), 'Source changed since inherited live capture; reassess evidence');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
