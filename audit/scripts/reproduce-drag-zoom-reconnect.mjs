import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/drag-zoom-wrapper.js', 'snippets/product-media-gallery-content.liquid', 'snippets/product-media-gallery-content-styles.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class FakeStyle {
  values = new Map();
  setProperty(name, value) { this.values.set(name, String(value)); }
  get(name) { return this.values.get(name); }
}
class FakeElement extends EventTarget {
  constructor() { super(); this.style = new FakeStyle(); this.clientWidth = 400; this.clientHeight = 300; }
  getBoundingClientRect() { return { width: 400, height: 300 }; }
}

function harness() {
  const window = new EventTarget();
  const observers = [];
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.observing = false; observers.push(this); }
    observe() { this.observing = true; }
    disconnect() { this.observing = false; }
  }
  const image = { naturalWidth: 800, naturalHeight: 600 };
  class Component extends FakeElement {
    constructor() { super(); this.refs = { image }; }
    connectedCallback() {}
    disconnectedCallback() {}
  }
  const registry = new Map();
  let frame = 0;
  const context = vm.createContext({
    Event, EventTarget, AbortController, Component, ResizeObserver, window, performance,
    DialogCloseEvent: class { static eventName = 'dialog:close'; },
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    preventDefault: (event) => { event.preventCalls = (event.preventCalls || 0) + 1; },
    isMobileBreakpoint: () => true,
    requestAnimationFrame: (callback) => { callback(); return ++frame; }, cancelAnimationFrame() {},
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
  });
  vm.runInContext(read('assets/drag-zoom-wrapper.js').replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
  const component = new (registry.get('drag-zoom-wrapper'))();
  const touchStart = () => {
    const event = new Event('touchstart', { cancelable: true });
    event.touches = [{ clientX: 100, clientY: 100 }];
    component.dispatchEvent(event);
    return event.preventCalls || 0;
  };
  const dialogReset = () => {
    component.style.setProperty('--drag-zoom-scale', '9');
    window.dispatchEvent(new Event('dialog:close'));
    return component.style.get('--drag-zoom-scale');
  };
  return { component, observers, touchStart, dialogReset };
}

const cases = [];
function observe(name, lifecycle) {
  const h = harness(); lifecycle(h.component); const result = { name, touchPreventCalls: h.touchStart(), dialogResetScale: h.dialogReset(), observerActive: h.observers[0].observing };
  cases.push(result); return result;
}
assert.deepEqual(observe('initial-connect', (c) => c.connectedCallback()), { name: 'initial-connect', touchPreventCalls: 1, dialogResetScale: '1.5', observerActive: true });
assert.deepEqual(observe('disconnected', (c) => { c.connectedCallback(); c.disconnectedCallback(); }), { name: 'disconnected', touchPreventCalls: 0, dialogResetScale: '9', observerActive: false });
assert.deepEqual(observe('same-instance-reconnect', (c) => { c.connectedCallback(); c.disconnectedCallback(); c.connectedCallback(); }), { name: 'same-instance-reconnect', touchPreventCalls: 0, dialogResetScale: '1.5', observerActive: true });
assert.deepEqual(observe('fresh-instance', (c) => c.connectedCallback()), { name: 'fresh-instance', touchPreventCalls: 1, dialogResetScale: '1.5', observerActive: true });

const templateSource = fs.readdirSync('templates').filter((name) => /^product.*\.json$/.test(name)).map((name) => {
  const source = read(`templates/${name}`);
  const json = JSON.parse(source.slice(source.indexOf('{')));
  let enabledMediaGallery = false;
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.type === '_product-media-gallery' && value.disabled !== true) enabledMediaGallery = true;
    for (const child of Object.values(value)) visit(child);
  };
  visit(json);
  return { template: name, enabledMediaGallery };
});
assert.equal(templateSource.length, 8);
assert.equal(templateSource.filter((row) => row.enabledMediaGallery).length, 8);

const report = {
  session: 'S37', task: 'JS-001k', status: 'PASS', hashes, cases, templateSource,
  sourceReach: {
    scriptConditionalOnGalleryImages: /if has_image_drop/.test(read('snippets/product-media-gallery-content.liquid')),
    wrapperRenderedInZoomDialog: /<drag-zoom-wrapper/.test(read('snippets/product-media-gallery-content.liquid')),
  },
  limits: 'Original complete DragZoomWrapper; Component/image/style/ResizeObserver and animation frame adapted, native EventTarget/AbortController. Mobile touchstart listener, dialog-close reset, observer and reconnect lifecycle tested. Pinch/drag math, double-tap timing, bounds, real image layout, zoom dialog browser behavior and live product media not tested. Eight gallery templates are static potential reach; wrapper rendering remains conditional on image media.',
};
fs.writeFileSync('audit/evidence/drag-zoom-reconnect-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log('PASS: 4 drag-zoom lifecycle observations; 8/8 product templates expose conditional gallery reach');
