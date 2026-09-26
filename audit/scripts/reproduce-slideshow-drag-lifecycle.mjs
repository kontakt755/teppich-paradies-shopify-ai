import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/slideshow.js', 'snippets/slideshow.liquid', 'snippets/scripts.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class FakeElement extends EventTarget {
  constructor() { super(); this.attrs = new Map(); this.refs = {}; this.parentElement = null; this.scrollWidth = 200; this.offsetWidth = 100; this.isConnected = true; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  hasAttribute(name) { return this.attrs.has(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  matches() { return false; }
  getBoundingClientRect() { return { x: 0, y: 0 }; }
  setPointerCapture() { this.captured = true; }
  releasePointerCapture() { this.captured = false; }
  before() {}
  after() {}
}
class Component extends FakeElement {
  connectedCallback() {}
  disconnectedCallback() {}
}
class PointerEvent extends Event {
  constructor(type, { x = 0, pointerId = 1 } = {}) { super(type); this.x = x; this.y = x; this.pointerId = pointerId; }
}
class SlideshowSelectEvent extends Event { constructor(detail) { super('slideshow:select'); this.detail = detail; } }
class Scroller {
  constructor() { this.axis = 'x'; this.byCalls = 0; this.toCalls = 0; this.destroyed = false; this.finished = Promise.resolve(); this.snap = true; }
  by() { this.byCalls += 1; }
  to() { this.toCalls += 1; }
  destroy() { this.destroyed = true; }
}
class FakeIntersectionObserver {
  constructor() { this.observed = []; this.disconnected = false; }
  observe(element) { this.observed.push(element); }
  unobserve(element) { this.observed = this.observed.filter((item) => item !== element); }
  disconnect() { this.disconnected = true; }
  takeRecords() { return []; }
}
class FakeResizeObserver {
  constructor() { this.disconnected = false; }
  observe() { this.observed = true; }
  disconnect() { this.disconnected = true; }
}

function runtime() {
  const registry = new Map();
  const document = new EventTarget(); document.hidden = false; document.createElement = () => new FakeElement();
  const context = vm.createContext({
    Event, EventTarget, Element: FakeElement, HTMLElement: FakeElement, Component, document,
    PointerEvent, MouseEvent: PointerEvent, AbortController, IntersectionObserver: FakeIntersectionObserver,
    ResizeObserver: FakeResizeObserver, Scroller, SlideshowSelectEvent,
    center: () => 0, closest: (values) => values[0], clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    mediaQueryLarge: { matches: true }, prefersReducedMotion: () => true, preventDefault: (event) => event.preventDefault(),
    viewTransition: { current: null }, scheduler: { schedule: (callback) => callback() }, scrollIntoView() {},
    requestAnimationFrame: (callback) => callback(), queueMicrotask, performance, setInterval, clearInterval,
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
  });
  vm.runInContext(read('assets/slideshow.js').replace(/^import[\s\S]*?from .*;\n/gm, '').replace('export class Slideshow', 'class Slideshow'), context);
  return { Slideshow: registry.get('slideshow-component'), document };
}

async function harness() {
  const h = runtime();
  const slideshow = new h.Slideshow();
  slideshow.parentElement = new FakeElement();
  const scroller = new FakeElement();
  const slides = [new FakeElement(), new FakeElement()];
  slides[0].setAttribute('slide-id', 'one'); slides[1].setAttribute('slide-id', 'two');
  slideshow.refs = { scroller, slideshowContainer: new FakeElement(), slides };
  await slideshow.connectedCallback();
  return { ...h, slideshow, scroller };
}

function beginDrag(scroller) { scroller.dispatchEvent(new PointerEvent('mousedown', { x: 100 })); }
function move(document, x = 80) { document.dispatchEvent(new PointerEvent('pointermove', { x })); }

const cases = [];
{
  const h = await harness(); beginDrag(h.scroller); move(h.document);
  assert.equal(h.slideshow.hasAttribute('dragging'), true);
  cases.push({ name: 'active-drag', dragging: true });
}
{
  const h = await harness(); beginDrag(h.scroller); h.slideshow.disconnectedCallback(); move(h.document);
  assert.equal(h.slideshow.hasAttribute('dragging'), true);
  cases.push({ name: 'disconnect-during-drag-still-handles-document-move', dragging: true });
  h.document.dispatchEvent(new PointerEvent('pointerup', { x: 80 }));
  await Promise.resolve();
  assert.equal(h.slideshow.hasAttribute('dragging'), false);
}
{
  const h = await harness(); h.slideshow.disconnectedCallback(); beginDrag(h.scroller); move(h.document);
  assert.equal(h.slideshow.hasAttribute('dragging'), false);
  cases.push({ name: 'normal-disconnect-removes-mousedown', dragging: false });
}
{
  const h = await harness(); h.slideshow.disconnectedCallback(); await h.slideshow.connectedCallback(); beginDrag(h.scroller); move(h.document);
  assert.equal(h.slideshow.hasAttribute('dragging'), true);
  cases.push({ name: 'normal-reconnect-restores-drag', dragging: true });
}
{
  const h = await harness(); beginDrag(h.scroller); h.slideshow.disconnectedCallback(); await h.slideshow.connectedCallback(); beginDrag(h.scroller);
  move(h.document, 70);
  assert.equal(h.slideshow.hasAttribute('dragging'), true);
  cases.push({ name: 'reconnect-during-active-drag-remains-owned-by-old-controller', dragging: true });
}

const liquidFiles = fs.readdirSync('snippets').filter((name) => name.endsWith('.liquid'));
const markupFiles = liquidFiles.filter((name) => read(`snippets/${name}`).includes('<slideshow-component'));
const templateFiles = fs.readdirSync('templates').filter((name) => name.endsWith('.json'));
const assignedTemplates = templateFiles.filter((name) => /"type": "(?:_product-media-gallery|_product-card|slideshow)"/.test(read(`templates/${name}`)));
assert.ok(assignedTemplates.length >= 20);

const report = {
  session: 'S43', task: 'JS-001q', status: 'PASS', hashes, cases,
  sourceReach: { scriptLoadedGlobally: /slideshow\.js/.test(read('snippets/scripts.liquid')), customElementMarkupFiles: markupFiles.map((name) => `snippets/${name}`), assignedTemplateCount: assignedTemplates.length, assignedTemplates },
  limits: 'Original complete Slideshow; Component/DOM/Scroller/observers/layout/scheduler adapted, native EventTarget/AbortController used. Active pointer-drag disconnect and normal disconnect/reconnect executed. Slide selection geometry, autoplay timing, infinite reorder, focus synchronization, real pointer capture, browser and live theme not tested.',
};
fs.writeFileSync('audit/evidence/slideshow-drag-lifecycle-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: ${cases.length} slideshow drag lifecycle observations; ${assignedTemplates.length} assigned templates`);
