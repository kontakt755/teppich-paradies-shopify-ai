import test from 'node:test';
import assert from 'node:assert/strict';
import { kalendertage } from '../lib/kalendertage.mjs';

test('kalendertage: Berliner Kalendertage, null ohne Datum, nie negativ', () => {
  assert.equal(kalendertage('2026-10-19T16:33:35Z', new Date('2026-10-28T11:29:00Z')), 9);
  assert.equal(kalendertage('2026-10-19T21:30:00Z', new Date('2026-10-19T21:50:00Z')), 0);
  assert.equal(kalendertage('2026-10-19T22:30:00Z', new Date('2026-10-20T06:00:00Z')), 0); // beides 20.10. Berlin
  assert.equal(kalendertage('2026-10-24T12:00:00Z', new Date('2026-10-26T12:00:00Z')), 2); // ueber die Zeitumstellung
  assert.equal(kalendertage('2026-10-28T10:00:00Z', Date.parse('2026-10-28T08:00:00Z')), 0);
  assert.equal(kalendertage(null), null);
  assert.equal(kalendertage('kein datum'), null);
});
