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

// service.kante_inklusive (Daten: "kante_inkl"): Kettelung steckt im m2-Preis.
const gekettelt = { art: 'ketteln', max_l: 600, mindest: 9900, kg_qm: 0, max_kg: 0, farben: [{ id: 2, p: 89, alt: 0, w: 400 }] };

test('Hero-Rechner: Ketteln ohne kante_inkl rechnet die Kante wie bisher', () => {
  assert.equal(preisFuer(M, gekettelt, 19, 200, 300, null).summe, 600 * 89 + 1000 * 19);
  assert.equal(preisFuer(M, gekettelt, null, 200, 300, null).passt, false, 'ohne Kettelpreis kein Preis');
  assert.equal(preisFuer(M, { ...gekettelt, kante_inkl: false }, 19, 200, 300, null).summe, 600 * 89 + 1000 * 19);
});

test('Hero-Rechner: kante_inkl rechnet nur die Flaeche, auch ohne Kettelpreis', () => {
  const t = { ...gekettelt, kante_inkl: true };
  assert.equal(preisFuer(M, t, 19, 200, 300, null).summe, 600 * 89);
  assert.equal(preisFuer(M, t, null, 200, 300, null).summe, 600 * 89);
});

test('Hero-Rechner: kante_inkl - Mindestpreis allein ueber die Flaeche', () => {
  const r = preisFuer(M, { ...gekettelt, kante_inkl: true }, 19, 50, 50, null);
  assert.equal(r.summe, Math.ceil(9900 / 89) * 89);
  assert.equal(r.mindest, true);
});
