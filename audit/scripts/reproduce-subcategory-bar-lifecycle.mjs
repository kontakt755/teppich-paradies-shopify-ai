import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/tp-unterkategorien-leiste.js', 'snippets/tp-unterkategorien-leiste.liquid', 'blocks/tp-unterkategorien.liquid', 'sections/hero_split.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.attrs = new Map();
    this.refs = new Map();
    this.scrollWidth = 500;
    this.clientWidth = 200;
    this.scrollLeft = 0;
    this.connected = true;
    this.scrollCalls = 0;
  }
  querySelector(selector) { return this.refs.get(selector) ?? null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  hasAttribute(name) { return this.attrs.has(name); }
  scrollTo({ left }) { this.scrollLeft = left; this.scrollCalls += 1; }
}

function makeNav() {
  const nav = new FakeElement();
  const list = new FakeElement();
  const next = new FakeElement();
  nav.refs.set('.tp-uk__list', list);
  nav.refs.set('[data-tp-uk-weiter]', next);
  return { nav, list, next };
}

function runtime({ resizeObserver = true } = {}) {
  const document = new EventTarget();
  document.readyState = 'complete';
  document.navs = [];
  document.scans = 0;
  document.querySelectorAll = () => { document.scans += 1; return document.navs; };
  const window = new EventTarget();
  const observers = [];
  class FakeResizeObserver {
    constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
    observe(target) { this.targets.push(target); }
    trigger() { this.callback(); }
  }
  const context = vm.createContext({ document, window, ResizeObserver: resizeObserver ? FakeResizeObserver : undefined, Math, console });
  vm.runInContext(read('assets/tp-unterkategorien-leiste.js'), context);
  return { document, window, observers };
}

const cases = [];
{
  const h = runtime();
  const first = makeNav();
  h.document.navs = [first.nav];
  h.document.dispatchEvent(new Event('shopify:section:load'));
  assert.equal(first.nav.getAttribute('data-mehr-rechts'), 'true');
  assert.equal(h.observers.length, 1);
  cases.push({ name: 'initial-section-load', right: first.nav.getAttribute('data-mehr-rechts'), observers: h.observers.length });

  first.list.scrollLeft = 100;
  first.list.dispatchEvent(new Event('scroll'));
  assert.equal(first.nav.getAttribute('data-mehr-links'), 'true');
  cases.push({ name: 'connected-scroll-updates-state', left: first.nav.getAttribute('data-mehr-links') });

  first.nav.connected = false;
  const second = makeNav();
  h.document.navs = [second.nav];
  h.document.dispatchEvent(new Event('shopify:section:load'));
  assert.equal(h.observers.length, 2);
  assert.deepEqual(h.observers[0].targets, [first.list]);
  cases.push({ name: 'replacement-adds-observer-without-old-disconnect', observers: h.observers.length, oldTargets: h.observers[0].targets.length });

  first.list.scrollLeft = 290;
  h.observers[0].trigger();
  assert.equal(first.nav.getAttribute('data-mehr-rechts'), 'true');
  first.list.scrollLeft = 300;
  h.observers[0].trigger();
  assert.equal(first.nav.getAttribute('data-mehr-rechts'), 'false');
  cases.push({ name: 'detached-old-resize-observer-still-mutates', right: first.nav.getAttribute('data-mehr-rechts') });

  first.list.scrollLeft = 0;
  first.list.dispatchEvent(new Event('scroll'));
  assert.equal(first.nav.getAttribute('data-mehr-links'), 'false');
  cases.push({ name: 'detached-old-scroll-listener-still-mutates', left: first.nav.getAttribute('data-mehr-links') });
}
{
  const h = runtime({ resizeObserver: false });
  const first = makeNav();
  h.document.navs = [first.nav];
  h.document.dispatchEvent(new Event('shopify:section:load'));
  first.nav.connected = false;
  first.list.scrollLeft = 300;
  h.window.dispatchEvent(new Event('resize'));
  assert.equal(first.nav.getAttribute('data-mehr-rechts'), 'false');
  cases.push({ name: 'fallback-detached-window-resize-still-mutates', right: first.nav.getAttribute('data-mehr-rechts') });
}

const templateFiles = fs.readdirSync('templates').filter((name) => name.endsWith('.json'));
const assignedTemplates = templateFiles.filter((name) => {
  const text = read(`templates/${name}`);
  return /"type"\s*:\s*"(?:tp-unterkategorien|hero_split)"/.test(text);
});
assert.equal(assignedTemplates.length, 12);

const report = {
  session: 'S46', task: 'JS-001t', status: 'PASS', hashes, cases,
  sourceReach: { assignedTemplateCount: assignedTemplates.length, assignedTemplates, renderSources: ['blocks/tp-unterkategorien.liquid', 'sections/hero_split.liquid'] },
  limits: 'Original complete IIFE; nav/list/button, document section-load, scroll, ResizeObserver and fallback window resize adapted with native EventTarget. Detached old nodes were retained deliberately to execute cleanup behavior. Menu matching, real layout/scroll snap, Theme Editor disposal, browser GC and current live assignments not tested.',
};
fs.writeFileSync('audit/evidence/subcategory-bar-lifecycle-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: ${cases.length} subcategory-bar lifecycle observations; ${assignedTemplates.length} assigned templates`);
