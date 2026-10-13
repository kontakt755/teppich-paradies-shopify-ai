import test from 'node:test';
import assert from 'node:assert/strict';
import { bestellinhalt, musterText, musterHerkunftText, wareText, musterTitel } from '../lib/bestellinhalt.mjs';

// Nur erfundene Daten.
const m = (titel, farbe, extra = {}) => ({ istMuster: true, titel, farbe, ...extra });

test('musterTitel: Vorsatz "Muster" und Rollenbreiten fallen weg', () => {
  assert.equal(musterTitel('Muster Testvelours Teppichboden 400cm 500cm'), 'Testvelours Teppichboden');
  assert.equal(musterTitel('Muster: Testeiche – Vinylboden von der Rolle'), 'Testeiche – Vinylboden von der Rolle');
  assert.equal(musterTitel(''), 'Muster');
});

test('musterText: je Produkt seine Farben, doppelte Farben einmal, Farbe im Titel nicht doppelt', () => {
  assert.equal(musterText([
    m('Muster Testvelours Teppichboden 400cm', 'Sand'), m('Muster Testvelours Teppichboden 400cm', 'Greige'),
    m('Muster Testvelours Teppichboden 400cm', 'Sand'), m('Muster Palera Teppich nach Maß', 'Leinen (439)'),
    m('Muster: Testeiche Greige – Vinylboden von der Rolle', 'Testeiche Greige'), { istMuster: false, titel: 'Ware' },
  ]), 'Testvelours Teppichboden: Sand, Greige · Palera Teppich nach Maß: Leinen (439) · Testeiche Greige – Vinylboden von der Rolle');
});

test('musterHerkunftText: Musterlager mit Platz, "haben wir da", sonst nichts', () => {
  const lager = { musterHerkunft: 'eigen_versand', musterHerkunftQuelle: 'lager', musterLager: { ort: 'Regal B' } };
  assert.equal(musterHerkunftText([m('A', 'x', lager)]), 'aus dem Musterlager (Regal B)');
  assert.equal(musterHerkunftText([m('A', 'x', lager), m('A', 'y', lager)]), 'alle aus dem Musterlager (Regal B)');
  assert.equal(musterHerkunftText([m('A', 'x', lager), m('B', 'y')]), '1 aus dem Musterlager (Regal B)');
  assert.equal(musterHerkunftText([m('A', 'x', { musterHerkunft: 'eigen_vorbei' })]), 'haben wir da – vorbeibringen');
  assert.equal(musterHerkunftText([m('A', 'x', { musterHerkunft: 'eigen_versand' }), m('B', 'y')]), '1 haben wir da – verschicken');
  assert.equal(musterHerkunftText([m('A', 'x')]), '');
});

test('wareText: Artikel mit Farbe und Menge, hoechstens drei, dann "+N weitere"', () => {
  const w = (titel, farbe, kundenmenge) => ({ istMuster: false, titel, farbe, kundenmenge });
  assert.equal(wareText([w('Testboden Eiche', '–', '12 m²')]), 'Testboden Eiche (12 m²)');
  assert.equal(wareText([w('A', 'Rot', null), w('B', null, null), w('C', null, null), w('D', null, null)]), 'A (Rot) · B · C · +1 weitere');
});

test('bestellinhalt: Art der Bestellung und beide Teile getrennt', () => {
  assert.equal(bestellinhalt([]).art, 'leer');
  assert.equal(bestellinhalt(null).art, 'leer');
  assert.equal(bestellinhalt([m('A', 'x')]).art, 'muster');
  const g = bestellinhalt([m('Muster Testvelours', 'Sand'), { istMuster: false, titel: 'Teppichunterlage' }]);
  assert.equal(g.art, 'gemischt');
  assert.deepEqual([g.muster.anzahl, g.muster.text, g.ware.anzahl, g.ware.text], [1, 'Testvelours: Sand', 1, 'Teppichunterlage']);
});
