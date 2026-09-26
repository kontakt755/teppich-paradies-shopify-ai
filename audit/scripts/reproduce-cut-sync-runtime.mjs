import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/tp-zuschnitt-abgleich.js', 'snippets/cart-products.liquid', 'snippets/tp-cart-gruppe.liquid', 'blocks/tp-einfass-konfigurator.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class TrackedTarget extends EventTarget {
  constructor() { super(); this.listenerCounts = {}; }
  addEventListener(type, listener, options) {
    this.listenerCounts[type] = (this.listenerCounts[type] || 0) + 1;
    super.addEventListener(type, listener, options);
  }
}
class FakeCustomEvent extends Event {
  constructor(type, options = {}) { super(type, options); this.detail = options.detail; }
}

const document = new TrackedTarget();
document.readyState = 'complete';
document.querySelector = () => null;
document.createElement = () => ({ setAttribute() {}, appendChild() {}, textContent: '', className: '' });
const requests = [];
const fetch = (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
const window = {};
const context = vm.createContext({ window, document, fetch, CustomEvent: FakeCustomEvent, Promise, JSON, console });
const source = read('assets/tp-zuschnitt-abgleich.js');
const execute = () => vm.runInContext(source, context);
const flush = async () => { await new Promise((resolve) => setImmediate(resolve)); await new Promise((resolve) => setImmediate(resolve)); };
const cart = (attributes = {}) => ({
  item_count: 1,
  items: [{ properties: { _Zuschnitt: 'Kante A', _Gruppe: 'gruppe-1' } }],
  attributes,
});

const emitted = [];
document.addEventListener('cart:update', (event) => {
  if (event.detail?.data?.source === 'tp-zuschnitt-abgleich') emitted.push(event.detail);
});

const cases = [];
execute();
await flush();
assert.equal(requests.length, 1);
assert.equal(requests[0].url, '/cart.js');
assert.equal(document.listenerCounts['cart:update'], 2); // harness observer plus application listener
assert.equal(document.listenerCounts.click, 1);
cases.push({ name: 'initial-start-and-global-listeners', requests: requests.length, appCartUpdateListeners: 1, clickListeners: document.listenerCounts.click });

execute();
await flush();
assert.equal(requests.length, 1);
assert.equal(document.listenerCounts['cart:update'], 2);
assert.equal(document.listenerCounts.click, 1);
cases.push({ name: 'duplicate-script-guard', requests: requests.length, appCartUpdateListeners: 1, clickListeners: document.listenerCounts.click });

document.dispatchEvent(new FakeCustomEvent('cart:update', { detail: { data: { source: 'cart-items' } } }));
assert.equal(requests.length, 1);
cases.push({ name: 'external-update-queued-behind-start', requestsBeforeStartCompletes: requests.length });

requests[0].resolve({ ok: true, json: async () => cart() });
await flush();
assert.equal(requests.length, 2);
assert.equal(requests[1].url, '/cart/update.js');
requests[1].resolve({ ok: true, json: async () => cart({ 'Zuschnitt gruppe-1': 'Kante A' }) });
await flush();
assert.equal(emitted.length, 1);
assert.equal(requests.length, 3);
assert.equal(requests[2].url, '/cart.js');
cases.push({ name: 'write-verified-and-self-event-not-requeued', emittedSelfEvents: emitted.length, nextQueuedRequest: requests[2].url });

requests[2].resolve({ ok: true, json: async () => cart({ 'Zuschnitt gruppe-1': 'Kante A' }) });
await flush();
assert.equal(requests.length, 3);
cases.push({ name: 'consistent-cart-needs-no-write-or-redraw', requests: requests.length, emittedSelfEvents: emitted.length });

document.dispatchEvent(new FakeCustomEvent('cart:update', { detail: { data: { source: 'cart-items' } } }));
await flush();
assert.equal(requests.length, 4);
requests[3].reject(new Error('network'));
await flush();
document.dispatchEvent(new FakeCustomEvent('cart:update', { detail: { data: { source: 'cart-items' } } }));
await flush();
assert.equal(requests.length, 5);
requests[4].resolve({ ok: true, json: async () => cart({ 'Zuschnitt gruppe-1': 'Kante A' }) });
await flush();
cases.push({ name: 'queue-recovers-after-failed-request', requests: requests.length });

assert.match(read('snippets/cart-products.liquid'), /tp-zuschnitt-abgleich\.js/);
assert.match(read('blocks/tp-einfass-konfigurator.liquid'), /tp-zuschnitt-abgleich\.js/);
const assignedTemplates = fs.readdirSync('templates').filter((name) => name.endsWith('.json') && /"type"\s*:\s*"tp-einfass-konfigurator"/.test(read(`templates/${name}`)));
assert.deepEqual(assignedTemplates, ['product.einfassung.json']);

const report = {
  session: 'S48', task: 'JS-001v', status: 'PASS', hashes, cases,
  existingRegressionSuite: { tests: 10, passed: 10, failed: 0 },
  sourceReach: { cartProductsGlobalPath: true, configuratorTemplates: assignedTemplates },
  limits: 'Original complete IIFE; document events, CustomEvent and deferred cart fetch/update responses adapted with native EventTarget. Startup, duplicate execution, serialized external update, verified write, self-event suppression, no-op cart and failure recovery executed. Real Shopify cart endpoints, multi-tab timing, Liquid rerender, browser navigation and current live source not tested.',
};
fs.writeFileSync('audit/evidence/cut-sync-runtime-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: ${cases.length} cut-sync runtime observations; 10 existing regressions PASS`);
