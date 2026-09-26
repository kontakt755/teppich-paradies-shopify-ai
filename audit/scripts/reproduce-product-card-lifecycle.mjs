import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/product-card.js', 'snippets/product-card.liquid', 'snippets/card-gallery.liquid', 'snippets/variant-swatches.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class FakeElement extends EventTarget {
  constructor() { super(); this.dataset = {}; this.attrs = new Map(); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  hasAttribute(name) { return this.attrs.has(name); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
}
class FakeAnchor extends FakeElement { constructor() { super(); this.href = 'https://example.test/products/demo'; } }
class Component extends FakeElement {
  connectedCallback() {}
  disconnectedCallback() {}
}
class VariantPicker extends FakeElement {
  connectedCallback() {}
  disconnectedCallback() {}
  closest(selector) { return selector === 'product-card' ? this._parent ?? null : null; }
  updateSelectedOption() {}
  fetchUpdatedSection() {}
  variantChanged() {}
}
class OverflowList {}

function runtime() {
  const mediaQueryLarge = new EventTarget();
  const registry = new Map();
  const context = vm.createContext({
    Event, CustomEvent, EventTarget, Element: FakeElement, HTMLElement: FakeElement, HTMLAnchorElement: FakeAnchor,
    HTMLButtonElement: FakeElement, HTMLInputElement: FakeElement, MouseEvent: Event,
    Component, VariantPicker, OverflowList, mediaQueryLarge,
    isDesktopBreakpoint: () => true, debounce: (fn) => Object.assign(fn, { cancel() {} }), yieldToMainThread: async () => {},
    ThemeEvents: { variantUpdate: 'variant:update', variantSelected: 'variant:selected' },
    VariantSelectedEvent: class {}, VariantUpdateEvent: class {}, SlideshowSelectEvent: class { static eventName = 'slideshow:select'; },
    morph() {}, requestAnimationFrame: (callback) => callback(), setTimeout: (callback) => callback(),
    URL, window: { location: { origin: 'https://example.test', href: 'https://example.test/collections/all' }, Shopify: { designMode: false }, open() {} },
    history: { replaceState() {} },
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
  });
  vm.runInContext(read('assets/product-card.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
  return { registry, mediaQueryLarge };
}

function productCardHarness() {
  const h = runtime();
  const card = new (h.registry.get('product-card'))();
  const link = new FakeAnchor();
  const quickAdd = { fetches: 0, fetchProductPage() { this.fetches += 1; } };
  card.refs = { productCardLink: link, quickAdd };
  const hover = () => card.dispatchEvent(new Event('pointerenter'));
  return { ...h, card, quickAdd, hover };
}

const cardCases = [];
function observeCard(name, lifecycle) {
  const h = productCardHarness(); lifecycle(h.card); h.hover();
  const result = { name, quickAddFetches: h.quickAdd.fetches };
  cardCases.push(result); return result;
}
assert.deepEqual(observeCard('initial-connect', (c) => c.connectedCallback()), { name: 'initial-connect', quickAddFetches: 1 });
assert.deepEqual(observeCard('disconnected-still-preloads', (c) => { c.connectedCallback(); c.disconnectedCallback(); }), { name: 'disconnected-still-preloads', quickAddFetches: 1 });
assert.deepEqual(observeCard('same-instance-reconnect-no-duplicate', (c) => { c.connectedCallback(); c.disconnectedCallback(); c.connectedCallback(); }), { name: 'same-instance-reconnect-no-duplicate', quickAddFetches: 1 });
assert.deepEqual(observeCard('fresh-instance', (c) => c.connectedCallback()), { name: 'fresh-instance', quickAddFetches: 1 });

const swatchCases = [];
{
  const h = productCardHarness();
  const picker = new (h.registry.get('swatches-variant-picker-component'))();
  picker._parent = h.card;
  picker.connectedCallback(); picker.disconnectedCallback();
  picker.pendingVariantId = '22';
  picker.dispatchEvent(new Event('variant:update'));
  assert.match(h.card.refs.productCardLink.href, /variant=22/);
  swatchCases.push({ name: 'disconnected-picker-still-updates-card-url', href: h.card.refs.productCardLink.href });
}
{
  const h = productCardHarness();
  const picker = new (h.registry.get('swatches-variant-picker-component'))();
  picker._parent = h.card;
  picker.connectedCallback(); picker.disconnectedCallback(); picker.connectedCallback();
  picker.pendingVariantId = '33';
  picker.dispatchEvent(new Event('variant:update'));
  assert.match(h.card.refs.productCardLink.href, /variant=33/);
  swatchCases.push({ name: 'reconnect-registers-new-bound-listener', pendingCleared: picker.pendingVariantId === null });
}

const templateFiles = fs.readdirSync('templates').filter((name) => name.endsWith('.json'));
const assignedTemplates = templateFiles.filter((name) => read(`templates/${name}`).includes('"type": "_product-card"'));
assert.ok(assignedTemplates.length >= 20);
const report = {
  session: 'S38', task: 'JS-001l', status: 'PASS', hashes, cardCases, swatchCases,
  sourceReach: { scriptLoadedGlobally: /product-card\.js/.test(read('snippets/scripts.liquid')), assignedTemplateCount: assignedTemplates.length, assignedTemplates },
  limits: 'Original complete ProductCardLink, ProductCard and SwatchesVariantPickerComponent; Component/VariantPicker/DOM/QuickAdd/media query and navigation dependencies adapted, native EventTarget. Quick-add preload listener lifecycle and swatch URL-update ghost listener tested. Variant fetch/update, price morph, image slideshow, navigation/history, view transitions, real browser cards and live theme not tested. Template count is static source reach.',
};
fs.writeFileSync('audit/evidence/product-card-lifecycle-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: 4 product-card and 2 swatch lifecycle observations; ${assignedTemplates.length} assigned templates`);
