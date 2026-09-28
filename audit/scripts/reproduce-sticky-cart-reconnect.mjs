import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/sticky-add-to-cart.js', 'assets/events.js', 'sections/product-information.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

function harness() {
  const section = new EventTarget();
  section.id = 'shopify-section-fixture';
  section.querySelector = () => null;
  class Component extends EventTarget {
    constructor() {
      super();
      this.dataset = { productId: 'P', currentVariantId: '1', initialQuantity: '1' };
      this.refs = {
        stickyBar: { dataset: {}, getAttribute: () => 'false', setAttribute() {} },
        addToCartButton: { disabled: false, dataset: {} },
        quantityDisplay: { style: {} },
        quantityNumber: { textContent: '' },
      };
    }
    connectedCallback() {}
    disconnectedCallback() {}
    closest(selector) { return selector === '.shopify-section' ? section : null; }
    querySelector() { return null; }
  }
  const document = new EventTarget();
  document.querySelector = () => null;
  const registry = new Map();
  const context = vm.createContext({
    Event, CustomEvent, AbortController, Component, document,
    IntersectionObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    morph() {}, onAnimationEnd: async () => {}, clearTimeout, setTimeout,
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
  });
  vm.runInContext(read('assets/events.js').replace(/^export /gm, ''), context);
  vm.runInContext(read('assets/sticky-add-to-cart.js').replace(/^import .*;\n/gm, ''), context);
  const component = new (registry.get('sticky-add-to-cart'))();
  const dispatchVariant = (id) => section.dispatchEvent(new CustomEvent('variant:selected', { detail: { resource: { id } } }));
  const dispatchQuantity = (quantity) => document.dispatchEvent(new CustomEvent('quantity-selector:update', { detail: { quantity, cartLine: null } }));
  const state = () => ({ variantId: String(component.dataset.currentVariantId), quantity: component.refs.quantityNumber.textContent });
  return { component, dispatchVariant, dispatchQuantity, state };
}

const cases = [];
{
  const h = harness(); h.component.connectedCallback(); h.dispatchVariant(2); h.dispatchQuantity(4);
  assert.deepEqual(h.state(), { variantId: '2', quantity: '4' }); cases.push({ name: 'initial-connect', ...h.state() });
}
{
  const h = harness(); h.component.connectedCallback(); h.component.disconnectedCallback(); h.dispatchVariant(3); h.dispatchQuantity(5);
  assert.deepEqual(h.state(), { variantId: '1', quantity: '1' }); cases.push({ name: 'disconnected-ignores-events', ...h.state() });
}
{
  const h = harness(); h.component.connectedCallback(); h.component.disconnectedCallback(); h.component.connectedCallback(); h.dispatchVariant(4); h.dispatchQuantity(6);
  assert.deepEqual(h.state(), { variantId: '1', quantity: '1' }); cases.push({ name: 'same-instance-reconnect-stale', ...h.state() });
}
{
  const h = harness(); h.component.connectedCallback(); h.dispatchVariant(5); h.dispatchQuantity(7);
  assert.deepEqual(h.state(), { variantId: '5', quantity: '7' }); cases.push({ name: 'fresh-instance', ...h.state() });
}

const templateSource = fs.readdirSync('templates').filter((name) => /^product.*\.json$/.test(name)).map((name) => ({
  template: name,
  stickyEnabled: /"enable_sticky_add_to_cart"\s*:\s*true/.test(read(`templates/${name}`)),
}));
assert.equal(templateSource.length, 8);
assert.ok(templateSource.every((row) => row.stickyEnabled));

const report = {
  session: 'S30', task: 'JS-001d', status: 'PASS', hashes, cases, templateSource,
  limits: 'Original complete StickyAddToCartComponent and original events; Component/DOM/observers adapted, native EventTarget/AbortController. Tests section variant:selected and document quantity-selector:update lifecycle. Does not assert IntersectionObserver, target MutationObserver, click/cart, morph, browser or live behavior. All eight repository product templates enable sticky add-to-cart; live theme equality remains unverified.',
};
fs.writeFileSync('audit/evidence/sticky-cart-reconnect-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log('PASS: 4 sticky lifecycle observations, 8 enabled product templates');
