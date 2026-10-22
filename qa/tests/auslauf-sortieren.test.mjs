import assert from 'node:assert/strict';
import test from 'node:test';
import {
  argumente, zielReihenfolge, sortiereBisFertig, planeZuege, planeRueckweg, wendeAn, inStuecken, istGleich, MAX_ZUEGE,
} from '../../scripts/auslauf-sortieren.mjs';

const A = new Set(['a1', 'a2', 'a3']);

test('Ziel: regulaere Produkte in alter Reihenfolge, dahinter die Auslaufartikel in alter Reihenfolge', () => {
  assert.deepEqual(zielReihenfolge(['a1', 'n1', 'a2', 'n2', 'a3'], A), ['n1', 'n2', 'a1', 'a2', 'a3']);
});

test('Zuege ergeben genau das Ziel, so wie Shopify sie nacheinander anwendet', () => {
  const vorher = ['a1', 'n1', 'a2', 'n2', 'n3', 'a3', 'n4'];
  const zuege = planeZuege(vorher, A);
  assert.deepEqual(wendeAn(vorher, zuege), zielReihenfolge(vorher, A));
  assert.equal(zuege.length, 3);
});

test('Auslaufartikel schon am Ende in einer anderen Reihenfolge: bleibt, wie es ist', () => {
  assert.deepEqual(planeZuege(['n1', 'n2', 'a2', 'a1'], A), []);
});

test('Ein Auslaufartikel steht hinten, ein anderer vorn: Reihenfolge der Auslaufartikel bleibt erhalten', () => {
  const vorher = ['a3', 'n1', 'n2', 'a1'];
  assert.deepEqual(wendeAn(vorher, planeZuege(vorher, A)), ['n1', 'n2', 'a3', 'a1']);
});

test('Nichts zu tun ohne Auslaufartikel oder wenn sie schon hinten stehen', () => {
  assert.deepEqual(planeZuege(['n1', 'n2'], A), []);
  assert.deepEqual(planeZuege(['n1', 'a1', 'a2'], A), []);
});

test('Neues Produkt hinter den Auslaufartikeln (Shopify haengt hinten an) wird erkannt', () => {
  const vorher = ['n1', 'a1', 'a2', 'n-neu'];
  const zuege = planeZuege(vorher, A);
  assert.ok(zuege.length > 0);
  assert.deepEqual(wendeAn(vorher, zuege), ['n1', 'n-neu', 'a1', 'a2']);
});

test('Rueckweg stellt die gespeicherte Reihenfolge her', () => {
  const vorher = ['a1', 'n1', 'a2', 'n2'];
  const nachher = wendeAn(vorher, planeZuege(vorher, A));
  assert.ok(!istGleich(nachher, vorher));
  assert.deepEqual(wendeAn(nachher, planeRueckweg(vorher)), vorher);
});

test('Mehr als 250 Zuege werden auf mehrere Aufrufe verteilt', () => {
  const stuecke = inStuecken(Array.from({ length: 600 }, (_, i) => i));
  assert.deepEqual(stuecke.map(s => s.length), [MAX_ZUEGE, MAX_ZUEGE, 100]);
});

test('Argumente: Trockenlauf ist Standard, unbekannte Flags brechen ab', () => {
  assert.deepEqual(argumente([]), { schreiben: false, kollektionen: null, zurueck: null });
  assert.deepEqual(argumente(['--schreiben', '--kollektionen', 'teppichboden,teppiche']).kollektionen, ['teppichboden', 'teppiche']);
  assert.throws(() => argumente(['--schreib']), /Unbekanntes Argument/);
  assert.throws(() => argumente(['--zurueck']), /braucht eine Datei/);
});

test('Zuege kommen nicht an (Import haengt parallel an): neu planen und erneut schieben', () => {
  let shop = ['n1', 'a1', 'n2', 'a2'];
  let aufrufe = 0;
  const r = sortiereBisFertig({
    lies: () => [...shop],
    schiebe: zuege => {
      aufrufe++;
      if (aufrufe === 1) { shop = [...shop, 'n3']; return; } // erster Aufruf verpufft, Import haengt an
      shop = wendeAn(shop, zuege);
    },
    auslauf: A,
  });
  assert.equal(r.ok, true);
  assert.equal(r.versuche, 2);
  assert.deepEqual(shop, ['n1', 'n2', 'n3', 'a1', 'a2']);
});

test('Zuege kommen nie an: nach den Versuchen FEHL, kein Endlosschleifen', () => {
  const r = sortiereBisFertig({ lies: () => ['a1', 'n1'], schiebe: () => {}, auslauf: A, versuche: 3 });
  assert.equal(r.ok, false);
  assert.equal(r.versuche, 3);
});
