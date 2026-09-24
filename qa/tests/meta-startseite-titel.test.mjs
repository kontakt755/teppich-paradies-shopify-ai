// Startseite: <title> und og:title muessen denselben Text tragen.
//
// Befund 2026-09-23 (live gemessen): <title> lautete
// "Teppichboden, Vinyl & Verlegeservice Oranienburg | Teppich Paradies",
// og:title aber "TeppichParadies". Ursache: der <title> hatte einen Fallback
// fuer den fehlenden Homepage-Titel, og_title nicht. Beide lesen jetzt
// dieselbe Variable - dieser Test haelt sie zusammen.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(root, 'snippets', 'meta-tags.liquid'), 'utf8');

test('Der Startseitentitel steht genau einmal als Literal im Snippet', () => {
  const treffer = src.match(/Teppichboden, Vinyl & Verlegeservice Oranienburg \| Teppich Paradies/g) || [];
  assert.equal(treffer.length, 1,
    `Der Titel steht ${treffer.length}x im Quelltext - er gehoert genau einmal in tp_startseite_titel.`);
  assert.match(src, /assign tp_startseite_titel = 'Teppichboden, Vinyl & Verlegeservice Oranienburg \| Teppich Paradies'/);
});

test('og:title uebernimmt den Startseitentitel, wenn Shopify nur den Shopnamen liefert', () => {
  assert.match(src, /if request\.page_type == 'index' and page_title == shop\.name\s*\n\s*assign og_title = tp_startseite_titel/);
});

test('Der <title>-Zweig der Startseite gibt dieselbe Variable aus', () => {
  assert.match(src, /\{\{ tp_startseite_titel \}\}/);
});
