// S12: local original drawer/dialog lifecycle; no network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
const read = f => fs.readFileSync(f, 'utf8');
const moduleSource = f => read(f).replace(/^import\s[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '');
const manifest = JSON.parse(read('audit/evidence/source-manifest.json'));
const hashes = ['assets/cart-drawer.js', 'assets/dialog.js', 'assets/events.js', 'assets/utilities.js', 'snippets/header-actions.liquid'].map(file => {
  const sha256 = createHash('sha256').update(read(file)).digest('hex'); assert.equal(sha256, manifest.files[file].live.sha256); return { file, sha256 };
});
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness({ mobile = false, auto = true, summaryHeight = 200 } = {}) {
  class El extends EventTarget {
    constructor() { super(); this.refs = {}; this.attrs = new Map(); this.textContent = ''; this.style = { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } }; const set = new Set(); this.classList = { add: k => set.add(k), remove: k => set.delete(k) }; }
    connectedCallback() {} disconnectedCallback() {}
    hasAttribute(k) { return this.attrs.has(k); } getAttribute(k) { return this.attrs.get(k) ?? null; }
    setAttribute(k,v) { this.attrs.set(k, v); } removeAttribute(k) { this.attrs.delete(k); }
  }
  const frames = [], registry = new Map(), historyCalls = [], scrolls = [];
  const window = new EventTarget(); Object.assign(window, { scrollY: 120, innerWidth: mobile ? 390 : 1440, scrollTo: x => scrolls.push(x) });
  const document = new EventTarget(); document.body = new El(); document.documentElement = new El(); document.querySelector = () => null;
  const history = { state: null, pushState(s) { this.state = s; historyCalls.push('push'); }, replaceState(s) { this.state = s; historyCalls.push('replace'); }, back() { this.state = null; historyCalls.push('back'); } };
  const dialog = new El(); dialog.open = false; dialog.modalCalls = 0;
  dialog.showModal = () => { dialog.modalCalls++; dialog.open = true; }; dialog.close = () => { dialog.open = false; };
  dialog.getAnimations = () => []; dialog.getBoundingClientRect = () => ({ height: 800 });
  dialog.querySelector = sel => summaryHeight === null ? null : sel === '.cart-drawer__summary' ? { getBoundingClientRect: () => ({ height: summaryHeight }) } : {};
  const context = vm.createContext({ Event, CustomEvent, AbortController, Component: El, HTMLDetailsElement: class {}, DocumentTimeline: class {},
    window, document, history, setTimeout, clearTimeout, requestAnimationFrame: fn => frames.push(fn),
    matchMedia: () => ({ matches: !mobile }), Theme: { translations: { cart_count: 'Artikel' } },
    customElements: { get: n => registry.get(n), define: (n,c) => registry.set(n,c), whenDefined: () => new Promise(() => {}) } });
  const utilities = read('assets/utilities.js');
  const part = (a,b) => { const i = utilities.indexOf(a), j = utilities.indexOf(b,i + a.length); assert.ok(i >= 0 && j > i); return utilities.slice(i,j).replace(/^export /gm,''); };
  vm.runInContext(part('export function debounce(', '/**\n * Creates a throttled'), context);
  vm.runInContext(part('export function onAnimationEnd(', '/**\n * Check if the current breakpoint is desktop'), context);
  vm.runInContext(moduleSource('assets/events.js'), context);
  vm.runInContext(moduleSource('assets/dialog.js'), context);
  vm.runInContext(moduleSource('assets/cart-drawer.js'), context);
  const drawer = new (registry.get('cart-drawer-component'))(); drawer.refs = { dialog, liveRegion: new El() }; if (auto) drawer.setAttribute('auto-open',''); drawer.connectedCallback();
  const frame = () => { const queued = frames.splice(0); queued.forEach(fn => fn()); };
  const event = type => document.dispatchEvent(vm.runInContext(`new ${type}({item_count:3}, 'fixture', {})`,context));
  return { drawer, dialog, frame, frames, event, history, historyCalls, window, document, scrolls };
}
const cases = [];
for (const mobile of [false,true]) {
  const h = harness({ mobile }); h.drawer.showDialog(); assert.equal(h.dialog.open,false); h.frame(); assert.equal(h.dialog.open,true);
  assert.equal(h.document.body.style.position,'fixed'); assert.equal(h.dialog.getAttribute('cart-summary-sticky'),'true');
  await h.drawer.closeDialog(); assert.equal(h.dialog.open,false); assert.equal(h.document.body.style.position,'');
  assert.deepEqual(h.historyCalls,mobile ? ['push','back'] : []); assert.equal(h.scrolls[0].top,120);
  cases.push({ name: mobile ? 'mobile-open-close' : 'desktop-open-close', history: h.historyCalls, scrollRestored: true });
}
for (const type of ['CartAddEvent','CartUpdateEvent']) {
  const h = harness(); h.event(type); assert.equal(h.frames.length,1); assert.equal(h.drawer.refs.liveRegion.textContent,''); h.frame();
  assert.equal(h.dialog.open,true); assert.equal(h.drawer.refs.liveRegion.textContent,'');
  h.event(type); assert.equal(h.drawer.refs.liveRegion.textContent,'Artikel: 3');
  cases.push({ name: type, opens: true, firstAnnouncementEmpty: true, laterAnnouncement: h.drawer.refs.liveRegion.textContent });
}
{
  const h = harness({ auto:false }); h.event('CartAddEvent'); h.frame(); assert.equal(h.dialog.open,false);
  h.drawer.showDialog(); h.frame(); h.event('CartUpdateEvent'); assert.equal(h.drawer.refs.liveRegion.textContent,'Artikel: 3');
  cases.push({ name:'auto-open-disabled', remainsClosedOnAdd:true, announcesWhenManuallyOpen:true });
}
{
  const h = harness({ mobile:true }); h.drawer.showDialog(); h.frame(); h.history.state = null; h.window.dispatchEvent(new Event('popstate')); await flush();
  assert.equal(h.dialog.open,false); assert.deepEqual(h.historyCalls,['push']);
  cases.push({ name:'mobile-back', closes:true, noSecondHistoryBack:true });
}
{
  const h = harness(); h.drawer.disconnectedCallback(); h.event('CartAddEvent'); assert.equal(h.frames.length,0);
  h.drawer.connectedCallback(); h.event('CartAddEvent'); assert.equal(h.frames.length,1); h.frame();
  cases.push({ name:'disconnect-reconnect-listener', disconnectedIgnores:true, reconnectSchedulesOnce:true });
}
for (const action of ['close-before-frame','disconnect-before-frame']) {
  const h = harness(); h.drawer.showDialog();
  if (action === 'close-before-frame') await h.drawer.closeDialog(); else h.drawer.disconnectedCallback();
  h.frame(); assert.equal(h.dialog.open,true); assert.equal(h.document.body.style.position,'fixed');
  cases.push({ name:action, queuedOpenStillRuns:true, boundary:'Synthetic scheduling/DOM attachment; H-014, not native showModal proof.' });
}
for (const summaryHeight of [500,null]) {
  const h = harness({ summaryHeight }); h.drawer.showDialog(); h.frame(); assert.equal(h.dialog.getAttribute('cart-summary-sticky'),'false');
  cases.push({ name:summaryHeight === null ? 'empty-summary' : 'large-summary', sticky:false });
}
const report = { session:'S12', task:'CART-002b.2c', status:'PASS', hashes, cases, confirmedNewIssues:0,
  limits:'Original drawer/dialog/events and original utility debounce/onAnimationEnd/isMobileBreakpoint. Minimal Element and modal simulation; getAnimations returns []; controlled RAF, history state/back is a model. No focus, native cancel, real navigation, animation timing, attachment error or live theme verification. H-014 observations require browser follow-up.' };
fs.writeFileSync('audit/evidence/drawer-lifecycle-2026-09-21.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',cases:cases.length,hashes:hashes.length}));
