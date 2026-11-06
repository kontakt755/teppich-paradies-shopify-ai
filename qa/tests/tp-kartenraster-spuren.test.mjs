// Kartenraster (snippets/tp-kartenraster.liquid): Eine Karte kommt nur ins feste
// Zeilenraster (Subgrid), wenn jedes direkte Element ihres Inhalts in der Liste steht.
// Fehlt ein Element, faellt die Karte aufs Flex-Layout zurueck und zieht in gemischten
// Reihen die Spuren der Nachbarkarten auseinander. So geschehen 2026-11-06: der Wrapper
// .tp-card-aktion__gruppe aus blocks/tp-card-aktion (seit #1452) fehlte, alle Karten
// neben einer Black-Week-Karte hatten 60-100 px Leerraum zwischen ihren Zeilen.
//
// Der Test ist strukturell: Das aeussere Element jedes Kartenblocks (das mit
// block.shopify_attributes) muss mit seiner ersten Klasse in allen drei Listen stehen
// und eine eigene Spur (grid-row) haben.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const raster = readFileSync(path.join(root, 'snippets/tp-kartenraster.liquid'), 'utf8');

const listen = [...raster.matchAll(/\.product-card__content > :not\(([^)]*)\)/g)]
  .map((treffer) => treffer[1].split(',').map((s) => s.trim()));

test('das Raster fuehrt drei gleiche Listen (li, Karte, Inhalt)', () => {
  assert.equal(listen.length, 3, `gefunden: ${listen.length}`);
  assert.deepEqual(listen[1], listen[0]);
  assert.deepEqual(listen[2], listen[0]);
});

const kartenbloecke = readdirSync(path.join(root, 'blocks'))
  .filter((name) => name.startsWith('tp-card-') && name.endsWith('.liquid'));

const aeussere = kartenbloecke.flatMap((name) => {
  const code = readFileSync(path.join(root, 'blocks', name), 'utf8');
  return [...code.matchAll(/<[a-z-]+\s+class="([^"{]+)[^>]*block\.shopify_attributes/g)]
    .map((treffer) => ({ datei: `blocks/${name}`, klasse: treffer[1].trim().split(/\s+/)[0] }));
});

test('es gibt Kartenbloecke mit aeusserem Element - sonst prueft dieser Test nichts', () => {
  assert.ok(aeussere.length >= 6, `nur ${aeussere.length} gefunden`);
  assert.ok(aeussere.some((e) => e.klasse === 'tp-card-aktion__gruppe'));
});

for (const { datei, klasse } of aeussere) {
  test(`${datei}: .${klasse} hat eine Spur im Kartenraster`, () => {
    assert.ok(listen[0].includes(`.${klasse}`), `.${klasse} fehlt in der Liste - die Karte faellt aus dem Raster.`);
    const spur = new RegExp(`\\.product-card__content > (?::is\\([^)]*\\.${klasse}[,)][^{]*|\\.${klasse}\\s*)\\{\\s*grid-row:`);
    assert.match(raster, spur, `.${klasse} hat keine eigene grid-row.`);
  });
}
