import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/product-title-truncation.js', 'snippets/card-gallery.liquid', 'snippets/scripts.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.clientHeight = 48;
    this.textContent = 'Ein ausreichend langer Produkttitel';
    this.style = {};
    this.refs = {};
  }
  querySelector() { return null; }
}
class Component extends FakeElement {
  connectedCallback() {}
  disconnectedCallback() {}
}

function runtime({ withResizeObserver }) {
  const registry = new Map();
  const windowTarget = new EventTarget();
  windowTarget.getComputedStyle = () => ({ lineHeight: '16px', paddingTop: '0px', paddingBottom: '0px' });
  const observers = [];
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.observed = false; this.disconnected = false; observers.push(this); }
    observe() { this.observed = true; }
    disconnect() { this.disconnected = true; }
    fire() { if (!this.disconnected) this.callback(); }
  }
  const context = vm.createContext({
    Event, EventTarget, HTMLElement: FakeElement, Component,
    window: windowTarget,
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
  });
  if (withResizeObserver) {
    context.ResizeObserver = ResizeObserver;
    windowTarget.ResizeObserver = ResizeObserver;
  }
  vm.runInContext(read('assets/product-title-truncation.js').replace(/^import .*;\n/gm, '').replace(/^export default .*;\n?/gm, ''), context);
  return { ProductTitle: registry.get('product-title'), observers, windowTarget };
}

function observeFallback(name, lifecycle) {
  const h = runtime({ withResizeObserver: false });
  const title = new h.ProductTitle();
  let calculations = 0;
  title.style = new Proxy({}, { set(target, key, value) { if (key === 'webkitLineClamp') calculations += 1; target[key] = value; return true; } });
  lifecycle(title, h.windowTarget);
  const beforeResize = calculations;
  h.windowTarget.dispatchEvent(new Event('resize'));
  return { name, resizeCalculations: calculations - beforeResize, lineClamp: title.style.webkitLineClamp };
}

const fallbackCases = [
  observeFallback('initial-connect', (title) => title.connectedCallback()),
  observeFallback('disconnected-still-listens', (title) => { title.connectedCallback(); title.disconnectedCallback(); }),
  observeFallback('same-instance-reconnect-duplicates', (title) => { title.connectedCallback(); title.disconnectedCallback(); title.connectedCallback(); }),
  observeFallback('fresh-instance', (title) => title.connectedCallback()),
];
assert.deepEqual(fallbackCases.map((entry) => entry.resizeCalculations), [1, 1, 2, 1]);
assert.ok(fallbackCases.every((entry) => entry.lineClamp === '3'));

const observerCases = [];
{
  const h = runtime({ withResizeObserver: true });
  const title = new h.ProductTitle();
  title.connectedCallback();
  assert.equal(h.observers.length, 1);
  assert.equal(h.observers[0].observed, true);
  title.disconnectedCallback();
  assert.equal(h.observers[0].disconnected, true);
  title.connectedCallback();
  assert.equal(h.observers.length, 2);
  assert.equal(h.observers[1].observed, true);
  observerCases.push({ name: 'observer-reconnect', created: h.observers.length, firstDisconnected: h.observers[0].disconnected, secondObserved: h.observers[1].observed });
}

const cardGallery = read('snippets/card-gallery.liquid');
const reportsOnlyNoMedia = /product != blank and product\.media\.size == 0[\s\S]*?<product-title/.test(cardGallery);
assert.equal(reportsOnlyNoMedia, true);
assert.equal((cardGallery.match(/<product-title/g) || []).length, 1);
const templateFiles = fs.readdirSync('templates').filter((name) => name.endsWith('.json'));
const productTitleBlockTemplates = templateFiles.filter((name) => read(`templates/${name}`).includes('"type": "product-title"'));

const report = {
  session: 'S39', task: 'JS-001m', status: 'PASS', hashes, fallbackCases, observerCases,
  sourceReach: {
    scriptLoadedGlobally: /src="\{\{ 'product-title-truncation\.js' \| asset_url \}\}"/.test(read('snippets/scripts.liquid')),
    customElementMarkupFiles: ['snippets/card-gallery.liquid'],
    renderedOnlyForProductsWithoutMedia: reportsOnlyNoMedia,
    productTitleBlockTemplateCount: productTitleBlockTemplates.length,
    note: 'The product-title block itself does not render the custom element; its template assignments are adjacent title usage, not direct runtime reach.',
  },
  limits: 'Original complete ProductTitle class; Component, element geometry/styles, window and ResizeObserver adapted. Both ResizeObserver and fallback lifecycle paths executed with native EventTarget. No real layout, font metrics, product catalog/media census, browser fallback population or live theme tested.',
};
fs.writeFileSync('audit/evidence/product-title-truncation-lifecycle-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log('PASS: 4 fallback lifecycle observations, 1 observer reconnect observation, static conditional reach');
