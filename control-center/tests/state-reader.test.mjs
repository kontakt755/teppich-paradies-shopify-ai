import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractChanges, evidenceStatus, redact, safeResolve } from '../state-reader.mjs';

test('safeResolve rejects directory traversal', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-center-'));
  assert.throws(() => safeResolve(root, '../secret.txt'), /outside repository/);
});

test('redact removes secret-shaped values recursively', () => {
  const result = redact({ ok: 'visible', nested: { accessToken: 'never-show', count: 2 }, message: 'request failed?access_token=never-show Bearer abcdefghijklmnop' });
  assert.deepEqual(result, { ok: 'visible', nested: { accessToken: '[REDACTED]', count: 2 }, message: 'request failed?access_token=[REDACTED] Bearer [REDACTED]' });
});

test('evidence marks a PASS from another commit as stale', () => {
  const result = evidenceStatus({ data: { status: 'PASS', commit: 'old', branch: 'feature/x' }, relative: 'qa/evidence/local-verification.json', mtime: '2026-01-01T00:00:00.000Z' }, null, 'new', 'feature/x');
  assert.equal(result.status, 'PASS');
  assert.equal(result.stale, true);
});

test('generic preview changes retain source and calculate numeric diff', () => {
  const [change] = extractChanges({ changes: [{ product: 'Example', sku: 'SKU-1', field: 'price', before: 70.71, after: 73.51 }] }, 'qa/previews/example.json');
  assert.equal(change.object, 'Example');
  assert.equal(change.difference, 2.8);
  assert.equal(change.source, 'qa/previews/example.json');
});
