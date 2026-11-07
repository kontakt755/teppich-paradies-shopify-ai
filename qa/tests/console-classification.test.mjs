import assert from 'node:assert/strict';
import test from 'node:test';
import { isKnownShopifyLoginXFrameWarning, isPreviewHeaderHydrationArtifact, SHOP_LOGIN_CALLBACK_PATH, SHOP_LOGIN_X_FRAME_MESSAGE } from '../console-classification.mjs';
import { sanitizeText } from '../../automation/core/url-sanitizer.mjs';

const callbackUrl = (origin = 'https://www.teppich-paradies.net', path = SHOP_LOGIN_CALLBACK_PATH) => {
  const url = new URL(path, origin);
  url.searchParams.set('token', 'FAKE');
  return url.href;
};

test('A: exact Shopify callback warning is allowed', () => {
  assert.equal(isKnownShopifyLoginXFrameWarning({ type: 'console.error', message: SHOP_LOGIN_X_FRAME_MESSAGE, url: callbackUrl() }), true);
});

test('B: same message on product path is not allowed', () => {
  assert.equal(isKnownShopifyLoginXFrameWarning({ type: 'console.error', message: SHOP_LOGIN_X_FRAME_MESSAGE, url: callbackUrl(undefined, '/products/test') }), false);
});

test('C: same callback path on another origin is not allowed', () => {
  assert.equal(isKnownShopifyLoginXFrameWarning({ type: 'console.error', message: SHOP_LOGIN_X_FRAME_MESSAGE, url: callbackUrl('https://example.test') }), false);
});

test('D: another console error on callback is not allowed', () => {
  assert.equal(isKnownShopifyLoginXFrameWarning({ type: 'console.error', message: 'Unexpected theme error', url: callbackUrl() }), false);
});

test('E: callback query is absent after sanitization', () => {
  const output = sanitizeText(`${SHOP_LOGIN_X_FRAME_MESSAGE} (${callbackUrl()})`);
  assert.match(output, new RegExp(`${SHOP_LOGIN_CALLBACK_PATH.replaceAll('/', '\\/')}\\)$`));
  assert.doesNotMatch(output, /FAKE|\?/);
});


const kopfFehler = 'Section sections--31541849915726__header_section not found in the section rendering response';
const previewBasis = 'https://sjjyq1-6w.myshopify.com/?preview_theme_id=204436144462';

test('F: Kopf-Nachladefehler gilt auf dem Preview-Theme als Artefakt', () => {
  assert.equal(isPreviewHeaderHydrationArtifact({ type: 'pageerror', message: kopfFehler }, previewBasis), true);
});

test('G: derselbe Fehler gegen Live bleibt ein Fehler', () => {
  assert.equal(isPreviewHeaderHydrationArtifact({ type: 'pageerror', message: kopfFehler }, 'https://www.teppich-paradies.net/'), false);
});

test('H: andere Abschnitte oder Meldungen bleiben Fehler', () => {
  assert.equal(isPreviewHeaderHydrationArtifact({ type: 'pageerror', message: 'Section sections--1__footer_section not found in the section rendering response' }, previewBasis), false);
  assert.equal(isPreviewHeaderHydrationArtifact({ type: 'pageerror', message: 'Section sections--1__header_section not found' }, previewBasis), false);
  assert.equal(isPreviewHeaderHydrationArtifact({ type: 'console.error', message: kopfFehler }, previewBasis), false);
});
