import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/focus.js', 'assets/header-drawer.js', 'assets/collection-links.js', 'snippets/header-drawer.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class FakeDocument {
  constructor() { this.handlers = {}; this.adds = {}; this.removes = {}; this.activeElement = null; }
  addEventListener(type, handler) { (this.handlers[type] ??= new Set()).add(handler); this.adds[type] = (this.adds[type] || 0) + 1; }
  removeEventListener(type, handler) { this.handlers[type]?.delete(handler); this.removes[type] = (this.removes[type] || 0) + 1; }
  emit(type, event) { for (const handler of this.handlers[type] || []) handler(event); }
}
class FakeNode {
  constructor(name) { this.name = name; this.focusCount = 0; this.focusables = []; this.connected = true; }
  querySelectorAll() { return this.focusables; }
  contains(node) { return node === this || this.focusables.includes(node); }
  focus() { this.focusCount += 1; document.activeElement = this; }
  matches(selector) { return selector === ':focus' && document.activeElement === this; }
}

const document = new FakeDocument();
let source = read('assets/focus.js').replace(/export function /g, 'function ');
source += '\n;globalThis.__focusApi = { trapFocus, removeTrapFocus, cycleFocus };';
const context = vm.createContext({ document, Node: FakeNode, console });
vm.runInContext(source, context);
const { trapFocus, removeTrapFocus, cycleFocus } = context.__focusApi;

const cases = [];
const firstContainer = new FakeNode('drawer-a');
const first = new FakeNode('first-a');
const last = new FakeNode('last-a');
firstContainer.focusables = [first, last];
trapFocus(firstContainer);
assert.equal(document.handlers.keydown.size, 1);
assert.equal(document.handlers.focusin.size, 1);
assert.equal(firstContainer.focusCount, 1);
cases.push({ name: 'trap-installs-one-global-pair', keydownHandlers: document.handlers.keydown.size, focusinHandlers: document.handlers.focusin.size, containerFocus: firstContainer.focusCount });

document.activeElement = last;
let prevented = 0;
document.emit('keydown', { key: 'Tab', shiftKey: false, preventDefault() { prevented += 1; } });
assert.equal(first.focusCount, 1);
assert.equal(prevented, 1);
const outside = new FakeNode('outside');
let stopped = 0;
document.emit('focusin', { target: outside, stopPropagation() { stopped += 1; } });
assert.equal(first.focusCount, 2);
assert.equal(stopped, 1);
cases.push({ name: 'tab-cycle-and-outside-focus-redirect', firstFocus: first.focusCount, prevented, stopped });

const secondContainer = new FakeNode('drawer-b');
const second = new FakeNode('first-b');
secondContainer.focusables = [second];
trapFocus(secondContainer);
assert.equal(document.handlers.keydown.size, 1);
assert.equal(document.handlers.focusin.size, 1);
assert.equal(document.removes.keydown, 1);
assert.equal(document.removes.focusin, 1);
cases.push({ name: 'second-trap-replaces-first', keydownHandlers: document.handlers.keydown.size, focusinHandlers: document.handlers.focusin.size, priorPairsRemoved: 1 });

removeTrapFocus();
assert.equal(document.handlers.keydown.size, 0);
assert.equal(document.handlers.focusin.size, 0);
cases.push({ name: 'explicit-remove-clears-global-pair', keydownHandlers: document.handlers.keydown.size, focusinHandlers: document.handlers.focusin.size });

trapFocus(firstContainer);
firstContainer.connected = false;
const before = first.focusCount;
document.emit('focusin', { target: outside, stopPropagation() {} });
assert.equal(first.focusCount, before + 1);
const headerSource = read('assets/header-drawer.js');
const disconnected = headerSource.match(/disconnectedCallback\(\) \{[\s\S]*?\n  \}/)?.[0] || '';
assert.doesNotMatch(disconnected, /removeTrapFocus/);
assert.match(headerSource, /trapFocus\(details\)/);
cases.push({ name: 'open-drawer-disconnect-leaves-trap-on-detached-tree', detachedContainer: !firstContainer.connected, redirectedToDetachedFirst: first.focusCount === before + 1 });

document.activeElement = first;
cycleFocus([first, last], 1);
assert.equal(last.focusCount, 1);
cases.push({ name: 'collection-link-cycle-positive-control', lastFocus: last.focusCount });
removeTrapFocus();

const report = {
  session: 'S50', task: 'JS-001x', status: 'PASS', hashes, cases,
  sourceReach: { trapConsumer: 'assets/header-drawer.js', cycleConsumer: 'assets/collection-links.js', globalImportMap: 'snippets/scripts.liquid' },
  limits: 'Original complete focus.js; document listener registry, focusable nodes and activeElement adapted. Trap, Tab/focusin redirect, replacement, explicit remove, detached-container persistence and cycleFocus executed. HeaderDrawer disconnect omission verified from current source. Native focus event propagation, animation timing, inert/top-layer, browser and live markup not tested.',
};
fs.writeFileSync('audit/evidence/focus-trap-lifecycle-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: ${cases.length} focus lifecycle observations; 2 direct consumers`);
