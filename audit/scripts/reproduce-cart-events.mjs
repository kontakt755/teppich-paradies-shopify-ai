// S09 / CART-002b.1. Original event pipeline, deterministic timers, no network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (f) => readFileSync(path.join(root, f), 'utf8');
const copy = (v) => JSON.parse(JSON.stringify(v));
const moduleSource = (f) => read(f).replace(/^import\s[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '');
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a); return source.slice(a, b).replace(/^export /, '');
}
const utilities = read('assets/utilities.js');
const utilitySource = between(utilities, 'export function debounce(', '\n\n/**') + '\n' +
  between(utilities, 'export function fetchConfig(', '\n\n/**') + '\n' +
  between(utilities, 'export function parseIntOrDefault(', '\n\nclass Scheduler');
const observations = [];
function runCase(name, actions, o = {}) {
  let time = 0, nextId = 1;
  const timers = new Map(), events = [], requests = [], components = [], registry = new Map(), listeners = new Map();
  function advance(to) {
    assert.ok(to >= time);
    while (true) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= to).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      timers.delete(next[0]); time = next[1].at; next[1].fn();
    }
    time = to;
  }
  const document = {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    querySelector: () => null,
    querySelectorAll: (s) => s === 'cart-items-component' ? components : [],
    deliver(e) { for (const fn of listeners.get(e.type) ?? []) fn(e); },
  };
  // Native Node Event/EventTarget retain the selector as event.target.
  // Document bubbling and DOM ancestry are explicit adapters, not browser proof.
  class Element extends EventTarget {
    constructor() { super(); this.dataset = {}; this.attrs = new Map(); this.refs = {}; this.value = ''; this.defaultValue = '';
      this.min = '1'; this.max = ''; this.step = '1'; this.disabled = false;
      const classes = new Set(); this.classList = { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) }; }
    connectedCallback() {}
    disconnectedCallback() {}
    getAttribute(k) { return this.attrs.get(k) ?? null; }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    querySelector() { return null; }
    contains(el) { for (let p = el; p; p = p.parent) if (p === this) return true; return false; }
    reportValidity() { return true; }
    dispatchEvent(e) {
      const result = super.dispatchEvent(e);
      events.push({ at: time, type: e.type, source: this.auditName, detail: copy(e.detail), bubbles: e.bubbles });
      if (e.bubbles) document.deliver(e);
      return result;
    }
  }
  const context = vm.createContext({ Event, Component: Element, HTMLElement: Element, HTMLInputElement: Element,
    HTMLButtonElement: Element, Node: Element, document,
    window: { location: { pathname: '/cart' } },
    customElements: { get: (n) => registry.get(n), define: (n, c) => registry.set(n, c) },
    setTimeout: (fn, delay) => { const id = nextId++; timers.set(id, { fn, at: time + delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    Theme: { routes: { cart_change_url: '/cart/change.js', cart_update_url: '/cart/update.js' } },
    cartPerformance: { createStartingMarker: () => 'audit' },
    fetch: (url, config) => { requests.push({ at: time, url, method: config.method, body: JSON.parse(config.body) }); return new Promise(() => {}); },
  });
  vm.runInContext(moduleSource('assets/events.js'), context, { filename: 'assets/events.js' });
  vm.runInContext(utilitySource, context, { filename: 'assets/utilities.js' });
  for (const f of ['assets/component-quantity-selector.js','assets/component-cart-quantity-selector.js','assets/component-cart-items.js']) {
    vm.runInContext(moduleSource(f), context, { filename: f });
  }
  const Cart = registry.get('cart-items-component'), Selector = registry.get('cart-quantity-selector-component');
  const targets = new Map(), outside = new Element();
  for (const section of o.dual ? ['page','drawer'] : ['page']) {
    const cart = new Cart(); cart.dataset = { sectionId: section }; cart.auditName = section;
    if (section === 'drawer') cart.dataset.drawer = '';
    cart.refs.cartItemRows = [new Element(), new Element()];
    components.push(cart); cart.connectedCallback();
    for (let line = 1; line <= 2; line++) {
      const selector = new Selector(), input = new Element(); input.value = '2'; input.dataset.cartLine = String(line);
      selector.parent = cart; selector.auditName = `${section}:${line}`;
      selector.refs = { quantityInput: input, minusButton: new Element(), plusButton: new Element() };
      selector.connectedCallback(); targets.set(selector.auditName, selector);
    }
  }
  const ProductSelector = registry.get('quantity-selector-component'), external = new ProductSelector();
  external.auditName = 'outside'; external.parent = outside;
  const externalInput = new Element(); externalInput.value = '2';
  external.refs = { quantityInput: externalInput, minusButton: new Element(), plusButton: new Element() };
  external.connectedCallback(); targets.set('outside', external);
  const wanted = new Map();
  for (const action of actions) {
    advance(action.at);
    const selector = targets.get(action.target); assert.ok(selector);
    if (action.value !== undefined) {
      selector.refs.quantityInput.value = String(action.value);
      selector.setQuantity({ target: selector.refs.quantityInput, preventDefault() {} });
    } else selector.increaseQuantity({ target: selector.refs.plusButton, preventDefault() {} });
    if (action.target !== 'outside') wanted.set(action.target, Number(selector.refs.quantityInput.value));
  }
  advance(actions.at(-1).at + 299);
  const requestsBeforeLastDeadline = requests.length;
  advance(actions.at(-1).at + 300);
  advance(time + 1000);
  assert.equal(timers.size, 0);
  const submitted = new Map();
  for (const request of requests) {
    assert.equal(request.url, '/cart/change.js'); assert.equal(request.method, 'POST');
    assert.equal(request.body.sections_url, '/cart');
    assert.ok(Number.isInteger(request.body.quantity));
    submitted.set(`${request.body.sections.split(',')[0]}:${request.body.line}`, request.body.quantity);
  }
  const lost = [...wanted].filter(([key, value]) => submitted.get(key) !== value).map(([key, quantity]) => ({ target: key, quantity }));
  assert.equal(lost.length, o.lost ?? 0, name);
  assert.equal(requests.length, o.requests, name);
  assert.ok(events.every((e) => e.bubbles && e.type === 'quantity-selector:update'));
  if (o.singleDeadline) { assert.equal(requestsBeforeLastDeadline, 0); assert.equal(requests[0].at, actions.at(-1).at + 300); }
  observations.push({ name, actions, options: o, events, requests,
    finalInputs: Object.fromEntries([...targets].map(([k, s]) => [k, s.refs.quantityInput.value])),
    wanted: Object.fromEntries(wanted), submitted: Object.fromEntries(submitted), lost,
    issue: lost.length ? 'TP-011' : null });
}
runCase('single cart increase exact 300ms', [{ at: 0, target: 'page:1' }], { requests: 1, singleDeadline: true });
runCase('same row burst coalesces to latest', [{ at: 0, target: 'page:1' },{ at: 100, target: 'page:1' },{ at: 200, target: 'page:1' }], { requests: 1, singleDeadline: true });
runCase('different rows within 100ms', [{ at: 0, target: 'page:1' },{ at: 100, target: 'page:2' }], { requests: 1, lost: 1 });
runCase('different rows reverse order', [{ at: 0, target: 'page:2' },{ at: 100, target: 'page:1' }], { requests: 1, lost: 1 });
runCase('different rows at 299ms boundary', [{ at: 0, target: 'page:1' },{ at: 299, target: 'page:2' }], { requests: 1, lost: 1 });
runCase('timer control different rows after 301ms', [{ at: 0, target: 'page:1' },{ at: 301, target: 'page:2' }], { requests: 2 });
runCase('foreign product quantity alone ignored', [{ at: 0, target: 'outside' }], { requests: 0 });
runCase('foreign event cancels pending cart change', [{ at: 0, target: 'page:1' },{ at: 100, target: 'outside' }], { requests: 0, lost: 1 });
runCase('foreign event first does not block later cart event', [{ at: 0, target: 'outside' },{ at: 100, target: 'page:1' }], { requests: 1 });
runCase('two cart components cancel earlier owning event', [{ at: 0, target: 'page:1' },{ at: 100, target: 'drawer:2' }], { dual: true, requests: 1, lost: 1 });
runCase('second cart component ignores isolated first event', [{ at: 0, target: 'page:1' }], { dual: true, requests: 1 });
runCase('blur and button same row preserve latest value', [{ at: 0, target: 'page:1', value: 4 },{ at: 100, target: 'page:1' }], { requests: 1, singleDeadline: true });
const files = ['assets/events.js','assets/utilities.js','assets/component-quantity-selector.js','assets/component-cart-quantity-selector.js','assets/component-cart-items.js'];
const manifest = JSON.parse(read('audit/evidence/source-manifest.json'));
const sourceIntegrity = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex'), historicalLiveSha256: manifest.files[file].live.sha256 }));
sourceIntegrity.forEach((s) => assert.equal(s.sha256, s.historicalLiveSha256));
process.stdout.write(JSON.stringify({ status: 'PASS', session: 'S09', matrix: 'CART-002b.1', generatedAt: new Date().toISOString(),
  cases: observations.length, interceptedRequests: observations.reduce((s, o) => s + o.requests.length, 0),
  defectCases: observations.filter((o) => o.issue).length, sourceIntegrity, observations,
  limitations: ['Full original selector/cart/event classes plus original debounce, parseIntOrDefault and fetchConfig executed; no source repair.',
    'Native Node Event/EventTarget with explicit DOM ancestry and document-bubbling adapter. Deterministic virtual setTimeout/clearTimeout; no actual browser timing/pointer/keyboard proof.',
    'All requests intercepted and left pending: only pre-request event handling proven. No server acceptance, response order, section morph, drawer history, reload or checkout tested.',
    '301ms control invokes original handlers directly even with an earlier request pending; not a claim of pointer interaction through cart-items-disabled.',
    'Dual-component and outside-product sequences are synthetic integration conditions; current live DOM reachability remains H-012. Same-cart two-line loss does not require a second component.',
    'No S01-S08 test replay; current live assets/products not read.' ],
}, null, 2) + '\n');
