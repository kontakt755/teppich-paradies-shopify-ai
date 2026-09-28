import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/header-drawer.js', 'assets/focus.js', 'snippets/header-drawer.liquid', 'blocks/_header-menu.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class ClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
}

class TrackedElement extends EventTarget {
  constructor(name = 'element') {
    super();
    this.name = name;
    this.attrs = new Map();
    this.classList = new ClassList();
    this.listenerAdds = {};
    this.listenerRemoves = {};
    this.activeListeners = new Map();
    this.queries = new Map();
    this.queryAll = new Map();
  }
  addEventListener(type, listener, options) {
    this.listenerAdds[type] = (this.listenerAdds[type] || 0) + 1;
    (this.activeListeners.get(type) ?? this.activeListeners.set(type, new Set()).get(type)).add(listener);
    super.addEventListener(type, listener, options);
  }
  removeEventListener(type, listener, options) {
    this.listenerRemoves[type] = (this.listenerRemoves[type] || 0) + 1;
    this.activeListeners.get(type)?.delete(listener);
    super.removeEventListener(type, listener, options);
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  hasAttribute(name) { return this.attrs.has(name); }
  querySelector(selector) { return this.queries.get(selector) ?? null; }
  querySelectorAll(selector) { return this.queryAll.get(selector) ?? []; }
  closest() { return null; }
}

class Component extends TrackedElement {
  constructor() { super('header-drawer'); this.refs = {}; }
  connectedCallback() {}
  disconnectedCallback() {}
}

function fixture() {
  const registry = new Map();
  const animationCallbacks = [];
  const timers = [];
  const focusEvents = [];
  let willChangeRemovals = 0;
  let source = read('assets/header-drawer.js').replace(/^import .*;\n/gm, '');
  const context = vm.createContext({
    Component,
    Element: TrackedElement,
    HTMLElement: TrackedElement,
    Event,
    EventTarget,
    requestAnimationFrame: (callback) => callback(),
    setTimeout: (callback) => { timers.push(callback); return timers.length; },
    onAnimationEnd: (element, callback) => animationCallbacks.push({ element, callback }),
    trapFocus: (element) => focusEvents.push({ type: 'trap', target: element.name }),
    removeTrapFocus: () => focusEvents.push({ type: 'remove' }),
    removeWillChangeOnAnimationEnd: () => { willChangeRemovals += 1; },
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
    console,
  });
  vm.runInContext(source, context);
  const HeaderDrawer = registry.get('header-drawer');
  const component = new HeaderDrawer();
  const details = new TrackedElement('root-details');
  const summary = new TrackedElement('summary');
  const drawer = new TrackedElement('drawer-panel');
  const content = new TrackedElement('accordion-content');
  const animatedA = new TrackedElement('animated-a');
  const animatedB = new TrackedElement('animated-b');
  const menuDrawer = new TrackedElement('menu-drawer');
  details.queries.set('summary', summary);
  details.queries.set('.menu-drawer, .menu-drawer__submenu', drawer);
  details.queryAll.set('accordion-custom .details-content', [content]);
  component.queryAll.set('.menu-drawer__animated-element', [animatedA, animatedB]);
  component.queryAll.set('details[open]:not(accordion-custom > details)', [details]);
  component.refs = { details, menuDrawer };
  return {
    component, details, summary, drawer, content, animatedA, animatedB, menuDrawer,
    animationCallbacks, timers, focusEvents,
    willChangeRemovals: () => willChangeRemovals,
  };
}

const cases = [];
{
  const h = fixture();
  h.component.connectedCallback();
  assert.equal(h.component.activeListeners.get('keyup').size, 1);
  assert.equal(h.animatedA.activeListeners.get('animationend').size, 1);
  assert.equal(h.animatedB.activeListeners.get('animationend').size, 1);
  cases.push({
    name: 'connect-installs-local-and-descendant-listeners',
    keyupListeners: h.component.activeListeners.get('keyup').size,
    animatedListeners: [h.animatedA, h.animatedB].map((element) => element.activeListeners.get('animationend').size),
  });

  h.component.open();
  assert.equal(h.summary.attrs.get('aria-expanded'), 'true');
  assert.equal(h.details.classList.contains('menu-open'), true);
  assert.equal(h.content.classList.contains('details-content--no-animation'), true);
  assert.equal(h.animationCallbacks.length, 1);
  assert.equal(h.timers.length, 1);
  h.component.disconnectedCallback();
  assert.equal(h.component.activeListeners.get('keyup').size, 0);
  assert.equal(h.animatedA.activeListeners.get('animationend').size, 1);
  h.animationCallbacks.shift().callback();
  h.timers.shift()();
  assert.deepEqual(h.focusEvents, [{ type: 'trap', target: 'root-details' }]);
  assert.equal(h.content.classList.contains('details-content--no-animation'), false);
  cases.push({
    name: 'open-disconnect-does-not-cancel-animation-or-timer',
    keyupListenersAfterDisconnect: h.component.activeListeners.get('keyup').size,
    descendantAnimationListenersAfterDisconnect: h.animatedA.activeListeners.get('animationend').size,
    focusAfterDetachedAnimation: h.focusEvents,
    timerMutatedDetachedContent: !h.content.classList.contains('details-content--no-animation'),
  });

  h.component.connectedCallback();
  assert.equal(h.component.activeListeners.get('keyup').size, 1);
  assert.equal(h.animatedA.activeListeners.get('animationend').size, 1);
  h.animatedA.dispatchEvent(new Event('animationend'));
  assert.equal(h.willChangeRemovals(), 1);
  cases.push({
    name: 'same-node-reconnect-deduplicates-stable-animation-listener',
    animationListenerAddCalls: h.animatedA.listenerAdds.animationend,
    activeAnimationListeners: h.animatedA.activeListeners.get('animationend').size,
    callbackRunsPerEvent: h.willChangeRemovals(),
  });
}
{
  const h = fixture();
  h.component.connectedCallback();
  h.details.setAttribute('open', '');
  h.component.open();
  h.animationCallbacks.shift().callback();
  h.component.close();
  assert.equal(h.summary.attrs.get('aria-expanded'), 'false');
  assert.equal(h.animationCallbacks.length, 1);
  h.animationCallbacks.shift().callback();
  assert.equal(h.details.hasAttribute('open'), false);
  assert.deepEqual(h.focusEvents.map(({ type }) => type), ['trap', 'remove']);
  cases.push({
    name: 'normal-close-resets-root-and-removes-focus-trap',
    detailsOpen: h.details.hasAttribute('open'),
    ariaExpanded: h.summary.attrs.get('aria-expanded'),
    focusSequence: h.focusEvents.map(({ type }) => type),
  });
}
{
  const h = fixture();
  h.component.connectedCallback();
  h.details.setAttribute('open', '');
  h.component.close();
  h.component.disconnectedCallback();
  h.focusEvents.push({ type: 'trap', target: 'new-drawer' });
  h.animationCallbacks.shift().callback();
  assert.deepEqual(h.focusEvents.map(({ type }) => type), ['trap', 'remove']);
  cases.push({
    name: 'detached-close-callback-can-remove-later-global-trap',
    focusSequence: h.focusEvents,
    callbackCancelledOnDisconnect: false,
  });
}

assert.match(read('snippets/header-drawer.liquid'), /<header-drawer/);
assert.match(read('blocks/_header-menu.liquid'), /header-drawer/);

const report = {
  session: 'S51',
  task: 'JS-001y',
  status: 'PASS',
  hashes,
  cases,
  sourceReach: {
    component: 'assets/header-drawer.js',
    focusApi: 'assets/focus.js',
    directMarkup: 'snippets/header-drawer.liquid',
    headerComposition: 'blocks/_header-menu.liquid',
  },
  limits: 'Original complete HeaderDrawer; Component lifecycle, DOM nodes, requestAnimationFrame, timer queue, animation completion, focus API and custom-elements registry adapted. Connect, open-disconnect with delayed callbacks, same-node reconnect, normal close and detached close callback executed. Native details toggle order, real CSS animation events, DOM removal semantics, browser and live reach not tested.',
};
fs.writeFileSync('audit/evidence/header-drawer-lifecycle-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: ${cases.length} header drawer lifecycle observations; ${files.length} source hashes`);
