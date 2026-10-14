// Musterregeln nach dem Vertretergespraech mit dem Hauptlieferanten (12.10.2026):
// Laminat, Parkett, Kork nur auf Anfrage (Inhaber 14.10.2026), Klickvinyl-Muster kommt als Klebe-Ausfuehrung.
// Vinyl von der Rolle und Linoleum hatten am 12.10. den Tag ohne-muster
// bekommen; seit 13.10. schneiden wir die Muster selbst aus einem Probestueck
// (Inhaber) - Tag wieder entfernt, Einstiege auf der Musterseite wieder da.
// Der Tag ohne-muster selbst wirkt weiter (z. B. Ware von Lieferant C).
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
  .replace(/\{% stylesheet %\}[\s\S]*?\{% endstylesheet %\}/, '')
  .replace("render 'tp-musteroption', product: product", 'echo tp_test_url')
  .replace("render 'tp-muster-grenze', product: product", 'echo tp_test_grenze');
assert.ok(block.includes('echo tp_test_url'), 'Snippet-Aufruf im Block nicht gefunden');
assert.ok(block.includes('echo tp_test_grenze'), 'Grenze-Aufruf im Block nicht gefunden');

async function cta(product) {
  const tp_test_url = (await liquid.parseAndRender(optionSource, { product })).trim();
  return liquid.parseAndRender(block, {
    product: { template_suffix: '', title: 'Beispiel', ...product },
    tp_test_url,
    tp_test_grenze: '',
    block: { id: 'tp_muster_cta_1', shopify_attributes: '', settings: { label: 'Kostenloses Muster anfragen', hinweis: 'Bis zu 3 Farben, versandkostenfrei' } },
  });
}

test('Laminat, Parkett, Kork: statt Musterknopf eine Musteranfrage zum Kontaktformular, ohne "kostenlos"', async () => {
  const html = await cta({ handle: 'eiche-natur-parkett', type: 'Parkett', tags: [], title: 'Eiche Natur Parkett' });
  assert.match(html, /href="\/pages\/kontakt\?thema=musteranfrage&produkt=Eiche\+Natur\+Parkett&handle=eiche-natur-parkett"/);
  assert.match(html, /Muster anfragen/);
  assert.doesNotMatch(html, /kostenlos/i);
  for (const type of ['Laminat', 'Kork']) {
    const h = await cta({ handle: 'beispiel', type, tags: [], title: 'Beispiel' });
    assert.match(h, /thema=musteranfrage/, type);
    assert.doesNotMatch(h, /kostenlos/i, type);
  }
});

test('Parkett mit ohne-muster oder zubehoer bleibt ganz ohne Knopf', async () => {
  assert.doesNotMatch(await cta({ handle: 'p', type: 'Parkett', tags: ['ohne-muster'] }), /<a /);
  assert.doesNotMatch(await cta({ handle: 'p', type: 'Parkett', tags: ['zubehoer'] }), /<a /);
});

test('Laminat und Kork mit ohne-muster bleiben ganz ohne Knopf', async () => {
  assert.doesNotMatch(await cta({ handle: 'l', type: 'Laminat', tags: ['ohne-muster'] }), /<a /);
  assert.doesNotMatch(await cta({ handle: 'k', type: 'Kork', tags: ['zubehoer'] }), /<a /);
});

test('Klickvinyl mit Tag muster-klebevariante: Zusatzzeile, Musterweg bleibt', async () => {
  const html = await cta({ handle: 'eiche-klick', type: 'Klickvinyl', tags: ['muster-klebevariante'] });
  assert.match(html, /href="\/pages\/muster\?produkt=eiche-klick"/);
  assert.match(html, /Das Muster zeigt dasselbe Dekor in der Klebeausführung\./);
  const ohne = await cta({ handle: 'eiche-klick', type: 'Klickvinyl', tags: [] });
  assert.doesNotMatch(ohne, /Klebeausführung/);
  assert.match(ohne, /Kostenloses Muster anfragen/);
});

test('Vinyl von der Rolle und Linoleum mit ohne-muster: kein Musterknopf', async () => {
  for (const type of ['Vinyl von der Rolle', 'Linoleumboden']) {
    assert.doesNotMatch(await cta({ handle: 'x', type, tags: ['ohne-muster'] }), /<a /, type);
  }
});

test('Musterseite fuehrt Vinyl von der Rolle und Linoleum wieder als Einstieg (13.10.2026)', () => {
  const s = read('sections/tp-sample-checkout.liquid');
  const def = JSON.parse(s.slice(s.indexOf('{% schema %}') + 12, s.indexOf('{% endschema %}'))).settings.find(x => x.id === 'kategorien').default;
  assert.match(def, /Teppichboden\|/);
  assert.match(def, /Vinyl von der Rolle\|\/collections\/vinylboden-vinyl-von-der-rolle/);
  assert.match(def, /Linoleum\|\/collections\/linoleumboden-1/);
  for (const datei of ['sections/tp-start-muster.liquid', 'templates/index.json']) {
    assert.match(read(datei), /Teppichboden, Vinyl oder Linoleum/, datei);
  }
});

test('Kontaktformular kennt das Thema musteranfrage', () => {
  const js = read('assets/tp-sample-request.js');
  assert.match(js, /musteranfrage: 'Musteranfrage'/);
  assert.match(js, /thema === 'musteranfrage'/);
});
