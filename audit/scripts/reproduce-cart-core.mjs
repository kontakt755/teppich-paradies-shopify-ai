// S08 / CART-002a. Original source executed locally; all requests intercepted.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (f) => readFileSync(path.join(root, f), 'utf8');
const copy = (x) => JSON.parse(JSON.stringify(x));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const strip = (s) => s.replace(/{%-?\s*(doc|stylesheet)\s*-?%}[\s\S]*?{%-?\s*end\1\s*-?%}/g, '');
const moduleSource = (f) => read(f).replace(/^import\s[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '');
function between(s, a, b) { const i = s.indexOf(a), j = s.indexOf(b, i + a.length); assert.ok(i >= 0 && j > i); return s.slice(i, j).replace(/^export /, ''); }
const flush = () => new Promise((resolve) => setImmediate(resolve));
const liquid = new Liquid();
liquid.registerFilter('inline_asset_content', () => '<svg></svg>');
liquid.registerFilter('t', (s) => s);
liquid.registerFilter('item_count_for_variant', (cart, id) => cart.items.filter((i) => i.variant.id === id).reduce((s, i) => s + i.quantity, 0));
const groupFile = 'assets/tp-cart-gruppen.js', liquidFile = 'snippets/tp-cart-gruppe.liquid';
const groupContext = vm.createContext({});
vm.runInContext(read(groupFile), groupContext, { filename: groupFile });
const G = groupContext.TPCartGruppen;
const snippet = strip(read(liquidFile));
const piece = (key = 'piece') => ({ key, quantity: 2, titel: 'Audit accessory', properties: {}, optionen: ['Standard'], typ: 'Zubehör' });
const roll = (g = 'T-audit') => ({ ...piece('roll'), quantity: 8, titel: 'Audit roll', typ: 'Teppichboden',
  properties: { Art: 'Meterware', Rollenbreite: '400 cm', 'Gewünschte Länge': '200 cm', 'Fläche (aufgerundet)': '8,00 m²', ...(g ? { _Gruppe: g } : {}) } });
const service = (g = 'T-audit') => ({ ...piece('service'), typ: 'Service', quantity: 12,
  properties: { 'Zu Teppichboden': 'Audit roll', Höhe: '5 cm', Länge: '12 m', ...(g ? { _Gruppe: g } : {}) } });
const rug = (g = 'K-audit') => ({ ...piece('rug'), quantity: 600, preisPro001Qm: true,
  properties: { _Gruppe: g, _Zuschnitt: 'Audit rug · 200 × 300 cm', Einfassung: 'Gekettelt', Maße: '200 × 300 cm', 'Fläche (abgerechnet)': '6,00 m²', 'Kante umlaufend': '10,00 m' } });
const edge = (g = 'K-audit') => ({ ...piece('edge'), quantity: 1000, typ: 'Service',
  properties: { _Gruppe: g, 'Zu Teppich': 'Audit rug', 'Kante umlaufend': '10,00 m' } });
function toLiquid(z) { return { ...z, url: '/products/audit-fixture',
  product: { title: z.titel, type: z.typ, metafields: { custom: { preis_pro_001_qm: { value: Boolean(z.preisPro001Qm) } } } },
  variant: { id: z.key, available: true, options: z.optionen, quantity_rule: { min: 1, increment: 1 } } }; }
const cartOf = (rows, attributes = {}) => ({ items: rows.map(toLiquid), attributes, item_count: rows.reduce((s, r) => s + r.quantity, 0) });
async function render(cart, part, line) { return liquid.parseAndRender(snippet, { cart, teil: part, line_item: line }); }
const text = (s) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
class Element {
  constructor() { this.dataset = {}; this.attributes = new Map(); this.disabled = false; this.textContent = ''; this.value = ''; this.defaultValue = ''; this.removed = false; this.children = []; this.listeners = new Map();
    const classes = new Set(); this.classList = { add: (s) => classes.add(s), remove: (s) => classes.delete(s), contains: (s) => classes.has(s) };
    this.style = { setProperty() {} }; }
  getAttribute(k) { return this.attributes.get(k) ?? null; }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  removeAttribute(k) { this.attributes.delete(k); }
  addEventListener(k, fn) { this.listeners.set(k, fn); }
  removeEventListener(k) { this.listeners.delete(k); }
  dispatchEvent(e) { this.listeners.get(e.type)?.(e); return true; }
  querySelector() { return null; }
  appendChild(el) { this.children.push(el); }
  remove() { this.removed = true; }
  get isConnected() { return !this.removed && (!this.parent || this.parent.isConnected); }
  connectedCallback() {}
  disconnectedCallback() {}
}
const registry = new Map();
const selectorContext = vm.createContext({ Component: Element, HTMLElement: Element,
  customElements: { get: (n) => registry.get(n), define: (n, c) => registry.set(n, c) } });
vm.runInContext(between(read('assets/utilities.js'), 'export function parseIntOrDefault(', '\n\nclass Scheduler'), selectorContext);
vm.runInContext(moduleSource('assets/component-quantity-selector.js'), selectorContext);
vm.runInContext(moduleSource('assets/component-cart-quantity-selector.js'), selectorContext);
const Selector = registry.get('cart-quantity-selector-component');
const renderCases = [];
let lineRenders = 0, quantityLocks = 0;
async function renderCase(name, rows, attributes, expectedBlocked, expectedOrphans = 0) {
  const cart = cartOf(rows, attributes), lock = await render(cart, 'sperre');
  const blocked = lock.includes('data-tp-cart-gesperrt="1"');
  assert.equal(blocked, expectedBlocked, name);
  assert.equal(G.waisen(rows).length, expectedOrphans, name + ' JS orphans');
  if (blocked) { assert.match(lock, /name="tp_cart_sperre"/); assert.match(lock, /\brequired\b/); }
  const views = [];
  for (const [i, row] of rows.entries()) {
    const item = cart.items[i], calculated = (await render(cart, 'berechnet', item)).trim() === 'ja';
    assert.equal(calculated, G.istBerechnet(row), name + ' classification');
    const quantity = await render(cart, 'menge', item), hint = await render(cart, 'hinweis', item), help = await render(cart, 'mengenhinweis', item);
    const orphan = hint.includes('data-tp-waise="1"');
    assert.equal(orphan, G.waisen(rows).some((w) => w.key === row.key), name + ' line orphan');
    if (calculated) {
      assert.match(quantity, new RegExp(`name="updates\\[\\]" value="${row.quantity}"`));
      assert.ok(text(quantity).endsWith(G.kundeneinheit(row)), name + ' customer quantity');
      if (!orphan) assert.equal(help.includes('<a '), !G.istService(row), name + ' return link');
    } else assert.equal(quantity.trim(), '');
    // Render actual quantity constraints, then run both original selector classes.
    const selectorHtml = await liquid.parseAndRender(strip(read('snippets/quantity-selector.liquid')), {
      cart, product: item.product, variant: item.variant, in_cart_quantity: item.quantity, line_index: i, can_update_quantity: !calculated,
    });
    const inputHtml = selectorHtml.match(/<input\b[\s\S]*?>/)[0];
    const attrs = Object.fromEntries([...inputHtml.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const input = Object.assign(new Element(), { min: attrs.min, max: attrs.max ?? '', step: attrs.step, value: attrs.value });
    const selector = new Selector(); selector.refs = { quantityInput: input, minusButton: new Element(), plusButton: new Element() };
    selector.connectedCallback();
    if (calculated) {
      assert.equal(attrs.min, String(row.quantity)); assert.equal(attrs.max, String(row.quantity));
      assert.match(inputHtml, /\bdisabled\b/);
      assert.equal(selector.refs.minusButton.disabled, true); assert.equal(selector.refs.plusButton.disabled, true);
      quantityLocks++;
    } else {
      assert.equal(attrs.max, undefined); assert.equal(selector.refs.plusButton.disabled, false);
    }
    views.push({ key: row.key, calculated, orphan, quantity: text(quantity), hint: text(hint), help: text(help), inputAttributes: attrs,
      buttonsDisabled: [selector.refs.minusButton.disabled, selector.refs.plusButton.disabled] });
    lineRenders++;
  }
  renderCases.push({ name, rows, attributes, blocked, lockText: text(lock), retryButton: lock.includes('data-tp-zuschnitt-abgleich'), views });
}
await renderCase('piece plus package remain editable', [piece(), { ...piece('package'), properties: { _pakete: '2', _qm_gesamt: '4,16' } }], {}, false);
await renderCase('ungrouped meterware locked quantity', [roll('')], {}, false);
await renderCase('complete roll group and accessory', [roll(), service(), piece()], {}, false);
await renderCase('services ordered before main', [service(), roll()], {}, false);
await renderCase('orphaned service group', [service(), piece()], {}, true, 1);
await renderCase('service without group', [service('')], {}, true, 1);
await renderCase('raw service without properties', [{ ...piece(), typ: 'Service' }], {}, true, 1);
await renderCase('area units without measures', [{ ...piece(), preisPro001Qm: true }], {}, true, 1);
await renderCase('wish option without measures', [{ ...piece(), optionen: ['Sand', 'Wunschmaß'] }], {}, true, 1);
await renderCase('room measurements present', [{ ...roll(''), optionen: ['Sand', 'Wunschmaß'], properties: { Art: 'Raummaß', 'Ihre Breite': '350 cm', 'Fläche': '7,00 m²' } }], {}, false);
await renderCase('complete rug group attributes match', [rug(), edge()], { 'Zuschnitt K-audit': rug().properties._Zuschnitt }, false);
await renderCase('rug missing attribute', [rug(), edge()], {}, true);
await renderCase('rug wrong attribute', [rug(), edge()], { 'Zuschnitt K-audit': 'wrong' }, true);
await renderCase('stale cut attribute with ordinary item', [piece()], { 'Zuschnitt old': 'old', Sonstiges: 'keep' }, true);
await renderCase('empty stale cut attribute allowed', [piece()], { 'Zuschnitt old': '' }, false);
const legacy = rug(); delete legacy.properties._Zuschnitt;
await renderCase('legacy rug requires reconfiguration', [legacy, edge()], {}, true);
const noGroup = rug('');
await renderCase('cut property without group', [noGroup], {}, true);
const minRug = rug(); minRug.properties.Mindestpreis = 'angewendet';
await renderCase('minimum price unit wording', [minRug, edge()], { 'Zuschnitt K-audit': minRug.properties._Zuschnitt }, false);
await renderCase('underlay running metre unit', [roll(), { ...service(), key: 'underlay', quantity: 5, properties: { _Gruppe: 'T-audit', 'Zu Teppichboden': 'Audit roll', Bahnen: '2' } }], {}, false);
await renderCase('two intact groups and plain item', [service(), rug(), piece(), edge(), roll()], { 'Zuschnitt K-audit': rug().properties._Zuschnitt }, false);

// Full CartItemsComponent: real grouping/requests; minimal DOM, controlled network.
const actionCases = [];
async function actionCase(name, o = {}) {
  const rows = o.onlyGroup ? [roll(), service()] : [roll(), service(), piece()];
  const cart = cartOf(rows), requests = [], errors = [], events = [], morphs = [], refreshes = [], animations = [];
  const domRows = [];
  for (const [i, z] of rows.entries()) {
    const html = await render(cart, 'menge', cart.items[i]), marker = new Element();
    const group = html.match(/data-tp-gruppe="([^"]*)"/)?.[1];
    if (group !== undefined) marker.setAttribute('data-tp-gruppe', group);
    const row = new Element(); row.dataset.key = z.key;
    row.querySelector = (s) => s === '[data-tp-gruppe]' && group !== undefined ? marker : null;
    domRows.push(row);
  }
  let resolveResponse, rejectResponse, emptyShown = false, markerPresent = !!o.checkoutLocked;
  const network = new Promise((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject; });
  const listeners = new Map(), checkout = new Element(), reg = new Map();
  class Template extends Element { content = {}; }
  const doc = { querySelector: () => markerPresent ? {} : null,
    querySelectorAll: (s) => s === '.cart__checkout-button' ? [checkout] : [],
    getElementById: () => o.onlyGroup ? new Template() : null, importNode: () => ({}),
    addEventListener: (n, fn) => listeners.set(n, fn), removeEventListener() {} };
  const context = vm.createContext({ Component: Element, HTMLElement: Element, HTMLButtonElement: Element, HTMLTemplateElement: Template,
    Node: Element, document: doc, window: { location: { pathname: o.drawer ? '/products/audit' : '/cart' } },
    Theme: { routes: { cart_update_url: '/cart/update.js', cart_change_url: '/cart/change.js' } },
    ThemeEvents: { cartUpdate: 'cart:update', discountUpdate: 'discount:update', quantitySelectorUpdate: 'quantity:update' },
    CartUpdateEvent: class { constructor(resource, sourceId, data) { this.type = 'cart:update'; this.detail = { resource, sourceId, data }; } },
    DiscountUpdateEvent: class {},
    customElements: { get: (n) => reg.get(n), define: (n, c) => reg.set(n, c) },
    debounce: (fn) => fn, prefersReducedMotion: () => !o.delayedAnimation, onAnimationEnd: (_row, fn) => animations.push(fn),
    startViewTransition: (fn) => fn(), resetShimmer() {},
    cartPerformance: { createStartingMarker: () => 'audit', measureFromMarker() {} },
    morphSection: (...args) => morphs.push(args), sectionRenderer: { renderSection: (...args) => { refreshes.push(args); return Promise.resolve(); } },
    DOMParser: class { parseFromString() { return { querySelector: () => ({ textContent: '2' }) }; } },
    console: { error: (e) => errors.push(String(e)) },
    fetch: (url, config) => { requests.push({ url, body: JSON.parse(config.body) }); return network; },
  });
  vm.runInContext(read(groupFile), context);
  vm.runInContext(between(read('assets/utilities.js'), 'export function fetchConfig(', '\n\n/**'), context);
  vm.runInContext(moduleSource('assets/component-cart-items.js'), context, { filename: 'assets/component-cart-items.js' });
  const Cart = reg.get('cart-items-component'), component = new Cart();
  component.dataset = { sectionId: 'audit-cart', ...(o.drawer ? { drawer: '' } : {}) };
  const input = Object.assign(new Element(), { value: '9', defaultValue: '2' });
  const errorText = new Element(), errorContainer = new Element(); errorContainer.classList.add('hidden');
  const line = o.line ?? 1;
  // Match cart-products: the error container belongs to the very row removed.
  errorContainer.parent = domRows[line - 1]; errorText.parent = errorContainer;
  component.refs = { cartItemRows: domRows, quantitySelectors: domRows.map(() => ({ querySelector: () => input })),
    [`cartItemError-${line}`]: errorText, [`cartItemErrorContainer-${line}`]: errorContainer };
  component.dispatchEvent = (e) => events.push(copy(e.detail));
  component.replaceChildren = () => { emptyShown = true; domRows.forEach((r) => r.remove()); };
  component.connectedCallback();
  assert.equal(checkout.disabled, !!o.checkoutLocked);
  if (o.change) component.updateQuantity({ line, quantity: 3, action: 'change' });
  else component.onLineItemRemove(line);
  assert.equal(requests.length, 1);
  const grouped = !o.change && line <= 2;
  assert.equal(requests[0].url, grouped ? '/cart/update.js' : '/cart/change.js');
  if (grouped) assert.deepEqual(requests[0].body.updates, { roll: 0, service: 0 });
  else { assert.equal(requests[0].body.line, line); assert.equal(requests[0].body.quantity, o.change ? 3 : 0); }
  assert.equal(requests[0].body.sections, 'audit-cart');
  assert.equal(requests[0].body.sections_url, o.drawer ? '/products/audit' : '/cart');
  const removedBeforeResponse = domRows.filter((r) => r.removed).map((r) => r.dataset.key);
  if (o.response === 'network') rejectResponse(new Error('Synthetic network failure before mutation'));
  else if (o.response === '422') resolveResponse({ text: async () => JSON.stringify({ errors: 'Synthetic rejected mutation' }) });
  else resolveResponse({ text: async () => JSON.stringify({ items: [], sections: { 'audit-cart': '<div>modelled response</div>' } }) });
  await flush();
  const errorVisibleBeforeAnimation = errorContainer.isConnected && !errorContainer.classList.contains('hidden');
  animations.forEach((fn) => fn());
  assert.equal(component.classList.contains('cart-items-disabled'), false);
  const failure = ['network','422'].includes(o.response);
  if (failure) { assert.equal(morphs.length, 0); assert.equal(refreshes.length, 0); assert.equal(events.length, 0); }
  else { assert.equal(morphs.length, 1); assert.equal(events.length, 1); }
  if (failure && !o.change) {
    const expectedRemoved = grouped ? ['roll','service'] : ['piece'];
    assert.deepEqual(domRows.filter((r) => r.removed).map((r) => r.dataset.key), expectedRemoved);
    assert.equal(errorContainer.isConnected, false, name + ' error row detached');
    if (!o.delayedAnimation) assert.deepEqual(removedBeforeResponse, expectedRemoved);
    else { assert.equal(removedBeforeResponse.length, 0); assert.ok(animations.length > 0); }
  }
  if (o.change && o.response === '422') { assert.equal(input.value, '2'); assert.equal(errorText.textContent, 'Synthetic rejected mutation'); }
  // Changing the modeled server marker on a later refresh also releases the button.
  if (o.checkoutLocked) {
    markerPresent = false;
    listeners.get('cart:update')({ target: {}, detail: { data: { sections: { 'audit-cart': '<div>unlocked</div>' } } } });
    assert.equal(checkout.disabled, false);
  }
  actionCases.push({ name, options: o, request: requests[0], removedBeforeResponse,
    removedAfterResponse: domRows.filter((r) => r.removed).map((r) => r.dataset.key), emptyShown,
    errorVisibleBeforeAnimation, inlineErrorVisibleFinally: errorContainer.isConnected && !errorContainer.classList.contains('hidden'),
    errors, inlineErrorText: errorText.textContent, morphCount: morphs.length, refreshCount: refreshes.length, eventCount: events.length,
    issue: failure && !o.change ? 'TP-010' : null,
    limitation: 'Successful morph/DOMParser modeled, not full server DOM. Error branch retains refs to detached nodes; real MutationObserver refresh is not simulated.' });
}
await actionCase('remove roll group from main');
await actionCase('remove roll group from service', { line: 2 });
await actionCase('remove ordinary item alone', { line: 3 });
await actionCase('change ordinary quantity', { line: 3, change: true });
await actionCase('ordinary quantity rejected', { line: 3, change: true, response: '422' });
await actionCase('group removal rejected by server', { line: 2, response: '422' });
await actionCase('group removal network failure', { response: 'network' });
await actionCase('ordinary removal network failure', { line: 3, response: 'network' });
await actionCase('last group removal network failure', { onlyGroup: true, response: 'network' });
await actionCase('normal animation completes after rejected deletion', { line: 2, response: '422', delayedAnimation: true });
await actionCase('normal animation completes after network failure', { response: 'network', delayedAnimation: true });
await actionCase('drawer group removal request', { drawer: true, line: 2 });
await actionCase('checkout marker lock and release', { checkoutLocked: true });

// Full cut-sync asset with controlled stateful API responses and event delivery.
const syncCases = [];
async function syncCase(name, initial, o = {}) {
  let state = copy(initial), first = true, active = 0, maxActive = 0;
  const requests = [], events = [], listeners = new Map();
  const document = { readyState: 'loading', addEventListener: (n, fn) => listeners.set(n, fn),
    dispatchEvent: (e) => { events.push(copy(e.detail)); listeners.get(e.type)?.(e); }, querySelector: () => null };
  const context = vm.createContext({ window: {}, document,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    fetch: async (url, config) => {
      active++; maxActive = Math.max(maxActive, active);
      requests.push({ url, method: config?.method ?? 'GET', body: config?.body ? JSON.parse(config.body) : null });
      await flush(); active--;
      const failing = first && (o.failAt === 'get' || (o.failAt === 'post' && url === '/cart/update.js'));
      if (failing) { first = false; return { ok: false, status: 503 }; }
      if (url === '/cart/update.js' && !o.ignoreWrite) {
        for (const [k, v] of Object.entries(JSON.parse(config.body).attributes)) {
          if (v === '') delete state.attributes[k]; else state.attributes[k] = v;
        }
      }
      return { ok: true, json: async () => copy(state) };
    },
  });
  vm.runInContext(read('assets/tp-zuschnitt-abgleich.js'), context);
  const api = context.window.TPZuschnitt, outcomes = [];
  async function run() {
    try { const r = await api.abgleichenUndZeichnen(); outcomes.push({ ok: true, changed: r.geaendert }); }
    catch (e) { outcomes.push({ ok: false, message: String(e) }); }
  }
  if (o.queued) { const a = run(), b = run(); await a; await b; }
  else { await run(); if (o.retry) await run(); }
  await flush();
  const expectedFail = Boolean(o.failAt || o.ignoreWrite);
  assert.equal(outcomes[0].ok, !expectedFail, name);
  if (o.retry) assert.equal(outcomes[1].ok, true, name + ' queue recovers');
  assert.equal(maxActive, 1, name + ' serialized network');
  assert.equal(state.attributes.Sonstiges, initial.attributes.Sonstiges, name + ' unrelated attributes preserved');
  for (const event of events) { assert.equal(event.data.source, 'tp-zuschnitt-abgleich'); assert.equal(event.data.itemCount, state.item_count); }
  const lock = await render(state, 'sperre');
  if (!expectedFail || o.retry) assert.equal(lock.includes('data-tp-cart-gesperrt'), false, name + ' reconciled Liquid');
  else assert.equal(lock.includes('data-tp-cart-gesperrt'), true, name + ' remains blocked');
  if (o.queued) { assert.equal(outcomes[0].changed, true); assert.equal(outcomes[1].changed, false); assert.equal(requests.length, 3); }
  syncCases.push({ name, options: o, initial, requests, finalCart: state, outcomes, events, maxActiveRequests: maxActive,
    finalLiquidBlocked: lock.includes('data-tp-cart-gesperrt') });
}
const missing = cartOf([rug(),edge()], { Sonstiges: 'keep' });
await syncCase('missing cut attribute populated', missing);
await syncCase('matching cut attributes no write', cartOf([rug(),edge()], { 'Zuschnitt K-audit': rug().properties._Zuschnitt }));
await syncCase('removed rug attribute cleared', cartOf([piece()], { 'Zuschnitt old': 'old', Sonstiges: 'keep' }));
await syncCase('reconfigured rug replaces old attribute', cartOf([rug(),edge()], { 'Zuschnitt old': 'old' }));
await syncCase('wrong text replaced', cartOf([rug(),edge()], { 'Zuschnitt K-audit': 'wrong' }));
await syncCase('get HTTP failure keeps block', missing, { failAt: 'get' });
await syncCase('post HTTP failure keeps block', missing, { failAt: 'post' });
await syncCase('HTTP success without applied attribute rejected', missing, { ignoreWrite: true });
await syncCase('failed update then explicit retry', missing, { failAt: 'post', retry: true });
await syncCase('two calls serialize and avoid duplicate write', missing, { queued: true });

const files = [groupFile, liquidFile, 'assets/component-cart-items.js', 'assets/component.js', 'assets/tp-zuschnitt-abgleich.js',
  'snippets/quantity-selector.liquid', 'assets/component-quantity-selector.js', 'assets/component-cart-quantity-selector.js', 'snippets/cart-products.liquid', 'assets/utilities.js'];
const manifest = JSON.parse(read('audit/evidence/source-manifest.json'));
const sourceIntegrity = files.map((file) => ({ file, sha256: sha(read(file)), historicalLiveSha256: manifest.files[file]?.live?.sha256 ?? null }));
sourceIntegrity.forEach((f) => assert.equal(f.sha256, f.historicalLiveSha256, f.file));
process.stdout.write(JSON.stringify({ status: 'PASS', session: 'S08', matrix: 'CART-002a', generatedAt: new Date().toISOString(),
  renderCases: renderCases.length, lineRenders, quantityLocks, actionCases: actionCases.length, syncCases: syncCases.length,
  interceptedRequests: actionCases.length + syncCases.reduce((sum, c) => sum + c.requests.length, 0),
  sourceIntegrity, confirmedIssues: ['TP-010'],
  limitations: ['All fixture products, groups and network responses synthetic; no real cart or checkout mutation.',
    'LiquidJS renders original snippets with only doc/stylesheet removed and icon/translation/item-count filters adapted. Not a current Shopify Liquid proof.',
    'Original cart/quantity classes executed; DOM, Component refs, imports for rendering/animation/performance modeled. Reduced motion and delayed animation callbacks exercised; real CSS timing, pointer and MutationObserver behavior not tested.',
    'Cart successful section morphs and DOMParser modeled. Rejected removal is observed before any reload or unrelated later refresh; server cart unchanged is the explicit failure fixture.',
    'Full cut-sync source with stateful intercepted responses, queue and own-event suppression. Liquid lock is rendered HTML/UI, not a server-side Shopify validation guarantee.',
    'No S01-S07 rerun, no production repairs, no current live asset/product/browser validation.' ],
  renderObservations: renderCases, actionObservations: actionCases, syncObservations: syncCases,
}, null, 2) + '\n');
