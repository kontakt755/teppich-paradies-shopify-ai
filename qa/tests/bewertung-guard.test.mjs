import assert from 'node:assert/strict';
import test from 'node:test';
import { befundeIn, befundeImCode, stripHeader, GEPRUEFTE_FELDER, HINWEIS, METAFELD } from '../bewertung-guard.mjs';

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

test('Liquid, das nur die Einstellung liest, zeigt nicht den Monatsstand', () => {
  const code = (inhalt) => befundeImCode(`${inhalt} {% ${HINWEIS} %}`, 'x.liquid');
  assert.equal(code('{{ settings.tp_google_wert }}').length, 1);
  assert.equal(code('{{ settings.tp_google_anzahl }}').length, 1);
  assert.equal(code(`{{ ${METAFELD}.value.wert | default: settings.tp_google_wert }}`).length, 0);
  assert.equal(code('{{ settings.tp_google_link }}').length, 0, 'der Link kommt nicht aus dem Monatslauf');
});

test('Note ohne Hinweis nach § 5b UWG wird gemeldet', () => {
  const b = befundeImCode(`{{ ${METAFELD}.value.wert | default: settings.tp_google_wert }}`, 'x.liquid');
  assert.deepEqual(b.map((x) => x.typ), ['hinweis']);
  assert.equal(befundeImCode(`{{ ${METAFELD}.value.wert | default: settings.tp_google_wert }} {%- ${HINWEIS}, kurz: true -%}`, 'x.liquid').length, 0);
});

test('Liquid, das nur das Metafeld liest, braucht den Hinweis ebenfalls', () => {
  const b = befundeImCode(`{{ ${METAFELD}.value.wert }}`, 'x.liquid');
  assert.deepEqual(b.map((x) => x.typ), ['hinweis']);
});

test('Aussagen, die eine Echtheitspruefung behaupten, werden gemeldet', () => {
  for (const satz of ['Bewertet von echten Kunden bei Google', 'Echte Rezensionen aus Google', 'Lesen Sie echte Erfahrungen', 'Verifizierter Kunde']) {
    assert.deepEqual(befundeImCode(satz, 'x.liquid').map((x) => x.typ), ['echtheit'], satz);
  }
  assert.equal(befundeImCode('Bewertet bei Google. Echte Ergebnisse aus unseren Projekten.', 'x.liquid').length, 0);
});

test('die Liefertage-Hilfe mit "verifizierte Lieferzeit" ist kein Befund', () => {
  assert.equal(befundeImCode('Nur eine verifizierte Lieferzeit eintragen', 'x.liquid').length, 0);
});

test('Bewertungs-Widget ohne Hinweis wird gemeldet', () => {
  const b = befundeImCode('<div class="elfsight-app-abc"></div>', 'x.liquid');
  assert.deepEqual(b.map((x) => x.typ), ['hinweis']);
  assert.equal(befundeImCode(`<div class="elfsight-app-abc"></div> {% ${HINWEIS} %}`, 'x.liquid').length, 0);
});

test('ein reiner Link zum Google-Profil braucht keinen Hinweis', () => {
  assert.equal(befundeImCode('<a href="{{ settings.tp_google_link }}">Google</a>', 'x.liquid').length, 0);
});
