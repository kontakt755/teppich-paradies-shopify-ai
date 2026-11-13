import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Liquid } from 'liquidjs';

// Handy-Kompaktansicht (Werkbank w-375): nur Teppichboden und Vorwerk, damit
// Vorher/Nachher messbar bleibt. Alle anderen Kategorien, auch JAB in derselben
// Vorlage wie Vorwerk, bleiben unveraendert.
const root = path.resolve(import.meta.dirname, '../..');
const lies = (d) => fs.readFileSync(path.join(root, d), 'utf8');
const SNIPPET = lies('snippets/tp-mobil-kompakt.liquid');
const engine = new Liquid();
const gate = async (handle) => (await engine.parseAndRender(SNIPPET, { collection: { handle } })).trim();

test('das Gate gilt nur fuer Teppichboden und Vorwerk', async () => {
  assert.equal(await gate('teppichboden'), 'ja');
  assert.equal(await gate('vorwerk-teppichboden'), 'ja');
  for (const handle of ['jab-anstoetz-teppichboden', 'teppichboden-hochflor', 'vinylboden-1', 'teppiche', 'angebote-teppichboden']) {
    assert.equal(await gate(handle), '', `${handle} darf nicht kompakt werden`);
  }
});

test('beide Vorlagen setzen den Kompakt-Block hinter die Einleitung', () => {
  for (const vorlage of ['templates/collection.teppichboden.json', 'templates/collection.teppichboden-marke.json']) {
    const json = JSON.parse(lies(vorlage).replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));
    const kopf = json.sections.section;
    const bloecke = Object.entries(kopf.blocks).filter(([, b]) => b.type === 'tp-mobil-kompakt');
    assert.equal(bloecke.length, 1, `${vorlage}: genau ein Kompakt-Block`);
    const reihenfolge = kopf.block_order;
    const beschreibung = reihenfolge.findIndex((id) => kopf.blocks[id]?.settings?.text === '{{ closest.collection.description }}');
    assert.ok(beschreibung >= 0, `${vorlage}: Beschreibungsblock gefunden`);
    assert.equal(reihenfolge[beschreibung + 1], bloecke[0][0], `${vorlage}: Kompakt-Block steht direkt hinter der Einleitung`);
  }
});

test('der Musterkasten steht am Handy im Raster, vor dem Raster nur ab 750 px', () => {
  assert.match(lies('sections/main-collection.liquid'), /tp-teppichboden-kampagne-kasten', variante: 'einschub'/);
  assert.match(lies('sections/tp-teppichboden-kampagne.liquid'), /variante: 'nur-desktop'/);
  assert.match(lies('assets/tp-teppichboden-kampagne.css'), /\.tp-tbk--einschub \{ display: none; \}/);
});
