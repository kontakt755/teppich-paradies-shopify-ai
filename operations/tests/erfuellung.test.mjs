import test from 'node:test';
import assert from 'node:assert/strict';
import { erfuellungEintrag, aufbereiten } from '../lib/erfuellung.mjs';

const bestellung = (n, { fulfillments = [], refunds = [] } = {}) => ({
  id: `gid://shopify/Order/${n}`,
  name: `#T${n}`,
  displayFulfillmentStatus: fulfillments.length ? 'FULFILLED' : 'UNFULFILLED',
  fulfillments,
  refunds,
});

test('erfuellungEintrag: Sendungsnummer/Traeger aus trackingInfo', () => {
  const o = bestellung(1, {
    fulfillments: [{ status: 'SUCCESS', displayStatus: 'DELIVERED', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z', trackingInfo: [{ number: 'ABC123', company: 'DHL', url: 'https://dhl.test/ABC123' }] }],
  });
  const e = erfuellungEintrag(o);
  assert.equal(e.sendungen.length, 1);
  assert.equal(e.sendungen[0].sendungen[0].nummer, 'ABC123');
  assert.equal(e.sendungen[0].sendungen[0].traeger, 'DHL');
});

test('erfuellungEintrag: Rueckerstattung mit Betrag und Grund', () => {
  const o = bestellung(2, { refunds: [{ id: 'gid://shopify/Refund/1', createdAt: '2026-09-05T00:00:00Z', note: 'Reklamation', totalRefundedSet: { shopMoney: { amount: '49.90', currencyCode: 'EUR' } } }] });
  const e = erfuellungEintrag(o);
  assert.equal(e.erstattungen.length, 1);
  assert.equal(e.erstattungen[0].grund, 'Reklamation');
  assert.equal(e.erstattetGesamt, 49.9);
});

test('aufbereiten: nur Bestellungen mit Sendung oder Erstattung', () => {
  const modell = aufbereiten({
    orders: [
      bestellung(1, { fulfillments: [{ status: 'SUCCESS', trackingInfo: [{ number: 'X' }] }] }),
      bestellung(2, {}),
      bestellung(3, { refunds: [{ totalRefundedSet: { shopMoney: { amount: '10', currencyCode: 'EUR' } } }] }),
    ],
  });
  assert.equal(modell.anzahl, 2);
  assert.equal(modell.versendet, 1);
  assert.equal(modell.erstattet, 1);
});
