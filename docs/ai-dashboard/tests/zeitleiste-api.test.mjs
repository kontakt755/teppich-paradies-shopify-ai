// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner (siehe _testumgebung.mjs).
import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi, ApiError } from '../../../scripts/dashboard-api.mjs';

// Nur synthetische Daten: Pseudonym-Lieferant A, erfundene Kunden.
const mf = (namespace, key, value) => ({ namespace, key, value });
const ware = id => ({
  id: `gid://shopify/LineItem/${id}`, sku: `TEST-A-${id}`, title: 'Testdiele Eiche', variantTitle: 'Natur', quantity: 2, currentQuantity: 2, unfulfilledQuantity: 2,
  customAttributes: [], originalUnitPriceSet: { shopMoney: { amount: '10.00', currencyCode: 'EUR' } },
  variant: { id: `gid://shopify/ProductVariant/${id}`, sku: `TEST-A-${id}`, title: 'Natur',
    metafields: { nodes: [mf('einkauf', 'lieferant', 'A'), mf('einkauf', 'artikelnummer', 'A-4711'), mf('einkauf', 'bestelleinheit', 'paket'), mf('einkauf', 'route', 'SUPPLIER_TO_TP')] },
    lieferant: { nodes: [] }, product: { id: 'gid://shopify/Product/1', handle: 'testdiele', title: 'Testdiele Eiche', metafields: { nodes: [mf('custom', 'qm_pro_paket', '2,2')] }, grosshandel: { nodes: [] } } },
});
const muster = id => ({
  id: `gid://shopify/LineItem/${id}`, sku: `M-TEST-${id}`, title: 'Muster Testteppich', variantTitle: 'Grau', quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
  customAttributes: [{ key: 'Produkt', value: 'Testteppich' }], originalUnitPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } },
  variant: { id: `gid://shopify/ProductVariant/9${id}`, sku: `M-TEST-${id}`, title: 'Grau', metafields: { nodes: [] }, lieferant: { nodes: [] },
    product: { id: 'gid://shopify/Product/9', handle: 'muster', title: 'Muster', productType: 'Musterservice', metafields: { nodes: [] }, grosshandel: { nodes: [] } } },
});
const bestellung = (nr, zeilen, { kunde = 1, datum = '2026-01-01T10:00:00Z' } = {}) => ({
  id: `gid://shopify/Order/${nr}`, name: `#T${nr}`, createdAt: datum, cancelledAt: null,
  displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [], tags: [],
  customer: { id: `gid://shopify/Customer/${kunde}`, displayName: `Testkunde ${kunde}`, email: `testkunde${kunde}@example.invalid`, phone: '+49 30 0000000' },
  totalPriceSet: { shopMoney: { amount: '20.00', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: zeilen },
});
const MUSTER = 'gid://shopify/Order/1';
const WARE = 'gid://shopify/Order/2';

function privat() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-zeitleiste-'));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ orders: [
    bestellung(1, [muster(1), muster(2)], { kunde: 1 }),
    bestellung(2, [ware(3)], { kunde: 2 }),
  ] }));
  return dir;
}
// Die Uhr laesst sich je Test weiterdrehen - Faelligkeiten haengen am Datum.
function umgebung() {
  const dir = privat();
  const uhr = { jetzt: new Date('2026-01-02T10:00:00Z') };
  const api = createApi({ gh: async () => '', root: dir, privatDirPath: dir, now: () => uhr.jetzt });
  const schritt = (orderId, s, extra = {}) => api.einkaufAuftragsstatusSetzen({ aktion: 'schritt', orderId, schritt: s, ...extra }, { name: 'Mitarbeiter 1', rolle: 'mitarbeiter' });
  const akte = () => api.kundenDetail({ key: 'email:testkunde1@example.invalid' }).kunde;
  return { dir, uhr, api, schritt, akte };
}

test('Lesen: Kundenakte, Bestellliste und Kundensuche tragen naechsterSchritt und verlauf (additiv)', () => {
  const { api, akte } = umgebung();
  const k = akte();
  const a = k.auftraege[0];
  assert.equal(a.auftragsart, 'muster');
  assert.deepEqual(a.verlauf.map(s => [s.schritt, s.zustand]), [['angefragt', 'erledigt'], ['bestellt', 'aktuell'], ['geliefert', 'offen'], ['raus', 'offen'], ['kunde_hat_muster', 'offen'], ['nachgefasst', 'offen'], ['ergebnis', 'offen']]);
  assert.deepEqual([a.naechsterSchritt.wer, a.naechsterSchritt.aktion, a.naechsterSchritt.stufe, a.naechsterSchritt.faelligSeitTagen], ['wir', 'bestellt', 'faellig', 1]);
  assert.deepEqual([k.naechsterSchritt.orderId, k.naechsterSchritt.orderName, k.naechsterSchritt.aktion], [MUSTER, '#T1', 'bestellt']);
  // Bisherige Felder unveraendert vorhanden.
  assert.equal(a.name, '#T1');
  assert.equal(k.fortschritt.fertig, false);

  const zeilen = api.kundenBestellungen().zeilen;
  const z = zeilen.find(x => x.orderId === WARE);
  assert.equal(z.auftragsart, 'ware');
  assert.deepEqual(z.verlauf.map(s => s.schritt), ['kunde_hat_bestellt', 'bestellt', 'geliefert', 'raus', 'erledigt']);
  assert.equal(z.naechsterSchritt.aktion, 'bestellt');
  assert.equal(z.fortschritt.stufe, 'offen');

  const treffer = api.kundenSuche({ q: '' }).treffer.find(t => t.key === 'email:testkunde1@example.invalid');
  assert.equal(treffer.naechsterSchritt.orderName, '#T1');
});

test('Schreiben: ganze Musterstrecke per Klick, wer/wann je Schritt, Positionsstatus bleibt die bestehende Datei', async () => {
  const { dir, uhr, api, schritt, akte } = umgebung();
  const r = await schritt(MUSTER, 'bestellt');
  assert.deepEqual([r.ok, r.positionen, r.naechsterSchritt.wer, r.naechsterSchritt.aktion], [true, 2, 'lieferant', 'geliefert']);
  // Bestehender Lese-Endpunkt sieht dieselben Werte wie nach zwei Einzelklicks im Einkauf.
  const pos = api.einkaufAuftragsstatus().positionen;
  assert.deepEqual(Object.values(pos).map(p => [p.status, p.bestelltVon]), [['bestellt', 'Mitarbeiter 1'], ['bestellt', 'Mitarbeiter 1']]);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'auftragsstatus.json'), 'utf8'))), ['version', 'positionen'], 'Dateiformat unveraendert');

  uhr.jetzt = new Date('2026-01-05T10:00:00Z');
  await schritt(MUSTER, 'geliefert');
  uhr.jetzt = new Date('2026-01-06T10:00:00Z');
  const raus = await schritt(MUSTER, 'raus');
  assert.deepEqual([raus.naechsterSchritt.wer, raus.naechsterSchritt.aktion], ['kunde', 'kunde_hat_muster']);

  uhr.jetzt = new Date('2026-01-08T10:00:00Z');
  await schritt(MUSTER, 'kunde_hat_muster');
  uhr.jetzt = new Date('2026-01-14T10:00:00Z');
  const a = akte().auftraege[0];
  assert.deepEqual([a.naechsterSchritt.wer, a.naechsterSchritt.aktion, a.naechsterSchritt.faelligSeitTagen], ['wir', 'nachgefasst', 1]);
  assert.deepEqual(a.verlauf.filter(s => s.zustand === 'erledigt').map(s => [s.schritt, s.von, s.am?.slice(0, 10)]), [
    ['angefragt', null, '2026-01-01'], ['bestellt', 'Mitarbeiter 1', '2026-01-02'], ['geliefert', 'Mitarbeiter 1', '2026-01-05'],
    ['raus', 'Mitarbeiter 1', '2026-01-06'], ['kunde_hat_muster', 'Mitarbeiter 1', '2026-01-08'],
  ]);

  await schritt(MUSTER, 'nachgefasst', { notiz: 'überlegt noch' });
  await schritt(MUSTER, 'notiz', { notiz: 'Kunde ist bis Freitag im Urlaub' });
  uhr.jetzt = new Date('2026-01-16T10:00:00Z');
  const ende = await schritt(MUSTER, 'kein_interesse');
  assert.equal(ende.naechsterSchritt, null);
  assert.equal(ende.zeitleisteAbgeschlossen, true);
  assert.equal(ende.positionen, 2, 'Ergebnis schliesst die Positionen ab');
  const k = akte();
  assert.equal(k.fortschritt.fertig, true, 'bestehender Fortschritt sieht den Abschluss');
  assert.equal(k.naechsterSchritt, null);
  assert.deepEqual(k.auftraege[0].verlaufNotizen.map(n => n.text), ['Kunde ist bis Freitag im Urlaub']);

  // Nur angehaengt: jedes Ereignis steht mit Person und Zeit in der eigenen Datei.
  const ereignisse = JSON.parse(fs.readFileSync(path.join(dir, 'auftragsverlauf.json'), 'utf8')).auftraege[MUSTER].ereignisse;
  assert.deepEqual(ereignisse.map(e => [e.schritt, e.von]), [['kunde_hat_muster', 'Mitarbeiter 1'], ['nachgefasst', 'Mitarbeiter 1'], ['notiz', 'Mitarbeiter 1'], ['kein_interesse', 'Mitarbeiter 1']]);
});

test('Schreiben: Zuruecknehmen, Teilstand, Fehlerfaelle', async () => {
  const { api, schritt, akte } = umgebung();
  // Eine Position war schon ueber den Einkauf bestellt - der Auftragsschritt fasst nur die andere an.
  await api.einkaufAuftragsstatusSetzen({ orderId: MUSTER, lineItemId: 'gid://shopify/LineItem/1', status: 'bestellt', lieferantBestellnummer: 'AB-7' }, { name: 'Mitarbeiter 2', rolle: 'mitarbeiter' });
  assert.deepEqual(akte().auftraege[0].verlauf[1].teil, { erledigt: 1, gesamt: 2 });
  const r = await schritt(MUSTER, 'bestellt');
  assert.equal(r.positionen, 1);
  const pos = api.einkaufAuftragsstatus().positionen;
  assert.equal(pos[`${MUSTER}::gid://shopify/LineItem/1`].bestelltVon, 'Mitarbeiter 2');
  assert.equal(pos[`${MUSTER}::gid://shopify/LineItem/1`].lieferantBestellnummer, 'AB-7');

  await schritt(MUSTER, 'kunde_hat_muster');
  assert.equal(akte().auftraege[0].verlauf.find(s => s.schritt === 'kunde_hat_muster').zustand, 'erledigt');
  await schritt(MUSTER, 'zurueck', { bezug: 'kunde_hat_muster' });
  assert.notEqual(akte().auftraege[0].verlauf.find(s => s.schritt === 'kunde_hat_muster').zustand, 'erledigt');

  const fehler = async (payload, status) => {
    await assert.rejects(() => api.einkaufAuftragsstatusSetzen({ aktion: 'schritt', ...payload }, { name: 'Mitarbeiter 1' }), e => e instanceof ApiError && e.status === status);
  };
  await fehler({ orderId: MUSTER }, 400);
  await fehler({ orderId: MUSTER, schritt: 'erfunden' }, 400);
  await fehler({ orderId: 'gid://shopify/Order/999', schritt: 'bestellt' }, 404);
  await fehler({ orderId: WARE, schritt: 'nachgefasst' }, 400);      // gehoert nicht zur Warenstrecke
  await fehler({ orderId: MUSTER, schritt: 'erledigt' }, 400);       // Musterstrecke endet mit einem Ergebnis
  await fehler({ orderId: MUSTER, schritt: 'notiz', notiz: ' ' }, 400);
  await fehler({ orderId: MUSTER, schritt: 'zurueck' }, 400);
});

test('Abwaertskompatibel: der bestehende Aufruf ohne aktion verhaelt sich wie bisher', async () => {
  const { api } = umgebung();
  const r = await api.einkaufAuftragsstatusSetzen({ orderId: WARE, lineItemId: 'gid://shopify/LineItem/3', status: 'bestellt', lieferantBestellnummer: 'AB-1' }, { name: 'Mitarbeiter 1' });
  assert.deepEqual(Object.keys(r).sort(), ['eintrag', 'ok']);
  assert.equal(r.eintrag.status, 'bestellt');
  await assert.rejects(() => api.einkaufAuftragsstatusSetzen({ orderId: WARE, status: 'bestellt' }, { name: 'Mitarbeiter 1' }), e => e instanceof ApiError && e.status === 400);
  await assert.rejects(() => api.einkaufAuftragsstatusSetzen({ orderId: WARE, lineItemId: 'x', aktion: 'erfunden' }, { name: 'Mitarbeiter 1' }), e => e instanceof ApiError && e.status === 400);
  const wieder = await api.einkaufAuftragsstatusSetzen({ orderId: WARE, lineItemId: 'gid://shopify/LineItem/3', status: 'erledigt' }, { name: 'Mitarbeiter 1' });
  assert.equal(wieder.eintrag.status, 'erledigt');
  const offen = await api.einkaufAuftragsstatusSetzen({ orderId: WARE, lineItemId: 'gid://shopify/LineItem/3', aktion: 'wiederOeffnen' }, { name: 'Mitarbeiter 1' });
  assert.equal(offen.eintrag.status, 'bestellt');
  // Und die Zeitleiste folgt dem alten Schreibweg.
  assert.equal(api.kundenBestellungen().zeilen.find(z => z.orderId === WARE).naechsterSchritt.aktion, 'geliefert');
});
