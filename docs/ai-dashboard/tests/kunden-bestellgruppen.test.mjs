import test from 'node:test';
import assert from 'node:assert/strict';
import { gruppiereBestellzeilenNachKunde, sortKundenname } from '../lib/kunden-bestellgruppen.mjs';

test('Anreden verschieben Kunden nicht unter F oder H', () => {
  assert.equal(sortKundenname('Frau Annette Beispiel'), 'Annette Beispiel');
  assert.equal(sortKundenname('Herr Jonas Beispiel'), 'Jonas Beispiel');
});

test('Bestellungen desselben Kunden bleiben zusammen; Gleichnamige bleiben getrennt', () => {
  const zeilen = [
    { orderId: '1', kundenSchluessel: 'kunde-a', kundenname: 'Alex Beispiel' },
    { orderId: '2', kundenSchluessel: 'kunde-a', kundenname: 'Alex Beispiel' },
    { orderId: '3', kundenSchluessel: 'kunde-b', kundenname: 'Alex Beispiel' },
    { orderId: '4', kundenSchluessel: 'kunde-c', kundenname: 'Zora Beispiel' },
  ];
  const gruppen = gruppiereBestellzeilenNachKunde(zeilen);
  assert.deepEqual(gruppen.map(g => [g.name, g.zeilen.map(z => z.orderId)]), [
    ['Alex Beispiel', ['1', '2']],
    ['Alex Beispiel', ['3']],
    ['Zora Beispiel', ['4']],
  ]);
});
