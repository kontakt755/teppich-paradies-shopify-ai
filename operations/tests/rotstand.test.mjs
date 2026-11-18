// Vortagesstand der roten Probleme auf "Heute" (#2241). Nur erfundene IDs, Ablage im Temp-Ordner.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { merkeRot, leseRotstand, RotstandFehler } from '../lib/rotstand.mjs';

const datei = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rotstand-')), 'heute-rotstand.json');
const tag = t => new Date(`${t}T10:00:00Z`);

test('erster Tag: nichts ist neu; am Folgetag ist neu, was gestern nicht rot war', () => {
  const d = datei();
  assert.deepEqual(merkeRot(d, ['a', 'b'], { jetzt: tag('2026-11-17') }), { vortag: null, neu: [] });
  merkeRot(d, ['c'], { jetzt: tag('2026-11-17') });
  assert.deepEqual(leseRotstand(d).tage['2026-11-17'], ['a', 'b', 'c'], 'Vereinigung des Tages');
  assert.deepEqual(merkeRot(d, ['a', 'c', 'x'], { jetzt: tag('2026-11-18') }), { vortag: '2026-11-17', neu: ['x'] });
  // Im Laufe des Tages bleibt der Vergleich beim Vortag, nicht beim eigenen Tag.
  assert.deepEqual(merkeRot(d, ['x', 'y'], { jetzt: tag('2026-11-18') }).neu, ['x', 'y']);
});

test('Wochenende: Montag vergleicht mit dem letzten Tag mit Eintrag; nach 8 Tagen faellt Altes weg', () => {
  const d = datei();
  merkeRot(d, ['a'], { jetzt: tag('2026-11-13') });
  assert.deepEqual(merkeRot(d, ['a', 'b'], { jetzt: tag('2026-11-16') }), { vortag: '2026-11-13', neu: ['b'] });
  for (let i = 1; i <= 10; i++) merkeRot(d, ['z'], { jetzt: tag(`2026-12-${String(i).padStart(2, '0')}`) });
  assert.equal(Object.keys(leseRotstand(d).tage).length, 8);
});

test('Lesefehler-Regel: fehlende Datei leer, kaputtes JSON ist ein Fehler und wird nie ueberschrieben', () => {
  const d = datei();
  assert.deepEqual(leseRotstand(d), { tage: {} });
  fs.writeFileSync(d, '{kaputt');
  assert.throws(() => merkeRot(d, ['a']), /beschädigt/);
  assert.equal(fs.readFileSync(d, 'utf8'), '{kaputt');
  fs.writeFileSync(d, '[]');
  assert.throws(() => leseRotstand(d), /unbekanntes Format/);
});

test('Eingabe: keine Liste oder zu viele IDs werden abgelehnt', () => {
  assert.throws(() => merkeRot(datei(), null), RotstandFehler);
  assert.throws(() => merkeRot(datei(), Array.from({ length: 501 }, (_, i) => `id${i}`)), RotstandFehler);
});
