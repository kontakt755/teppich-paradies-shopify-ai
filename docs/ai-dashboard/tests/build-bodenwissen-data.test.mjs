import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPayload, pipelineZaehlen, ueberarbeitungsbedarf, bildbedarfe,
  expertInputZaehlen, problemFinderZaehlen, SUCHLEISTUNG_HINWEIS,
} from '../../../scripts/build-bodenwissen-data.mjs';
import { STATUS, STATUS_OFFEN } from '../../../scripts/bodenwissen-guard.mjs';

const HEUTE = new Date('2026-09-23T10:00:00Z');

const artikelEintrag = (over = {}) => ({
  bereich: 'teppichboden',
  datei: '/repo/content/ratgeber/teppichboden/ausmessen.json',
  html: '<p>Text</p>',
  meta: {
    id: 'RAT-TB-001', handle: 'ausmessen', title: 'Teppichboden richtig ausmessen',
    blog: 'ratgeber-teppichboden', cluster: 'teppichboden/planen-messen', intent: 'anleitung',
    frage: 'Wie messe ich?', begriff: 'teppichboden ausmessen', status: 'veroeffentlicht',
    bilder: [], pruefung: {}, expert_input: [],
    metafields: { kurzantwort: 'Antwort.' },
    ...over,
  },
});

const lexikonEintrag = (over = {}) => ({
  datei: '/repo/content/lexikon/nadelvlies.json',
  meta: { handle: 'nadelvlies', begriff: 'Nadelvlies', status: 'freigegeben', kurz: 'kurz', expert_input: [], ...over },
});

const problemEintrag = (over = {}) => ({
  datei: '/repo/content/probleme/pvc-blasen.json',
  meta: { handle: 'pvc-blasen', symptom: 'Blasen im PVC-Boden', belag: 'PVC', ursachen: ['x'], artikel: '', profi_noetig: true, status: 'idee', ...over },
});

test('pipelineZaehlen zaehlt je Status, auch Status ohne Artikel bleiben bei 0', () => {
  const artikel = [
    artikelEintrag({ handle: 'a', status: 'entwurf' }),
    artikelEintrag({ handle: 'b', status: 'entwurf' }),
    artikelEintrag({ handle: 'c', status: 'veroeffentlicht' }),
  ];
  const z = pipelineZaehlen(artikel);
  assert.equal(z.entwurf, 2);
  assert.equal(z.veroeffentlicht, 1);
  assert.equal(z.idee, 0);
  assert.deepEqual(Object.keys(z), STATUS);
});

test('pipelineZaehlen ignoriert einen unbekannten Status statt ihn zu erfinden', () => {
  const artikel = [artikelEintrag({ status: 'kaputter-status' })];
  const z = pipelineZaehlen(artikel);
  assert.equal(Object.values(z).reduce((a, b) => a + b, 0), 0);
});

test('ueberarbeitungsbedarf findet nur Artikel mit abgelaufener naechster Pruefung, sortiert nach Ueberfaelligkeit', () => {
  const artikel = [
    artikelEintrag({ handle: 'alt', pruefung: { naechste: '2026-01-01' } }),
    artikelEintrag({ handle: 'sehr-alt', pruefung: { naechste: '2025-01-01' } }),
    artikelEintrag({ handle: 'zukunft', pruefung: { naechste: '2030-01-01' } }),
    artikelEintrag({ handle: 'ohne-datum', pruefung: {} }),
  ];
  const liste = ueberarbeitungsbedarf(artikel, HEUTE);
  assert.deepEqual(liste.map(x => x.handle), ['sehr-alt', 'alt']);
  assert.ok(liste[0].tageUeberfaellig > liste[1].tageUeberfaellig);
});

test('bildbedarfe zaehlt nur bilder mit status "offen"', () => {
  const artikel = [
    artikelEintrag({ handle: 'a', bilder: [{ zweck: 'Foto 1', status: 'offen' }, { zweck: 'Foto 2', status: 'erledigt' }] }),
    artikelEintrag({ handle: 'b', bilder: [{ zweck: 'Foto 3', status: 'offen' }] }),
  ];
  const b = bildbedarfe(artikel);
  assert.equal(b.offen, 2);
  assert.deepEqual(b.items.map(i => i.zweck), ['Foto 1', 'Foto 3']);
});

test('expertInputZaehlen summiert Ratgeber und Lexikon getrennt und gesamt', () => {
  const artikel = [artikelEintrag({ handle: 'a', expert_input: ['Frage 1', 'Frage 2'] })];
  const lexikon = [lexikonEintrag({ handle: 'x', expert_input: ['Frage 3'] }), lexikonEintrag({ handle: 'y', expert_input: [] })];
  const ei = expertInputZaehlen(artikel, lexikon);
  assert.equal(ei.gesamt, 3);
  assert.equal(ei.ratgeber, 2);
  assert.equal(ei.lexikon, 1);
  assert.deepEqual(ei.items.map(i => i.quelle), ['ratgeber', 'ratgeber', 'lexikon']);
});

test('problemFinderZaehlen trennt Probleme mit und ohne Ziel-Artikel', () => {
  const probleme = [problemEintrag({ handle: 'a', artikel: '' }), problemEintrag({ handle: 'b', artikel: 'ausmessen' }), problemEintrag({ handle: 'c', artikel: '  ' })];
  const pf = problemFinderZaehlen(probleme);
  assert.deepEqual(pf, { gesamt: 3, mitZiel: 1, ohneZiel: 2 });
});

test('buildPayload bindet das Gate ein (importierte pruefe-Funktion, kein eigener Prozess) und macht Pfade relativ', () => {
  const artikel = [artikelEintrag({ handle: 'a', status: 'veroeffentlicht', metafields: { kurzantwort: '' } })]; // Pflichtfeld fehlt -> Gate-Fehler
  const payload = buildPayload({ artikel, lexikon: [], probleme: [], wurzel: '/repo', heute: HEUTE });
  assert.equal(payload.erzeugtAm, HEUTE.toISOString());
  assert.deepEqual(payload.statusReihenfolge, STATUS);
  assert.equal(payload.gesamt.artikel, 1);
  assert.ok(payload.gate.fehler.length >= 1);
  assert.ok(payload.gate.fehler.every(f => !f.ort.startsWith('/')), 'Pfade duerfen nicht absolut im Dashboard landen');
  assert.equal(payload.gate.zahlen.artikel, 1);
});

test('buildPayload haelt Suchleistung strikt getrennt von den echten Zahlen - keine Null, die wie eine Messung aussieht', () => {
  const payload = buildPayload({ artikel: [], lexikon: [], probleme: [], wurzel: '/repo', heute: HEUTE });
  assert.equal(payload.suchleistung, null);
  assert.equal(payload.suchleistungHinweis, SUCHLEISTUNG_HINWEIS);
  assert.match(payload.suchleistungHinweis, /GA4/);
  assert.match(payload.suchleistungHinweis, /Search Console/);
});

test('STATUS_OFFEN aus bodenwissen-guard.mjs bleibt fuer freigegeben/veroeffentlicht gueltig (Regressionsschutz fuer den Import)', () => {
  assert.deepEqual(STATUS_OFFEN, ['freigegeben', 'veroeffentlicht']);
});
