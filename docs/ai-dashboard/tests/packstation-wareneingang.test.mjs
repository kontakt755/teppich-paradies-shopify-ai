import './_testumgebung.mjs'; // vor Server-Imports
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { auftragsstatusPfad, leseAlle, setzeStatusPositionen, positionKey } from '../../../operations/lib/auftragsstatus.mjs';

// #1706: Eingelegt bzw. gepackt in der Packstation ist der Beleg, dass das Muster da ist.
// Ausschliesslich synthetische Kunden, Anschriften und Artikel.
const quelle = { id: 'gid://shopify/ProductVariant/100', sku: 'ORIG-B', title: 'Sand', metafields: { nodes: [] }, product: { id: 'gid://shopify/Product/100', handle: 'testlinea-sand', title: 'Testlinea Sand – Klickvinyl', productType: 'Klickvinyl', metafields: { nodes: [] } } };
const muster = id => ({ id: `gid://shopify/LineItem/${id}`, sku: 'TP-MUSTER-000', title: 'Kostenloses Muster', variantTitle: null, quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
  customAttributes: [{ key: '_Quellvariante_ID', value: '100' }], originalUnitPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } },
  variant: { id: 'gid://shopify/ProductVariant/900', sku: 'TP-MUSTER-000', title: 'Default Title', metafields: { nodes: [] }, product: { handle: 'kostenloses-muster', title: 'Kostenloses Muster', productType: 'Musterservice', metafields: { nodes: [] } } } });
const bestellung = (n, datum, anzahl = 1) => ({ id: `gid://shopify/Order/${n}`, name: `#T${n}`, createdAt: datum, cancelledAt: null, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', tags: [], customAttributes: [],
  customer: { id: 'gid://shopify/Customer/701', displayName: 'Testkunde Eingang', email: 'eingang@example.invalid' },
  shippingAddress: { name: 'Testkunde Eingang', address1: 'Testweg 9', address2: null, zip: '00000', city: 'Musterstadt', country: 'Germany' },
  totalPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: Array.from({ length: anzahl }, (_, i) => muster(n * 10 + i + 1)) } });

const laden = { name: 'Laden', rolle: 'mitarbeiter' };

function umgebung(t, orders = [bestellung(811, '2026-10-18T06:00:00Z', 2)]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-packstation-eingang-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  fs.mkdirSync(path.join(dir, 'lexikon'));
  fs.writeFileSync(path.join(dir, 'bestelluebersicht/orders.json'), JSON.stringify({ orders, quellvarianten: [quelle] }));
  fs.writeFileSync(path.join(dir, 'lexikon/produkte.json'), JSON.stringify({ produkte: [{ handle: 'testlinea-sand', titel: 'Testlinea Sand – Klickvinyl', eigenschaften: { marke: 'Testlinea' },
    varianten: [{ id: quelle.id, sku: quelle.sku, farbe: 'Sand', titel: 'Sand', einkauf: { produktname: 'Lieferant Sand 2mm', farbnummer: '7' } }] }] }));
  const verboten = () => assert.fail('Die Packstation darf keine externen Werkzeuge oder Fachsysteme aufrufen');
  const api = createApi({ root: dir, privatDirPath: dir, gh: verboten, rebuild: verboten, shopifyZugang: verboten, now: () => new Date('2026-10-21T12:00:00Z') });
  const file = auftragsstatusPfad(dir);
  // Vorlauf wie beim Bestellen: Position steht auf "bestellt".
  const bestellt = (positionen, extra = {}) => setzeStatusPositionen(file, positionen.map(m => ({ orderId: m.orderId, lineItemId: m.lineItemId, status: 'bestellt', actor: 'Einkauf', jetzt: new Date('2026-10-19T08:00:00Z'), ...extra })));
  const status = m => leseAlle(file)[positionKey(m.orderId, m.lineItemId)] || null;
  return { dir, api, file, bestellt, status };
}

test('Eingelegt setzt nur die abgehakte, bestellte Position auf geliefert; Haken zuruecknehmen stuft nicht zurueck', t => {
  const { api, bestellt, status } = umgebung(t);
  const k = api.kundenMusterPacken().kunden[0];
  const [m1, m2] = k.muster;
  bestellt([m1, m2]);
  const r = api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, aktion: 'haken', lineItemIds: [m1.lineItemId], an: true }, laden);
  assert.deepEqual(r.wareneingang, { anzahl: 1 });
  assert.equal(status(m1).status, 'geliefert');
  assert.equal(status(m1).geliefertVon, 'Laden');
  assert.equal(status(m1).geliefertNotiz, 'Eingelegt in der Packstation');
  assert.equal(status(m2).status, 'bestellt', 'nicht abgehaktes Muster bleibt offen');
  api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, aktion: 'haken', lineItemIds: [m1.lineItemId], an: false }, laden);
  assert.equal(status(m1).status, 'geliefert', 'ein zurueckgenommener Haken nimmt keinen Wareneingang zurueck');
});

test('Gepackt bestaetigt alle bestellten Muster; geliefert bleibt, nie bestellt bleibt unberuehrt', t => {
  const { api, bestellt, status } = umgebung(t, [bestellung(812, '2026-10-18T06:00:00Z', 3)]);
  const k = api.kundenMusterPacken().kunden[0];
  const [m1, m2, m3] = k.muster;
  bestellt([m1, m2]);
  api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, aktion: 'haken', lineItemIds: [m1.lineItemId], an: true }, laden);
  const vorher = status(m1);
  api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, aktion: 'haken', lineItemIds: [m2.lineItemId, m3.lineItemId], an: true }, laden);
  api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, gepackt: true }, laden);
  assert.deepEqual(status(m1), vorher, 'schon geliefert: kein zweiter Eintrag');
  assert.equal(status(m2).status, 'geliefert');
  assert.equal(status(m3), null, 'nie bestellt: die Packstation erfindet keine Bestellung');
});

test('Direkt an den Kunden und laufende Musterautomatik werden nie umgestellt', t => {
  const { api, bestellt, status, file } = umgebung(t);
  const k = api.kundenMusterPacken().kunden[0];
  const [m1, m2] = k.muster;
  bestellt([m1]);
  bestellt([m2]);
  const alle = leseAlle(file);
  alle[positionKey(m2.orderId, m2.lineItemId)].uebernahme = { id: 'musterautomatik', person: 'Musterautomatik' };
  fs.writeFileSync(file, JSON.stringify({ version: 1, positionen: alle }));
  const r = api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, aktion: 'haken', lineItemIds: [m1.lineItemId, m2.lineItemId], an: true }, laden);
  assert.deepEqual(r.wareneingang, { anzahl: 1 });
  assert.equal(status(m2).status, 'bestellt');
});

test('Nachholen: ein alter Haken an einem Direktversand-Muster bleibt beim Lieferanten', t => {
  const { api, dir, bestellt, status } = umgebung(t);
  const [m1] = api.kundenMusterPacken().kunden[0].muster;
  bestellt([m1], { ueber: 'kunde' });
  fs.writeFileSync(path.join(dir, 'muster-packen.json'), JSON.stringify({ haken: { [m1.lineItemId]: { zeit: '2026-10-20T09:00:00Z' } }, eintraege: {}, klaeren: {} }));
  assert.deepEqual(api.packstationWareneingangNachholen(), { anzahl: 0, fehler: [] });
  assert.equal(status(m1).status, 'bestellt');
});

test('Rolle lesen: 403, auftragsstatus unveraendert', t => {
  const { api, bestellt, file } = umgebung(t);
  const k = api.kundenMusterPacken().kunden[0];
  bestellt(k.muster);
  const vorher = fs.readFileSync(file, 'utf8');
  assert.throws(() => api.kundenMusterPackenSetzen({ packSchluessel: k.packSchluessel, aktion: 'haken', lineItemIds: [k.muster[0].lineItemId], an: true }, { name: 'Gast', rolle: 'lesen' }), e => e.status === 403);
  assert.equal(fs.readFileSync(file, 'utf8'), vorher);
});

test('Nachholen uebernimmt alte Haken und gepackte Umschlaege einmal, ein zweiter Lauf aendert nichts', t => {
  const a = bestellung(813, '2026-10-15T06:00:00Z', 2), b = bestellung(814, '2026-10-16T06:00:00Z', 1);
  b.customer = { ...b.customer, id: 'gid://shopify/Customer/702', email: 'zweiter@example.invalid' };
  b.shippingAddress = { ...b.shippingAddress, name: 'Zweiter Testkunde', address1: 'Andere Strasse 1' };
  const { api, dir, bestellt, status } = umgebung(t, [a, b]);
  const [ka, kb] = api.kundenMusterPacken().kunden.sort((x, y) => x.bestellungen[0].orderName.localeCompare(y.bestellungen[0].orderName));
  const [a1, a2] = ka.muster, [b1] = kb.muster;
  bestellt([a1, a2, b1]);
  // Stand aus der Zeit vor #1706: Haken und Umschlag gesetzt, Auftragsfluss noch "bestellt".
  fs.writeFileSync(path.join(dir, 'muster-packen.json'), JSON.stringify({
    haken: { [a1.lineItemId]: { zeit: '2026-10-20T09:00:00Z', von: 'Laden' } },
    eintraege: { [kb.packSchluessel]: { zeit: '2026-10-22T10:00:00Z', von: 'Laden' } },
    klaeren: {},
  }));
  const r = api.packstationWareneingangNachholen();
  assert.deepEqual(r, { anzahl: 2, fehler: [] });
  assert.equal(status(a1).status, 'geliefert');
  assert.match(status(a1).geliefertNotiz, /eingelegt am 20\.10\./);
  assert.equal(status(a2).status, 'bestellt');
  assert.equal(status(b1).status, 'geliefert');
  assert.match(status(b1).geliefertNotiz, /Umschlag gepackt am 22\.10\./);
  assert.equal(status(b1).geliefertVon, 'Packstation (nachgeholt)');
  assert.deepEqual(api.packstationWareneingangNachholen(), { anzahl: 0, fehler: [] });
});
