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

// Preise wie Piumera (2026-10-02): Meterware 55,90 €/m², Raummass 75,00 €/m²,
// abgerechnet in vollen m² (kein preis_pro_001_qm).
const piumera = (art, b, l) => Math.ceil(b * l / 10000) * (art === 'raum' ? 75 : 55.9);

test('Preisvergleich: 350 x 450 -> Meterware gedreht auf der 500er-Rolle statt Raummass', () => {
  // Fall aus der Rueckmeldung des Inhabers: vorher Raummass 360 x 460 (1.275 EUR).
  const v = RM.rolleVorschlag({ breite: 350, laenge: 450, rollen: [400, 500], raum: true, maxRaum: 495, preis: piumera });
  assert.deepEqual([v.empfohlen.art, v.empfohlen.breite, v.empfohlen.laenge, v.empfohlen.gedreht], ['meter', 500, 360, true]);
  assert.equal(v.empfohlen.preis, 18 * 55.9);
  assert.deepEqual([v.alternative.art, v.alternative.breite, v.alternative.laenge], ['raum', 360, 460]);
  assert.equal(v.alternative.preis, 17 * 75);
});

test('Preisvergleich: schmaler Flur 120 x 600 -> Raummass lohnt sich', () => {
  const v = RM.rolleVorschlag({ breite: 120, laenge: 600, rollen: [400, 500], raum: true, maxRaum: 495, preis: piumera });
  assert.equal(v.empfohlen.art, 'raum');
  assert.deepEqual([v.empfohlen.breite, v.empfohlen.laenge], [130, 610]);
  assert.equal(v.alternative.art, 'meter');
  assert.ok(v.alternative.preis > v.empfohlen.preis);
});

test('Preisvergleich: Variante ohne Preis faellt raus', () => {
  const ohneRaum = (art, b, l) => (art === 'raum' ? 0 : piumera(art, b, l));
  const v = RM.rolleVorschlag({ breite: 120, laenge: 600, rollen: [400, 500], raum: true, maxRaum: 495, preis: ohneRaum });
  assert.equal(v.empfohlen.art, 'meter');
  assert.equal(v.alternative, null);
});

test('Sweetspot Piumera: Raummass erst unter etwa 3/4 der Rollenbreite', () => {
  // Raum laenger als jede Rolle (kein Drehen): (Breite + 10) * 75 < 400 * 55,90
  // -> Raummass lohnt bis etwa 288 cm Breite.
  const bei = (b) => RM.rolleVorschlag({ breite: b, laenge: 650, rollen: [400, 500], raum: true, maxRaum: 495, preis: piumera }).empfohlen.art;
  assert.equal(bei(250), 'raum');
  assert.equal(bei(320), 'meter');
});

// Dielenoptik (Vinyl von der Rolle, 200/400 cm, ohne Raummass): das Muster
// laeuft entlang der Rollenlaenge, der Helfer darf nicht drehen.
const vinyl = (art, b, l) => (art === 'meter' ? Math.round(b * l / 100) / 100 * 24.9 : 0);

test('Dielen entlang der Raumlaenge: 180 x 400 -> 200er-Rolle, 200 x 410', () => {
  const v = RM.rolleVorschlag({ breite: 180, laenge: 400, rollen: [200, 400], raum: false, preis: vinyl, richtung: 'laenge' });
  assert.deepEqual([v.empfohlen.breite, v.empfohlen.laenge, v.empfohlen.gedreht], [200, 410, false]);
  // Quer waere billiger (400 x 190), steht aber nur als andere Richtung da.
  assert.deepEqual([v.andereRichtung.breite, v.andereRichtung.laenge, v.andereRichtung.gedreht], [400, 190, true]);
  assert.equal(v.alternative, null);
});

test('Dielen entlang der Raumbreite: 400 x 500 -> 400er-Rolle quer, 400 x 510 gedreht ist falsch', () => {
  const v = RM.rolleVorschlag({ breite: 400, laenge: 500, rollen: [200, 400], raum: false, preis: vinyl, richtung: 'breite' });
  // Muster entlang der Breite (400): geschnittene Laenge 410, Rolle muss 500 abdecken -> gibt es nicht.
  assert.equal(v.naht, true);
  assert.deepEqual([v.andereRichtung.breite, v.andereRichtung.laenge], [400, 510]);
});

test('Dielen entlang der Raumlaenge: 400 x 500 -> 400 x 510', () => {
  const v = RM.rolleVorschlag({ breite: 400, laenge: 500, rollen: [200, 400], raum: false, preis: vinyl, richtung: 'laenge' });
  assert.deepEqual([v.empfohlen.breite, v.empfohlen.laenge, v.empfohlen.gedreht], [400, 510, false]);
  assert.deepEqual([v.genau.breite, v.genau.laenge], [400, 500]);
});
