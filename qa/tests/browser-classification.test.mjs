import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOGIN_CALLBACK_X_FRAME_MESSAGE,
  classifyBrowserClosure,
  classifyConsoleError,
  isBrowserClosedError
} from '../browser-classification.mjs';

const callback = 'https://www.teppich-paradies.net/services/login_with_shop/buyer/callback?token=secret&trace=1';

test('G: bekannter Shopify Callback wird nur exakt als Plattformnoise erkannt und Query entfernt', () => {
  const result = classifyConsoleError({ type: 'console.error', message: LOGIN_CALLBACK_X_FRAME_MESSAGE, url: callback });
  assert.equal(result.kind, 'external-platform-noise');
  assert.equal(result.entry.url, 'https://www.teppich-paradies.net/services/login_with_shop/buyer/callback');
  assert.ok(!result.entry.url.includes('secret'));
});

test('H: anderer Headerfehler wird nicht ignoriert', () => {
  const result = classifyConsoleError({ type: 'console.error', message: `${LOGIN_CALLBACK_X_FRAME_MESSAGE} anders`, url: callback });
  assert.equal(result.kind, 'error');
});

test('H: falscher Origin oder Pfad wird nicht ignoriert', () => {
  assert.equal(classifyConsoleError({ type: 'console.error', message: LOGIN_CALLBACK_X_FRAME_MESSAGE, url: 'https://example.com/services/login_with_shop/buyer/callback' }).kind, 'error');
  assert.equal(classifyConsoleError({ type: 'console.error', message: LOGIN_CALLBACK_X_FRAME_MESSAGE, url: 'https://www.teppich-paradies.net/anderer/pfad' }).kind, 'error');
});

test('I: geschlossene Browserobjekte werden gezielt erkannt', () => {
  assert.equal(isBrowserClosedError(new Error('page.evaluate: Target page, context or browser has been closed')), true);
  assert.equal(isBrowserClosedError(new Error('Navigation timeout')), false);
  assert.deepEqual(classifyBrowserClosure(new Error('Target page, context or browser has been closed'), true), {
    severity: 'warning',
    message: 'Browserkontext nach exakt erkanntem externen Shopify Login-Callback geschlossen; Restlauf kontrolliert beendet'
  });
  assert.equal(classifyBrowserClosure(new Error('Navigation timeout'), true), null);
});
