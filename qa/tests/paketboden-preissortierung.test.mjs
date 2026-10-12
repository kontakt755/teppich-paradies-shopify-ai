import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const source = readFileSync('snippets/sorting.liquid', 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '')
  .replace(/{% stylesheet %}[\s\S]*?{% endstylesheet %}/g, '');
const engine = new Liquid({ templates: { icon: '', 'accordion-custom-component': '{{ children }}' } });
engine.registerFilter('t', () => 'Sortieren');
engine.registerFilter('inline_asset_content', () => '');
const sort_options = ['manual', 'best-selling', 'title-ascending', 'price-ascending', 'price-descending', 'created-descending']
  .map((value) => ({ value, name: value }));
const render = (types, sort_by = 'best-selling', page_type = 'collection', default_sort_by = 'best-selling') =>
  engine.parseAndRender(source, {
    request: { page_type }, collection: { all_types: types },
    results: { sort_options, default_sort_by }, sort_by,
    section_id: 'collection', suffix: 'overflow', should_use_select_on_mobile: true,
  });

test('Pakettypen und gemischtes Vinyl entfernen nur beide Preisoptionen aus Select und Radio', async () => {
  for (const types of [['Laminat'], ['Parkett'], ['Kork'], ['Klickvinyl'], ['Klebevinyl'], ['Vinylboden', 'Klickvinyl']]) {
    const html = await render(types);
    assert.match(html, /data-tp-price-sort-blocked="true"/);
    assert.doesNotMatch(html, /value="price-(ascending|descending)"/);
    for (const value of ['manual', 'best-selling', 'title-ascending', 'created-descending']) {
      assert.match(html, new RegExp(`<option\\s+value="${value}"`));
      assert.match(html, new RegExp(`type="radio"[\\s\\S]*?value="${value}"`));
    }
    assert.match(html, /value="best-selling"\s+selected/);
    assert.match(html, /name="sort_by"[\s\S]*?form="FacetFiltersForm--collection-overflow"/);
  }
});

test('Rollenware, Teppiche und Suche behalten beide nativen Preisoptionen', async () => {
  for (const [types, page] of [[['Vinylboden'], 'collection'], [['Teppichboden'], 'collection'], [['Wohnteppich', 'Dekofell'], 'collection'], [['Klickvinyl'], 'search']]) {
    const html = await render(types, 'price-ascending', page);
    assert.doesNotMatch(html, /data-tp-price-sort-blocked/);
    assert.match(html, /value="price-ascending"\s+selected/);
    assert.match(html, /value="price-descending"/);
  }
});

test('Alte Preislinks zeigen bis zur echten Standardsortierung keine falsche Auswahl', async () => {
  for (const sort of ['price-ascending', 'price-descending']) {
    const html = await render(['Laminat'], sort);
    assert.match(html, /<sorting-filter-component[^>]*\bhidden\b/);
    assert.doesNotMatch(html, /\sselected\s|\schecked\s/);
    assert.match(html, /data-tp-default-sort-by="best-selling"/);
  }
  const fallback = await render(['Kork'], 'price-ascending', 'collection', 'price-ascending');
  assert.match(fallback, /data-tp-sort-fallback="manual"/);
});

const facets = readFileSync('assets/facets.js', 'utf8');
const sortingClass = facets.slice(facets.indexOf('class SortingFilterComponent'), facets.indexOf("if (!customElements.get('sorting-filter-component'))"));
function connect(href, dataset, lifecycle = 'connectedCallback') {
  const replacements = [];
  const context = vm.createContext({
    URL, Component: class { connectedCallback() {} updatedCallback() {} },
    window: { location: { href, replace: (url) => replacements.push(new URL(url)) } },
  });
  vm.runInContext(`${sortingClass}\nglobalThis.Sorting = SortingFilterComponent;`, context);
  const component = new context.Sorting();
  component.dataset = dataset;
  component[lifecycle]();
  return replacements;
}
const blocked = { tpPriceSortBlocked: 'true', tpDefaultSortBy: 'best-selling', tpSortFallback: 'best-selling' };

test('Preisquery wird bei Aufruf und History-Section-Morph allein entfernt; Filter, Seite und Hash bleiben', () => {
  for (const sort of ['price-ascending', 'price-descending']) {
    for (const lifecycle of ['connectedCallback', 'updatedCallback']) {
      const [url] = connect(`https://shop.test/collections/laminat?filter.p.m.custom.optik=stein&filter.color=grau&filter.color=beige&page=2&utm_source=mail&sort_by=${sort}#raster`, blocked, lifecycle);
      assert.equal(url.searchParams.has('sort_by'), false);
      assert.deepEqual(url.searchParams.getAll('filter.color'), ['grau', 'beige']);
      assert.equal(url.searchParams.get('filter.p.m.custom.optik'), 'stein');
      assert.equal(url.searchParams.get('page'), '2');
      assert.equal(url.searchParams.get('utm_source'), 'mail');
      assert.equal(url.hash, '#raster');
      assert.equal(url.pathname, '/collections/laminat');
    }
  }
});

test('Zulaessige Sortierung und andere Kategorien normalisieren nichts, Preisstandard hat erlaubten Fallback', () => {
  for (const query of ['', '?sort_by=title-ascending', '?sort_by=created-descending']) {
    assert.equal(connect(`https://shop.test/collections/laminat${query}`, blocked).length, 0);
  }
  assert.equal(connect('https://shop.test/collections/teppichboden?sort_by=price-ascending', {}).length, 0);
  const priceDefault = { ...blocked, tpDefaultSortBy: 'price-ascending', tpSortFallback: 'manual' };
  for (const query of ['', '?sort_by=price-descending']) {
    const [url] = connect(`https://shop.test/collections/kork${query}`, priceDefault);
    assert.equal(url.searchParams.get('sort_by'), 'manual');
    assert.equal(connect(url.href, priceDefault).length, 0, 'keine Weiterleitungsschleife');
  }
});
