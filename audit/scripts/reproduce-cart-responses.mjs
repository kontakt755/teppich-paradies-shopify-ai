// S11: original cart + renderer + events. No network or production mutation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
const read = f => fs.readFileSync(f, 'utf8');
const strip = f => read(f).replace(/^import\s[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '');
const flush = () => new Promise(resolve => setImmediate(resolve));
const files = ['assets/component-cart-items.js', 'assets/section-renderer.js', 'assets/events.js', 'assets/utilities.js'];
const manifest = JSON.parse(read('audit/evidence/source-manifest.json'));
const hashes = files.map(file => {
  const sha256 = createHash('sha256').update(read(file)).digest('hex');
  assert.equal(sha256, manifest.files[file].live.sha256);
  return { file, sha256, historicalMatch: true };
});
function harness(drawer = false) {
  const requests = [], morphs = [], errors = [], events = [], listeners = new Map(), registry = new Map();
  class Element extends EventTarget {
    constructor() { super(); this.dataset = {}; this.refs = {}; this.textContent = ''; const c = new Set(); this.classList = { add: x => c.add(x), remove: x => c.delete(x), contains: x => c.has(x) }; }
    connectedCallback() {} disconnectedCallback() {}
    querySelector() { return null; }
    dispatchEvent(e) { super.dispatchEvent(e); events.push({ type: e.type, detail: e.detail }); if (e.bubbles) deliver(e); return true; }
  }
  const deliver = e => { for (const fn of listeners.get(e.type) ?? []) fn(e); };
  let cart;
  const document = {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    querySelector: () => null,
    querySelectorAll: selector => selector === 'cart-items-component' ? [cart] : [],
    getElementById: id => ({ id }),
  };
  const rows = keys => {
    cart.refs.quantitySelectors = keys.map(key => { const input = new Element(); input.key = key; input.defaultValue = '2'; input.value = '7'; return { querySelector: () => input }; });
    keys.forEach((key, i) => { cart.refs[`cartItemError-${i + 1}`] = Object.assign(new Element(), { key }); cart.refs[`cartItemErrorContainer-${i + 1}`] = new Element(); });
  };
  const context = vm.createContext({ Event, Component: Element, Node: Element, HTMLElement: Element, HTMLButtonElement: Element,
    URL, AbortController, setTimeout, clearTimeout, Shopify: { designMode: false }, document,
    window: { location: { href: 'https://fixture.invalid/cart', pathname: '/cart' }, addEventListener() {} },
    customElements: { get: n => registry.get(n), define: (n, c) => registry.set(n, c) },
    Theme: { routes: { cart_change_url: '/cart/change.js', cart_update_url: '/cart/update.js' } },
    console: { error: e => errors.push(e.message) },
    cartPerformance: { createStartingMarker() {}, measureFromMarker() {} }, resetShimmer() {},
    DOMParser: class { parseFromString(html) { return { querySelector: () => ({ textContent: '2' }), getElementById: id => ({ id, html }) }; } },
    MORPH_OPTIONS: {}, morph: (old, next, options) => morphs.push({ html: next.html, hydration: options.hydrationMode }),
    fetch: (url, config) => new Promise((resolve, reject) => requests.push({ url, body: config?.body ? JSON.parse(config.body) : null, resolve, reject })),
  });
  vm.runInContext(strip('assets/events.js'), context);
  const utilities = read('assets/utilities.js');
  const start = utilities.indexOf('export function fetchConfig('), end = utilities.indexOf('/**\n * Creates a throttled', start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(utilities.slice(start, end).replace(/^export /gm, ''), context);
  vm.runInContext(strip('assets/section-renderer.js'), context);
  vm.runInContext(strip('assets/component-cart-items.js'), context);
  cart = new (registry.get('cart-items-component'))(); cart.dataset.sectionId = 'cart'; if (drawer) cart.dataset.drawer = '';
  rows(['A', 'B']); cart.connectedCallback();
  const update = (line = 1, quantity = 3) => cart.updateQuantity({ line, quantity, action: 'change' });
  const answer = async (i, html) => { requests[i].resolve({ text: async () => JSON.stringify({ items: [], sections: { cart: html } }) }); await flush(); };
  const fail = async (i, message) => { requests[i].resolve({ text: async () => JSON.stringify({ errors: message }) }); await flush(); };
  const discount = () => deliver(vm.runInContext("new DiscountUpdateEvent({}, 'discount')", context));
  return { cart, rows, update, answer, fail, discount, requests, morphs, errors, events };
}
const cases = [];
for (const drawer of [false, true]) {
  const h = harness(drawer); h.update(); assert.equal(h.cart.classList.contains('cart-items-disabled'), true);
  await h.answer(0, 'current');
  assert.deepEqual(h.morphs, [{ html: 'current', hydration: drawer }]);
  assert.equal(h.cart.classList.contains('cart-items-disabled'), false);
  assert.equal(h.events[0].detail.data.sections.cart, 'current'); assert.deepEqual(h.errors, []);
  cases.push({ name: drawer ? 'drawer-direct-success' : 'page-direct-success', morphs: h.morphs });
}
for (const order of ['new-first', 'old-first']) {
  const h = harness(); h.update(1, 3); h.update(1, 4);
  const first = order === 'new-first' ? 1 : 0, last = 1 - first;
  await h.answer(first, first ? 'new' : 'old');
  const unlockedWithPendingRequest = !h.cart.classList.contains('cart-items-disabled');
  assert.equal(unlockedWithPendingRequest, true);
  await h.answer(last, last ? 'new' : 'old');
  assert.equal(h.morphs.at(-1).html, order === 'new-first' ? 'old' : 'new');
  cases.push({ name: `two-direct-${order}`, morphs: h.morphs, unlockedWithPendingRequest, boundary: 'Two direct method calls bypass pointer/debounce reachability; conditional H-013.' });
}
for (const order of ['section-first', 'cart-first']) {
  const h = harness(); h.discount(); assert.equal(h.requests[0].body, null);
  h.update();
  const section = async () => { h.requests[0].resolve({ text: async () => 'older-section' }); await flush(); };
  if (order === 'section-first') { await section(); await h.answer(1, 'new-cart'); }
  else { await h.answer(1, 'new-cart'); await section(); }
  assert.equal(h.morphs.at(-1).html, order === 'cart-first' ? 'older-section' : 'new-cart');
  assert.deepEqual(h.errors, []);
  cases.push({ name: order, morphs: h.morphs, boundary: 'Original discount listener, but response snapshots and timing synthetic; H-013.' });
}
for (const shifted of [false, true]) {
  const h = harness(); h.update(1, 7); if (shifted) h.rows(['B']);
  await h.fail(0, 'synthetic-stock-error');
  const target = h.cart.refs['cartItemError-1'].key;
  assert.equal(target, shifted ? 'B' : 'A'); assert.equal(h.cart.refs['cartItemError-1'].textContent, 'synthetic-stock-error');
  assert.equal(h.cart.refs.quantitySelectors[0].querySelector().value, '2');
  assert.deepEqual(h.errors, []);
  cases.push({ name: shifted ? 'error-after-ref-shift' : 'error-stable-refs', requestedKey: 'A', feedbackKey: target, boundary: shifted ? 'Refs replaced manually; real MutationObserver/morph reachability open H-013.' : 'Stable-row control.' });
}
const report = { session: 'S11', task: 'CART-002b.2b', status: 'PASS', hashes, cases, confirmedNewIssues: 0,
  limitations: 'Full original CartItems/SectionRenderer/events, original fetchConfig/debounce. Synthetic fetch snapshots, minimal DOM/Component/refs and morph recorder. No browser, server mutation ordering or real DOM morph. Conditional concurrency results H-013, not confirmed live defects.' };
fs.writeFileSync('audit/evidence/cart-responses-2026-09-21.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, cases: cases.length, hashes: hashes.length, confirmedNewIssues: 0 }));
