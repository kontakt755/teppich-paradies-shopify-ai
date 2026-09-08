import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, parsePaginated, toIssueRecord } from '../../../scripts/build-dashboard-data.mjs';

const raw = (over = {}) => ({
  number: 34, title: '🚧 Shopify Admin API Integration', state: 'open',
  html_url: 'https://github.com/x/y/issues/34',
  labels: [{ name: 'status:blockiert' }, { name: 'priority:p0' }, { name: 'area:backend' }],
  assignee: null, assignees: [], comments: 2,
  body: '## Problem\nBrauchen Admin API Access.\n\n## Status\n**BLOCKIERT** - Warte auf Shopify API Credentials von Ahmet\n\n## Nächster Schritt\nAhmet bitte Admin API Key + Scopes geben',
  created_at: '2026-09-03T00:00:00Z', updated_at: '2026-09-03T00:00:00Z', closed_at: null, ...over,
});

test('parsePaginated verkraftet ein und mehrere Arrays', () => {
  assert.deepEqual(parsePaginated('[{"a":1}]'), [{ a: 1 }]);
  assert.deepEqual(parsePaginated('[{"a":1}]\n[{"a":2}]'), [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(parsePaginated('  '), []);
});

test('toIssueRecord behaelt Schema-1-Felder und ergaenzt extrahierte Felder ohne Body', () => {
  const r = toIssueRecord(raw());
  assert.equal(r.nextStep, 'Ahmet bitte Admin API Key + Scopes geben');
  assert.equal(r.fields.blocker, 'Warte auf Shopify API Credentials von Ahmet');
  assert.equal(r.fields.goal, 'Brauchen Admin API Access.');
  assert.equal(r.comments, 2);
  assert.deepEqual(r.labels, ['status:blockiert', 'priority:p0', 'area:backend']);
  assert.equal('body' in r, false, 'Body wird nicht abgelegt');
});

test('buildPayload filtert PRs und Issues ohne relevante Labels, meldet verfuegbare Labels', () => {
  const p = buildPayload({
    issues: [raw(), raw({ number: 35, pull_request: {} }), raw({ number: 36, labels: [{ name: 'question' }] })],
    labels: ['status:blockiert', 'bug', 'priority:p0'],
    now: new Date('2026-09-08T10:00:00Z'),
  });
  assert.equal(p.schema, 2);
  assert.equal(p.count, 1);
  assert.equal(p.generated_at, '2026-09-08T10:00:00.000Z');
  assert.deepEqual(p.sync.labelsAvailable, ['priority:p0', 'status:blockiert']);
  assert.equal(p.sync.ok, true);
});
