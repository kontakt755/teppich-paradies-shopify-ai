import test from 'node:test';
import assert from 'node:assert/strict';
import { ladeWarenkoerbe, warenkorbEintrag, aufbereiten } from '../lib/warenkoerbe.mjs';

const checkout = (n, { abgeschlossen = false } = {}) => ({
  id: `gid://shopify/AbandonedCheckout/${n}`,
  name: `#C${n}`,
  createdAt: `2026-09-1${n}T09:00:00Z`,
  updatedAt: `2026-09-1${n}T09:05:00Z`,
  completedAt: abgeschlossen ? `2026-09-1${n}T10:00:00Z` : null,
  abandonedCheckoutUrl: `https://example.test/checkout/${n}`,
  customer: { displayName: `Julia Beispiel ${n}`, defaultEmailAddress: { emailAddress: `julia${n}@example.test` }, defaultPhoneNumber: null },
  totalPriceSet: { shopMoney: { amount: String(n * 30), currencyCode: 'EUR' } },
  subtotalPriceSet: { shopMoney: { amount: String(n * 28), currencyCode: 'EUR' } },
  billingAddress: null,
  shippingAddress: { name: `Julia Beispiel ${n}`, city: 'Oranienburg', country: 'Germany' },
  lineItems: { nodes: [{ title: 'Testvinyl', quantity: 1 }] },
});

test('ladeWarenkoerbe: erkennt alle Eingabeformen', () => {
  assert.equal(ladeWarenkoerbe([checkout(1)]).length, 1);
  assert.equal(ladeWarenkoerbe({ checkouts: [checkout(1)] }).length, 1);
  assert.equal(ladeWarenkoerbe({ abandonedCheckouts: { nodes: [checkout(1)] } }).length, 1);
  assert.throws(() => ladeWarenkoerbe({}), /checkouts/);
});

test('warenkorbEintrag: Kunde, Wert, Ort, Positionen', () => {
  const e = warenkorbEintrag(checkout(2));
  assert.equal(e.kunde, 'Julia Beispiel 2');
  assert.equal(e.wert, 60);
  assert.equal(e.ort, 'Oranienburg, Germany');
  assert.equal(e.positionen[0].titel, 'Testvinyl');
});

test('aufbereiten: nachtraeglich abgeschlossene zaehlen nicht als offener Umsatz', () => {
  const modell = aufbereiten({ checkouts: [checkout(1), checkout(2, { abgeschlossen: true }), checkout(3)] });
  assert.equal(modell.anzahl, 3);
  assert.equal(modell.offenAnzahl, 2);
  assert.equal(modell.nachtraeglichAbgeschlossen, 1);
  assert.equal(modell.offenWert, 30 + 90);
  assert.ok(modell.warenkoerbe.every(w => !w.abgeschlossenAm));
});
