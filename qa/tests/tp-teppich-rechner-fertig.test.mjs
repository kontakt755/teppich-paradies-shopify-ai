// Hero-Rechner (assets/tp-teppich-rechner.js): Art "fertig" rechnet die Pauschale
// mit und beachtet die Gewichtsgrenze - wie der Konfigurator auf der Produktseite.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

createRequire(import.meta.url)('../../assets/tp-masstepich-rechnung.js');
const M = globalThis.TPMass;
const src = readFileSync(new URL('../../assets/tp-teppich-rechner.js', import.meta.url), 'utf8');
const start = src.indexOf('  function preisFuer(');
const ende = src.indexOf('\n  }\n', start) + 4;
assert.ok(start > 0 && ende > start, 'preisFuer nicht gefunden');
const preisFuer = vm.runInNewContext('(' + src.slice(start, ende).trim().replace(/^function preisFuer/, 'function') + ')');

const fertig = { art: 'fertig', max_l: 600, mindest: 0, kg_qm: 4.4, max_kg: 30, farben: [{ id: 1, p: 99, alt: 0, w: 200 }] };

test('Hero-Rechner: fertig rechnet die Pauschale je Teppich mit', () => {
  const r = preisFuer(M, fertig, null, 150, 200, 1499);
  assert.equal(r.summe, 300 * 99 + 1499);
});

test('Hero-Rechner: fertig ohne kaufbare Pauschale hat keinen Preis', () => {
  assert.equal(preisFuer(M, fertig, null, 150, 200, null).passt, false);
});

test('Hero-Rechner: fertig ueber 30 kg passt nicht', () => {
  const r = preisFuer(M, fertig, null, 200, 400, 1499);
  assert.equal(r.passt, false);
  assert.equal(r.grund, 'mass');
});

test('Hero-Rechner: andere Arten unveraendert (keine Pauschale)', () => {
  const t = { ...fertig, art: 'cover', kg_qm: 0, max_kg: 0 };
  assert.equal(preisFuer(M, t, null, 150, 200, 1499).summe, 300 * 99);
});
