import assert from 'node:assert/strict';
import test from 'node:test';
import { qaImpactSummary, selectImpactedPages } from '../impact-router.mjs';

const pages = [
  { name: 'Startseite', path: '/', type: 'home' },
  { name: 'Vinylboden', path: '/collections/vinyl', type: 'vinylCollection' },
  { name: 'Klickvinyl PDP', path: '/products/example', type: 'packageProduct' },
  { name: 'Warenkorb', path: '/cart', type: 'cart' },
  { name: 'Versand & Lieferung', path: '/pages/versand', type: 'page' },
];

test('no diff context keeps the established full QA scope', () => {
  assert.equal(selectImpactedPages(pages).length, pages.length);
});

test('cart change selects cart and product flows only', () => {
  assert.deepEqual(selectImpactedPages(pages, ['assets/cart-drawer.js']).map(page => page.name), ['Klickvinyl PDP', 'Warenkorb']);
});

test('shipping copy change selects the shipping page', () => {
  assert.deepEqual(selectImpactedPages(pages, ['sections/versand-service.liquid']).map(page => page.name), ['Versand & Lieferung']);
});

test('global theme change remains conservative and selects every page', () => {
  const selected = selectImpactedPages(pages, ['layout/theme.liquid']);
  assert.equal(selected.length, pages.length);
  assert.equal(qaImpactSummary(pages, selected, ['layout/theme.liquid']).mode, 'TARGETED');
});

test('non-storefront change runs no browser pages', () => {
  assert.deepEqual(selectImpactedPages(pages, ['automation/core/runner.mjs']), []);
});
