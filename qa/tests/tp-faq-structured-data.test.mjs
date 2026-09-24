import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Liquid } from 'liquidjs';

// Rendert snippets/tp-faq-structured-data.liquid mit LiquidJS und parst das
// Ergebnis als JSON. Ein Komma zu viel oder ein unmaskiertes Anführungszeichen
// macht JSON-LD unbrauchbar, ohne dass die Seite kaputtgeht - das faellt sonst
// niemandem auf.
const root = path.resolve(import.meta.dirname, '../..');
const lies = (d) => fs.readFileSync(path.join(root, d), 'utf8');
const quelle = lies('snippets/tp-faq-structured-data.liquid')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/, '');
const engine = new Liquid();

const block = (frage, antwort) => ({ settings: { frage, antwort } });

async function rendern(bloecke, extra = {}) {
  return engine.parseAndRender(quelle, {
    bloecke,
    canonical_url: 'https://www.teppich-paradies.net/',
    ...extra,
  });
}

function json(html) {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'kein JSON-LD ausgegeben');
  return JSON.parse(m[1]);
}

test('FAQPage entsteht aus den sichtbaren Bloecken', async () => {
  const d = json(await rendern([
    block('Wie messe ich richtig?', '<p>Messen Sie an zwei Stellen.</p>'),
    block('Was bedeutet „gekettelt“?', '<p>Die Kante wird umnäht.</p>'),
  ]));
  assert.equal(d['@type'], 'FAQPage');
  assert.equal(d.mainEntity.length, 2);
  assert.equal(d.mainEntity[0]['@type'], 'Question');
  assert.equal(d.mainEntity[0].name, 'Wie messe ich richtig?');
  assert.equal(d.mainEntity[0].acceptedAnswer['@type'], 'Answer');
  assert.equal(d.mainEntity[0].acceptedAnswer.text, 'Messen Sie an zwei Stellen.');
  assert.equal(d.mainEntity[1].name, 'Was bedeutet „gekettelt“?');
  assert.equal(d['@id'], 'https://www.teppich-paradies.net/#faq');
});

test('Anfuehrungszeichen und Sonderzeichen bleiben gueltiges JSON', async () => {
  const d = json(await rendern([
    block('Was heißt "stuhlrollengeeignet"?', '<p>Ein Bürostuhl darf darauf rollen — Klasse 33 & mehr.</p>'),
  ]));
  assert.equal(d.mainEntity[0].name, 'Was heißt "stuhlrollengeeignet"?');
  assert.match(d.mainEntity[0].acceptedAnswer.text, /Klasse 33 & mehr/);
});

test('Unvollstaendige Bloecke werden uebersprungen, nicht als leere Frage ausgegeben', async () => {
  const d = json(await rendern([
    block('Nur eine Frage ohne Antwort', ''),
    block('', '<p>Nur eine Antwort</p>'),
    block('Vollstaendig', '<p>Ja.</p>'),
  ]));
  assert.equal(d.mainEntity.length, 1);
  assert.equal(d.mainEntity[0].name, 'Vollstaendig');
});

test('Ohne verwertbaren Block entsteht kein Skript', async () => {
  assert.equal((await rendern([])).includes('ld+json'), false);
  assert.equal((await rendern([block('Frage', '<p>   </p>')])).includes('ld+json'), false);
});

test('Beide FAQ-Sections binden das Snippet mit ihren eigenen Schluesseln ein', () => {
  const start = lies('sections/tp-start-faq.liquid');
  const teppiche = lies('sections/tp-teppiche-faq.liquid');
  assert.match(start, /render 'tp-faq-structured-data', bloecke: section\.blocks, frage_key: 'frage', antwort_key: 'antwort'/);
  assert.match(teppiche, /render 'tp-faq-structured-data', bloecke: section\.blocks, frage_key: 'question', antwort_key: 'answer'/);
  // Die Schluessel muessen zu den Schemata passen, sonst bleibt das JSON-LD leer.
  assert.match(start, /"id": "frage"/);
  assert.match(start, /"id": "antwort"/);
  assert.match(teppiche, /"id": "question"/);
  assert.match(teppiche, /"id": "answer"/);
});
