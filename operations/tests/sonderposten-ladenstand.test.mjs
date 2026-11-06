// Restrollen im Laden (Inhaber 2026-11-06): Ladenbuchungen und Nachmessungen aus dem
// Protokoll fuer die Zeile auf "Heute".
import test from 'node:test';
import assert from 'node:assert/strict';
import { ladenStandAusProtokoll, NACHMESSEN_TAGE } from '../lib/sonderposten.mjs';

const JETZT = new Date('2026-11-06T12:00:00.000Z');
const z = (zeitpunkt, aktion) => ({ zeitpunkt, aktion });

test('ohne Eintraege: nie gebucht, Nachmessen ab der ersten Messung', () => {
  const s = ladenStandAusProtokoll([], { jetzt: JETZT, ersteMessung: '2026-10-28T12:00:00.000Z' });
  assert.equal(s.buchungen30, 0);
  assert.equal(s.letzteBuchung, null);
  assert.equal(s.letzteInventur, '2026-10-28T12:00:00.000Z');
  assert.equal(s.nachmessenAb, '2026-11-27T12:00:00.000Z');
  assert.equal(s.nachmessenFaellig, false);
  assert.equal(NACHMESSEN_TAGE, 30);
});

test('zaehlt nur echte Ladenbuchungen der letzten 30 Tage, unklare nicht', () => {
  const s = ladenStandAusProtokoll([
    z('2026-11-05T09:00:00.000Z', 'sonderposten-rolle-im-laden-verkauft'),
    z('2026-10-20T09:00:00.000Z', 'sonderposten-rolle-im-laden-verkauft'),
    z('2026-09-01T09:00:00.000Z', 'sonderposten-rolle-im-laden-verkauft'),
    z('2026-11-06T08:00:00.000Z', 'sonderposten-rolle-im-laden-verkauft-unklar'),
    z('2026-11-06T08:00:00.000Z', 'sonderposten-im-laden-verkauft'),
    z('kaputt', 'sonderposten-rolle-im-laden-verkauft'),
  ], { jetzt: JETZT });
  assert.equal(s.buchungen30, 2);
  assert.equal(s.letzteBuchung, '2026-11-05T09:00:00.000Z');
});

test('Nachmessung im Dashboard schiebt die Frist; ohne Messung ist sie faellig', () => {
  const s = ladenStandAusProtokoll([z('2026-11-01T10:00:00.000Z', 'sonderposten-rollenbestand')], { jetzt: JETZT });
  assert.equal(s.letzteInventur, '2026-11-01T10:00:00.000Z');
  assert.equal(s.nachmessenFaellig, false);
  const spaet = ladenStandAusProtokoll([], { jetzt: new Date('2026-12-01T00:00:00.000Z') });
  assert.equal(spaet.nachmessenFaellig, true, 'erste Messung 28.10. + 30 Tage ist am 1.12. vorbei');
  const nie = ladenStandAusProtokoll([], { jetzt: JETZT, ersteMessung: null });
  assert.equal(nie.nachmessenFaellig, true);
  assert.equal(nie.nachmessenAb, null);
});
