import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../assets/tp-sample-checkout-core.js', import.meta.url), 'utf8');
const browser = { window: {} };
runInNewContext(source, browser);
const { canSample } = browser.window.TPSampleCheckoutCore;

test('neu importierte Holzböden können nicht als generisches Muster bestellt werden', () => {
  for (const type of ['Laminat', 'Parkett', 'Kork']) {
    assert.equal(canSample({ type, tags: [], handle: 'beispiel' }), false, type);
  }
});

test('Muster anderer Beläge bleiben verfügbar, ausgeschlossene Tags greifen weiter', () => {
  assert.equal(canSample({ type: 'Teppichboden', tags: [] }), true);
  assert.equal(canSample({ type: 'Vinylboden', tags: [] }), true);
  assert.equal(canSample({ type: 'Teppichboden', tags: ['ohne-muster'] }), false);
  assert.equal(canSample({ type: 'Teppichboden', tags: 'zubehoer, aktion' }), false);
});
