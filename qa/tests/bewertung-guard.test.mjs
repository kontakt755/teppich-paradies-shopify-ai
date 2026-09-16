import assert from 'node:assert/strict';
import test from 'node:test';
import { befundeIn, stripHeader, GEPRUEFTE_FELDER } from '../bewertung-guard.mjs';

const huelle = (blockTyp, settings) => JSON.stringify({
  sections: { main: { type: 'main-product', blocks: { b1: { type: blockTyp, settings } } } },
});

test('meldet einen Wert am Bewertungsbeleg', () => {
  const b = befundeIn(huelle('tp-bewertungsbeleg', { rating: '4,9' }), 'x.json');
  assert.equal(b.length, 1);
  assert.equal(b[0].feld, 'rating');
  assert.equal(b[0].wert, '4,9');
});

test('meldet genau den Fall, der die Drift ausgeloest hat', () => {
  // product.einfassung nannte 4.8, alle anderen 4,9 - beide fuer sich plausibel.
  const b = befundeIn(huelle('tp-bewertungsbeleg', { rating: '4.8', review_link: 'https://…' }), 'product.einfassung.json');
  assert.deepEqual(b.map((x) => x.feld).sort(), ['rating', 'review_link']);
});

test('leere Felder und Leerzeichen sind kein Befund', () => {
  assert.equal(befundeIn(huelle('tp-bewertungsbeleg', { rating: '', review_count: '   ' }), 'x.json').length, 0);
});

test('findet die Startseiten-Abschnitte auch als Section', () => {
  const roh = JSON.stringify({ sections: { hero: { type: 'tp-start-hero', settings: { rating_wert: '4,9' } } } });
  const b = befundeIn(roh, 'index.json');
  assert.equal(b.length, 1);
  assert.equal(b[0].typ, 'tp-start-hero');
});

test('andere Einstellungen desselben Blocks bleiben unberuehrt', () => {
  const b = befundeIn(huelle('tp-bewertungsbeleg', { rating: '', ueberschrift: 'Kundenstimmen' }), 'x.json');
  assert.equal(b.length, 0);
});

test('fremde Blocktypen werden nicht geprueft', () => {
  assert.equal(befundeIn(huelle('tp-vertrauen', { rating: '4,9' }), 'x.json').length, 0);
});

test('stripHeader entfernt den Shopify-Kommentarkopf', () => {
  assert.equal(stripHeader('/* auto */\n{"a":1}'), '{"a":1}');
});

test('geprueft werden die drei bekannten Traeger', () => {
  assert.deepEqual(Object.keys(GEPRUEFTE_FELDER).sort(), ['tp-bewertungsbeleg', 'tp-start-hero', 'tp-start-trust']);
});
