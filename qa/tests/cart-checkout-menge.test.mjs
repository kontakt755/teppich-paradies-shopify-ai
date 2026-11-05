import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Liquid } from 'liquidjs';

const ohneBlock = (name) => readFileSync(new URL('../../snippets/' + name + '.liquid', import.meta.url), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '')
  .replace(/{%-?\s*stylesheet\s*-?%}[\s\S]*?{%-?\s*endstylesheet\s*-?%}/g, '');
const engine = new Liquid({ templates: {
  'tp-cart-einzelpreis-einheit': ohneBlock('tp-cart-einzelpreis-einheit'),
  'tp-zahl-de': ohneBlock('tp-zahl-de'),
} });
const source = ohneBlock('tp-cart-checkout-menge');
const zeile = (quantity, custom = {}, title = '') => ({ quantity, variant: { title }, product: { metafields: { custom } } });
const render = async (...items) => (await engine.parseAndRender(source, { cart: { items } })).replace(/\s+/g, ' ').trim();
const qm = { preis_pro_001_qm: { value: true } };

test('Teppich nach Mass und Kettelservice stehen in einem Satz', async () => {
  const satz = await render(zeile(600, qm), zeile(1000, {}, 'je 0,01 laufender Meter'));
  assert.match(satz, /In der Kasse zählt die Menge in Hundertsteln: 600 = 6,00 m², 1000 = 10,00 m\. Der Preis bleibt gleich\./);
  assert.equal(satz.match(/data-tp-checkout-menge/g).length, 1);
});

test('Profile und kleine Mengen behalten die exakte Einheit', async () => {
  assert.match(await render(zeile(95, { preis_pro_001_lfm: { value: true } })), /95 = 0,95 m\./);
  assert.match(await render(zeile(1, qm)), /1 = 0,01 m²\./);
  assert.match(await render(zeile(100, qm)), /100 = 1,00 m²\./);
});

test('gleiche Zeilen erscheinen einmal, mehr als zwei Beispiele werden gekuerzt', async () => {
  assert.match(await render(zeile(600, qm), zeile(600, qm)), /Hundertsteln: 600 = 6,00 m²\./);
  const lang = await render(zeile(600, qm), zeile(1000, {}, 'je 0,01 laufender Meter'), zeile(800, qm));
  assert.match(lang, /600 = 6,00 m², 1000 = 10,00 m usw\./);
  assert.ok(!lang.includes('800'));
});

test('ohne Hundertstel-Artikel gibt es keinen Satz', async () => {
  assert.equal(await render(), '');
  assert.equal(await render(zeile(6)), '');
  assert.equal(await render(zeile(9, { preis_pro_001_qm: { value: false } })), '');
  assert.equal(await render(zeile(0, qm)), '');
});

test('Warenkorbzeile rechnet die Menge nicht mehr einzeln vor', () => {
  const gruppe = readFileSync(new URL('../../snippets/tp-cart-gruppe.liquid', import.meta.url), 'utf8');
  assert.ok(!gruppe.includes('tp-cart-checkout-menge'));
});

test('Warenkorb blendet nur die Anzeige der Kettel-Variante aus', () => {
  const quelle = readFileSync(new URL('../../snippets/cart-products.liquid', import.meta.url), 'utf8');
  assert.match(quelle, /unless item\.variant\.title contains '0,01 laufender Meter'/);
  // Die Preiseinheit haengt weiter am unveraenderten Variantentitel.
  assert.match(ohneBlock('tp-cart-einzelpreis-einheit'), /variant\.title contains '0,01 laufender Meter'/);
});
