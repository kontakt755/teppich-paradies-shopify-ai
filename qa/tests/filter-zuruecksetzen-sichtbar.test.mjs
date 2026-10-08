import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = path.resolve(import.meta.dirname, '../..');
const source = fs.readFileSync(path.join(root, 'snippets/filter-remove-buttons.liquid'), 'utf8');
const snippet = source.slice(source.indexOf('<div class="facets-remove'), source.indexOf('{% stylesheet %}'));
const styles = fs.readFileSync(path.join(root, 'blocks/filters.liquid'), 'utf8');
const liquid = new Liquid({ strictFilters: false });

function render(activeValues) {
  return liquid.parseAndRender(snippet, {
    filters: [{
      type: 'list',
      label: 'Arten',
      active_values: activeValues.map((label) => ({ label, url_to_remove: '/collections/zubehoer' })),
    }],
    results_url: '/collections/zubehoer',
    should_show_clear_all: true,
    show_filter_label: false,
  });
}

test('Aktive Filter rendern sichtbares Zuruecksetzen und bedienbare Einzelchips', async () => {
  const html = await render(['Kleber und Fixierung', 'Abschlussprofile']);
  const chips = [...html.matchAll(/<facet-remove-component\b[^>]*\brole="button"[^>]*>/g)];

  assert.equal(chips.length, 2);
  assert.ok(chips.every(([tag]) => tag.includes('tabindex="0"')));
  assert.match(html, /active-class="facets__clear-all-link--active"/);
  assert.match(html, /<button\b[^>]*class="[^"]*facets__clear-all-link--active"/);
  assert.match(styles, /\.facets__clear-all-link--active\s*\{\s*display:\s*block;/);
});

test('Ohne aktive Filter wird kein Zuruecksetzen angeboten', async () => {
  const html = await render([]);
  assert.doesNotMatch(html, /facets__clear-all-link/);
  assert.doesNotMatch(html, /\brole="button"/);
});
