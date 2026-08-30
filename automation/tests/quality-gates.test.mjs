import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateQualityGates } from '../core/quality-gates.mjs';
import { routeTaskPolicy } from '../core/task-router.mjs';

const task = { id: 'LOW', domain: 'shopify', taskType: 'IMPLEMENTATION', routing: { policyVersion: 2 }, risk: 'LOW', allowedFiles: ['automation/core/x.mjs'], allowedOperations: ['report_write'] };

test('LOW fast path passes with implementation, postflight and deterministic test evidence', () => {
  const policy = routeTaskPolicy(task);
  const result = evaluateQualityGates({
    policy,
    result: { status: 'PASS', changedFiles: ['automation/core/x.mjs'], tests: [{ id: 'unit', status: 'PASS' }] },
    postflight: { status: 'PASS', changedLines: 4 },
  });
  assert.equal(result.releaseReady, true);
  assert.equal(result.records.review.status, 'NOT_REQUIRED');
});

test('a required gate without evidence blocks completion', () => {
  const policy = routeTaskPolicy({ ...task, risk: 'MEDIUM', allowedFiles: ['sections/a.liquid'], allowedOperations: ['multi_file_theme_edit'] });
  const result = evaluateQualityGates({ policy, result: { status: 'PASS', changedFiles: ['sections/a.liquid'], tests: [{ id: 'unit', status: 'PASS' }] }, postflight: { status: 'PASS' } });
  assert.equal(result.releaseReady, false);
  assert.ok(result.blocking.some(gate => gate.id === 'visualQa'));
});
