// PR-020: source-level audit only. No network, Shopify writes or browser.
// The conditional cmExact fixture does NOT establish an active live product.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const blockFile = 'blocks/tp-rollware-rechner.liquid';
const artFile = 'assets/tp-rollware-art.js';
const mailFile = 'domains/shopify/benachrichtigungen/interne-bestellmail-block.liquid';
const source = read(blockFile);
const manifest = JSON.parse(read('audit/evidence/source-manifest.json'));

function between(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Source anchors changed: ${start}`);
  return source.slice(a, b);
}
const calculateSource = between('  function calculate() {', '\n  // Zuschnitt und Kettelung');
const submitSource = between("  cta.addEventListener('click', function () {", '\n\n  calculate();\n}');
const expression = 'var qty = cmExact ? Math.round(area * 100) : Math.ceil(area);';
assert.equal(source.split(expression).length - 1, 2, 'Audit must cover both calculation and submit');
assert.ok(calculateSource.includes(expression) && submitSource.includes(expression));
const areaSource = calculateSource.match(/var area =[^;]+;/)?.[0];
assert.ok(areaSource, 'Missing source area code');
const quantitySource = areaSource + '\n' + expression;
const quantity = vm.runInNewContext(`(w, len, cmExact) => { ${quantitySource} return qty; }`);
const sourceBounds = {
  widthMin: Number(source.match(/var WUNSCH_MIN_CM = (\d+);/)[1]),
  lengthMax: Number(source.match(/var MAX_LENGTH_CM = (\d+);/)[1]),
};
assert.ok(calculateSource.includes('len >= 100'));
assert.ok(source.includes('product.metafields.custom.preis_pro_001_qm.value == true'));

// Independent integer arithmetic: cm² -> 0.01-m² units, half up. Maximum
// tested numerator is < 2.5 million; every integer involved is represented exactly.
const expectedQty = (w, len, exact) => exact
  ? Math.floor((w * len + 50) / 100)
  : Math.floor((w * len + 9999) / 10000);
let pairs = 0, ties = 0, exactMismatches = 0, wholeMismatches = 0, maxDifference = 0;
const firstExamples = [];
for (let w = sourceBounds.widthMin; w <= 495; w++) {
  for (let len = 100; len <= sourceBounds.lengthMax; len++) {
    pairs++;
    const cm2 = w * len;
    if (cm2 % 100 === 50) ties++;
    const actual = quantity(w, len, true), expected = expectedQty(w, len, true);
    if (actual !== expected) {
      exactMismatches++;
      maxDifference = Math.max(maxDifference, Math.abs(actual - expected));
      assert.equal(cm2 % 100, 50, 'Mismatch must be a half-unit boundary');
      assert.equal(actual, expected - 1, 'Observed difference is always one unit down');
      if (firstExamples.length < 8) firstExamples.push({ w, len, actual, expected, binaryScaledArea: cm2 / 10000 * 100 });
    }
    if (quantity(w, len, false) !== expectedQty(w, len, false)) wholeMismatches++;
  }
}
assert.equal(pairs, 2185846);
assert.equal(exactMismatches, 3310, 'Reassess findings if the source behavior changes');
assert.equal(wholeMismatches, 0);
let meterCases = 0;
for (const w of [200, 300, 400, 500]) {
  for (let len = 100; len <= sourceBounds.lengthMax; len++) {
    assert.equal(quantity(w, len, true), w * len / 100);
    assert.equal(quantity(w, len, false), expectedQty(w, len, false));
    meterCases++;
  }
}

class Element {
  constructor(value = '') {
    this.value = value; this.textContent = ''; this.hidden = false; this.disabled = false;
    this.validity = { badInput: false }; this.listeners = new Map(); this.attributes = new Map();
    this.children = []; this.tagName = 'INPUT';
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  emit(type) { return this.listeners.get(type)?.(); }
  appendChild(child) { this.children.push(child); }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
  get firstChild() { return this.children[0] ?? null; }
  focus() { this.focused = true; }
}

const helpers = [
  between('  function fehlendesFeld()', '\n  var target ='),
  between('  function norm(s)', '\n  // Im Raummass-Modus'),
  between('  function selectedWidth()', '\n  // Schritt 2 je Farbe'),
  between('  function updateMeterTipp(', '\n  // Groesster Rahmen'),
  between('  function getEffectiveLengthCm()', '\n  var SVG_NS'),
].join('\n');
const engine = new Liquid();
const observations = [];

async function roomCase(width, length, cmExact, mode = 'raum') {
  const nodes = Object.fromEntries(['messRaum', 'wunschError', 'errComma', 'errMin', 'errMax',
    'errStock', 'calcBox', 'drawFigure', 'formulaArea', 'formulaRound', 'formulaPrice',
    'outTotal', 'cta', 'ctaHint', 'cartLink', 'meterTipp', 'widthSeg'].map((name) => [name, new Element()]));
  const wunschInput = new Element(String(width));
  const lengthInput = new Element(String(length));
  const numericWidths = [400, 500];
  const unitPriceCents = cmExact ? 89 : 8900;
  const variants = numericWidths.map((w) => ({ id: `audit-meter-${w}`, options: ['Auditfarbe', `${w}cm`], price: cmExact ? 66 : 6590, available: true }));
  variants.push({ id: 'audit-raum', options: ['Auditfarbe', 'Wunschmaß'], price: unitPriceCents, available: true, wunschmass: true });
  const requests = [];
  const context = vm.createContext({
    ...nodes, wunschInput, lengthInput, cmExact, wIdx: 1, widths: numericWidths,
    farbBreiten: numericWidths, variants, data: { selected_options: ['Auditfarbe', '400cm'] },
    target: null, inFlight: false, WUNSCH_MIN_CM: sourceBounds.widthMin, MAX_LENGTH_CM: sourceBounds.lengthMax,
    root: { querySelector: () => ({ value: String(width) }) },
    window: { location: { search: '' } }, URLSearchParams,
    document: { querySelector: () => null, dispatchEvent() {}, createElement: () => new Element(), createTextNode: (text) => ({ textContent: text }) },
    CustomEvent: class {},
    // Explicitly excluded: rendering geometry, section transitions, extras,
    // service eligibility and pointer/browser lifecycle. Price helpers remain original.
    artMode: () => mode, syncArtUi() {}, updateEinfassChips() {}, draw() {},
    updateExtras: () => ({ items: [], sum: 0 }), renumberSteps() {}, applyServiceState() {},
    clearInvalid() {}, markInvalid() {}, setTimeout() {},
    fetch: async (url, options) => {
      requests.push({ url, method: options.method, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({}) };
    },
  });
  vm.runInContext(read(artFile), context, { filename: artFile, timeout: 1000 });
  vm.runInContext('var ART = window.TPRollwareArt; function maxRaumBreite() { return ART.maxRaumBreite(farbBreiten); }', context);
  vm.runInContext(helpers + '\n' + calculateSource + '\n' + submitSource, context, { filename: blockFile, timeout: 1000 });
  vm.runInContext('calculate()', context, { timeout: 1000 });
  const beforeSubmit = {
    price: nodes.outTotal.textContent, areaFormula: nodes.formulaArea.textContent,
    priceFormula: nodes.formulaPrice.textContent, cta: nodes.cta.textContent,
    ariaDisabled: nodes.cta.attributes.get('aria-disabled'),
    widthError: nodes.wunschError.textContent,
    hint: nodes.meterTipp.hidden ? null : nodes.meterTipp.children.map((n) => n.textContent).join(''),
  };
  nodes.cta.emit('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(requests.length <= 1);
  const result = { input: { width, length, cmExact, mode }, beforeSubmit, request: requests[0] ?? null };
  if (requests.length) {
    const item = requests[0].body;
    const roundedWidth = Math.ceil(Number(width)), roundedLength = Math.ceil(Number(length));
    const actualUnit = variants.find((v) => v.id === item.id).price;
    const expected = expectedQty(roundedWidth, roundedLength, cmExact);
    const cents = item.quantity * actualUnit;
    result.oracle = { expectedQty: expected, actualQty: item.quantity,
      expectedLineCents: expected * actualUnit, payloadLineCents: cents,
      matchesRoundingRule: expected === item.quantity,
      displayMatchesPayload: beforeSubmit.price === new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100) + ' €' };
    assert.equal(result.oracle.displayMatchesPayload, true);
    const html = await engine.parseAndRender(read(mailFile), {
      name: '#AUDIT', created_at: '2026-09-20T00:00:00Z', email: 'audit@example.invalid',
      line_items: [{ title: 'Synthetic room fixture', quantity: item.quantity, properties: Object.entries(item.properties),
        product: { metafields: { custom: { preis_pro_001_qm: cmExact } } }, variant: { metafields: {} } }],
    });
    result.notification = { engine: 'LiquidJS; no Shopify rendering or actual email sent',
      warningTooSmall: html.includes('MENGE ZU KLEIN'), stopCutting: html.includes('NICHT ZUSCHNEIDEN'),
      matches: (html.match(/>passt</g) || []).length };
    assert.equal(result.notification.warningTooSmall, expected > item.quantity);
  }
  observations.push(result);
  return result;
}

// Distinct requested examples, defect boundaries, adjacent valid controls,
// practical dimensions and documented 365x302 rounding distinction.
for (const dims of [[250, 201], [333, 200], [365, 301], [365, 302], [50, 203],
  [250, 169], [250, 333], [250, 332], [250, 334], [350, 129], [395, 200], [396, 200], [495, 5000]]) {
  for (const exact of [false, true]) {
    const row = await roomCase(...dims, exact);
    assert.ok(row.request, 'Valid fixture must submit');
    assert.equal(row.request.body.properties['Aus Rolle'], dims[0] <= 395 ? '400 cm' : '500 cm');
  }
}
for (const dims of [[49, 200], [496, 200], [250, 99], [250, 5001], ['', 200], [250, '']]) {
  const row = await roomCase(...dims, true);
  assert.equal(row.request, null, 'Out-of-bounds/empty main dimensions must not submit');
  assert.equal(row.beforeSubmit.ariaDisabled, 'true');
}
for (const w of [400, 500]) {
  const row = await roomCase(w, 203, true, 'meter');
  assert.ok(row.request);
  assert.equal(row.oracle.matchesRoundingRule, true);
}
const decimalInput = await roomCase('250.1', '200.1', true);
assert.equal(decimalInput.request.body.properties['Ihre Breite'], '251 cm');
assert.equal(decimalInput.request.body.properties['Gewünschte Länge'], '201 cm');

const defect = observations.find((r) => r.input.width === 250 && r.input.length === 333 && r.input.cmExact);
assert.equal(defect.request.body.quantity, 832);
assert.equal(defect.oracle.expectedQty, 833);
assert.equal(defect.oracle.payloadLineCents, 74048);
assert.equal(defect.oracle.expectedLineCents, 74137);
assert.equal(defect.notification.stopCutting, true);
const hintDefect = observations.find((r) => r.input.width === 350 && r.input.length === 129 && r.input.cmExact);
assert.match(hintDefect.beforeSubmit.hint, /340,56 € statt 401,39 €/);
assert.equal(hintDefect.oracle.expectedLineCents, 40228);

const report = {
  generatedAt: new Date().toISOString(), scope: 'PR-020 only; read-only local original-code execution',
  status: 'PASS: controls and conditional defect reproduced; no fix implemented',
  fixture: { declaredLiveProduct: null, note: 'Synthetic variant IDs and conditional cmExact data. Whole-square-metre reference rates 65.90/89 EUR reflect historical Piumera text. Exact-mode fixtures use 66/89 cents per 0.01 m²; this is not a claim that Piumera or another live roll product is configured that way.',
    widths: [400, 500], maxRoomWidth: 495 },
  sourceIntegrity: [blockFile, artFile, mailFile].map((file) => ({ file, currentSha256: sha(read(file)),
    historicalLiveSha256: manifest.files[file]?.live.sha256 ?? null,
    matchesHistoricalLive: manifest.files[file] ? sha(read(file)) === manifest.files[file].live.sha256 : null })),
  grid: { widthMin: sourceBounds.widthMin, widthMax: 495, lengthMin: 100, lengthMax: sourceBounds.lengthMax,
    pairs, halfUnitBoundaries: ties, exactMismatches, wholeMismatches, maxDifferenceUnits: maxDifference,
    firstExamples, meterWidthCases: meterCases, meterMismatches: 0 },
  integrationCases: observations.length,
  limitations: ['No current live cmExact product established; conditional code finding only.',
    'No browser input normalization, service eligibility, variant transition, extras or layout verification.',
    'Requests intercepted before network; line cents calculated from fixture unit price and actual payload quantity.',
    'LiquidJS notification is local, not Shopify Liquid, and template deployment is unknown.',
    'Independent integer oracle checks existing rounding policy, not a new business rule.'],
  observations,
};
assert.ok(report.sourceIntegrity.slice(0, 2).every((row) => row.matchesHistoricalLive));
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
