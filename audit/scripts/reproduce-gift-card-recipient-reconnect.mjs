import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/gift-card-recipient-form.js', 'snippets/gift-card-recipient-form.liquid', 'blocks/buy-buttons.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class ClassList {
  #values = new Set();
  add(value) { this.#values.add(value); }
  remove(value) { this.#values.delete(value); }
  contains(value) { return this.#values.has(value); }
}
class FakeElement extends EventTarget {
  constructor() {
    super();
    this.attrs = new Map();
    this.classList = new ClassList();
    this.dataset = {};
    this.children = [];
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this.textContent = '';
    this.maxLength = 200;
    this.focused = false;
    this.refs = {};
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  removeAttribute(name) { this.attrs.delete(name); }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
  focus() { this.focused = true; }
  querySelector(selector) {
    if (selector === 'input[name="properties[__shopify_send_gift_card_to_recipient]"]') {
      return this.children.find((child) => child.name === 'properties[__shopify_send_gift_card_to_recipient]') ?? null;
    }
    if (selector === 'span') return this.children.find((child) => child.tagName === 'SPAN') ?? null;
    return null;
  }
}
class Component extends FakeElement {
  connectedCallback() {}
  disconnectedCallback() {}
}
class FakeCustomEvent extends Event {
  constructor(type, options = {}) { super(type, options); this.detail = options.detail; }
}

function makeField(value = '') {
  const field = new FakeElement();
  field.value = value;
  return field;
}
function makeError() {
  const error = new FakeElement();
  error.classList.add('hidden');
  const span = new FakeElement();
  span.tagName = 'SPAN';
  error.appendChild(span);
  return error;
}

function runtime() {
  const registry = new Map();
  const document = new EventTarget();
  document.createElement = () => new FakeElement();
  const context = vm.createContext({
    Event, EventTarget, CustomEvent: FakeCustomEvent, HTMLElement: FakeElement, HTMLInputElement: FakeElement,
    HTMLTextAreaElement: FakeElement, HTMLDivElement: FakeElement, HTMLSpanElement: FakeElement,
    Component, document,
    ThemeEvents: { cartError: 'cart:error', cartUpdate: 'cart:update' },
    CartErrorEvent: class {}, CartAddEvent: class {},
    Theme: { translations: {} },
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
    console,
  });
  vm.runInContext(read('assets/gift-card-recipient-form.js').replace(/^import .*;\n/gm, ''), context);
  return { GiftCardRecipientForm: registry.get('gift-card-recipient-form'), document };
}

function harness(prefill = false) {
  const h = runtime();
  const form = new h.GiftCardRecipientForm();
  const characterCount = new FakeElement();
  characterCount.setAttribute('data-template', '[current]/[max]');
  form.dataset.sectionId = 'main';
  form.refs = {
    myEmailButton: new FakeElement(), recipientEmailButton: new FakeElement(), recipientFields: new FakeElement(),
    recipientEmail: makeField(prefill ? 'recipient@example.test' : ''),
    recipientName: makeField(prefill ? 'Erika' : ''),
    recipientMessage: makeField(prefill ? 'Hallo' : ''),
    recipientSendOn: makeField(prefill ? '2026-10-01' : ''),
    timezoneOffset: makeField(), characterCount, liveRegion: new FakeElement(),
    emailError: makeError(), nameError: makeError(), messageError: makeError(), sendOnError: makeError(),
  };
  return { ...h, form };
}

const cases = [];
{
  const h = harness(true);
  h.form.connectedCallback();
  assert.equal(h.form.refs.recipientEmail.value, '');
  assert.equal(h.form.refs.myEmailButton.checked, true);
  cases.push({ name: 'initial-connect-clears-liquid-prefill', email: h.form.refs.recipientEmail.value, selfChecked: h.form.refs.myEmailButton.checked });
}
{
  const h = harness();
  h.form.connectedCallback();
  h.form.toggleRecipientForm('recipient_form', new Event('change'));
  h.form.refs.recipientEmail.value = 'recipient@example.test';
  h.form.refs.recipientMessage.value = 'Hallo';
  h.form.refs.recipientMessage.dispatchEvent(new Event('input'));
  assert.equal(h.form.refs.characterCount.textContent, '5/200');
  h.form.disconnectedCallback();
  h.form.refs.recipientMessage.value = 'Getrennt';
  h.form.refs.recipientMessage.dispatchEvent(new Event('input'));
  assert.equal(h.form.refs.characterCount.textContent, '5/200');
  cases.push({ name: 'disconnect-removes-input-listener', characterCount: h.form.refs.characterCount.textContent });
}
{
  const h = harness();
  h.form.connectedCallback();
  h.form.toggleRecipientForm('recipient_form', new Event('change'));
  h.form.refs.recipientEmail.value = 'recipient@example.test';
  h.form.disconnectedCallback();
  h.form.connectedCallback();
  assert.equal(h.form.refs.recipientEmail.value, '');
  assert.equal(h.form.refs.recipientFields.hidden, true);
  assert.equal(h.form.refs.myEmailButton.checked, true);
  h.form.toggleRecipientForm('recipient_form', new Event('change'));
  assert.equal(h.form.refs.recipientFields.hidden, true);
  assert.equal(h.form.refs.recipientEmail.disabled, true);
  cases.push({ name: 'same-instance-reconnect-stale-private-mode', fieldsHiddenAfterRecipientToggle: h.form.refs.recipientFields.hidden, emailDisabled: h.form.refs.recipientEmail.disabled });
}
{
  const h = harness();
  h.form.connectedCallback();
  h.form.toggleRecipientForm('recipient_form', new Event('change'));
  assert.equal(h.form.refs.recipientFields.hidden, false);
  assert.equal(h.form.refs.recipientEmail.disabled, false);
  assert.equal(h.form.refs.recipientEmail.focused, true);
  cases.push({ name: 'fresh-instance-recipient-toggle', fieldsHidden: h.form.refs.recipientFields.hidden, emailDisabled: h.form.refs.recipientEmail.disabled });
}

const snippet = read('snippets/gift-card-recipient-form.liquid');
const buyButtons = read('blocks/buy-buttons.liquid');
assert.match(buyButtons, /block_settings\.gift_card_form and product\.gift_card\?/);
assert.match(snippet, /<gift-card-recipient-form/);
const templateFiles = fs.readdirSync('templates').filter((name) => name.startsWith('product') && name.endsWith('.json'));
const enabledTemplates = templateFiles.filter((name) => /"gift_card_form": true/.test(read(`templates/${name}`)));

const report = {
  session: 'S40', task: 'JS-001n', status: 'PASS', hashes, cases,
  sourceReach: {
    conditionalRender: 'block_settings.gift_card_form and product.gift_card?',
    enabledProductTemplateCount: enabledTemplates.length,
    enabledProductTemplates: enabledTemplates,
    note: 'The setting is enabled in templates, but runtime markup additionally requires a gift-card product. Current catalog assignment and live settings were not queried.',
  },
  limits: 'Original complete GiftCardRecipientForm; Component/DOM/refs/document adapted, native EventTarget used. Listener cleanup, initial Liquid-prefill handling and recipient-mode reconnect state executed. Real browser form submission, Shopify validation response, timezone/date UI, multiple forms and live catalog not tested.',
};
fs.writeFileSync('audit/evidence/gift-card-recipient-reconnect-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: ${cases.length} gift-card lifecycle observations; ${enabledTemplates.length} templates enable conditional gift-card form`);
