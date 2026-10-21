import test from 'node:test';
import assert from 'node:assert/strict';
import { aufbereiten } from '../lib/bestelluebersicht.mjs';
import { sucheKunden, offeneBestellungenJeProdukt, kundenListenEintrag } from '../lib/kundensuche.mjs';
import { positionKey } from '../lib/auftragsstatus.mjs';

// Nur synthetische Testdaten: erfundene Kunden, Produkte und Bestellnummern.
function zeile({ id, title, handle, variantTitle = 'Natur', sku = `TEST-${id}` }) {
  return {
    id: `gid://shopify/LineItem/${id}`, sku, title, variantTitle, quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
    customAttributes: [],
    variant: {
      id: `gid://shopify/ProductVariant/${id}`, sku, title: variantTitle,
      metafields: { nodes: [] }, lieferant: { nodes: [] },
      product: { id: `gid://shopify/Product/${id}`, handle, title, metafields: { nodes: [] }, grosshandel: { nodes: [] } },
    },
  };
}

function bestellung(nr, zeilen, extra = {}) {
  return {
    id: `gid://shopify/Order/7000${nr}`, name: `#P${nr}`, createdAt: `2026-02-0${nr}T10:00:00Z`, cancelledAt: null,
    displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [], tags: [],
    customer: { id: `gid://shopify/Customer/600${nr}`, displayName: `Probekunde ${nr}`, email: `probekunde${nr}@example.invalid`, phone: null },
    sourceName: 'web', lineItems: { nodes: zeilen }, ...extra,
  };
}

const modell = aufbereiten({
  orders: [
    bestellung(1, [zeile({ id: 11, title: 'Testteppich Wolke', handle: 'testteppich-wolke' })]),
    bestellung(2, [zeile({ id: 21, title: 'Testteppich Wolke', handle: 'testteppich-wolke', variantTitle: 'Grau' }), zeile({ id: 22, title: 'Testvinyl Stein', handle: 'testvinyl-stein' })]),
    bestellung(3, [zeile({ id: 31, title: 'Testteppich Wolke', handle: 'testteppich-wolke' })], { cancelledAt: '2026-02-04T00:00:00Z' }),
    bestellung(4, [zeile({ id: 41, title: 'Testteppich Wolke', handle: 'testteppich-wolke' })], { displayFulfillmentStatus: 'FULFILLED' }),
    bestellung(5, [zeile({ id: 51, title: 'Testteppich Wolke', handle: 'testteppich-wolke' })], { tags: ['TESTBESTELLUNG'] }),
    // In Shopify archiviert, ohne Versand: abgehakt.
    bestellung(6, [zeile({ id: 61, title: 'Testteppich Wolke', handle: 'testteppich-wolke' })], { closedAt: '2026-02-10T00:00:00Z' }),
    // Teilversand: Wolke schon verschickt, Stein noch offen.
    bestellung(7, [{ ...zeile({ id: 71, title: 'Testteppich Wolke', handle: 'testteppich-wolke' }), unfulfilledQuantity: 0 }, zeile({ id: 72, title: 'Testvinyl Stein', handle: 'testvinyl-stein' })], { displayFulfillmentStatus: 'PARTIALLY_FULFILLED' }),
  ],
});

test('offeneBestellungenJeProdukt: nur offene, echte, nicht stornierte, nicht archivierte Bestellungen', () => {
  const map = offeneBestellungenJeProdukt(modell, { statusAlle: {} });
  const wolke = map.get('testteppich-wolke');
  assert.deepEqual(wolke.map(o => o.bestellung), ['#P1', '#P2']);
  assert.equal(wolke[1].farbe, 'Grau');
  assert.equal(wolke[0].kunde, 'Probekunde 1');
  assert.equal(wolke[0].kundenKey, 'email:probekunde1@example.invalid');
  assert.equal(wolke[0].stand, 'Noch nicht bestellt');
  assert.deepEqual(map.get('testvinyl-stein').map(o => o.bestellung), ['#P2', '#P7']);
});

test('offeneBestellungenJeProdukt: bei Teilversand verschwindet die schon verschickte Position', () => {
  const map = offeneBestellungenJeProdukt(modell, { statusAlle: {} });
  assert.ok(!map.get('testteppich-wolke').some(o => o.bestellung === '#P7'));
  assert.ok(map.get('testvinyl-stein').some(o => o.bestellung === '#P7'));
});

test('offeneBestellungenJeProdukt: Auftragsfluss "erledigt" schliesst die Position, "bestellt" zeigt den Stand', () => {
  const p1 = modell.auftraege.find(a => a.name === '#P1');
  const p2 = modell.auftraege.find(a => a.name === '#P2');
  const statusAlle = {
    [positionKey(p1.id, p1.positionen[0].lineItemId)]: { status: 'erledigt' },
    [positionKey(p2.id, p2.positionen[0].lineItemId)]: { status: 'bestellt' },
  };
  const wolke = offeneBestellungenJeProdukt(modell, { statusAlle }).get('testteppich-wolke');
  assert.deepEqual(wolke.map(o => o.bestellung), ['#P2']);
  assert.equal(wolke[0].stand, 'Bestellt');
});

test('sucheKunden: findet Kunden ueber den Produktnamen und sagt, was sie bestellt haben', () => {
  const treffer = sucheKunden(modell, 'stein', { statusAlle: {} });
  assert.deepEqual(treffer.map(k => k.kunde.name), ['Probekunde 7', 'Probekunde 2']);
  const eintrag = kundenListenEintrag(treffer[1]);
  assert.equal(eintrag.trefferProdukt.titel, 'Testvinyl Stein');
  assert.equal(eintrag.trefferProdukt.bestellung, '#P2');
});

test('sucheKunden: Treffer ueber Kontakt stehen vor Treffern ueber das Produkt', () => {
  // "Probekunde 1" passt direkt (Name), alle anderen nur ueber "Testteppich".
  const treffer = sucheKunden(modell, 'probekunde1', { statusAlle: {} });
  assert.equal(treffer.length, 1);
  assert.equal(treffer[0].trefferProdukt, undefined);
  const ueberProdukt = sucheKunden(modell, 'testteppich', { statusAlle: {} });
  assert.ok(ueberProdukt.length >= 4);
  assert.ok(ueberProdukt.every(k => k.trefferProdukt?.titel === 'Testteppich Wolke'));
});
