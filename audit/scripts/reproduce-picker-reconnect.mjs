import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (path) => fs.readFileSync(path, 'utf8');
const files = ['assets/variant-picker.js', 'assets/events.js', 'assets/component.js', 'assets/morph.js'];
const hashes = files.map((file) => ({
  file,
  sha256: createHash('sha256').update(read(file)).digest('hex'),
}));

function harness() {
  class Element extends EventTarget {
    constructor() {
      super();
      this.dataset = {};
      this.refs = { fieldsets: [] };
    }
    connectedCallback() {}
    disconnectedCallback() {}
    closest() { return null; }
  }

  const requests = [];
  const registry = new Map();
  const option = new Element();
  option.dataset = { optionValueId: 'opt-2', variantId: '2' };
  let observed = 0;
  let disconnected = 0;
  const context = vm.createContext({
    Event,
    AbortController,
    URL,
    Component: Element,
    HTMLElement: Element,
    HTMLInputElement: Element,
    HTMLOptionElement: Element,
    HTMLSelectElement: class {},
    OverflowList: class {},
    ResizeNotifier: class {
      observe() { observed += 1; }
      disconnect() { disconnected += 1; }
    },
    getViewParameterValue: () => '',
    yieldToMainThread: () => Promise.resolve(),
    window: { location: { href: 'https://fixture.invalid/products/test' } },
    history: { replaceState() {} },
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
    console,
    fetch: (url, config) => new Promise((resolve, reject) => {
      const request = { url, signal: config.signal, resolve, reject };
      requests.push(request);
      config.signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' })), { once: true });
    }),
  });
  vm.runInContext(read('assets/events.js').replace(/^export /gm, ''), context);
  vm.runInContext(read('assets/variant-picker.js').replace(/^import .*;\n/gm, '').replace('export default class', 'class'), context);
  const picker = new (registry.get('variant-picker'))();
  picker.dataset = { productId: 'P', productUrl: '/products/test', templateProductMatch: 'true' };
  picker.querySelector = () => option;
  picker.querySelectorAll = () => [option];
  picker.updateSelectedOption = () => {};
  picker.updateVariantPicker = () => {};
  return { picker, option, requests, observed: () => observed, disconnected: () => disconnected };
}

const cases = [];
{
  const h = harness();
  let selected = 0;
  h.picker.addEventListener('variant:selected', () => { selected += 1; });
  h.picker.connectedCallback();
  h.picker.dispatchEvent(new Event('change'));
  assert.equal(selected, 1);
  assert.equal(h.requests.length, 1);
  cases.push({ name: 'initial-connect', selected, requests: h.requests.length, observerStarts: h.observed() });
}
{
  const h = harness();
  let selected = 0;
  h.picker.addEventListener('variant:selected', () => { selected += 1; });
  h.picker.connectedCallback();
  h.picker.disconnectedCallback();
  h.picker.connectedCallback();
  h.picker.dispatchEvent(new Event('change'));
  assert.equal(selected, 2);
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].signal.aborted, true);
  cases.push({ name: 'same-instance-reconnect-duplicates-change', selected, requests: h.requests.length, firstRequestAbortedByDuplicate: true, observerStarts: h.observed(), observerDisconnects: h.disconnected() });
}
{
  const h = harness();
  h.picker.connectedCallback();
  h.picker.dispatchEvent(new Event('change'));
  assert.equal(h.requests[0].signal.aborted, false);
  h.picker.disconnectedCallback();
  assert.equal(h.requests[0].signal.aborted, false);
  cases.push({ name: 'disconnect-does-not-abort-request', abortedAfterDisconnect: false });
}
{
  const h = harness();
  let selected = 0;
  h.picker.addEventListener('variant:selected', () => { selected += 1; });
  h.picker.connectedCallback();
  h.picker.dispatchEvent(new Event('change'));
  assert.equal(selected, 1);
  assert.equal(h.requests.length, 1);
  cases.push({ name: 'fresh-instance-single-change', selected, requests: h.requests.length });
}

const report = {
  session: 'S25',
  task: 'VAR-001a.2c.2',
  status: 'PASS',
  hashes,
  cases,
  limits: 'Original complete VariantPicker and events with native EventTarget/AbortController. Refs/DOM, option update and response morph adapted; lifecycle invoked manually. Confirms duplicate bound change listeners and non-aborted pending request on same-instance disconnect. No real DOM morph, response completion, browser or live request; radio-array accumulation is source-observed but not asserted here.',
};
fs.writeFileSync('audit/evidence/picker-reconnect-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log('PASS: 4 picker lifecycle observations');
