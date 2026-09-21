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

test('Kleinste passende Rolle rechnet die Zugabe von 5 cm ein', () => {
  assert.equal(A.ZUGABE_CM, 5);
  assert.equal(A.rolleFuer(250, [400, 500]), 400);
  assert.equal(A.rolleFuer(395, [400, 500]), 400, '395 + 5 passt gerade in die 400er');
  assert.equal(A.rolleFuer(396, [400, 500]), 500, '396 + 5 braucht die 500er');
  assert.equal(A.rolleFuer(495, [400, 500]), 500);
  assert.equal(A.rolleFuer(496, [400, 500]), 0, 'passt in keine Rolle');
  assert.equal(A.rolleFuer(100, []), 0);
  assert.equal(A.rolleFuer(400, [400, 500], 0), 400, 'ohne Zugabe wie frueher');
});

test('Groesste Raummass-Breite ist die groesste Rolle minus Zugabe', () => {
  assert.equal(A.maxRaumBreite([400, 500]), 495);
  assert.equal(A.maxRaumBreite([200]), 195);
  assert.equal(A.maxRaumBreite([]), 0);
  assert.equal(A.maxRaumBreite([400], 10), 390, 'Zugabe waehlbar, z. B. 10 cm bei Toleranz');
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
  // Kipppunkt bei exakter Flaeche: 65,90 x 1,35 = 88,965, ab ~296 cm dreht es
  // sich. Im Shop wird in vollen m² abgerechnet (bill = Math.ceil), dort liegt
  // der Kipppunkt tiefer - siehe naechster Test.
  assert.equal(A.meterwareGuenstiger(296, 550, 88.97, [400, 500], rateMeter).guenstiger, false);
  assert.equal(A.meterwareGuenstiger(297, 550, 88.97, [400, 500], rateMeter).guenstiger, true);
});

test('Meterware-Vergleich nennt die guenstigste Rolle ab Stueckbreite, ohne Zugabe', () => {
  const rateMeter = (w) => (w === 400 || w === 500 ? 65.9 : 0);
  // 399 x 500 im Raummass: 19,95 -> 20 m² x 89 = 1780. Raummass selbst kaeme
  // aus der 500er (399 + 5 > 400), aber als Meterware reicht die 400er:
  // 20 m² x 65,90 = 1318 - nicht die 500er mit 25 m² = 1647,50.
  const a = A.meterwareGuenstiger(399, 500, 89, [400, 500], rateMeter, Math.ceil);
  assert.equal(a.rolle, 400);
  assert.equal(a.totalRaum, 1780);
  assert.equal(a.totalMeter.toFixed(2), '1318.00');
  assert.equal(a.guenstiger, true);
  // 400 x 500: exakt die Rollenbreite - ebenfalls 400er-Meterware.
  const b = A.meterwareGuenstiger(400, 500, 89, [400, 500], rateMeter, Math.ceil);
  assert.equal(b.rolle, 400);
  assert.equal(b.totalMeter.toFixed(2), '1318.00');
  // 401 x 500: nur noch die 500er passt (20,05 -> 21 m² x 89 = 1869 vs 1647,50).
  const c = A.meterwareGuenstiger(401, 500, 89, [400, 500], rateMeter, Math.ceil);
  assert.equal(c.rolle, 500);
  assert.equal(c.totalRaum, 1869);
  assert.equal(c.totalMeter.toFixed(2), '1647.50');
  assert.equal(c.guenstiger, true);
  // 352 x 463 (TEST1): 17 m² x 89 = 1513 gegen 400er 19 m² x 65,90 = 1252,10.
  const d = A.meterwareGuenstiger(352, 463, 89, [400, 500], rateMeter, Math.ceil);
  assert.equal(d.rolle, 400);
  assert.equal(d.totalRaum, 1513);
  assert.equal(d.totalMeter.toFixed(2), '1252.10');
  // Hat die Farbe nur die 500er, wird auch nur die genannt.
  assert.equal(A.meterwareGuenstiger(399, 500, 89, [500], rateMeter, Math.ceil).rolle, 500);
  // Reihenfolge der Rollen spielt keine Rolle.
  assert.equal(A.meterwareGuenstiger(250, 550, 89, [500, 400], rateMeter, Math.ceil).rolle, 400);
});

test('Kipppunkt bei Abrechnung in vollen m² (wie im Shop) liegt bei ~290 cm', () => {
  const rateMeter = () => 65.9;
  // 2,90 x 5,50 = 15,95 -> 16 m² x 89 = 1424 < 22 m² x 65,90 = 1449,80
  assert.equal(A.meterwareGuenstiger(290, 550, 89, [400, 500], rateMeter, Math.ceil).guenstiger, false);
  // 2,91 x 5,50 = 16,005 -> 17 m² x 89 = 1513 > 1449,80
  assert.equal(A.meterwareGuenstiger(291, 550, 89, [400, 500], rateMeter, Math.ceil).guenstiger, true);
});

test('Meterware-Vergleich mit Abrechnung in vollen m² nennt die Betraege der Preisbox', () => {
  const rateMeter = () => 65.9;
  // 3,50 x 5,50 = 19,25 m² -> 20 m² x 89 = 1780; Rolle 4,00 x 5,50 = 22 m² x 65,90 = 1449,80
  const c = A.meterwareGuenstiger(350, 550, 89, [400, 500], rateMeter, Math.ceil);
  assert.equal(c.totalRaum, 1780);
  assert.equal(c.totalMeter.toFixed(2), '1449.80');
  assert.equal(c.guenstiger, true);
});

test('Meterware-Vergleich ohne Grundlage liefert null', () => {
  const rateMeter = () => 65.9;
  assert.equal(A.meterwareGuenstiger(250, 0, 88.97, [400], rateMeter), null, 'ohne Laenge');
  assert.equal(A.meterwareGuenstiger(250, 550, 0, [400], rateMeter), null, 'ohne Raummass-Preis');
  assert.equal(A.meterwareGuenstiger(600, 550, 88.97, [400, 500], rateMeter), null, 'breiter als jede Rolle');
  // 496 cm passt als Meterware noch in die 500er (keine Zugabe noetig) - nicht
  // null. Dass 496 im Raummass gar nicht geht, entscheidet pruefeBreite.
  assert.equal(A.meterwareGuenstiger(496, 550, 88.97, [400, 500], rateMeter).rolle, 500);
  assert.equal(A.meterwareGuenstiger(0, 550, 88.97, [400], rateMeter), null, 'ohne Breite');
  assert.equal(A.meterwareGuenstiger(250, 550, 88.97, [400], () => 0), null, 'Rolle ohne Variante');
});

// --- Masseingabe: cm und m, ohne dass der Kunde umrechnet -----------------

const cm = (text, einheit) => A.parseMass(text, einheit).cm;
const fehler = (text, einheit) => A.parseMass(text, einheit).fehler;

test('parseMass: Zentimeter mit und ohne Einheit, Leerzeichen egal', () => {
  assert.equal(cm('350'), 350);
  assert.equal(cm('350cm'), 350);
  assert.equal(cm('350 cm'), 350);
  assert.equal(cm('  350 CM '), 350);
  assert.equal(cm('350 Zentimeter'), 350);
  assert.equal(fehler('350'), '');
});

test('parseMass: Meter mit Komma oder Punkt, exakt ohne Gleitkomma-Falle', () => {
  assert.equal(cm('3,5 m'), 350);
  assert.equal(cm('3.50 m'), 350);
  assert.equal(cm('3,50m'), 350);
  assert.equal(cm('3.55m'), 355);      // 3.55 * 100 = 354,99999999999994
  assert.equal(cm('1,15 m'), 115);     // 1.15 * 100 = 114,99999999999999
  assert.equal(cm('4,35 m'), 435);     // 4.35 * 100 = 434,99999999999994
  assert.equal(cm('2 Meter'), 200);
  // Jede Hundertstel-Meter-Angabe bis 50 m ergibt exakt ihre Zentimeter.
  for (let i = 1; i <= 5000; i++) {
    const text = `${Math.floor(i / 100)},${String(i % 100).padStart(2, '0')}`;
    assert.equal(cm(text, 'm'), i, text);
  }
});

test('parseMass: ohne Einheit gilt der Umschalter, Standard ist cm', () => {
  assert.equal(cm('0,5', 'm'), 50);
  assert.equal(cm('3,5', 'm'), 350);
  assert.equal(cm('350', 'cm'), 350);
  assert.equal(cm('350', undefined), 350);
  assert.equal(cm('350', 'quatsch'), 350);
  // KEINE Heuristik "kleine Zahl = Meter": 3,5 im cm-Modus sind 3,5 cm -> 4 cm.
  assert.equal(cm('3,5', 'cm'), 4);
  assert.equal(cm('4', 'cm'), 4);
});

test('parseMass: Einheit im Text schlaegt den Umschalter', () => {
  assert.equal(cm('350 cm', 'm'), 350);
  assert.equal(cm('3,5 m', 'cm'), 350);
  assert.equal(A.parseMass('350 cm', 'm').einheit, 'cm');
  assert.equal(A.parseMass('3,5 m', 'cm').einheit, 'm');
});

test('parseMass: Bruchteile eines Zentimeters werden aufgerundet, nie abgeschnitten', () => {
  assert.equal(cm('150,7'), 151);
  assert.equal(cm('150.01 cm'), 151);
  assert.equal(cm('150,0'), 150);
  assert.equal(cm('3,505 m'), 351);
  assert.equal(cm('3,500 m'), 350);
});

test('parseMass: Ungueltiges liefert einen Fehlercode und nie eine Zahl', () => {
  const faelle = {
    '': 'leer', '   ': 'leer',
    'abc': 'ungueltig', '3,5,5': 'ungueltig', '1e3': 'ungueltig', '3 5': 'ungueltig',
    '350 mm': 'ungueltig', '3m50': 'ungueltig', '3,5 m cm': 'ungueltig', 'cm': 'ungueltig',
    'Infinity': 'ungueltig', 'NaN': 'ungueltig', '1.000,5': 'ungueltig', '+350': 'ungueltig', ',': 'ungueltig',
    '-10': 'negativ', '-3,5 m': 'negativ', '−10': 'negativ',
    '99999999999': 'zu_gross', '999999 m': 'zu_gross', ['1'.padEnd(400, '0')]: 'zu_gross'
  };
  for (const [text, code] of Object.entries(faelle)) {
    const r = A.parseMass(text, 'cm');
    assert.equal(r.fehler, code, JSON.stringify(text));
    assert.equal(r.cm, null, JSON.stringify(text));
  }
  assert.equal(fehler(null), 'leer');
  assert.equal(fehler(undefined), 'leer');
});

test('parseMass: Ergebnis ist immer eine ganze, endliche Zahl; 0 bleibt 0', () => {
  for (const t of ['0', '0,0', '0 m', '9999999', '99999,99 m', '000350']) {
    const r = A.parseMass(t);
    assert.equal(r.fehler, '', t);
    assert.ok(Number.isInteger(r.cm) && r.cm >= 0, t);
  }
  assert.equal(cm('0'), 0);
  assert.equal(cm('000350'), 350);
  assert.equal(cm('9999999'), 9999999);
});

test('Gegenprobe und Feldwert zeigen dieselben cm in beiden Einheiten', () => {
  assert.equal(A.massGegenprobe(350), '= 350 cm = 3,50 m');
  assert.equal(A.massGegenprobe(55), '= 55 cm = 0,55 m');
  assert.equal(A.massWert(350, 'cm'), '350');
  assert.equal(A.massWert(350, 'm'), '3,50');
  assert.equal(A.massWert(5, 'm'), '0,05');
  // Umschalten hin und zurueck veraendert den cm-Wert nie.
  for (let i = 1; i <= 5000; i += 7) {
    assert.equal(cm(A.massWert(i, 'm'), 'm'), i);
    assert.equal(cm(A.massWert(i, 'cm'), 'cm'), i);
  }
});
