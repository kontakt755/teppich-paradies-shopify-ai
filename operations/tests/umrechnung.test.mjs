import test from 'node:test';
import assert from 'node:assert/strict';
import { rollenware, paketware, leisten, stueck, EINHEIT, EINHEITEN, istEinheit, formatDe, UNGEKLAERT } from '../lib/umrechnung.mjs';

test('Rollenware: 32 m2 bei 5,00 m Breite -> 6,40 lfm x 5,00 m, Raster UNGEKLAERT', () => {
  const r = rollenware({ flaecheM2: 32, breiteM: 5 });
  assert.equal(r.lfm, 6.4);
  assert.equal(r.breiteM, 5);
  assert.equal(r.text, '6,40 lfm × 5,00 m');
  assert.equal(r.raster, UNGEKLAERT);
  assert.equal(r.einheit, EINHEIT.LFM);
});

test('Rollenware: Laenge in cm gewinnt vor der Flaeche, aufgerundet auf 0,01 lfm', () => {
  const r = rollenware({ laengeCm: 333, flaecheM2: 99, breiteM: 4 });
  assert.equal(r.lfm, 3.33);
  const krumm = rollenware({ flaecheM2: 10, breiteM: 3 }); // 3,3333.. -> 3,34
  assert.equal(krumm.lfm, 3.34);
});

test('Rollenware: mit bekanntem Raster wird auf das naechste Vielfache aufgerundet', () => {
  const r = rollenware({ laengeCm: 633, breiteM: 4, rasterM: 0.5 });
  assert.equal(r.lfm, 6.5);
  assert.equal(r.raster, 0.5);
  assert.equal(rollenware({ laengeCm: 640, breiteM: 4, rasterM: 0.1 }).lfm, 6.4);
});

test('Rollenware: ohne Breite oder Menge wird geworfen, nicht geraten', () => {
  assert.throws(() => rollenware({ flaecheM2: 32 }), /breiteM/);
  assert.throws(() => rollenware({ breiteM: 4 }), /flaecheM2 oder laengeCm/);
});

test('Paketware: 34,20 m2 bei 2,18 m2/Paket -> 16 Pakete = 34,88 m2', () => {
  const p = paketware({ bedarfM2: 34.2, qmProPaket: 2.18 });
  assert.equal(p.pakete, 16);
  assert.equal(p.qmGesamt, 34.88);
  assert.equal(p.einheit, EINHEIT.PAKET);
});

test('Paketware: exaktes Vielfaches erzwingt kein Zusatzpaket, Minimum ist 1 Paket', () => {
  assert.equal(paketware({ bedarfM2: 2.18 * 3, qmProPaket: 2.18 }).pakete, 3);
  assert.equal(paketware({ bedarfM2: 0, qmProPaket: 2.18 }).pakete, 1);
  assert.throws(() => paketware({ bedarfM2: 5 }), /qmProPaket/);
});

test('Leisten: 38 lfm bei 2,5 m Stangen -> 16 Stangen', () => {
  const l = leisten({ lfm: 38, stangenlaengeM: 2.5 });
  assert.equal(l.stangen, 16);
  assert.equal(l.meterGesamt, 40);
  assert.equal(l.einheit, EINHEIT.STUECK);
});

test('Leisten: Gleitkomma-Toleranz (7,2 / 2,4 = 3) und fehlende Stangenlaenge -> UNGEKLAERT', () => {
  assert.equal(leisten({ lfm: 7.2, stangenlaengeM: 2.4 }).stangen, 3);
  assert.equal(leisten({ lfm: 38, stangenlaengeM: 4 }).stangen, 10);
  const offen = leisten({ lfm: 38 });
  assert.equal(offen.stangen, UNGEKLAERT);
  assert.equal(offen.stangenlaengeM, UNGEKLAERT);
});

test('Stueck: ganze Mengen 1:1, sonst Fehler', () => {
  assert.deepEqual(stueck({ menge: 3 }), { stueck: 3, einheit: EINHEIT.STUECK });
  assert.throws(() => stueck({ menge: 1.5 }), /ganzzahlig/);
  assert.throws(() => stueck({ menge: 0 }));
});

test('Einheiten-Enum ist vollstaendig', () => {
  assert.deepEqual(EINHEITEN, ['m2', 'lfm', 'stueck', 'paket', 'rolle', 'karton', 'set', 'paar', 'sondermass']);
  assert.equal(istEinheit('lfm'), true);
  assert.equal(istEinheit('meter'), false);
  assert.equal(formatDe(6.4), '6,40');
});
