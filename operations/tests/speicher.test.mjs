import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { erzeugeSpeicher, STANDARD_DATEI } from '../state/speicher.mjs';
import { AUFTRAG_STATUS } from '../lib/status.mjs';

// Nur erfundene Daten: keine echten Kunden, keine echten Bestellnummern.
function frisch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-speicher-'));
  return erzeugeSpeicher(path.join(dir, 'auftraege.jsonl'));
}

test('Standardpfad liegt unter .router (gitignored)', () => {
  assert.ok(STANDARD_DATEI.includes(path.join('.router', 'ops-state')), STANDARD_DATEI);
});

test('leerer Speicher liefert nichts', () => {
  const s = frisch();
  assert.equal(s.stand('#T1'), null);
  assert.deepEqual(s.verlauf('#T1'), []);
  assert.equal(s.alleStaende().size, 0);
});

test('notiere haengt an und stand liefert den letzten Eintrag', () => {
  const s = frisch();
  s.notiere({ auftrag: '#T1', status: AUFTRAG_STATUS.PRUEFUNG, von: 'Test Mitarbeiterin' });
  const e = s.notiere({ auftrag: '#T1', status: AUFTRAG_STATUS.FREIGEGEBEN, von: 'Test Mitarbeiterin' });
  assert.equal(e.status, AUFTRAG_STATUS.FREIGEGEBEN);
  assert.equal(e.vorher, AUFTRAG_STATUS.PRUEFUNG);
  assert.ok(!Number.isNaN(Date.parse(e.zeit)));
  assert.equal(s.verlauf('#T1').length, 2);
  assert.equal(s.stand('#T1').status, AUFTRAG_STATUS.FREIGEGEBEN);
});

test('alleStaende liefert je Auftrag den letzten Eintrag', () => {
  const s = frisch();
  s.notiere({ auftrag: '#T1', status: AUFTRAG_STATUS.PRUEFUNG, von: 'A' });
  s.notiere({ auftrag: '#T2', status: AUFTRAG_STATUS.SPAETER, von: 'A' });
  s.notiere({ auftrag: '#T1', status: AUFTRAG_STATUS.FREIGEGEBEN, von: 'A' });
  const m = s.alleStaende();
  assert.equal(m.size, 2);
  assert.equal(m.get('#T1').status, AUFTRAG_STATUS.FREIGEGEBEN);
  assert.equal(m.get('#T2').status, AUFTRAG_STATUS.SPAETER);
});

test('unerlaubter Uebergang wirft', () => {
  const s = frisch();
  s.notiere({ auftrag: '#T1', status: AUFTRAG_STATUS.VERSAND, von: 'A' });
  assert.throws(() => s.notiere({ auftrag: '#T1', status: AUFTRAG_STATUS.EINKAUF, von: 'A' }), /nicht erlaubt/);
});

test('unbekannter Status und fehlende Felder werfen', () => {
  const s = frisch();
  assert.throws(() => s.notiere({ auftrag: '#T1', status: 'QUATSCH', von: 'A' }), /unbekannter Status/);
  assert.throws(() => s.notiere({ auftrag: '#T1', status: AUFTRAG_STATUS.PRUEFUNG }), /von/);
  assert.throws(() => s.notiere({ status: AUFTRAG_STATUS.PRUEFUNG, von: 'A' }), /auftrag fehlt/);
});

test('defekte Zeilen werden uebersprungen, nicht geworfen', () => {
  const s = frisch();
  s.notiere({ auftrag: '#T1', status: AUFTRAG_STATUS.PRUEFUNG, von: 'A' });
  fs.appendFileSync(s.datei, 'kein json\n{"auftrag":"#T9"}\n{"auftrag":"#T9","status":"NIXDA","zeit":"x"}\n\n');
  s.notiere({ auftrag: '#T1', status: AUFTRAG_STATUS.FREIGEGEBEN, von: 'A' });
  assert.equal(s.eintraege().length, 2);
  assert.equal(s.stand('#T9'), null);
});

test('Datei ist append-only: alte Zeilen bleiben stehen', () => {
  const s = frisch();
  s.notiere({ auftrag: '#T1', status: AUFTRAG_STATUS.PRUEFUNG, von: 'A' });
  s.notiere({ auftrag: '#T1', status: AUFTRAG_STATUS.FREIGEGEBEN, von: 'A' });
  const zeilen = fs.readFileSync(s.datei, 'utf8').trim().split('\n');
  assert.equal(zeilen.length, 2);
  assert.match(zeilen[0], /PRUEFUNG/);
});
