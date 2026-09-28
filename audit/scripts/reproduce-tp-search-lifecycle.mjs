import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/tp-suche.js', 'sections/tp-header-suche.liquid', 'sections/header-group.json', 'sections/predictive-search.liquid'];
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
    this.hidden = false;
    this.children = [];
    this.textContent = '';
    this.value = '';
    this.refs = new Map();
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  removeAttribute(name) { this.attrs.delete(name); }
  querySelector(selector) { return this.refs.get(selector) ?? null; }
  querySelectorAll() { return []; }
  contains(node) { return node === this || [...this.refs.values()].includes(node); }
  replaceChildren(...children) { this.children = children; }
  get childElementCount() { return this.children.length; }
}

class MediaQuery extends EventTarget { constructor() { super(); this.matches = false; } }

function keyEvent(key) {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value: key });
  return event;
}

function runtime() {
  const registry = new Map();
  const document = new EventTarget();
  document.getElementById = () => null;
  document.createElement = () => new FakeElement();
  const media = new MediaQuery();
  const window = new EventTarget();
  window.matchMedia = () => media;
  window.location = { origin: 'https://example.test' };
  const context = vm.createContext({
    AbortController, Event, EventTarget, HTMLElement: FakeElement, Element: FakeElement, Node: FakeElement,
    NodeFilter: { SHOW_TEXT: 4 }, CustomEvent: class extends Event { constructor(type, options = {}) { super(type); this.detail = options.detail; } },
    URL, URLSearchParams, Map, setTimeout, clearTimeout, document, window,
    requestAnimationFrame: (callback) => callback(),
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
    console,
  });
  vm.runInContext(read('assets/tp-suche.js'), context);
  return { TpSucheLeiste: registry.get('tp-suche-leiste'), document, window, media };
}

function harness() {
  const h = runtime();
  const element = new h.TpSucheLeiste();
  const form = new FakeElement();
  const input = new FakeElement();
  input.setAttribute('aria-expanded', 'false');
  const panel = new FakeElement();
  panel.hidden = true;
  const empty = new FakeElement();
  empty.children = [new FakeElement()];
  const results = new FakeElement();
  const meant = new FakeElement();
  panel.refs.set('[data-tp-leer]', empty);
  panel.refs.set('[data-tp-ergebnisse]', results);
  panel.refs.set('[data-tp-meinten]', meant);
  element.refs.set('form', form);
  element.refs.set('input[type="search"]', input);
  element.refs.set('.tp-hs__panel', panel);
  element.refs.set('script[data-tp-synonyme]', null);
  return { ...h, element, input, panel };
}

const cases = [];
{
  const h = harness();
  h.element.connectedCallback();
  h.input.dispatchEvent(new Event('focus'));
  assert.equal(h.panel.hidden, false);
  assert.equal(h.input.getAttribute('aria-expanded'), 'true');
  cases.push({ name: 'initial-focus-opens-panel', hidden: h.panel.hidden, expanded: h.input.getAttribute('aria-expanded') });

  h.element.disconnectedCallback();
  assert.equal(h.panel.hidden, false);
  assert.equal(h.input.getAttribute('aria-expanded'), 'true');
  cases.push({ name: 'disconnect-leaves-panel-visible', hidden: h.panel.hidden, expanded: h.input.getAttribute('aria-expanded') });

  h.element.connectedCallback();
  h.input.dispatchEvent(keyEvent('Escape'));
  assert.equal(h.panel.hidden, false);
  assert.equal(h.input.getAttribute('aria-expanded'), 'true');
  cases.push({ name: 'reconnect-escape-cannot-close-stale-panel', hidden: h.panel.hidden, expanded: h.input.getAttribute('aria-expanded') });

  h.document.dispatchEvent(new Event('pointerdown'));
  assert.equal(h.panel.hidden, false);
  cases.push({ name: 'reconnect-outside-pointer-cannot-close-stale-panel', hidden: h.panel.hidden });
}
{
  const h = harness();
  h.element.connectedCallback();
  h.input.dispatchEvent(new Event('focus'));
  h.input.dispatchEvent(keyEvent('Escape'));
  assert.equal(h.panel.hidden, true);
  assert.equal(h.input.getAttribute('aria-expanded'), 'false');
  cases.push({ name: 'fresh-connected-escape-closes-panel', hidden: h.panel.hidden, expanded: h.input.getAttribute('aria-expanded') });
}

const headerGroup = JSON.parse(read('sections/header-group.json').replace(/^\/\*[\s\S]*?\*\//, '').trim());
const assigned = Object.values(headerGroup.sections ?? {}).filter((section) => section.type === 'tp-header-suche').length;
assert.equal(assigned, 1);
assert.match(read('sections/tp-header-suche.liquid'), /tp-suche-leiste/);

const report = {
  session: 'S45', task: 'JS-001s', status: 'PASS', hashes, cases,
  sourceReach: { headerGroupAssignments: assigned, desktopBreakpoint: 'min-width: 768px', mobileDelegatesTo: '#search-modal' },
  limits: 'Original complete tp-suche.js custom element; DOM, panel, input, MediaQueryList and document/window adapted with native EventTarget. Open, disconnect, same-instance reconnect, Escape and outside-pointer paths executed. Fetch/results, native focus transitions, mobile dialog, browser layout, current live section settings and analytics consumers not tested.',
};
fs.writeFileSync('audit/evidence/tp-search-lifecycle-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: ${cases.length} TP search lifecycle observations; ${assigned} header-group assignment`);
