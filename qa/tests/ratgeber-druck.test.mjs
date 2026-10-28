import assert from 'node:assert/strict';
import test from 'node:test';
import { ratgeberFuerBestellung, ratgeberHtml, massText, istMuster, RATGEBER } from '../../domains/shopify/ratgeber-pdf/vorlage.mjs';
// Druckfassung je Bestellung: Auswahl und Vorbelegung aus dem Bestellexport (Form wie orders.json).
const A = (o) => Object.entries(o).map(([key, value]) => ({ key, value }));
const zeile = (title, productType, attrs = {}, extra = {}) => ({ title, sku: 'T1', variantTitle: 'Default Title', customAttributes: A(attrs), variant: { product: { productType } }, ...extra });
const bestellung = (lineItems, createdAt = '2026-10-26T09:15:00Z') => ({ name: '#1070', createdAt, lineItems: { nodes: lineItems } });

test('Teppich nach Mass: Teppich-Ratgeber mit Bestellnummer, Produkt und Farbe, Mass und Datum', () => {
  const teile = ratgeberFuerBestellung(bestellung([
    zeile('Testvelours Teppich nach Maß', 'Teppich nach Maß', { Farbe: 'Sand (14)', 'Maße': '196 × 296 cm' }),
    zeile('Kettelservice', 'Service', { 'Kante umlaufend': '9,84 m' }),
  ]));
  assert.equal(teile.length, 1);
  assert.equal(teile[0].r.schluessel, 'teppich');
  assert.deepEqual(teile[0].persoenlich, {
    kopf: '#1070 vom 26.10.2026',
    felder: { Bestellnummer: '#1070', 'Teppich und Farbe': 'Testvelours Teppich nach Maß – Sand (14)', 'Maß': '196 × 296 cm', 'Gekauft am': '26.10.2026' },
  });
});

test('Mehrere Boeden: je Ratgeber ein Teil, Muster und Zubehoer ohne, gleiche Bodenart zusammengefasst', () => {
  const teile = ratgeberFuerBestellung(bestellung([
    zeile('Testvinyl A', 'Klickvinyl', {}, { variantTitle: 'Eiche Natur' }),
    zeile('Testvinyl B', 'Klickvinyl', {}, { variantTitle: 'Eiche Grau' }),
    zeile('Muster Testvelours', 'Teppichboden', {}, { sku: 'M-TEST_1' }),
    zeile('Kostenloses Muster', 'Teppichboden', { _Muster_ID: 'x' }, { sku: 'TP-MUSTER-000' }),
    zeile('Testleiste', 'Sockelleisten'),
  ]));
  assert.deepEqual(teile.map((t) => t.r.schluessel), ['klickvinyl']);
  assert.equal(teile[0].persoenlich.felder['Boden und Farbe'], 'Testvinyl A – Eiche Natur; Testvinyl B – Eiche Grau');
  assert.equal(teile[0].persoenlich.felder['Verlegt am'], undefined, 'Verlegedatum bleibt zum Ausfuellen leer');
});

test('Nur Muster: keine Druckfassung', () => {
  assert.deepEqual(ratgeberFuerBestellung(bestellung([zeile('Muster', 'Musterservice', {}, { sku: 'M-JAB-1' })])), []);
});

test('Masse aus allen Rechnern', () => {
  assert.equal(massText(zeile('T', 'Teppich', { Breite: '160 cm', 'Länge': '230 cm' })), '160 × 230 cm');
  assert.equal(massText(zeile('T', 'Teppich', { Durchmesser: '200 cm' })), 'Ø 200 cm');
  assert.equal(massText(zeile('T', 'Teppich', { 'Seitenlänge': '150 cm' })), '150 cm × 150 cm');
  assert.equal(massText(zeile('T', 'Teppichboden', { 'Ihre Breite': '365 cm', 'Gewünschte Länge': '302 cm' })), '365 × 302 cm');
  assert.equal(massText(zeile('T', 'Teppichboden')), '');
  assert.equal(istMuster(zeile('T', 'Teppich', {}, { sku: 'TEPX_1' })), false);
});

test('Druck-HTML: Felder vorbelegt, Kundeneingaben escaped, jede Zuordnung aus inhalte.mjs waehlt ihren Ratgeber', () => {
  const teile = ratgeberFuerBestellung(bestellung([zeile('<b>Teppich</b>', 'Wohnteppich', { Farbe: '<img src=x>' })]));
  const html = ratgeberHtml(teile);
  assert.match(html, /<b>#1070<\/b>/);
  assert.match(html, /#1070 vom 26\.10\.2026/);
  assert.doesNotMatch(html, /<img src=x>|<b>Teppich<\/b>/);
  assert.equal((html.match(/class="seite"/g) || []).length, 2);
  for (const r of RATGEBER) for (const typ of r.produkttypen) {
    assert.equal(ratgeberFuerBestellung(bestellung([zeile('X', typ)]))[0]?.r.schluessel, r.schluessel, typ);
  }
});
