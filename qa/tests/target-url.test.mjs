import assert from 'node:assert/strict';
import test from 'node:test';
import { targetUrl, validatePreviewContext, validatePreviewTheme } from '../target-url.mjs';

test('target URL keeps an approved preview theme id', () => {
  assert.equal(targetUrl('/cart', 'https://shop.example/?preview_theme_id=22'), 'https://shop.example/cart?preview_theme_id=22');
});

test('public QA rejects an unexpected preview context', () => {
  const result = validatePreviewContext('https://shop.example/', 'https://shop.example/cart?preview_theme_id=22');
  assert.equal(result.status, 'FAIL');
  assert.match(result.reason, /Unerwarteter/);
});

test('preview QA accepts only the approved preview theme', () => {
  assert.equal(validatePreviewContext('https://shop.example/?preview_theme_id=22', 'https://shop.example/cart?preview_theme_id=22').status, 'PASS');
  assert.match(validatePreviewContext('https://shop.example/?preview_theme_id=22', 'https://shop.example/cart').reason, /ging verloren/);
  assert.match(validatePreviewContext('https://shop.example/?preview_theme_id=22', 'https://shop.example/cart?preview_theme_id=23').reason, /stimmt nicht/);
});

test('preview theme is proven by the rendered theme id, not by the URL', () => {
  const preview = 'https://shop.example/?preview_theme_id=22';
  // Shopify verwirft den Parameter beim Redirect - gerendert hat trotzdem
  // das freigegebene Theme. Das muss PASS sein.
  assert.equal(validatePreviewTheme(preview, 22).status, 'PASS');
  assert.equal(validatePreviewTheme(preview, '22').status, 'PASS');
  // Ein fremdes Theme bleibt ein harter Fehler.
  assert.match(validatePreviewTheme(preview, 23).reason, /anderes Theme/);
  // Nicht auslesbar heisst kein Beleg, also ebenfalls Fehler.
  assert.match(validatePreviewTheme(preview, null).reason, /nicht auslesbar/);
  // Ohne freigegebene Preview gibt es nichts zu vergleichen.
  assert.equal(validatePreviewTheme('https://shop.example/', 99).status, 'PASS');
});
