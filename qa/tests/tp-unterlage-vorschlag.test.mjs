import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

createRequire(import.meta.url)('../../assets/tp-unterlage-vorschlag.js');
const U = globalThis.TPUnterlage;

// Wie im Shop (Preise in Cent, Titel wie die Variantentitel)
const prima = { key: 'rolle', art: 'rolle', varianten: [
  { id: 1, title: '1 mm, 80 cm breit (je lfm)', price: 890, available: true },
  { id: 2, title: '1 mm, 180 cm breit (je lfm)', price: 1700, available: true },
  { id: 3, title: '1 mm, 120 cm breit (je lfm)', price: 1150, available: true }
] };
const bremseRolle = { key: 'rolle', art: 'rolle', varianten: [
  { id: 11, title: '3 mm, 80 cm breit (je lfm)', price: 1120, available: true },
  { id: 12, title: '3 mm, 120 cm breit (je lfm)', price: 1665, available: true }
] };
const bremseStueck = { key: 'stueck', art: 'stueck', varianten: [
  { id: 21, title: '3 mm, 120 × 180 cm', price: 3780, available: true },
  { id: 22, title: '3 mm, 180 × 290 cm', price: 8180, available: true },
  { id: 23, title: '3 mm, 240 × 340 cm', price: 12670, available: true }
] };

test('Unterlage ist rundum 5 cm kleiner, kuerzere Seite zuerst', () => {
  assert.equal(U.RAND_CM, 5);
  assert.deepEqual(U.ziel({ f: 'rechteck', w: 300, l: 200 }), { w: 190, l: 290 });
  assert.deepEqual(U.ziel({ f: 'rund', w: 160 }), { w: 150, l: 150 });
  assert.equal(U.ziel(null), null);
});

test('Masse aus den Variantentiteln', () => {
  assert.equal(U.rolleBreite('1 mm, 180 cm breit (je lfm)'), 180);
  assert.deepEqual(U.stueckMasse('3 mm, 120 × 180 cm'), [120, 180]);
  assert.equal(U.rolleBreite('Default Title'), 0);
  assert.equal(U.stueckMasse('3 mm, 80 cm breit (je lfm)'), null);
});

test('160 x 230: zwei Bahnen 120 cm statt einer teuren 180er', () => {
  const k = U.vorschlag({ f: 'rechteck', w: 160, l: 230 }, [prima]);
  assert.deepEqual([k.id, k.menge, k.cent, k.bahnen], [3, 3, 3450, 2]);
  assert.equal(U.text(k), '3 m in 120 cm Breite (2 Bahnen à 1,5 m), zuschneiden auf 150 × 220 cm');
});

test('200 x 300: 2 Bahnen 180 cm quer gelegt (4 m), nicht 3 schmale', () => {
  const k = U.vorschlag({ f: 'rechteck', w: 200, l: 300 }, [prima]);
  assert.deepEqual([k.id, k.menge, k.cent, k.bahnen, k.bahnCm], [2, 4, 6800, 2, 190]);
});

test('Gesamtlaenge wird erst nach dem Zusammenzaehlen aufgerundet', () => {
  // 80 x 150 -> 70 x 140: 180 cm breit, eine Bahn 70 cm -> 1 m = 17,00 EUR
  const k = U.vorschlag({ f: 'rechteck', w: 80, l: 150 }, [prima]);
  assert.deepEqual([k.id, k.menge, k.cent], [2, 1, 1700]);
});

test('abgepasstes Stueck gewinnt, wenn es eine Bahn statt mehrerer ist', () => {
  // 185 x 295 -> 175 x 285: Stueck 180 x 290 (81,80 EUR, eine Flaeche) vor 7 m in 80 cm (4 Bahnen)
  const k = U.vorschlag({ f: 'rechteck', w: 185, l: 295 }, [bremseRolle, bremseStueck]);
  assert.deepEqual([k.art, k.id, k.menge, k.cent], ['stueck', 22, 1, 8180]);
  assert.equal(U.text(k), '1 Stück 180 × 290 cm, zuschneiden auf 175 × 285 cm');
  const genau = U.vorschlag({ f: 'rechteck', w: 250, l: 350 }, [bremseRolle, bremseStueck]);
  assert.equal(U.text(genau), '1 Stück 240 × 340 cm, passt genau');
});

test('Stueck zu klein faellt weg, nicht lieferbare Varianten auch', () => {
  const k = U.vorschlag({ f: 'rechteck', w: 300, l: 400 }, [bremseStueck]);
  assert.equal(k, null);
  const nurWeg = { key: 'rolle', art: 'rolle', varianten: [{ id: 9, title: '1 mm, 80 cm breit (je lfm)', price: 890, available: false }] };
  assert.equal(U.vorschlag({ f: 'rechteck', w: 200, l: 300 }, [nurWeg]), null);
});

test('ohne gueltiges Mass kein Vorschlag', () => {
  assert.equal(U.vorschlag(null, [prima]), null);
});
