import test from 'node:test';
import assert from 'node:assert/strict';
import { sollZeigen } from '../bausteine/nach-oben.mjs';

test('Nach oben: erst nach anderthalb Bildschirmen, nie ueber einem Dialog', () => {
  assert.equal(sollZeigen(0, 800), false);
  assert.equal(sollZeigen(1200, 800), false);
  assert.equal(sollZeigen(1201, 800), true);
  assert.equal(sollZeigen(5000, 800, true), false);
  assert.equal(sollZeigen(5000, 0), false);
});
