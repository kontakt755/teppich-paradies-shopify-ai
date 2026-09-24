import test from 'node:test';
import assert from 'node:assert/strict';
import { ladeBestand, bestandEintrag, aufbereiten } from '../lib/bestand.mjs';

const level = (n, { tracked = true } = {}) => ({
  id: `gid://shopify/InventoryLevel/${n}`,
  quantities: [{ name: 'available', quantity: 10 - n }, { name: 'on_hand', quantity: 10 }, { name: 'committed', quantity: n }, { name: 'incoming', quantity: 0 }],
  item: { id: `gid://shopify/InventoryItem/${n}`, sku: `TEST-${n}`, tracked, variant: { id: `gid://shopify/ProductVariant/${n}`, sku: `TEST-${n}`, title: `Farbe ${n}`, product: { id: `gid://shopify/Product/${n}`, handle: 'testboden', title: 'Testboden' } } },
  standort: { id: 'gid://shopify/Location/1', name: 'Lager Oranienburg' },
});

test('ladeBestand: verlangt {standorte, bestand}', () => {
  assert.throws(() => ladeBestand({}), /standorte, bestand/);
  const daten = ladeBestand({ standorte: [], bestand: [] });
  assert.deepEqual(daten, { standorte: [], bestand: [] });
});

test('bestandEintrag: Mengen je Zustand', () => {
  const e = bestandEintrag(level(3));
  assert.equal(e.sku, 'TEST-3');
  assert.equal(e.verfuegbar, 7);
  assert.equal(e.vorraetig, 10);
  assert.equal(e.reserviert, 3);
  assert.equal(e.standort, 'Lager Oranienburg');
});

test('aufbereiten: ohne Standorte -> gefuehrt:false mit Hinweis, keine erfundenen Nullen', () => {
  const modell = aufbereiten({ standorte: [], bestand: [] });
  assert.equal(modell.gefuehrt, false);
  assert.match(modell.hinweis, /Standorte/);
  assert.deepEqual(modell.eintraege, []);
});

test('aufbereiten: Standorte ohne getrackte Varianten -> gefuehrt:false mit Hinweis', () => {
  const modell = aufbereiten({ standorte: [{ id: 'l1', name: 'Lager' }], bestand: [level(1, { tracked: false })] });
  assert.equal(modell.gefuehrt, false);
  assert.match(modell.hinweis, /nicht.*Lagerbestand-gefuehrt|kein.*Lagerbestand/);
});

test('aufbereiten: mit getrackten Varianten -> gefuehrt:true, knapp zaehlt <=0', () => {
  const knapp = { ...level(10), item: { ...level(10).item } };
  knapp.quantities = [{ name: 'available', quantity: 0 }];
  const modell = aufbereiten({ standorte: [{ id: 'l1', name: 'Lager Oranienburg' }], bestand: [level(1), knapp] });
  assert.equal(modell.gefuehrt, true);
  assert.equal(modell.anzahl, 2);
  assert.equal(modell.knapp, 1);
});
