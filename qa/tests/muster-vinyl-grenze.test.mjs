// Vinyl-Muster: kostenlos, aber hoechstens 3 je Bestellung (Inhaber 13.10.2026).
// Durchgesetzt im Musterkonfigurator (assets/tp-sample-checkout-core.js +
// tp-sample-checkout.js), sichtbar gemacht auf der Produktseite
// (snippets/tp-muster-grenze, blocks/tp-muster-cta, blocks/tp-rollware-rechner).
// Teppichboden und alle anderen Muster: unveraendert die Gesamtgrenze 3 (Bonus 4).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const coreSource = read('assets/tp-sample-checkout-core.js');
const checkoutSource = read('assets/tp-sample-checkout.js');

function ladeCore({ bonus = false } = {}) {
  const window = { TPMusterBonus: bonus };
  vm.runInNewContext(coreSource, { window });
  return window.TPSampleCheckoutCore;
}

const muster = (id, gruppe, quantity = 1) => ({
  quantity,
  properties: gruppe ? { _Muster_ID: id, _Muster_Gruppe: gruppe } : { _Muster_ID: id },
});
const KLICK = { handle: 'eiche-klick', id: 1, title: 'Eiche Klick', type: 'Klickvinyl', tags: [] };
const TEPPICH = { handle: 'velours', id: 2, title: 'Velours', type: 'Teppichboden', tags: [] };

test('Vinyl erkennt Klick-, Klebe- und Rollenvinyl, nicht Teppichboden oder Linoleum', () => {
  const core = ladeCore();
  for (const type of ['Klickvinyl', 'Klebevinyl', 'Vinyl von der Rolle', ' klickvinyl ']) {
    assert.equal(core.isVinyl({ type }), true, type);
  }
  for (const type of ['Teppichboden', 'Linoleumboden', 'Laminat', 'Musterservice', '']) {
    assert.equal(core.isVinyl({ type }), false, type);
  }
});

test('Typliste und Grenze stehen in JS und Liquid gleich', () => {
  const js = coreSource.match(/VINYL_TYPES = \[([^\]]+)\]/)[1].match(/'([^']+)'/g).map((t) => t.slice(1, -1)).sort();
  const liquid = read('snippets/tp-muster-grenze.liquid').match(/if tpmg_typ == [^\n]+/)[0].match(/'([^']+)'/g).map((t) => t.slice(1, -1)).sort();
  assert.deepEqual(liquid, js);
  assert.match(coreSource, /VINYL_MAX = 3;/);
  assert.match(read('snippets/tp-muster-grenze.liquid'), /tpmg_anzahl >= 3/);
});

test('Warenkorbzeilen fuer Vinyl tragen _Muster_Gruppe, andere nicht', () => {
  const core = ladeCore();
  const args = (product) => ({ product, colors: [{ value: 'Eiche', variantId: 11, exactImage: '' }], sampleVariantId: 900, origin: 'https://shop.example' });
  assert.equal(core.buildCartItems(args(KLICK))[0].properties._Muster_Gruppe, 'vinyl');
  assert.equal(core.buildCartItems(args({ ...KLICK, type: 'Vinyl von der Rolle' }))[0].properties._Muster_Gruppe, 'vinyl');
  assert.equal('_Muster_Gruppe' in core.buildCartItems(args(TEPPICH))[0].properties, false);
});

test('Ohne Bonus: Gesamtgrenze 3, bei reinen Vinyl-Mustern zaehlt die Vinyl-Grenze', () => {
  const core = ladeCore();
  const state = core.getSampleState({ items: [muster('a', 'vinyl'), muster('b', 'vinyl'), muster('c', 'vinyl')] });
  assert.equal(state.count, 3);
  assert.equal(state.vinylCount, 3);
  const limit = core.getLimit(KLICK, state);
  assert.deepEqual([limit.max, limit.inCart, limit.remaining, limit.word], [3, 3, 0, 'Vinyl-Muster']);
  // Teppichboden: Gesamtgrenze wie bisher
  const t = core.getLimit(TEPPICH, state);
  assert.deepEqual([t.max, t.remaining, t.word], [3, 0, 'Muster']);
});

test('Gemischter Warenkorb ohne Bonus: die Gesamtgrenze bindet zuerst', () => {
  const core = ladeCore();
  const state = core.getSampleState({ items: [muster('t1'), muster('v1', 'vinyl')] });
  const limit = core.getLimit(KLICK, state);
  assert.deepEqual([limit.max, limit.inCart, limit.remaining, limit.word], [3, 2, 1, 'Muster']);
});

test('Mit Abonnenten-Bonus: 4 Muster insgesamt, aber hoechstens 3 Vinyl-Muster', () => {
  const core = ladeCore({ bonus: true });
  assert.equal(core.MAX_SAMPLES, 4);
  const dreiVinyl = core.getSampleState({ items: [muster('a', 'vinyl'), muster('b', 'vinyl'), muster('c', 'vinyl')] });
  assert.equal(core.getLimit(KLICK, dreiVinyl).remaining, 0, 'kein viertes Vinyl-Muster');
  assert.equal(core.getLimit(TEPPICH, dreiVinyl).remaining, 1, 'Bonus-Muster bleibt fuer Teppichboden');
  const dreiTeppich = core.getSampleState({ items: [muster('a'), muster('b'), muster('c')] });
  assert.equal(core.getLimit(KLICK, dreiTeppich).remaining, 1, 'viertes Muster darf Vinyl sein');
});

test('Mit Bonus sperrt die Vinyl-Grenze die Auswahl (limitReached)', () => {
  const core = ladeCore({ bonus: true });
  assert.equal(core.getSelectionStatus(3, 0, 3, 'Vinyl-Muster').limitReached, true);
  assert.equal(core.getSelectionStatus(2, 1, 3, 'Vinyl-Muster').limitReached, true);
  assert.equal(core.getSelectionStatus(3, 0).limitReached, false, 'Gesamtgrenze mit Bonus: 4');
});

test('Meldung nennt bei Vinyl die Vinyl-Grenze, sonst wie bisher', () => {
  const core = ladeCore();
  assert.equal(core.getSelectionStatus(3, 0, 3, 'Vinyl-Muster').message,
    '3 von 3 Vinyl-Mustern im Warenkorb. Entfernen Sie dort zuerst ein Vinyl-Muster, um ein anderes auszuwählen.');
  assert.equal(core.getSelectionStatus(1, 1, 3, 'Vinyl-Muster').message, '2 von 3 Vinyl-Mustern insgesamt ausgewählt · noch 1 weiteres möglich');
  // Aufruf ohne Grenze und Wort: unveraenderter Wortlaut
  assert.equal(core.getSelectionStatus(0, 0).message, '0 von 3 Mustern ausgewählt');
  assert.equal(core.getSelectionStatus(1, 0).message, '1 von 3 Mustern im Warenkorb · 2 weitere möglich');
});

// --- Liquid: Snippet und Knopf auf der Produktseite ---

const liquid = new Liquid();
const grenzeSource = read('snippets/tp-muster-grenze.liquid').replace(/\{%-? doc -?%\}[\s\S]*?\{%-? enddoc -?%\}/, '');

const grenze = async (type, items) => (await liquid.parseAndRender(grenzeSource, { product: { type }, cart: { items } })).trim();

test('tp-muster-grenze: voll ab 3 Vinyl-Mustern, sonst vinyl; andere Belaege ohne Ausgabe', async () => {
  const drei = [muster('a', 'vinyl'), muster('b', 'vinyl'), muster('c', 'vinyl')];
  assert.equal(await grenze('Klickvinyl', drei), 'voll');
  assert.equal(await grenze('Vinyl von der Rolle', drei), 'voll');
  assert.equal(await grenze('Klebevinyl', drei.slice(0, 2)), 'vinyl');
  assert.equal(await grenze('Klebevinyl', [muster('t1'), muster('t2'), muster('t3')]), 'vinyl', 'Teppichmuster zaehlen nicht zur Vinyl-Grenze');
  assert.equal(await grenze('Klickvinyl', []), 'vinyl');
  assert.equal(await grenze('Teppichboden', drei), '');
  assert.equal(await grenze('Linoleumboden', drei), '');
});

const block = read('blocks/tp-muster-cta.liquid')
  .replace(/\{% doc %\}[\s\S]*?\{% enddoc %\}/, '')
  .replace(/\{% schema %\}[\s\S]*?\{% endschema %\}/, '')
  .replace(/\{% stylesheet %\}[\s\S]*?\{% endstylesheet %\}/, '')
  .replace("render 'tp-musteroption', product: product", 'echo tp_test_url')
  .replace("render 'tp-muster-grenze', product: product", 'echo tp_test_grenze');

const cta = (tp_test_grenze) => liquid.parseAndRender(block, {
  product: { template_suffix: '', title: 'Eiche Klick', type: 'Klickvinyl', handle: 'eiche-klick', tags: [] },
  tp_test_url: '/pages/muster?produkt=eiche-klick',
  tp_test_grenze,
  routes: { cart_url: '/cart' },
  block: { id: 'tp_muster_cta_1', shopify_attributes: '', settings: { label: 'Kostenloses Muster anfragen', hinweis: 'Bis zu 3 Farben, versandkostenfrei' } },
});

const offenerLink = /<a class="tp-muster-cta__link-[^"]+" href="\/pages\/muster\?produkt=eiche-klick"([^>]*)>/;
const vollKnopf = /<button class="[^"]*tp-muster-cta-voll"[^>]*disabled[^>]*>/;

test('Produktseite: Vinyl unter der Grenze zeigt den Hinweis statt "Bis zu 3 Farben"', async () => {
  const html = await cta('vinyl');
  assert.doesNotMatch(html.match(offenerLink)[1], /hidden/);
  assert.match(html, /Höchstens 3 Vinyl-Muster je Bestellung/);
  assert.doesNotMatch(html, /Bis zu 3 Farben/);
  assert.match(html.match(vollKnopf)[0], /hidden/, 'deaktivierter Knopf liegt verborgen bereit');
  assert.match(html, /data-tp-muster-grenze="vinyl"/);
  assert.match(html, /tp-muster-grenze\.js/);
});

test('Produktseite: bei 3 Vinyl-Mustern ist der Knopf deaktiviert und erklaert', async () => {
  const html = await cta('voll');
  assert.doesNotMatch(html.match(vollKnopf)[0], /hidden/);
  assert.match(html.match(offenerLink)[1], /hidden/, 'Link zum Konfigurator verborgen');
  assert.match(html, /<p class="tp-muster-cta-grenze"[^>]*data-tp-mg-voll>\s*3 von 3 Vinyl-Mustern im Warenkorb/);
  assert.match(html, /href="\/cart"/);
});

test('Produktseite: Teppichboden unveraendert', async () => {
  const html = await cta('');
  assert.match(html, /Bis zu 3 Farben, versandkostenfrei/);
  assert.doesNotMatch(html, /Vinyl-Muster|data-tp-m|<button|tp-muster-grenze\.js/);
});

test('Rollenrechner: Musterknopf nutzt dieselbe Grenze', () => {
  const s = read('blocks/tp-rollware-rechner.liquid');
  assert.match(s, /render 'tp-muster-grenze', product: product/);
  assert.match(s, /<button class="tp-rwc-muster" type="button" disabled[^>]*data-tp-mg-voll\{% unless tp_rc_muster_grenze == 'voll' %\} hidden/);
  assert.match(s, /data-tp-mg-offen\{% endif %\}\{% if tp_rc_muster_grenze == 'voll' %\} hidden/);
});

test('Die Zahl 3 steht in allen Vinyl-Texten gleich wie VINYL_MAX', () => {
  const max = Number(coreSource.match(/VINYL_MAX = (\d+);/)[1]);
  const dateien = ['blocks/tp-muster-cta.liquid', 'blocks/tp-rollware-rechner.liquid', 'sections/tp-sample-checkout.liquid', 'assets/tp-muster-grenze.js', 'snippets/tp-muster-grenze.liquid'];
  let treffer = 0;
  for (const datei of dateien) {
    const text = read(datei);
    for (const m of text.matchAll(/(\d+) von (\d+) Vinyl-Mustern|(?:höchstens|Höchstens) (\d+)(?: kostenlose)? Vinyl-Muster|höchstens (\d+) je Bestellung|VINYL_MAX = (\d+)|tpmg_anzahl >= (\d+)/g)) {
      for (const zahl of m.slice(1).filter(Boolean)) { assert.equal(Number(zahl), max, `${datei}: ${m[0]}`); treffer += 1; }
    }
  }
  assert.ok(treffer >= 8, `zu wenige Fundstellen (${treffer})`);
});

test('tp-muster-grenze.js schaltet nach einer Warenkorb-Aenderung um', async () => {
  const el = (attr) => ({ hidden: false, attr });
  const offen = [el('offen'), el('offen')];
  const voll = [el('voll'), el('voll')];
  const box = {
    attrs: { 'data-tp-muster-grenze': 'voll' },
    setAttribute(k, v) { this.attrs[k] = v; },
    querySelectorAll: (sel) => (sel === '[data-tp-mg-offen]' ? offen : voll),
  };
  const listeners = {};
  const document = {
    querySelector: () => box,
    querySelectorAll: () => [box],
    addEventListener: (t, fn) => { listeners[t] = fn; },
  };
  const window = { addEventListener() {} };
  vm.runInNewContext(read('assets/tp-muster-grenze.js'), { window, document, fetch: async () => ({ ok: false }), Promise });
  // Drawer entfernt ein Vinyl-Muster: 2 von 3 -> Link wieder da
  listeners['cart:update']({ detail: { resource: { items: [muster('a', 'vinyl'), muster('b', 'vinyl'), muster('t')] } } });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([offen.every((e) => !e.hidden), voll.every((e) => e.hidden), box.attrs['data-tp-muster-grenze']], [true, true, 'vinyl']);
  // wieder 3 Vinyl-Muster -> Knopf deaktiviert sichtbar
  listeners['cart:update']({ detail: { resource: { items: [muster('a', 'vinyl'), muster('b', 'vinyl'), muster('c', 'vinyl')] } } });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([offen.every((e) => e.hidden), voll.every((e) => !e.hidden), box.attrs['data-tp-muster-grenze']], [true, true, 'voll']);
});

// --- Ablauf im Konfigurator: 3 Vinyl-Muster liegen schon im Warenkorb ---

class El {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.attrs = {}; this.listeners = {};
    this.hidden = false; this.disabled = false; this.checked = false; this.textContent = '';
    this.classList = { toggle() {} };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type) { (this.listeners[type] || []).forEach((fn) => fn({ target: this })); }
  click() {
    if (this.type === 'checkbox') { if (this.disabled) return; this.checked = !this.checked; this.dispatch('change'); } else this.dispatch('click');
  }
  scrollIntoView() {}
  passt(sel) {
    if (sel === '[data-sample-color]') return 'data-sample-color' in this.attrs;
    if (sel === 'input[type="checkbox"]') return this.tagName === 'input' && this.type === 'checkbox';
    return false;
  }
  querySelectorAll(sel) {
    const out = [];
    const lauf = (el) => el.children.forEach((c) => { if (c.passt(sel)) out.push(c); lauf(c); });
    lauf(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

async function konfigurator({ product, cartItems, cartNachher = null, bonus = false }) {
  const requests = [];
  let cartAbrufe = 0;
  async function fetch(url, options = {}) {
    requests.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (url === '/cart/add.js') return { ok: true, json: async () => ({}) };
    if (url === '/cart.js') {
      cartAbrufe += 1;
      const items = cartAbrufe > 1 && cartNachher ? cartNachher : cartItems;
      return { ok: true, json: async () => ({ items }) };
    }
    const daten = { [`/products/${product.handle}.js`]: product, '/products/kostenloses-muster.js': { variants: [{ id: 900, available: true }] } }[url];
    return { ok: Boolean(daten), json: async () => daten, text: async () => '' };
  }
  const benannt = new Map();
  const rootEl = new El('section');
  rootEl.querySelector = (sel) => { if (!benannt.has(sel)) benannt.set(sel, new El()); return benannt.get(sel); };
  rootEl.querySelectorAll = () => [];
  const window = { TPMusterBonus: bonus, location: { search: `?produkt=${product.handle}`, origin: 'https://shop.example', href: '' }, localStorage: { getItem: () => null, setItem() {} } };
  const document = { querySelector: (sel) => (sel === '[data-tp-sample-checkout]' ? rootEl : null), createElement: (tag) => new El(tag) };
  const context = vm.createContext({ window, document, fetch, URLSearchParams, Set, Promise });
  vm.runInContext(coreSource, context);
  vm.runInContext(checkoutSource, context);
  const ticks = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r)); };
  await ticks();
  return { rootEl, requests, ticks, el: (sel) => rootEl.querySelector(sel) };
}

const ROLLE = {
  handle: 'eiche-rolle', id: 5, title: 'Eiche Vinylboden von der Rolle', type: 'Vinyl von der Rolle', tags: [], featured_image: '',
  options: [{ name: 'Breite', position: 1 }],
  variants: [{ id: 51, option1: '200 cm', title: '200 cm', available: true }],
};

test('Konfigurator: Vinyl-Rolle mit 3 Vinyl-Mustern im Warenkorb - Auswahl gesperrt, Grenze erklaert', async () => {
  const k = await konfigurator({ product: ROLLE, cartItems: [muster('a', 'vinyl'), muster('b', 'vinyl'), muster('c', 'vinyl')] });
  const karte = k.el('[data-sample-grid]').querySelector('[data-sample-color]');
  assert.equal(karte.querySelector('input[type="checkbox"]').disabled, true);
  assert.match(k.el('[data-sample-count]').textContent, /3 von 3 Vinyl-Mustern im Warenkorb/);
  assert.equal(k.el('[data-sample-vinyl]').hidden, false, 'Vinyl-Hinweis sichtbar');
});

test('Konfigurator: Vinyl-Rolle unter der Grenze - Muster mit _Muster_Gruppe in den Warenkorb', async () => {
  const k = await konfigurator({ product: ROLLE, cartItems: [muster('a', 'vinyl')] });
  const karte = k.el('[data-sample-grid]').querySelector('[data-sample-color]');
  karte.querySelector('input[type="checkbox"]').click();
  k.el('[data-sample-submit]').dispatch('click');
  await k.ticks();
  const add = k.requests.find((r) => r.url === '/cart/add.js');
  assert.ok(add, 'hinzugefuegt');
  assert.equal(add.body.items.length, 1);
  assert.equal(add.body.items[0].id, 900, 'ohne eigenes Musterprodukt: Sammelprodukt');
  assert.equal(add.body.items[0].properties._Muster_Gruppe, 'vinyl');
  assert.equal(add.body.items[0].properties.Produkt, 'Eiche Vinylboden von der Rolle');
});

test('Konfigurator: in einem zweiten Tab kamen Vinyl-Muster dazu - nichts wird hinzugefuegt', async () => {
  const k = await konfigurator({
    product: ROLLE,
    cartItems: [muster('a', 'vinyl')],
    cartNachher: [muster('a', 'vinyl'), muster('b', 'vinyl'), muster('c', 'vinyl')],
  });
  k.el('[data-sample-grid]').querySelector('[data-sample-color]').querySelector('input[type="checkbox"]').click();
  k.el('[data-sample-submit]').dispatch('click');
  await k.ticks();
  assert.equal(k.requests.some((r) => r.url === '/cart/add.js'), false);
  assert.match(k.el('[data-sample-error]').textContent, /höchstens 3 Vinyl-Muster/);
});

// --- Rollenrechner: Beschriftung des Musterknopfs ---
// Vinyl von der Rolle hat oft nur die Option "Breite"; der Knopf hiess dann
// "Kostenloses Muster in 200 cm". Farbe ist die erste Option ausser Breite,
// sonst der Tag "farbe: ...".
const rechner = read('blocks/tp-rollware-rechner.liquid');
const rcStart = rechner.indexOf("{%- liquid\n    capture tp_rc_muster_url");
const rcLiquid = rechner.slice(rcStart, rechner.indexOf('-%}', rcStart) + 3)
  .replace("render 'tp-musteroption', product: product", 'echo tp_test_url')
  .replace("render 'tp-muster-grenze', product: product", "echo ''");

async function rcKnopf(product) {
  const out = await liquid.parseAndRender(rcLiquid + '{{ tp_rc_muster_text }}|{{ tp_rc_muster_url }}', {
    product, block: { settings: { muster_label: 'Kostenloses Muster in {farbe}' } }, tp_test_url: '/pages/muster?produkt=x',
  });
  return out.trim();
}

test('Rollenrechner: Musterknopf nennt die Farbe, nicht die Breite', async () => {
  assert.ok(rcStart > 0, 'Liquid-Block im Rechner nicht gefunden');
  const nurBreite = { options_with_values: [{ name: 'Breite' }], selected_or_first_available_variant: { options: ['200 cm'] }, tags: ['art: vinyl', 'farbe: eiche grau'] };
  assert.equal(await rcKnopf(nurBreite), 'Kostenloses Muster in Eiche grau|/pages/muster?produkt=x&farbe=Eiche+grau');
  const breiteFarbe = { options_with_values: [{ name: 'Breite' }, { name: 'Farbe' }], selected_or_first_available_variant: { options: ['300 cm', 'Eiche Beige'] }, tags: [] };
  assert.match(await rcKnopf(breiteFarbe), /^Kostenloses Muster in Eiche Beige\|/);
  const farbeBreite = { options_with_values: [{ name: 'Farbe' }, { name: 'Breite' }], selected_or_first_available_variant: { options: ['Grau Anthrazit', '200 cm'] }, tags: [] };
  assert.match(await rcKnopf(farbeBreite), /^Kostenloses Muster in Grau Anthrazit\|/);
});

const KLICK_FARBEN = {
  handle: 'rovelia-klick', id: 6, title: 'Rovelia Klickvinyl', type: 'Klickvinyl', tags: [], featured_image: '',
  options: [{ name: 'Farbe', position: 1 }],
  variants: [
    { id: 61, option1: 'Eiche', title: 'Eiche', available: true },
    { id: 62, option1: 'Grau', title: 'Grau', available: true },
  ],
};

test('Konfigurator mit Abonnenten-Bonus: nach 3 Vinyl-Mustern sind alle Karten gesperrt, Warenkorb-Link sichtbar', async () => {
  const k = await konfigurator({ product: KLICK_FARBEN, bonus: true, cartItems: [muster('a', 'vinyl'), muster('b', 'vinyl'), muster('c', 'vinyl')] });
  const karten = k.el('[data-sample-grid]').querySelectorAll('[data-sample-color]');
  assert.equal(karten.length, 2);
  assert.ok(karten.every((c) => c.querySelector('input[type="checkbox"]').disabled), 'alle Karten gesperrt');
  assert.match(k.el('[data-sample-count]').textContent, /3 von 3 Vinyl-Mustern im Warenkorb/);
  assert.equal(k.el('[data-sample-cart-link]').hidden, false);
});

test('Konfigurator: Teppichmuster im Warenkorb, Vinyl-Grenze bindet - Warenkorb-Link bleibt sichtbar', async () => {
  const k = await konfigurator({ product: KLICK_FARBEN, bonus: true, cartItems: [muster('t1')] });
  assert.equal(k.el('[data-sample-cart-link]').hidden, false);
});

test('Konfigurator: Farbe kam in einem zweiten Tab dazu - eigene Meldung statt Grenze', async () => {
  const k = await konfigurator({
    product: KLICK_FARBEN,
    cartItems: [],
    cartNachher: [muster('rovelia-klick--eiche', 'vinyl')],
  });
  const karten = k.el('[data-sample-grid]').querySelectorAll('[data-sample-color]');
  karten.forEach((c) => c.querySelector('input[type="checkbox"]').click());
  k.el('[data-sample-submit]').dispatch('click');
  await k.ticks();
  assert.equal(k.requests.some((r) => r.url === '/cart/add.js'), false);
  assert.match(k.el('[data-sample-error]').textContent, /liegt inzwischen schon im Warenkorb/);
});
