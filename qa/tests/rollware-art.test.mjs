import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

// Browser-Skript (UMD an globalThis) - einmal laden.
createRequire(import.meta.url)('../../assets/tp-rollware-art.js');
const A = globalThis.TPRollwareArt;

const opts = (vals) => [{ name: 'Farbe', values: ['Sand', 'Grau'] }, { name: 'Breite', values: vals }];
const v = (farbe, breite, extra = {}) => ({
  id: `${farbe}-${breite}`, options: [farbe, breite], price: '65.90', available: true, wunschmass: true, ...extra
});

test('Breitenoption wird auch mit "Wunschmaß" als Wert erkannt', () => {
  assert.equal(A.findWidthOption(opts(['400cm', '500cm'])), 1);
  assert.equal(A.findWidthOption(opts(['400cm', 'Wunschmaß'])), 1);
  assert.equal(A.findWidthOption(opts(['400 cm', 'Wunschmass'])), 1);
  // Nur "Wunschmaß" ohne echte Breite ist keine Breitenoption.
  assert.equal(A.findWidthOption(opts(['Wunschmaß'])), -1);
  // Fremde Werte machen die Option unbrauchbar.
  assert.equal(A.findWidthOption(opts(['400cm', 'gross'])), -1);
});

test('Rollenbreiten sind numerisch, sortiert, ohne Wunschmaß', () => {
  const vs = [v('Sand', '500cm'), v('Sand', '400cm'), v('Sand', 'Wunschmaß'), v('Grau', '400cm')];
  assert.deepEqual(A.numericWidths(vs, 1), [400, 500]);
  assert.deepEqual(A.numericWidths(vs, -1), []);
});

test('Raummass faellt geschlossen aus: jede Bedingung einzeln', () => {
  const ok = v('Sand', 'Wunschmaß', { price: '88.97' });
  assert.equal(A.wunschOk(ok, 1), true);
  assert.equal(A.wunschOk(v('Sand', '400cm'), 1), false, 'keine Wunschmass-Variante');
  assert.equal(A.wunschOk({ ...ok, available: false }, 1), false, 'nicht bestellbar');
  assert.equal(A.wunschOk({ ...ok, price: '0' }, 1), false, 'ohne Preis');
  assert.equal(A.wunschOk({ ...ok, wunschmass: false }, 1), false, 'Bezugsquelle schliesst aus');
  assert.equal(A.wunschOk(ok, -1), false, 'ohne Breitenoption');
  assert.equal(A.wunschOk(null, 1), false);
});

test('Kleinste passende Rolle', () => {
  assert.equal(A.rolleFuer(250, [400, 500]), 400);
  assert.equal(A.rolleFuer(400, [400, 500]), 400);
  assert.equal(A.rolleFuer(401, [400, 500]), 500);
  assert.equal(A.rolleFuer(501, [400, 500]), 0);
  assert.equal(A.rolleFuer(100, []), 0);
});

test('Breitenpruefung: leer, zu schmal, zu breit, gueltig', () => {
  assert.equal(A.pruefeBreite(0, 50, 500), 'leer');
  assert.equal(A.pruefeBreite(NaN, 50, 500), 'leer');
  assert.match(A.pruefeBreite(30, 50, 500), /mindestens 50/);
  assert.match(A.pruefeBreite(501, 50, 500), /Breiter als 500/);
  assert.equal(A.pruefeBreite(250, 50, 500), '');
  assert.equal(A.pruefeBreite(500, 50, 500), '');
});

test('Meterware-Vergleich rechnet mit echten Variantenpreisen, nicht mit einem Faktor', () => {
  const rateMeter = (w) => (w === 400 || w === 500 ? 65.9 : 0);
  // 2,50 x 5,50 im Raummass zu 88,97 EUR/m² gegen 4,00 x 5,50 Meterware zu 65,90
  const a = A.meterwareGuenstiger(250, 550, 88.97, [400, 500], rateMeter);
  assert.equal(a.rolle, 400);
  assert.equal(a.totalRaum.toFixed(2), '1223.34');
  assert.equal(a.totalMeter.toFixed(2), '1449.80');
  assert.equal(a.guenstiger, false);
  // 3,50 x 5,50: Raummass 1712,67 gegen Meterware 1449,80 - jetzt ist Meterware billiger
  const b = A.meterwareGuenstiger(350, 550, 88.97, [400, 500], rateMeter);
  assert.equal(b.guenstiger, true);
  // Kipppunkt bei 65,90 x 1,35 = 88,965: ab ~296 cm dreht es sich (ohne Zugabe)
  assert.equal(A.meterwareGuenstiger(296, 550, 88.97, [400, 500], rateMeter).guenstiger, false);
  assert.equal(A.meterwareGuenstiger(297, 550, 88.97, [400, 500], rateMeter).guenstiger, true);
});

test('Meterware-Vergleich ohne Grundlage liefert null', () => {
  const rateMeter = () => 65.9;
  assert.equal(A.meterwareGuenstiger(250, 0, 88.97, [400], rateMeter), null, 'ohne Laenge');
  assert.equal(A.meterwareGuenstiger(250, 550, 0, [400], rateMeter), null, 'ohne Raummass-Preis');
  assert.equal(A.meterwareGuenstiger(600, 550, 88.97, [400, 500], rateMeter), null, 'breiter als jede Rolle');
  assert.equal(A.meterwareGuenstiger(250, 550, 88.97, [400], () => 0), null, 'Rolle ohne Variante');
});
