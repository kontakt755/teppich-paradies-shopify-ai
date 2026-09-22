import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Liquid } from 'liquidjs';
// Kundenseitige Mail-Bausteine (Bestell- und Versandbestaetigung, Shop 2.0 M6).
// LiquidJS-Rendering; Grenze wie bestellmail-masspruefung.test.mjs.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const B = join(root, 'domains', 'shopify', 'benachrichtigungen');
const bestell = readFileSync(join(B, 'bestellbestaetigung-block.liquid'), 'utf8');
const versand = readFileSync(join(B, 'versandbestaetigung-block.liquid'), 'utf8');
const eng = new Liquid();
const P = (o) => Object.entries(o);
const line = (title, sku, props = {}, variant_title = '') => ({ title, sku, quantity: 1, variant_title, properties: P(props) });
const base = { name: '#1010', order_status_url: 'https://shop/status', billing_address: { first_name: 'Anna', last_name: 'Muster' }, customer: {} };

test('Musterbestellung: eigener Text, Muster mit Link und Farbe, Lichthinweis', async () => {
  const html = await eng.parseAndRender(bestell, { ...base, attributes: {}, line_items: [line('Muster Piumera Teppichboden', 'M-TEPDOLCE4_004', { _Muster_ID: 'x', _Produktlink: 'https://shop/products/piumera', Farbe: 'Sand Hell' })] });
  assert.match(html, /Guten Tag Anna Muster,/);
  assert.match(html, /Vielen Dank für Ihre Musterbestellung/);
  assert.match(html, /Tageslicht/);
  assert.match(html, /<a href="https:\/\/shop\/products\/piumera"[^>]*>Muster Piumera Teppichboden<\/a> – Sand Hell/);
  assert.doesNotMatch(html, /für den Versand vor/);
});

test('Warenbestellung mit Beratung, Masspruefung und Verlegung bestaetigt alle drei', async () => {
  const html = await eng.parseAndRender(bestell, { ...base, attributes: { Beratung: 'Ja', Telefon: '0176 1234567', 'Rückruf': 'Vormittags', 'Maßprüfung': 'Ja', Verlegung: 'Angefragt' }, line_items: [line('Piumera Teppichboden', 'TEPDOLCE4_004')] });
  assert.match(html, /Vielen Dank für Ihre Bestellung bei Teppich Paradies/);
  assert.match(html, /rufen Sie vormittags unter 0176 1234567 an/);
  assert.match(html, /prüfen Ihre Maße/);
  assert.match(html, /Aufmaß oder Verlegung/);
  assert.match(html, /Bestellstatus ansehen/);
});

test('Mischbestellung und Bestellung ohne Angaben', async () => {
  const misch = await eng.parseAndRender(bestell, { ...base, attributes: { Beratung: 'Nein' }, line_items: [line('Piumera', 'TEPDOLCE4_004'), line('Kostenloses Muster', 'TP-MUSTER-000')] });
  assert.match(misch, /Ware und kostenlose Muster/);
  assert.match(misch, /Fragen zu Ihrer Bestellung\? Rufen Sie uns an/);
  assert.doesNotMatch(misch, /So geht es weiter/);
});

test('Keine internen Daten, Eingaben escaped', async () => {
  const html = await eng.parseAndRender(bestell, { ...base, attributes: { Beratung: 'Ja', Telefon: '<img src=x>' }, line_items: [line('<b>x</b>', 'M-1', { _Muster_ID: 'x' })] });
  assert.doesNotMatch(html, /<img src=x>|<b>x<\/b>|Großhändler|Lieferant/);
});

test('Versandbestaetigung: Tracking-Button, Spedition bei Meterware, Inhalt', async () => {
  const ctx = { name: '#1010', order_status_url: 'https://shop/status', shipping_address: { first_name: 'Anna', last_name: 'Muster' }, shipping_method: { title: 'Standard' },
    fulfillment: { tracking_company: 'DHL', tracking_numbers: ['00340434'], tracking_urls: ['https://dhl/00340434'], fulfillment_line_items: [{ quantity: 2, line_item: { title: 'Piumera Teppichboden', variant_title: 'Sand Hell / 400cm', properties: P({ Art: 'Meterware' }) } }] } };
  const html = await eng.parseAndRender(versand, ctx);
  assert.match(html, /ist unterwegs/);
  assert.match(html, /Versand mit DHL/);
  assert.match(html, /<a href="https:\/\/dhl\/00340434"[^>]*>Sendung verfolgen<\/a>/);
  assert.match(html, /Lieferung per Spedition/);
  assert.match(html, /2 × Piumera Teppichboden – Sand Hell \/ 400cm/);
  const ohne = await eng.parseAndRender(versand, { ...ctx, fulfillment: { ...ctx.fulfillment, tracking_numbers: [], tracking_urls: [], fulfillment_line_items: [{ quantity: 1, line_item: { title: 'Sockelleiste', variant_title: 'Default Title', properties: [] } }] } });
  assert.match(ohne, /keine Online-Sendungsverfolgung/);
  assert.doesNotMatch(ohne, /Lieferung per Spedition|Default Title/);
});
