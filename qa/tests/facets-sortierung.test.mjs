import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const source = readFileSync(fileURLToPath(new URL('../../assets/facets.js', import.meta.url)), 'utf8');
const start = source.indexOf('  createURLParameters(');
const end = source.indexOf('\n  /**\n   * Gets the search query', start);
assert.ok(start > 0 && end > start, 'Filter-Formularmethode fehlt');
const method = source.slice(start, end);

function createParameters(width, pairs) {
  const FacetsForm = vm.runInNewContext(
    `class FacetsForm { ${method} #getSearchQuery() { return ''; } }; FacetsForm`,
    { URLSearchParams, window: { innerWidth: width } },
    { timeout: 1000 },
  );
  return new FacetsForm().createURLParameters(new URLSearchParams(pairs));
}

test('mobil zaehlt der sichtbare Select-Wert, auch wenn das Radio abweicht', () => {
  const params = createParameters(390, [
    ['filter.v.t.shopify.color-pattern', 'grau'],
    ['sort_by', 'price-ascending'],
    ['sort_by', 'manual'],
  ]);
  assert.deepEqual(params.getAll('sort_by'), ['price-ascending']);
  assert.equal(params.get('filter.v.t.shopify.color-pattern'), 'grau');
});

test('am Desktop zaehlt das ausgewaehlte Radio, auch wenn der Select-Wert veraltet ist', () => {
  const params = createParameters(1280, [
    ['sort_by', 'manual'],
    ['sort_by', 'price-ascending'],
    ['filter.v.t.shopify.color-pattern', 'blau'],
    ['filter.v.t.shopify.color-pattern', 'grau'],
  ]);
  assert.deepEqual(params.getAll('sort_by'), ['price-ascending']);
  assert.deepEqual(params.getAll('filter.v.t.shopify.color-pattern'), ['blau', 'grau']);
});

test('ein einzelner Sortierwert und der Seitenwechsel bleiben unveraendert', () => {
  const params = createParameters(1280, [
    ['sort_by', 'title-ascending'],
    ['page', '2'],
  ]);
  assert.deepEqual(params.getAll('sort_by'), ['title-ascending']);
  assert.equal(params.has('page'), false);
});
