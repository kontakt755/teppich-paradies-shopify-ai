import test from 'node:test';
import assert from 'node:assert/strict';
import { lagerEintraegeFuerFarben } from '../lib/lexikon-musterlager.mjs';
import { gesamtAusNochDa, lagerKorrektur, lagerNochDa, nachLieferant, nochDaZaehlbar } from '../lib/musterlager-bestand.mjs';

const farben = [{ farbe: 'Greige (097)', schluessel: ['X-097'] }, { farbe: 'Taupe (272)', schluessel: ['X-272'] }];

test('nur Eintraege dieses Produkts, leere bleiben stehen, Farbe sortiert', () => {
  const r = lagerEintraegeFuerFarben([
    { farbe: 'Taupe (272)', schluessel: ['X-272'] },
    { farbe: 'Fremd', schluessel: ['Y-1'] },
    { farbe: 'Greige (097)', schluessel: ['X-097'], art: 'einzel' },
    { farbe: 'Greige (097)', schluessel: ['X-097'], art: 'bahn', leer: true },
  ], farben);
  assert.deepEqual(r.map(e => [e.farbe, e.art]), [['Greige (097)', 'bahn'], ['Greige (097)', 'einzel'], ['Taupe (272)', undefined]]);
});

test('Produkt ohne Farbe im Lexikon: Eintrag kommt ueber den Handle, fremde bleiben draussen', () => {
  const r = lagerEintraegeFuerFarben([{ titel: 'Eigen', handle: 'p-1', schluessel: ['Z-1'] }, { titel: 'Fremd', handle: 'p-2', schluessel: ['Z-2'] }], [], 'p-1');
  assert.deepEqual(r.map(e => e.titel), ['Eigen']);
});

// 6 eingelagert, 2 verschickt, 1 fuer eine Bestellung vergeben: 4 liegen in der Schublade, 3 sind frei.
const einzel = { id: 'ml-1', art: 'einzel', anzahl: 6, ort: 'Büro', stand: { verbraucht: 2, reserviert: 1, rest: 3 } };

test('Noch da: physisch da inklusive Reservierter, nicht der freie Rest', () => {
  assert.equal(nochDaZaehlbar(einzel), 4);
  assert.equal(lagerNochDa(einzel), 4);
  assert.equal(nochDaZaehlbar({ anzahl: 1, stand: { verbraucht: 3 } }), 0, 'nie negativ');
  assert.equal(lagerNochDa({ art: 'probestueck', anzahl: 2, stand: { rest: null } }), 2);
  assert.equal(lagerNochDa({ art: 'bahn' }), 1, 'Zuschnitt-Stueck ohne Anzahl zaehlt als eins');
  assert.equal(lagerNochDa({ ...einzel, leer: true }), 0);
});

test('Noch da setzen: Gesamtzahl = eingetippt + schon verschickt, Reservierte bleiben erhalten', () => {
  assert.equal(gesamtAusNochDa('5', einzel), 7);
  assert.deepEqual(lagerKorrektur(einzel, { nochDa: '5', ort: 'Büro' }), { aktion: 'aendern', id: 'ml-1', anzahl: 7 });
  assert.deepEqual(lagerKorrektur(einzel, { nochDa: 0, ort: 'Büro' }), { aktion: 'aendern', id: 'ml-1', anzahl: 2 }, 'auf 0: nur das Verschickte bleibt in der Gesamtzahl');
});

test('Unveraendert speichern aendert den Bestand nicht (auch nicht bei Reservierten)', () => {
  // Haette das Feld den freien Rest (3) gezeigt, waere die Gesamtzahl auf 5 gefallen und ein Stueck weg.
  assert.equal(lagerKorrektur(einzel, { nochDa: lagerNochDa(einzel), ort: 'Büro' }), null);
  assert.equal(lagerKorrektur(einzel, { nochDa: '', ort: 'Büro' }), null, 'leeres Feld laesst die Menge in Ruhe');
});

test('Nur Lagerplatz geaendert: Menge wird gar nicht mitgeschickt', () => {
  assert.deepEqual(lagerKorrektur(einzel, { nochDa: 4, ort: '  Regal B ' }), { aktion: 'aendern', id: 'ml-1', ort: 'Regal B' });
  assert.deepEqual(lagerKorrektur(einzel, { nochDa: 4, ort: '' }), { aktion: 'aendern', id: 'ml-1', ort: '' });
  assert.equal(lagerKorrektur({ ...einzel, ort: null }, { nochDa: 4, ort: '' }), null);
});

test('Zuschnitt-Stuecke: Anzahl direkt, 0 heisst leer, sonst liefe es weiter als vorraetig', () => {
  const stueck = { id: 'ml-2', art: 'probestueck', anzahl: 2, ort: null, stand: { verbraucht: 9, reserviert: 1, rest: null } };
  assert.deepEqual(lagerKorrektur(stueck, { nochDa: 3, ort: '' }), { aktion: 'aendern', id: 'ml-2', anzahl: 3 }, 'kein Verschicktes dazurechnen');
  assert.deepEqual(lagerKorrektur(stueck, { nochDa: 0, ort: '' }), { aktion: 'aendern', id: 'ml-2', leer: true });
});

test('Leerer Eintrag: erst eine Menge groesser 0 hebt das leer auf (wie "Wieder da")', () => {
  const leer = { ...einzel, leer: true };
  assert.deepEqual(lagerKorrektur(leer, { nochDa: 3, ort: 'Büro' }), { aktion: 'aendern', id: 'ml-1', leer: false, anzahl: 5 });
  assert.equal(lagerKorrektur(leer, { nochDa: 0, ort: 'Büro' }), null);
  assert.equal(lagerKorrektur(leer, { nochDa: '', ort: 'Büro' }), null);
  assert.deepEqual(lagerKorrektur({ id: 'ml-3', art: 'bahn', anzahl: 2, ort: 'Büro', leer: true }, { nochDa: 1, ort: 'Büro' }), { aktion: 'aendern', id: 'ml-3', leer: false, anzahl: 1 });
});

test('Ungueltige Menge wird abgewiesen', () => {
  for (const nochDa of ['-1', '1.5', 'abc', '1000']) assert.ok(lagerKorrektur(einzel, { nochDa, ort: 'Büro' }).fehler, nochDa);
});

test('Nach Lieferant: A, E, D, dann die uebrigen, unbekannt zuletzt; Summe je Gruppe', () => {
  const e = (id, anzahl, name, extra = {}) => ({ art: 'einzel', anzahl, lieferant: id ? { id, name } : null, stand: { verbraucht: 0 }, ...extra });
  const g = nachLieferant([
    e(null, 1), e('B', 2, 'Zulieferer'), e('D', 3, 'Lieferant D'), e('C', 1, 'Anbieter'), e('A', 2, 'Lieferant A'), e('E', 4, 'Lieferant E'), e('A', 5, 'Lieferant A'),
    e('A', 9, 'Lieferant A', { leer: true }), { art: 'bahn', anzahl: 2, lieferant: { id: 'A', name: 'Lieferant A' } },
  ]);
  assert.deepEqual(g.map(x => [x.id, x.name, x.eintraege.length, x.stueck]), [
    ['A', 'Lieferant A', 4, 9], ['E', 'Lieferant E', 1, 4], ['D', 'Lieferant D', 1, 3], ['C', 'Anbieter', 1, 1], ['B', 'Zulieferer', 1, 2], [null, 'Lieferant unbekannt', 1, 1],
  ]);
});
