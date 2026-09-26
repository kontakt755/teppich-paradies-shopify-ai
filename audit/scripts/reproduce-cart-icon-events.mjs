import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/cart-icon.js', 'assets/product-form.js', 'assets/events.js', 'snippets/header-actions.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class ClassList {
  #values = new Set();
  toggle(value, force) { if (force) this.#values.add(value); else this.#values.delete(value); return force; }
  add(value) { this.#values.add(value); }
  remove(value) { this.#values.delete(value); }
  contains(value) { return this.#values.has(value); }
}
class FakeElement extends EventTarget {
  constructor() { super(); this.classList = new ClassList(); this.textContent = ''; this.refs = {}; }
}
class Component extends FakeElement {
  connectedCallback() {}
  disconnectedCallback() {}
}
class CartUpdateEvent extends Event {
  constructor(data) { super('cart:update'); this.detail = { data }; }
}

function runtime() {
  const registry = new Map();
  const document = new EventTarget();
  const window = new EventTarget();
  const stored = new Map();
  const sessionStorage = { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  const context = vm.createContext({
    Event, EventTarget, HTMLElement: FakeElement, Component, document, window, sessionStorage,
    ThemeEvents: { cartUpdate: 'cart:update' }, CartUpdateEvent,
    onAnimationEnd: async () => {}, requestAnimationFrame: (callback) => callback(), Date, JSON,
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
  });
  vm.runInContext(read('assets/cart-icon.js').replace(/^import .*;\n/gm, ''), context);
  return { CartIcon: registry.get('cart-icon'), document, window, sessionStorage };
}

function harness(count = 2) {
  const h = runtime();
  const icon = new h.CartIcon();
  const cartBubbleCount = new FakeElement();
  cartBubbleCount.textContent = String(count);
  icon.refs = { cartBubble: new FakeElement(), cartBubbleText: new FakeElement(), cartBubbleCount };
  return { ...h, icon };
}

function dispatch(document, data) { document.dispatchEvent(new CartUpdateEvent(data)); }

const cases = [];
{
  const h = harness(2); h.icon.connectedCallback();
  dispatch(h.document, { source: 'product-form-component', itemCount: 3 });
  assert.equal(h.icon.currentCartCount, 5);
  cases.push({ name: 'successful-product-form-add-is-additive', count: h.icon.currentCartCount });
}
{
  const h = harness(7); h.icon.connectedCallback();
  dispatch(h.document, { source: 'cart-items-component', itemCount: 4 });
  assert.equal(h.icon.currentCartCount, 4);
  cases.push({ name: 'cart-items-update-is-absolute', count: h.icon.currentCartCount });
}
{
  const h = harness(2); h.icon.connectedCallback();
  dispatch(h.document, { source: 'product-form-component', itemCount: 9, didError: true });
  assert.equal(h.icon.currentCartCount, 11);
  const stored = JSON.parse(h.sessionStorage.getItem('cart-count'));
  assert.equal(stored.value, '11');
  cases.push({ name: 'failed-product-form-add-still-increments', didErrorIgnored: true, count: h.icon.currentCartCount, storedCount: stored.value });
}
{
  const h = harness(2); h.icon.connectedCallback(); h.icon.disconnectedCallback();
  dispatch(h.document, { source: 'product-form-component', itemCount: 3 });
  assert.equal(h.icon.currentCartCount, 2);
  h.icon.connectedCallback();
  dispatch(h.document, { source: 'product-form-component', itemCount: 3 });
  assert.equal(h.icon.currentCartCount, 5);
  cases.push({ name: 'disconnect-reconnect-listeners-healthy', disconnectedCount: 2, reconnectCount: h.icon.currentCartCount });
}
{
  const h = harness(1);
  h.sessionStorage.setItem('cart-count', JSON.stringify({ value: '6', timestamp: Date.now() }));
  h.icon.connectedCallback();
  assert.equal(h.icon.currentCartCount, 6);
  cases.push({ name: 'recent-session-count-restored', count: h.icon.currentCartCount });
}

const productForm = read('assets/product-form.js');
const failedEvents = [...productForm.matchAll(/didError:\s*true,[\s\S]{0,160}?itemCount:/g)].length;
assert.ok(failedEvents >= 2);
const header = read('sections/header.liquid');
assert.match(header, /render 'header-actions'/);

const report = {
  session: 'S41', task: 'JS-001o', status: 'PASS', hashes, cases,
  sourceContract: {
    productFormFailedCartUpdatePaths: failedEvents,
    cartIconChecksDidError: /didError/.test(read('assets/cart-icon.js')),
    headerRendersCartIcon: true,
  },
  limits: 'Original complete CartIcon; Component/DOM/window/document/sessionStorage/animation adapted with native EventTarget. Additive product-form, absolute cart, didError, reconnect and recent-session paths executed. ProductForm was source-checked for failed CartAddEvent contracts, not refetched or submitted. Real backend partial-add quantity, animation, bfcache, browser and live theme not tested.',
};
fs.writeFileSync('audit/evidence/cart-icon-events-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: ${cases.length} cart-icon observations; ${failedEvents} ProductForm didError event paths`);
