// blocks/tp-teppich-struktur.liquid zeigt zur gewaehlten Teppichfarbe das echte Foto des
// Teppichbodens. Die Zuordnung laeuft allein ueber den Farbnamen (option1) - ein falsches
// Foto waere eine falsche Materialaussage. Rendert den echten Block mit LiquidJS.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
let source = readFileSync(path.join(root, 'blocks/tp-teppich-struktur.liquid'), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
source = source.slice(0, source.indexOf('{% javascript %}'));

const engine = new Liquid();
engine.registerFilter('image_url', (bild) => `https://cdn.example/${bild}`);

const teppich = (basisVarianten, gewaehlt = 0) => {
  const variants = [{ id: 11, option1: 'Sand', featured_image: 'teppich-sand.jpg' }, { id: 22, option1: 'Creme', featured_image: 'teppich-creme.jpg' }];
  return {
    title: 'Woolara Teppich nach Mass',
    variants,
    selected_or_first_available_variant: variants[gewaehlt],
    metafields: { service: { einfass_basis: basisVarianten ? { value: { variants: basisVarianten } } : undefined } },
  };
};
const block = { settings: { titel: 'Struktur in Originalaufnahme', hinweis: 'Echtes Foto.' }, shopify_attributes: '' };
const render = (product) => engine.parseAndRender(source, { product, block });
const daten = (html) => JSON.parse(html.match(/data-tp-tts-daten>([\s\S]*?)<\/script>/)[1]);

const basis = [
  { option1: 'Sand', featured_image: 'sand-400.jpg' },
  { option1: 'Sand', featured_image: 'sand-500.jpg' },
  { option1: 'Creme', featured_image: 'creme-400.jpg' },
  { option1: 'Grau', featured_image: 'grau-400.jpg' },
];

test('jede Teppichfarbe bekommt das Foto derselben Farbe des Teppichbodens', async () => {
  const d = daten(await render(teppich(basis)));
  assert.match(d['11'].src, /sand-400\.jpg/);
  assert.match(d['22'].src, /creme-400\.jpg/);
  assert.equal(Object.keys(d).filter((k) => k !== '_').length, 2, 'fremde Farbe (Grau) darf nicht auftauchen');
});

test('gewaehlte Farbe bestimmt das Startbild und den Alt-Text', async () => {
  const html = await render(teppich(basis, 1));
  assert.match(html, /data-tp-tts-bild[\s\S]*?src="https:\/\/cdn\.example\/creme-400\.jpg"/);
  assert.match(html, /alt="Struktur in Originalaufnahme: Woolara Teppich nach Mass, Creme"/);
});

test('Farbe ohne Foto am Teppichboden: kein Eintrag, kein falsches Bild', async () => {
  const d = daten(await render(teppich([{ option1: 'Sand', featured_image: 'sand.jpg' }, { option1: 'Creme', featured_image: null }])));
  assert.ok(d['11']);
  assert.equal(d['22'], undefined);
});

test('ohne Basisprodukt oder ohne ein einziges Foto rendert der Block nichts', async () => {
  assert.equal((await render(teppich(null))).trim(), '');
  assert.equal((await render(teppich([{ option1: 'Grau', featured_image: 'grau.jpg' }]))).trim(), '');
});

test('grosses Farbbild: Variantenbild des Teppichs, passend zur gewaehlten Farbe', async () => {
  const html = await render(teppich(basis, 1));
  assert.match(html, /data-tp-tts-gross[\s\S]*?src="https:\/\/cdn\.example\/teppich-creme\.jpg"/);
  const d = daten(html);
  assert.match(d['11'].gross, /teppich-sand\.jpg/);
  assert.match(d['22'].gross, /teppich-creme\.jpg/);
});
