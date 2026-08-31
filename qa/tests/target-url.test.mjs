import assert from 'node:assert/strict';
import test from 'node:test';
import { targetUrl, validatePreviewContext } from '../target-url.mjs';

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
