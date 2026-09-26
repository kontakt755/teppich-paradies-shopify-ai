import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/facets.js', 'blocks/filters.liquid', 'snippets/filter-remove-buttons.liquid', 'snippets/list-filter.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class ClassList {
  #values = new Set();
  add(...values) { values.forEach((value) => this.#values.add(value)); }
  remove(...values) { values.forEach((value) => this.#values.delete(value)); }
  toggle(value, force) { if (force) this.#values.add(value); else this.#values.delete(value); return force; }
  contains(value) { return this.#values.has(value); }
}
class FakeElement extends EventTarget {
  constructor() { super(); this.refs = {}; this.dataset = {}; this.attrs = new Map(); this.classList = new ClassList(); this.textContent = ''; this.innerHTML = ''; this.mapping = {}; }
  closest(selector) { return this.mapping[selector] ?? null; }
  querySelector(selector) { return this.mapping[selector] ?? null; }
  querySelectorAll(selector) { return this.mapping[selector] ?? []; }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  focus() { this.focused = true; }
}
class Component extends FakeElement {
  connectedCallback() {}
  disconnectedCallback() {}
}
class FakeKeyboardEvent extends Event {
  constructor(type, options = {}) { super(type); this.key = options.key ?? ''; this.metaKey = false; }
}
class FilterUpdateEvent extends Event {
  constructor() { super('filter:update'); }
  shouldShowClearAll() { return true; }
}
class FakeFormData { *[Symbol.iterator]() {} }

function runtime() {
  const registry = new Map();
  const document = new EventTarget();
  document.createElement = () => new FakeElement();
  document.getElementById = () => null;
  const context = vm.createContext({
    Event, EventTarget, Element: FakeElement, HTMLElement: FakeElement, HTMLInputElement: FakeElement,
    HTMLSelectElement: FakeElement, HTMLDetailsElement: FakeElement, HTMLTemplateElement: FakeElement,
    KeyboardEvent: FakeKeyboardEvent, MouseEvent: Event, Component, FilterUpdateEvent,
    ThemeEvents: { FilterUpdate: 'filter:update' }, document,
    window: { location: { href: 'https://example.test/collections/all', pathname: '/collections/all', origin: 'https://example.test' }, innerWidth: 1024 },
    history: { pushState() {} }, URL, URLSearchParams, FormData: FakeFormData,
    sectionRenderer: { renderSection() {}, getSectionHTML() {} },
    debounce: (fn) => Object.assign(fn, { cancel() {} }), startViewTransition: (callback) => callback(),
    convertMoneyToMinorUnits: (value) => Number(value), formatMoney: (value) => String(value),
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
  });
  vm.runInContext(read('assets/facets.js').replace(/^import .*;\n/gm, ''), context);
  return { registry, document };
}

function harness() {
  const h = runtime();
  const FacetsForm = h.registry.get('facets-form-component');
  const FacetClear = h.registry.get('facet-clear-component');
  const FacetStatus = h.registry.get('facet-status-component');
  const facetsForm = new FacetsForm();
  let updates = 0;
  facetsForm.updateFilters = () => { updates += 1; };
  const clear = new FacetClear();
  const input = new FakeElement(); input.checked = true; input.value = 'rot';
  const container = new FakeElement(); container.mapping['[type="checkbox"]:checked, input'] = [input];
  const status = new FacetStatus(); status.refs = { facetStatus: new FakeElement() };
  const details = new FakeElement(); details.mapping['facet-status-component'] = status;
  clear.mapping['facet-inputs-component, price-facet-component'] = container;
  clear.mapping.details = details;
  clear.mapping['facets-form-component'] = facetsForm;
  clear.refs = { clearButton: new FakeElement() };
  return { ...h, clear, input, status, getUpdates: () => updates };
}

function pressEnter(clear) { clear.dispatchEvent(new FakeKeyboardEvent('keyup', { key: 'Enter' })); }
const cases = [];
{
  const h = harness(); h.clear.connectedCallback(); pressEnter(h.clear);
  assert.equal(h.getUpdates(), 1); assert.equal(h.input.checked, false);
  cases.push({ name: 'initial-connect-clears', updates: h.getUpdates() });
}
{
  const h = harness(); h.clear.connectedCallback(); h.clear.disconnectedCallback(); pressEnter(h.clear);
  assert.equal(h.getUpdates(), 1);
  cases.push({ name: 'disconnected-still-clears', updates: h.getUpdates() });
}
{
  const h = harness(); h.clear.connectedCallback(); h.clear.disconnectedCallback(); h.clear.connectedCallback(); pressEnter(h.clear);
  assert.equal(h.getUpdates(), 1);
  cases.push({ name: 'same-instance-reconnect-no-duplicate', updates: h.getUpdates() });
}
{
  const h = harness(); h.clear.connectedCallback(); h.clear.disconnectedCallback();
  h.document.dispatchEvent(new FilterUpdateEvent());
  assert.equal(h.clear.refs.clearButton.classList.contains('facets__clear--active'), false);
  cases.push({ name: 'document-filter-listener-cleaned', active: false });
}
{
  const h = harness(); h.clear.connectedCallback(); pressEnter(h.clear);
  assert.equal(h.getUpdates(), 1);
  cases.push({ name: 'fresh-instance', updates: h.getUpdates() });
}

const templateFiles = fs.readdirSync('templates').filter((name) => name.endsWith('.json'));
const filterTemplates = templateFiles.filter((name) => read(`templates/${name}`).includes('"type": "filters"'));
assert.equal(filterTemplates.length, 20);
const source = read('assets/facets.js');
assert.match(source, /this\.addEventListener\('keyup', this\.#handleKeyUp\)/);
assert.doesNotMatch(source, /this\.removeEventListener\('keyup', this\.#handleKeyUp\)/);

const report = {
  session: 'S42', task: 'JS-001p', status: 'PASS', hashes, cases,
  sourceReach: { filterTemplateCount: filterTemplates.length, filterTemplates, scriptLoadedByFilterBlock: /facets\.js/.test(read('blocks/filters.liquid')) },
  limits: 'Original complete facets.js; FacetClear runtime executed with Component/DOM/FormData/renderer/money adapters and native EventTarget. Self keyup and document FilterUpdate cleanup tested. Form URL construction, fetch/SectionRenderer, price parsing, prefetch, sorting/focus, actual Collection/Search DOM, browser and live theme not executed.',
};
fs.writeFileSync('audit/evidence/facet-clear-lifecycle-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: ${cases.length} FacetClear observations; ${filterTemplates.length} filter templates`);
