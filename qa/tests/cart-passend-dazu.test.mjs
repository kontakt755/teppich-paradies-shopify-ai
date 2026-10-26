import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Liquid } from 'liquidjs';

// Rundgang 2026-10-26, #16: "Passend dazu" im Warenkorb zeigte immer vier
// Sockelleisten - auch bei einem losen Teppich und bei einer reinen
// Musterbestellung. Gerendert wird die echte Auswahl aus
// sections/product-list.liquid (Block zwischen den Kommentaren).

const lies = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const ohneDoc = (s) => s.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const section = lies('sections/product-list.liquid');
const start = section.indexOf('{%- liquid\n  assign tp_wk_modus');
const ende = section.indexOf('-%}', start) + 3;
assert.ok(start > 0 && ende > start, 'Auswahlblock nicht gefunden');
const auswahl = section.slice(start, ende) + '{{ tp_wk_modus }}|{{ tp_wk_unterlagen }}';

const engine = new Liquid({ templates: { 'tp-muster-position': ohneDoc(lies('snippets/tp-muster-position.liquid')) } });
const zeile = (type, sku = 'X-1') => ({ sku, properties: {}, product: { type } });
const alle = { available: true };
const all_products = {
  'antirutsch-unterlage-fuer-teppiche-rollenware': alle,
  'teppichbremse-fuer-teppiche-rollenware': alle,
  'teppichbremse-fuer-teppiche-abgepasst': { available: false },
};
const modus = async (items, an = true) => (await engine.parseAndRender(auswahl, {
  section: { settings: { tp_warenkorb_inhalt: an } },
  cart: { items, item_count: items.length },
  all_products,
})).trim();

test('nur Muster: keine Liste', async () => {
  assert.equal(await modus([zeile('Musterservice'), zeile('Teppichboden', 'M-123')]), 'aus|');
});

test('Teppich nach Mass ohne Bodenbelag: lieferbare Unterlagen statt Leisten', async () => {
  const out = await modus([zeile('Teppich nach Maß'), zeile('Service'), zeile('Musterservice')]);
  assert.equal(out, 'unterlagen|antirutsch-unterlage-fuer-teppiche-rollenware,teppichbremse-fuer-teppiche-rollenware,');
  assert.match(await modus([zeile('Wohnteppich')]), /^unterlagen\|/);
  assert.match(await modus([zeile('Läufer nach Maß')]), /^unterlagen\|/);
});

test('Teppichboden, Vinyl oder gemischter Warenkorb: Kollektion wie bisher', async () => {
  assert.equal(await modus([zeile('Teppichboden')]), '|');
  assert.equal(await modus([zeile('Klickvinyl')]), '|');
  assert.equal(await modus([zeile('Teppich nach Maß'), zeile('Teppichboden')]), '|');
  assert.equal(await modus([zeile('Kleber & Fixierung')]), '|');
});

test('ohne Einstellung oder bei leerem Warenkorb aendert sich nichts', async () => {
  assert.equal(await modus([zeile('Musterservice')], false), '|');
  assert.equal(await modus([]), '|');
});

test('der Warenkorb schaltet die Auswahl ein', () => {
  const cart = lies('templates/cart.json');
  assert.match(cart, /"tp_warenkorb_inhalt": true/);
});

test('bei Unterlagen fuehrt kein "Alle ansehen" zu den Leisten', () => {
  assert.match(section, /{% if tp_wk_modus == 'unterlagen' %}tp-wk-unterlagen{% endif %}/);
  assert.match(section, /\.section-resource-list\.tp-wk-unterlagen \.section-resource-list__header a \{ display: none; \}/);
});
