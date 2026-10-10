import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });
engine.registerTag('doc', { parse(token, tokens) { while (tokens.length && tokens.shift().name !== 'enddoc') {} }, render() { return ''; } });
engine.registerTag('style', { parse(token, tokens) { while (tokens.length && tokens.shift().name !== 'endstyle') {} }, render() { return ''; } });
engine.registerTag('stylesheet', { parse(token, tokens) { while (tokens.length && tokens.shift().name !== 'endstylesheet') {} }, render() { return ''; } });
engine.registerFilter('handleize', value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
engine.registerFilter('asset_url', value => value);
engine.registerFilter('stylesheet_tag', value => `<link href="${value}">`);
engine.registerFilter('image_url', value => value.url);
engine.registerFilter('image_tag', value => `<img src="${value}">`);
const sectionSource = read('sections/tp-boden-auswahl.liquid').split('{% javascript %}')[0];
const collection = { url: '/collections/parkett', products_count: 229, sort_by: 'price-ascending', products: [], all_tags: ['oberflaeche: geölt', 'oberflaeche: lackiert', 'unbehandelt', 'optik: eiche', 'optik: räuchereiche'], filters: [] };
const section = kind => ({ id: 'auswahl', settings: { kind, heading: 'Boden auswählen' } });
const render = (col, kind, current_tags = []) => engine.parseAndRender(sectionSource, { collection: col, current_tags, section: section(kind), routes: { collections_url: '/collections' } });
function links(html) { return [...html.matchAll(/<a class="tp-ba__chip" href="([^"]+)"/g)].map(match => new URL(match[1].replaceAll('&amp;', '&'), 'https://example.test')); }

test('Parkett-Auswahl nutzt alle Tags auch ohne geladene Karten; unbehandelt bleibt sein vorhandener Tag', async () => {
  const html = await render(collection, 'parkett');
  assert.match(html, /Nach Holzart/);
  assert.match(html, /Nach Oberfläche/);
  const paths = links(html).map(link => link.pathname);
  assert.ok(paths.includes('/collections/parkett/oberflaeche-geolt'));
  assert.ok(paths.includes('/collections/parkett/unbehandelt'));
  assert.ok(paths.includes('/collections/parkett/optik-rauchereiche'));
  assert.match(html, /href="\/collections\/korkboden"/);
});

test('Gruppenwechsel erhaelt Holzart, native Filter und Sortierung, entfernt alte Oberflaeche und Pagination', async () => {
  const col = { ...collection, filters: [{ active_values: [{ param_name: 'filter.v.availability', value: '1' }] }, { type: 'price_range', min_value: { value: 2500, param_name: 'filter.v.price.gte' }, max_value: { value: 4500, param_name: 'filter.v.price.lte' } }] };
  const html = await render(col, 'parkett', ['unbehandelt', 'optik: eiche']);
  const toLacquer = links(html).find(link => link.pathname.includes('oberflaeche-lackiert'));
  assert.equal(toLacquer.pathname, '/collections/parkett/optik-eiche+oberflaeche-lackiert');
  assert.equal(toLacquer.searchParams.get('filter.v.availability'), '1');
  assert.equal(toLacquer.searchParams.get('filter.v.price.gte'), '25');
  assert.equal(toLacquer.searchParams.get('filter.v.price.lte'), '45');
  assert.equal(toLacquer.searchParams.get('sort_by'), 'price-ascending');
  assert.equal(toLacquer.searchParams.has('page'), false);
  const toggleOff = links(html).find(link => link.pathname === '/collections/parkett/optik-eiche');
  assert.ok(toggleOff);
  assert.match(html, /class="tp-ba__reset" href="\/collections\/parkett\?sort_by=price-ascending#ResultsList"/);
});

test('Laminat zeigt nur vorhandene Staerken in numerischer Reihenfolge und keine Aqua-Eignungsgruppe', async () => {
  const html = await render({ ...collection, url: '/collections/laminat', all_tags: ['staerke: 10mm', 'staerke: 7mm', 'staerke: 8mm', 'optik: eiche', 'aqua'] }, 'laminat');
  const paths = links(html).map(link => link.pathname);
  assert.deepEqual(paths.slice(0, 3), ['/collections/laminat/staerke-7mm', '/collections/laminat/staerke-8mm', '/collections/laminat/staerke-10mm']);
  assert.doesNotMatch(html, /Feuchtraum|Nassraum|Aqua|aqua/);
});

function lino(index, colors, conflict = false) {
  return { title: `Qualität ${index} Linoleumboden 200cm`, url: `/products/qualitaet-${index}`, featured_image: { url: `/original-${index}.jpg` }, options_with_values: [{ name: 'Farbe', values: Array.from({ length: colors }, (_, i) => `Farbe ${i}`) }], metafields: { custom: {
    ruckenausstattung: { value: conflict ? 'Nicht spezifiziert' : 'Juteträger' },
    starke: { value: conflict ? '2.0 mm' : '2.5 mm' }, gesamtstarke: { value: '2,5 mm' }, rollenbreite: { value: 2 },
    nutzungsklassen: { value: [{ nutzungsklasse: { value: '34' } }, { nutzungsklasse: { value: index === 9 ? '41' : '43' } }] },
  } } };
}
const linoCollection = { ...collection, url: '/collections/linoleumboden', products_count: 9, all_products_count: 9, products: [4, 4, 6, 4, 6, 1, 16, 9, 21].map((colors, index) => lino(index + 1, colors, index === 5)) };

test('Alle neun Linoleumqualitaeten mit Originalbildern, Farbenzahlen und belegten Klassen auf der Landingpage', async () => {
  const html = await render(linoCollection, 'linoleum');
  assert.equal((html.match(/class="tp-ba__quality"/g) || []).length, 9);
  assert.match(html, /21 Farben/);
  assert.match(html, /NK 34 \/ 41/);
  assert.match(html, /Klasse 34: gewerblich, sehr starke Nutzung/);
  assert.match(html, /Klasse 43: industriell, starke Nutzung/);
  assert.match(html, /Klasse 41: industriell, geringe Nutzung/);
  assert.match(html, /original-9\.jpg/);
  assert.match(html, /Juteträger/);
  assert.doesNotMatch(html, /Vliesrücken/);
});

test('Widerspruechliche Linoleumstaerke wird verschwiegen, Farbauswahl und Nutzungsklasse bleiben', async () => {
  const facts = await engine.parseAndRender(read('snippets/tp-linoleum-kurzinfo.liquid'), { product: linoCollection.products[5], details: true });
  assert.match(facts, /1 Farbe/);
  assert.match(facts, /NK 34 \/ 43/);
  assert.match(facts, /200 cm Rolle/);
  assert.doesNotMatch(facts, /2[,.][05] mm|Nicht spezifiziert/);
  const regular = await engine.parseAndRender(read('snippets/tp-linoleum-kurzinfo.liquid'), { product: linoCollection.products[0], details: true });
  assert.match(regular, /2,5 mm/);
});

test('Linoleum-Drawer zeigt alle neun statt fuenf Produkte mit denselben Kurzinfos', async () => {
  const html = await engine.parseAndRender(read('snippets/tp-linoleum-nav.liquid'), { parent_link: { object: linoCollection, url: linoCollection.url }, variant: 'drawer' });
  assert.equal((html.match(/class="tp-dn-row"/g) || []).length, 9);
  assert.match(html, /21 Farben/);
  assert.match(html, /original-9\.jpg/);
});

test('Kork bekommt eine getrennte Vorlage und Klick-/Klebeziele; vorhandenes Produktgrid bleibt unveraendert', async () => {
  const html = await render({ ...collection, handle: 'korkboden' }, 'kork');
  assert.match(html, /href="\/collections\/korkboden-klick"/);
  assert.match(html, /href="\/collections\/korkboden-kleben"/);
  const json = name => { const raw = read(`templates/collection.${name}.json`); return JSON.parse(raw.slice(raw.indexOf('{'))); };
  const parkett = json('parkett'); const kork = json('kork');
  assert.equal(parkett.sections.hero.settings.heading, 'Parkettboden');
  assert.equal(kork.sections.hero.settings.image, 'shopify://shop_images/korkboden-beispielraum-v1.png');
  assert.match(kork.sections.hero.settings.image_alt, /Illustration/);
  assert.equal(kork.sections.hero.settings.image_caption, 'Beispielraum mit Korkboden');
  assert.doesNotMatch(JSON.stringify(parkett), /Parkett [&u]|Parkett und Kork|vereint Parkett/);
  assert.doesNotMatch(JSON.stringify(kork), /Parkett|Valdoro/);
  assert.deepEqual(kork.sections.main, parkett.sections.main);
  for (const name of ['laminat', 'parkett', 'kork', 'linoleumboden']) assert.deepEqual(json(name).order, ['hero', 'auswahl', 'main', 'guide']);
});

test('Neue SectionRendering-Auswahl nutzt aktuellen Pfad fuer Filter, Sortierung und Back/Forward', async () => {
  const handlers = {}; const requested = []; let replaced = false;
  const element = { dataset: { sectionId: 'auswahl' }, replaceWith: () => { replaced = true; } };
  const url = 'https://example.test/collections/parkett/optik-eiche?sort_by=price-descending&filter.v.price.lte=45#ResultsList';
  const script = read('sections/tp-boden-auswahl.liquid').split('{% javascript %}')[1].split('{% endjavascript %}')[0];
  vm.runInNewContext(script, { URL, AbortController, document: { querySelector: () => element, addEventListener: (name, fn) => { handlers[name] = fn; } }, window: { location: { href: url, reload: () => assert.fail('unexpected reload') }, addEventListener: (name, fn) => { handlers[name] = fn; } }, fetch: async target => { requested.push(target); return { ok: true, text: async () => '<html>' }; }, DOMParser: class { parseFromString() { return { querySelector: () => ({}) }; } } });
  await handlers['filter:update'](); await handlers.popstate();
  assert.equal(requested.length, 2);
  const parsed = new URL(requested[1]);
  assert.equal(parsed.pathname, '/collections/parkett/optik-eiche');
  assert.equal(parsed.searchParams.get('filter.v.price.lte'), '45');
  assert.equal(parsed.searchParams.get('sort_by'), 'price-descending');
  assert.equal(parsed.searchParams.get('section_id'), 'auswahl');
  assert.equal(parsed.hash, '');
  assert.equal(replaced, true);
});


test('Desktop-Linoleummenue zeigt alle neun Qualitaeten', async () => {
  const html = await engine.parseAndRender(read('snippets/tp-linoleum-nav.liquid'), { parent_link: { object: linoCollection, url: linoCollection.url }, settings: {}, id: 'linoleum' });
  assert.equal((html.match(/class="mega-menu__link tp-mm-card__link"/g) || []).length, 10);
  assert.match(html, /Qualität 9/);
  assert.match(html, /21 Farben/);
});


test('Lange Nutzungsklassenfelder werden in Kurzinfos auf belegte Ziffern gekuerzt', async () => {
  const product = lino(1, 4);
  product.metafields.custom.nutzungsklassen.value = [
    { nutzungsklasse: { value: 'Klasse 43 (Industrie, stark)' } },
    { nutzungsklasse: { value: 'Klasse 34 (Gewerbe, sehr stark)' } },
    { nutzungsklasse: { value: 'Klasse 23 (Wohnen, stark)' } },
    { nutzungsklasse: { value: '34' } },
    { nutzungsklasse: { value: 'Nicht angegeben' } },
  ];
  const source = read('snippets/tp-linoleum-kurzinfo.liquid');
  const facts = await engine.parseAndRender(source, { product, details: true });
  assert.match(facts, /4 Farben · Juteträger · NK 23 \/ 34 \/ 43/);
  assert.doesNotMatch(facts, /Gewerbe|Industrie|Wohnen|Klasse|Nicht angegeben/);
  const menu = await engine.parseAndRender(read('snippets/tp-linoleum-nav.liquid'), { parent_link: { object: { ...linoCollection, products: [product] }, url: linoCollection.url }, variant: 'drawer' });
  assert.match(menu, /NK 23 \/ 34 \/ 43/);
  assert.doesNotMatch(menu, /Gewerbe|Industrie|Wohnen/);
});
