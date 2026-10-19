import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Liquid } from 'liquidjs';

const ohneDoc = (name) => readFileSync(new URL('../../snippets/' + name + '.liquid', import.meta.url), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const engine = new Liquid({ templates: {
  'tp-cart-einzelpreis-einheit': ohneDoc('tp-cart-einzelpreis-einheit'),
  'tp-zahl-de': ohneDoc('tp-zahl-de'),
} });
const source = ohneDoc('tp-cart-checkout-menge');
const zeile = (quantity, custom = {}, title = '') => ({ quantity, variant: { title }, product: { metafields: { custom } } });
const render = async (line_item) => (await engine.parseAndRender(source, { line_item })).replace(/\s+/g, ' ').trim();

test('native Menge 606 wird als 6,06 m² erklaert', async () => {
  const line = zeile(606, { preis_pro_001_qm: { value: true } });
  assert.match(await render(line), /Menge 606 für 6,06 m²\./);
  assert.equal(line.quantity, 606);
});

test('native Kettelmenge 1004 wird als 10,04 m erklaert', async () => {
  assert.match(await render(zeile(1004, {}, '0,01 laufender Meter')), /Menge 1004 für 10,04 m\./);
});

test('Profile in Hundertstelmetern und kleine Mengen behalten die exakte Einheit', async () => {
  assert.match(await render(zeile(95, { preis_pro_001_lfm: { value: true } })), /Menge 95 für 0,95 m\./);
  assert.match(await render(zeile(1, { preis_pro_001_qm: { value: true } })), /Menge 1 für 0,01 m²\./);
  assert.match(await render(zeile(100, { preis_pro_001_qm: { value: true } })), /Menge 100 für 1,00 m²\./);
});

test('normale Stueck-, Paket- oder volle Quadratmetermengen erhalten keinen Hinweis', async () => {
  assert.equal(await render(zeile(6)), '');
  assert.equal(await render(zeile(9, { preis_pro_001_qm: { value: false } })), '');
  assert.equal(await render(zeile(0, { preis_pro_001_qm: { value: true } })), '');
});
