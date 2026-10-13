// Rueckruf-/Beratungsliste (operations/lib/rueckrufliste.mjs): wer gehoert hinein, mit welchem Thema.
// Seit 2026-10-13 (w-078) fuehrt das Control Center Muster und Rueckrufe; „Verlegung: Angefragt“
// ist deshalb ein Rueckruf (vorher rief der Laden diese Kunden ueber die Auftrags-App zurueck).
// Namen und Nummern erfunden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { istRueckrufKandidat, rueckrufZeile, rueckrufliste } from '../lib/rueckrufliste.mjs';

const auftrag = (id, checks, extra = {}) => ({
  id, name: '#' + id, datum: `2026-10-1${id}T09:00:00Z`, checks: Object.assign({ beratung: '–', masspruefung: 'ok', verlegung: '–' }, checks),
  details: { kunde: { name: 'Max Muster', telefon: '0170 0000000' }, beratungsangaben: {} }, ...extra,
});

test('Kandidaten: Beratung Ja, Maßprüfung Ja oder Verlegung angefragt – sonst nicht', () => {
  assert.equal(istRueckrufKandidat(auftrag(1, { beratung: 'Ja' })), true);
  assert.equal(istRueckrufKandidat(auftrag(2, { masspruefung: 'Ja' })), true);
  assert.equal(istRueckrufKandidat(auftrag(3, { verlegung: 'Angefragt' })), true);
  assert.equal(istRueckrufKandidat(auftrag(4, { beratung: 'Nein', verlegung: 'Ja' })), false, 'gebuchte Verlegung ist kein Rueckrufwunsch');
  assert.equal(istRueckrufKandidat(auftrag(5, {})), false);
  assert.equal(istRueckrufKandidat(null), false);
});

test('Thema nennt jeden Grund; Verlegung angefragt = „Interesse an Aufmaß/Verlegung“', () => {
  assert.equal(rueckrufZeile(auftrag(3, { verlegung: 'Angefragt' })).thema, 'Interesse an Aufmaß/Verlegung');
  assert.equal(rueckrufZeile(auftrag(1, { beratung: 'Ja', verlegung: 'Angefragt' })).thema, 'Beratung gewünscht · Interesse an Aufmaß/Verlegung');
  assert.equal(rueckrufZeile(auftrag(2, { masspruefung: 'Ja' })).thema, 'Maßprüfung');
});

test('Liste: aelteste zuerst, Testbestellungen mit Kennzeichen, ohne Wunsch nicht dabei', () => {
  const l = rueckrufliste({ auftraege: [auftrag(3, { verlegung: 'Angefragt' }), auftrag(1, { beratung: 'Ja' }), auftrag(5, {})],
    testauftraege: [auftrag(2, { verlegung: 'Angefragt' }, { testbestellung: true })] });
  assert.deepEqual(l.map(z => [z.orderId, z.testbestellung]), [[1, false], [2, true], [3, false]]);
});
