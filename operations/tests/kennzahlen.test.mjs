import test from 'node:test';
import assert from 'node:assert/strict';
import { schnappschuss, zaehlt, ladeBestellungen, warenBetrag } from '../lib/kennzahlen.mjs';

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

test('zaehlt: Testbestellungen (Tag oder test=true) nie', () => {
  assert.equal(zaehlt({ ...bestellung(1, 100), tags: ['TESTBESTELLUNG'] }), false);
  assert.equal(zaehlt({ ...bestellung(1, 100), tags: ['testbestellung'] }), false);
  assert.equal(zaehlt({ ...bestellung(1, 100), tags: ['TYP-MUSTER'] }), true);
  assert.equal(zaehlt({ ...bestellung(1, 100), test: true }), false);
});

test('schnappschuss: Testbestellungen fliessen nicht in Umsatz oder Anzahl ein', () => {
  const s = schnappschuss([
    bestellung(1, 100),
    { ...bestellung(1, 5000, { name: '#T1' }), tags: ['TESTBESTELLUNG'] },
    { ...bestellung(2, 5000, { name: '#T2' }), test: true },
  ], { jetzt: JETZT });
  assert.equal(s.zeitraeume['7'].bestellungen, 1);
  assert.equal(s.zeitraeume['7'].umsatz, 100);
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

test('Durchschnitt nur ueber Bestellungen mit Betrag - kostenlose Muster druecken ihn nicht', () => {
  // Erfundene Zahlen: 10 Bestellungen, davon 8 kostenlose Muster, 300 EUR Umsatz - frueher 30 EUR "Bestellwert".
  const s = schnappschuss([
    bestellung(1, 200), bestellung(2, 100),
    ...Array.from({ length: 8 }, (_, i) => bestellung(1 + (i % 5), 0)),
  ], { jetzt: JETZT });
  assert.equal(s.zeitraeume['7'].bestellungen, 10);
  assert.equal(s.zeitraeume['7'].kostenlos, 8);
  assert.equal(s.zeitraeume['7'].mitBetrag, 2);
  assert.equal(s.zeitraeume['7'].durchschnitt, 150);
  // Nur kostenlose Muster: kein Schnitt, nicht 0 geteilt durch irgendwas.
  const nurMuster = schnappschuss([bestellung(1, 0), bestellung(2, 0)], { jetzt: JETZT });
  assert.equal(nurMuster.zeitraeume['7'].mitBetrag, 0);
  assert.equal(nurMuster.zeitraeume['7'].durchschnitt, 0);
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

test('kostenlose Musterbestellungen werden gezaehlt, damit Umsatz 0 erklaerbar ist', () => {
  const s = schnappschuss([
    bestellung(1, 0),
    bestellung(2, 0),
    bestellung(3, 120),
    bestellung(4, 0, { status: 'PENDING' }),
  ], { jetzt: JETZT });
  assert.equal(s.zeitraeume['7'].bestellungen, 3);
  assert.equal(s.zeitraeume['7'].kostenlos, 2);
  assert.equal(s.zeitraeume['7'].umsatz, 120);
});

// Prüfung 05.11.: Warenumsatz ohne Versand und Muster, Stand nach Bestellaenderung (#1056).
const geld = (n) => ({ shopMoney: { amount: String(n), currencyCode: 'EUR' } });
const warenPos = (netto) => ({ title: 'Ware', sku: 'W-1', variant: { product: { productType: 'Teppichboden' } }, customAttributes: [], priceAfterAllDiscountsBeforeTaxesSet: geld(netto) });
const servicePos = (netto) => ({ title: 'Kettelservice', sku: 'S-1', variant: { product: { productType: 'Service' } }, customAttributes: [], priceAfterAllDiscountsBeforeTaxesSet: geld(netto) });
const musterPos = (netto = 0) => ({ title: 'Muster', sku: 'M-1', variant: { product: { productType: 'Musterservice' } }, customAttributes: [], priceAfterAllDiscountsBeforeTaxesSet: geld(netto) });
function kauf(tageHer, { gesamt, zwischen, versand = 0, kunde = 'k1', positionen, ...rest }) {
  return { ...bestellung(tageHer, gesamt, { positionen }), id: `o${tageHer}${kunde}`, customer: { id: kunde }, totalPriceSet: geld(gesamt), currentSubtotalPriceSet: geld(zwischen), currentShippingPriceSet: geld(versand), ...rest };
}

test('warenBetrag: aktuelle Zwischensumme statt Wert bei Bestellung, ohne Versand', () => {
  // Wie #1056: Position getauscht, totalPriceSet behaelt das Doppelte, bezahlt ist der aktuelle Stand.
  const o = kauf(1, { gesamt: 100, zwischen: 100, positionen: [warenPos(0), warenPos(84.03)] });
  o.totalPriceSet = geld(200);
  assert.equal(warenBetrag(o), 100);
  assert.equal(warenBetrag(kauf(1, { gesamt: 104.99, zwischen: 100, versand: 4.99, positionen: [warenPos(84.03)] })), 100);
});

test('warenBetrag: Service gehoert zum Warenkauf, bezahlte Muster nicht, reine Service-Bestellung ist keine Ware', () => {
  assert.equal(warenBetrag(kauf(1, { gesamt: 119, zwischen: 119, positionen: [warenPos(80), servicePos(20)] })), 119);
  assert.equal(warenBetrag(kauf(1, { gesamt: 119, zwischen: 119, positionen: [warenPos(75), musterPos(25)] })), 89.25);
  assert.equal(warenBetrag(kauf(1, { gesamt: 119, zwischen: 119, positionen: [servicePos(100)] })), 0);
});

test('warenBetrag: ohne aktuelle Felder (alter Export) Gesamtbetrag minus Versand', () => {
  const o = { ...bestellung(1, 104.99, { positionen: [warenPos(84.03)] }), totalShippingPriceSet: geld(4.99) };
  assert.equal(Math.round(warenBetrag(o) * 100) / 100, 100);
});

test('schnappschuss: Ware und Muster getrennt, Kunden eindeutig, Vorwoche ohne Ueberschneidung', () => {
  const s = schnappschuss([
    kauf(1, { gesamt: 104.99, zwischen: 100, versand: 4.99, kunde: 'a', positionen: [warenPos(84)] }),
    kauf(2, { gesamt: 50, zwischen: 50, kunde: 'a', positionen: [warenPos(42), musterPos()] }),
    kauf(3, { gesamt: 0, zwischen: 0, kunde: 'b', positionen: [musterPos()] }),
    kauf(8, { gesamt: 200, zwischen: 200, kunde: 'c', positionen: [warenPos(168)] }),
    kauf(13, { gesamt: 0, zwischen: 0, kunde: 'd', positionen: [musterPos()] }),
    kauf(15, { gesamt: 900, zwischen: 900, kunde: 'e', positionen: [warenPos(756)] }),
    { ...kauf(2, { gesamt: 70, zwischen: 70, kunde: 'f', positionen: [warenPos(58)] }), displayFinancialStatus: 'PENDING' },
    { ...kauf(2, { gesamt: 70, zwischen: 70, kunde: 'g', positionen: [warenPos(58)] }), cancelledAt: '2026-09-22T10:00:00Z' },
  ], { jetzt: JETZT });
  assert.deepEqual(s.zeitraeume['7'].ware, { umsatz: 150, kunden: 1, bestellungen: 2 }, 'zwei Kaeufe desselben Kunden, unbezahlt und storniert zaehlen nicht');
  assert.deepEqual(s.zeitraeume['7'].muster, { bestellungen: 1, kunden: 1 }, 'gemischte Bestellung ist Ware, nicht Muster');
  assert.equal(s.zeitraeume['7'].umsatz, 154.99, 'der Umsatz mit Versand bleibt daneben erhalten');
  assert.deepEqual(s.vorwoche.ware, { umsatz: 200, kunden: 1, bestellungen: 1 });
  assert.deepEqual(s.vorwoche.muster, { bestellungen: 1, kunden: 1 });
});

test('schnappschuss: Bestellung genau auf der Grenze steht nur in einem der beiden Fenster', () => {
  const s = schnappschuss([kauf(7, { gesamt: 10, zwischen: 10, positionen: [warenPos(8)] })], { jetzt: JETZT });
  assert.equal(s.zeitraeume['7'].ware.bestellungen + s.vorwoche.ware.bestellungen, 1);
});
