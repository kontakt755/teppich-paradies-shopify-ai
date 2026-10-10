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
