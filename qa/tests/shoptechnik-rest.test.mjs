import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Liquid } from 'liquidjs';
import { collectSmallTouchTargets, duplicateExecutableScripts } from '../seo-dom-evidence.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const cart = read('snippets/cart-products.liquid');
const from = cart.indexOf('<div class="cart-items__variants-wrapper">');
const to = cart.indexOf('{%- capture tp_cp_einheit -%}', from);
const source = cart.slice(from, to);
const liquid = new Liquid({ root: `${root}/snippets`, extname: '.liquid' });
liquid.registerTag('doc', { parse(token, tokens) { while (tokens.length && tokens.shift().name !== 'enddoc') {} }, render() { return ''; } });
liquid.registerTag('stylesheet', { parse(token, tokens) { while (tokens.length && tokens.shift().name !== 'endstylesheet') {} }, render() { return ''; } });
liquid.registerFilter('divided_by', (a, b) => Number.isInteger(a) && Number.isInteger(b) ? Math.floor(a / b) : a / b);

async function render(properties, extra = {}) {
  const item = {
    product: { has_only_default_variant: false, metafields: { custom: {} }, tags: [], variants: [] },
    properties, options_with_values: [{ name: 'Farbe', value: 'Sand (043)' }],
    item_components: [], quantity: 1, selling_plan_allocation: null, line_level_discount_allocations: [],
    ...extra,
  };
  return liquid.parseAndRender(source, { item });
}

for (const [kind, properties] of [
  ['Meterware', { Farbe: 'Sand (043)', Breite: '400 cm', Länge: '250 cm', Fläche: '10 m²' }],
  ['Raummaß', { Raummaß: '250 × 350 cm', Rollenbreite: '400 cm', Bestellfläche: '14 m²', Zuschnitt: '1 × (400 × 350 cm)' }],
  ['Teppich nach Maß', { Form: 'Rechteck', Breite: '80 cm', Länge: '150 cm', Kantenfarbe: 'Passend zum Teppich' }],
  ['Mindestpreis', { Form: 'Rechteck', Breite: '50 cm', Länge: '50 cm', 'Mindestberechnung': '1 m²', _Kalkulationswert: 'geheim' }],
  ['Mehrfachstücke', { 'Breite je Stück': '400 cm', 'Länge je Stück': '95 cm', Anzahl: '10 Stück', Zuschnitt: '10 × (400 × 95 cm)' }],
]) {
  test(`Warenkorb-Kompaktierung bewahrt alle Angaben: ${kind}`, async () => {
    const html = await render(properties);
    for (const [name, value] of Object.entries(properties)) {
      if (name.startsWith('_')) assert.ok(!html.includes(value));
      else if (name === 'Farbe') assert.equal(html.split(value).length - 1, 1, 'Farbe weiterhin nur in Variantenzeile');
      else { assert.ok(html.includes(`${name}:`), name); assert.ok(html.includes(value), value); }
    }
    assert.match(html, /cart-items__properties/);
  });
}

test('Zubehör behält Leistenanzahl und Länge aus aktuellen Positionsdaten', async () => {
  const html = await render({ 'Zu Teppichboden': 'Wohnteppich', _Gruppe: 'gruppe-1', Farbcode: '043' }, {
    quantity: 8,
    product: { has_only_default_variant: false, metafields: { custom: { stangenlaenge: { value: 2.5 } } }, tags: [], variants: [] },
  });
  assert.match(html, /8 Leisten = 20&nbsp;m/);
  assert.match(html, /Farbcode:/);
  assert.doesNotMatch(html, /Zu Teppichboden:|gruppe-1/);
});

test('Paketware bleibt exakt aus Menge und dreistelliger Paketfläche gerechnet', async () => {
  const html = await render({ Hinweis: 'Originalpakete' }, { quantity: 16,
    product: { has_only_default_variant: false, metafields: { custom: { qm_pro_paket: { value: 1.892 } } }, tags: [], variants: [] },
  });
  assert.match(html, /30,272/);
  assert.match(html, /16 Originalpakete/);
});

test('Nur Warenkorb-Eigenschaften werden flexibel umbrochen, ohne Werte auszublenden', () => {
  assert.match(cart, /\.cart-items__properties\s*\{[^}]*display: flex;[^}]*flex-wrap: wrap;/);
  assert.match(cart, /\.cart-items__property\s*\{[^}]*max-width: 100%;/);
  assert.doesNotMatch(cart.match(/\.cart-items__properties\s*\{[^}]*\}/)[0], /display: none|overflow: hidden|max-height|line-clamp/);
});

test('Mehrfach verwendete Komponenten nutzen einmal auszuführende Module', () => {
  for (const [file, asset] of [['snippets/tp-produktberatung.liquid', 'tp-produktberatung.js'], ['snippets/tp-lieferzeit.liquid', 'tp-lieferdatum.js']]) {
    const tag = read(file).match(new RegExp(`<script[^>]+${asset.replaceAll('.', '\\.')}[^>]*>`))?.[0];
    assert.ok(tag, file);
    assert.match(tag, /type="module"/);
  }
  assert.doesNotMatch(read('layout/theme.liquid'), /tp-carpet-navigation\.js/);
  assert.match(read('sections/header-group.json'), /header/);
});

test('Prüfer unterscheidet Modulwiederholung und echte Mehrfachausführung', () => {
  const src = 'https://shop.example/assets/test.js';
  assert.deepEqual(duplicateExecutableScripts([{ src, type: 'module' }, { src, type: 'module' }], 'https://shop.example'), []);
  for (const types of [['', ''], ['', 'module'], ['text/javascript', 'application/javascript']]) {
    assert.deepEqual(duplicateExecutableScripts(types.map(type => ({ src, type })), 'https://shop.example'), [src]);
  }
  assert.deepEqual(duplicateExecutableScripts([{ src, type: 'application/json' }, { src, type: 'application/json' }], 'https://shop.example'), []);
});

function element({ width = 16, height = 16, left = 100, top = 100, label, pseudo, clip, checkbox = false } = {}) {
  const target = {
    tagName: checkbox ? 'INPUT' : 'BUTTON', labels: label ? [label] : [], parentElement: clip,
    getBoundingClientRect: () => ({ width, height, left, top }), getAttribute: () => '', textContent: 'Testziel', contains: () => false,
    matches: () => checkbox, style: { opacity: '1' }, pseudo,
  };
  return target;
}
function smallTargets(elements, hitTest = () => elements[0]) {
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${collectSmallTouchTargets.toString()})()`, {
    document: { querySelectorAll: () => elements, documentElement: { clientWidth: 390, clientHeight: 844 }, elementFromPoint: hitTest },
    getComputedStyle: (target, pseudo) => pseudo ? target.pseudo || { content: 'none' } : { display: 'block', visibility: 'visible', opacity: '1', ...target.style },
  })));
}

test('Kleine Checkbox mit großem zugeordnetem Label ist gut bedienbar', () => {
  assert.deepEqual(smallTargets([element({ checkbox: true, label: element({ width: 347, height: 77 }) })]), []);
  assert.equal(smallTargets([element({ checkbox: true })]).length, 1);
});

test('44-px-Pseudotrefferfläche zählt; dekorative oder abgeschnittene Fläche zählt nicht', () => {
  const pseudo = { content: '""', position: 'absolute', width: '44px', height: '44px', pointerEvents: 'auto' };
  assert.deepEqual(smallTargets([element({ width: 36, height: 36, pseudo })]), []);
  assert.equal(smallTargets([element({ width: 36, height: 36, pseudo: { ...pseudo, pointerEvents: 'none' } })]).length, 1);
  const clip = element({ width: 36, height: 36 }); clip.style.overflowX = 'hidden';
  assert.equal(smallTargets([element({ width: 36, height: 36, pseudo, clip })]).length, 1);
  assert.equal(smallTargets([element({ width: 100, height: 20, pseudo: { ...pseudo, width: '10px', height: '100px' } })]).length, 1);
});

test('Verschobenes oder verdecktes 44-px-Pseudoelement wird nicht als bedienbare Fläche ausgegeben', () => {
  const pseudo = { content: '""', position: 'absolute', width: '44px', height: '44px', pointerEvents: 'auto' };
  const target = element({ width: 36, height: 36, pseudo });
  assert.equal(smallTargets([target], (x, y) => x >= 100 && x < 136 && y >= 100 && y < 136 ? target : null).length, 1, 'verschobene Erweiterung trifft nicht rund um den Knopf');
  assert.equal(smallTargets([target], () => element({ width: 44, height: 44 })).length, 1, 'anderes Element verdeckt die Trefferfläche');
  assert.equal(smallTargets([element({ width: 36, height: 36, top: 900, pseudo })]).length, 1, 'außerhalb Viewport ist die Erweiterung nicht belegt');
});
