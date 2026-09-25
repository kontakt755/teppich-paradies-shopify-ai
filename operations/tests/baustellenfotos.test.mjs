import test from 'node:test';
import assert from 'node:assert/strict';
import { passendeProdukte, produktHinweis, pruefeEingang, titelFuer, normal, FotoFehler } from '../lib/baustellenfotos.mjs';

const PRODUKTE = [
  { handle: 'selene-linoleumboden-620', titel: 'Selene Linoleumboden Farbe 620' },
  { handle: 'selene-linoleumboden-630', titel: 'Selene Linoleumboden Farbe 630' },
  { handle: 'vellana-teppichboden', titel: 'Vellana Teppichboden' },
];

test('Bodenname vom Auftragszettel findet das Produkt im Shop', () => {
  const h = produktHinweis(passendeProdukte('Selene 620', PRODUKTE));
  assert.equal(h.handle, 'selene-linoleumboden-620');
  assert.equal(h.sicher, true);
  assert.match(h.text, /Selene Linoleumboden Farbe 620/);
});

test('Boden, den wir nicht führen, wird als solcher gemeldet - nicht geraten', () => {
  const h = produktHinweis(passendeProdukte('Nordhaus Prestige 44', PRODUKTE));
  assert.equal(h.handle, null);
  assert.equal(h.sicher, false);
  assert.match(h.text, /Nicht im Shop/);
});

test('Mehrdeutiger Name verlangt eine Auswahl, statt sich für eines zu entscheiden', () => {
  const h = produktHinweis(passendeProdukte('Selene', PRODUKTE));
  assert.equal(h.sicher, false, 'zwei Selene-Farben passen gleich gut');
  assert.match(h.text, /Mehrere Produkte passen/);
});

test('Füllwörter stören die Zuordnung nicht', () => {
  assert.equal(normal('Selene Teppichboden Farbe 620'), 'selene 620');
  const h = produktHinweis(passendeProdukte('Vellana Teppichboden', PRODUKTE));
  assert.equal(h.handle, 'vellana-teppichboden');
});

test('Ohne Zustimmung des Kunden entsteht kein Eingang', () => {
  assert.throws(
    () => pruefeEingang({ auftrag: '1042', fotos: [{ name: 'a.jpg' }], einwilligung: false }),
    (e) => e instanceof FotoFehler && /Zustimmung/.test(e.message),
  );
  const ok = pruefeEingang({ auftrag: '1042', fotos: [{ name: 'a.jpg' }], einwilligung: true });
  assert.equal(ok.einwilligung, true);
});

test('Ohne Foto und ohne Zuordnung geht es nicht', () => {
  assert.throws(() => pruefeEingang({ auftrag: '1042', fotos: [], einwilligung: true }), /Ohne Foto/);
  assert.throws(() => pruefeEingang({ fotos: [{ name: 'a.jpg' }], einwilligung: true }), /Auftragsnummer oder Bodenname/);
  assert.throws(() => pruefeEingang({ auftrag: '1', fotos: new Array(21).fill({ name: 'a.jpg' }), einwilligung: true }), /Höchstens 20/);
});

test('Titel macht den Eingang in der Liste wiedererkennbar', () => {
  const t = titelFuer({ auftrag: '1042', boden: 'Selene 620' }, new Date('2026-09-25T09:00:00Z'));
  assert.match(t, /Selene 620/);
  assert.match(t, /Auftrag 1042/);
  assert.match(t, /25\.9\.2026/);
});
