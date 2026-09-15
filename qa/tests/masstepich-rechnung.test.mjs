import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { raummassPreis as raummassPreisLib, maxBreiteCm as maxBreiteLib } from '../../scripts/masstepich/lib.mjs';

// Das Asset ist ein Browser-Skript (UMD an globalThis) - einmal laden.
createRequire(import.meta.url)('../../assets/tp-masstepich-rechnung.js');
const M = globalThis.TPMass;

test('A: 4,00 x 2,50 m ergibt 10 m² und 13 lfm Kante', () => {
  assert.equal(M.flaecheM2(400, 250), 10);
  assert.equal(M.umfangM('rechteck', 400, 250), 13);
});

test('B: rund und oval nach umschliessendem Rechteck abgerechnet', () => {
  assert.equal(M.abrechnungsflaecheM2('rund', 200, 999), 4);
  assert.equal(M.abrechnungsflaecheM2('oval', 200, 300), 6);
  assert.ok(M.echteFlaecheM2('rund', 200) < 4);
  assert.equal(M.umfangM('rund', 200).toFixed(4), (Math.PI * 2).toFixed(4));
  // Ellipse 3 x 2 m: Ramanujan ~ 7,93 m
  assert.equal(M.umfangM('oval', 200, 300).toFixed(2), '7.93');
});

test('C: Mengen - volle m² aufgerundet, 0,01 m² ohne Gleitkommafehler', () => {
  assert.equal(M.mengeVolleM2(6.66), 7);
  assert.equal(M.mengeVolleM2(7), 7);
  assert.equal(M.mengeVolleM2(0.2), 1);
  assert.equal(M.mengeHundertstelM2(4 * 1.5), 600);
  assert.equal(M.mengeHundertstelM2(0.07 * 100 / 100), 7);
  assert.equal(M.mengeHundertstelM2((333 * 200) / 10000), 666);
});

test('D: Raummass +35 % auf Cent gerundet - Asset und Skript identisch', () => {
  assert.equal(M.raummassPreis(84.9, 35), 114.62);
  for (const p of [9.99, 19.9, 34.5, 49.95, 84.9, 129]) {
    assert.equal(M.raummassPreis(p, 35), raummassPreisLib(p, 35), String(p));
  }
});

test('E: Cover 10 cm schmaler als die Rolle, sonst volle Breite', () => {
  assert.equal(M.maxBreiteCm(400, 'cover'), 390);
  assert.equal(M.maxBreiteCm(500, 'cover'), 490);
  assert.equal(M.maxBreiteCm(400, 'ketteln'), 400);
  for (const art of ['cover', 'ketteln', 'einfassband', 'paspelband']) {
    assert.equal(M.maxBreiteCm(400, art), maxBreiteLib(400, art));
  }
});

test('F: Masspruefung - kurze Seite in die Rolle, lange bis 10 m', () => {
  const g = { maxW: 400, maxL: 1000 };
  assert.deepEqual(M.pruefeMasse({ form: 'rechteck', w: 250, l: 400, ...g }), []);
  assert.deepEqual(M.pruefeMasse({ form: 'rechteck', w: 500, l: 300, ...g }), [], 'gedreht passt');
  assert.equal(M.pruefeMasse({ form: 'rechteck', w: 450, l: 500, ...g }).length, 1);
  assert.equal(M.pruefeMasse({ form: 'rechteck', w: 300, l: 1001, ...g }).length, 1);
  assert.equal(M.pruefeMasse({ form: 'rechteck', w: 40, l: 300, ...g }).length, 1);
  assert.deepEqual(M.pruefeMasse({ form: 'rechteck', w: 250, l: 0, ...g }), ['Bitte die Länge eingeben.']);
  assert.deepEqual(M.pruefeMasse({ form: 'rund', w: 390, maxW: 390 }), []);
  assert.equal(M.pruefeMasse({ form: 'rund', w: 400, maxW: 390 }).length, 1);
  assert.deepEqual(M.pruefeMasse({ form: 'rechteck', w: 0, l: 0, ...g }), ['Bitte Maße eingeben.']);
});

test('G: Mindestpreis hebt die Menge an, sonst nicht', () => {
  // 1 m² bei 0,50 € je 0,01 m² = 50 €; Mindestpreis 79 € -> 158 Einheiten
  assert.equal(M.mengeMitMindestpreis(1, 50, 7900), 158);
  assert.equal(M.mengeMitMindestpreis(10, 50, 7900), 1000);
  assert.equal(M.mengeMitMindestpreis(1, 50, 0), 100);
});

test('I: Kettelteppich - Kante zentimetergenau, Preis aus beiden Zeilen', () => {
  // 2,00 x 3,00 m: Umfang 10,00 m -> 1000 Einheiten a 0,19 EUR = 190,00 EUR
  assert.equal(M.kanteEinheiten(M.umfangM('rechteck', 200, 300)), 1000);
  // 2,37 x 3,68 m: 12,10 m -> 1210 Einheiten, kein Aufrunden auf 13 m
  assert.equal(M.kanteEinheiten(M.umfangM('rechteck', 237, 368)), 1210);
  assert.equal(M.kanteEinheiten(0), 0);

  // Material 6,00 m2 zu 0,89 EUR je 0,01 m2 = 534,00 EUR, Kante 190,00 EUR
  const material = M.mengeHundertstelM2(M.abrechnungsflaecheM2('rechteck', 200, 300)) * 89;
  const kante = M.kanteEinheiten(M.umfangM('rechteck', 200, 300)) * 19;
  assert.equal(material, 53400);
  assert.equal(kante, 19000);

  // Mindestauftragswert 99 EUR gilt fuer beide Zeilen zusammen: die Kante
  // zaehlt mit, nur der Rest hebt die Materialmenge an.
  const kleinKante = M.kanteEinheiten(M.umfangM('rechteck', 50, 100)) * 19; // 3,00 m = 57,00 EUR
  assert.equal(kleinKante, 5700);
  const menge = M.mengeMitMindestpreis(0.5, 89, Math.max(0, 9900 - kleinKante));
  assert.equal(menge * 89 + kleinKante >= 9900, true);
  // ohne Kettelzeile bliebe der volle Mindestpreis stehen
  assert.ok(M.mengeMitMindestpreis(0.5, 89, 9900) * 89 >= 9900);
});

test('H: Rolle und Rollenanzahl', () => {
  assert.equal(M.rolleFuer(380, [500, 400, 200]), 400);
  assert.equal(M.rolleFuer(401, [400, 500]), 500);
  assert.equal(M.rolleFuer(501, [400, 500]), null);
  assert.equal(M.rollenAnzahl(10, 18.75), 1);
  assert.equal(M.rollenAnzahl(18.76, 18.75), 2);
  assert.equal(M.rollenAnzahl(10, 0), 0);
});
