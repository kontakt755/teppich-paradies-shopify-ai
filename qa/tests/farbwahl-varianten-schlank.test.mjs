import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Farbwahl-Block druckt nur die vom Skript gelesenen Variantenfelder
// (volle Liste: ~127 KB bei 102 Varianten, Projektion ~12 KB).
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(root, 'blocks', 'color-swatch-picker.liquid'), 'utf8');

test('Variantenliste ist eine Projektion, kein product.variants | json', () => {
  assert.doesNotMatch(src, /product\.variants\s*\|\s*json/);
  assert.match(src, /const variants = \[\{% for v in product\.variants %\}/);
});

test('Skript liest nur id, options, featured_media.id, available', () => {
  const skript = src.slice(src.indexOf('const variants ='));
  const felder = new Set([...skript.matchAll(/\bvariant\.(\w+)/g)].map((m) => m[1]));
  for (const f of felder) assert.ok(['id', 'options', 'featured_media', 'available'].includes(f), `unerwartetes Feld ${f}`);
});
