import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Liquid } from 'liquidjs';
import vm from 'node:vm';

const engine = new Liquid();
engine.registerFilter('image_url', (image) => image.url);
engine.registerFilter('image_tag', (url) => `<img src="${url}" alt="">`);
const sectionSource = readFileSync('sections/tp-standardteppiche-einstiege.liquid', 'utf8');
const markup = sectionSource.replace(/{% (stylesheet|javascript|schema) %}[\s\S]*?{% end\1 %}/g, '');
const product = { featured_image: { url: '/genuine-rug.jpg' }, metafields: { custom: { bildnachweis: { value: '© Bildgeber & Partner' } } } };
const section = { id: 'choices', settings: { heading: 'Teppicharten', text: 'Auswahl' }, blocks: [
  { settings: { filter_label: 'Webteppich', label: 'Webteppiche', product } },
  { settings: { filter_label: 'Dekofell', label: 'Dekofelle', product } },
] };
const values = [
  { label: 'Webteppich', count: 67, active: false, url_to_add: '/collection?sort_by=price-ascending&filter.p.m.custom.arten=native-id' },
  { label: 'Dekofell', count: 0, active: false, url_to_add: '/empty' },
];
const artFilter = { param_name: 'filter.p.m.custom.arten', values, active_values: [], url_to_remove: '/clear-art-only?filter.color=beige' };
const render = (filters) => engine.parseAndRender(markup, { section, collection: { filters } });

test('Teppicharten verwenden native URL und kollektionsweite Zahl, leere Arten bleiben verborgen', async () => {
  const html = await render([artFilter]);
  assert.match(html, /href="\/collection\?sort_by=price-ascending&amp;filter\.p\.m\.custom\.arten=native-id"/);
  assert.match(html, /67 Produkte/);
  assert.match(html, /genuine-rug\.jpg/);
  assert.match(html, /© Bildgeber &amp; Partner/);
  assert.doesNotMatch(html, /href="\/empty"|>Dekofelle</);
});

test('Aktive Art bleibt bei null Treffern entfernbar, Reset bewahrt andere Filter', async () => {
  const active = { ...values[1], active: true, url_to_remove: '/remove-pelt?filter.color=beige' };
  const html = await render([{ ...artFilter, values: [active], active_values: [active] }]);
  assert.match(html, /href="\/remove-pelt\?filter.color=beige" aria-current="true"/);
  assert.match(html, /href="\/clear-art-only\?filter.color=beige"/);
  assert.match(html, /0 Produkte/);
});

test('Materialauswahl erscheint ausschließlich für einen vorhandenen nativen Materialfilter', async () => {
  assert.doesNotMatch(await render([artFilter]), /Material auswählen/);
  const material = { param_name: 'filter.p.m.custom.fasermaterial', values: [{ label: 'Wolle', count: 4, active: false, url_to_add: '/native-wool' }] };
  assert.match(await render([artFilter, material]), /href="\/native-wool">Wolle \(4\)/);
  assert.doesNotMatch(await render([{ ...material, values: [{ ...material.values[0], count: 0 }] }]), /Material auswählen/);
  assert.doesNotMatch(await render([]), /<a /);
});

test('Kurzmodelle betreffen nur Standardgrößen, voller Produkttitel bleibt unangetastet', async () => {
  const source = readFileSync('snippets/tp-card-title-display.liquid', 'utf8');
  for (const [type, title, short] of [['Wohnteppich', 'Zigara Wohnteppich', 'Zigara'], ['Dekofell', 'Fellara Dekofell', 'Fellara']]) {
    const product = { type, title };
    assert.equal((await engine.parseAndRender(source, { product, collection: { handle: 'teppiche-standardgroessen' } })).trim(), short);
    assert.equal((await engine.parseAndRender(source, { product, collection: { handle: 'andere-kollektion' } })).trim(), title);
    assert.equal(product.title, title);
  }
});

test('Originalbild und Preis je Stück sind auf Standardgrößen begrenzt', async () => {
  const gallery = readFileSync('snippets/card-gallery.liquid', 'utf8');
  const scope = gallery.slice(gallery.indexOf("  assign ratio = '1'"), gallery.indexOf("  if block_settings.image_ratio == 'adapt'"));
  const output = '{% liquid\n' + scope + '%}{{ ratio }}|{{ tp_card_crop_square }}|{{ media_fit }}';
  assert.equal((await engine.parseAndRender(output, { collection: { handle: 'teppiche-standardgroessen' } })).trim(), '0.75|false|contain');
  assert.equal((await engine.parseAndRender(output, { collection: { handle: 'teppichboden' } })).trim(), '1|true|');
  assert.match(gallery, /crop_square: tp_card_crop_square/);
  const price = readFileSync('snippets/price-filter.liquid', 'utf8').match(/<p class="price-facet__einheit">([\s\S]*?)<\/p>/)[1];
  assert.match(await engine.parseAndRender(price, { collection: { handle: 'teppiche-standardgroessen' } }), /Preis je Teppich bzw. je Dekofell/);
  assert.match(await engine.parseAndRender(price, { collection: { handle: 'teppichboden' } }), /Bei Meterware je m², bei Paketware je Paket/);
});

test('Native Filterwechsel und Zurücknavigation laden auch die serverseitigen Einstiege neu', async () => {
  const script = sectionSource.match(/{% javascript %}([\s\S]*?){% endjavascript %}/)[1];
  let listener;
  const renders = [];
  const document = { addEventListener(name, fn) { assert.equal(name, 'filter:update'); listener = fn; }, querySelector() { return { closest() { return { id: 'shopify-section-template--1__teppicharten' }; } }; } };
  vm.runInNewContext(script.replace("await import('@theme/section-renderer')", '{ sectionRenderer: renderer }'), {
    document, renderer: { async renderSection(id) { renders.push(id); } }, window: { location: { reload() { assert.fail('Kein Reload bei erfolgreichem Section-Rendering'); } } },
  });
  await listener();
  assert.deepEqual(renders, ['template--1__teppicharten']);
  document.querySelector = () => null;
  await listener();
  assert.equal(renders.length, 1);
});

test('Eigenes Template bewahrt natives Raster, Filter, Sortierung und Pagination', () => {
  const parse = (file) => JSON.parse(readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));
  const original = parse('templates/collection.json').sections.main;
  const customized = parse('templates/collection.standardteppiche.json');
  assert.deepEqual(customized.sections.main.settings, original.settings);
  assert.deepEqual(customized.sections.main.blocks.filters, original.blocks.filters);
  assert.deepEqual(customized.sections.main.blocks['product-card'].block_order, original.blocks['product-card'].block_order);
  assert.deepEqual(customized.order, ['section', 'teppicharten', 'main']);
});
