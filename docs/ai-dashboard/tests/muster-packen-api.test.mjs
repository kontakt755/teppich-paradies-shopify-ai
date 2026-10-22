import './_testumgebung.mjs'; // vor Server-Imports
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';

// Ausschliesslich synthetische Kunden, Anschriften und Artikel.
const quelle = { id: 'gid://shopify/ProductVariant/100', sku: 'ORIG-B', title: 'Sand', metafields: { nodes: [] }, product: { id: 'gid://shopify/Product/100', handle: 'testlinea-sand', title: 'Testlinea Sand – Klickvinyl', productType: 'Klickvinyl', metafields: { nodes: [] } } };
const muster = id => ({ id: `gid://shopify/LineItem/${id}`, sku: 'TP-MUSTER-000', title: 'Kostenloses Muster', variantTitle: null, quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
  customAttributes: [{ key: '_Quellvariante_ID', value: '100' }], originalUnitPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } },
  variant: { id: 'gid://shopify/ProductVariant/900', sku: 'TP-MUSTER-000', title: 'Default Title', metafields: { nodes: [] }, product: { handle: 'kostenloses-muster', title: 'Kostenloses Muster', productType: 'Musterservice', metafields: { nodes: [] } } } });
const bestellung = (n, datum) => ({ id: `gid://shopify/Order/${n}`, name: `#T${n}`, createdAt: datum, cancelledAt: null, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', tags: [], customAttributes: [],
  customer: { id: 'gid://shopify/Customer/700', displayName: 'Testkunde Packen', email: 'packen@example.invalid' },
  shippingAddress: { name: 'Testkunde Packen', address1: 'Testweg 7', address2: null, zip: '00000', city: 'Musterstadt', country: 'Germany' },
  totalPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: [muster(n * 10 + 1)] } });

function umgebung(t, orders = [bestellung(801, '2026-10-18T06:00:00Z'), bestellung(802, '2026-10-20T06:00:00Z')]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-muster-packen-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  fs.mkdirSync(path.join(dir, 'lexikon'));
  fs.writeFileSync(path.join(dir, 'bestelluebersicht/orders.json'), JSON.stringify({ orders, quellvarianten: [quelle] }));
  fs.writeFileSync(path.join(dir, 'lexikon/produkte.json'), JSON.stringify({ produkte: [{ handle: 'testlinea-sand', titel: 'Testlinea Sand – Klickvinyl', eigenschaften: { marke: 'Testlinea' },
    varianten: [{ id: quelle.id, sku: quelle.sku, farbe: 'Sand', titel: 'Sand', einkauf: { produktname: 'Lieferant Sand 2mm', farbnummer: '7' } }] }] }));
  const verboten = () => assert.fail('Muster packen darf keine externen Werkzeuge oder Fachsysteme aufrufen');
  return { dir, api: createApi({ root: dir, privatDirPath: dir, gh: verboten, rebuild: verboten, shopifyZugang: verboten, now: () => new Date('2026-10-21T12:00:00Z') }) };
}

test('GET buendelt beide Bestellungen des Kunden mit Anschrift, Aufklebern und vorher/nachher', t => {
  const { api, dir } = umgebung(t);
  const r = api.kundenMusterPacken();
  assert.equal(r.verfuegbar, true);
  assert.equal(r.kunden.length, 1);
  assert.equal(r.offen, 1);
  const k = r.kunden[0];
  assert.deepEqual(k.bestellungen.map(b => b.orderName), ['#T801', '#T802']);
  assert.equal(k.wartetTage, 3);
  assert.equal(k.adresse.ort, 'Musterstadt');
  assert.deepEqual(k.muster.map(m => [m.etikett.sku, m.vorher?.produktname]), [['ORIG-B', 'Lieferant Sand 2mm'], ['ORIG-B', 'Lieferant Sand 2mm']]);
  assert.deepEqual(k.adressAufkleber.empfaenger.map(z => z.text), ['Testkunde Packen', 'Testweg 7', '00000 Musterstadt']);
  assert.equal(k.aufkleber, 3);
  assert.equal(fs.existsSync(path.join(dir, 'muster-packen.json')), false, 'GET schreibt nichts');
});

test('POST gepackt: Rolle lesen 403, unbekannter Kunde 409, sonst gespeichert und zuruecknehmbar', t => {
  const { api, dir } = umgebung(t);
  const pk = api.kundenMusterPacken().kunden[0].packSchluessel;
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: pk, gepackt: true }, { name: 'Gast', rolle: 'lesen' }), e => e.status === 403);
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: 'gid://shopify/Order/1', gepackt: true }, { name: 'Laden', rolle: 'mitarbeiter' }), e => e.status === 409);
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: pk }, { name: 'Laden', rolle: 'mitarbeiter' }), e => e.status === 400);
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: pk, gepackt: true }), e => e.status === 409);
  api.kundenMusterPackenSetzen({ packSchluessel: pk, aktion: 'haken', lineItemIds: api.kundenMusterPacken().kunden[0].muster.map(m => m.lineItemId), an: true });
  api.kundenMusterPackenSetzen({ packSchluessel: pk, gepackt: true }, { name: 'Laden', rolle: 'mitarbeiter' });
  const k = api.kundenMusterPacken().kunden[0];
  assert.equal(k.gepackt.von, 'Laden');
  assert.equal(api.kundenMusterPacken().offen, 0);
  assert.ok(fs.existsSync(path.join(dir, 'muster-packen.json')));
  api.kundenMusterPackenSetzen({ packSchluessel: pk, gepackt: false }, { name: 'Laden', rolle: 'mitarbeiter' });
  assert.equal(api.kundenMusterPacken().kunden[0].gepackt, null);
});

test('beschaedigte Ablage wird gemeldet statt als leer ueberschrieben', t => {
  const { api, dir } = umgebung(t);
  fs.writeFileSync(path.join(dir, 'muster-packen.json'), '{kaputt');
  assert.throws(() => api.kundenMusterPacken(), e => e.status === 500 && /beschädigt/.test(e.message));
  assert.equal(fs.readFileSync(path.join(dir, 'muster-packen.json'), 'utf8'), '{kaputt');
});

test('ohne Bestellexport: Hinweis statt Fehler', t => {
  const { api, dir } = umgebung(t);
  fs.rmSync(path.join(dir, 'bestelluebersicht/orders.json'));
  assert.equal(api.kundenMusterPacken().verfuegbar, false);
});

test('Haken und zu klaeren: fehlend = nicht abgehakte Muster, "Fehlendes ist da" holt zurueck, Haken bleiben', t => {
  const { api, dir } = umgebung(t);
  const laden = { name: 'Laden', rolle: 'mitarbeiter' };
  const k0 = api.kundenMusterPacken().kunden[0];
  const [m1, m2] = k0.muster.map(m => m.lineItemId);
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: k0.packSchluessel, aktion: 'haken', lineItemIds: ['gid://shopify/LineItem/fremd'], an: true }, laden), e => e.status === 400);
  api.kundenMusterPackenSetzen({ packSchluessel: k0.packSchluessel, aktion: 'haken', lineItemIds: [m1], an: true }, laden);
  api.kundenMusterPackenSetzen({ packSchluessel: k0.packSchluessel, aktion: 'klaeren', klaeren: true, notiz: 'zweites fehlt' }, laden);
  let k = api.kundenMusterPacken().kunden[0];
  assert.equal(k.bereich, 'klaeren');
  assert.deepEqual(k.klaeren.fehlt, [m2]);
  assert.equal(api.kundenMusterPacken().zahlen.klaeren, 1);
  api.kundenMusterPackenSetzen({ packSchluessel: k0.packSchluessel, aktion: 'klaeren', klaeren: false }, laden);
  k = api.kundenMusterPacken().kunden[0];
  assert.equal(k.bereich, 'warten', 'Ruecknahme der Klaerung bestaetigt keinen Wareneingang');
  assert.ok(k.muster[0].abgehakt, 'Haken bleiben nach "Fehlendes ist da"');
  api.kundenMusterPackenSetzen({ packSchluessel: k0.packSchluessel, aktion: 'haken', lineItemIds: [m2], an: true }, laden);
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: k0.packSchluessel, aktion: 'klaeren', klaeren: true }, laden), e => e.status === 400);
  const roh = JSON.parse(fs.readFileSync(path.join(dir, 'muster-packen.json'), 'utf8'));
  assert.equal(Object.keys(roh.haken).length, 2);
});

test('Lieferantenname kommt aus den privaten Stammdaten', t => {
  const { api, dir } = umgebung(t);
  assert.equal(api.kundenMusterPacken().kunden[0].muster[0].lieferant, null, 'ohne Lieferant am Artikel kein Name');
  const produkte = JSON.parse(fs.readFileSync(path.join(dir, 'lexikon/produkte.json'), 'utf8'));
  produkte.produkte[0].varianten[0].einkauf.lieferant = 'A';
  fs.writeFileSync(path.join(dir, 'lexikon/produkte.json'), JSON.stringify(produkte));
  const { api: api2 } = { api: createApi({ root: dir, privatDirPath: dir, now: () => new Date('2026-10-21T12:00:00Z') }) };
  assert.equal(api2.kundenMusterPacken().kunden[0].muster[0].lieferant, 'Lieferant A');
});


test('Gepackt sperrt fehlende Angaben und Teilrueckerstattung trotz aller Haken ohne neue Packmarke', t => {
  const order = bestellung(803, '2026-10-18');
  order.displayFinancialStatus = 'PARTIALLY_REFUNDED';
  const { api, dir } = umgebung(t, [order]);
  const k = api.kundenMusterPacken().kunden[0];
  api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, aktion: 'haken', lineItemIds: k.muster.map(m => m.lineItemId), an: true });
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, gepackt: true }), e => e.status === 409);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'muster-packen.json'))).eintraege, {});
});

test('Ruecknahme einer adressbezogenen Klaerung veraendert weder zweiten Umschlag noch alte gemeinsame Notiz', t => {
  const a = bestellung(804, '2026-10-18'), b = bestellung(805, '2026-10-19');
  b.shippingAddress.address1 = 'Zweiter Testweg 8';
  const { api, dir } = umgebung(t, [a, b]);
  const [k1, k2] = api.kundenMusterPacken().kunden;
  const alt = { notiz: 'Alte gemeinsame Notiz', fehlt: [] };
  fs.writeFileSync(path.join(dir, 'muster-packen.json'), JSON.stringify({ klaeren: { 'email:packen@example.invalid': alt }, haken: {}, eintraege: {} }));
  assert.ok(api.kundenMusterPacken().kunden.every(k => k.bereich === 'klaeren' && k.klaeren.notiz === alt.notiz));
  for (const k of [k1, k2]) api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, aktion: 'klaeren', klaeren: true, notiz: 'Eigene Klaerung' });
  api.kundenMusterPackenSetzen({ packSchluessel: k1.packSchluessel, aktion: 'klaeren', klaeren: false });
  const nachher = api.kundenMusterPacken().kunden;
  assert.equal(nachher[0].klaeren, null);
  assert.equal(nachher[1].klaeren.notiz, 'Eigene Klaerung');
  assert.match(nachher[0].altvermerk, /Alte gemeinsame Notiz/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'muster-packen.json'))).klaeren['email:packen@example.invalid'], alt);
});
