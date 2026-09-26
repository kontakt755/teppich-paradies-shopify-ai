import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/quick-add.js', 'assets/events.js', 'assets/component.js'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));
const source = read('assets/quick-add.js');
const classSource = source.slice(source.indexOf('export class QuickAddComponent'), source.indexOf("if (!customElements.get('quick-add-component'))"));

function harness() {
  let mapClears = 0;
  class TrackingMap extends Map { clear() { mapClears += 1; return super.clear(); } }
  const productCard = {};
  class Element extends EventTarget {
    constructor() { super(); this.dataset = { productOptionsCount: '1' }; this.attributes = new Map(); }
    connectedCallback() {}
    disconnectedCallback() {}
    closest(selector) { return selector === 'product-card' ? productCard : null; }
    setAttribute(name, value) { this.attributes.set(name, value); }
  }
  const document = new EventTarget();
  const mediaQueryLarge = new EventTarget();
  const registry = new Map();
  const context = vm.createContext({
    Event, CustomEvent, AbortController, URL, Map: TrackingMap,
    Component: Element, HTMLElement: Element, HTMLInputElement: Element,
    document, mediaQueryLarge, morph() {}, isMobileBreakpoint: () => false, getIOSVersion: () => null,
    VariantPicker: class {}, CartUpdateEvent: class {}, DialogComponent: Element, DialogCloseEvent: { eventName: 'dialog:close' },
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
  });
  vm.runInContext(read('assets/events.js').replace(/^export /gm, ''), context);
  vm.runInContext(classSource.replace('export class', 'class'), context);
  const QuickAdd = vm.runInContext('QuickAddComponent', context);
  const component = new QuickAdd();
  const variantTarget = new Element();
  // Native Event.target is read-only. Dispatch from the product-card child and let it bubble is unavailable
  // in EventTarget, so invoke document listeners with a Proxy that exposes the intended HTMLElement target.
  const dispatchVariant = () => {
    const event = new Event('variant:selected');
    const proxied = new Proxy(event, { get(target, key) { if (key === 'target') return variantTarget; const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; } });
    document.dispatchEvent(proxied);
  };
  const dispatchCart = () => document.dispatchEvent(new Event('cart:update'));
  return { component, dispatchVariant, dispatchCart, mapClears: () => mapClears, attributeWrites: () => component.attributes.size };
}

const cases = [];
{
  const h = harness();
  h.component.connectedCallback();
  h.dispatchVariant(); h.dispatchCart();
  assert.equal(h.attributeWrites(), 1); assert.equal(h.mapClears(), 1);
  cases.push({ name: 'initial-connect', variantWrites: 1, cartClears: 1 });
}
{
  const h = harness();
  h.component.connectedCallback();
  h.component.disconnectedCallback();
  h.dispatchVariant(); h.dispatchCart();
  assert.equal(h.attributeWrites(), 1); assert.equal(h.mapClears(), 0);
  cases.push({ name: 'disconnected-ghost-variant-listener', variantWrites: 1, cartClears: 0 });
}
{
  const h = harness();
  let writes = 0;
  const original = h.component.setAttribute.bind(h.component);
  h.component.setAttribute = (...args) => { writes += 1; original(...args); };
  h.component.connectedCallback();
  h.component.disconnectedCallback();
  h.component.connectedCallback();
  h.dispatchVariant(); h.dispatchCart();
  assert.equal(writes, 2); assert.equal(h.mapClears(), 0);
  cases.push({ name: 'same-instance-reconnect', variantWrites: 2, cartClears: 0 });
}
{
  const h = harness();
  let writes = 0;
  const original = h.component.setAttribute.bind(h.component);
  h.component.setAttribute = (...args) => { writes += 1; original(...args); };
  h.component.connectedCallback();
  h.dispatchVariant(); h.dispatchCart();
  assert.equal(writes, 1); assert.equal(h.mapClears(), 1);
  cases.push({ name: 'fresh-instance', variantWrites: 1, cartClears: 1 });
}

const report = {
  session: 'S28', task: 'JS-001b', status: 'PASS', hashes, cases,
  limits: 'Original complete QuickAddComponent and original events; Component/DOM/dialog/media dependencies adapted, native EventTarget and AbortController. Event target proxied because Node EventTarget has no DOM bubbling. No modal/morph/fetch/browser/live execution. Repository quick_add is false and live setting unknown.',
};
fs.writeFileSync('audit/evidence/quick-add-reconnect-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log('PASS: 4 QuickAddComponent lifecycle observations');
