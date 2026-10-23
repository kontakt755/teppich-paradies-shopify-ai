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
    id: 'yasmin-mass', price: o.price ?? 57, available: o.available ?? true,
    options: ['Anthrazit'], featured_image: null,
    metafields: { service: o.freigegeben === false ? {} : { einfassen: val('Verfügbar') }, custom: { farbcode: val('0') } },
  };
  const cms = o.cms ?? [50, 100, 150, 200, 225, 250, 300];
  const zsPreis = o.zsPreis ?? 0;
  const bundle = {
    variants: o.bundleDraft ? [] : cms.map((cm, i) => ({
      id: 'zs-' + cm, option1: cm + ' cm',
      price: Array.isArray(zsPreis) ? zsPreis[i % zsPreis.length] : zsPreis, available: o.bundleAvailable ?? true,
    })),
  };
  const rolle = { available: o.basisAvailable ?? true, inventory_management: o.management ?? 'shopify', inventory_policy: o.policy ?? 'deny', inventory_quantity: o.stock ?? 48, metafields: { custom: { rollenbreite: val(o.rollWidth ?? 4.0) } } };
  const basis = { variants: o.zweiRollen ? [rolle, rolle] : [rolle], metafields: { custom: { max_roll_laenge_cm: val(o.basisMax ?? 2000) } } };
  const product = {
    title: 'Yasmin fixture', variants: [variant], selected_or_first_available_variant: variant,
    options_with_values: [{ name: 'Farbe', position: 1 }],
    metafields: {
      custom: { preis_pro_001_qm: val(true), ...(o.ohneBundle ? {} : { zuschnitt_von_rolle: val(bundle) }), ...(o.richtung === undefined ? {} : { rollenzuschnitt_richtung: val(o.richtung) }) },
      service: {
        einfassung: val(o.art ?? 'Fertig'), max_breite_cm: val(o.maxW ?? 400), max_laenge_cm: val(o.maxL ?? 1000),
        ...(o.mindest ? { mindestpreis: val(o.mindest) } : {}),
        formen: val(o.formen ?? ['Rechteck']), einfass_basis: val(o.sourceDraft ? null : basis),
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
  if (!data) return { data, requests: [], ctaHidden: true, ctaDisabled: true };
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

test('Begrenztes Raummaß: Rechteck ohne Kettelung, 2 x 3 m braucht 3 m volle Rolle', async () => {
  const r = await runCase({ art: 'Raummaß', richtung: 'laengs', zsPreis: 57, formen: ['Rechteck', 'Rund', 'Oval'] });
  assert.equal(r.error, null);
  assert.deepEqual(r.data.formen, ['rechteck']);
  const items = zeilen(r);
  assert.equal(items.length, 2);
  const main = items.find(it => it.id === 'yasmin-mass');
  assert.equal(main.quantity, 599);
  assert.equal(main.properties.Einfassung, 'ohne Einfassung');
  assert.equal(main.properties.Art, 'Raummaß');
  assert.equal(main.properties['Kante umlaufend'], undefined);
  assert.equal(main.properties._Rollenzuschnitt, '300');
  assert.equal(items.find(it => it.id === 'zs-300').quantity, 1);
  assert.equal(summe(items, { 'yasmin-mass': 57, 'zs-300': 57 }), 34200);
});

test('Gerichtete Kettelware: 3 m Materialverbrauch und vorhandener Kettelpreis bleiben getrennt', async () => {
  const r = await runCase({ art: 'Ketteln', richtung: 'laengs', zsPreis: 57 });
  assert.equal(r.error, null);
  const items = zeilen(r);
  assert.equal(items.length, 3);
  assert.equal(items.find(it => it.id === 'yasmin-mass').properties._Rollenzuschnitt, '300');
  assert.equal(items.find(it => it.id === 'kettel').quantity, 1000);
  assert.equal(summe(items, { 'yasmin-mass': 57, 'zs-300': 57, kettel: 19 }), 53200);
});

test('Neue Restangebote: unvollständige Grenzen, Richtung oder Quelle schalten keinen Kauf frei', async () => {
  const start = { art: 'Raummaß', richtung: 'laengs', zsPreis: 57 };
  for (const o of [{ maxW: 0 }, { maxL: 0 }, { basisMax: 0 }, { richtung: '' }, { richtung: 'frei' }, { ohneBundle: true }, { stock: 0 }, { policy: 'continue' }, { management: '' }, { zweiRollen: true }, { basisAvailable: false }, { rollWidth: 5 }, { sourceDraft: true }, { bundleDraft: true }, { freigegeben: false }]) {
    const r = await runCase({ ...start, ...o });
    assert.equal(r.data, null, JSON.stringify(o));
    assert.equal(r.requests.length, 0);
  }
});

test('Raummaß-Preishinweis verspricht keine umlaufende Einfassung', async () => {
  const source = block.match(/<p class="tp-ek__preishinweis">[\s\S]*?<\/p>/)[0];
  const html = await engine.parseAndRender(source, { tp_ek_art: 'raummass', settings: {} });
  assert.match(html, /ohne Einfassung/);
  assert.doesNotMatch(html, /Einfassung rundum|Kettelung rundum|Vom Hersteller/);
  assert.match(js, /if \(!beispiel && art !== 'raummass'\) lupe\(defs\)/);
});

test('Neue Restangebote: schmaler oder nicht verfügbarer Bundle-Abgang wird nicht ersatzweise gedreht', async () => {
  const start = { art: 'Raummaß', richtung: 'laengs', zsPreis: 57 };
  for (const o of [{ width: 500, length: 300 }, { width: 200, length: 301 }, { bundleAvailable: false }, { available: false }]) {
    const r = await runCase({ ...start, ...o });
    assert.equal(r.requests.length, 0);
    assert.equal(r.ctaDisabled, true);
  }
});

test('Gerichteter Zuschnitt: große Breite und kurze Länge werden nicht am alten Max-Langseitentest abgewiesen', async () => {
  const r = await runCase({ art: 'Raummaß', richtung: 'laengs', maxL: 150, width: 400, length: 100, zsPreis: 57 });
  assert.equal(r.error, null);
  assert.equal(zeilen(r).find(it => it.id === 'yasmin-mass').properties._Rollenzuschnitt, '100');
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
