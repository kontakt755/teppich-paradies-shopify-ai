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

test('Wichtigkeit: es fehlt etwas > unterwegs > nicht bezahlt > erledigt, Kunde bleibt beieinander', async () => {
  const { sortiereNachWichtigkeit, wichtigkeit } = await import('../lib/kunden-bestellgruppen.mjs');
  const jetzt = new Date('2026-10-22T12:00:00Z');
  const z = (id, kunde, datum, extra = {}) => ({ orderId: id, orderName: `#${id}`, kundenname: kunde, kundenSchluessel: `k:${kunde}`, datum, zahlungsstatus: 'PAID', fertig: false, storniert: false, wasFehlt: ['Noch nicht versendet'], fortschritt: { minStufe: 1, text: 'Bestellt (0 von 1 erledigt)' }, ...extra });
  const zeilen = [
    z(1, 'Erledigt Erna', '2026-10-01', { fertig: true }),
    z(2, 'Unterwegs Udo', '2026-10-10'),
    z(3, 'Fehlt Frieda', '2026-10-20', { fortschritt: { minStufe: 0, text: 'Offen' } }),
    z(4, 'Offen Otto', '2026-10-05', { zahlungsstatus: 'PENDING' }),
    z(5, 'Unterwegs Udo', '2026-10-21', { wasFehlt: ['Rückruf offen', 'Noch nicht versendet'] }),
    z(6, 'Fehlt Frieda', '2026-09-30', { fertig: true }),
  ];
  const r = sortiereNachWichtigkeit(zeilen, jetzt);
  // Frieda und Udo haben beide Rang 1 (nicht bestellt bzw. Rückruf); Friedas Fall ist älter.
  assert.deepEqual(r.map(x => x.orderId), [3, 6, 5, 2, 4, 1]);
  assert.equal(wichtigkeit(zeilen[2], jetzt).grund, 'wartet seit 2 Tagen · noch nicht bestellt');
  assert.equal(wichtigkeit(zeilen[4], jetzt).grund, 'wartet seit 1 Tag · Rückruf offen');
  assert.deepEqual([wichtigkeit(zeilen[1], jetzt).rang, wichtigkeit(zeilen[1], jetzt).grund], [2, 'wartet seit 12 Tagen · Bestellt']);
  assert.equal(wichtigkeit({ ...zeilen[1], fortschritt: { minStufe: 3, text: 'An Kunden raus (0 von 3 erledigt)' } }, jetzt).rang, 4, 'schon raus: unten');
  assert.equal(wichtigkeit(zeilen[3], jetzt).grund, 'wartet seit 17 Tagen · noch nicht bezahlt');
});
