// TP-001/TP-002: Paketrechner darf ungültige, gemischte oder unsicher große
// Zahlen weder still umdeuten noch in den Warenkorb übernehmen.
// Führt das echte <script> aus blocks/paket-auswahl.liquid in einem
// Node-VM-DOM-Adapter aus (gleicher Ansatz wie audit/scripts/reproduce-pricing.mjs).
// Kein Netzwerk, kein Shopify-Zugriff, keine Produktdatenänderung.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const packageFile = 'blocks/paket-auswahl.liquid';
const packageSource = readFileSync(path.join(root, packageFile), 'utf8');
const [, packageScript] = packageSource.match(/<script>\s*([\s\S]*?)<\/script>/);

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
  focus() {}
  emit(type, event = {}) { return this.listeners.get(type)?.(event); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  appendChild(node) { this.options.push(node); }
}

async function packageCase(raw, { waste = true, blur = true, action = null, submit = true } = {}) {
  const selectors = ['sqm-input', 'need-label', 'need-display', 'sqm-display',
    'package-display', 'package-word', 'unit-hint', 'pieces-line', 'total-display',
    'waste-checkbox', 'add-to-cart', 'cart-message'];
  const nodes = Object.fromEntries(selectors.map((s) => [`[data-${s}]`, new Element()]));
  nodes['[data-waste-checkbox]'].checked = waste;
  const component = new Element();
  // Fixture identisch zum Audit (historischer Marlow-Cart-Payload).
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
  if (submit) click('[data-add-to-cart]');
  await new Promise((resolve) => setImmediate(resolve));
  return {
    requests,
    normalizedInput: input.value,
    errorMessage: nodes['[data-cart-message]'].textContent,
    isError: nodes['[data-cart-message]'].getAttribute('data-error') === 'true',
    packages: nodes['[data-package-display]'].textContent,
    total: nodes['[data-total-display]'].textContent,
  };
}

test('gültige Eingaben bleiben unverändert (Regression)', async () => {
  const normal = await packageCase('20');
  assert.equal(normal.requests.length, 1);
  assert.equal(normal.requests[0].body.quantity, 11);
  assert.equal(normal.total, '1.165,78 €');

  assert.equal((await packageCase('20', { waste: false })).requests[0].body.quantity, 10);
  assert.equal((await packageCase('20.8', { waste: false })).requests[0].body.quantity, 10);
  assert.equal((await packageCase('20.8')).requests[0].body.quantity, 11);
  assert.equal((await packageCase(null, { action: 'increase-packages' })).requests[0].body.quantity, 2);
});

test('"1,5" und "1.5" verhalten sich identisch', async () => {
  for (const raw of ['1,5', '1.5']) {
    const result = await packageCase(raw);
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0].body.properties._bedarf_qm, '1,50');
    assert.equal(result.requests[0].body.quantity, 1);
  }
});

test('leer/0/-1 bleiben der bewusste Ein-Paket-Ruhezustand', async () => {
  for (const raw of [null, '', '0', '-1']) {
    const result = await packageCase(raw);
    assert.equal(result.requests.length, 1, `raw=${raw}`);
    assert.equal(result.requests[0].body.quantity, 1, `raw=${raw}`);
    assert.equal(result.isError, false, `raw=${raw}`);
  }
});

test('TP-001: "1.234,56" wird vollständig interpretiert statt am ersten Punkt abgeschnitten', async () => {
  const result = await packageCase('1.234,56');
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].body.quantity, 624, '1.234,56 m² + 5% Verschnitt / 2,08 m² pro Paket = 624 Pakete');
  assert.equal(result.requests[0].body.properties._bedarf_qm, '1234,56');
});

test('TP-001: "20abc" wird abgelehnt, kein Cart-Request, kein stiller Teilwert', async () => {
  const result = await packageCase('20abc');
  assert.equal(result.requests.length, 0);
  assert.equal(result.isError, true);
  assert.match(result.errorMessage, /nicht gelesen werden/);
});

test('TP-002: "Infinity" wird abgelehnt, kein Cart-Request', async () => {
  const result = await packageCase('Infinity');
  assert.equal(result.requests.length, 0);
  assert.equal(result.isError, true);
});

test('TP-002: extrem große Zahl wird als unsicher abgelehnt, kein Cart-Request', async () => {
  const result = await packageCase('999999999999999999999');
  assert.equal(result.requests.length, 0);
  assert.equal(result.isError, true);
  assert.match(result.errorMessage, /zu groß/);
});

test('TP-001/TP-002: unmittelbarer Klick ohne Blur wird ebenfalls geprüft', async () => {
  const result = await packageCase('20abc', { blur: false });
  assert.equal(result.requests.length, 0);
  assert.equal(result.isError, true);
});

test('nach Korrektur ist die Eingabe wieder kaufbar', async () => {
  // Erst ungültig (Blur zeigt Fehler), dann korrigiert und erneut abgesendet.
  const invalid = await packageCase('20abc', { submit: false });
  assert.equal(invalid.isError, true);

  const corrected = await packageCase('20');
  assert.equal(corrected.requests.length, 1);
  assert.equal(corrected.requests[0].body.quantity, 11);
  assert.equal(corrected.isError, false);
});
