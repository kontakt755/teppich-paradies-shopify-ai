import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });
engine.registerTag('doc', { parse(token, tokens) { while (tokens.length && tokens.shift().name !== 'enddoc') {} }, render() { return ''; } });
engine.registerFilter('handleize', value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
engine.registerFilter('json', value => JSON.stringify(value));
engine.registerFilter('asset_url', value => value);
engine.registerFilter('stylesheet_tag', value => `<link href="${value}">`);
const collection = {
  url: '/collections/bodenleisten', products_count: 57, sort_by: 'price-ascending',
  products: [], all_tags: ['material: kunststoff', 'material: pvc', 'material: mdf', 'hoehe: 40mm'],
  filters: [{ param_name: 'filter.p.m.custom.leistenhoehe', active_values: [], values: [
    { label: 'Bis 40 mm', count: 2, active: false, param_name: 'filter.p.m.custom.leistenhoehe', value: 'gid://shopify/FilterSettingGroup/123', url_to_add: '/collections/bodenleisten/material-mdf?filter.p.m.custom.leistenhoehe=group1' },
    { label: 'Über 80 mm', count: 0, active: false },
  ] }],
};

test('Materialwechsel ersetzt nur die Materialgruppe und behaelt Hoehe, Preis und Sortierung', async () => {
  const filters = [...collection.filters.map(f => ({ ...f, active_values: [{ param_name: f.param_name, value: 'group1' }] })), { type: 'price_range', min_value: { param_name: 'filter.v.price.gte', value: 1250 }, max_value: { param_name: 'filter.v.price.lte', value: 4000 } }];
  const url = await engine.parseAndRender(read('snippets/tp-leisten-filter-url.liquid'), { collection: { ...collection, filters }, tag: 'material: kunststoff', current_tags: ['material: mdf', 'hoehe: 40mm'] });
  const parsed = new URL(url, 'https://example.test');
  assert.equal(parsed.pathname, '/collections/bodenleisten/hoehe-40mm+material-kunststoff');
  assert.equal(parsed.searchParams.get('filter.p.m.custom.leistenhoehe'), 'group1');
  assert.equal(parsed.searchParams.get('filter.v.price.gte'), '12.5');
  assert.equal(parsed.searchParams.get('sort_by'), 'price-ascending');
  assert.equal(parsed.searchParams.has('page'), false);
  const toggled = await engine.parseAndRender(read('snippets/tp-leisten-filter-url.liquid'), { collection, tag: 'material: mdf', current_tags: ['material: mdf'] });
  assert.equal(new URL(toggled, 'https://example.test').pathname, collection.url);
});

test('Einstiege haengen nicht von geladenen Karten ab: ganzes Sortiment, kein PVC, native Hoehen', async () => {
  const source = read('sections/tp-leisten-einstiege.liquid').split('{% schema %}')[0].replace(/style="{% render 'spacing-style'.*?%}"/, '');
  const html = await engine.parseAndRender(source, { collection, section: { id: 'quick', settings: { show_material: true, show_hoehe: true } } });
  assert.match(html, /material-mdf/);
  assert.doesNotMatch(html, /class="tp-le__tile"[^>]*material-pvc/);
  assert.match(html, /57 Leisten/);
  assert.match(html, /material-mdf\?filter\.p\.m\.custom\.leistenhoehe=group1/);
  assert.match(html, /aria-disabled="true">Über 80 mm/);
  assert.doesNotMatch(html, /data-tp-leisten-data|0 von 24|aria-pressed/);
});

test('Desktop und Drawer-Menue nutzen vollstaendige Quellen und native Hoehenwerte', async () => {
  const html = await engine.parseAndRender(read('snippets/tp-leisten-nav.liquid'), { collections: { bodenleisten: collection }, variant: 'drawer' });
  assert.match(html, /material-mdf#bodenleisten-produkte/);
  assert.doesNotMatch(html, /material-pvc|#leisten:/);
  assert.match(html, /filter\.p\.m\.custom\.leistenhoehe=gid/);
  assert.doesNotMatch(html, /tp-nav-link__count/);
});

function scriptHarness(hash = '') {
  const listeners = {};
  const element = { dataset: { sectionId: 'quick', collectionUrl: collection.url }, querySelector() { return { textContent: JSON.stringify(collection.all_tags) }; }, replaceWith(other) { this.replacement = other; } };
  const location = { href: 'https://example.test/collections/bodenleisten/material-mdf?sort_by=price-descending&page=3' + hash, hash, replace(url) { this.replaced = url; }, reload() { this.reloaded = true; } };
  const requests = [];
  const window = { location, addEventListener(name, handler) { listeners[name] = handler; } };
  vm.runInNewContext(read('assets/tp-leisten-filter.js'), {
    window, document: { querySelector() { return element; }, addEventListener(name, handler) { listeners[name] = handler; } },
    URL, URLSearchParams, AbortController,
    fetch: async url => { requests.push(url); return { ok: true, text: async () => '<section>' }; },
    DOMParser: class { parseFromString() { return { querySelector() { return { rendered: true }; } }; } },
  });
  return { listeners, element, location, requests };
}

test('Sortierung und Zurueck/Vorwaerts laden serverseitige Auswahl am aktuellen URL-Pfad', async () => {
  const harness = scriptHarness();
  await harness.listeners['filter:update']();
  assert.equal(new URL(harness.requests[0]).pathname, '/collections/bodenleisten/material-mdf');
  assert.equal(new URL(harness.requests[0]).searchParams.get('section_id'), 'quick');
  assert.ok(harness.element.replacement.rendered);
  harness.location.href = 'https://example.test/collections/bodenleisten/material-mdf?sort_by=price-ascending&filter.p.m.custom.leistenhoehe=group1';
  await harness.listeners.popstate();
  assert.equal(new URL(harness.requests[1]).searchParams.get('filter.p.m.custom.leistenhoehe'), 'group1');
  assert.equal(new URL(harness.requests[1]).searchParams.get('sort_by'), 'price-ascending');
});

test('Alte Menue-Hashes werden vor dem Filtern in vorhandene serverseitige Tags ueberfuehrt', () => {
  const harness = scriptHarness('#leisten:material=mdf&hoehe=40mm');
  const migrated = new URL(harness.location.replaced);
  assert.equal(migrated.pathname, '/collections/bodenleisten/material-mdf+hoehe-40mm');
  assert.equal(migrated.searchParams.has('page'), false);
  assert.equal(migrated.searchParams.get('sort_by'), 'price-descending');
  assert.equal(migrated.hash, '#bodenleisten-produkte');
});
