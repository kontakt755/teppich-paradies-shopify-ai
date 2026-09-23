import test from 'node:test';
import assert from 'node:assert/strict';
import { ratgeberStatus, statusLabel, pipelineRows, suchleistungHinweis } from '../lib/bodenwissen.mjs';

const DATEN = {
  erzeugtAm: '2026-09-23T10:00:00.000Z',
  statusReihenfolge: ['idee', 'entwurf', 'fachinput_noetig', 'veroeffentlicht'],
  contentPipeline: { idee: 1, entwurf: 0, fachinput_noetig: 2, veroeffentlicht: 5 },
  gesamt: { artikel: 8, lexikon: 15, probleme: 21 },
  suchleistung: null,
  suchleistungHinweis: 'GA4 und Search Console sind nicht angebunden. Details in ANALYTICS.md.',
};

test('ratgeberStatus: fehlende Datei (data=null, kein Ladefehler) ist "fehlt", kein Absturz und kein throw', () => {
  assert.doesNotThrow(() => ratgeberStatus(null, null));
  const s = ratgeberStatus(null, null);
  assert.equal(s.state, 'fehlt');
  assert.match(s.hinweis, /bodenwissen\.json/);
  assert.match(s.hinweis, /build-bodenwissen-data\.mjs/);
});

test('ratgeberStatus: ein echter Ladefehler ist "fehler", nicht "fehlt" - beides fuehrt zu keiner Ausnahme', () => {
  assert.doesNotThrow(() => ratgeberStatus(null, 'Netzwerkfehler'));
  const s = ratgeberStatus(null, 'Netzwerkfehler');
  assert.equal(s.state, 'fehler');
  assert.equal(s.hinweis, 'Netzwerkfehler');
});

test('ratgeberStatus: vorhandene Daten sind "ok"', () => {
  assert.deepEqual(ratgeberStatus(DATEN, null), { state: 'ok' });
});

test('statusLabel macht aus dem Rohschluessel einen lesbaren Text, ohne eine zweite Statusliste zu pflegen', () => {
  assert.equal(statusLabel('fachinput_noetig'), 'Fachinput noetig');
  assert.equal(statusLabel('veroeffentlicht'), 'Veroeffentlicht');
  assert.equal(statusLabel(''), '');
});

test('pipelineRows behaelt die Reihenfolge aus dem Payload und zeigt auch Status mit 0 Artikeln', () => {
  const rows = pipelineRows(DATEN);
  assert.deepEqual(rows.map(r => r.key), ['idee', 'entwurf', 'fachinput_noetig', 'veroeffentlicht']);
  assert.deepEqual(rows.map(r => r.anzahl), [1, 0, 2, 5]);
  assert.equal(rows.find(r => r.key === 'fachinput_noetig').label, 'Fachinput noetig');
});

test('pipelineRows stuerzt bei fehlenden Daten nicht ab', () => {
  assert.doesNotThrow(() => pipelineRows(null));
  assert.deepEqual(pipelineRows(null), []);
  assert.deepEqual(pipelineRows({}), []);
});

test('Suchleistung wird ausdruecklich als nicht verfuegbar ausgewiesen, nie als Zahl', () => {
  assert.equal(DATEN.suchleistung, null, 'suchleistung darf keine Messwerte vortaeuschen');
  const text = suchleistungHinweis(DATEN);
  assert.match(text, /GA4/);
  assert.match(text, /Search Console/);
  assert.equal(typeof text, 'string');
});

test('suchleistungHinweis hat einen Fallback-Text, wenn das Feld fehlt', () => {
  const text = suchleistungHinweis({});
  assert.equal(typeof text, 'string');
  assert.ok(text.length > 0);
});
