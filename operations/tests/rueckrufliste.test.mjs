// Rueckruf-/Beratungsliste (operations/lib/rueckrufliste.mjs): wer gehoert hinein, mit welchem Thema.
// Seit 2026-10-13 (w-078) fuehrt das Control Center Muster und Rueckrufe; „Verlegung: Angefragt“
// ist deshalb ein Rueckruf (vorher rief der Laden diese Kunden ueber die Auftrags-App zurueck).
// Namen und Nummern erfunden.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { istRueckrufKandidat, rueckrufZeile, rueckrufliste } from '../lib/rueckrufliste.mjs';
import { setzeStatus, leseAlle } from '../lib/rueckrufe.mjs';

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

test('Von Hand gemeldet („Falsch geliefert“): in der Liste auch ohne Wunsch an der Kasse, Grund bleibt beim Abhaken', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tp-rueckruf-')), 'rueckrufe.json');
  const grund = 'Falsch geliefert: Unterlage 1 m statt 6 m';
  assert.equal(setzeStatus(file, { orderId: 5, status: 'offen', actor: 'Ben', thema: grund }).quelle, 'manuell');
  setzeStatus(file, { orderId: 5, status: 'angerufen', actor: 'Ben', notiz: 'Kunde hat 1 m bekommen' });
  // Ein Eintrag ohne Grund (alter Stand, Tippfehler in der ID) holt keine Bestellung in die Liste.
  setzeStatus(file, { orderId: 6, status: 'offen', actor: 'Ben' });
  const l = rueckrufliste({ auftraege: [auftrag(5, {}), auftrag(6, {}), auftrag(1, { beratung: 'Ja' })] }, leseAlle(file));
  assert.deepEqual(l.map(z => [z.orderId, z.thema]), [[1, 'Beratung gewünscht'], [5, grund]]);
});

test('Telefon: steht die Nummer nur in der Lieferadresse, wird sie genommen', () => {
  const nurAdresse = auftrag(1, { beratung: 'Ja' }, { details: { kunde: { name: 'Max Muster', telefon: '–' }, beratungsangaben: {}, lieferadresse: { telefon: '030 000000' } } });
  assert.equal(rueckrufZeile(nurAdresse).telefon, '030 000000');
  assert.equal(rueckrufZeile(auftrag(2, { beratung: 'Ja' })).telefon, '0170 0000000', 'die Nummer am Kunden geht vor');
});
