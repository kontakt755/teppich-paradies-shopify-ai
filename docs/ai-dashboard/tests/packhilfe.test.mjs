import test from 'node:test';
import assert from 'node:assert/strict';
import { berechnePackhilfe } from '../lib/packhilfe.mjs';
const p = extra => ({ id: 'synthetisch', breiteCm: 120, laengeCm: 170, form: 'rechteck', menge: 1, gewichtGm2: 2000, dickeMm: 10, ...extra });
const nahe = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
test('Rechteck, Einheiten und Bruttogewicht ohne erfundene Verpackung', () => {
  const a = berechnePackhilfe([p()]);
  nahe(a.flaecheM2, 2.04); nahe(a.produktgewichtKg, 4.08);
  assert.equal(a.bruttogewichtKg, null);
  assert.ok(a.fehlend.includes('Verpackungsgewicht in kg fehlt'));
  nahe(berechnePackhilfe([p()], { verpackungKg: 0.5 }).bruttogewichtKg, 4.58);
  nahe(berechnePackhilfe([p()], { verpackungKg: 0 }).bruttogewichtKg, 4.08);
});
test('gemeinsame Rollenachse bleibt mindestens 120cm; Mengen und verschiedene Materialstaerken korrekt', () => {
  const a = berechnePackhilfe([p({ menge: 2 }), p({ id: 'zweite', breiteCm: 80, gewichtGm2: 1000, dickeMm: 5 })], { kernCm: 4, zugabeCm: 2, verpackungKg: 1 });
  assert.equal(a.rollenachseCm, 120); assert.equal(a.laengeCm, 122);
  assert.equal(a.durchmesserCm, Math.ceil(Math.sqrt(16 + 4 / Math.PI * (170 * 1 * 2 + 170 * 0.5)) + 2));
  nahe(a.flaecheM2, 5.44); nahe(a.produktgewichtKg, 9.52); nahe(a.bruttogewichtKg, 10.52);
  assert.equal(a.breiteCm, a.durchmesserCm); assert.equal(a.hoeheCm, a.durchmesserCm);
});
test('unterschiedliche Breiten werden nicht zu volumenbasiert zu kleinem Durchmesser gemittelt', () => {
  const a = berechnePackhilfe([p(), p({ breiteCm: 20 })], { zugabeCm: 0 });
  assert.equal(a.durchmesserCm, Math.ceil(Math.sqrt(4 / Math.PI * 340)));
});
test('Ellipse und Rund flaechenrichtig, Rollenquerschnitt konservativ mit voller Aussenlaenge', () => {
  const e = berechnePackhilfe([p({ form: 'ellipse', breiteCm: 100, laengeCm: 200 })]);
  nahe(e.flaecheM2, Math.PI / 2); nahe(e.produktgewichtKg, Math.PI);
  const r = berechnePackhilfe([p({ form: 'rund', breiteCm: 100, laengeCm: 100, menge: 2 })]);
  nahe(r.flaecheM2, Math.PI / 2);
  assert.equal(r.rollenachseCm, 100);
  assert.equal(berechnePackhilfe([p({ form: 'rund' })]).flaecheM2, null);
});
test('Aussenmasse absteigend auch wenn Durchmesser groesser als Rollenachse ist', () => {
  const a = berechnePackhilfe([p({ breiteCm: 10, laengeCm: 1000, dickeMm: 100 })], { zugabeCm: 0 });
  assert.ok(a.durchmesserCm > a.rollenachseCm);
  assert.equal(a.laengeCm, a.durchmesserCm); assert.equal(a.breiteCm, a.durchmesserCm); assert.equal(a.hoeheCm, 10);
});
test('fehlende Angaben lassen nur betroffene Bereiche offen und niemals Teilgewichte als Gesamtgewicht erscheinen', () => {
  const g = berechnePackhilfe([p({ gewichtGm2: null })]);
  assert.equal(g.produktgewichtKg, null); assert.equal(g.bruttogewichtKg, null); assert.equal(g.flaecheM2, 2.04); assert.ok(g.durchmesserCm > 0);
  const d = berechnePackhilfe([p({ dickeMm: null })], { verpackungKg: 1 });
  assert.equal(d.durchmesserCm, null); assert.equal(d.breiteCm, null); assert.equal(d.rollenachseCm, 120); nahe(d.produktgewichtKg, 4.08);
  assert.equal(berechnePackhilfe([p(), p({ breiteCm: null })]).produktgewichtKg, null);
});
test('negative, unendliche oder textuelle Eingaben und ungueltige Mengen werden nicht als plausible Werte gerechnet', () => {
  for (const v of [-1, 0, Infinity, NaN, '120']) {
    const a = berechnePackhilfe([p({ breiteCm: v })]);
    assert.equal(a.flaecheM2, null); assert.equal(a.rollenachseCm, null); assert.equal(a.durchmesserCm, null); assert.ok(a.fehlend.length);
  }
  for (const menge of [0, -1, 1.5, Infinity, '2']) assert.equal(berechnePackhilfe([p({ menge })]).flaecheM2, null);
  assert.equal(berechnePackhilfe([p()], { kernCm: -1 }).durchmesserCm, null);
  assert.equal(berechnePackhilfe([p()], { zugabeCm: Infinity }).laengeCm, null);
  assert.equal(berechnePackhilfe([p()], { verpackungKg: -1 }).bruttogewichtKg, null);
  assert.equal(berechnePackhilfe([]).flaecheM2, null);
});
test('reine Funktion und extreme Zahlen erzeugen kein Infinity', () => {
  const ps = [p()]; const vorher = JSON.stringify(ps); berechnePackhilfe(ps); assert.equal(JSON.stringify(ps), vorher);
  const a = berechnePackhilfe([p({ breiteCm: Number.MAX_VALUE, laengeCm: Number.MAX_VALUE })]);
  assert.equal(a.flaecheM2, null); assert.equal(a.durchmesserCm, null);
  assert.ok(a.fehlend.some(t => /Zahlenbereich/.test(t)));
});
