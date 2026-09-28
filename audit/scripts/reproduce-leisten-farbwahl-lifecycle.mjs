import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/tp-leisten-farbwahl.js', 'blocks/tp-leisten-farbwahl.liquid', 'snippets/tp-leisten-farbkachel.liquid', 'templates/product.fixpreis.json'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class ClassList {
  #values = new Set();
  contains(value) { return this.#values.has(value); }
  toggle(value, force) { if (force) this.#values.add(value); else this.#values.delete(value); return force; }
}
class FakeElement extends EventTarget {
  constructor() { super(); this.attrs = new Map(); this.classList = new ClassList(); this.hidden = false; this.parentElement = null; this.mapping = {}; this.textContent = ''; }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  querySelector(selector) { return this.mapping[selector] ?? null; }
  querySelectorAll(selector) { return this.mapping[selector] ?? []; }
  closest(selector) { return this.mapping[`closest:${selector}`] ?? null; }
  scrollIntoView() { this.scrolled = true; }
}
class FakeInput extends FakeElement {
  constructor(value) { super(); this.value = value; this.type = 'radio'; this.checked = false; this.clicks = 0; }
  click() { this.clicks += 1; (this.peers ?? []).forEach((peer) => { peer.checked = false; }); this.checked = true; this.dispatchEvent(new Event('change')); }
}
class FakeResizeObserver {
  static instances = [];
  constructor(callback) { this.callback = callback; this.disconnected = false; FakeResizeObserver.instances.push(this); }
  observe() { this.observed = true; }
  disconnect() { this.disconnected = true; }
}

function runtime() {
  FakeResizeObserver.instances = [];
  const registry = new Map();
  const document = new EventTarget();
  const context = vm.createContext({
    Event, EventTarget, Element: FakeElement, HTMLElement: FakeElement, HTMLInputElement: FakeInput,
    document, ResizeObserver: FakeResizeObserver, getComputedStyle: () => ({ gridTemplateColumns: '1fr 1fr 1fr' }),
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
  });
  vm.runInContext(read('assets/tp-leisten-farbwahl.js'), context);
  return { TpLeistenFarbwahl: registry.get('tp-leisten-farbwahl'), document };
}

function harness() {
  const h = runtime();
  const element = new h.TpLeistenFarbwahl();
  const picker = new FakeElement();
  const red = new FakeInput('Rot'); red.checked = true; red.setAttribute('data-option-value-id', 'red');
  const blue = new FakeInput('Blau'); blue.setAttribute('data-option-value-id', 'blue');
  red.peers = [blue]; blue.peers = [red];
  picker.mapping['input[type="radio"]'] = [red, blue];
  const parent = new FakeElement(); parent.mapping['variant-picker'] = picker; element.parentElement = parent;
  const redTile = new FakeElement(); redTile.setAttribute('data-tp-farbwahl-id', 'red'); redTile.setAttribute('data-tp-farbwahl-value', 'Rot'); redTile.setAttribute('data-tp-farbwahl-name', 'Rot');
  const blueTile = new FakeElement(); blueTile.setAttribute('data-tp-farbwahl-id', 'blue'); blueTile.setAttribute('data-tp-farbwahl-value', 'Blau'); blueTile.setAttribute('data-tp-farbwahl-name', 'Blau'); blueTile.mapping['closest:[data-tp-farbwahl-id]'] = blueTile;
  const more = new FakeElement();
  const current = new FakeElement();
  element.mapping['[data-tp-farbwahl-id]'] = [redTile, blueTile];
  element.mapping['[data-tp-farbwahl-mehr]'] = more;
  element.mapping['[data-tp-farbwahl-current]'] = current;
  element.setAttribute('data-tp-farbwahl-limit', '1');
  return { ...h, element, red, blue, redTile, blueTile, current };
}

// EventTarget controls event.target; dispatch the click from the tile so it bubbles through a tiny adapter.
function selectBlue(h) {
  const event = new Event('click');
  Object.defineProperty(event, 'target', { value: h.blueTile });
  h.element.dispatchEvent(event);
}

const cases = [];
{
  const h = harness(); h.element.connectedCallback();
  assert.equal(h.element.hidden, false); assert.equal(h.redTile.getAttribute('aria-pressed'), 'true');
  assert.equal(FakeResizeObserver.instances.length, 1);
  cases.push({ name: 'initial-connect', visible: true, observers: 1 });
}
{
  const h = harness(); h.element.connectedCallback(); selectBlue(h);
  assert.equal(h.blue.clicks, 1); assert.equal(h.blueTile.getAttribute('aria-pressed'), 'true');
  cases.push({ name: 'connected-click-selects-radio', radioClicks: h.blue.clicks });
}
{
  const h = harness(); h.element.connectedCallback(); h.element.disconnectedCallback(); selectBlue(h);
  assert.equal(h.blue.clicks, 1);
  cases.push({ name: 'disconnected-still-selects-radio', radioClicks: h.blue.clicks });
}
{
  const h = harness(); h.element.connectedCallback(); const first = FakeResizeObserver.instances[0];
  h.element.disconnectedCallback(); h.element.connectedCallback(); selectBlue(h);
  assert.equal(first.disconnected, true); assert.equal(FakeResizeObserver.instances.length, 2); assert.equal(h.blue.clicks, 1);
  cases.push({ name: 'reconnect-observer-healthy-click-deduplicated', observers: 2, radioClicks: h.blue.clicks });
}
{
  const h = harness(); h.element.connectedCallback(); h.element.disconnectedCallback();
  h.red.checked = false; h.blue.checked = true; h.document.dispatchEvent(new Event('variant:update'));
  assert.equal(h.redTile.getAttribute('aria-pressed'), 'true');
  cases.push({ name: 'disconnected-removed-from-global-sync-set', redPressedRemains: true });
}

const template = read('templates/product.fixpreis.json');
assert.match(template, /"type": "tp-leisten-farbwahl"/);
const report = {
  session: 'S44', task: 'JS-001r', status: 'PASS', hashes, cases,
  sourceReach: { assignedTemplates: ['templates/product.fixpreis.json'], scriptLoadedByBlock: /tp-leisten-farbwahl\.js/.test(read('blocks/tp-leisten-farbwahl.liquid')), globalSyncEvents: ['variant:update', 'change'] },
  limits: 'Original complete IIFE/custom element; DOM, picker radios, tiles, ResizeObserver and layout adapted with native EventTarget. Local click, observer reconnect and global connected-instance Set executed. Native bubbling from tile/radio, Horizon morph, actual variant update, ProductForm/cart, browser and live product assignment not tested.',
};
fs.writeFileSync('audit/evidence/leisten-farbwahl-lifecycle-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: ${cases.length} Leisten-Farbwahl lifecycle observations; 1 assigned template`);
