import { PRIVAT_DIR } from './_testumgebung.mjs'; // vor Server-Imports
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApi } from '../../../scripts/dashboard-api.mjs';

const OID = 'gid://shopify/Order/701';
const LI = n => `gid://shopify/LineItem/${n}`;
const person = { name: 'Vorbereitung', rolle: 'mitarbeiter' };
const quelle = { id: 'gid://shopify/ProductVariant/100', sku: 'ORIG-B', title: 'Sand', metafields: { nodes: [] }, product: { id: 'gid://shopify/Product/100', handle: 'testlinea-sand', title: 'Testlinea Sand – Klickvinyl', productType: 'Klickvinyl', metafields: { nodes: [] } } };
const muster = (id, menge) => ({ id: LI(id), sku: 'M-ALTE-CARRIER-SKU', title: 'Muster alte Bezeichnung', variantTitle: 'Sand', quantity: menge, currentQuantity: menge, unfulfilledQuantity: menge,
  customAttributes: [{ key: '_Quellvariante_ID', value: '100' }], originalUnitPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } },
  variant: { id: `gid://shopify/ProductVariant/9${id}`, sku: 'M-ALTE-CARRIER-SKU', title: 'Sand', metafields: { nodes: [] }, product: { handle: 'muster-anderer-artikel', title: 'Muster alter Artikel', productType: 'Musterservice', metafields: { nodes: [] } } } });

function umgebung(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-bestellungs-etiketten-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  fs.mkdirSync(path.join(dir, 'lexikon'));
  const order = { id: OID, name: '#T701', createdAt: '2026-10-20T06:00:00Z', cancelledAt: null, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', tags: [], customAttributes: [],
    customer: { id: 'gid://shopify/Customer/700', displayName: 'KUNDEN-SENTINEL', email: 'sentinel@example.invalid' },
    totalPriceSet: { shopMoney: { amount: '0', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: [muster(1, 2), muster(2, 1)] } };
  const produkte = [{ handle: 'testlinea-sand', titel: 'Testlinea Sand – Klickvinyl', eigenschaften: { marke: 'Testlinea', qmProPaket: '2', gesamtstaerke: '5 mm' }, varianten: [{ id: quelle.id, sku: quelle.sku, farbe: 'Sand', titel: 'Sand' }] }];
  const exportieren = () => {
    fs.writeFileSync(path.join(dir, 'bestelluebersicht/orders.json'), JSON.stringify({ orders: [order], quellvarianten: [quelle] }));
    fs.writeFileSync(path.join(dir, 'lexikon/produkte.json'), JSON.stringify({ produkte }));
  };
  exportieren();
  const verboten = () => assert.fail('Interne Etikettenzuordnung darf keine externen Werkzeuge oder Fachsysteme aufrufen');
  const api = createApi({ root: dir, privatDirPath: dir, gh: verboten, rebuild: verboten, shopifyZugang: verboten });
  const vormerken = extras => api.kundenMusteretikettenVormerken({ orderId: OID, vorgangId: randomUUID(), ...extras }, person);
  const queue = () => api.lexikonDruckliste();
  return { dir, order, produkte, api, vormerken, queue, exportieren };
}

test('Interne Zuordnung liest ohne Abgleich/Schreiben und priorisiert Quell-ID vor alter Muster-SKU', t => {
  const u = umgebung(t);
  const vorher = fs.readFileSync(path.join(u.dir, 'bestelluebersicht/orders.json'), 'utf8');
  const plan = u.api.kundenMusteretiketten(OID);
  assert.equal(plan.intern, true);
  assert.equal(plan.gesperrt, null);
  assert.deepEqual(plan.zeilen.map(z => [z.lineItemId, z.anzahl, z.bestellmenge, z.vormerkstatus]), [[LI(1), 2, 2, 'nicht_vorgemerkt'], [LI(2), 1, 1, 'nicht_vorgemerkt']]);
  assert.ok(plan.zeilen.every(z => z.etikett.sku === 'ORIG-B' && !z.fehlt.length));
  assert.equal(fs.readFileSync(path.join(u.dir, 'bestelluebersicht/orders.json'), 'utf8'), vorher);
  assert.equal(fs.existsSync(path.join(u.dir, 'muster-druckliste.json')), false);
  assert.equal(fs.existsSync(path.join(u.dir, 'auftragsstatus.json')), false, 'GET schreibt keinen Shopify-Statusabgleich');
  assert.doesNotMatch(JSON.stringify(plan), /KUNDEN-SENTINEL|sentinel@example/);
  assert.doesNotMatch(JSON.stringify(plan.zeilen.map(z => z.etikett)), /T701|Order|LineItem|KUNDEN/);
});

test('Vormerken aus zwei Sitzungen bleibt einmal pro Position; gefaelschte Browserangaben werden ignoriert', async t => {
  const u = umgebung(t), vorgangId = randomUUID();
  const result = await u.vormerken({ vorgangId, etikett: { sku: 'FALSCH' }, anzahl: 20, orderName: 'FALSCH', actor: 'FALSCH' });
  assert.deepEqual(result.vormerkung, { neu: 2, bereits: 0 });
  assert.deepEqual((await u.vormerken({ vorgangId })).vormerkung, { neu: 0, bereits: 2 });
  assert.deepEqual((await u.vormerken()).vormerkung, { neu: 0, bereits: 2 });
  const andereSitzung = createApi({ privatDirPath: u.dir });
  await andereSitzung.kundenMusteretikettenVormerken({ orderId: OID, vorgangId: randomUUID() }, { name: 'Laden', rolle: 'mitarbeiter' });
  assert.equal(u.queue().eintraege.length, 2);
  assert.deepEqual(u.queue().eintraege.map(e => e.anzahl).sort(), [1, 2]);
  assert.ok(u.queue().eintraege.every(e => e.erstelltVon === 'Vorbereitung' && e.quelle.orderName === '#T701'));
  assert.doesNotMatch(JSON.stringify(u.queue()), /FALSCH|KUNDEN-SENTINEL|sentinel@example/);
});

test('Stabile Bestellmenge verhindert Wiederholung nach Teilversand; Tombstone bleibt nachvollziehbar', async t => {
  const u = umgebung(t);
  await u.vormerken();
  const e = u.queue().eintraege.find(e => e.quelle.lineItemId === LI(1));
  await u.api.lexikonDrucklisteSetzen({ aktion: 'entfernen', vorgangId: randomUUID(), eintraege: [{ id: e.id, revision: e.revision }] }, person);
  u.order.lineItems.nodes[0].unfulfilledQuantity = 1;
  u.exportieren();
  assert.equal(u.api.kundenMusteretiketten(OID).zeilen[0].vormerkstatus, 'entfernt');
  await u.vormerken();
  assert.equal(u.queue().eintraege.length, 2);
  assert.equal(u.queue().eintraege.find(x => x.id === e.id).status, 'entfernt');
});

test('Mengen-/Artikeldrift laesst reservierte Auftraege unveraendert und blockiert neuen Druck', async t => {
  const u = umgebung(t);
  await u.vormerken();
  let e = u.queue().eintraege.find(e => e.quelle.lineItemId === LI(1));
  await u.api.lexikonDrucklisteSetzen({ aktion: 'reservieren', vorgangId: randomUUID(), druckauftragId: randomUUID(), eintraege: [{ id: e.id, revision: e.revision }] }, person);
  const vorher = fs.readFileSync(path.join(u.dir, 'muster-druckliste.json'), 'utf8');
  u.order.lineItems.nodes[0].currentQuantity = 3;
  u.exportieren();
  assert.equal(u.api.kundenMusteretiketten(OID).zeilen[0].vormerkstatus, 'geaendert');
  await assert.rejects(u.vormerken(), err => err.status === 409);
  assert.equal(fs.readFileSync(path.join(u.dir, 'muster-druckliste.json'), 'utf8'), vorher);
  const anderes = u.queue().eintraege.find(e => e.quelle.lineItemId === LI(2));
  u.produkte[0].varianten[0].farbe = 'Grau';
  u.exportieren();
  await assert.rejects(u.api.lexikonDrucklisteSetzen({ aktion: 'reservieren', vorgangId: randomUUID(), druckauftragId: randomUUID(), eintraege: [{ id: anderes.id, revision: anderes.revision }] }, person), err => err.status === 409);
  assert.equal(fs.readFileSync(path.join(u.dir, 'muster-druckliste.json'), 'utf8'), vorher);
});

test('Reservierung prueft Bestellstatus und Produktdaten auch bei grossgeschriebenen UUIDs', async t => {
  for (const fall of ['unveraendert', 'storniert', 'erfuellt', 'farbe']) {
    const u = umgebung(t);
    await u.vormerken();
    const e = u.queue().eintraege[0];
    const vorher = fs.readFileSync(path.join(u.dir, 'muster-druckliste.json'), 'utf8');
    if (fall === 'storniert') u.order.cancelledAt = '2026-10-20T06:10:00Z';
    if (fall === 'erfuellt') u.order.displayFulfillmentStatus = 'FULFILLED';
    if (fall === 'farbe') u.produkte[0].varianten[0].farbe = 'Grau';
    u.exportieren();
    const reservieren = () => u.api.lexikonDrucklisteSetzen({ aktion: 'reservieren', vorgangId: randomUUID(), druckauftragId: randomUUID(), eintraege: [{ id: e.id.toUpperCase(), revision: e.revision }] }, person);
    if (fall === 'unveraendert') {
      await reservieren();
      assert.equal(u.queue().eintraege.find(x => x.id === e.id).status, 'in_druck');
    } else {
      await assert.rejects(reservieren(), err => err.status === 409, fall);
      assert.equal(fs.readFileSync(path.join(u.dir, 'muster-druckliste.json'), 'utf8'), vorher, fall);
    }
  }
});

test('Storniert/erfuellt/lokal raus sperrt neue Vormerkung, Lieferantengeliefert bleibt vorbereitbar', async t => {
  const u = umgebung(t);
  for (const status of ['storniert', 'erfuellt']) {
    u.order.cancelledAt = status === 'storniert' ? '2026-10-20T06:10:00Z' : null;
    u.order.displayFulfillmentStatus = status === 'erfuellt' ? 'FULFILLED' : 'UNFULFILLED';
    u.exportieren();
    assert.ok(u.api.kundenMusteretiketten(OID).gesperrt);
    await assert.rejects(u.vormerken(), e => e.status === 409);
  }
  u.order.cancelledAt = null; u.order.displayFulfillmentStatus = 'UNFULFILLED'; u.exportieren();
  const statuses = status => ({ version: 1, positionen: Object.fromEntries([1, 2].map(n => [`${OID}::${LI(n)}`, { orderId: OID, lineItemId: LI(n), status }])) });
  fs.writeFileSync(path.join(u.dir, 'auftragsstatus.json'), JSON.stringify(statuses('geliefert')));
  assert.equal(u.api.kundenMusteretiketten(OID).gesperrt, null);
  fs.writeFileSync(path.join(u.dir, 'auftragsstatus.json'), JSON.stringify(statuses('raus')));
  assert.ok(u.api.kundenMusteretiketten(OID).gesperrt);
});

test('HTTP-Privatsphaere: Anmeldung, nur lesen, gleiche Herkunft und kein statischer Datenzugang', async t => {
  const u = umgebung(t);
  const { benutzerAnlegen, schreibeBenutzer } = await import('../../../operations/lib/benutzer.mjs');
  let benutzer = [];
  for (const rolle of ['mitarbeiter', 'lesen']) benutzer = benutzerAnlegen(benutzer, { name: rolle, kuerzel: rolle, rolle, passwort: `test-musteretiketten-${rolle}` });
  schreibeBenutzer(benutzer, path.join(u.dir, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = u.dir;
  const { requestHandler } = await import('../../../scripts/serve-dashboard.mjs?case=bestellungs-musteretiketten');
  t.after(() => { process.env.TP_PRIVAT_DIR = PRIVAT_DIR; });
  const server = http.createServer(requestHandler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`, endpoint = `${base}/api/kunden/musteretiketten`;
  const getUrl = `${endpoint}?${new URLSearchParams({ orderId: OID })}`;
  const unauth = await fetch(getUrl);
  assert.equal(unauth.status, 401);
  assert.match(unauth.headers.get('cache-control'), /no-store/);
  const cookies = {};
  for (const rolle of ['mitarbeiter', 'lesen']) {
    const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: rolle, passwort: `test-musteretiketten-${rolle}` }) });
    cookies[rolle] = r.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(getUrl, { headers: { cookie: cookies[rolle] } })).status, 200);
  }
  const post = (rolle, extras = {}) => fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookies[rolle], origin: base, ...extras }, body: JSON.stringify({ orderId: OID, vorgangId: randomUUID() }) });
  assert.equal((await post('lesen')).status, 403);
  assert.equal((await post('mitarbeiter', { origin: 'https://fremd.example' })).status, 403);
  assert.equal((await post('mitarbeiter', { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await fetch(endpoint, { method: 'PUT', headers: { cookie: cookies.mitarbeiter } })).status, 405);
  assert.equal((await post('mitarbeiter')).status, 200);
  for (const p of ['/muster-druckliste.json', '/bestelluebersicht/orders.json']) {
    assert.equal((await fetch(`${base}${p}`, { headers: { cookie: cookies.mitarbeiter } })).status, 404);
  }
});
