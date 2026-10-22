import test from 'node:test';
import assert from 'node:assert/strict';
import { bestellArbeitsstand, bestellungAusgeblendet } from '../lib/bestellarbeit.mjs';
test('Versand ueberstimmt alten Pruefstatus, Abschluss bleibt gesondert', () => {
  const z = { status: 'NEU', fulfillmentstatus: 'FULFILLED', fortschritt: { minStufe: 3, text: 'An Kunden raus (0 von 2 erledigt)' }, naechsterSchritt: { text: 'Ware ist unterwegs zum Kunden' } };
  assert.deepEqual(bestellArbeitsstand(z), { stand: 'Versandt', naechstes: 'Ware ist unterwegs zum Kunden' });
  assert.equal(bestellungAusgeblendet(z), true);
  assert.equal(bestellungAusgeblendet({ fulfillmentstatus: 'PARTIALLY_FULFILLED' }), false);
  assert.equal(bestellArbeitsstand({ fertig: true }).stand, 'Abgeschlossen');
});
test('fehlende Quellen erzeugen keinen bestaetigten Versand oder Wareneingang', () => {
  assert.equal(bestellArbeitsstand({}).stand, 'In Bearbeitung');
  assert.equal(bestellArbeitsstand({ fortschritt: { stufe: 'bestellt' } }).stand, 'Beim Lieferanten bestellt');
  assert.equal(bestellArbeitsstand({ abgehakt: { zeit: 'x' } }).stand, 'Manuell abgehakt');
});
