import test from 'node:test';
import assert from 'node:assert/strict';
import { ladeAngebote, angebotEintrag, aufbereiten } from '../lib/angebote.mjs';

const angebot = (n, status) => ({
  id: `gid://shopify/DraftOrder/${n}`,
  name: `#D${n}`,
  status,
  createdAt: `2026-09-0${n}T10:00:00Z`,
  updatedAt: `2026-09-0${n}T10:00:00Z`,
  completedAt: status === 'COMPLETED' ? `2026-09-0${n}T11:00:00Z` : null,
  invoiceSentAt: null, invoiceUrl: `https://example.test/invoice/${n}`,
  email: `testkunde${n}@example.test`, phone: null,
  customer: { displayName: `Max Testkunde ${n}`, defaultEmailAddress: { emailAddress: `testkunde${n}@example.test` }, defaultPhoneNumber: null },
  totalPriceSet: { shopMoney: { amount: String(n * 50), currencyCode: 'EUR' } },
  subtotalPriceSet: { shopMoney: { amount: String(n * 45), currencyCode: 'EUR' } },
  totalQuantityOfLineItems: 2,
  note2: n === 1 ? 'Verlegeangebot' : null,
  lineItems: { nodes: [{ title: 'Testteppich', variantTitle: 'Farbe 12', sku: 'T-12', quantity: 2, originalUnitPriceSet: { shopMoney: { amount: '25.00', currencyCode: 'EUR' } } }] },
});

test('ladeAngebote: erkennt alle Eingabeformen', () => {
  assert.equal(ladeAngebote([angebot(1, 'OPEN')]).length, 1);
  assert.equal(ladeAngebote({ draftOrders: [angebot(1, 'OPEN')] }).length, 1);
  assert.equal(ladeAngebote({ draftOrders: { nodes: [angebot(1, 'OPEN')] } }).length, 1);
  assert.throws(() => ladeAngebote({}), /kein draftOrders-Feld/);
});

test('angebotEintrag: Nummer, Kunde, Betrag, Positionen', () => {
  const e = angebotEintrag(angebot(2, 'OPEN'));
  assert.equal(e.nummer, '#D2');
  assert.equal(e.kunde, 'Max Testkunde 2');
  assert.equal(e.betrag, 100);
  assert.equal(e.positionen.length, 1);
  assert.equal(e.positionen[0].menge, 2);
});

test('aufbereiten: offene vor abgeschlossenen, offen-Zaehler korrekt', () => {
  const modell = aufbereiten({ draftOrders: [angebot(1, 'COMPLETED'), angebot(2, 'OPEN'), angebot(3, 'INVOICE_SENT')] });
  assert.equal(modell.anzahl, 3);
  assert.equal(modell.offen, 2);
  assert.deepEqual(modell.angebote.map(a => a.status), ['OPEN', 'INVOICE_SENT', 'COMPLETED']);
});

test('Telefonnummer kommt aus Entwurf, Kunde oder Adresse', () => {
  const ausEntwurf = angebotEintrag({ id: 'gid://shopify/DraftOrder/1', phone: '+4930111' });
  assert.equal(ausEntwurf.telefon, '+4930111');
  const ausKunde = angebotEintrag({ id: 'gid://shopify/DraftOrder/2', customer: { defaultPhoneNumber: { phoneNumber: '+4930222' } } });
  assert.equal(ausKunde.telefon, '+4930222');
  const ausAdresse = angebotEintrag({ id: 'gid://shopify/DraftOrder/3', shippingAddress: { phone: '+4930333' } });
  assert.equal(ausAdresse.telefon, '+4930333');
  assert.equal(angebotEintrag({ id: 'gid://shopify/DraftOrder/4' }).telefon, null);
});
