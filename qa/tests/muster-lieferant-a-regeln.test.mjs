// Musterregeln nach dem Vertretergespraech mit dem Hauptlieferanten (12.10.2026):
// Parkett nur auf Anfrage, Klickvinyl-Muster kommt als Klebe-Ausfuehrung,
// Vinyl von der Rolle und Linoleum ohne Muster (Tag ohne-muster).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Liquid } from 'liquidjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = path => readFileSync(join(root, path), 'utf8');
const liquid = new Liquid();

const option = read('snippets/tp-musteroption.liquid');
const optionSource = option.slice(option.indexOf('{%- liquid'), option.lastIndexOf('-%}') + 4);

// Block ohne doc/schema; der Snippet-Aufruf wird durch das vorab berechnete Ergebnis ersetzt.
const block = read('blocks/tp-muster-cta.liquid')
  .replace(/\{% doc %\}[\s\S]*?\{% enddoc %\}/, '')
  .replace(/\{% schema %\}[\s\S]*?\{% endschema %\}/, '')
  .replace("render 'tp-musteroption', product: product", 'echo tp_test_url');
assert.ok(block.includes('echo tp_test_url'), 'Snippet-Aufruf im Block nicht gefunden');

async function cta(product) {
  const tp_test_url = (await liquid.parseAndRender(optionSource, { product })).trim();
  return liquid.parseAndRender(block, {
    product: { template_suffix: '', title: 'Beispiel', ...product },
    tp_test_url,
    block: { id: 'tp_muster_cta_1', shopify_attributes: '', settings: { label: 'Kostenloses Muster anfragen', hinweis: 'Bis zu 3 Farben, versandkostenfrei' } },
  });
}

test('Parkett: statt Musterknopf eine Musteranfrage zum Kontaktformular, ohne "kostenlos"', async () => {
  const html = await cta({ handle: 'eiche-natur-parkett', type: 'Parkett', tags: [], title: 'Eiche Natur Parkett' });
  assert.match(html, /href="\/pages\/kontakt\?thema=musteranfrage&produkt=Eiche\+Natur\+Parkett&handle=eiche-natur-parkett"/);
  assert.match(html, /Muster anfragen/);
  assert.doesNotMatch(html, /kostenlos/i);
});

test('Parkett mit ohne-muster oder zubehoer bleibt ganz ohne Knopf', async () => {
  assert.doesNotMatch(await cta({ handle: 'p', type: 'Parkett', tags: ['ohne-muster'] }), /<a /);
  assert.doesNotMatch(await cta({ handle: 'p', type: 'Parkett', tags: ['zubehoer'] }), /<a /);
});

test('Laminat und Kork bekommen keine Musteranfrage (Regel gilt nur fuer Parkett)', async () => {
  assert.doesNotMatch(await cta({ handle: 'l', type: 'Laminat', tags: [] }), /<a /);
  assert.doesNotMatch(await cta({ handle: 'k', type: 'Kork', tags: [] }), /<a /);
});

test('Klickvinyl mit Tag muster-klebevariante: Zusatzzeile, Musterweg bleibt', async () => {
  const html = await cta({ handle: 'eiche-klick', type: 'Klickvinyl', tags: ['muster-klebevariante'] });
  assert.match(html, /href="\/pages\/muster\?produkt=eiche-klick"/);
  assert.match(html, /Klebe-Ausführung, gleiches Dekor/);
  const ohne = await cta({ handle: 'eiche-klick', type: 'Klickvinyl', tags: [] });
  assert.doesNotMatch(ohne, /Klebe-Ausführung/);
  assert.match(ohne, /Kostenloses Muster anfragen/);
});

test('Vinyl von der Rolle und Linoleum mit ohne-muster: kein Musterknopf', async () => {
  for (const type of ['Vinyl von der Rolle', 'Linoleumboden']) {
    assert.doesNotMatch(await cta({ handle: 'x', type, tags: ['ohne-muster'] }), /<a /, type);
  }
});

test('Musterseite fuehrt Vinyl von der Rolle und Linoleum nicht mehr als Einstieg', () => {
  const s = read('sections/tp-sample-checkout.liquid');
  const def = JSON.parse(s.slice(s.indexOf('{% schema %}') + 12, s.indexOf('{% endschema %}'))).settings.find(x => x.id === 'kategorien').default;
  assert.match(def, /Teppichboden\|/);
  assert.doesNotMatch(def, /vinyl-von-der-rolle|linoleum/i);
});

test('Kontaktformular kennt das Thema musteranfrage', () => {
  const js = read('assets/tp-sample-request.js');
  assert.match(js, /musteranfrage: 'Musteranfrage'/);
  assert.match(js, /thema === 'musteranfrage'/);
});
