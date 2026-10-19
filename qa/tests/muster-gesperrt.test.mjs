// Gesperrte Muster (Inhaber 16.10.2026): Ist das Muster einer Farbe beim
// Lieferanten nicht verfuegbar, bleibt die Mustervariante im Musterprodukt
// muster-<handle> bestehen, ist aber nicht verfuegbar (Bestand 0, deny). Der
// Konfigurator zeigt die Farbe dann als "Kein Muster verfuegbar" und legt sie
// nie in den Warenkorb - auch nicht ueber den Rueckfall auf kostenloses-muster.
// Fehlt die Mustervariante dagegen ganz, bleibt der Rueckfall wie bisher.
//
// Geprueft werden der Rechenkern (assets/tp-sample-checkout-core.js) und der
// echte Ablauf in assets/tp-sample-checkout.js mit nachgebildetem DOM und
// fetch. Kein Netzwerk.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const coreSource = read('assets/tp-sample-checkout-core.js');
const checkoutSource = read('assets/tp-sample-checkout.js');

const kern = { window: { location: { search: '' }, localStorage: { getItem: () => null, setItem() {} } } };
vm.runInNewContext(coreSource, kern);
const core = kern.window.TPSampleCheckoutCore;

const FARBEN = [
  { value: 'Grau', variantId: 101, image: '', exactImage: '' },
  { value: 'Beige', variantId: 102, image: '', exactImage: '' },
  { value: 'Rot', variantId: 103, image: '', exactImage: '' },
];
const musterProdukt = (variants) => ({ options: [{ name: 'Farbe', position: 1 }], variants });
const PRODUKT = { id: 7, handle: 'piumera', title: 'Piumera Teppichboden' };

// --- Rechenkern ---

test('drei Faelle je Farbe: verfuegbar, Variante fehlt, Variante gesperrt', () => {
  const muster = musterProdukt([
    { id: 601, option1: 'Grau', available: true },
    { id: 602, option1: 'beige ', available: false },
  ]);
  const r = core.assignSampleVariants(FARBEN, muster, 'Farbe');
  assert.deepEqual(r.map((c) => c.sampleVariantId), [601, null, null]);
  assert.deepEqual(r.map((c) => c.sampleUnavailable), [false, true, false], 'nur Beige ist gesperrt, Rot fehlt nur');
  assert.deepEqual(r.map((c) => core.isSelectable(c)), [true, false, true]);
});

test('Farbe mit verfuegbarer und gesperrter Variante gilt als verfuegbar', () => {
  const muster = musterProdukt([
    { id: 601, option1: 'Grau', available: false },
    { id: 611, option1: 'Grau', available: true },
  ]);
  const [grau] = core.assignSampleVariants(FARBEN.slice(0, 1), muster, 'Farbe');
  assert.equal(grau.sampleVariantId, 611);
  assert.equal(grau.sampleUnavailable, false);
});

test('ohne Musterprodukt oder mit fremder Option: nichts gesperrt, Rueckfall wie bisher', () => {
  for (const muster of [null, { options: [{ name: 'Dekor', position: 1 }], variants: [{ id: 601, option1: 'Grau', available: false }] }]) {
    const r = core.assignSampleVariants(FARBEN, muster, 'Farbe');
    assert.deepEqual(r.map((c) => c.sampleVariantId), [null, null, null]);
    assert.deepEqual(r.map((c) => c.sampleUnavailable), [false, false, false]);
  }
});

test('Basis-Muster (Teppich nach Mass): gesperrte Variante dort sperrt die Farbe ebenso', () => {
  const basis = musterProdukt([{ id: 501, option1: 'Grau', available: false }]);
  const r = core.assignSampleVariantsWithBasis(FARBEN, null, basis, 'Farbe');
  assert.deepEqual(r.map((c) => c.sampleUnavailable), [true, false, false]);
});

test('Warenkorb: Variante fehlt -> Rueckfall, Variante gesperrt -> keine Zeile', () => {
  const muster = musterProdukt([
    { id: 601, option1: 'Grau', available: true },
    { id: 602, option1: 'Beige', available: false },
  ]);
  const colors = core.assignSampleVariants(FARBEN, muster, 'Farbe');
  const items = core.buildCartItems({ product: PRODUKT, colors, optionName: 'Farbe', sampleVariantId: 900, origin: 'https://shop.example' });
  assert.deepEqual(items.map((z) => z.id), [601, 900], 'Beige fehlt, Rot geht aufs Sammelprodukt');
  assert.deepEqual(items.map((z) => z.properties._Muster_ID), ['piumera--grau', 'piumera--rot']);
  assert.equal(items[1].properties.Farbe, 'Rot');
});

test('alle gesperrt: allSamplesUnavailable, sonst nicht', () => {
  const alle = core.assignSampleVariants(FARBEN, musterProdukt([
    { id: 601, option1: 'Grau', available: false },
    { id: 602, option1: 'Beige', available: false },
    { id: 603, option1: 'Rot', available: false },
  ]), 'Farbe');
  assert.equal(core.allSamplesUnavailable(alle), true);
  assert.deepEqual(core.buildCartItems({ product: PRODUKT, colors: alle, optionName: 'Farbe', sampleVariantId: 900, origin: '' }), []);
  const eine = core.assignSampleVariants(FARBEN, musterProdukt([{ id: 601, option1: 'Grau', available: false }]), 'Farbe');
  assert.equal(core.allSamplesUnavailable(eine), false, 'Beige und Rot fehlen nur - Rueckfall');
  assert.equal(core.allSamplesUnavailable([]), false);
});

// --- Ablauf in assets/tp-sample-checkout.js ---

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

const QUELLE = {
  handle: 'piumera', id: 7, title: 'Piumera Teppichboden', type: 'Teppichboden', tags: [], featured_image: '',
  options: [{ name: 'Farbe', position: 1 }],
  variants: [
    { id: 101, option1: 'Grau', title: 'Grau', available: true },
    { id: 102, option1: 'Beige', title: 'Beige', available: true },
    { id: 103, option1: 'Rot', title: 'Rot', available: true },
  ],
};

async function konfigurator({ muster, farbe = '', waehlen = [] }) {
  const requests = [];
  const antworten = {
    '/products/piumera.js': QUELLE,
    '/products/kostenloses-muster.js': { variants: [{ id: 900, available: true }] },
    '/cart.js': { items: [] },
    '/products/muster-piumera.js': muster,
  };
  async function fetch(url, options = {}) {
    requests.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (url.includes('section_id=')) return { ok: false, text: async () => '' };
    if (url === '/cart/add.js') return { ok: true, json: async () => ({}) };
    const daten = antworten[url];
    return { ok: Boolean(daten), json: async () => daten, text: async () => '' };
  }

  const benannt = new Map();
  const rootEl = new El('section');
  rootEl.querySelector = (sel) => {
    if (!benannt.has(sel)) benannt.set(sel, new El());
    return benannt.get(sel);
  };
  rootEl.querySelectorAll = () => [];
  // Wie im HTML der Section: Hinweis und Fieldset starten versteckt.
  rootEl.querySelector('[data-sample-none]').hidden = true;
  rootEl.querySelector('[data-sample-fieldset]').hidden = true;
  rootEl.querySelector('[data-sample-error]').hidden = true;
  const window = {
    location: { search: '?produkt=piumera' + (farbe ? '&farbe=' + farbe : ''), origin: 'https://shop.example', href: '' },
    localStorage: { getItem: () => null, setItem() {} },
  };
  const document = {
    querySelector: (sel) => (sel === '[data-tp-sample-checkout]' ? rootEl : null),
    createElement: (tag) => new El(tag),
  };
  const context = vm.createContext({ window, document, fetch, URLSearchParams, Set, Promise });
  vm.runInContext(coreSource, context, { filename: 'tp-sample-checkout-core.js' });
  vm.runInContext(checkoutSource, context, { filename: 'tp-sample-checkout.js' });
  const ticks = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r)); };
  await ticks();

  const grid = rootEl.querySelector('[data-sample-grid]');
  const karten = grid.querySelectorAll('[data-sample-color]');
  const karte = (wert) => karten.find((c) => c.getAttribute('data-sample-color') === wert);
  for (const wert of waehlen) karte(wert)?.querySelector('input[type="checkbox"]').click();
  const zaehler = rootEl.querySelector('[data-sample-count]').textContent;
  const submit = rootEl.querySelector('[data-sample-submit]');
  if (!submit.disabled) submit.dispatch('click');
  await ticks();
  const add = requests.find((r) => r.url === '/cart/add.js');
  const fehler = rootEl.querySelector('[data-sample-error]');
  return {
    karten, karte, zaehler,
    hinweis: rootEl.querySelector('[data-sample-none]'),
    fieldset: rootEl.querySelector('[data-sample-fieldset]'),
    submit,
    fehler: fehler.hidden ? null : fehler.textContent,
    zeilen: add ? add.body.items : null,
  };
}

const text = (el) => [el.textContent, ...el.children.map(text)].join(' ');

test('Ablauf: gesperrte Farbe sichtbar, deaktiviert, mit Hinweis - nie im Warenkorb', async () => {
  const r = await konfigurator({
    muster: musterProdukt([
      { id: 601, option1: 'Grau', available: true },
      { id: 602, option1: 'Beige', available: false },
    ]),
    farbe: 'Beige',
    waehlen: ['Beige', 'Grau', 'Rot'],
  });
  assert.equal(r.fehler, null);
  assert.equal(r.karten.length, 3, 'gesperrte Farbe bleibt sichtbar');
  const beige = r.karte('Beige');
  assert.equal(beige.getAttribute('aria-disabled'), 'true');
  assert.notEqual(beige.getAttribute('data-sample-unavailable'), null);
  assert.equal(beige.querySelector('input[type="checkbox"]').disabled, true);
  assert.match(text(beige), /Kein Muster verfügbar/);
  assert.doesNotMatch(text(r.karte('Rot')), /Kein Muster verfügbar/, 'fehlende Variante ist nicht gesperrt');
  assert.equal(r.karte('Grau').getAttribute('aria-disabled'), null);
  assert.equal(r.hinweis.hidden, true);
  assert.deepEqual(r.zeilen.map((z) => z.id), [601, 900], 'Grau eigene Variante, Rot Rueckfall, Beige nie');
  assert.ok(!r.zeilen.some((z) => z.properties._Muster_ID === 'piumera--beige'));
});

test('Ablauf: gesperrte Farbe zaehlt nicht zur Auswahlgrenze', async () => {
  const r = await konfigurator({
    muster: musterProdukt([{ id: 602, option1: 'Beige', available: false }]),
    waehlen: ['Beige', 'Grau', 'Rot'],
  });
  assert.equal(r.zeilen.length, 2);
  assert.equal(r.zaehler, '2 von 3 Mustern insgesamt ausgewählt · noch 1 weiteres möglich');
  assert.equal(r.karte('Beige').querySelector('input[type="checkbox"]').disabled, true);
});

test('Ablauf: alle Farben gesperrt - Hinweis statt Karten, kein Bestellknopf', async () => {
  const r = await konfigurator({
    muster: musterProdukt([
      { id: 601, option1: 'Grau', available: false },
      { id: 602, option1: 'Beige', available: false },
      { id: 603, option1: 'Rot', available: false },
    ]),
    farbe: 'Grau',
  });
  assert.equal(r.fehler, null);
  assert.equal(r.hinweis.hidden, false);
  assert.equal(r.fieldset.hidden, true, 'keine Karten');
  assert.equal(r.karten.length, 0);
  assert.equal(r.submit.hidden, true);
  assert.equal(r.zeilen, null, 'nichts in den Warenkorb');
});

test('Section: Hinweistext fuer alle gesperrten Farben steht im HTML', () => {
  const section = read('sections/tp-sample-checkout.liquid');
  assert.match(section, /data-sample-none[^>]*hidden>Für dieses Produkt sind derzeit keine Muster verfügbar\.</);
});
