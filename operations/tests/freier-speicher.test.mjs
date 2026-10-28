import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { GIB, messeSpeicher, speicherAmpel, speicherStand, speicherText, bildlaufFrei, speicherMelden, BILDLAUF_MIN_FREI_GIB, SPEICHER_GELB_GIB, SPEICHER_ROT_GIB } from '../lib/speicher.mjs';
import { pruefen, argumente } from '../scripts/speicher-pruefen.mjs';
import { meldenUndAblegen } from '../scripts/shopwache.mjs';

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

test('Bildlauf-Bremse: unter 20 GiB nicht starten, darueber und bei Messfehler schon', () => {
  assert.equal(BILDLAUF_MIN_FREI_GIB, 20);
  const stand = frei => speicherStand('/daten', { statfs: platte(frei) });
  assert.deepEqual(bildlaufFrei(stand(19)), { frei: false, grund: 'nur 19 GiB frei, ein Bildlauf braucht mindestens 20 GiB' });
  assert.equal(bildlaufFrei(stand(20)).frei, true);
  assert.equal(bildlaufFrei(stand(25), 30).frei, false);
  assert.match(bildlaufFrei(speicherStand('/daten', { statfs: () => { throw new Error('EIO'); } })).grund, /nicht messbar/);
  assert.equal(bildlaufFrei(null).frei, true);
});

test('speicher:pruefen: Exit 1 unter der Grenze, 0 darueber, --min verstellt sie, falsche Angabe wirft', () => {
  const zeilen = [];
  const lauf = (frei, argv = []) => pruefen({ argv, dir: '/daten', statfs: platte(frei), aus: z => zeilen.push(z) });
  assert.equal(lauf(12), 1);
  assert.match(zeilen[0], /^Speicher: 12 GiB frei \(97 % belegt, ROT\) · Bildlauf NICHT starten/);
  assert.match(zeilen[1], /alte Bildordner auslagern/);
  assert.equal(lauf(45), 0);
  assert.equal(lauf(25, ['--min', '30']), 1);
  assert.throws(() => argumente(['--min', 'x']), /--min braucht eine Zahl/);
  assert.throws(() => argumente(['--schnell']), /Unbekannte Option/);
});

test('Mac-Mitteilung bei Rot hoechstens einmal je Berliner Kalendertag und nur in der Arbeitszeit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-speicher-'));
  const datei = path.join(dir, 'speicher-mitteilung.json');
  const gemeldet = [];
  const melde = (titel, text) => gemeldet.push([titel, text]);
  const rot = speicherStand('/daten', { statfs: platte(12) });
  const um = iso => speicherMelden(rot, { datei, melde, jetzt: new Date(iso) });
  // Die Shop-Wache laeuft stuendlich um :05, auch nachts: 0:05 Uhr Berlin meldet nicht und merkt sich nichts.
  assert.equal(um('2026-10-26T23:05:00Z'), false);
  assert.equal(fs.existsSync(datei), false);
  assert.equal(speicherMelden(speicherStand('/daten', { statfs: platte(30) }), { datei, melde, jetzt: JETZT }), false, 'gelb meldet nie');
  assert.equal(um('2026-10-26T05:05:00Z'), false, '6:05 Uhr Berlin ist vor der Arbeitszeit');
  assert.equal(um('2026-10-26T06:05:00Z'), true, '7:05 Uhr Berlin: erste Mitteilung des Tages');
  assert.deepEqual(gemeldet[0][0], 'Speicher fast voll');
  assert.match(gemeldet[0][1], /^12 GiB frei \(97 % belegt, ROT\)\. /);
  assert.equal(um('2026-10-26T12:05:00Z'), false, 'derselbe Tag');
  assert.equal(um('2026-10-26T18:05:00Z'), false, '19:05 Uhr, derselbe Tag');
  assert.equal(um('2026-10-27T06:05:00Z'), true, 'naechster Tag, 7:05 Uhr');
  assert.equal(JSON.parse(fs.readFileSync(datei, 'utf8')).tag, '2026-10-27');
  assert.equal(um('2026-11-01T10:05:00Z'), false, 'Sonntag');
  assert.equal(gemeldet.length, 2);
  // Kaputte Merkdatei: lieber einmal zu oft melden als gar nicht.
  fs.writeFileSync(datei, '{kaputt');
  assert.equal(um('2026-10-27T08:05:00Z'), true);
});

test('Shop-Wache meldet vor dem Ablegen: scheitert status.json (volle Platte), ist die Mitteilung schon raus', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-shopwache-voll-'));
  const ziel = path.join(dir, 'status.json');
  fs.mkdirSync(ziel);   // status.json ist ein Ordner: das Schreiben scheitert wie bei ENOSPC
  const gemeldet = [];
  const ergebnis = { ampel: 'gruen', kritisch: 0, warnungen: 0, befunde: [], seiten: [], speicher: speicherStand('/daten', { statfs: platte(12) }) };
  assert.throws(() => meldenUndAblegen(ziel, ergebnis, { melde: t => gemeldet.push(t), jetzt: JETZT }));
  assert.deepEqual(gemeldet, ['Speicher fast voll']);
  // Normalfall: abgelegt und gemeldet.
  const ziel2 = path.join(dir, 'ok', 'status.json');
  const r = meldenUndAblegen(ziel2, { ...ergebnis }, { melde: () => {}, jetzt: JETZT });
  assert.equal(r.gemeldet, true);
  assert.equal(JSON.parse(fs.readFileSync(ziel2, 'utf8')).speicher.freiGiB, 12);
});
