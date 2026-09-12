/*
 * Der Umriss des Verlegegebiets liegt als SVG-Pfad ueber einem festen
 * Kartenbild. Passt eine Reglerstufe nicht in den Ausschnitt, schneidet die
 * Karte den Gebietsrand ab - sichtbar, aber leicht zu uebersehen, weil nur
 * die voreingestellte Stufe beim Bauen angeschaut wird. Genau das ist am
 * 2026-09-10 passiert: die 60-km-Stufe ragte 15 Bildpunkte ueber den Rand.
 *
 * Dieser Test prueft jede Stufe gegen beide viewBox-Werte und haelt zusaetzlich
 * fest, dass Snippet und Schema dieselben Stufen kennen.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const WURZEL = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const SNIPPET = path.join(WURZEL, 'snippets', 'tp-verlegegebiet-flaeche.liquid');
const SEKTION = path.join(WURZEL, 'sections', 'tp-verlegegebiet.liquid');

const snippet = readFileSync(SNIPPET, 'utf8');
const sektion = readFileSync(SEKTION, 'utf8');

/** Alle Stufen mit ihrem Pfad, so wie die Sektion sie rendert. */
function pfade() {
  const gefunden = new Map();
  const muster = /when\s+(\d+)\s*-%\}\s*<path[^>]*\bd="([^"]+)"/g;
  for (const treffer of snippet.matchAll(muster)) {
    gefunden.set(Number(treffer[1]), treffer[2]);
  }
  return gefunden;
}

/** Aeussere Abmessungen eines Pfades in Desktop-Bildpunkten. */
function grenzen(d) {
  const zahlen = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const x = zahlen.filter((_, i) => i % 2 === 0);
  const y = zahlen.filter((_, i) => i % 2 === 1);
  return { xMin: Math.min(...x), xMax: Math.max(...x), yMin: Math.min(...y), yMax: Math.max(...y) };
}

/** viewBox der Sektion anhand der Klasse des SVG. */
function ausschnitt(klasse) {
  const muster = new RegExp(`class="tp-vg__gebiet tp-vg__gebiet--${klasse}" viewBox="([^"]+)"`);
  const treffer = sektion.match(muster);
  assert.ok(treffer, `Kein viewBox fuer tp-vg__gebiet--${klasse} in der Sektion gefunden.`);
  const [x, y, breite, hoehe] = treffer[1].split(/\s+/).map(Number);
  return { x, y, breite, hoehe };
}

// Die Kontur wird mit non-scaling-stroke gezeichnet, liegt also je zur Haelfte
// ausserhalb des Pfades. In Nutzereinheiten faellt das auf der schmalen Karte
// doppelt so stark aus, weil ihre viewBox den doppelten Ausschnitt zeigt.
const STRICH_BREIT = 1;
const STRICH_SCHMAL = 2.1;

test('jeder Pfad ist gefuellt und beginnt mit einem moveto', () => {
  // Die Stufenliste steht bewusst nicht hier: sie kommt aus dem Schema, und
  // eine zweite Kopie waere genau die Quelle, die stillschweigend veraltet.
  const alle = pfade();
  assert.ok(alle.size >= 2, 'Es sind weniger als zwei Stufen hinterlegt.');
  for (const [km, d] of alle) {
    assert.match(d, /^M-?\d/, `Der Pfad der Stufe ${km} km beginnt nicht mit einem moveto.`);
    assert.ok(d.length > 100, `Der Pfad der Stufe ${km} km ist verdaechtig kurz.`);
  }
});

test('Snippet und Schema kennen dieselben Stufen', () => {
  const stufen = [...pfade().keys()].sort((a, b) => a - b);
  const min = Number(sektion.match(/"id": "radius"[\s\S]*?"min": (\d+)/)[1]);
  const max = Number(sektion.match(/"id": "radius"[\s\S]*?"max": (\d+)/)[1]);
  const schritt = Number(sektion.match(/"id": "radius"[\s\S]*?"step": (\d+)/)[1]);

  const erwartet = [];
  for (let r = min; r <= max; r += schritt) erwartet.push(r);
  assert.deepEqual(
    stufen,
    erwartet,
    'Der Regler bietet Stufen an, fuer die kein Pfad hinterlegt ist (oder umgekehrt). '
      + 'RADIEN in scripts/build-verlegegebiet-karte.mjs und das Schema muessen zusammenpassen.',
  );
});

test('kein Umriss ragt aus dem breiten Kartenausschnitt', () => {
  const feld = ausschnitt('breit');
  for (const [km, d] of pfade()) {
    const g = grenzen(d);
    assert.ok(g.xMin - STRICH_BREIT >= feld.x, `${km} km wird links abgeschnitten (${g.xMin} < ${feld.x}).`);
    assert.ok(g.xMax + STRICH_BREIT <= feld.x + feld.breite, `${km} km wird rechts abgeschnitten.`);
    assert.ok(g.yMin - STRICH_BREIT >= feld.y, `${km} km wird oben abgeschnitten (${g.yMin} < ${feld.y}).`);
    assert.ok(g.yMax + STRICH_BREIT <= feld.y + feld.hoehe, `${km} km wird unten abgeschnitten.`);
  }
});

test('kein Umriss ragt aus dem schmalen Kartenausschnitt', () => {
  const feld = ausschnitt('schmal');
  for (const [km, d] of pfade()) {
    const g = grenzen(d);
    assert.ok(g.xMin - STRICH_SCHMAL >= feld.x, `${km} km wird links abgeschnitten (${g.xMin} < ${feld.x}).`);
    assert.ok(g.xMax + STRICH_SCHMAL <= feld.x + feld.breite, `${km} km wird rechts abgeschnitten.`);
    assert.ok(g.yMin - STRICH_SCHMAL >= feld.y, `${km} km wird oben abgeschnitten (${g.yMin} < ${feld.y}).`);
    assert.ok(g.yMax + STRICH_SCHMAL <= feld.y + feld.hoehe, `${km} km wird unten abgeschnitten.`);
  }
});

test('das Kartenbild deckt denselben Ausschnitt wie die viewBox', () => {
  // Die breite Karte ist 1:1 in Bildpunkten notiert, die schmale im halben
  // Massstab. Laufen Bildgroesse und viewBox auseinander, sitzt der Umriss
  // versetzt ueber der Karte.
  const breit = ausschnitt('breit');
  const schmal = ausschnitt('schmal');

  const bild = sektion.match(/width="(\d+)"\s*\n\s*height="(\d+)"/);
  assert.ok(bild, 'Keine Bildmasse in der Sektion gefunden.');
  assert.equal(Number(bild[1]), breit.breite, 'Bildbreite und viewBox der breiten Karte weichen ab.');
  assert.equal(Number(bild[2]), breit.hoehe, 'Bildhoehe und viewBox der breiten Karte weichen ab.');

  const verhaeltnis = sektion.match(/aspect-ratio: (\d+) \/ (\d+);/g).map((z) => z.match(/(\d+) \/ (\d+)/));
  const schmalVerhaeltnis = verhaeltnis.find((v) => Number(v[1]) === schmal.breite / 2);
  assert.ok(
    schmalVerhaeltnis && Number(schmalVerhaeltnis[2]) === schmal.hoehe / 2,
    'Das aspect-ratio der schmalen Karte passt nicht zu ihrer viewBox.',
  );
});
