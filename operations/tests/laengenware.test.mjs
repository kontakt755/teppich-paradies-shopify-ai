import test from 'node:test';
import assert from 'node:assert/strict';
import { aufbereiten, einkaufsmenge } from '../lib/bestelluebersicht.mjs';
import { masspruefung } from '../lib/resolve.mjs';
import { UNGEKLAERT } from '../lib/umrechnung.mjs';

// Profile nach Mass (blocks/tp-laengen-zuschnitt, custom.preis_pro_001_lfm):
// Shopify-Menge sind Zentimeter (Laenge je Stueck x Stueckzahl). Im Einkauf
// muss daraus "10 Stück à 95 cm" werden, nie "950 Stück". Nur synthetische
// Testdaten, Lieferant als Pseudonym.
const mf = (namespace, key, value) => ({ namespace, key, value });
const attrs = { 'Länge je Stück': '95 cm', 'Anzahl': '10 Stück', 'Gesamtlänge': '9,50 m', 'Bohrung': 'gebohrt', _Gruppe: 'Ltest' };

function zeile(quantity, a = attrs) {
  return {
    id: 'gid://shopify/LineItem/71', sku: 'TEST-PROFIL-1', title: 'Testkante nach Maß', variantTitle: 'Messing poliert',
    quantity, currentQuantity: quantity, unfulfilledQuantity: quantity,
    customAttributes: Object.entries(a).map(([key, value]) => ({ key, value })),
    variant: {
      id: 'gid://shopify/ProductVariant/71', sku: 'TEST-PROFIL-1', title: 'Messing poliert',
      metafields: { nodes: [mf('einkauf', 'lieferant', 'G'), mf('einkauf', 'artikelnummer', 'G-1'), mf('einkauf', 'bestelleinheit', 'stueck')] },
      lieferant: { nodes: [] },
      product: {
        id: 'gid://shopify/Product/71', handle: 'testkante-nach-mass', title: 'Testkante nach Maß',
        metafields: { nodes: [mf('custom', 'preis_pro_001_lfm', 'true')] }, grosshandel: { nodes: [] },
      },
    },
  };
}
const bestellung = (z) => ({
  id: 'gid://shopify/Order/90071', name: '#T71', createdAt: '2026-01-05T10:00:00Z', cancelledAt: null,
  displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [], lineItems: { nodes: [z] },
});

test('Bestelluebersicht: Stueckzahl, Zuschnitt und Bohrung statt 950 Stueck', () => {
  const m = aufbereiten({ orders: [bestellung(zeile(950))] }, { jetzt: new Date('2026-01-07T00:00:00Z') });
  const p = m.auftraege[0].positionen[0];
  assert.equal(p.bestellmenge.menge, 10);
  assert.equal(p.bestellmenge.text, '10 Stück à 95 cm, gebohrt');
  assert.deepEqual(p.ausfuehrung, ['Zuschnitt: 10 × 95 cm', 'Bohrung: gebohrt']);
  assert.match(p.kundenmenge, /^950 × 0,01 lfm = 9,50 lfm/);
  assert.equal(p.masspruefung.status, 'ok');
});

test('Masspruefung: zu wenig Zentimeter oder fehlende Laenge fallen auf', () => {
  assert.equal(masspruefung({ props: attrs, quantity: 940, laengenware: true }).status, 'abweichung');
  assert.equal(masspruefung({ props: { 'Länge je Stück': '95 cm' }, quantity: 95, laengenware: true }).status, 'unlesbar');
  assert.equal(masspruefung({ props: {}, quantity: 950, laengenware: true }).status, 'unlesbar');
  assert.equal(masspruefung({ props: {}, quantity: 2, laengenware: false }).status, '');
});

test('Einkaufsmenge bleibt ungeklaert, wenn Menge und Laenge nicht zusammenpassen', () => {
  const item = { einkauf: { bestelleinheit: 'stueck' }, produkt: { preis_pro_001_lfm: true }, eingaben: { laengeJeStueckCm: 95, bohrung: 'gebohrt' } };
  assert.equal(einkaufsmenge(item, 950).menge, 10);
  assert.equal(einkaufsmenge(item, 951).menge, UNGEKLAERT);
  assert.equal(einkaufsmenge({ ...item, eingaben: {} }, 950).menge, UNGEKLAERT);
});
