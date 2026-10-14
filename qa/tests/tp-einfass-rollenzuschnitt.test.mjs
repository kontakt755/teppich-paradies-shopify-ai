// Gemeinsamer Rollenbestand (Inhaber 2026-10-10/14): Teppich nach Mass mit
// custom.zuschnitt_von_rolle legt je Teppich eine Variante des Bundles
// "Zuschnitt von der Rolle" in denselben Warenkorbaufruf. Seit 14.10. kostet sie
// 0,57 EUR = eine Einheit des Teppichs; der Teppich geht dann mit einer Einheit
// weniger in den Warenkorb, der Endpreis bleibt centgenau gleich. Gleicher
// Aufbau wie tp-einfass-fertig-pauschale.test.mjs (echter Liquid-Datenvertrag,
// echte Funktionen im Node-VM). Kein Netzwerk, kein Shopify-Zugriff.
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
    id: 'yasmin-mass', price: o.price ?? 57, available: true,
    options: ['Anthrazit'], featured_image: null,
    metafields: { service: { einfassen: val('Verfügbar') }, custom: { farbcode: val('0') } },
  };
  const cms = o.cms ?? [50, 100, 150, 200, 225, 250, 300];
  const zsPreis = o.zsPreis ?? 0;
  const bundle = {
    variants: cms.map((cm, i) => ({
      id: 'zs-' + cm, option1: cm + ' cm',
      price: Array.isArray(zsPreis) ? zsPreis[i % zsPreis.length] : zsPreis, available: true,
    })),
  };
  const rolle = { metafields: { custom: { rollenbreite: val(4.0) } } };
  const product = {
    title: 'Yasmin fixture', variants: [variant], selected_or_first_available_variant: variant,
    options_with_values: [{ name: 'Farbe', position: 1 }],
    metafields: {
      custom: { preis_pro_001_qm: val(true), zuschnitt_von_rolle: val(bundle) },
      service: {
        einfassung: val(o.art ?? 'Fertig'), max_breite_cm: val(400), max_laenge_cm: val(1000),
        ...(o.mindest ? { mindestpreis: val(o.mindest) } : {}),
        formen: val(['Rechteck']), einfass_basis: val({ variants: [rolle] }),
      },
    },
  };
  const kettel = o.art === 'Ketteln'
    ? { selected_or_first_available_variant: { id: 'kettel', price: 19, available: true } } : null;
  return { product, block: { id: 'zs_block', settings: { pauschale_produkt: null, kettelservice_produkt: kettel } } };
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


const zeilen = (r) => {
  const b = r.requests[0].body;
  return b.items ? b.items : [b];
};
const summe = (items, preise) => items.reduce((s, it) => s + it.quantity * preise[it.id], 0);

test('Rollenzuschnitt 0 EUR: Teppich mit voller Menge plus Zuschnittzeile', async () => {
  const r = await runCase({ width: 200, length: 300, zsPreis: 0 });
  assert.equal(r.error, null);
  const items = zeilen(r);
  const teppich = items.find(i => i.id === 'yasmin-mass');
  const zs = items.find(i => String(i.id).startsWith('zs-'));
  assert.equal(teppich.quantity, 600);
  assert.equal(teppich.properties['_Einheit im Zuschnitt'], undefined);
  assert.equal(zs.id, 'zs-200');
  assert.equal(teppich.properties._Rollenzuschnitt, '200');
});

test('Rollenzuschnitt 0,57 EUR: Teppich eine Einheit weniger, Endpreis centgenau gleich', async () => {
  for (const [w, l, cm] of [[200, 300, 200], [201, 301, 225], [100, 100, 100], [250, 300, 250]]) {
    const r = await runCase({ width: w, length: l, zsPreis: 57 });
    assert.equal(r.error, null, `${w} x ${l}`);
    const items = zeilen(r);
    const teppich = items.find(i => i.id === 'yasmin-mass');
    const zs = items.find(i => String(i.id).startsWith('zs-'));
    const voll = Math.ceil((w * l) / 100);
    assert.equal(teppich.quantity, voll - 1, `${w} x ${l}: eine Einheit im Zuschnitt`);
    assert.equal(teppich.properties['_Einheit im Zuschnitt'], '1');
    assert.equal(zs.id, 'zs-' + cm);
    assert.equal(zs.quantity, 1);
    assert.equal(summe(items, { 'yasmin-mass': 57, [zs.id]: 57 }), voll * 57, 'Summe wie ohne Zuschnittpreis');
    assert.match(teppich.properties['Fläche (abgerechnet)'], /m²/);
  }
});

test('Rollenzuschnitt: Preis ungleich Teppich-Einheit sperrt den Kauf', async () => {
  const r = await runCase({ width: 200, length: 300, zsPreis: 99 });
  assert.equal(r.requests.length, 0);
  assert.equal(r.ctaHidden, true);
  assert.match(r.error, /nicht bestellbar/);
});

test('Rollenzuschnitt: uneinheitliche Bundle-Preise sperren den Kauf', async () => {
  const r = await runCase({ width: 200, length: 300, zsPreis: [0, 57] });
  assert.equal(r.data.zuschnitt.varianten.filter(Boolean).length, 7);
  assert.equal(r.requests.length, 0);
  assert.match(r.error, /nicht bestellbar/);
});

test('Rollenzuschnitt: Rolle zu kurz bleibt gesperrt (auch mit 0,57 EUR)', async () => {
  const r = await runCase({ width: 400, length: 400, zsPreis: 57 });
  assert.equal(r.requests.length, 0);
  assert.match(r.error, /reicht die Rolle nicht/);
});

test('Rollenzuschnitt 0,57 EUR mit Kettelservice (Yasmin-Fall): drei Zeilen, Summe gleich', async () => {
  const r = await runCase({ art: 'Ketteln', width: 200, length: 300, zsPreis: 57 });
  assert.equal(r.error, null);
  const items = zeilen(r);
  const teppich = items.find(i => i.id === 'yasmin-mass');
  const kante = items.find(i => i.id === 'kettel');
  const zs = items.find(i => String(i.id).startsWith('zs-'));
  assert.equal(teppich.quantity, 599);
  assert.equal(kante.quantity, 1000, '10 m Kante in cm');
  assert.equal(zs.id, 'zs-200');
  assert.equal(new Set(items.map(i => i.properties._Gruppe)).size, 1, 'eine Gruppe');
  assert.equal(items[items.length - 1].id, 'yasmin-mass', 'Teppich zuletzt gesendet = oben im Warenkorb');
  assert.equal(summe(items, { 'yasmin-mass': 57, kettel: 19, 'zs-200': 57 }), 600 * 57 + 1000 * 19);
});

test('Rollenzuschnitt 0,57 EUR mit Mindestpreis: Mindestmenge minus eine Einheit, Summe gleich', async () => {
  // 50 x 50 cm = 25 Einheiten, Mindestpreis 99 EUR -> 174 Einheiten a 0,57 (99,18 EUR).
  const r = await runCase({ width: 50, length: 50, zsPreis: 57, mindest: 99, cms: [50, 100] });
  assert.equal(r.error, null);
  const items = zeilen(r);
  const teppich = items.find(i => i.id === 'yasmin-mass');
  const zs = items.find(i => String(i.id).startsWith('zs-'));
  const voll = Math.ceil(9900 / 57);
  assert.equal(teppich.quantity, voll - 1);
  assert.equal(summe(items, { 'yasmin-mass': 57, [zs.id]: 57 }), voll * 57);
  assert.match(teppich.properties['Fläche (abgerechnet)'], /Mindestpreis/);
});
