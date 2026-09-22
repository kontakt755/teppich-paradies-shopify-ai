import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Liquid } from 'liquidjs';
// Beratung/Masspruefung/Verlegung und Bestelltyp in der internen Bestellmail
// (Shop 2.0 M5/M7). Gerendert mit LiquidJS; Grenze wie in
// bestellmail-masspruefung.test.mjs.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tpl = readFileSync(join(root, 'domains', 'shopify', 'benachrichtigungen', 'interne-bestellmail-block.liquid'), 'utf8');
const eng = new Liquid();
const P = (o) => Object.entries(o);
const line = (title, sku, props = {}) => ({ title, quantity: 1, sku, variant_title: 'Sand', properties: P(props), product: { metafields: { custom: {}, grosshandel: { sku: 'X1' } } }, variant: { metafields: { lieferant: {} } } });
const render = (line_items, attributes) => eng.parseAndRender(tpl, { name: '#1', created_at: '2026-09-22', line_items, attributes, billing_address: { name: 'K', phone: '' }, email: 'k@example.com' });

test('Musterbestellung mit Beratung Ja zeigt Rueckruf und Typ', async () => {
  const html = await render([line('Muster Piumera', 'M-TEPDOLCE4_004')], { Beratung: 'Ja', Telefon: '0176 1234567', 'Rückruf': 'Vormittags', Beratungsthema: 'Treppe' });
  assert.match(html, /TYP-MUSTER/);
  assert.match(html, /BERATUNG-JA/);
  assert.match(html, /0176 1234567, am besten Vormittags/);
  assert.match(html, /Thema: Treppe/);
  assert.match(html, /#fff4e5/);
});

test('Ware mit Nein bleibt ruhig, Mischbestellung erkannt', async () => {
  const html = await render([line('Piumera', 'TEPDOLCE4_004')], { Beratung: 'Nein' });
  assert.match(html, /TYP-WARE/);
  assert.match(html, /BERATUNG-NEIN/);
  assert.doesNotMatch(html, /MASS-PRUEFUNG-OFFEN|VERLEGUNG-ANGEFRAGT|#fff4e5/);
  const misch = await render([line('Piumera', 'TEPDOLCE4_004'), line('Kostenloses Muster', 'TP-MUSTER-000', { _Muster_ID: 'x' })], {});
  assert.match(misch, /TYP-MISCHBESTELLUNG/);
  assert.match(misch, /Keine Angabe zur Beratung/);
});

test('Masspruefung und Verlegung mit Beratung Nein nennen das Telefon', async () => {
  const html = await render([line('Piumera', 'TEPDOLCE4_004')], { Beratung: 'Nein', 'Maßprüfung': 'Ja', Telefon: '03301 573 37 20', Verlegung: 'Angefragt' });
  assert.match(html, /MASS-PRUEFUNG-OFFEN/);
  assert.match(html, /\(Telefon: 03301 573 37 20\)/);
  assert.match(html, /VERLEGUNG-ANGEFRAGT/);
});

test('Kundeneingaben werden escaped', async () => {
  const html = await render([line('Piumera', 'S')], { Beratung: 'Ja', Telefon: '<b>1</b>', Beratungsthema: '<script>x</script>' });
  assert.doesNotMatch(html, /<script>x<\/script>|<b>1<\/b>/);
});
