// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner (siehe _testumgebung.mjs).
import { PRIVAT_DIR } from './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi, ApiError } from '../../../scripts/dashboard-api.mjs';

// Nur synthetische Daten: Pseudonyme und erfundene Kunden.
const mf = (namespace, key, value) => ({ namespace, key, value });
const ORDER = {
  id: 'gid://shopify/Order/90001', name: '#T1', createdAt: '2026-01-01T10:00:00Z', cancelledAt: null,
  displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [], tags: [],
  customer: { id: 'gid://shopify/Customer/5001', displayName: 'Testkunde 1', email: 'testkunde1@example.invalid' },
  shippingAddress: { name: 'Testkunde 1', address1: 'Testweg 1', zip: '00000', city: 'Musterstadt', country: 'Deutschland' },
  totalPriceSet: { shopMoney: { amount: '123.45', currencyCode: 'EUR' } },
  lineItems: { nodes: [{
    id: 'gid://shopify/LineItem/1', sku: 'TEST-A-1', title: 'Testdiele Eiche', variantTitle: 'Natur', quantity: 3, currentQuantity: 3, unfulfilledQuantity: 3,
    customAttributes: [], originalUnitPriceSet: { shopMoney: { amount: '41.15', currencyCode: 'EUR' } },
    variant: {
      id: 'gid://shopify/ProductVariant/1', sku: 'TEST-A-1', title: 'Natur',
      metafields: { nodes: [mf('einkauf', 'lieferant', 'A'), mf('einkauf', 'artikelnummer', 'A-4711'), mf('einkauf', 'bestelleinheit', 'paket'), mf('einkauf', 'route', 'SUPPLIER_TO_TP')] },
      lieferant: { nodes: [] },
      product: { id: 'gid://shopify/Product/1', handle: 'testdiele', title: 'Testdiele Eiche', metafields: { nodes: [mf('custom', 'qm_pro_paket', '2,2')] }, grosshandel: { nodes: [] } },
    },
  }] },
};

function privat({ orders = true, stammdaten = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-lief-'));
  if (orders) {
    fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ orders: [ORDER] }));
  }
  if (stammdaten) {
    fs.mkdirSync(path.join(dir, 'lieferanten'), { recursive: true });
    fs.copyFileSync(new URL('../../../operations/lib/lieferanten.beispiel.json', import.meta.url), path.join(dir, 'lieferanten', 'stammdaten.json'));
  }
  return dir;
}

const api = (dir) => createApi({ gh: async () => '', root: dir, privatDirPath: dir, now: () => new Date('2026-01-10T10:00:00Z') });

test('einkaufLieferanten: Stammdaten + offene Positionen, ohne Preise', () => {
  const r = api(privat()).einkaufLieferanten();
  assert.equal(r.verfuegbar, true);
  assert.equal(r.stammdatenDatei.vorhanden, true);
  assert.deepEqual(r.stammdatenDatei.fehler, []);
  assert.deepEqual(r.lieferanten.map(l => l.id), ['A', 'B']);
  assert.deepEqual(r.lieferanten[0].positionen, { zuBestellen: 1, bestellt: 0, unterwegs: 0 });
  assert.equal(r.lieferanten[0].aeltesteUnbestellteTage, 9);
  assert.equal(r.lieferanten[0].stammdaten.kundennummer, 'K-000001');
  assert.equal(/41\.15|123\.45|"preis"/.test(JSON.stringify(r)), false);
});

test('ohne private Dateien: nicht hinterlegt statt Fehler', () => {
  const a = api(privat({ orders: false, stammdaten: false }));
  const r = a.einkaufLieferanten();
  assert.equal(r.verfuegbar, false);
  assert.match(r.hinweis, /orders\.json fehlt/);
  assert.equal(r.stammdatenDatei.vorhanden, false);
  assert.match(r.stammdatenDatei.hinweis, /nicht hinterlegt/);
  assert.deepEqual(r.lieferanten, []);
  const m = a.einkaufBestellmail({ lieferant: 'A' });
  assert.equal(m.verfuegbar, false);
  assert.deepEqual(m.mails, []);
});

test('Bestelldaten ohne Stammdaten: Lieferant erscheint mit leeren Stammdaten', () => {
  const a = api(privat({ stammdaten: false }));
  const l = a.einkaufLieferanten().lieferanten;
  assert.deepEqual(l.map(x => [x.id, x.stammdaten.hinterlegt]), [['A', false]]);
  const mail = a.einkaufBestellmail({ lieferant: 'A' }).mails[0];
  assert.equal(mail.an, null);
  assert.equal(mail.mailto, null);
  assert.match(mail.text, /Art\.-Nr\. A-4711/);
});

test('einkaufLieferant: Detail, 400 ohne id, 404 bei unbekannter Kennung', () => {
  const a = api(privat());
  const r = a.einkaufLieferant({ id: 'a' });
  assert.equal(r.lieferant.id, 'A');
  assert.equal(r.lieferant.ware.zuBestellen[0].artikelnummer, 'A-4711');
  assert.throws(() => a.einkaufLieferant({ id: '' }), e => e instanceof ApiError && e.status === 400);
  assert.throws(() => a.einkaufLieferant({ id: 'Z' }), e => e instanceof ApiError && e.status === 404);
});

test('einkaufBestellmail: fertige Mail; nach "bestellt" nichts mehr zu bestellen; falsche Eingabe 400', async () => {
  const dir = privat();
  const a = api(dir);
  const r = a.einkaufBestellmail({ lieferant: 'A', art: 'ware' });
  assert.equal(r.verfuegbar, true);
  assert.equal(r.automatischGesendet, false);
  assert.equal(r.mails[0].an, 'bestellung@lieferant-a.example');
  assert.ok(r.mails[0].mailto.startsWith('mailto:bestellung@lieferant-a.example?subject='));
  assert.throws(() => a.einkaufBestellmail({ lieferant: 'A', art: 'fax' }), e => e instanceof ApiError && e.status === 400);

  await a.einkaufAuftragsstatusSetzen({ orderId: ORDER.id, lineItemId: 'gid://shopify/LineItem/1', status: 'bestellt' }, { name: 'Testperson', kuerzel: 'tp', rolle: 'mitarbeiter' });
  const danach = a.einkaufBestellmail({ lieferant: 'A', art: 'ware' }).mails[0];
  assert.equal(danach.positionen.length, 0);
  assert.equal(danach.bereitsBestellt, 1);
  assert.deepEqual(a.einkaufLieferanten().lieferanten[0].positionen, { zuBestellen: 0, bestellt: 1, unterwegs: 0 });
});

test('Routen: GET-only, Herkunftspruefung, alle Rollen duerfen lesen, Notzugang ebenso', async () => {
  fs.mkdirSync(path.join(PRIVAT_DIR, 'bestelluebersicht'), { recursive: true });
  fs.writeFileSync(path.join(PRIVAT_DIR, 'bestelluebersicht', 'orders.json'), JSON.stringify({ orders: [ORDER] }));
  const { handleApi } = await import('../../../scripts/serve-dashboard.mjs');
  const ruf = async (pfad, { method = 'GET', host = 'localhost:8001', benutzer = null } = {}) => {
    const res = { code: null, body: null, writeHead(c) { this.code = c; return this; }, end(b) { this.body = b; }, setHeader() {}, getHeader() { return null; } };
    await handleApi({ method, url: pfad, headers: { host } }, res, pfad.split('?')[0], benutzer);
    return { code: res.code, json: res.body ? JSON.parse(res.body) : null };
  };
  const lesen = { name: 'Lea', kuerzel: 'lea', rolle: 'lesen' };
  const ben = { name: 'Ben', kuerzel: 'ben', rolle: 'mitarbeiter' };

  for (const benutzer of [null, lesen, ben]) {
    const l = await ruf('/api/einkauf/lieferanten', { benutzer });
    assert.equal(l.code, 200);
    assert.equal(l.json.lieferanten[0].id, 'A');
    assert.equal((await ruf('/api/einkauf/lieferant?id=A', { benutzer })).json.lieferant.id, 'A');
    const m = await ruf('/api/einkauf/bestellmail?lieferant=A&art=ware&gruppe=A%7CSUPPLIER_TO_TP%7CTP', { benutzer });
    assert.equal(m.code, 200);
    assert.equal(m.json.mails.length, 1);
  }
  assert.equal((await ruf('/api/einkauf/lieferant')).code, 400);
  assert.equal((await ruf('/api/einkauf/lieferant?id=Z')).code, 404);
  assert.equal((await ruf('/api/einkauf/bestellmail?lieferant=A&art=muster&ziel=mond')).code, 400);
  for (const pfad of ['/api/einkauf/lieferanten', '/api/einkauf/lieferant?id=A', '/api/einkauf/bestellmail?lieferant=A']) {
    assert.equal((await ruf(pfad, { method: 'POST' })).code, 405, `${pfad} muss GET-only sein`);
    assert.equal((await ruf(pfad, { host: 'boese.example' })).code, 403, `${pfad} muss fremde Hosts abweisen`);
  }
});
