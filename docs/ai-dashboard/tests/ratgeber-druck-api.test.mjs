import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';
import { PRIVAT_DIR } from './_testumgebung.mjs';
import { ratgeberKnopf } from '../ansichten/kunden/gemeinsam.mjs';

// Kurz-Ratgeber zum Beilegen: Zuordnung am Bestellmodell, PDF ueber /api/kunden/ratgeber-druck.
// Chromium laeuft hier nicht - der Test reicht einen Ersatz-Drucker herein.
const WARE = 'gid://shopify/Order/9701';
const NUR_MUSTER = 'gid://shopify/Order/9702';
const A = (o) => Object.entries(o).map(([key, value]) => ({ key, value }));
const zeile = (n, title, productType, attrs = {}, extra = {}) => ({
  id: `gid://shopify/LineItem/97${n}`, title, sku: `TEST-${n}`, variantTitle: 'Default Title', quantity: 1,
  customAttributes: A(attrs), variant: { product: { productType } }, ...extra,
});
const bestellung = (id, name, nodes) => ({ id, name, createdAt: '2026-10-26T09:15:00Z', displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', lineItems: { nodes } });

function umgebung() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-ratgeber-druck-'));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  fs.writeFileSync(path.join(dir, 'bestelluebersicht/orders.json'), JSON.stringify({ orders: [
    bestellung(WARE, '#ATTRAPPE-1', [
      zeile(1, 'Testvelours Teppich nach Maß', 'Teppich nach Maß', { Farbe: 'Sand (14)', 'Maße': '200 × 300 cm' }),
      zeile(2, 'Muster Testboden', 'Teppichboden', {}, { sku: 'M-TEST_2' }),
    ]),
    bestellung(NUR_MUSTER, '#ATTRAPPE-2', [zeile(3, 'Muster Testboden', 'Teppichboden', {}, { sku: 'M-TEST_3' })]),
  ] }));
  const gedruckt = [];
  const api = createApi({
    root: dir, privatDirPath: dir, env: {}, gh: async () => '',
    shopifyZugang: async () => { throw new Error('Shopify darf nicht aufgerufen werden'); },
    ratgeberPdf: async (html) => { gedruckt.push(html); return Buffer.from('%PDF-attrappe'); },
  });
  return { dir, api, gedruckt };
}

test('Bestellliste kennt den passenden Ratgeber; Muster allein bekommen keinen', () => {
  const { api } = umgebung();
  const zeilen = api.kundenBestellungen().zeilen;
  assert.deepEqual(zeilen.find((z) => z.orderId === WARE).auftrag.ratgeber, ['Teppich']);
  assert.deepEqual(zeilen.find((z) => z.orderId === NUR_MUSTER).auftrag.ratgeber, []);
});

test('PDF: Bestellnummer und Mass stehen drin, Dateiname ohne #; sonst 400/404 mit Klartext', async () => {
  const { api, gedruckt } = umgebung();
  const pdf = await api.kundenRatgeberDruck({ orderId: WARE });
  assert.equal(pdf.typ, 'application/pdf');
  assert.equal(pdf.name, 'Ratgeber ATTRAPPE-1.pdf');
  assert.equal(String(pdf.inhalt), '%PDF-attrappe');
  assert.match(gedruckt[0], /<b>#ATTRAPPE-1<\/b>/);
  assert.match(gedruckt[0], /200 × 300 cm/);
  assert.doesNotMatch(gedruckt[0], /Muster Testboden/);
  await assert.rejects(api.kundenRatgeberDruck({ orderId: NUR_MUSTER }), (e) => e.status === 404 && /nur Muster oder Zubehör/.test(e.message));
  await assert.rejects(api.kundenRatgeberDruck({ orderId: 'gid://shopify/Order/1' }), (e) => e.status === 404);
  await assert.rejects(api.kundenRatgeberDruck({}), (e) => e.status === 400);
  assert.equal(gedruckt.length, 1, 'ohne passenden Ratgeber startet kein Druck');
});

test('Knopf nur mit Ratgeber; Bestellkennung sauber im Link', () => {
  assert.equal(ratgeberKnopf({ ratgeber: [] }, WARE), '');
  assert.equal(ratgeberKnopf(null, WARE), '');
  const knopf = ratgeberKnopf({ id: WARE, ratgeber: ['Teppich', 'Klickvinyl'] });
  assert.match(knopf, /href="\/api\/kunden\/ratgeber-druck\?orderId=gid%3A%2F%2Fshopify%2FOrder%2F9701"/);
  assert.match(knopf, /target="_blank"/);
  assert.match(knopf, /Ratgeber Teppich, Klickvinyl zum Beilegen/);
});

test('HTTP: Route bekannt, nur GET, Fehler als Klartext statt Absturz', async (t) => {
  const { dir } = umgebung();
  process.env.TP_PRIVAT_DIR = dir;
  const { requestHandler } = await import('../../../scripts/serve-dashboard.mjs?case=ratgeber-druck');
  t.after(() => { process.env.TP_PRIVAT_DIR = PRIVAT_DIR; });
  const server = http.createServer(requestHandler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const url = (orderId) => `http://127.0.0.1:${server.address().port}/api/kunden/ratgeber-druck?${new URLSearchParams({ orderId })}`;
  const muster = await fetch(url(NUR_MUSTER));
  assert.equal(muster.status, 404);
  assert.match((await muster.json()).error, /keinen Ratgeber/);
  assert.equal((await fetch(url(''))).status, 400);
  assert.equal((await fetch(url(WARE), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 405);
});
