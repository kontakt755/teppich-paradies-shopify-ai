import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Liquid } from 'liquidjs';

// Rundgang 2026-10-26, #20: Alvento 380 x 420 zweimal in den Warenkorb gelegt.
// Shopify fasst beide Zeilen zusammen (Menge 32), die Property "Fläche
// (aufgerundet)" nennt aber weiter EIN Stueck (16,00 m²). Die Zeile zeigte
// "16,00 m²" bei 1.596,80 EUR. Jetzt steht "2 × 16,00 m²" da.
// Gerendert wird der echte Teil 'menge' aus snippets/tp-cart-gruppe.liquid.

const ohne = (name) => readFileSync(new URL('../../snippets/' + name + '.liquid', import.meta.url), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '')
  .replace(/{%-?\s*stylesheet\s*-?%}[\s\S]*?{%-?\s*endstylesheet\s*-?%}/g, '');
const engine = new Liquid({ templates: {
  'tp-cart-zuschnitt-fehlt': ohne('tp-cart-zuschnitt-fehlt'),
  'tp-cart-laengenware': ohne('tp-cart-laengenware'),
  'tp-cart-mehrfach-flaeche': ohne('tp-cart-mehrfach-flaeche'),
} });
const source = ohne('tp-cart-gruppe');

const rolle = (quantity, flaeche, qm = false) => ({
  quantity,
  properties: { 'Art': 'Raummaß', 'Ihre Breite': '380 cm', 'Aus Rolle': '400 cm', 'Gewünschte Länge': '420 cm', [qm ? 'Fläche' : 'Fläche (aufgerundet)']: flaeche },
  product: { title: 'Alvento Teppichboden', type: 'Teppichboden', metafields: { custom: { preis_pro_001_qm: { value: qm } } } },
  variant: { options: ['Greige', 'Wunschmaß'] },
});
const menge = async (line_item) => {
  const html = await engine.parseAndRender(source, { line_item, teil: 'menge', cart: { items: [line_item], attributes: {} } });
  const m = html.match(/<span class="visually-hidden">Menge:<\/span>([^<]*)<\/span>/);
  assert.ok(m, 'Mengentext fehlt: ' + html);
  return m[1].replace(/\s+/g, ' ').trim();
};

test('ein Stueck: Flaeche wie bisher', async () => {
  assert.equal(await menge(rolle(16, '16,00 m²')), '16,00 m²');
  assert.equal(await menge(rolle(17, '17 m²')), '17 m²');
});

test('dasselbe Mass zweimal: "2 × 16,00 m²" statt "16,00 m²"', async () => {
  assert.equal(await menge(rolle(32, '16,00 m²')), '2 × 16,00 m²');
  assert.equal(await menge(rolle(48, '16,00 m²')), '3 × 16,00 m²');
});

test('kein glattes Vielfaches: die echte Menge, nie die Property', async () => {
  assert.equal(await menge(rolle(20, '16,00 m²')), '20,00 m²');
  assert.equal(await menge(rolle(8, '16,00 m²')), '8,00 m²');
});

test('Flaechenware in 0,01 m² bleibt unberuehrt (zeigt tp-cart-flaeche)', async () => {
  assert.equal(await menge(rolle(1596, '15,96 m²', true)), '15,96 m²');
});

test('JS-Spiegel tp-cart-gruppen.js rechnet gleich', async () => {
  const { createRequire } = await import('node:module');
  createRequire(import.meta.url)('../../assets/tp-cart-gruppen.js');
  const G = globalThis.TPCartGruppen;
  const z = (quantity, fl) => ({ key: 'a', quantity, preisPro001Qm: false, properties: { 'Art': 'Raummaß', 'Fläche (aufgerundet)': fl } });
  assert.equal(G.kundeneinheit(z(16, '16,00 m²')), '16,00 m²');
  assert.equal(G.kundeneinheit(z(32, '16,00 m²')), '2 × 16,00 m²');
  assert.equal(G.kundeneinheit(z(20, '16,00 m²')), '20,00 m²');
  assert.equal(G.kundeneinheit(z(17, '17 m²')), '17 m²');
});
