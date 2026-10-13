// Versand in Shopify buchen (operations/lib/versand.mjs) - nur gegen die Attrappe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bucheVersand, ordneZu, buchungsEingaben, offeneMengen, versandNachzuholen, versandGebucht, VersandFehler, VERSANDDIENSTE, RECHT_FEHLT_VERSAND } from '../lib/versand.mjs';
import { VERSANDDIENSTE as DIENSTE_BROWSER } from '../../docs/ai-dashboard/lib/versand.mjs';
import { versandAttrappe, fo, li, BESTELLUNG } from './versand-attrappe.mjs';

async function wirft(fn, grund) {
  try { await fn(); } catch (e) {
    assert.ok(e instanceof VersandFehler, `VersandFehler erwartet, kam ${e?.constructor?.name}: ${e?.message}`);
    assert.equal(e.grund, grund, e.message);
    return e;
  }
  throw new Error(`Fehler "${grund}" erwartet, aber es lief durch`);
}

test('bucht genau die angegebenen Positionen mit Versandmail und Sendungsnummer, Gegenprobe ok', async () => {
  const a = versandAttrappe();
  const r = await bucheVersand(a.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1), li(2)], sendungsnummer: ' 1234 5678 ', versanddienst: 'GLS' });
  assert.equal(r.status, 'gebucht');
  assert.deepEqual(r.gebucht, [li(1), li(2)]);
  assert.equal(r.kundeBenachrichtigt, true);
  assert.equal(r.gegenprobe, 'ok');
  assert.equal(r.sendungsnummer, '12345678');
  const [b] = a.buchungen();
  assert.equal(a.buchungen().length, 1, 'eine Buchung, eine Versandmail');
  assert.equal(b.variables.fulfillment.notifyCustomer, true);
  assert.deepEqual(b.variables.fulfillment.trackingInfo, { number: '12345678', company: 'GLS' });
  assert.deepEqual(b.variables.fulfillment.lineItemsByFulfillmentOrder[0].fulfillmentOrderLineItems.map(z => z.quantity), [1, 1]);
});

test('Teillieferung: nur die eine Position, die andere bleibt offen; ohne Liste wuerde Shopify alles buchen', async () => {
  const a = versandAttrappe({ fos: [fo('1', [{ n: 1, menge: 3 }, { n: 2, menge: 2 }])] });
  const r = await bucheVersand(a.proxy, { orderId: BESTELLUNG, lineItemIds: [li(2)], benachrichtigen: false });
  assert.equal(r.status, 'gebucht');
  const eingabe = a.buchungen()[0].variables.fulfillment;
  assert.equal(eingabe.notifyCustomer, false);
  assert.equal(eingabe.trackingInfo, undefined);
  assert.deepEqual(eingabe.lineItemsByFulfillmentOrder[0].fulfillmentOrderLineItems, [{ id: 'gid://shopify/FulfillmentOrderLineItem/12', quantity: 2 }]);
  assert.equal(a.zustand.fos[0].status, 'IN_PROGRESS');
  assert.equal(a.zustand.fos[0].zeilen[0].offen, 3, 'Position 1 unberuehrt');
  // Zweiter Teil spaeter: bucht nur noch Position 1.
  const r2 = await bucheVersand(a.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1)] });
  assert.equal(r2.status, 'gebucht');
  assert.equal(a.zustand.fos[0].status, 'CLOSED');
});

test('bereits erfuellt: nichts geschrieben, Status "bereits" - ein zweiter Klick bucht nie doppelt', async () => {
  const a = versandAttrappe();
  await bucheVersand(a.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1), li(2)] });
  const vorher = a.schreibend().length;
  const r = await bucheVersand(a.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1), li(2)] });
  assert.equal(r.status, 'bereits');
  assert.deepEqual(r.bereits, [li(1), li(2)]);
  assert.equal(a.schreibend().length, vorher, 'kein weiterer Schreibaufruf');
});

test('Recht fehlt: Shopify lehnt beim Buchen oder schon beim Lesen ab - "recht-fehlt" mit Handgriff, nichts gebucht', async () => {
  const b = versandAttrappe({ verweigert: 'buchen' });
  const e = await wirft(() => bucheVersand(b.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1)] }), 'recht-fehlt');
  assert.equal(e.message, RECHT_FEHLT_VERSAND);
  assert.match(e.message, /write_merchant_managed_fulfillment_orders/);
  assert.match(e.message, /neu starten/);
  assert.match(e.message, /Artikel versenden/);
  assert.equal(b.zustand.fos[0].zeilen[0].offen, 1, 'nichts gebucht');
  const c = versandAttrappe({ verweigert: 'lesen' });
  await wirft(() => bucheVersand(c.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1)] }), 'recht-fehlt');
  assert.equal(c.buchungen().length, 0);
});

test('Netzfehler: beim Lesen nichts gebucht; Antwort verloren nach der Buchung = gebucht; vor der Buchung = nicht angekommen; ohne Beleg = unklar', async () => {
  const lesen = versandAttrappe({ lesenScheitert: [1] });
  await wirft(() => bucheVersand(lesen.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1)] }), 'nicht-erreichbar');
  assert.equal(lesen.buchungen().length, 0);

  const nach = versandAttrappe({ antwortWeg: 'nach' });
  const r = await bucheVersand(nach.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1), li(2)] });
  assert.equal(r.status, 'gebucht');
  assert.equal(r.antwortVerloren, true);
  assert.equal(r.gegenprobe, 'ok');

  const vor = versandAttrappe({ antwortWeg: 'vor' });
  await wirft(() => bucheVersand(vor.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1)] }), 'nicht-angekommen');

  const blind = versandAttrappe({ antwortWeg: 'vor', lesenScheitert: [2] });
  const e = await wirft(() => bucheVersand(blind.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1)] }), 'unklar');
  assert.match(e.message, /unklar/);
});

test('Zurueckhaltung "Bestand fehlt" wird aufgehoben und gebucht; andere Gruende bleiben und nichts wird gebucht', async () => {
  const a = versandAttrappe({ fos: [fo('1', [{ n: 1 }], { status: 'ON_HOLD', holds: [{ reason: 'INVENTORY_OUT_OF_STOCK', displayReason: 'Nicht auf Lager' }] })] });
  const r = await bucheVersand(a.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1)] });
  assert.equal(r.status, 'gebucht');
  assert.equal(r.aufgehoben, 1);
  const freigabe = a.aufrufe.find(x => x.name === 'VersandFreigeben');
  assert.deepEqual(freigabe.variables.holdIds, ['gid://shopify/FulfillmentHold/10'], 'nur die bekannte Zurueckhaltung, nicht alle');

  const b = versandAttrappe({ fos: [fo('1', [{ n: 1 }], { status: 'ON_HOLD', holds: [{ reason: 'INVENTORY_OUT_OF_STOCK' }, { reason: 'HIGH_RISK_OF_FRAUD', displayReason: 'Betrugsrisiko' }] })] });
  const e = await wirft(() => bucheVersand(b.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1)] }), 'zurueckgehalten');
  assert.match(e.message, /Betrugsrisiko/);
  assert.equal(b.schreibend().length, 0, 'weder freigegeben noch gebucht');
});

test('Teilergebnis: eine Position zurueckgehalten, die andere gebucht', async () => {
  const a = versandAttrappe({ fos: [fo('1', [{ n: 1 }]), fo('2', [{ n: 2 }], { status: 'ON_HOLD', holds: [{ reason: 'AWAITING_PAYMENT', displayReason: 'Zahlung ausstehend' }] })] });
  const r = await bucheVersand(a.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1), li(2)] });
  assert.equal(r.status, 'teilweise');
  assert.deepEqual(r.gebucht, [li(1)]);
  assert.deepEqual(r.nichtGebucht.map(n => [n.lineItemId, n.grund]), [[li(2), 'gehalten']]);
  assert.match(r.nichtGebucht[0].meldung, /Zahlung ausstehend/);
});

test('Shopify lehnt ab: "abgelehnt"; hat in dem Moment jemand anders gebucht, ist es "bereits"', async () => {
  const a = versandAttrappe({ userErrors: ['Something went wrong'] });
  const e = await wirft(() => bucheVersand(a.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1)] }), 'abgelehnt');
  assert.match(e.message, /Something went wrong/);
  const b = versandAttrappe({ userErrors: ['Invalid fulfillment order line item quantity requested.'], gleichzeitigGebucht: true });
  const r = await bucheVersand(b.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1), li(2)] });
  assert.equal(r.status, 'bereits');
});

test('storniert, Testbestellung laut Shopify, unbekannte Position, ungueltige Eingabe: nichts gebucht', async () => {
  const a = versandAttrappe({ storniert: true });
  await wirft(() => bucheVersand(a.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1)] }), 'storniert');
  const t = versandAttrappe({ test: true });
  await wirft(() => bucheVersand(t.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1)] }), 'testbestellung');
  assert.equal(t.buchungen().length, 0);
  const b = versandAttrappe();
  await wirft(() => bucheVersand(b.proxy, { orderId: BESTELLUNG, lineItemIds: [li(99)] }), 'nicht-buchbar');
  await wirft(() => bucheVersand(b.proxy, { orderId: 'gid://shopify/Order/x', lineItemIds: [li(1)] }), 'eingabe');
  await wirft(() => bucheVersand(b.proxy, { orderId: BESTELLUNG, lineItemIds: ['abc'] }), 'eingabe');
  await wirft(() => bucheVersand({ execute: async () => null }, { orderId: BESTELLUNG, lineItemIds: [li(1)] }), 'kein-zugang');
  assert.equal(b.buchungen().length, 0);
});

test('Spedition: Nummer ohne Paketdienst; Eigenleistung in eigener Fulfillment Order wird mitgebucht (ein Aufruf je Standort)', async () => {
  const a = versandAttrappe({ fos: [fo('1', [{ n: 1 }]), fo('2', [{ n: 3, menge: 800 }])] });
  const r = await bucheVersand(a.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1), li(3)], sendungsnummer: 'SP-77', versanddienst: 'Spedition' });
  assert.equal(r.status, 'gebucht');
  assert.equal(a.buchungen().length, 1);
  const eingabe = a.buchungen()[0].variables.fulfillment;
  assert.deepEqual(eingabe.trackingInfo, { number: 'SP-77' });
  assert.equal(eingabe.lineItemsByFulfillmentOrder.length, 2);
  assert.equal(eingabe.lineItemsByFulfillmentOrder[1].fulfillmentOrderLineItems[0].quantity, 800);
});

test('ordneZu und buchungsEingaben: verteilte Position, geschlossene FO, Standortgruppen', () => {
  const order = { fulfillmentOrders: { nodes: [
    { id: 'F1', status: 'CLOSED', supportedActions: [], fulfillmentHolds: [], assignedLocation: { location: { id: 'L1' } }, lineItems: { nodes: [{ id: 'Z1', remainingQuantity: 0, lineItem: { id: li(1) } }] } },
    { id: 'F2', status: 'OPEN', supportedActions: [{ action: 'CREATE_FULFILLMENT' }], fulfillmentHolds: [], assignedLocation: { location: { id: 'L2' } }, lineItems: { nodes: [{ id: 'Z2', remainingQuantity: 2, lineItem: { id: li(2) } }] } },
    { id: 'F3', status: 'SCHEDULED', supportedActions: [], fulfillmentHolds: [], assignedLocation: { location: { id: 'L1' } }, lineItems: { nodes: [{ id: 'Z3', remainingQuantity: 1, lineItem: { id: li(3) } }] } },
  ] } };
  const z = ordneZu(order, [li(1), li(2), li(3), li(4)]);
  assert.deepEqual(z.map(x => x.klasse), ['bereits', 'buchbar', 'nicht_buchbar', 'unbekannt']);
  const e = buchungsEingaben(z, { benachrichtigen: true });
  assert.deepEqual(e.map(x => [x.standort, x.lineItemIds]), [['L2', [li(2)]]]);
});

test('Vermerke: nachzuholen nur bei Fehlschlag nach dem 13.10., gebucht laesst den Hinweis fallen', () => {
  const auftrag = { id: 'O1', positionen: [{ lineItemId: 'A' }, { lineItemId: 'B' }, { lineItemId: null }] };
  const alt = { 'O1::A': { lineItemId: 'A', status: 'raus' }, 'O1::B': { lineItemId: 'B', status: 'erledigt' } };
  assert.equal(versandNachzuholen(auftrag, alt), null, 'alte Positionen ohne Vermerk nie nachbuchen');
  assert.equal(versandGebucht(auftrag, alt), false);
  const fehl = { 'O1::A': { lineItemId: 'A', status: 'raus', shopifyVersand: { status: 'fehler', meldung: 'Recht fehlt', am: '2026-10-13T10:00:00Z' } }, 'O1::B': { lineItemId: 'B', status: 'raus', shopifyVersand: { status: 'gebucht' } } };
  assert.deepEqual(versandNachzuholen(auftrag, fehl), { anzahl: 1, unklar: false, grund: null, meldung: 'Recht fehlt', lineItemIds: ['A'] });
  const ok = { 'O1::A': { lineItemId: 'A', status: 'raus', shopifyVersand: { status: 'bereits' } }, 'O1::B': { lineItemId: 'B', status: 'erledigt', shopifyVersand: { status: 'gebucht' } } };
  assert.equal(versandGebucht(auftrag, ok), true);
  assert.equal(versandNachzuholen(auftrag, ok), null);
});

test('Versanddienste: Browser und Server fuehren dieselbe Liste', () => {
  assert.deepEqual([...DIENSTE_BROWSER], [...VERSANDDIENSTE]);
});

test('Nichts neu gebucht, aber etwas haengt (schon erfuellt + zurueckgehalten): Fehler mit Gruenden je Position, nie gruen', async () => {
  const a = versandAttrappe({ fos: [fo('1', [{ n: 1, offen: 0 }], { status: 'CLOSED' }), fo('2', [{ n: 2 }], { status: 'ON_HOLD', holds: [{ reason: 'HIGH_RISK_OF_FRAUD', displayReason: 'Betrugsrisiko' }] })] });
  const e = await wirft(() => bucheVersand(a.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1), li(2)] }), 'zurueckgehalten');
  assert.deepEqual(e.extra.bereits, [li(1)]);
  assert.deepEqual(e.extra.nichtGebucht.map(n => [n.lineItemId, n.grund]), [[li(2), 'gehalten']]);
  // Erste Buchung scheitert: die Gruende der anderen Positionen bleiben erhalten.
  const b = versandAttrappe({ antwortWeg: 'vor', fos: [fo('1', [{ n: 1 }]), fo('2', [{ n: 2 }], { status: 'ON_HOLD', holds: [{ reason: 'AWAITING_PAYMENT', displayReason: 'Zahlung ausstehend' }] })] });
  const f = await wirft(() => bucheVersand(b.proxy, { orderId: BESTELLUNG, lineItemIds: [li(1), li(2)] }), 'nicht-angekommen');
  assert.deepEqual(f.extra.nichtGebucht.map(n => [n.lineItemId, n.grund]), [[li(2), 'gehalten']]);
});

test('Geschlossene oder stornierte Fulfillment Orders zaehlen nicht als offen (Restmenge nach Verschieben)', () => {
  const order = { fulfillmentOrders: { nodes: [
    { id: 'ALT', status: 'CLOSED', supportedActions: [], fulfillmentHolds: [], assignedLocation: { location: { id: 'L1' } }, lineItems: { nodes: [{ id: 'Z1', remainingQuantity: 2, lineItem: { id: li(1) } }] } },
    { id: 'NEU', status: 'OPEN', supportedActions: [{ action: 'CREATE_FULFILLMENT' }], fulfillmentHolds: [], assignedLocation: { location: { id: 'L1' } }, lineItems: { nodes: [{ id: 'Z2', remainingQuantity: 2, lineItem: { id: li(1) } }] } },
  ] } };
  const [z] = ordneZu(order, [li(1)]);
  assert.equal(z.klasse, 'buchbar');
  assert.deepEqual(z.zeilen.map(t => t.fo.id), ['NEU']);
  assert.equal(offeneMengen(order, [li(1)]).get(li(1)), 2);
});
