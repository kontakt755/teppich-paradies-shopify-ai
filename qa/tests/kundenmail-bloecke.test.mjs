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

// ---- #25 Bestellbestaetigung: Abholung, keine Sendungsverfolgung, Herstellermuster, Lieferzeit
const mitLz = (l, lz) => ({ ...l, product: { metafields: { service: { lieferzeit: lz } } } });

test('#25 Ware: keine Sendungsverfolgung versprechen, nur "wir melden uns"', async () => {
  const html = await eng.parseAndRender(bestell, { ...base, attributes: {}, delivery_method: 'shipping', line_items: [line('Testvelours Teppichboden', 'TEST_400')] });
  assert.match(html, /Wir melden uns, sobald Ihre Ware unterwegs ist/);
  assert.doesNotMatch(html, /Sendungsverfolgung|Abholung/);
});

test('#25 Abholung im Laden: eigener Text mit Adresse 73–81 und Oeffnungszeiten, kein Versandtext', async () => {
  const html = await eng.parseAndRender(bestell, { ...base, attributes: {}, delivery_method: 'pick-up', line_items: [line('AKO Prima', 'TEST_80')] });
  assert.match(html, /holen die Ware bei uns im Laden ab/);
  assert.match(html, /erst nach unserer Nachricht/);
  assert.match(html, /Saarlandstraße 73–81, 16515 Oranienburg/);
  assert.match(html, /Mo–Fr 8:30–18:00, Sa 8:30–14:30 Uhr/);
  assert.doesNotMatch(html, /für den Versand vor|Sendungsverfolgung|unterwegs/);
  const misch = await eng.parseAndRender(bestell, { ...base, attributes: {}, delivery_method: 'pick-up', line_items: [line('AKO Prima', 'TEST_80'), line('Muster Testvelours', 'M-TEST_400')] });
  assert.match(misch, /Die Muster kommen per Post zu Ihnen\. Die Ware holen Sie bei uns im Laden ab/);
  assert.match(misch, /Saarlandstraße 73–81/);
  const muster = await eng.parseAndRender(bestell, { ...base, attributes: {}, delivery_method: 'pick-up', line_items: [line('Muster Testvelours', 'M-TEST_400')] });
  assert.doesNotMatch(muster, /Saarlandstraße/, 'reine Musterbestellung hat keine Ware zum Abholen');
});

test('#25 Herstellermuster (M-VW-, M-JAB-): direkt vom Hersteller, getrennte Umschlaege, kein Zeitrahmen', async () => {
  const html = await eng.parseAndRender(bestell, { ...base, attributes: {}, line_items: [
    line('Muster Testmarke Bingo Teppichboden', 'M-VW-TEST-5Y91-400', {}, 'Silbergrau (5Y91)'),
    line('Muster Testvelours Teppich nach Maß', 'M-TEST_036', {}, 'Sand'),
  ] });
  assert.match(html, /schickt der Hersteller selbst an Sie – auch in getrennten Umschlägen/);
  assert.match(html, /Muster Testmarke Bingo Teppichboden – Silbergrau \(5Y91\) \(direkt vom Hersteller\)/);
  assert.doesNotMatch(html, /Muster Testvelours Teppich nach Maß – Sand \(direkt/);
  assert.doesNotMatch(html, /in den nächsten Werktagen/);
  const jab = await eng.parseAndRender(bestell, { ...base, attributes: {}, line_items: [line('Muster Testvinyl', 'M-JAB-TEST-1'), line('Testleiste', 'TEST_1')] });
  assert.match(jab, /einige direkt vom Hersteller und in getrennten Umschlägen/);
  const eigen = await eng.parseAndRender(bestell, { ...base, attributes: {}, line_items: [line('Muster Testvelours', 'M-TEST_036')] });
  assert.match(eigen, /in den nächsten Werktagen kostenlos per Post/);
  assert.doesNotMatch(eigen, /Hersteller/);
});

test('#25 Lieferzeit je Warenposition aus service.lieferzeit, nur wenn gepflegt', async () => {
  const html = await eng.parseAndRender(bestell, { ...base, attributes: {}, line_items: [
    mitLz(line('Testvelours Teppich nach Maß', 'TEST_036', { 'Maße': '250 × 310 cm' }, 'Sandbeige (036)'), 'ca. 5–8 Werktage inkl. Ketteln'),
    mitLz(line('Kettelservice', 'KETTEL', { 'Kante umlaufend': '11,20 m' }, 'je 0,01 laufender Meter'), ''),
    line('Testleiste', 'TEST_1'),
    mitLz(line('Muster Testvelours', 'M-TEST_036'), 'ca. 2 Werktage'),
    mitLz(line('Muster ohne Muster-SKU', '', { _Muster_ID: 'x' }), 'ca. 3 Werktage'),
  ] });
  assert.match(html, /Lieferzeit laut Produktseite/);
  assert.match(html, /<li>Testvelours Teppich nach Maß – Sandbeige \(036\): ca\. 5–8 Werktage inkl\. Ketteln<\/li>/);
  assert.doesNotMatch(html, /Kettelservice[^<]*:|Testleiste[^<]*:|ca\. 2 Werktage|ca\. 3 Werktage/);
  const ohne = await eng.parseAndRender(bestell, { ...base, attributes: {}, line_items: [line('Testleiste', 'TEST_1')] });
  assert.doesNotMatch(ohne, /Lieferzeit/);
  // Shopify liefert das Metafeld als Objekt mit .value
  const obj = await eng.parseAndRender(bestell, { ...base, attributes: {}, line_items: [mitLz(line('Testteppich', 'T1'), { value: 'ca. 14 Tage' })] });
  assert.match(obj, /Testteppich: ca\. 14 Tage/);
  const boese = await eng.parseAndRender(bestell, { ...base, attributes: {}, line_items: [mitLz(line('Testteppich', 'T1'), '<b>x</b>')] });
  assert.doesNotMatch(boese, /<b>x<\/b>/);
});

// ---- #26 Masszeilen statt "775 x Teppich"
const pos1035 = [
  { quantity: 775, line_item: { title: 'Testvelours Teppich nach Maß', variant_title: 'Sandbeige (036)', properties: P({ Einfassung: 'Gekettelt', 'Maße': '250 × 310 cm', 'Fläche (abgerechnet)': '7,75 m²', 'Kante umlaufend': '11,20 m', _Gruppe: 'K1' }) } },
  { quantity: 1120, line_item: { title: 'Kettelservice', variant_title: 'je 0,01 laufender Meter', properties: P({ 'Zu Teppich': 'Testvelours Teppich nach Maß', Farbe: 'Sandbeige', 'Kante umlaufend': '11,20 m', _Gruppe: 'K1' }) } },
  { quantity: 3, line_item: { title: 'Testunterlage, Rollenware', variant_title: '1 mm, 80 cm breit (je lfm)', properties: [] } },
];
const vctx = (items) => ({ name: '#1035', order_status_url: 'https://shop/status', shipping_address: { first_name: 'Anna', last_name: 'Muster' }, shipping_method: { title: 'Standard' },
  fulfillment: { tracking_numbers: [], tracking_urls: [], fulfillment_line_items: items } });

test('#26 Versandbestaetigung: Teppich nach Mass mit Massen, Kettelservice als Kante, Stueckware unveraendert', async () => {
  const html = await eng.parseAndRender(versand, vctx(pos1035));
  assert.match(html, /<li>1 × Testvelours Teppich nach Maß – Sandbeige \(036\) \(250 × 310 cm, 7,75 m²\)<\/li>/);
  assert.match(html, /<li>Kettelservice für Testvelours Teppich nach Maß – Kante umlaufend 11,20 m<\/li>/);
  assert.match(html, /<li>3 × Testunterlage, Rollenware – 1 mm, 80 cm breit \(je lfm\)<\/li>/);
  assert.doesNotMatch(html, /775|1120|0,01 laufender/);
});

test('#26 Versandbestaetigung: Raummass, Wunschmass rund, Laengenware, Fussleiste', async () => {
  const html = await eng.parseAndRender(versand, vctx([
    { quantity: 1102, line_item: { title: 'Testvelours Teppichboden', variant_title: 'Sand / 400 cm', properties: P({ Art: 'Raummaß', 'Ihre Breite': '365 cm', 'Gewünschte Länge': '302 cm', 'Fläche': '11,02 m²' }) } },
    { quantity: 314, line_item: { title: 'Testteppich', variant_title: 'Default Title', properties: P({ Form: 'Rund', 'Fläche (berechnet)': '3,14 m²', Durchmesser: '200 cm' }) } },
    { quantity: 285, line_item: { title: 'Testkante nach Maß', variant_title: 'Silber', properties: P({ 'Länge je Stück': '95 cm', Anzahl: '3' }) } },
    { quantity: 12, line_item: { title: 'Gekettelte Fußleiste', variant_title: '6 cm', properties: P({ 'Zu Teppichboden': 'Testvelours', 'Höhe': '6 cm', 'Länge': '12 m' }) } },
    { quantity: 2, line_item: { title: 'Holzleiste', variant_title: 'Eiche', properties: P({ 'Zu Bodenbelag': 'Testvinyl' }) } },
  ]));
  assert.match(html, /1 × Testvelours Teppichboden – Sand \/ 400 cm \(365 × 302 cm, 11,02 m²\)/);
  assert.match(html, /1 × Testteppich \(Ø 200 cm, 3,14 m²\)/);
  assert.match(html, /3 × Testkante nach Maß – Silber \(je 95 cm\)/);
  assert.match(html, /<li>Gekettelte Fußleiste – 6 cm \(12 m\)<\/li>/);
  assert.match(html, /<li>2 × Holzleiste – Eiche<\/li>/);
  assert.doesNotMatch(html, /1102|314 ×|285 ×|12 ×/);
});

test('#26 Versandbestaetigung: Eigenschaften escaped', async () => {
  const html = await eng.parseAndRender(versand, vctx([{ quantity: 5, line_item: { title: 'T', variant_title: '', properties: P({ 'Maße': '<img src=x>' }) } }]));
  assert.doesNotMatch(html, /<img src=x>/);
});

const menge = readFileSync(join(B, 'bestellbestaetigung-menge.liquid'), 'utf8');
// Nachbau der Standardschleife (Stelle, an der line_display gesetzt wird) - Shopify-Vorlage selbst liegt nicht im Repo.
const standardListe = `{% for line in line_items %}{% if line.quantity < line.quantity %}{% capture line_display %}x{% endcapture %}{% else %}{% assign line_display = line.quantity %}{% endif %}${menge}[{{ line.title }} × {{ line_display }}]{% endfor %}`;

test('#26 Bestellbestaetigung: Mengenspalte der Standardliste zeigt Stueckzahl statt 0,01-Einheiten', async () => {
  const items = [...pos1035.map(f => ({ ...f.line_item, quantity: f.quantity })),
    { title: 'Testkante nach Maß', quantity: 285, properties: P({ 'Länge je Stück': '95 cm', Anzahl: '3 Stück' }) },
    { title: 'Testvelours Teppichboden', quantity: 25, properties: P({ Art: 'Meterware', Rollenbreite: '400 cm', 'Gewünschte Länge': '625 cm', 'Fläche (aufgerundet)': '25 m²' }) },
    { title: 'Gekettelte Fußleiste', quantity: 12, properties: P({ 'Zu Teppichboden': 'Testvelours', 'Länge': '12 m' }) },
    { title: 'Holzleiste', quantity: 2, properties: P({ 'Zu Bodenbelag': 'Testvinyl' }) },
    { title: 'Kostenloses Muster', quantity: 1, properties: P({ Produkt: 'Testvelours', Farbe: 'Sand', _Muster_ID: 'x' }) }];
  const out = await eng.parseAndRender(standardListe, { line_items: items });
  assert.equal(out, '[Testvelours Teppich nach Maß × 1][Kettelservice × 1][Testunterlage, Rollenware × 3][Testkante nach Maß × 3][Testvelours Teppichboden × 1][Gekettelte Fußleiste × 1][Holzleiste × 2][Kostenloses Muster × 1]');
});
