import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/price-per-item.js', 'assets/events.js', 'snippets/quantity-selector.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

function harness() {
  const input = { value: '1', getAttribute: (name) => name === 'data-cart-quantity' ? '0' : null };
  const form = { querySelector: () => input, contains: () => true };
  class Component extends EventTarget {
    constructor() {
      super();
      this.dataset = {
        minQuantity: '1', variantPrice: '10,00 €',
        priceBreaks: JSON.stringify([{ quantity: 5, price: '8,00 €' }]), atText: 'ab', eachText: 'Stk.',
      };
      this.refs = { pricePerItemText: { innerHTML: '' } };
    }
    connectedCallback() {}
    disconnectedCallback() {}
    closest(selector) { return selector === 'product-form-component' ? form : null; }
  }
  const document = new EventTarget();
  const registry = new Map();
  const context = vm.createContext({
    Event, CustomEvent, AbortController, Component, document, Node: Object,
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
  });
  vm.runInContext(read('assets/events.js').replace(/^export /gm, ''), context);
  vm.runInContext(read('assets/price-per-item.js').replace(/^import .*;\n/gm, ''), context);
  const component = new (registry.get('price-per-item'))();
  const setQuantity = (value) => { input.value = String(value); };
  const dispatchCart = () => document.dispatchEvent(new Event('cart:update'));
  const text = () => component.refs.pricePerItemText.innerHTML;
  return { component, setQuantity, dispatchCart, text };
}

const cases = [];
{
  const h = harness(); h.component.connectedCallback(); h.setQuantity(5); h.dispatchCart();
  assert.equal(h.text(), 'ab 8,00 €/Stk.'); cases.push({ name: 'initial-connect', text: h.text() });
}
{
  const h = harness(); h.component.connectedCallback(); h.component.disconnectedCallback(); h.setQuantity(5); h.dispatchCart();
  assert.equal(h.text(), 'ab 10,00 €/Stk.'); cases.push({ name: 'disconnected-ignores-cart', text: h.text() });
}
{
  const h = harness(); h.component.connectedCallback(); h.component.disconnectedCallback(); h.component.connectedCallback(); h.setQuantity(5); h.dispatchCart();
  assert.equal(h.text(), 'ab 10,00 €/Stk.'); cases.push({ name: 'same-instance-reconnect-stale', text: h.text() });
}
{
  const h = harness(); h.component.connectedCallback(); h.setQuantity(5); h.dispatchCart();
  assert.equal(h.text(), 'ab 8,00 €/Stk.'); cases.push({ name: 'fresh-instance', text: h.text() });
}

const templateSource = fs.readdirSync('templates').filter((name) => /^product.*\.json$/.test(name)).map((name) => {
  const source = read(`templates/${name}`);
  const json = JSON.parse(source.slice(source.indexOf('{')));
  const quantityBlocks = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'quantity') quantityBlocks.push({ disabled: value.disabled === true });
    for (const child of Object.values(value)) visit(child);
  };
  visit(json);
  return { template: name, enabledQuantityBlock: quantityBlocks.some((block) => !block.disabled) };
});
assert.equal(templateSource.length, 8);

const report = {
  session: 'S31', task: 'JS-001e', status: 'PASS', hashes, cases, templateSource,
  limits: 'Original complete PricePerItemComponent and original events; Component/form/input adapted, native EventTarget/AbortController. CartUpdate lifecycle and volume-tier display tested; quantity event targeting, actual Shopify volume-pricing data, product assignment, browser and live theme not tested. Quantity block presence is static template reach; price-per-item renders only when a variant has quantity price breaks.',
};
fs.writeFileSync('audit/evidence/price-per-item-reconnect-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: 4 price lifecycle observations, ${templateSource.filter((row) => row.enabledQuantityBlock).length}/8 templates with enabled quantity block`);
