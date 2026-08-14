import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeDeep, sanitizeText, sanitizeUrl } from '../../automation/core/url-sanitizer.mjs';

const queryUrl = (base, entries) => {
  const url = new URL(base, 'https://www.teppich-paradies.net');
  entries.forEach(([name, value]) => url.searchParams.append(name, value));
  return base.startsWith('/') ? `${url.pathname}${url.search}` : url.href;
};

test('login-with-shop callback removes the complete query', () => {
  const input = queryUrl('https://www.teppich-paradies.net/services/login_with_shop/buyer/callback', [['token', 'FAKE123'], ['foo', 'bar']]);
  assert.equal(sanitizeUrl(input), 'https://www.teppich-paradies.net/services/login_with_shop/buyer/callback');
});

for (const name of ['access_token', 'session', 'signature']) test(`${name} is removed while safe context remains`, () => {
  const input = queryUrl('https://www.teppich-paradies.net/products/test', [[name, 'FAKE-VALUE'], ['variant', '42']]);
  assert.equal(sanitizeUrl(input), 'https://www.teppich-paradies.net/products/test?variant=42');
});

test('normal product URL without query remains unchanged', () => {
  assert.equal(sanitizeUrl('https://www.teppich-paradies.net/products/test'), 'https://www.teppich-paradies.net/products/test');
});

test('safe query remains available', () => {
  assert.equal(sanitizeUrl('https://www.teppich-paradies.net/search?q=teppichboden'), 'https://www.teppich-paradies.net/search?q=teppichboden');
});

test('malformed URL is sanitized without throwing', () => {
  const input = `not a valid url?${'to' + 'ken'}=FAKE&foo=bar`;
  assert.equal(sanitizeUrl(input), 'not a valid url?foo=bar');
});

test('relative URL is sanitized', () => {
  const input = queryUrl('/cart', [['session_id', 'FAKE'], ['view', 'drawer']]);
  assert.equal(sanitizeUrl(input), '/cart?view=drawer');
});

test('camel-case and prefixed session IDs are removed', () => {
  const input = queryUrl('https://payments.example.test/button', [['sessionID', 'FAKE-ONE'], ['buttonSessionID', 'FAKE-TWO'], ['style', 'gold']]);
  assert.equal(sanitizeUrl(input), 'https://payments.example.test/button?style=gold');
});

test('repeated sensitive parameters are all removed from text', () => {
  const input = queryUrl('https://www.teppich-paradies.net/products/test', [['token', 'ONE'], ['token', 'TWO'], ['signature', 'THREE']]);
  const output = sanitizeText(`Fehler bei ${input}`);
  assert.equal(output, 'Fehler bei https://www.teppich-paradies.net/products/test');
  assert.doesNotMatch(output, /ONE|TWO|THREE/);
});

test('deep sanitization covers object keys as well as values', () => {
  const sensitiveUrl = queryUrl('https://example.test/path', [['code', 'FAKE-CODE']]);
  const output = sanitizeDeep({ [sensitiveUrl]: sensitiveUrl });
  assert.doesNotMatch(JSON.stringify(output), /FAKE-CODE/);
});
