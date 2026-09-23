import test from 'node:test';
import assert from 'node:assert/strict';
import { schnappschuss, zaehlt, ladeBestellungen } from '../lib/kennzahlen.mjs';

const JETZT = new Date('2026-09-23T12:00:00Z');

function bestellung(tageHer, betrag, opt = {}) {
  return {
    name: opt.name ?? '#1',
    createdAt: new Date(JETZT.getTime() - tageHer * 24 * 60 * 60 * 1000).toISOString(),
    displayFinancialStatus: opt.status ?? 'PAID',
    cancelledAt: opt.storniert ?? null,
    currentTotalPriceSet: { shopMoney: { amount: String(betrag), currencyCode: 'EUR' } },
    lineItems: { nodes: opt.positionen ?? [] },
  };
}

test('zaehlt nur bezahlte und nicht stornierte Bestellungen', () => {
  assert.equal(zaehlt(bestellung(1, 100)), true);
  assert.equal(zaehlt(bestellung(1, 100, { storniert: '2026-09-22T10:00:00Z' })), false);
  assert.equal(zaehlt(bestellung(1, 100, { status: 'PENDING' })), false);
  assert.equal(zaehlt(bestellung(1, 100, { status: 'PARTIALLY_REFUNDED' })), true);
});

test('Zeitraeume trennen 7 und 30 Tage, Storno wird ausgewiesen', () => {
  const s = schnappschuss([
    bestellung(1, 100),
    bestellung(3, 50),
    bestellung(20, 30),
    bestellung(2, 999, { storniert: '2026-09-22T10:00:00Z' }),
    bestellung(40, 500),
  ], { jetzt: JETZT });

  assert.equal(s.zeitraeume['7'].bestellungen, 2);
  assert.equal(s.zeitraeume['7'].umsatz, 150);
  assert.equal(s.zeitraeume['7'].durchschnitt, 75);
  assert.equal(s.zeitraeume['7'].storniert, 1);
  assert.equal(s.zeitraeume['30'].bestellungen, 3);
  assert.equal(s.zeitraeume['30'].umsatz, 180);
  assert.equal(s.zeitraeume['30'].waehrung, 'EUR');
});

test('ohne Bestellungen bleibt der Durchschnitt 0 statt NaN', () => {
  const s = schnappschuss([], { jetzt: JETZT });
  assert.equal(s.zeitraeume['7'].bestellungen, 0);
  assert.equal(s.zeitraeume['7'].umsatz, 0);
  assert.equal(s.zeitraeume['7'].durchschnitt, 0);
  assert.deepEqual(s.topProdukte, []);
});

test('meistverkaufte Artikel kommen nur aus gezaehlten Bestellungen', () => {
  const s = schnappschuss([
    bestellung(2, 100, { positionen: [{ title: 'Teppichboden A', quantity: 3 }, { title: 'Leiste B', quantity: 1 }] }),
    bestellung(5, 100, { positionen: [{ title: 'Teppichboden A', quantity: 2 }] }),
    bestellung(1, 999, { storniert: '2026-09-22T10:00:00Z', positionen: [{ title: 'Storno C', quantity: 99 }] }),
  ], { jetzt: JETZT });
  assert.deepEqual(s.topProdukte, [{ titel: 'Teppichboden A', menge: 5 }, { titel: 'Leiste B', menge: 1 }]);
});

test('ladeBestellungen versteht die rohe Admin-API-Antwort', () => {
  const roh = { data: { orders: { nodes: [bestellung(1, 10)] } } };
  assert.equal(ladeBestellungen(roh).length, 1);
  assert.equal(ladeBestellungen({ orders: [bestellung(1, 10)] }).length, 1);
  assert.throws(() => ladeBestellungen({}), /orders/);
});
