// Prueft den Rechenkern der Bodenwissen-Vorschlaege. Das Asset ist eine
// UMD-Sammlung: im Browser haengt es sich an window, hier laedt es der Test per
// createRequire - eine Quelle, kein zweiter Code. Gleiches Muster wie
// qa/tests/boden-rechner.test.mjs und qa/tests/masstepich-rechnung.test.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { falten, suchen } = require(path.resolve(import.meta.dirname, '../../assets/tp-bodenwissen-suche.js'));

const index = [
  { t: 'Teppichboden richtig ausmessen', u: '/blogs/r/ausmessen', k: 'Planung', s: '' },
  { t: 'Rollenbreite wählen und Bahnen planen', u: '/blogs/r/rollenbreite', k: 'Planung', s: '' },
  { t: 'Rücken', u: '/pages/bodenlexikon#ruecken', k: 'Begriff', s: 'Trägerschicht' },
  { t: 'Teppichboden wirft Wellen', u: '/pages/bodenprobleme', k: 'Problem', s: 'Teppichboden' },
].map(e => ({ ...e, _s: falten(`${e.t} ${e.k} ${e.s}`) }));

test('falten macht Umlaute und Schreibweisen vergleichbar', () => {
  assert.equal(falten('Rückseite'), 'rueckseite');
  assert.equal(falten('  Groß   schreiben '), 'gross schreiben');
});

test('Umlaut-Eingabe und ae-Schreibweise finden dasselbe', () => {
  assert.equal(suchen(index, 'rücken').length, 1);
  assert.equal(suchen(index, 'ruecken').length, 1);
  assert.equal(suchen(index, 'rucken').length, 0, 'ohne Umlaut und ohne ue ist es ein anderes Wort');
});

test('unter zwei Zeichen wird nicht vorgeschlagen', () => {
  assert.deepEqual(suchen(index, 't'), []);
  assert.deepEqual(suchen(index, ''), []);
});

test('mehrere Woerter muessen alle vorkommen, Reihenfolge egal', () => {
  assert.equal(suchen(index, 'bahnen rollenbreite').length, 1);
  assert.equal(suchen(index, 'rollenbreite teppich').length, 0);
});

test('Treffer am Titelanfang stehen oben', () => {
  const treffer = suchen(index, 'teppichboden');
  assert.equal(treffer.length, 2);
  assert.ok(treffer.every(e => e.t.startsWith('Teppichboden')));
  assert.equal(treffer[0].t, 'Teppichboden richtig ausmessen');
});

test('es wird auch in Art und Nebenfeld gesucht, nicht nur im Titel', () => {
  assert.equal(suchen(index, 'traegerschicht').length, 1, 'Synonym aus dem Feld s');
  assert.equal(suchen(index, 'planung').length, 2, 'Art des Inhalts');
});

test('der Blogtitel gehoert nicht ins Suchfeld eines Artikels', () => {
  // Sonst liefert die Eingabe des Blognamens jeden Artikel dieses Blogs.
  assert.equal(suchen(index, 'rollenbreite teppich').length, 0);
});

test('hoechstens acht Vorschlaege', () => {
  const viele = Array.from({ length: 30 }, (_, i) => ({ t: `Teppich ${i}`, u: `/x/${i}`, k: 'Ratgeber', s: '' }))
    .map(e => ({ ...e, _s: falten(`${e.t} ${e.k} ${e.s}`) }));
  assert.equal(suchen(viele, 'teppich').length, 8);
});

test('ohne Treffer kommt eine leere Liste, kein Fehler', () => {
  assert.deepEqual(suchen(index, 'zimmerpflanze'), []);
  assert.deepEqual(suchen([], 'teppich'), []);
});
