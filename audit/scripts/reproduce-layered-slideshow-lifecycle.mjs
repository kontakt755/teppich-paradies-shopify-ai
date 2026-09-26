import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/layered-slideshow.js', 'sections/layered-slideshow.liquid', 'blocks/_layered-slide.liquid', 'assets/theme-editor.js'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class FakeElement extends EventTarget {
  constructor(attrs = {}) { super(); this.attrs = new Map(Object.entries(attrs)); this.style = { height: '', minHeight: '', setProperty() {}, removeProperty() {} }; }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  toggleAttribute(name, force) { force ? this.attrs.set(name, '') : this.attrs.delete(name); }
  hasAttribute(name) { return this.attrs.has(name); }
  getBoundingClientRect() { return { width: 500, height: 320 }; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  matches() { return false; }
  focus() { this.dispatchEvent(new Event('focus')); }
}

function harness() {
  const document = new EventTarget();
  document.activeElement = null;
  const mediaQueryLarge = new EventTarget();
  const tabs = [new FakeElement({ 'aria-selected': 'true', role: 'tab' }), new FakeElement({ 'aria-selected': 'false', role: 'tab' })];
  const panels = [new FakeElement(), new FakeElement()];
  const container = new FakeElement({ size: 'auto' });
  const observers = [];
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  class Component extends FakeElement {
    constructor() { super(); this.refs = { container, tabs, panels }; }
    connectedCallback() {}
    disconnectedCallback() {}
  }
  const registry = new Map();
  const context = vm.createContext({
    Event, EventTarget, AbortController, Component, document, mediaQueryLarge,
    ResizeObserver: Observer, MutationObserver: Observer,
    isMobileBreakpoint: () => false,
    getComputedStyle: () => ({ minHeight: '0', paddingBlockStart: '0', paddingBlockEnd: '0', getPropertyValue: () => '0' }),
    requestAnimationFrame: (callback) => callback(), setTimeout,
    customElements: { define: (name, klass) => registry.set(name, klass) },
  });
  vm.runInContext(read('assets/layered-slideshow.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
  const component = new (registry.get('layered-slideshow-component'))();
  const clickSecond = () => tabs[1].dispatchEvent(new Event('click', { cancelable: true }));
  const selected = () => tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
  const pointer = (type, clientX) => Object.assign(new Event(type, { cancelable: true }), { clientX, clientY: 0 });
  return { component, container, observers, document, clickSecond, selected, pointer };
}

const reconnectCases = [];
{
  const h = harness(); h.component.connectedCallback(); h.clickSecond();
  assert.equal(h.selected(), 1); reconnectCases.push({ name: 'initial-connect', selected: h.selected() });
}
{
  const h = harness(); h.component.connectedCallback(); h.component.disconnectedCallback(); h.clickSecond();
  assert.equal(h.selected(), 0); assert.ok(h.observers.every((observer) => observer.disconnected));
  reconnectCases.push({ name: 'disconnected-ignores-tab', selected: h.selected(), observersDisconnected: true });
}
{
  const h = harness(); h.component.connectedCallback(); h.component.disconnectedCallback(); h.component.connectedCallback(); h.clickSecond();
  assert.equal(h.selected(), 1); reconnectCases.push({ name: 'same-instance-reconnect-works', selected: h.selected() });
}
{
  const h = harness(); h.component.connectedCallback(); h.clickSecond();
  assert.equal(h.selected(), 1); reconnectCases.push({ name: 'fresh-instance', selected: h.selected() });
}

const dragCases = [];
{
  const h = harness(); h.component.connectedCallback();
  h.container.dispatchEvent(h.pointer('pointerdown', 300));
  h.component.disconnectedCallback();
  h.document.dispatchEvent(h.pointer('pointermove', 100));
  assert.equal(h.container.hasAttribute('data-dragging'), true);
  dragCases.push({ name: 'disconnect-during-drag-keeps-document-listener', mutatedAfterDisconnect: true });
  h.document.dispatchEvent(h.pointer('pointerup', 100));
  assert.equal(h.container.hasAttribute('data-dragging'), false);
  dragCases.push({ name: 'pointerup-eventually-cleans-drag-listener', draggingAfterPointerUp: false });
}

const templateFiles = fs.readdirSync('templates').filter((name) => name.endsWith('.json'));
const assignedTemplates = templateFiles.filter((name) => read(`templates/${name}`).includes('"type": "layered-slideshow"'));
const report = {
  session: 'S34', task: 'JS-001h', status: 'PASS', hashes, reconnectCases, dragCases,
  sourceReach: {
    scriptLoadedGlobally: /layered-slideshow\.js/.test(read('snippets/scripts.liquid')),
    sectionExists: fs.existsSync('sections/layered-slideshow.liquid'),
    assignedTemplates,
    themeEditorIntegration: /layered-slideshow-component/.test(read('assets/theme-editor.js')),
  },
  limits: 'Original complete LayeredSlideshowComponent; Component, DOM elements, observers, styles, media query and animation frames adapted, native EventTarget/AbortController. Tab connect/disconnect/reconnect and disconnect during an active desktop drag tested. Keyboard focus edges, responsive layout calculations, content height, video playback, touch/mobile and browser rendering not tested. No local JSON template assigns the optional section; global script and theme-editor support are source reach only.',
};
fs.writeFileSync('audit/evidence/layered-slideshow-lifecycle-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: 4 reconnect and 2 active-drag lifecycle observations; ${assignedTemplates.length} assigned templates`);
