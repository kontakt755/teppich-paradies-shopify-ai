// Mindestbestelllaenge (custom.mindestlaenge_lfm): echte Liquid-Auswertung
// im Rollen-Rechner und in der Warenkorb-Gegenprobe.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Liquid } from 'liquidjs';

const engine = new Liquid();
engine.registerFilter('divided_by', (a, b) => Number.isInteger(b) ? Math.floor(a / b) : a / b);

const rechner = readFileSync(new URL('../../blocks/tp-rollware-rechner.liquid', import.meta.url), 'utf8');
const start = rechner.indexOf('{%- liquid\n  # Mindestbestelllaenge');
const end = rechner.indexOf('-%}', start) + 3;
assert.ok(start >= 0 && end > start);

async function minRechner(value) {
  const product = { metafields: { custom: { mindestlaenge_lfm: value === undefined ? {} : { value } } } };
  const out = await engine.parseAndRender(rechner.slice(start, end) + '{{ tp_rc_min_laenge_cm }}|{{ tp_rc_min_laenge_m }}', { product });
  return out.trim();
}

test('Rechner: Mindestlaenge in cm und lesbar in m', async () => {
  assert.equal(await minRechner(8), '800|8');
  assert.equal(await minRechner(5.5), '550|5,5');
  assert.equal(await minRechner(5.05), '505|5,05');
  // Ohne Metafeld oder unter 1 m gilt die bisherige Mindestlaenge 100 cm.
  assert.equal(await minRechner(undefined), '0|0');
  assert.equal(await minRechner(0.5), '0|0');
});

const snippet = readFileSync(new URL('../../snippets/tp-cart-mindestlaenge.liquid', import.meta.url), 'utf8');

async function cartZeile({ min = 8, qty, exact = true, rolle = 2, ihreBreite } = {}) {
  const line_item = {
    quantity: qty, url: '/products/x',
    properties: ihreBreite ? { 'Ihre Breite': ihreBreite } : {},
    variant: { metafields: { custom: { rollenbreite: { value: rolle } } } },
    product: { metafields: { custom: { mindestlaenge_lfm: { value: min }, preis_pro_001_qm: { value: exact } } } }
  };
  const out = await engine.parseAndRender(snippet.replace(/\{%-? doc -?%\}[\s\S]*?\{%-? enddoc -?%\}/, '').replace(/\{%-? stylesheet[\s\S]*endstylesheet -?%\}/, ''), { line_item });
  return out.includes('tp-cart-mindestlaenge');
}

test('Warenkorb: Hinweis nur unter der Mindestlaenge', async () => {
  // 200 cm x 800 cm = 16 m2 = 1600 Hundertstel
  assert.equal(await cartZeile({ qty: 1600 }), false);
  assert.equal(await cartZeile({ qty: 1000 }), true);
  // Volle m2: 16 m2 auf 2 m Rolle = 8 m
  assert.equal(await cartZeile({ qty: 16, exact: false }), false);
  assert.equal(await cartZeile({ qty: 10, exact: false }), true);
  // Raummass 150 cm breit x 8 m = 12 m2
  assert.equal(await cartZeile({ qty: 1200, ihreBreite: '150 cm' }), false);
  assert.equal(await cartZeile({ qty: 1199, ihreBreite: '150 cm' }), true);
  // Ohne Mindestlaenge nie
  assert.equal(await cartZeile({ qty: 1, min: 0 }), false);
});

test('Rechner: Mindestlaenge ueber der Maximallaenge (Restbestand) gilt nicht', async () => {
  const maxStart = rechner.indexOf('{%- liquid\n  assign tp_rc_max_laenge_cm');
  const maxEnd = rechner.indexOf('-%}', maxStart) + 3;
  const render = (min, maxCm) => engine.parseAndRender(
    rechner.slice(start, end) + rechner.slice(maxStart, maxEnd) + '{{ tp_rc_min_laenge_cm }}',
    { product: { metafields: { custom: { mindestlaenge_lfm: { value: min }, max_roll_laenge_cm: { value: maxCm } } } } });
  assert.equal((await render(8, 600)).trim(), '0');
  assert.equal((await render(8, 2000)).trim(), '800');
});

// Klick-Pfad mit den echten Funktionen aus dem Block (vm, wie
// tp-rollware-fussleiste-validierung): 5 m Eingabe -> 8 m im Request.
import vm from 'node:vm';
import { createRequire } from 'node:module';
createRequire(import.meta.url)('../../assets/tp-rollware-art.js');

function slice(a, b) {
  const s = rechner.indexOf(a);
  const e = rechner.indexOf(b, s);
  assert.ok(s >= 0 && e > s, 'Funktionsgrenzen nicht gefunden: ' + a);
  return rechner.slice(s, e);
}

async function klick(eingabe, minCm) {
  const requests = [];
  const listeners = {};
  const cta = { addEventListener: (t, f) => { listeners[t] = f; }, setAttribute() {}, removeAttribute() {}, classList: { add() {}, remove() {}, toggle() {} } };
  const context = vm.createContext({
    ART: globalThis.TPRollwareArt, einheitAktiv: 'cm', MIN_BESTELL_CM: minCm, MAX_LENGTH_CM: 5000,
    lengthInput: { value: eingabe }, wunschInput: null, widthSeg: {},
    fmt: (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    selectedWidth: () => 200, artMode: () => 'meter', cmExact: false, bahnenAktiv: () => null,
    target: { id: 1, price: 3249, available: true }, data: {}, farbBreiten: [200],
    updateExtras: () => ({ items: [], rows: [], sum: 0 }),
    inFlight: false, cta, ctaHint: { hidden: true }, cartLink: { hidden: true, setAttribute() {} }, errMin: { hidden: true }, errMax: null,
    clearInvalid() {}, markInvalid() {}, zeigeFehlerfeld() {}, calculate() {}, setTimeout() {},
    document: { dispatchEvent() {}, querySelector: () => null }, CustomEvent: class {},
    fetch: async (url, options) => { requests.push(JSON.parse(options.body)); return { ok: true, json: async () => ({}) }; },
  });
  vm.runInContext(slice('  function getEffectiveLengthCm() {', '\n  var SVG_NS'), context);
  vm.runInContext(slice('  function fehlendesFeld() {', '\n  var target ='), context);
  vm.runInContext(slice("  cta.addEventListener('click', function () {", '\n\n  // Eine direkt geoeffnete Varianten-URL'), context);
  listeners.click();
  await new Promise((r) => setImmediate(r));
  return requests[0];
}

test('Klick: kuerzere Laenge geht angehoben und mit Vermerk in den Warenkorb', async () => {
  const r = await klick('500', 800);
  assert.equal(r.quantity, 16); // 200 cm x 800 cm = 16 m2
  assert.equal(r.properties['Gewünschte Länge'], '800 cm');
  assert.equal(r.properties['Mindestbestellmenge'], '8 m (eingegeben 5 m)');
});

test('Klick: Laenge ab Mindestlaenge und Produkte ohne Mindestlaenge unveraendert', async () => {
  const lang = await klick('950', 800);
  assert.equal(lang.quantity, 19);
  assert.equal(lang.properties['Mindestbestellmenge'], undefined);
  const ohne = await klick('500', 0);
  assert.equal(ohne.quantity, 10);
  assert.equal(ohne.properties['Gewünschte Länge'], '500 cm');
  assert.equal(ohne.properties['Mindestbestellmenge'], undefined);
});
