import test from 'node:test';
import assert from 'node:assert/strict';
import { ladeKunden, kundenEintrag, aufbereiten } from '../lib/kunden.mjs';

// Erfundene Kundennamen, keine echten Daten.
const kunde = (n) => ({
  id: `gid://shopify/Customer/${n}`,
  displayName: `Erika Musterfrau ${n}`,
  firstName: 'Erika', lastName: `Musterfrau ${n}`,
  note: n === 1 ? 'Stammkundin' : null,
  createdAt: '2025-01-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  numberOfOrders: n,
  amountSpent: { amount: String(n * 100), currencyCode: 'EUR' },
  tags: n === 1 ? ['vip'] : [],
  verifiedEmail: true,
  defaultEmailAddress: { emailAddress: `erika${n}@example.test`, marketingState: 'SUBSCRIBED', marketingOptInLevel: 'CONFIRMED_OPT_IN' },
  defaultPhoneNumber: { phoneNumber: '+491234567', marketingState: 'NOT_SUBSCRIBED' },
  defaultAddress: { name: `Erika Musterfrau ${n}`, address1: 'Musterweg 1', address2: null, zip: '16515', city: 'Oranienburg', country: 'Germany', countryCodeV2: 'DE', phone: null },
  addressesV2: { nodes: [] },
});

test('ladeKunden: erkennt Array, {customers}, {customers:{nodes}} und {data:{customers:{nodes}}}', () => {
  assert.equal(ladeKunden([kunde(1)]).length, 1);
  assert.equal(ladeKunden({ customers: [kunde(1)] }).length, 1);
  assert.equal(ladeKunden({ customers: { nodes: [kunde(1)] } }).length, 1);
  assert.equal(ladeKunden({ data: { customers: { nodes: [kunde(1)] } } }).length, 1);
  assert.throws(() => ladeKunden({}), /kein customers-Feld/);
});

test('kundenEintrag: Kontakt, Zahlen, Einwilligung, Anschrift', () => {
  const e = kundenEintrag(kunde(3));
  assert.equal(e.name, 'Erika Musterfrau 3');
  assert.equal(e.email, 'erika3@example.test');
  assert.equal(e.anzahlBestellungen, 3);
  assert.equal(e.gesamtumsatz, 300);
  assert.equal(e.marketingEinwilligung.email, 'SUBSCRIBED');
  assert.equal(e.anschrift.ort, 'Oranienburg');
});

test('aufbereiten: sortiert nach Gesamtumsatz absteigend, zaehlt korrekt', () => {
  const modell = aufbereiten({ customers: [kunde(1), kunde(5), kunde(2)] });
  assert.equal(modell.anzahl, 3);
  assert.deepEqual(modell.kunden.map(k => k.anzahlBestellungen), [5, 2, 1]);
  assert.ok(modell.erstellt);
});

test('Kunde ohne Bestellung bleibt sichtbar (numberOfOrders 0)', () => {
  const k = { ...kunde(9), numberOfOrders: 0, amountSpent: { amount: '0', currencyCode: 'EUR' } };
  const modell = aufbereiten({ customers: [k] });
  assert.equal(modell.kunden[0].anzahlBestellungen, 0);
  assert.equal(modell.kunden[0].gesamtumsatz, 0);
});
