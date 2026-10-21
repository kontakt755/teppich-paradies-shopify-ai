// Menue-Bildkacheln: eine Kachel kann mehrere Menuepunkte bedienen ("A || B"),
// weil der Header bei 50 Bloecken voll ist (Benutzer 2026-10-19, Markenlogos).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Liquid } from 'liquidjs';

const root = new URL('../../', import.meta.url);
const engine = new Liquid();
const quelle = readFileSync(new URL('snippets/tp-menu-kachel-index.liquid', root), 'utf8')
  .replace(/\{%-? doc -?%\}[\s\S]*?\{%-? enddoc -?%\}/, '');
const kacheln = [
  'Hochflor|~|https://cdn/h.jpg?width=800|~|~~',
  'Teppichfliesen || Alle Teppichfliesen || Auch als Teppichfliesen →|~|https://cdn/f.jpg?width=800|~|~~',
  'Marke Vorwerk || Vorwerk nach Maß|~|https://cdn/v-logo-menue.jpg?width=800|~|~~',
  '/collections/auslauf-teppichfliesen|~|https://cdn/a.jpg?width=800|~|~~',
].join('');
const index = async (title, url = '/collections/x') =>
  Number((await engine.parseAndRender(quelle, { kacheln, link: { title, url } })).trim());

test('einzelner Menuepunkt wird wie bisher gefunden', async () => {
  assert.equal(await index('Hochflor'), 1);
});

test('jede Alternative einer Kachel trifft dieselbe Kachel', async () => {
  assert.equal(await index('Teppichfliesen'), 2);
  assert.equal(await index('Alle Teppichfliesen'), 2);
  assert.equal(await index('Auch als Teppichfliesen →'), 2);
  assert.equal(await index('Vorwerk nach Maß'), 3);
  assert.equal(await index('Marke Vorwerk'), 3);
});

test('Pfadvergleich und Fehlanzeige bleiben', async () => {
  assert.equal(await index('Auslauf', 'https://www.teppich-paradies.net/collections/auslauf-teppichfliesen'), 4);
  assert.equal(await index('Teppich'), 0);
  assert.equal(await index('Marke'), 0);
});

test('Header: jede Kachel hat ein Bild, kein Menuepunkt steht in zwei Kacheln', () => {
  const raw = readFileSync(new URL('sections/header-group.json', root), 'utf8');
  const json = JSON.parse(raw.slice(raw.indexOf('{', raw.indexOf('*/'))));
  const bloecke = Object.values(json.sections.header_section.blocks).filter((b) => b.type === '_tp-menu-kachel');
  const punkte = bloecke.flatMap((b) => b.settings.menu_match.split('||').map((s) => s.trim()));
  assert.equal(new Set(punkte).size, punkte.length, 'Menuepunkt doppelt vergeben');
  for (const b of bloecke) assert.ok(b.settings.image, `${b.settings.menu_match} ohne Bild`);
});
