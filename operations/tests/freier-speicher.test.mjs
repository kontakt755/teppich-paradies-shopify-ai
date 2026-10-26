import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { GIB, messeSpeicher, speicherAmpel, speicherStand, speicherText, SPEICHER_GELB_GIB, SPEICHER_ROT_GIB } from '../lib/speicher.mjs';

/** statfs-Ersatz: Blockgroesse 4096, frei und gesamt in GiB. */
const platte = (freiGiB, gesamtGiB = 460) => () => ({ bsize: 4096, bavail: (freiGiB * GIB) / 4096, blocks: (gesamtGiB * GIB) / 4096 });
const JETZT = new Date('2026-10-26T12:05:00Z');

test('Ampel: gruen ab 40 GiB, gelb darunter, rot unter 20 GiB', () => {
  assert.equal(speicherAmpel(SPEICHER_GELB_GIB * GIB), 'gruen');
  assert.equal(speicherAmpel(SPEICHER_GELB_GIB * GIB - 1), 'gelb');
  assert.equal(speicherAmpel(SPEICHER_ROT_GIB * GIB), 'gelb');
  assert.equal(speicherAmpel(SPEICHER_ROT_GIB * GIB - 1), 'rot');
  assert.equal(speicherAmpel(NaN), 'unbekannt');
});

test('Stand wie am 26.10.: 23 von 460 GiB frei ist gelb, 95 % belegt', () => {
  const s = speicherStand('/daten', { statfs: platte(23), jetzt: JETZT });
  assert.equal(s.ampel, 'gelb');
  assert.equal(s.freiGiB, 23);
  assert.equal(s.belegtProzent, 95);
  assert.equal(s.gemessenAm, JETZT.toISOString());
  assert.deepEqual(s.grenzenGiB, { gelb: 40, rot: 20 });
  assert.equal(speicherText(s), '23 GiB frei (95 % belegt, GELB)');
  assert.equal(speicherStand('/daten', { statfs: platte(12) }).ampel, 'rot');
  assert.equal(speicherStand('/daten', { statfs: platte(120) }).ampel, 'gruen');
});

test('Messfehler ist "unbekannt", nie ein Absturz und nie ein Alarm', () => {
  const kaputt = () => { throw new Error('ENOENT'); };
  assert.equal(messeSpeicher('/gibt/es/nicht', { statfs: kaputt }), null);
  const s = speicherStand('/gibt/es/nicht', { statfs: kaputt });
  assert.equal(s.ampel, 'unbekannt');
  assert.equal(s.freiBytes, null);
  assert.equal(speicherText(s), 'Speicher nicht messbar');
  assert.equal(messeSpeicher('/x', { statfs: () => ({ bsize: 4096, bavail: 1, blocks: 0 }) }), null, 'Platte ohne Groesse');
});

test('echte Messung des Temp-Ordners liefert plausible Zahlen', () => {
  const m = messeSpeicher(os.tmpdir());
  assert.ok(m, 'statfs gibt es ab Node 18.15');
  assert.ok(m.freiBytes >= 0 && m.freiBytes <= m.gesamtBytes);
});
