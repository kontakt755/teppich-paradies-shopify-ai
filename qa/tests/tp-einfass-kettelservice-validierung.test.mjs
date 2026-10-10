// TP-005: ein konfigurierter, aber gerade nicht verfügbarer/bepreister
// Kettelservice darf den Teppich nicht stillschweigend ohne die gewählte
// Kettelung als kaufbereit anbieten. Rendert den echten Liquid-Datenvertrag
// aus blocks/tp-einfass-konfigurator.liquid mit LiquidJS und führt die echten
// Funktionen aus assets/tp-einfass-konfigurator.js in einem Node-VM-DOM-Adapter
// aus (gleicher Ansatz wie audit/scripts/reproduce-einfass-pricing.mjs).
// Kein Netzwerk, kein Shopify-Zugriff, keine Produktdatenänderung.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

const liquidContract = slice(block, '{%- liquid', '\n  <div class="tp-ek') +
  slice(block, '    <script type="application/json" data-tp-ek-daten>', '\n    <script src=') +
  '\n{%- endif -%}';

const val = (value) => ({ value });
function fixture(o = {}) {
  const variant = {
    id: 'audit-einfass-material', price: o.price ?? 89, available: o.available ?? true,
    options: ['Auditfarbe'], featured_image: null,
    metafields: { service: { einfassen: val('Verfügbar') }, custom: { farbcode: val('TEST') } },
  };
  const product = {
    title: 'Synthetic Einfass fixture', variants: [variant], selected_or_first_available_variant: variant,
    options_with_values: [{ name: 'Farbe', position: 1 }],
    metafields: {
      custom: { preis_pro_001_qm: val(true) },
      service: {
        einfassung: val('Ketteln'), max_breite_cm: val(400), max_laenge_cm: val(600),
        mindestpreis: val(99), formen: val(['Rechteck']),
        ...(o.kanteInklusive === undefined ? {} : { kante_inklusive: val(o.kanteInklusive) }),
        einfass_basis: val({ variants: [400, 500].map((width) => ({ metafields: { custom: { rollenbreite: val(width / 100) } } })) }),
      },
    },
  };
  const service = o.service === 'missing' ? null : {
    selected_or_first_available_variant: {
      id: 'audit-einfass-edge', price: o.edgePrice ?? 19, available: o.service !== 'unavailable',
    },
  };
  return { product, block: { id: 'audit_block', settings: { kettelservice_produkt: service } } };
}
async function dataFor(o) {
  const text = await engine.parseAndRender(liquidContract, fixture(o));
  const match = text.match(/<script[^>]+>([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}

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

const runnerSource = slice(js, '(function () {', '  function svgEl(') +
  slice(js, '  function init(root) {', '    function form() {') +
  slice(js, '    function form() {', '    function nummerieren() {') +
  slice(js, '    function lesen(input) {', '\n    /*\n      Eine Kachel') +
  slice(js, '    function anfrageZeigen(f) {', '\n    raeumeAufbauen();') + `
    function zeichnen() {}
    function groessenAufbauen() {}
    function nummerieren() {}
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
  const el = new Element(); el.id = 'audit-root'; el.querySelector = q; el.querySelectorAll = () => [];
  const requests = [], events = [];
  const context = vm.createContext({
    URLSearchParams, auditBandSelected: false,
    window: { location: { search: '' }, TPZuschnitt: { abgleichen: async () => {} } },
    document: { querySelectorAll: () => [], querySelector: () => null, dispatchEvent: (e) => events.push(e.type) },
    CustomEvent: class { constructor(type) { this.type = type; } },
    setTimeout() {},
    fetch: async (url, options) => {
      requests.push({ url, method: options.method, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ auditIntercepted: true }) };
    },
  });
  vm.runInContext(read(mathFile), context, { filename: mathFile, timeout: 1000 });
  vm.runInContext(runnerSource, context, { filename: jsFile, timeout: 1000 });
  const controller = context.auditInit(el);
  controller?.add();
  await new Promise((resolve) => setImmediate(resolve));
  return {
    data,
    requests,
    summe: q('[data-summe]').textContent,
    mindestHinweis: q('[data-mindest-hinweis]').hidden ? null : q('[data-mindest-hinweis]').textContent,
    ctaHidden: q('[data-cta]').hidden,
    ctaDisabled: q('[data-cta]').disabled,
    error: q('[data-fehler]').hidden ? null : q('[data-fehler]').textContent,
  };
}

test('Regression: verfügbarer Kettelservice bleibt kaufbar mit zwei Positionen', async () => {
  const result = await runCase();
  assert.equal(result.data.kettel_service_failed, false);
  assert.ok(result.data.kettel);
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].body.items.length, 2);
  assert.equal(result.ctaHidden, false);
  assert.equal(result.error, null);
});

test('Regression: kein konfigurierter Service bleibt ein legitimer Inklusivpreis (kein Fehler)', async () => {
  const result = await runCase({ service: 'missing' });
  assert.equal(result.data.kettel, null);
  assert.equal(result.data.kettel_service_failed, false, 'nicht konfiguriert ist kein Ausfall');
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].body.items, undefined, 'nur eine Materialzeile, wie vorgesehen');
  assert.equal(result.ctaHidden, false);
  assert.equal(result.error, null);
});

test('TP-005: konfigurierter, aber nicht verfügbarer Service blockiert den Kauf statt ihn stillschweigend zu reduzieren', async () => {
  const result = await runCase({ service: 'unavailable' });
  assert.equal(result.data.kettel, null);
  assert.equal(result.data.kettel_service_failed, true);
  assert.equal(result.requests.length, 0, 'kein Cart-Request bei ausgefallenem Pflichtservice');
  assert.equal(result.ctaHidden, true, 'kein kaufbereiter Button ohne den gewählten Service');
  assert.match(result.error, /Kettelung ist aktuell nicht verfügbar/);
});

test('TP-005: konfigurierter Service mit Preis 0 wird ebenfalls als Ausfall behandelt', async () => {
  const result = await runCase({ edgePrice: 0 });
  assert.equal(result.data.kettel, null);
  assert.equal(result.data.kettel_service_failed, true);
  assert.equal(result.requests.length, 0);
  assert.equal(result.ctaHidden, true);
});

// service.kante_inklusive: der m2-Preis enthaelt die Kettelung (Hersteller-UVP je m2).
// Dann keine Kettelzeile, keine Kantenkosten, kein TP-005-Abbruch; ohne Feld oder bei
// false bleibt alles wie oben.

test('Kante inklusive: nur die Teppichzeile, keine Kantenkosten, Properties bleiben vollständig', async () => {
  const result = await runCase({ kanteInklusive: true });
  assert.equal(result.data.kante_inklusive, true);
  assert.equal(result.data.kettel, null, 'Kettelservice wird gar nicht geladen');
  assert.equal(result.data.kettel_service_failed, false);
  assert.equal(result.error, null);
  assert.equal(result.requests.length, 1);
  const body = result.requests[0].body;
  assert.equal(body.items, undefined, 'keine zweite Zeile für die Kante');
  assert.equal(body.id, 'audit-einfass-material');
  assert.equal(body.quantity, 600, '2 x 3 m = 600 Einheiten a 0,01 m2');
  assert.equal(result.summe, '534,00 €', 'nur Fläche: 600 x 0,89 EUR');
  assert.equal(body.properties['Einfassung'], 'Gekettelt');
  assert.equal(body.properties['Kante umlaufend'], '10,00 m');
  assert.equal(body.properties['Garn'], 'Ton in Ton');
  assert.equal(body.properties['Kettelung'], 'im m²-Preis enthalten');
  assert.ok(body.properties._Gruppe);
  assert.ok(body.properties._Zuschnitt);
});

test('Kante inklusive: nicht verfügbarer Kettelservice sperrt den Kauf nicht (kein TP-005)', async () => {
  for (const o of [{ service: 'unavailable' }, { edgePrice: 0 }, { service: 'missing' }]) {
    const result = await runCase({ ...o, kanteInklusive: true });
    assert.equal(result.data.kettel_service_failed, false, JSON.stringify(o));
    assert.equal(result.ctaHidden, false, JSON.stringify(o));
    assert.equal(result.error, null, JSON.stringify(o));
    assert.equal(result.requests.length, 1, JSON.stringify(o));
    assert.equal(result.requests[0].body.items, undefined, JSON.stringify(o));
  }
});

test('Kante inklusive: Mindestpreis nur über die Fläche (50 x 50 cm, 99 EUR bei 0,89 EUR je 0,01 m2)', async () => {
  const result = await runCase({ kanteInklusive: true, width: 50, length: 50 });
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].body.quantity, 112, 'ceil(9900 / 89) - keine Kante zieht den Mindestpreis herunter');
  assert.equal(result.summe, '99,68 €');
  assert.match(result.mindestHinweis, /Mindestpreis 99,00 €/);
});

test('Regression: kante_inklusive = false rechnet die Kante wie bisher als zweite Zeile', async () => {
  const result = await runCase({ kanteInklusive: false });
  assert.equal(result.data.kante_inklusive, false);
  assert.ok(result.data.kettel);
  const [teppich, kante] = result.requests[0].body.items;
  assert.equal(teppich.quantity, 600);
  assert.equal(teppich.properties['Kettelung'], undefined);
  assert.equal(kante.id, 'audit-einfass-edge');
  assert.equal(kante.quantity, 1000);
  assert.equal(result.summe, '724,00 €', '600 x 0,89 + 1000 x 0,19 EUR');
});

test('Regression: kante_inklusive = false und Kettelservice nicht verfügbar sperrt weiter (TP-005)', async () => {
  const result = await runCase({ kanteInklusive: false, service: 'unavailable' });
  assert.equal(result.data.kettel_service_failed, true);
  assert.equal(result.requests.length, 0);
  assert.equal(result.ctaHidden, true);
});

test('Regression: ohne Feld Mindestpreis abzüglich Kante (50 x 50 cm)', async () => {
  const result = await runCase({ width: 50, length: 50 });
  const [teppich, kante] = result.requests[0].body.items;
  assert.equal(kante.quantity, 200);
  assert.equal(teppich.quantity, 69, 'ceil((9900 - 3800) / 89)');
});
