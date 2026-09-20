// TP-003: Eine ausgewählte, aber unvollständig konfigurierte Fußleiste
// (Checkbox an, keine gültige Länge) darf die Bestellung nicht als reinen
// Teppichkauf durchlassen. Führt die echten Funktionen aus
// blocks/tp-rollware-rechner.liquid in einem Node-VM-DOM-Adapter aus
// (gleicher Extraktionsansatz wie audit/scripts/reproduce-pricing.mjs).
// Kein Netzwerk, kein Shopify-Zugriff, keine Produktdatenänderung.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const rollFile = 'blocks/tp-rollware-rechner.liquid';
const rollSource = readFileSync(path.join(root, rollFile), 'utf8');

const extrasStart = rollSource.indexOf('  function updateExtras(w, len, area) {');
const extrasEnd = rollSource.indexOf('\n  var einfassBox', extrasStart);
const missingStart = rollSource.indexOf('  function fehlendesFeld() {');
const missingEnd = rollSource.indexOf('\n  var target =', missingStart);
const clickStart = rollSource.indexOf("  cta.addEventListener('click', function () {");
const clickEnd = rollSource.indexOf('\n\n  calculate();\n}', clickStart);
assert.ok([extrasStart, extrasEnd, missingStart, missingEnd, clickStart, clickEnd].every((n) => n >= 0),
  'Funktionsgrenzen nicht gefunden - Quelltext hat sich strukturell verändert');

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
  focus() {}
}

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
  return {
    requestCount: requests.length,
    payload: requests[0],
    extraItems: JSON.parse(JSON.stringify(extras.items)),
    leisteInvalid: extras.leisteInvalid,
    hint: fields['[data-leiste-hint]'].textContent,
  };
}

test('Regression: gültige Fußleistenlänge bleibt kaufbar (2 Positionen)', async () => {
  const result = await rollCase('12');
  assert.equal(result.requestCount, 1);
  assert.equal(result.payload.body.items.length, 2);
  assert.equal(result.payload.body.items[0].quantity, 8);
  assert.equal(result.payload.body.items[1].quantity, 12);
  assert.equal(result.leisteInvalid, false);
});

test('Regression: Checkbox aus -> nur Hauptware, kein Block', async () => {
  const result = await rollCase('12', false);
  assert.equal(result.requestCount, 1);
  assert.equal(result.payload.body.quantity, 8);
  assert.equal(result.leisteInvalid, false);
});

test('Regression: "2,5" wird weiterhin auf 3 volle Meter aufgerundet', async () => {
  const result = await rollCase('2,5');
  assert.equal(result.requestCount, 1);
  assert.equal(result.payload.body.items[1].quantity, 3);
  assert.equal(result.leisteInvalid, false);
});

test('TP-003: angehakte Fußleiste ohne Länge blockiert den gesamten Request', async () => {
  for (const raw of ['', '0', '-1']) {
    const result = await rollCase(raw);
    assert.equal(result.requestCount, 0, `raw=${raw}: es darf kein Cart-Request stattfinden`);
    assert.equal(result.leisteInvalid, true, `raw=${raw}`);
    assert.match(result.hint, /Bitte Höhe und Länge/, `raw=${raw}`);
  }
});
