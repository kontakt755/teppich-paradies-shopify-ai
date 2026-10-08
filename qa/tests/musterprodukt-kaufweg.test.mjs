import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Liquid } from 'liquidjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = path => readFileSync(join(root, path), 'utf8');
const buy = read('blocks/buy-buttons.liquid');
const section = read('sections/product-information.liquid');
const option = read('snippets/tp-musteroption.liquid');
const liquid = new Liquid();

const optionSource = option.slice(option.indexOf('{%- liquid'), option.lastIndexOf('-%}') + 4);

test('interner Musterartikel fuehrt zum eigentlichen Belag', async () => {
  const url = await liquid.parseAndRender(optionSource, {
    product: { handle: 'muster-piumera-teppichboden-400cm-500cm', type: 'Musterservice', tags: [] },
  });
  assert.equal(url, '/pages/muster?produkt=piumera-teppichboden-400cm-500cm');
});

test('altes Sammelprodukt fuehrt zur allgemeinen Musterseite', async () => {
  const url = await liquid.parseAndRender(optionSource, {
    product: { handle: 'kostenloses-muster', type: 'Musterservice', tags: [] },
  });
  assert.equal(url, '/pages/muster');
});

test('regulaerer Musterweg und Sortimentsausschluss bleiben bestehen', async () => {
  const normal = await liquid.parseAndRender(optionSource, {
    product: { handle: 'piumera-teppichboden-400cm-500cm', type: 'Teppichboden', tags: [] },
  });
  const ohneMuster = await liquid.parseAndRender(optionSource, {
    product: { handle: 'parkett', type: 'Parkett', tags: [] },
  });
  assert.equal(normal, '/pages/muster?produkt=piumera-teppichboden-400cm-500cm');
  assert.equal(ohneMuster, '');
});

test('beide Produktseiten-Kaufknoepfe bleiben bei Musterservice aus', async () => {
  const guard = buy.match(/assign tp_hide_buy_buttons = false[\s\S]*?if template.name == 'product' and product.type == 'Musterservice'\s*assign tp_hide_buy_buttons = true\s*endif/);
  assert.ok(guard, 'Muster-Guard im Kaufblock fehlt');
  assert.match(buy, /unless tp_hide_buy_buttons[\s\S]*?<product-form-component/);
  const buySource = '{% liquid\n' + guard[0] + '\n%}{{ tp_hide_buy_buttons }}';
  assert.equal(await liquid.parseAndRender(buySource, {
    template: { name: 'product' }, product: { type: 'Musterservice' }, tp_verkaufsart: '',
  }), 'true');
  assert.equal(await liquid.parseAndRender(buySource, {
    template: { name: 'product' }, product: { type: 'Teppichboden' }, tp_verkaufsart: '',
  }), 'false');

  const stickyGuard = section.match(/\{% if section.settings.enable_sticky_add_to_cart and product.type != 'Musterservice' %\}/);
  assert.ok(stickyGuard, 'Kaufleiste braucht denselben Muster-Guard');
  const stickySource = stickyGuard[0] + 'sichtbar{% endif %}';
  assert.equal(await liquid.parseAndRender(stickySource, {
    section: { settings: { enable_sticky_add_to_cart: true } }, product: { type: 'Musterservice' },
  }), '');
  assert.equal(await liquid.parseAndRender(stickySource, {
    section: { settings: { enable_sticky_add_to_cart: true } }, product: { type: 'Teppichboden' },
  }), 'sichtbar');
});
