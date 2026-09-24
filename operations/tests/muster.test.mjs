import assert from 'node:assert/strict';
import test from 'node:test';
import { istMusterPosition, istNurMusterBestellung, MUSTER_MERKMALE } from '../lib/muster.mjs';

test('Property _Muster_ID erkennt ein Muster', () => {
  assert.equal(istMusterPosition({ musterId: '12345:rot' }), true);
  assert.equal(istMusterPosition({ properties: { _Muster_ID: '12345:rot' } }), true);
});

test('SKU-Praefixe M- und TP-MUSTER erkennen ein Muster', () => {
  assert.equal(istMusterPosition({ sku: 'M-TEPDOLCE4_004' }), true);
  assert.equal(istMusterPosition({ sku: 'm-tepdolce4_004' }), true);
  assert.equal(istMusterPosition({ sku: 'TP-MUSTER-000' }), true);
});

test('Produkttyp Musterservice erkennt ein Muster', () => {
  assert.equal(istMusterPosition({ sku: 'X-1', produktTyp: 'Musterservice' }), true);
});

test('regulaere Ware bleibt Ware', () => {
  assert.equal(istMusterPosition({ sku: 'TEPDOLCE4_004', produktTyp: 'Teppichboden' }), false);
  assert.equal(istMusterPosition({}), false);
});

test('SKU mit M ohne Bindestrich ist kein Muster', () => {
  assert.equal(istMusterPosition({ sku: 'MARANO-01' }), false);
});

test('Handle mit "muster" allein macht kein Muster - Dessin ist kein Muster', () => {
  // /(^|-)muster(-|$)/ war die alte Regel in bestelluebersicht.mjs.
  assert.equal(istMusterPosition({ sku: 'NANTES-FG-01', handle: 'nantes-eiche-muster-fischgrat', produktTyp: 'Klickvinyl' }), false);
});

test('reine Musterbestellung: alle Positionen Muster', () => {
  assert.equal(istNurMusterBestellung([{ sku: 'M-1' }, { sku: 'M-2' }, { sku: 'TP-MUSTER-000' }]), true);
});

test('eine regulaere Position beendet die reine Musterbestellung', () => {
  assert.equal(istNurMusterBestellung([{ sku: 'M-1' }, { sku: 'TEP-9', produktTyp: 'Teppichboden' }]), false);
});

test('leerer Warenkorb ist keine Musterbestellung', () => {
  assert.equal(istNurMusterBestellung([]), false);
  assert.equal(istNurMusterBestellung(), false);
});

test('Merkmalsliste bleibt die dokumentierte', () => {
  assert.deepEqual([...MUSTER_MERKMALE], ['_Muster_ID', 'M-', 'TP-MUSTER', 'Musterservice']);
});
