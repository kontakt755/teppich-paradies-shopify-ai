import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Liquid } from 'liquidjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cart = readFileSync(join(root, 'snippets/cart-products.liquid'), 'utf8');
const start = cart.indexOf('{%- liquid\n                assign tp_cp_item_url = item.url');
const end = cart.indexOf('-%}', start);
assert.ok(start >= 0 && end > start, 'Warenkorb-Rueckweg fehlt');
const template = cart.slice(start, end + 3) + '{{ tp_cp_item_url | escape }}';
const massUrl = readFileSync(join(root, 'snippets/tp-cart-mass-url.liquid'), 'utf8').replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const liquid = new Liquid({ templates: { 'tp-cart-mass-url': massUrl } });

test('Konfigurator-Muster verlinkt die Quellvariante statt des Musterartikels', async () => {
  const url = await liquid.parseAndRender(template, {
    item: {
      url: '/products/muster-piumera?variant=9',
      properties: {
        _Muster_ID: 'piumera--sand-hell',
        _Quellprodukt: 'piumera',
        _Quellvariante_ID: '42',
      },
    },
  });
  assert.equal(url, '/products/piumera?variant=42');
});

test('Normale Warenkorbzeilen behalten ihren Produktlink', async () => {
  const url = await liquid.parseAndRender(template, {
    item: { url: '/products/teppich?variant=15', properties: {} },
  });
  assert.equal(url, '/products/teppich?variant=15');
});

test('Titel und Bild des Massartikels nehmen ebenfalls die gespeicherten Masse mit', async () => {
  const url = await liquid.parseAndRender(template, {
    item: {
      url: '/products/teppich?variant=15', variant: { id: 15 },
      product: { url: '/products/teppich', metafields: { service: { einfassung: { value: 'Fertig' } } } },
      properties: { Form: 'Rechteck', 'Maße': '80 × 150 cm' },
    },
  });
  assert.equal(url, '/products/teppich?variant=15&amp;breite=80&amp;laenge=150&amp;form=rechteck');
});

test('Alte Muster ohne Quellprodukt bleiben erreichbar', async () => {
  const url = await liquid.parseAndRender(template, {
    item: { url: '/products/kostenloses-muster?variant=7', properties: { _Muster_ID: 'alt' } },
  });
  assert.equal(url, '/products/kostenloses-muster?variant=7');
});

test('Bild und Titel nutzen denselben Rueckweg', () => {
  assert.match(cart, /href="\{\{ tp_cp_item_url \| escape \}\}"\s+class="cart-items__media-container"/);
  assert.match(cart, /href="\{\{ tp_cp_item_url \| escape \}\}"\s+class="cart-items__title"/);
});
