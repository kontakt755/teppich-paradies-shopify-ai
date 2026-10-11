// Musterbestellung fuer Teppiche nach Mass: Zwischenstufe zwischen dem eigenen
// Musterprodukt muster-<handle> und dem Sammelprodukt kostenloses-muster. Fehlt
// muster-<handle> ganz, gilt muster-<handle von service.einfass_basis> - aber nur
// fuer Farben, die es mit demselben Wert der Option "Farbe" fuehrt.
// Siehe domains/shopify/benachrichtigungen/musterartikel.md.
//
// Geprueft werden der Rechenkern (assets/tp-sample-checkout-core.js), die Section
// sections/tp-muster-basis.liquid (LiquidJS) und der echte Ablauf in
// assets/tp-sample-checkout.js mit nachgebildetem DOM und fetch. Kein Netzwerk.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const coreSource = read('assets/tp-sample-checkout-core.js');
const checkoutSource = read('assets/tp-sample-checkout.js');

const kern = { window: { location: { search: '' }, localStorage: { getItem: () => null, setItem() {} } } };
vm.runInNewContext(coreSource, kern);
const core = kern.window.TPSampleCheckoutCore;
const plain = (x) => JSON.parse(JSON.stringify(x));

// --- Rechenkern ---

test('Section-URL: Produktkontext ueber die Section Rendering API', () => {
  assert.equal(core.basisSectionUrl('velluna-teppich-nach-mass'), '/products/velluna-teppich-nach-mass?section_id=tp-muster-basis');
});

const sectionHtml = (inhalt) =>
  `<div id="shopify-section-tp-muster-basis" class="shopify-section">\n<script type="application/json" data-tp-muster-basis>${inhalt}</script>\n</div>`;

test('Basis-Handle: nur ein gueltiger Handle aus dem Script-Tag zaehlt', () => {
  assert.equal(core.parseBasisHandle(sectionHtml('"velluna-teppichboden"'), 'velluna-nach-mass'), 'velluna-teppichboden');
  assert.equal(core.parseBasisHandle(sectionHtml(' " velluna-teppichboden " '), 'x'), 'velluna-teppichboden', 'getrimmt');
  for (const inhalt of ['""', 'null', '42', '{"a":1}', 'kaputt', '"Velluna"', '"velluna teppich"', '"../cart"', '"a/b"']) {
    assert.equal(core.parseBasisHandle(sectionHtml(inhalt), 'x'), null, inhalt);
  }
  assert.equal(core.parseBasisHandle('', 'x'), null, 'leere Antwort');
  assert.equal(core.parseBasisHandle(null, 'x'), null, 'keine Antwort');
  assert.equal(core.parseBasisHandle('<p>Seite nicht gefunden</p>', 'x'), null, 'kein Tag');
  assert.equal(core.parseBasisHandle(sectionHtml('"velluna"'), 'velluna'), null, 'Verweis auf sich selbst');
});

const FARBEN = [
  { value: 'Grau', variantId: 101, image: '', exactImage: '' },
  { value: 'Beige', variantId: 102, image: '', exactImage: '' },
];
const musterProdukt = (variants, option = 'Farbe') => ({ options: [{ name: option, position: 1 }], variants });

test('eigenes Musterprodukt vorhanden: unveraendert je Farbe, Basis wird nicht beachtet', () => {
  const eigen = musterProdukt([{ id: 601, option1: 'Grau', available: true }]);
  const basis = musterProdukt([{ id: 501, option1: 'Grau', available: true }, { id: 502, option1: 'Beige', available: true }]);
  const mit = core.assignSampleVariantsWithBasis(FARBEN, eigen, basis, 'Farbe');
  assert.deepEqual(plain(mit), plain(core.assignSampleVariants(FARBEN, eigen, 'Farbe')), 'wie bisher');
  assert.deepEqual(mit.map((c) => c.sampleVariantId), [601, null], 'fehlende Farbe geht aufs Sammelprodukt, nicht auf die Basis');
});

test('eigenes Musterprodukt fehlt: Musterprodukt des Teppichbodens fuer passende Farben', () => {
  const basis = musterProdukt([
    { id: 501, option1: 'grau ', available: true },
    { id: 502, option1: 'Beige', available: false },
    { id: 503, option1: 'Rot', available: true },
  ]);
  const r = core.assignSampleVariantsWithBasis(FARBEN, null, basis, 'Farbe');
  assert.deepEqual(r.map((c) => c.sampleVariantId), [501, null], 'Gross-/Kleinschreibung egal, nicht lieferbar zaehlt nicht');
  assert.deepEqual(r.map((c) => c.value), ['Grau', 'Beige'], 'Farben bleiben die des Teppichs nach Mass');
});

test('Basis fuehrt eine andere Option (z. B. Dekor): keine Zuordnung', () => {
  const basis = musterProdukt([{ id: 501, option1: 'Grau', available: true }], 'Dekor');
  assert.deepEqual(core.assignSampleVariantsWithBasis(FARBEN, null, basis, 'Farbe').map((c) => c.sampleVariantId), [null, null]);
});

test('weder eigenes noch Basis-Muster: wie bisher alles aufs Sammelprodukt', () => {
  const r = core.assignSampleVariantsWithBasis(FARBEN, null, null, 'Farbe');
  assert.deepEqual(plain(r), plain(core.assignSampleVariants(FARBEN, null, 'Farbe')));
  assert.deepEqual(r.map((c) => c.sampleVariantId), [null, null]);
});

test('Warenkorbzeilen: Basis-Variante als eigene Zeile, Muster-Kennung bleibt die des Teppichs nach Mass', () => {
  const basis = musterProdukt([{ id: 501, option1: 'Grau', available: true }]);
  const colors = core.assignSampleVariantsWithBasis(FARBEN, null, basis, 'Farbe');
  const items = core.buildCartItems({
    product: { id: 7, handle: 'velluna-nach-mass', title: 'Velluna Teppich nach Maß' },
    colors, optionName: 'Farbe', sampleVariantId: 900, origin: 'https://shop.example',
  });
  assert.equal(items[0].id, 501);
  assert.equal(items[0].properties._Muster_ID, 'velluna-nach-mass--grau');
  assert.equal(items[0].properties._Quellprodukt, 'velluna-nach-mass');
  assert.equal(items[0].properties.Produkt, undefined, 'Titel und Farbe stehen in der Variante');
  assert.equal(items[1].id, 900, 'Rueckfall Sammelprodukt');
  assert.equal(items[1].properties.Produkt, 'Velluna Teppich nach Maß');
  assert.equal(items[1].properties.Farbe, 'Beige');
});

// --- Section sections/tp-muster-basis.liquid ---

const section = read('sections/tp-muster-basis.liquid')
  .replace(/{%-?\s*comment\s*-?%}[\s\S]*?{%-?\s*endcomment\s*-?%}/g, '')
  .replace(/{%-?\s*schema\s*-?%}[\s\S]*?{%-?\s*endschema\s*-?%}/g, '');
const engine = new Liquid();
engine.registerFilter('json', (value) => JSON.stringify(value ?? null));
const renderSection = (product) => engine.parseAndRender(section, { product });

test('Section: liefert den Handle von service.einfass_basis, der Parser liest ihn', async () => {
  const html = await renderSection({ handle: 'velluna-nach-mass', metafields: { service: { einfass_basis: { value: { handle: 'velluna-teppichboden' } } } } });
  assert.match(html, /<script type="application\/json" data-tp-muster-basis>"velluna-teppichboden"<\/script>/);
  // Shopify liefert die Section in ihrem Wrapper-div aus.
  const antwort = `<div id="shopify-section-tp-muster-basis" class="shopify-section">${html}</div>`;
  assert.equal(core.parseBasisHandle(antwort, 'velluna-nach-mass'), 'velluna-teppichboden');
});

test('Section: ohne Produkt, ohne Feld oder mit Verweis auf sich selbst leer', async () => {
  const faelle = [
    null,
    { handle: 'teppichboden', metafields: {} },
    { handle: 'teppichboden', metafields: { service: { einfass_basis: { value: null } } } },
    { handle: 'gleich', metafields: { service: { einfass_basis: { value: { handle: 'gleich' } } } } },
  ];
  for (const product of faelle) {
    const html = await renderSection(product);
    assert.match(html, /data-tp-muster-basis>""<\/script>/, JSON.stringify(product));
    assert.equal(core.parseBasisHandle(html, product?.handle), null);
  }
});

test('Section ist in keinem Template eingebunden und im Editor nicht waehlbar', () => {
  const schema = JSON.parse(read('sections/tp-muster-basis.liquid').match(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/)[1]);
  assert.equal(schema.presets, undefined);
  for (const dir of ['templates', 'sections']) {
    for (const datei of readdirSync(path.join(root, dir)).filter((n) => n.endsWith('.json'))) {
      assert.doesNotMatch(read(path.join(dir, datei)), /"type":\s*"tp-muster-basis"/, `${dir}/${datei}`);
    }
  }
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
  handle: 'velluna-nach-mass', id: 7, title: 'Velluna Teppich nach Maß', type: 'Teppich', tags: [], featured_image: '',
  options: [{ name: 'Farbe', position: 1 }],
  variants: [
    { id: 101, option1: 'Grau', title: 'Grau', available: true },
    { id: 102, option1: 'Beige', title: 'Beige', available: true },
  ],
};

async function musterKasse({ eigen = null, sectionOk = true, sectionInhalt = '"velluna-teppichboden"', basis = null }) {
  const requests = [];
  const antworten = {
    '/products/velluna-nach-mass.js': QUELLE,
    '/products/kostenloses-muster.js': { variants: [{ id: 900, available: true }] },
    '/cart.js': { items: [] },
    '/products/muster-velluna-nach-mass.js': eigen,
    '/products/muster-velluna-teppichboden.js': basis,
  };
  async function fetch(url, options = {}) {
    requests.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (url === '/products/velluna-nach-mass?section_id=tp-muster-basis') {
      return { ok: sectionOk, text: async () => sectionHtml(sectionInhalt), json: async () => { throw new Error('kein JSON'); } };
    }
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
  const window = {
    location: { search: '?produkt=velluna-nach-mass&farbe=Grau', origin: 'https://shop.example', href: '' },
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
  const fehler = rootEl.querySelector('[data-sample-error]');
  // Beige zusaetzlich waehlen (Grau ist ueber ?farbe= vorgewaehlt), dann abschicken.
  const beige = grid.querySelectorAll('[data-sample-color]').find((c) => c.getAttribute('data-sample-color') === 'Beige');
  beige?.querySelector('input[type="checkbox"]').click();
  rootEl.querySelector('[data-sample-submit]').dispatch('click');
  await ticks();
  const add = requests.find((r) => r.url === '/cart/add.js');
  return {
    requests: requests.map((r) => r.url),
    fehler: fehler.hidden ? null : fehler.textContent,
    zeilen: add ? add.body.items : null,
  };
}

const zeile = (zeilen, farbe) => zeilen.find((z) => z.properties._Muster_ID === 'velluna-nach-mass--' + farbe);

test('Ablauf: eigenes Musterprodukt vorhanden - keine Basis-Abfrage, Verhalten wie bisher', async () => {
  const r = await musterKasse({
    eigen: { options: [{ name: 'Farbe', position: 1 }], variants: [{ id: 601, option1: 'Grau', available: true }] },
    basis: { options: [{ name: 'Farbe', position: 1 }], variants: [{ id: 502, option1: 'Beige', available: true }] },
  });
  assert.equal(r.fehler, null);
  assert.ok(!r.requests.some((u) => u.includes('section_id')), 'keine Section-Abfrage');
  assert.ok(!r.requests.includes('/products/muster-velluna-teppichboden.js'));
  assert.equal(zeile(r.zeilen, 'grau').id, 601);
  assert.equal(zeile(r.zeilen, 'beige').id, 900, 'fehlende Farbe: Sammelprodukt wie bisher');
});

test('Ablauf: eigenes Musterprodukt fehlt - Teppichboden-Muster fuer Grau, Sammelprodukt fuer Beige', async () => {
  const r = await musterKasse({
    basis: { options: [{ name: 'Farbe', position: 1 }], variants: [{ id: 501, option1: 'Grau', available: true }] },
  });
  assert.equal(r.fehler, null);
  assert.ok(r.requests.includes('/products/velluna-nach-mass?section_id=tp-muster-basis'));
  assert.ok(r.requests.includes('/products/muster-velluna-teppichboden.js'));
  assert.equal(r.zeilen.length, 2);
  const grau = zeile(r.zeilen, 'grau');
  assert.equal(grau.id, 501);
  assert.equal(grau.properties._Quellprodukt, 'velluna-nach-mass');
  assert.equal(grau.properties.Produkt, undefined);
  const beige = zeile(r.zeilen, 'beige');
  assert.equal(beige.id, 900);
  assert.equal(beige.properties.Farbe, 'Beige');
});

test('Ablauf: Section nicht erreichbar, ohne Basis oder Basis ohne Musterprodukt - Sammelprodukt wie bisher', async () => {
  const faelle = [
    { sectionOk: false },
    { sectionInhalt: '""' },
    { sectionInhalt: 'kaputt' },
    { basis: null },
  ];
  for (const fall of faelle) {
    const r = await musterKasse(fall);
    assert.equal(r.fehler, null, JSON.stringify(fall));
    assert.deepEqual(r.zeilen.map((z) => z.id), [900, 900], JSON.stringify(fall));
    assert.equal(zeile(r.zeilen, 'grau').properties.Produkt, 'Velluna Teppich nach Maß');
  }
});
