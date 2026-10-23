import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const engine = new Liquid({
  relativeReference: false,
  fs: {
    resolve: (_dir, file) => path.join(root, 'snippets', file + '.liquid'),
    exists: async file => existsSync(file), existsSync,
    readFile: async file => readFileSync(file, 'utf8'),
    readFileSync: file => readFileSync(file, 'utf8'), contains: () => true,
  },
});
for (const tag of ['doc', 'stylesheet', 'style']) {
  engine.registerTag(tag, {
    parse(_token, rest) { while (rest.length) if (rest.shift().name === 'end' + tag) return; },
    render: () => '',
  });
}
engine.registerFilter('json', value => JSON.stringify(value ?? null));
engine.registerFilter('color_brightness', () => 255);
const source = read('blocks/color-swatch-picker.liquid').split('{% assign selected_variant =')[0];
function fixture(suffix = 'wunschmass-fertig', names = ['Qualität', 'Rücken', 'Einfassband']) {
  const selected = { id: 777, options: ['Qualität 2', 'Rücken 2', 'Einfassband 8'] };
  const product = {
    id: 7001, url: '/products/synthetic-wunschmass', variants: [selected],
    has_only_default_variant: false, selected_or_first_available_variant: selected,
    options_with_values: names.map((name, index) => ({
      name, position: index + 1,
      values: Array.from({ length: [6, 2, 10][index] }, (_, n) => ({
        id: (index + 1) * 100 + n, name: name + ' ' + (n + 1),
        available: true, selected: n === [1, 1, 7][index], variant: selected,
      })),
    })),
  };
  return { product, template: { suffix }, block: { id: 'existing_color_block', settings: {} }, section: { id: 'main', settings: {} } };
}

test('Wunschmass ohne Farboption: alle drei bestehenden Optionen im Horizon-Picker', async () => {
  const html = await engine.parseAndRender(source, fixture());
  assert.equal((html.match(/<variant-picker\b/g) || []).length, 1);
  assert.equal((html.match(/<select\b/g) || []).length, 3);
  for (const name of ['Qualität', 'Rücken', 'Einfassband']) assert.match(html, new RegExp('options\\[' + name + '\\]'));
  assert.equal((html.match(/data-option-value-id=/g) || []).length, 18);
  assert.equal((html.match(/selected="selected"/g) || []).length, 3);
  assert.match(html, /data-product-id="7001"/);
  assert.match(html, /data-template-product-match="true"/);
  assert.match(html, /"id":777/);
});

test('Bestehende Farbwahl und andere Vorlagen bekommen keinen zweiten Picker', async () => {
  for (const name of ['Farbe', 'Color', 'Dekor']) {
    const html = await engine.parseAndRender(source, fixture('wunschmass-fertig', [name, 'Rücken', 'Einfassband']));
    assert.doesNotMatch(html, /<variant-picker\b/);
  }
  assert.doesNotMatch(await engine.parseAndRender(source, fixture('einfassung')), /<variant-picker\b/);
  const onlyDefault = fixture(); onlyDefault.product.has_only_default_variant = true;
  assert.doesNotMatch(await engine.parseAndRender(source, onlyDefault), /<variant-picker\b/);
});

test('Vorhandener Horizon-Block behaelt seine Knopfdarstellung ohne Ueberschreibung', async () => {
  const f = fixture(); f.block.settings.variant_style = 'buttons';
  const html = await engine.parseAndRender(read('snippets/variant-main-picker.liquid'), { ...f, product_resource: f.product });
  assert.equal((html.match(/<fieldset\b/g) || []).length, 3);
  assert.equal((html.match(/type="radio"/g) || []).length, 18);
  assert.doesNotMatch(html, /<select\b/);
});
