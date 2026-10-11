// Wunschmass vom Hersteller (service.einfassung = Fertig): Pauschale je Teppich als
// zweite Warenkorbzeile, fail closed bei nicht kaufbarer Pauschale, Gewichts- und
// Seitengrenze fuer den Paketversand. Rendert den echten Liquid-Datenvertrag
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
    id: 'fertig-material', price: o.price ?? 99, available: true,
    options: ['Grau'], featured_image: null,
    metafields: { service: { einfassen: val('Verfügbar') }, custom: { farbcode: val('005') } },
  };
  const product = {
    title: 'Synthetic Wunschmass fixture', variants: [variant], selected_or_first_available_variant: variant,
    options_with_values: [{ name: 'Farbe', position: 1 }],
    metafields: {
      custom: { preis_pro_001_qm: val(true) },
      service: {
        einfassung: val('Fertig'), max_breite_cm: val(200), max_laenge_cm: val(600),
        formen: val(['Rechteck']), kg_pro_qm: val(o.kg ?? 4.4), max_gewicht_kg: val(30),
        ...(o.kanteInklusive === undefined ? {} : { kante_inklusive: val(o.kanteInklusive) }),
      },
    },
  };
  const pauschale = o.pauschale === 'missing' ? null : {
    selected_or_first_available_variant: {
      id: 'fertig-pauschale', price: o.pauschalePreis ?? 1499, available: o.pauschale !== 'unavailable',
    },
  };
  return { product, block: { id: 'fertig_block', settings: { pauschale_produkt: pauschale } } };
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
    ctaHidden: q('[data-cta]').hidden,
    ctaDisabled: q('[data-cta]').disabled,
    error: q('[data-fehler]').hidden ? null : q('[data-fehler]').textContent,
  };
}


test('Fertig: Teppich und Pauschale als zwei Zeilen mit derselben Gruppe', async () => {
  const r = await runCase({ width: 150, length: 200 });
  assert.equal(r.error, null);
  assert.equal(r.data.art, 'fertig');
  assert.equal(r.data.max_breite_cm, 200, 'ohne einfass_basis gilt service.max_breite_cm');
  assert.equal(r.requests.length, 1);
  const [teppich, pauschale] = r.requests[0].body.items;
  assert.equal(teppich.id, 'fertig-material');
  assert.equal(teppich.quantity, 300, '1,5 x 2 m = 300 Einheiten a 0,01 m2');
  assert.equal(teppich.properties['Einfassung'], 'Fertig eingefasst');
  assert.equal(teppich.properties['Garn'], undefined);
  assert.equal(pauschale.id, 'fertig-pauschale');
  assert.equal(pauschale.quantity, 1);
  assert.equal(pauschale.properties._Gruppe, teppich.properties._Gruppe);
});

test('Fertig: nicht kaufbare Pauschale sperrt den Kauf', async () => {
  const r = await runCase({ pauschale: 'unavailable', width: 150, length: 200 });
  assert.equal(r.data.pauschale, null);
  assert.equal(r.data.pauschale_failed, true);
  assert.equal(r.requests.length, 0);
  assert.equal(r.ctaHidden, true);
  assert.match(r.error, /nicht bestellbar/);
});

test('Fertig: ohne konfigurierte Pauschale nur die Teppichzeile', async () => {
  const r = await runCase({ pauschale: 'missing', width: 150, length: 200 });
  assert.equal(r.data.pauschale_failed, false);
  assert.equal(r.requests.length, 1);
  assert.equal(r.requests[0].body.items, undefined);
});

test('Fertig: mehr als 30 kg wird abgelehnt (4,4 kg/m2, 200 x 400 cm = 35,2 kg)', async () => {
  const r = await runCase({ width: 200, length: 400 });
  assert.equal(r.requests.length, 0);
  assert.equal(r.ctaHidden, true);
  assert.match(r.error, /30 kg/);
});

test('Fertig: 200 x 340 cm bei 4,4 kg/m2 (29,92 kg) ist erlaubt', async () => {
  const r = await runCase({ width: 200, length: 340 });
  assert.equal(r.error, null);
  assert.equal(r.requests.length, 1);
});

test('Fertig: kuerzere Seite ueber 200 cm wird abgelehnt', async () => {
  const r = await runCase({ width: 210, length: 220, kg: 1 });
  assert.equal(r.requests.length, 0);
  assert.match(r.error, /höchstens 200 cm/);
});

test('Fertig: service.kante_inklusive hat keine Wirkung (nur fuer Ketteln)', async () => {
  const r = await runCase({ width: 150, length: 200, kanteInklusive: true });
  assert.equal(r.data.kante_inklusive, false);
  assert.equal(r.data.kettel, null);
  const [teppich, pauschale] = r.requests[0].body.items;
  assert.equal(teppich.properties['Kettelung'], undefined);
  assert.equal(pauschale.id, 'fertig-pauschale');
});
