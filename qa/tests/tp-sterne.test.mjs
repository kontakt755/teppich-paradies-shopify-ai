// Produktbewertungen: Sterne und aggregateRating nur aus echten App-Daten
// (reviews.rating / reviews.rating_count). Ohne Bewertung darf nichts erscheinen -
// keine leeren Sterne, keine erfundenen Durchschnittswerte, nie die
// Google-Unternehmensbewertung (docs/weiterentwicklung/bewertungen.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lies = (datei) => readFileSync(path.join(root, datei), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '')
  .replace(/{%\s*stylesheet\s*%}[\s\S]*?{%\s*endstylesheet\s*%}/g, '');
const engine = new Liquid({ templates: { 'tp-sterne': lies('snippets/tp-sterne.liquid') } });
const sterne = (metafields, groesse = 'seite', ziel = '') =>
  engine.parseAndRender("{% render 'tp-sterne', product: product, groesse: groesse, ziel: ziel %}", { product: { metafields }, groesse, ziel });
const bewertet = (rating, count) => ({ reviews: { rating: { value: { rating, scale_max: 5, scale_min: 1 } }, rating_count: { value: count } } });

test('ohne Bewertungsdaten: keine Ausgabe', async () => {
  assert.equal((await sterne({})).trim(), '');
  assert.equal((await sterne({ reviews: {} })).trim(), '');
});

test('Anzahl 0 oder Wert 0: keine Ausgabe', async () => {
  assert.equal((await sterne(bewertet(4.5, 0))).trim(), '');
  assert.equal((await sterne(bewertet(0, 3))).trim(), '');
});

test('echte Bewertung: Wert mit Komma, Anzahl, Fuellbreite, Vorleser-Text', async () => {
  const html = await sterne(bewertet(4.8, 12), 'seite', '#bewertungen');
  assert.match(html, /<a\s/);
  assert.match(html, /href="#bewertungen"/);
  assert.match(html, />4,8</);
  assert.match(html, /\(12 Bewertungen\)/);
  assert.match(html, /width: 96(\.0)?%/);
  assert.match(html, /aria-label="Bewertet mit 4,8 von 5 Sternen, 12 Bewertungen"/);
});

test('Einzahl und ganze Note', async () => {
  const html = await sterne(bewertet(5, 1));
  assert.match(html, />5,0</);
  assert.match(html, /\(1 Bewertung\)/);
  assert.match(html, /<span\s+class="tp-sterne/, 'ohne Ziel kein Link');
});

test('Karte: kompakt, nur Zahl in Klammern', async () => {
  const html = await sterne(bewertet(4.25, 7), 'karte');
  assert.match(html, /tp-sterne--karte/);
  assert.match(html, /\(7\)/);
  assert.doesNotMatch(html, /Bewertungen\)/);
});

test('Sterne lesen nie die Google-Unternehmensbewertung', () => {
  for (const datei of ['snippets/tp-sterne.liquid', 'blocks/tp-produkt-sterne.liquid', 'blocks/tp-card-sterne.liquid']) {
    assert.doesNotMatch(readFileSync(path.join(root, datei), 'utf8'), /tp_google/, datei);
  }
});

test('JSON-LD: aggregateRating nur mit reviews.* und Anzahl > 0', () => {
  const sd = readFileSync(path.join(root, 'snippets/tp-product-structured-data.liquid'), 'utf8');
  const teil = sd.slice(sd.indexOf('"aggregateRating"') - 600, sd.indexOf('"aggregateRating"'));
  assert.match(teil, /tp_sd_rating_wert > 0 and tp_sd_rating_anzahl > 0/);
  assert.equal((sd.match(/"aggregateRating"/g) || []).length, 1, 'genau eine Stelle');
  assert.doesNotMatch(sd, /tp_google/);
});
