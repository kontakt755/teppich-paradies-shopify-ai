// Feste Bandfarbe (service.bandfarbe_fest): Bei Einfassband/Paspelband arbeitet der
// Hersteller das Band immer in derselben Farbe. Dann gibt es keine Bandauswahl, nur den
// Hinweis "Bandfarbe: <Wert>"; der Kauf haengt an keiner Bandwahl, die Property
// "Bandfarbe" ist der feste Wert. Ohne Feld bleibt alles wie bisher (Regression).
// Rendert den echten Liquid-Datenvertrag aus blocks/tp-einfass-konfigurator.liquid mit
// LiquidJS und fuehrt die echten Funktionen aus assets/tp-einfass-konfigurator.js in
// einem Node-VM-DOM-Adapter aus (gleicher Ansatz wie tp-einfass-kettelservice-validierung).
// Kein Netzwerk, kein Shopify-Zugriff, keine Produktdatenaenderung.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const jsFile = 'assets/tp-einfass-konfigurator.js';
const blockFile = 'blocks/tp-einfass-konfigurator.liquid';
const mathFile = 'assets/tp-masstepich-rechnung.js';
const js = read(jsFile);
const block = read(blockFile);

function slice(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Fehlende Quelltext-Anker: ${start} / ${end}`);
  return source.slice(a, b);
}
const stripDocs = (s) => s.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const engine = new Liquid({
  relativeReference: false,
  fs: {
    resolve: (_dir, file) => path.join(root, 'snippets', file + '.liquid'),
    exists: async (file) => existsSync(file), existsSync,
    readFile: async (file) => stripDocs(readFileSync(file, 'utf8')),
    readFileSync: (file) => stripDocs(readFileSync(file, 'utf8')),
    contains: () => true,
  },
});
engine.registerFilter('json', (value) => JSON.stringify(value ?? null));

const liquidKopf = slice(block, '{%- liquid', '\n  <div class="tp-ek');
const liquidContract = liquidKopf +
  slice(block, '    <script type="application/json" data-tp-ek-daten>', '\n    <script src=') +
  '\n{%- endif -%}';
// Der Bandschritt bzw. der Hinweis, so wie er im Konfigurator steht.
const bandMarkup = liquidKopf +
  slice(block, '      {%- if tp_ek_band_wahl -%}', '\n\n      {%- capture tp_ek_vorschau_inhalt') +
  '\n{%- endif -%}';

const val = (value) => ({ value });
const FEST = 'Ton in Ton (Herstellerempfehlung)';

function fixture(o = {}) {
  const variant = {
    id: 'band-material', price: o.price ?? 129, available: true,
    options: ['Grau'], featured_image: null,
    metafields: { service: { einfassen: val('Verfügbar') }, custom: { farbcode: val('205') } },
  };
  const service = {
    einfassung: val(o.art ?? 'Paspelband'), max_breite_cm: val(400), max_laenge_cm: val(600),
    mindestpreis: val(99), formen: val(['Rechteck']),
    einfass_basis: val({ variants: [400].map((width) => ({ metafields: { custom: { rollenbreite: val(width / 100) } } })) }),
  };
  if (o.fest !== undefined) service.bandfarbe_fest = val(o.fest);
  const product = {
    title: 'Synthetic Band fixture', variants: [variant], selected_or_first_available_variant: variant,
    options_with_values: [{ name: 'Farbe', position: 1 }],
    metafields: { custom: { preis_pro_001_qm: val(true) }, service },
  };
  return { product, block: { id: 'band_block', settings: {} } };
}
async function dataFor(o) {
  const text = await engine.parseAndRender(liquidContract, fixture(o));
  const match = text.match(/<script[^>]+>([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}
const markupFor = (o) => engine.parseAndRender(bandMarkup, fixture(o));

class Element {
  constructor(value = '') {
    this.value = value; this.textContent = ''; this.hidden = false; this.disabled = false;
    this.validity = { badInput: false }; this.attributes = new Map(); this.style = {};
    this.classList = { add() {}, remove() {} };
  }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) ?? null; }
  querySelectorAll() { return []; }
}

// Echte Funktionskoerper; Zeichnen und Nummerierung sind No-ops. Die Bandwahl des
// Kunden wird wie in audit/scripts/reproduce-einfass-pricing.mjs simuliert.
const runnerSource = slice(js, '(function () {', '  function svgEl(') +
  slice(js, '  function init(root) {', '    function form() {') +
  slice(js, '    function form() {', '    function nummerieren() {') +
  slice(js, '    function lesen(input) {', '\n    /*\n      Eine Kachel') +
  slice(js, '    function anfrageZeigen(f) {', '\n    raeumeAufbauen();') + `
    function zeichnen() {}
    function groessenAufbauen() {}
    function nummerieren() {}
    if (auditBandSelected) band = baender[0] || null;
    rechnen();
    return {
      calculate: rechnen, add: hinzufuegen,
      state: function () { return stand && JSON.parse(JSON.stringify(stand)); }
    };
  }
  globalThis.auditInit = init;
})();`;

async function runCase(o = {}) {
  const data = await dataFor(o);
  const nodes = new Map();
  const q = (s) => {
    if (!nodes.has(s)) nodes.set(s, new Element());
    return nodes.get(s);
  };
  q('[data-tp-ek-daten]').textContent = JSON.stringify(data);
  q('input[name^="tp-ek-form-"]:checked').value = data.formen[0];
  q('[data-breite]').value = String(o.width ?? 200);
  q('[data-laenge]').value = String(o.length ?? 300);
  const el = new Element(); el.id = 'band-root'; el.querySelector = q; el.querySelectorAll = () => [];
  const requests = [];
  const context = vm.createContext({
    URLSearchParams, auditBandSelected: o.bandSelected ?? false,
    window: { location: { search: '' }, TPZuschnitt: { abgleichen: async () => {} } },
    document: { querySelectorAll: () => [], querySelector: () => null, dispatchEvent() {} },
    CustomEvent: class { constructor(type) { this.type = type; } },
    setTimeout() {},
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({}) };
    },
  });
  vm.runInContext(read(mathFile), context, { filename: mathFile, timeout: 1000 });
  vm.runInContext(runnerSource, context, { filename: jsFile, timeout: 1000 });
  const controller = context.auditInit(el);
  const vorher = {
    ctaHidden: q('[data-cta]').hidden, ctaDisabled: q('[data-cta]').disabled, ctaText: q('[data-cta]').textContent,
    summe: q('[data-summe]').textContent,
  };
  controller?.add();
  await new Promise((resolve) => setImmediate(resolve));
  return { data, controller, requests, ...vorher };
}

// --- Regression: ohne Feld wie bisher ---

for (const art of ['Einfassband', 'Paspelband']) {
  const nr = art === 'Einfassband' ? '8489 Natur' : '5210 Natur';

  test(`Regression ${art} ohne Feld: Bandfarben im Datenvertrag, band_fest leer`, async () => {
    const data = await dataFor({ art });
    assert.equal(data.band_fest, '');
    assert.ok(data.baender.length > 0, 'Bandfarben fehlen');
    assert.ok(data.baender.some((b) => b.art === art.toLowerCase()));
  });

  test(`Regression ${art} ohne Feld: ohne Bandwahl kein Warenkorb, Knopf fordert die Wahl`, async () => {
    const r = await runCase({ art });
    assert.ok(r.controller, 'Konfigurator startet');
    assert.equal(r.ctaHidden, false);
    assert.equal(r.ctaDisabled, true);
    assert.equal(r.ctaText, 'Bitte Bandfarbe wählen');
    assert.equal(r.requests.length, 0);
  });

  test(`Regression ${art} ohne Feld: mit Bandwahl Property "Bandfarbe" = Nummer und Name`, async () => {
    const r = await runCase({ art, bandSelected: true });
    assert.equal(r.ctaDisabled, false);
    assert.equal(r.ctaText, 'In den Warenkorb');
    assert.equal(r.requests.length, 1);
    const p = r.requests[0].body.properties;
    assert.equal(p.Bandfarbe, nr);
    assert.match(p._Zuschnitt, new RegExp('Band ' + nr));
    assert.equal(r.requests[0].body.quantity, 600);
  });

  test(`Regression ${art} ohne Feld: Markup zeigt den Schritt Bandfarbe, keinen Hinweis`, async () => {
    const html = await markupFor({ art });
    assert.match(html, /data-schritt="band"/);
    assert.match(html, /data-baender/);
    assert.doesNotMatch(html, /data-band-fest/);
  });
}

test('Regression: leeres oder nur aus Leerzeichen bestehendes Feld zaehlt als fehlend', async () => {
  for (const fest of ['', '   ', null]) {
    const data = await dataFor({ art: 'Paspelband', fest });
    assert.equal(data.band_fest, '', JSON.stringify(fest));
    assert.ok(data.baender.length > 0, JSON.stringify(fest));
    const r = await runCase({ art: 'Paspelband', fest });
    assert.equal(r.requests.length, 0, 'ohne Bandwahl weiter gesperrt');
    assert.equal(r.ctaText, 'Bitte Bandfarbe wählen');
  }
});

// --- Feste Bandfarbe ---

for (const art of ['Einfassband', 'Paspelband']) {
  test(`${art} mit fester Bandfarbe: keine Bandfarben im Datenvertrag, fester Wert getrimmt`, async () => {
    const data = await dataFor({ art, fest: `  ${FEST}  ` });
    assert.equal(data.band_fest, FEST);
    assert.deepEqual(data.baender, [], 'tp-bandfarben wird gar nicht geladen');
  });

  test(`${art} mit fester Bandfarbe: kaufbar ohne Bandwahl, Property "Bandfarbe" = fester Wert`, async () => {
    const r = await runCase({ art, fest: FEST });
    assert.ok(r.controller, 'Konfigurator startet trotz leerer Bandliste');
    assert.equal(r.ctaHidden, false);
    assert.equal(r.ctaDisabled, false);
    assert.equal(r.ctaText, 'In den Warenkorb');
    assert.equal(r.summe, '774,00 €', '600 x 1,29 EUR - das Band kostet nichts extra');
    assert.equal(r.requests.length, 1);
    const body = r.requests[0].body;
    assert.equal(body.items, undefined, 'eine Zeile, wie bei der Bandwahl');
    assert.equal(body.quantity, 600);
    assert.equal(body.properties.Bandfarbe, FEST);
    assert.equal(body.properties.Einfassung, art);
    assert.match(body.properties._Zuschnitt, /Band Ton in Ton \(Herstellerempfehlung\)/);
  });

  test(`${art} mit fester Bandfarbe: Markup zeigt nur den Hinweis, keinen Bandschritt`, async () => {
    const html = await markupFor({ art, fest: FEST });
    assert.match(html, /data-band-fest>Bandfarbe: <span>Ton in Ton \(Herstellerempfehlung\)<\/span>/);
    assert.doesNotMatch(html, /data-schritt="band"/);
    assert.doesNotMatch(html, /data-baender/);
  });
}

test('feste Bandfarbe wird im Markup escaped', async () => {
  const html = await markupFor({ art: 'Paspelband', fest: 'Ton <b>in</b> Ton' });
  assert.match(html, /Ton &lt;b&gt;in&lt;\/b&gt; Ton/);
});

test('feste Bandfarbe gilt nur fuer Bandarten - Ketteln und Cover ignorieren das Feld', async () => {
  for (const art of ['Ketteln', 'Cover']) {
    const data = await dataFor({ art, fest: FEST });
    assert.equal(data.band_fest, '', art);
    assert.deepEqual(data.baender, [], art);
    const r = await runCase({ art, fest: FEST });
    assert.equal(r.requests.length, 1, art);
    const p = (r.requests[0].body.items ? r.requests[0].body.items[0] : r.requests[0].body).properties;
    assert.equal(p.Bandfarbe, undefined, art);
    assert.equal((await markupFor({ art, fest: FEST })).includes('data-band-fest'), false, art);
  }
});

// --- ab-Preis und Kategorie-Rechner setzen keine Bandauswahl voraus ---

const ohneDoc = (datei) => stripDocs(read(datei));
const abEngine = new Liquid({ templates: {
  'tp-teppich-qualitaet': ohneDoc('snippets/tp-teppich-qualitaet.liquid'),
  'tp-teppich-max-breite': ohneDoc('snippets/tp-teppich-max-breite.liquid'),
  'tp-aktion-aktiv': ohneDoc('snippets/tp-aktion-aktiv.liquid'),
  'tp-rabatt-sichtbar': ohneDoc('snippets/tp-rabatt-sichtbar.liquid'),
  'tp-ist-sonderposten': ohneDoc('snippets/tp-ist-sonderposten.liquid'),
} });
abEngine.registerFilter('divided_by', (a, b) => Math.floor(Number(a) / Number(b)));
abEngine.registerFilter('money', (c) => (Number(c) / 100).toFixed(2).replace('.', ',') + ' €');
abEngine.registerFilter('money_without_trailing_zeros', (c) =>
  ((Number(c) / 100).toFixed(2).replace('.', ',') + ' €').replace(',00 €', ' €'));
const abSource = ohneDoc('snippets/tp-teppich-ab-preis.liquid');

function abProdukt(art, fest) {
  const service = { einfassung: val(art), mindestpreis: val(99), max_breite_cm: val(400), max_laenge_cm: val(1000) };
  if (fest !== undefined) service.bandfarbe_fest = val(fest);
  return {
    price_min: 129,
    variants: [{ price: 129, available: true, metafields: { service: { einfassen: val('Verfügbar') } } }],
    metafields: { custom: { preis_pro_001_qm: val(true) }, service },
  };
}

test('ab-Preis: Bandarten rechnen mit und ohne feste Bandfarbe identisch (keine Bandauswahl noetig)', async () => {
  for (const art of ['Einfassband', 'Paspelband']) {
    const ohne = await abEngine.parseAndRender(abSource, { product: abProdukt(art), all_products: {}, variant: null });
    const mit = await abEngine.parseAndRender(abSource, { product: abProdukt(art, FEST), all_products: {}, variant: null });
    assert.equal(mit, ohne, art);
    // 80 x 150 cm = 120 Einheiten x 1,29 EUR = 154,80 EUR, ueber dem Mindestpreis.
    assert.match(mit, /data-tp-ab-cent="15480"/, art);
    assert.match(mit, /inkl\. Einfassung/, art);
  }
});

createRequire(import.meta.url)('../../' + mathFile);
const M = globalThis.TPMass;
const rechnerSrc = read('assets/tp-teppich-rechner.js');
const pStart = rechnerSrc.indexOf('  function preisFuer(');
const pEnde = rechnerSrc.indexOf('\n  }\n', pStart) + 4;
const preisFuer = vm.runInNewContext('(' + rechnerSrc.slice(pStart, pEnde).trim().replace(/^function preisFuer/, 'function') + ')');

test('Kategorie-Rechner: Bandarten bekommen einen Preis ohne jede Banddaten', () => {
  for (const art of ['einfassband', 'paspelband']) {
    const t = { art, max_l: 600, mindest: 9900, kg_qm: 0, max_kg: 0, farben: [{ id: 1, p: 129, alt: 0, w: 400 }] };
    const r = preisFuer(M, t, null, 200, 300, null);
    assert.equal(r.passt, true, art);
    assert.equal(r.summe, 600 * 129, art);
  }
});

test('ab-Preis, Rechner-Daten und Rechner kennen keine Bandauswahl', () => {
  for (const datei of ['snippets/tp-teppich-ab-preis.liquid', 'snippets/tp-teppich-rechner-daten.liquid', 'assets/tp-teppich-rechner.js']) {
    const text = read(datei);
    assert.doesNotMatch(text, /bandfarbe|baender|tp-bandfarben|band_fest/i, datei);
  }
});
