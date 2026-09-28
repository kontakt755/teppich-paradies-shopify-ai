import test from 'node:test';
import assert from 'node:assert/strict';
import { gruppierePositionenNachKunde } from '../lib/einkauf-kundengruppen.mjs';

test('Muster bleiben je Kunde zusammen, auch bei mehreren Aufträgen und unsortierter Eingabe', () => {
  const auftraege = [
    { id: 'b1', details: { kunde: { id: '2', name: 'Zora Beispiel' } } },
    { id: 'a1', details: { kunde: { id: '1', name: 'Änne Beispiel' }, lieferadresse: { ort: 'Berlin' } } },
    { id: 'a2', details: { kunde: { id: '1', name: 'Änne Beispiel' }, lieferadresse: { ort: 'Potsdam' } } },
  ];
  const positionen = [
    { orderId: 'b1', orderDatum: '2026-09-27', orderName: '#3', lineItemId: 'b' },
    { orderId: 'a1', orderDatum: '2026-09-26', orderName: '#1', lineItemId: 'a1' },
    { orderId: 'a2', orderDatum: '2026-09-28', orderName: '#2', lineItemId: 'a2' },
  ];
  const gruppen = gruppierePositionenNachKunde(positionen, auftraege);
  assert.deepEqual(gruppen.map(g => [g.name, g.auftragsAnzahl, g.positionen.map(p => p.lineItemId)]), [
    ['Änne Beispiel', 2, ['a2', 'a1']],
    ['Zora Beispiel', 1, ['b']],
  ]);
  assert.equal(gruppen[0].ort, '');
});

test('Gleichnamige und unbekannte Kunden werden nicht versehentlich vermischt', () => {
  const auftraege = [
    { id: '1', details: { kunde: { id: 'kunde-1', name: 'Alex Beispiel' } } },
    { id: '2', details: { kunde: { id: 'kunde-2', name: 'Alex Beispiel' } } },
  ];
  const gruppen = gruppierePositionenNachKunde(
    ['1', '2', '3', '4'].map(orderId => ({ orderId })), auftraege,
  );
  assert.deepEqual(gruppen.map(g => g.positionen.map(p => p.orderId)), [['1'], ['2'], ['3'], ['4']]);
  assert.equal(gruppen[2].name, 'Kunde nicht zugeordnet');
});
