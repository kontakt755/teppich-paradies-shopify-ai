import test from 'node:test';
import assert from 'node:assert/strict';
import { leseBestandCsv, planeAbgleich, bauePakete } from '../lib/lieferanten-bestand.mjs';

const KOPF = 'item_no;item_no_long;EAN1;product_group;name;stock;reserved;available;in_delivery';
const csv = (...zeilen) => [KOPF, ...zeilen].join('\n');

test('leseBestandCsv: SKU, EAN, available; Komma und Minus abgefangen', () => {
  const b = leseBestandCsv(csv('A1;A1;111;X;X;5;0;3;0', 'B2;B2;222;X;X;0;0;-2;0', 'C3;C3;;X;X;1;0;1,0;0'));
  assert.equal(b.zeilen, 3);
  assert.equal(b.nachSku.get('A1').verfuegbar, 3);
  assert.equal(b.nachSku.get('B2').verfuegbar, 0);
  assert.equal(b.nachSku.get('C3').verfuegbar, 1);
  assert.equal(b.nachEan.get('222').sku, 'B2');
});

test('leseBestandCsv: fehlende Spalten brechen ab', () => {
  assert.throws(() => leseBestandCsv('foo;bar\n1;2'), /item_no\/available/);
});

test('planeAbgleich: nur Abweichungen, EAN als Ersatz, Fehlende auf 0', () => {
  const b = leseBestandCsv(csv('A1;A1;111;X;X;5;0;3;0', 'B2;B2;222;X;X;0;0;0;0'));
  const plan = planeAbgleich(b, [
    { sku: 'A1', barcode: '111', inventoryItemId: 'i1', verfuegbar: 3 },
    { sku: 'ALT', barcode: '222', inventoryItemId: 'i2', verfuegbar: 4 },
    { sku: 'WEG', barcode: '', inventoryItemId: 'i3', verfuegbar: 2 },
  ], { minZeilen: 1, maxFehlend: 1, maxAufNull: 1 });
  assert.deepEqual(plan.aenderungen.map((x) => [x.sku, x.von, x.auf]), [['ALT', 4, 0], ['WEG', 2, 0]]);
  assert.deepEqual(plan.fehlend, ['WEG']);
  assert.equal(plan.sperre, null);
});

test('planeAbgleich: kurze Datei und Massen-Null sperren das Schreiben', () => {
  const b = leseBestandCsv(csv('A1;A1;111;X;X;0;0;0;0'));
  const plan = planeAbgleich(b, [{ sku: 'A1', barcode: '', inventoryItemId: 'i1', verfuegbar: 5 }]);
  assert.match(plan.sperre, /nur 1 Artikel/);
  assert.match(plan.sperre, /ausverkauft/);
});

test('bauePakete: 250er-Pakete mit changeFromQuantity', () => {
  const aenderungen = Array.from({ length: 251 }, (_, i) => ({ inventoryItemId: `i${i}`, von: 1, auf: 0 }));
  const pakete = bauePakete(aenderungen, 'L1');
  assert.equal(pakete.length, 2);
  assert.equal(pakete[1].quantities.length, 1);
  assert.deepEqual(pakete[0].quantities[0], { inventoryItemId: 'i0', locationId: 'L1', quantity: 0, changeFromQuantity: 1 });
  assert.equal(pakete[0].name, 'available');
});
