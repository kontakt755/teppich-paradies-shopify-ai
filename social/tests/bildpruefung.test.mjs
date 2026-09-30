import assert from 'node:assert/strict';
import test from 'node:test';
import { bewerte, dHash, findeDubletten, hammingAbstand, helligkeit, laplaceVarianz, parseBmp } from '../lib/bildpruefung.mjs';
import { bmp } from './_hilfe.mjs';

const muster = (x, y) => ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 220 : 40);

test('BMP wird gelesen, auch auf dem Kopf stehend', () => {
  const bild = parseBmp(bmp(8, 4, (x, y) => (y === 0 ? 200 : 0)));
  assert.equal(bild.breite, 8); assert.equal(bild.hoehe, 4);
  assert.equal(Math.round(bild.grau[0]), 200, 'oberste Zeile ist die helle');
  assert.equal(Math.round(bild.grau[8 * 3]), 0);
  assert.throws(() => parseBmp(Buffer.from('kein bild')), /Kein BMP/);
});

test('Schaerfe: Kanten ergeben hohe, Flaechen keine Varianz', () => {
  assert.ok(laplaceVarianz(parseBmp(bmp(64, 64, muster))) > 1000);
  assert.equal(laplaceVarianz(parseBmp(bmp(64, 64, () => 128))), 0);
  assert.equal(Math.round(helligkeit(parseBmp(bmp(16, 16, () => 128)))), 128);
});

test('Hash bleibt bei leichter Aufhellung gleich und unterscheidet andere Bilder', () => {
  const verlauf = (x, y) => x * 2 + y;
  const a = dHash(parseBmp(bmp(90, 80, verlauf)));
  const heller = dHash(parseBmp(bmp(90, 80, (x, y) => verlauf(x, y) + 12)));
  const anders = dHash(parseBmp(bmp(90, 80, (x, y) => 255 - verlauf(x, y))));
  assert.equal(a.length, 16);
  assert.ok(hammingAbstand(a, heller) <= 2);
  assert.ok(hammingAbstand(a, anders) > 20);
  assert.equal(hammingAbstand(a, null), Infinity);
});

test('Urteil nennt den Grund in Worten', () => {
  assert.deepEqual(bewerte({ breite: 3000, hoehe: 4000, helligkeit: 130, schaerfe: 900 }), { urteil: 'ok', gruende: [] });
  assert.match(bewerte({ breite: 800, hoehe: 600, helligkeit: 130, schaerfe: 900 }).gruende[0], /zu klein/);
  assert.equal(bewerte({ breite: 3000, hoehe: 4000, helligkeit: 20, schaerfe: 900 }).urteil, 'aussortiert');
  assert.equal(bewerte({ breite: 3000, hoehe: 4000, helligkeit: 130, schaerfe: 6 }).urteil, 'aussortiert');
  assert.equal(bewerte({ breite: 3000, hoehe: 4000, helligkeit: 130, schaerfe: 60 }).urteil, 'unsicher');
});

test('Von zwei gleichen Bildern bleibt das schaerfere; Bekanntes aus dem Bestand zaehlt mit', () => {
  const d = findeDubletten(
    [{ id: 1, dhash: 'ffff0000ffff0000', schaerfe: 100 }, { id: 2, dhash: 'ffff0000ffff0001', schaerfe: 400 }, { id: 3, dhash: '0123456789abcdef', schaerfe: 50 }],
    [{ id: 9, dhash: '0123456789abcdee' }],
  );
  assert.equal(d.get(1), 2);
  assert.equal(d.get(3), 9);
  assert.equal(d.has(2), false);
});
