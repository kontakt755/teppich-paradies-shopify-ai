import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setzeMarke, leseAlle, markeGilt, teileAuf, juengsterPunkt, FALL_GRUND_LABEL } from '../lib/fallmarken.mjs';
import { istTestkontakt } from '../lib/kundenfaelle.mjs';

function tmpDatei() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tp-fallmarken-')), 'fallmarken.json');
}

const fall = (schluessel, ...daten) => ({ schluessel, punkte: daten.map(d => ({ datum: d })) });

test('setzen, lesen und zuruecknehmen', () => {
  const datei = tmpDatei();
  assert.deepEqual(leseAlle(datei), {}, 'fehlende Datei ist leerer Zustand, kein Fehler');

  setzeMarke(datei, 'email:a@b.de', { grund: 'erledigt', bisPunkt: '2026-09-20T10:00:00Z', von: 'Mona' });
  const nach = leseAlle(datei);
  assert.equal(nach['email:a@b.de'].grund, 'erledigt');
  assert.equal(nach['email:a@b.de'].von, 'Mona');

  setzeMarke(datei, 'email:a@b.de', { grund: null });
  assert.deepEqual(leseAlle(datei), {}, 'zuruecknehmen loescht den Eintrag');
});

test('unbekannter Grund und leerer Schluessel werden abgelehnt', () => {
  const datei = tmpDatei();
  assert.throws(() => setzeMarke(datei, 'x', { grund: 'quatsch' }), /Unbekannter Grund/);
  assert.throws(() => setzeMarke(datei, '  ', { grund: 'test' }), /Kein Fall angegeben/);
});

test('eine neue Bestellung holt den abgehakten Kunden zurueck', () => {
  // Der Kern der Sache: "erledigt" gilt fuer den Stand von damals, nicht fuer
  // den Kunden auf ewig. Sonst verschwindet jemand aus der Arbeitsliste und
  // seine naechste Bestellung sieht niemand mehr.
  const marke = { grund: 'erledigt', bisPunkt: '2026-09-20T10:00:00Z' };
  assert.equal(markeGilt(marke, fall('k', '2026-09-19T08:00:00Z', '2026-09-20T10:00:00Z')), true, 'nichts Neues -> bleibt ausgeblendet');
  assert.equal(markeGilt(marke, fall('k', '2026-09-20T10:00:00Z', '2026-09-24T09:00:00Z')), false, 'neuer Punkt -> wieder sichtbar');
  assert.equal(markeGilt(null, fall('k', '2026-09-24T09:00:00Z')), false, 'ohne Marke immer sichtbar');
  assert.equal(markeGilt({ grund: 'test' }, fall('k', '2026-09-24T09:00:00Z')), true, 'ohne bisPunkt gilt die Marke dauerhaft');
});

test('juengsterPunkt nimmt den spaetesten Zeitpunkt, auch bei Luecken', () => {
  assert.equal(juengsterPunkt(fall('k', '2026-09-19T08:00:00Z', '2026-09-24T09:00:00Z')), '2026-09-24T09:00:00Z');
  assert.equal(juengsterPunkt({ schluessel: 'k', punkte: [{ datum: null }, { datum: '2026-09-01T00:00:00Z' }] }), '2026-09-01T00:00:00Z');
  assert.equal(juengsterPunkt({ schluessel: 'k', punkte: [] }), null);
  assert.equal(juengsterPunkt(undefined), null);
});

test('teileAuf trennt sichtbar von ausgeblendet und haengt den Grund an', () => {
  const marken = { b: { grund: 'test', bisPunkt: null } };
  const { sichtbar, ausgeblendet } = teileAuf([fall('a', '2026-09-24T09:00:00Z'), fall('b', '2026-09-24T09:00:00Z')], marken);
  assert.deepEqual(sichtbar.map(f => f.schluessel), ['a']);
  assert.deepEqual(ausgeblendet.map(f => f.schluessel), ['b']);
  assert.equal(ausgeblendet[0].marke.grund, 'test');
  assert.equal(FALL_GRUND_LABEL.test, 'Kein echter Kunde');
});

test('Testadressen: nur reservierte Domaenen, nie der Name', () => {
  // Eine Regel auf "test" im Namen wuerde irgendwann eine echte Kundin
  // aussortieren - und das faellt niemandem auf.
  for (const e of ['test-checkout@example.com', 'qa-test@example.com', 'x@sub.example.org', 'a@foo.test', 'b@localhost']) {
    assert.ok(istTestkontakt({ email: e }), `${e} sollte als Testadresse gelten`);
  }
  for (const e of ['chrismis@gmx.net', 'frau.testorf@web.de', 'info@example-teppiche.de', 'test@echte-firma.de', null, '']) {
    assert.ok(!istTestkontakt({ email: e }), `${e} darf nicht als Testadresse gelten`);
  }
});
