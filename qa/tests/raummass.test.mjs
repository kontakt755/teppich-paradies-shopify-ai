/*
  Tests fuer den Raummass-Helfer (assets/tp-raummass.js): Bestellmass aus
  Raummassen fuer Rollenware und Raumliste fuer Paketware. Das Asset haengt
  sich unter Node an globalThis, der DOM-Teil laeuft nur im Browser.
*/
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

createRequire(import.meta.url)('../../assets/tp-raummass.js');
const RM = globalThis.TPRaummass;

test('leseCm: cm, Meter mit Komma und Einheiten', () => {
  assert.equal(RM.leseCm('350').cm, 350);
  assert.equal(RM.leseCm('3,5').cm, 350);
  assert.equal(RM.leseCm('3.5 m').cm, 350);
  assert.equal(RM.leseCm('420cm').cm, 420);
  assert.ok(RM.leseCm('').leer);
  assert.ok(RM.leseCm('abc').fehler);
  assert.ok(RM.leseCm('30').fehler, 'unter 50 cm');
});

test('Meterware: Artikelbeispiel 350 x 550 -> 400 x 560 mit 10 cm Zugabe', () => {
  const v = RM.rolleVorschlag({ breite: 350, laenge: 550, rollen: [400, 500], raum: false });
  assert.deepEqual([v.empfohlen.art, v.empfohlen.breite, v.empfohlen.laenge], ['meter', 400, 560]);
  assert.deepEqual([v.genau.breite, v.genau.laenge], [400, 550]);
  assert.equal(v.raumM2, 19.25);
});

test('Meterware: gedreht auf 500 gewinnt bei 350 x 480', () => {
  const v = RM.rolleVorschlag({ breite: 350, laenge: 480, rollen: [400, 500], raum: false });
  assert.equal(v.empfohlen.breite, 500);
  assert.equal(v.empfohlen.laenge, 360);
  assert.equal(v.empfohlen.gedreht, true);
});

test('Raummass: mit Zugabe je Seite, ohne Zugabe exakt', () => {
  const v = RM.rolleVorschlag({ breite: 350, laenge: 550, rollen: [400, 500], raum: true, maxRaum: 495 });
  assert.deepEqual([v.empfohlen.art, v.empfohlen.breite, v.empfohlen.laenge], ['raum', 360, 560]);
  assert.deepEqual([v.genau.art, v.genau.breite, v.genau.laenge], ['raum', 350, 550]);
});

test('Raummass: laengere Seite als Breite wird gedreht', () => {
  const v = RM.rolleVorschlag({ breite: 600, laenge: 300, rollen: [400, 500], raum: true, maxRaum: 495 });
  assert.equal(v.genau.breite, 300);
  assert.equal(v.genau.laenge, 600);
  assert.equal(v.genau.gedreht, true);
});

test('Raummass zu breit mit Zugabe -> Empfehlung faellt auf Meterware', () => {
  const v = RM.rolleVorschlag({ breite: 490, laenge: 600, rollen: [400, 500], raum: true, maxRaum: 495 });
  assert.equal(v.empfohlen.art, 'meter');
  assert.equal(v.empfohlen.breite, 500);
  assert.equal(v.genau.art, 'raum');
  assert.equal(v.genau.breite, 490);
});

test('Beide Seiten breiter als jede Rolle -> Naht', () => {
  const v = RM.rolleVorschlag({ breite: 600, laenge: 700, rollen: [400, 500], raum: true, maxRaum: 495 });
  assert.equal(v.naht, true);
});

test('Raumliste: Summe, leere Zeilen, Fehler', () => {
  assert.deepEqual(RM.summeRaeume([{ breite: '350', laenge: '420' }, { breite: '2,5', laenge: '3 m' }]), { m2: 22.2, raeume: 2, fehler: false });
  assert.equal(RM.summeRaeume([{ breite: '', laenge: '' }]).raeume, 0);
  assert.equal(RM.summeRaeume([{ breite: '350', laenge: '' }]).fehler, true);
});
