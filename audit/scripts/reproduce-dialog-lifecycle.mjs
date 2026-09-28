import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/dialog.js', 'assets/cart-drawer.js', 'assets/predictive-search.js', 'assets/quick-add.js'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class TrackedTarget extends EventTarget {
  constructor() { super(); this.listenerAdds = {}; this.listenerRemoves = {}; }
  addEventListener(type, listener, options) {
    this.listenerAdds[type] = (this.listenerAdds[type] || 0) + 1;
    super.addEventListener(type, listener, options);
  }
  removeEventListener(type, listener, options) {
    this.listenerRemoves[type] = (this.listenerRemoves[type] || 0) + 1;
    super.removeEventListener(type, listener, options);
  }
}
class Component extends TrackedTarget {
  constructor() { super(); this.refs = {}; this.attrs = new Map(); }
  connectedCallback() {}
  disconnectedCallback() {}
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
}
class FakeCustomEvent extends Event {
  constructor(type, options = {}) { super(type, options); this.detail = options.detail; }
}
class FakeDialog {
  constructor() {
    this.open = false;
    this.style = {};
    this.offsetWidth = 100;
    this.classList = { values: new Set(), add: (v) => this.classList.values.add(v), remove: (v) => this.classList.values.delete(v) };
  }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function runtime() {
  const registry = new Map();
  const document = new TrackedTarget();
  document.body = { style: {} };
  document.documentElement = { setAttribute() {}, removeAttribute() {} };
  const window = new TrackedTarget();
  window.scrollY = 140;
  window.innerWidth = 1024;
  window.scrollCalls = [];
  window.scrollTo = (value) => window.scrollCalls.push(value);
  let source = read('assets/dialog.js')
    .replace(/^import .*;\n/gm, '')
    .replace(/export class /g, 'class ');
  const context = vm.createContext({
    Component, CustomEvent: FakeCustomEvent, Event, EventTarget, HTMLDetailsElement: class {},
    document, window, requestAnimationFrame: (callback) => callback(),
    debounce: (callback) => callback, isClickedOutside: () => false, onAnimationEnd: async () => {},
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
    console,
  });
  vm.runInContext(source, context);
  return { DialogComponent: registry.get('dialog-component'), document, window };
}

function harness() {
  const h = runtime();
  const component = new h.DialogComponent();
  component.refs.dialog = new FakeDialog();
  return { ...h, component, dialog: component.refs.dialog };
}

const cases = [];
{
  const h = harness();
  h.component.setAttribute('dialog-active-max-width', '900');
  h.component.connectedCallback();
  assert.equal(h.window.listenerAdds.resize, 1);
  h.component.showDialog();
  assert.equal(h.dialog.open, true);
  assert.equal(h.document.body.style.position, 'fixed');
  assert.equal(h.component.listenerAdds.click, 1);
  assert.equal(h.component.listenerAdds.keydown, 1);
  cases.push({ name: 'connected-open-locks-body', open: h.dialog.open, bodyPosition: h.document.body.style.position, clickListeners: h.component.listenerAdds.click, keydownListeners: h.component.listenerAdds.keydown });

  h.component.disconnectedCallback();
  assert.equal(h.window.listenerRemoves.resize, 1);
  assert.equal(h.dialog.open, true);
  assert.equal(h.document.body.style.position, 'fixed');
  assert.equal(h.component.listenerRemoves.click || 0, 0);
  assert.equal(h.component.listenerRemoves.keydown || 0, 0);
  cases.push({ name: 'disconnect-open-leaves-dialog-body-and-local-listeners', open: h.dialog.open, bodyPosition: h.document.body.style.position, clickRemoves: h.component.listenerRemoves.click || 0, keydownRemoves: h.component.listenerRemoves.keydown || 0 });

  h.component.connectedCallback();
  h.component.showDialog();
  assert.equal(h.dialog.open, true);
  assert.equal(h.component.listenerAdds.click, 1);
  cases.push({ name: 'reconnect-open-show-is-noop', open: h.dialog.open, clickListenerAdds: h.component.listenerAdds.click });
}
{
  const h = harness();
  h.component.connectedCallback();
  h.component.showDialog();
  await h.component.closeDialog();
  assert.equal(h.dialog.open, false);
  assert.equal(h.document.body.style.position, '');
  assert.equal(h.component.listenerRemoves.click, 1);
  assert.equal(h.component.listenerRemoves.keydown, 1);
  assert.equal(h.window.scrollCalls.length, 1);
  assert.equal(h.window.scrollCalls[0].top, 140);
  assert.equal(h.window.scrollCalls[0].behavior, 'instant');
  cases.push({ name: 'normal-close-unlocks-and-removes-listeners', open: h.dialog.open, bodyPosition: h.document.body.style.position, scrollCalls: h.window.scrollCalls.length });
}

const directMarkupFiles = ['blocks/buy-buttons.liquid', 'blocks/filters.liquid', 'blocks/popup-link.liquid', 'layout/password.liquid', 'snippets/search-modal.liquid'];
for (const file of directMarkupFiles) assert.match(read(file), /<dialog-component/);
const subclasses = ['assets/cart-drawer.js', 'assets/predictive-search.js', 'assets/quick-add.js'].filter((file) => /extends DialogComponent/.test(read(file)));
assert.equal(subclasses.length, 2);

const report = {
  session: 'S49', task: 'JS-001w', status: 'PASS', hashes, cases,
  sourceReach: { directMarkupFiles, dialogSubclasses: subclasses },
  limits: 'Original complete DialogComponent and global details toggle listener; Component, dialog, animation end, debounce, body/window and custom events adapted. Open, open-disconnect, reconnect and normal close executed. Native top-layer removal, focus restoration, concurrent dialogs, real animations, Morph/Theme Editor triggers, browser and live reach not tested.',
};
fs.writeFileSync('audit/evidence/dialog-lifecycle-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: ${cases.length} dialog lifecycle observations; ${directMarkupFiles.length} direct markup sources; ${subclasses.length} subclasses`);
