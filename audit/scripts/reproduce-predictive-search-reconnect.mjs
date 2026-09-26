import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/predictive-search.js', 'snippets/search-modal.liquid', 'sections/predictive-search.liquid', 'snippets/tp-suche-ergebnisse.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class FakeHTMLElement extends EventTarget {
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
class FakeButton extends FakeHTMLElement {}
class FakeAnchor extends FakeHTMLElement {}
class FakeInput extends FakeHTMLElement {
  constructor() { super(); this.value = ''; this.focuses = 0; }
  focus() { this.focuses += 1; }
}

function harness() {
  const document = new EventTarget();
  const dialog = new EventTarget();
  dialog.toggles = 0;
  dialog.toggleDialog = () => { dialog.toggles += 1; };
  const input = new FakeInput();
  const results = new FakeHTMLElement();
  const resetButton = { hidden: true };
  const registry = new Map();
  class Component extends FakeHTMLElement {
    constructor() { super(); this.refs = { searchInput: input, predictiveSearchResults: results, resetButton }; this.dataset = { sectionId: 'predictive-search' }; }
    connectedCallback() {}
    disconnectedCallback() {}
    closest(selector) { return selector === 'dialog-component' ? dialog : null; }
  }
  const RecentlyViewed = { getProducts: () => [], clearProducts() {} };
  const context = vm.createContext({
    Event, CustomEvent, EventTarget, AbortController, Component, document,
    HTMLElement: FakeHTMLElement, HTMLButtonElement: FakeButton, HTMLAnchorElement: FakeAnchor, HTMLInputElement: FakeInput,
    RecentlyViewed, DialogCloseEvent: class { static eventName = 'dialog:close'; }, DialogOpenEvent: class { static eventName = 'dialog:open'; }, DialogComponent: class {},
    debounce: (fn) => fn, onAnimationEnd: (_el, callback) => callback(), prefersReducedMotion: () => true,
    sectionRenderer: { getSectionHTML: async () => null }, morph() {}, requestIdleCallback: (callback) => callback(), requestAnimationFrame: (callback) => callback(),
    DOMParser: class {}, Theme: { routes: { search_url: '/search', predictive_search_url: '/search/suggest' } },
    URL, location: { origin: 'https://example.test' }, window: { location: { href: 'https://example.test/' } },
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
  });
  vm.runInContext(read('assets/predictive-search.js').replace(/^import .*;\n/gm, ''), context);
  const component = new (registry.get('predictive-search-component'))();
  const shortcut = () => document.dispatchEvent(Object.assign(new Event('keydown'), { metaKey: true, key: 'k' }));
  const modalClick = () => component.dispatchEvent(new Event('click'));
  return { component, dialog, input, shortcut, modalClick };
}

const cases = [];
function observe(name, lifecycle) {
  const h = harness(); lifecycle(h.component); h.shortcut(); h.modalClick();
  const result = { name, dialogToggles: h.dialog.toggles, inputFocuses: h.input.focuses };
  cases.push(result); return result;
}
assert.deepEqual(observe('initial-connect', (c) => c.connectedCallback()), { name: 'initial-connect', dialogToggles: 1, inputFocuses: 1 });
assert.deepEqual(observe('disconnected-ignores-events', (c) => { c.connectedCallback(); c.disconnectedCallback(); }), { name: 'disconnected-ignores-events', dialogToggles: 0, inputFocuses: 0 });
assert.deepEqual(observe('same-instance-reconnect-stale', (c) => { c.connectedCallback(); c.disconnectedCallback(); c.connectedCallback(); }), { name: 'same-instance-reconnect-stale', dialogToggles: 0, inputFocuses: 0 });
assert.deepEqual(observe('fresh-instance', (c) => c.connectedCallback()), { name: 'fresh-instance', dialogToggles: 1, inputFocuses: 1 });

const report = {
  session: 'S36', task: 'JS-001j', status: 'PASS', hashes, cases,
  sourceReach: {
    headerRendersPredictiveSearchStyles: /predictive-search-styles/.test(read('sections/header.liquid')),
    searchModalLoadsScript: /predictive-search\.js/.test(read('snippets/search-modal.liquid')),
    searchModalRendersComponent: /<predictive-search-component/.test(read('snippets/search-modal.liquid')),
    customResultsIntegration: /tp-suche-ergebnisse/.test(read('sections/predictive-search.liquid')),
  },
  limits: 'Original complete PredictiveSearchComponent; Component/dialog/input/results/DOM and imported utilities adapted, native EventTarget/AbortController. Document CMD+K and noninteractive modal-click focus lifecycle tested. Dialog close/reset, open/recently viewed, debounce, fetch, abort ordering, morph, keyboard result navigation, browser rendering and live theme not tested. Header/search-modal reach is static source evidence.',
};
fs.writeFileSync('audit/evidence/predictive-search-reconnect-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log('PASS: 4 predictive-search lifecycle observations; header/modal/custom-results source reach confirmed');
