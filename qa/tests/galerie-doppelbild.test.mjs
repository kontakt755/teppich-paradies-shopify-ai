import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Liquid } from 'liquidjs';

// Rundgang 2026-10-26, #29: Marken-Teppiche nach Mass zeigten dasselbe Foto
// zweimal - einmal als eigene Kopie am Teppich (Dateiname mit "_<uuid>"),
// einmal als Materialfoto der Meterware (ohne Endung). Die Galerie vergleicht
// jetzt zusaetzlich den Dateistamm (snippets/tp-medien-dateistamm.liquid).

const lies = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const ohneDoc = (s) => s.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const engine = new Liquid();
const stammQuelle = ohneDoc(lies('snippets/tp-medien-dateistamm.liquid'));
const stamm = async (src) => (await engine.parseAndRender(stammQuelle, { media: { preview_image: { src } } })).trim();

test('Kopie mit UUID-Endung und Original ergeben denselben Stamm', async () => {
  const kopie = await stamm('//www.teppich-paradies.net/cdn/shop/files/2F84_STRATO_Vorschau_90cfb484-912c-479f-aa14-dfee38dea49e.jpg?v=1727');
  const original = await stamm('//www.teppich-paradies.net/cdn/shop/files/2F84_STRATO_Vorschau.jpg?v=1700');
  assert.equal(kopie, '2F84_STRATO_Vorschau');
  assert.equal(original, '2F84_STRATO_Vorschau');
});

test('andere Farben und Namen ohne UUID bleiben verschieden', async () => {
  assert.equal(await stamm('//x/files/3R94_STRATO_Vorschau_843fdc3e-eb33-48ed-8783-868f1c244629.jpg'), '3R94_STRATO_Vorschau');
  assert.equal(await stamm('//x/files/raumbeispiel_wohnzimmer_hell_und_freundlich_mit_sofa_2.jpg'), 'raumbeispiel_wohnzimmer_hell_und_freundlich_mit_sofa_2');
  assert.equal(await stamm('//x/files/foto.v2.jpg'), 'foto.v2');
  assert.equal(await stamm(''), '');
});

const doppeltEngine = new Liquid({ templates: {
  'tp-medien-dateistamm': stammQuelle,
  'tp-medien-doppelt': ohneDoc(lies('snippets/tp-medien-doppelt.liquid')),
} });
let naechsteId = 100;
const bild = (name) => ({ id: naechsteId++, preview_image: { src: '//www.teppich-paradies.net/cdn/shop/files/' + name + '?v=1' } });
const doppelt = async (media, liste) => (await doppeltEngine.parseAndRender("{% render 'tp-medien-doppelt', media: media, liste: liste %}", { media, liste })).trim();

test('Materialfoto ist doppelt, wenn seine Kopie schon in der Galerie steht', async () => {
  const galerie = [bild('2F84_STRATO_Vorschau_90cfb484-912c-479f-aa14-dfee38dea49e.jpg'), bild('strato-ecke.jpg')];
  assert.equal(await doppelt(bild('2F84_STRATO_Vorschau.jpg'), galerie), 'ja');
  assert.equal(await doppelt(bild('3R94_STRATO_Vorschau.jpg'), galerie), '');
  assert.equal(await doppelt({ id: 9, preview_image: null }, galerie), '');
  assert.equal(await doppelt(null, galerie), '');
  // Gleiche Medien-ID bleibt wie bisher doppelt.
  assert.equal(await doppelt({ id: 7, preview_image: null }, [{ id: 7, preview_image: null }]), 'ja');
});

test('die Galerie fragt vor dem Anhaengen des Materialfotos', () => {
  const galerie = lies('snippets/product-media-gallery-content.liquid');
  const block = galerie.slice(galerie.indexOf("render 'tp-serena-material-id'"), galerie.indexOf('# Variant-specific media'));
  assert.match(block, /render 'tp-medien-doppelt', media: tp_serena_material\.first, liste: sorted_media/);
  assert.match(block, /unless tp_serena_doppelt contains 'ja'\s+assign sorted_media = sorted_media \| concat: tp_serena_material/);
  assert.doesNotMatch(block, /tp_serena_exists/, 'die ID-Pruefung steckt jetzt im Snippet');
});
