// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner und kein echter Shopify-Zugang (siehe _testumgebung.mjs).
import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi, ApiError } from '../../../scripts/dashboard-api.mjs';
import { protokollPfad, letzteEintraege } from '../../../operations/lib/protokoll.mjs';
import { versandAttrappe, fo, li, BESTELLUNG } from '../../../operations/tests/versand-attrappe.mjs';

// Zwei-Wege-Abgleich Control Center <-> Shopify (Inhaber 2026-10-19). Nur erfundene Daten:
// Bestellung #T5001 mit zwei Artikeln Ware und einem Kettelservice, Testkunde.
// Die Attrappe fuehrt die Fulfillment Orders; orders.json ist der Export des Sync-Dienstes.

const ware = (n, { offen = 1, typ = 'Teppichboden', sku = `TEST-${n}` } = {}) => ({
  id: li(n), sku, title: `Testartikel ${n}`, variantTitle: 'Grau', quantity: 1, currentQuantity: 1, unfulfilledQuantity: offen,
  customAttributes: [], originalUnitPriceSet: { shopMoney: { amount: '10.00', currencyCode: 'EUR' } },
  variant: { id: `gid://shopify/ProductVariant/${n}`, sku, title: 'Grau', metafields: { nodes: [] }, lieferant: { nodes: [] },
    product: { id: `gid://shopify/Product/${n}`, handle: `testartikel-${n}`, title: `Testartikel ${n}`, productType: typ, metafields: { nodes: [] }, grosshandel: { nodes: [] } } },
});
const kettel = n => ({ ...ware(n, { typ: 'Service', sku: 'KETTELSERVICE' }), title: 'Kettelservice', variant: { ...ware(n).variant, sku: 'KETTELSERVICE', product: { ...ware(n).variant.product, handle: 'kettelservice', title: 'Kettelservice', productType: 'Service' } } });
const bestellung = (id, zeilen, { tags = [], status = 'UNFULFILLED', storniert = null } = {}) => ({
  id, name: `#T${id.split('/').pop()}`, createdAt: '2026-10-10T10:00:00Z', cancelledAt: storniert, tags,
  displayFinancialStatus: 'PAID', displayFulfillmentStatus: status, customAttributes: [],
  customer: { id: 'gid://shopify/Customer/1', displayName: 'Testkunde', email: 'testkunde@example.invalid', phone: null },
  totalPriceSet: { shopMoney: { amount: '20.00', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: zeilen },
});
const TEST = 'gid://shopify/Order/5002';
const ICH = { name: 'Mitarbeiter 1', rolle: 'mitarbeiter' };
const JETZT = '2026-10-19T10:00:00Z';

function umgebung({ attrappe = versandAttrappe({ fos: [fo('1', [{ n: 1 }, { n: 2 }, { n: 3 }])] }), zeilen = [ware(1), ware(2), kettel(3)], status = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-abgleich-'));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
  const exportiere = (orders, exportiertAm = '2026-10-19T09:55:00Z') => fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ exportiertAm, orders }));
  exportiere([bestellung(BESTELLUNG, zeilen), bestellung(TEST, [ware(7)], { tags: ['TESTBESTELLUNG'] })]);
  if (Object.keys(status).length) fs.writeFileSync(path.join(dir, 'auftragsstatus.json'), JSON.stringify({ version: 1, positionen: status }));
  const z = { attrappe };
  const api = createApi({ gh: async () => '', root: dir, privatDirPath: dir, now: () => new Date(JETZT),
    shopifyZugang: async () => ({ proxy: z.attrappe.proxy, art: 'client-credentials', scope: 'read_orders' }) });
  const setze = (payload, wer = ICH) => api.einkaufAuftragsstatusSetzen(payload, wer);
  const stand = () => api.einkaufAuftragsstatus().positionen;
  const eintrag = (n, o = BESTELLUNG) => stand()[`${o}::${li(n)}`];
  const datei = () => fs.readFileSync(path.join(dir, 'auftragsstatus.json'), 'utf8');
  return { dir, api, z, setze, stand, eintrag, exportiere, datei };
}
const pos = (n, status, extra = {}) => ({ [`${BESTELLUNG}::${li(n)}`]: { orderId: BESTELLUNG, lineItemId: li(n), status, [`${status}Am`]: '2026-10-12T10:00:00Z', ...extra } });

test('Shopify -> Dashboard: in Shopify versendet, lokal "bestellt" - beim Einlesen auf "raus", protokolliert, ohne Shopify-Aufruf, einmal', async () => {
  const u = umgebung({ zeilen: [ware(1, { offen: 0 }), ware(2)], status: { ...pos(1, 'bestellt'), ...pos(2, 'bestellt') } });
  const e = u.eintrag(1);
  assert.equal(e.status, 'raus');
  assert.equal(e.rausNotiz, 'aus Shopify übernommen');
  assert.equal(e.ausShopify.am, new Date(JETZT).toISOString());
  assert.equal(u.eintrag(2).status, 'bestellt', 'in Shopify noch offen: bleibt');
  assert.equal(u.z.attrappe.aufrufe.length, 0, 'Lesen fragt Shopify nie');
  const zeile = letzteEintraege(protokollPfad(), 5).find(x => x.aktion === 'Aus Shopify übernommen');
  assert.match(zeile.objekt, /#T5001: 1 Artikel → An Kunden raus/);
  assert.equal(zeile.benutzer, 'Shopify');
  const vorher = u.datei();
  u.api.einkaufBestellungen(); u.api.kundenBestellungen(); u.api.shopifyAbgleich();
  assert.equal(u.datei(), vorher, 'derselbe Export wird nicht noch einmal angewandt');
});

test('Shopify -> Dashboard: "Zurück auf offen" nach der Sendung gilt - der naechste Export hebt nicht wieder an', async () => {
  const u = umgebung({ zeilen: [ware(1, { offen: 0 }), ware(2)], status: pos(1, 'bestellt') });
  assert.equal(u.eintrag(1).status, 'raus');
  await u.setze({ aktion: 'zurueckAufOffen', positionen: [{ orderId: BESTELLUNG, lineItemId: li(1) }] });
  // Neuer Export mit demselben Shopify-Stand (anderer Zeitpunkt).
  u.exportiere([bestellung(BESTELLUNG, [ware(1, { offen: 0 }), ware(2)], { status: 'PARTIALLY_FULFILLED' })], '2026-10-19T10:05:00Z');
  assert.equal(u.eintrag(1).status, null);
  assert.equal(u.z.attrappe.aufrufe.length, 0, 'Ruecknahme storniert in Shopify nichts');
});

test('Stornierte Bestellung: begonnene Positionen lokal erledigt, keine Abweichung, kein Shopify-Aufruf', async () => {
  const u = umgebung({ status: { ...pos(1, 'bestellt'), ...pos(2, 'erledigt') } });
  u.exportiere([bestellung(BESTELLUNG, [ware(1), ware(2), kettel(3)], { storniert: '2026-10-18T08:00:00Z' })]);
  assert.equal(u.eintrag(1).status, 'erledigt');
  assert.match(u.eintrag(1).erledigtNotiz, /storniert/);
  assert.equal(u.api.einkaufShopifyAbgleich().abweichungen.length, 0);
  assert.equal(u.z.attrappe.aufrufe.length, 0);
});

test('Dashboard -> Shopify: "Erledigt" (Zeitleiste) bucht ohne Kundenmail; die letzte Ware nimmt den Kettelservice mit', async () => {
  const u = umgebung({ status: { ...pos(1, 'geliefert'), ...pos(2, 'geliefert') } });
  const r = await u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'erledigt' });
  assert.equal(r.shopify.status, 'gebucht');
  assert.equal(r.shopify.kundeBenachrichtigt, false);
  assert.match(r.shopify.meldung, /ohne Mail an den Kunden/);
  const buchung = u.z.attrappe.buchungen();
  assert.equal(buchung.length, 1, 'eine Buchung fuer die ganze Bestellung');
  assert.equal(buchung[0].variables.fulfillment.notifyCustomer, false);
  assert.deepEqual(buchung[0].variables.fulfillment.lineItemsByFulfillmentOrder[0].fulfillmentOrderLineItems.map(x => x.id).sort(),
    ['gid://shopify/FulfillmentOrderLineItem/11', 'gid://shopify/FulfillmentOrderLineItem/12', 'gid://shopify/FulfillmentOrderLineItem/13']);
  assert.deepEqual([u.eintrag(1).shopifyVersand.status, u.eintrag(2).shopifyVersand.status], ['gebucht', 'gebucht']);
  assert.equal(u.eintrag(1).versandMail, false);
  // Zweiter Klick: nichts mehr zu buchen.
  await u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'erledigt' });
  assert.equal(u.z.attrappe.buchungen().length, 1);
});

test('Dashboard -> Shopify: Teil erledigt, Ware noch offen - Kettelservice bleibt; schon versendet heisst "bereits", nichts geschrieben', async () => {
  const u = umgebung({ status: pos(1, 'geliefert') });
  const r = await u.setze({ orderId: BESTELLUNG, lineItemId: li(1), status: 'erledigt' });
  assert.equal(r.shopify.status, 'gebucht');
  assert.deepEqual(u.z.attrappe.buchungen()[0].variables.fulfillment.lineItemsByFulfillmentOrder[0].fulfillmentOrderLineItems.map(x => x.id), ['gid://shopify/FulfillmentOrderLineItem/11']);
  assert.equal(r.eintrag.shopifyVersand.status, 'gebucht', 'die Antwort traegt den neuen Vermerk');

  const v = umgebung({ attrappe: versandAttrappe({ fos: [fo('1', [{ n: 1, offen: 0 }, { n: 2 }, { n: 3 }], { status: 'IN_PROGRESS' })] }), status: pos(1, 'raus') });
  const b = await v.setze({ orderId: BESTELLUNG, lineItemId: li(1), status: 'erledigt' });
  assert.equal(b.shopify.status, 'bereits');
  assert.equal(v.z.attrappe.schreibend().length, 0);
});

test('Dashboard -> Shopify: "Ohne Einkauf abschließen"/"Kunde fertig" bucht einmal fuer alle Artikel; Testbestellung nie', async () => {
  const u = umgebung();
  const r = await u.api.kundenBestellungFertig({ orderId: BESTELLUNG, lineItemIds: [li(1), li(2)], notiz: 'anders erledigt' }, ICH);
  assert.equal(r.anzahl, 2);
  assert.equal(r.shopify.status, 'gebucht');
  assert.equal(u.z.attrappe.buchungen().length, 1);
  assert.equal(u.z.attrappe.buchungen()[0].variables.fulfillment.notifyCustomer, false);
  assert.ok(Array.isArray(r.eintraege) && r.eintraege.every(e => e.shopifyVersand?.status === 'gebucht'));

  const t = await u.api.kundenBestellungFertig({ orderId: TEST, lineItemIds: [li(7)], notiz: 'Testbestellung' }, ICH);
  assert.equal(t.shopify.status, 'uebersprungen');
  assert.equal(u.z.attrappe.buchungen().length, 1, 'Testbestellung bucht nichts');
});

test('Muster: Ergebnis "kein Interesse" schliesst ab und bucht ohne Mail', async () => {
  const muster = n => ware(n, { typ: 'Musterservice', sku: `M-TEST-${n}` });
  const u = umgebung({ attrappe: versandAttrappe({ fos: [fo('1', [{ n: 1 }, { n: 2 }])] }), zeilen: [muster(1), muster(2)], status: { ...pos(1, 'raus', { shopifyVersand: { status: 'gebucht', am: '2026-10-12T10:00:00Z' } }), ...pos(2, 'geliefert') } });
  const r = await u.setze({ aktion: 'schritt', orderId: BESTELLUNG, schritt: 'kein_interesse' });
  assert.equal(r.shopify.status, 'gebucht');
  assert.deepEqual(u.z.attrappe.buchungen()[0].variables.fulfillment.lineItemsByFulfillmentOrder[0].fulfillmentOrderLineItems.map(x => x.id), ['gid://shopify/FulfillmentOrderLineItem/12'], 'nur das noch nicht gebuchte Muster');
  assert.equal(u.z.attrappe.buchungen()[0].variables.fulfillment.notifyCustomer, false);
});

test('Ruecknahme ("Wieder öffnen", "Zurück auf offen") fragt Shopify nie', async () => {
  const u = umgebung({ status: { ...pos(1, 'erledigt', { shopifyVersand: { status: 'gebucht', am: '2026-10-12T10:00:00Z' } }), ...pos(2, 'raus') } });
  await u.setze({ orderId: BESTELLUNG, lineItemId: li(1), aktion: 'wiederOeffnen' });
  await u.setze({ aktion: 'zurueckAufOffen', positionen: [{ orderId: BESTELLUNG, lineItemId: li(2) }] });
  assert.equal(u.z.attrappe.aufrufe.length, 0);
});

test('Abweichungsliste: Zahl = Zeilen; "In Shopify nachbuchen" bucht ohne Mail, danach 0; Leser duerfen nicht buchen', async () => {
  // Altfall vor dem 13.10.: raus ohne Vermerk; und eine "erledigt"-Position, deren Buchung scheiterte.
  const u = umgebung({ status: { ...pos(1, 'raus'), ...pos(2, 'erledigt', { shopifyVersand: { status: 'fehler', grund: 'recht-fehlt', am: '2026-10-12T10:00:00Z' } }) } });
  const a = u.api.einkaufShopifyAbgleich();
  assert.equal(a.verfuegbar, true);
  assert.equal(a.abweichungen.length, 1);
  assert.deepEqual(a.abweichungen[0].lineItemIds, [li(1), li(2)]);
  assert.equal(a.abweichungen[0].orderName, '#T5001');
  assert.equal(a.abweichungen[0].positionen[0].titel, 'Testartikel 1');
  await assert.rejects(() => u.setze({ aktion: 'shopifyNachbuchen', orderId: BESTELLUNG }, { name: 'Leser', rolle: 'lesen' }), e => e instanceof ApiError && e.status === 403);
  assert.equal(u.z.attrappe.aufrufe.length, 0);
  const r = await u.setze({ aktion: 'shopifyNachbuchen', orderId: BESTELLUNG });
  assert.equal(r.shopify.status, 'gebucht');
  assert.equal(r.abweichungen, 0);
  assert.equal(u.z.attrappe.buchungen().length, 1);
  assert.equal(u.z.attrappe.buchungen()[0].variables.fulfillment.notifyCustomer, false);
  assert.equal(u.api.einkaufShopifyAbgleich().abweichungen.length, 0);
  await assert.rejects(() => u.setze({ aktion: 'shopifyNachbuchen', orderId: BESTELLUNG }), e => e instanceof ApiError && e.status === 409);
  // Naechster Export zeigt die Bestellung versendet: der Abgleich bestaetigt, nichts weicht ab.
  u.exportiere([bestellung(BESTELLUNG, [ware(1, { offen: 0 }), ware(2, { offen: 0 }), kettel(3)], { status: 'PARTIALLY_FULFILLED' })], '2026-10-19T10:15:00Z');
  assert.equal(u.api.einkaufShopifyAbgleich().abweichungen.length, 0);
});

test('Beschaedigte Ablage: der Abgleich schreibt nichts, die Liste meldet den Fehler statt "alles gleich"', async () => {
  const u = umgebung({ zeilen: [ware(1, { offen: 0 })] });
  fs.writeFileSync(path.join(u.dir, 'auftragsstatus.json'), '{ kaputt');
  const a = u.api.einkaufShopifyAbgleich();
  assert.match(a.fehler, /beschädigt/);
  assert.equal(fs.readFileSync(path.join(u.dir, 'auftragsstatus.json'), 'utf8'), '{ kaputt');
});

test('Rollen: Abgleich lesen duerfen alle, Nachbuchen ist ein Schreibpfad (Rolle "lesen" 403)', async () => {
  const { handleApi } = await import('../../../scripts/serve-dashboard.mjs');
  const antwort = () => ({ code: null, body: null, writeHead(c) { this.code = c; return this; }, end(b) { this.body = b; }, setHeader() {}, getHeader() { return null; } });
  const anfrage = (pfad, method = 'GET') => ({ method, url: pfad, headers: { host: 'localhost:8001' } });
  const leser = { name: 'Leser', kuerzel: 'leser', rolle: 'lesen' };
  let res = antwort();
  await handleApi(anfrage('/api/einkauf/shopify-abgleich'), res, '/api/einkauf/shopify-abgleich', leser);
  assert.equal(res.code, 200);
  res = antwort();
  await handleApi(anfrage('/api/einkauf/auftragsstatus', 'POST'), res, '/api/einkauf/auftragsstatus', leser);
  assert.equal(res.code, 403);
});
