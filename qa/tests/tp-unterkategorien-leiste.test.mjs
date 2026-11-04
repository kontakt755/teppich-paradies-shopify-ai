import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Liquid } from 'liquidjs';

// Unterkategorie-Leiste: Quelle ist das Hauptmenue. Kurz- und Mittelflor stehen
// seit 2026-11-04 nicht mehr im Menue (nur noch Filter Florhoehe), ihre Seiten
// behalten trotzdem die Teppichboden-Leiste (Rueckfall ueber den Handle).
const root = path.resolve(import.meta.dirname, '../..');
const quelle = fs.readFileSync(path.join(root, 'snippets/tp-unterkategorien-leiste.liquid'), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/, '')
  .replace(/{%-?\s*stylesheet\s*-?%}[\s\S]*?{%-?\s*endstylesheet\s*-?%}/, '');

const ohneDoc = (t) => t.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/, '');
const snippet = (f) => ohneDoc(fs.readFileSync(path.join(root, 'snippets', path.basename(f)), 'utf8'));
const engine = new Liquid({
  extname: '.liquid',
  fs: {
    readFileSync: snippet,
    readFile: async (f) => snippet(f),
    existsSync: (f) => fs.existsSync(path.join(root, 'snippets', path.basename(f))),
    exists: async (f) => fs.existsSync(path.join(root, 'snippets', path.basename(f))),
    resolve: (_dir, file, ext) => file + ext,
  },
});
for (const f of ['asset_url', 'image_url', 'image_tag']) engine.registerFilter(f, (v) => String(v ?? ''));

const link = (title, handle, links = []) => ({ title, url: handle === '#' ? '#' : `/collections/${handle}`, type: 'collection_link', object: { handle }, links });
const menu = { links: [
  link('Teppichboden', 'teppichboden', [link('Alle Teppichböden', 'teppichboden'), link('Hochflor', 'teppichboden-hochflor'), link('Velours', 'teppichboden-velours'), link('Preisklasse', '#', [link('Preiswert', 'teppichboden')])]),
  link('Teppichfliesen', 'teppichfliesen', [link('Alle Teppichfliesen', 'teppichfliesen')]),
  link('Angebote & Reste', 'restposten', [link('Aktuelle Angebote', 'angebote'), link('Alle Restposten & Auslauf', 'restposten'), link('Auslauf Teppichboden', 'auslauf')]),
] };
const leiste = async (handle) => {
  const html = await engine.parseAndRender(quelle, { linklists: { 'main-menu': menu }, images: {}, collections: { angebote: { products: [] } }, collection_resource: { handle, url: `/collections/${handle}` } });
  return [...html.matchAll(/class="tp-uk__pill[^"]*"\s+href="([^"]+)"/g)].map((m) => m[1]);
};

test('Unterkategorie im Menue: Geschwister aus dem Menue, ohne Spalten', async () => {
  assert.deepEqual(await leiste('teppichboden-hochflor'), ['/collections/teppichboden', '/collections/teppichboden-hochflor', '/collections/teppichboden-velours']);
});

test('Kurzflor steht nicht mehr im Menue und bekommt trotzdem die Teppichboden-Leiste', async () => {
  assert.deepEqual(await leiste('teppichboden-kurzflor'), ['/collections/teppichboden', '/collections/teppichboden-hochflor', '/collections/teppichboden-velours']);
});

test('Fremde Kollektion ohne Menuepunkt bleibt ohne Leiste', async () => {
  assert.deepEqual(await leiste('kokoslaeufer'), []);
});

test('Restposten: leere Angebotsseite erscheint nicht als Chip, die Auslauf-Seiten schon', async () => {
  assert.deepEqual(await leiste('restposten'), ['/collections/restposten', '/collections/auslauf']);
  assert.deepEqual(await leiste('auslauf'), ['/collections/restposten', '/collections/auslauf']);
});
