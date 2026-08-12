import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { HardStopError, RiskGuard, loadRiskMap, routeRiskDecision } from '../core/risk-guard.mjs';
import { ManifestRunner } from '../core/runner.mjs';

const riskMap = loadRiskMap(new URL('../../domains/shopify/risk-map.json', import.meta.url));
const tasks = JSON.parse(fs.readFileSync(new URL('../fixtures/risk-tasks.json', import.meta.url), 'utf8'));
const guard = new RiskGuard({ riskMap });

test('normal LOW task uses operation and path risk', () => {
  const result = guard.evaluate({ task: tasks.low, files: ['automation/fixtures/output.json'], operations: ['report_write'] });
  assert.deepEqual(result, { declaredRisk: 'LOW', operationRisk: 'LOW', pathRisk: 'LOW', resourceRisk: 'LOW', effectiveRisk: 'LOW' });
});

test('normal MEDIUM task uses operation and path risk', () => {
  const result = guard.evaluate({ task: tasks.medium, files: ['sections/fixture.liquid'], operations: ['multi_file_theme_edit'] });
  assert.equal(result.effectiveRisk, 'MEDIUM');
  assert.equal(result.pathRisk, 'MEDIUM');
});

test('HIGH task is written as NEEDS_AHMET and never routed to execution', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-risk-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const evaluation = guard.evaluate({ task: tasks.high, files: ['templates/product.json'], operations: ['theme_publish'] });
  const state = routeRiskDecision({ task: tasks.high, evaluation, statePath: path.join(root, 'HIGH-1.json'), needsAhmetPath: path.join(root, 'needs-ahmet.md') });
  assert.equal(state.status, 'NEEDS_AHMET');
  assert.match(fs.readFileSync(path.join(root, 'needs-ahmet.md'), 'utf8'), /HIGH-1[\s\S]*NEEDS_AHMET/);
});

test('file outside allowlist causes HARD STOP', () => {
  assert.throws(() => guard.postflight({ task: tasks.low, changedFiles: ['sections/unknown.liquid'], actualOperations: ['report_write'] }), HardStopError);
});

test('actual diff touching a higher-risk path causes HARD STOP', () => {
  const task = { ...tasks.high, risk: 'MEDIUM', allowedOperations: ['multi_file_theme_edit'], allowedFiles: ['templates/**'] };
  assert.throws(() => guard.postflight({ task, changedFiles: ['templates/product.json'], actualOperations: ['multi_file_theme_edit'] }), /Effective risk HIGH exceeds/);
});

test('actual higher-risk operation causes HARD STOP even when path is LOW', () => {
  const task = { ...tasks.low, risk: 'MEDIUM', allowedOperations: ['report_write', 'live_price_write'] };
  assert.throws(() => guard.postflight({ task, changedFiles: ['automation/fixtures/output.json'], actualOperations: ['live_price_write'] }), /Effective risk HIGH exceeds/);
});

test('unknown operation causes HARD STOP', () => {
  const task = { ...tasks.low, allowedOperations: ['invented_operation'] };
  assert.throws(() => guard.evaluate({ task, files: ['automation/fixtures/output.json'], operations: ['invented_operation'] }), /Unknown operation/);
});

test('operation outside explicit allowlist causes HARD STOP', () => {
  assert.throws(() => guard.postflight({ task: tasks.low, changedFiles: ['automation/fixtures/output.json'], actualOperations: ['test_write'] }), /outside allowlist/);
});

test('protected live and fallback theme resources make otherwise safe task HIGH', () => {
  assert.throws(() => guard.evaluate({ task: tasks.low, files: ['automation/fixtures/output.json'], operations: ['report_write'], resources: ['theme:196301750606'] }), /Effective risk HIGH exceeds/);
  assert.throws(() => guard.evaluate({ task: tasks.low, files: ['automation/fixtures/output.json'], operations: ['report_write'], resources: ['theme:201829679438'] }), /Effective risk HIGH exceeds/);
});

test('unpublished draft product operation is MEDIUM, not HIGH', () => {
  const task = { id: 'DRAFT-1', risk: 'MEDIUM', allowedFiles: ['automation/fixtures/**'], allowedOperations: ['draft_product_create_unpublished'] };
  const result = guard.evaluate({ task, files: ['automation/fixtures/draft.json'], operations: ['draft_product_create_unpublished'] });
  assert.equal(result.effectiveRisk, 'MEDIUM');
});

test('runner applies preflight and actual-diff postflight guard', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-risk-runner-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = { runId: 'guarded', tasks: [{
    ...tasks.low, domain: 'shopify', dependencies: []
  }] };
  const runner = new ManifestRunner({
    manifest, stateDir: path.join(root, 'state'), riskGuard: guard,
    executeTask: async () => ({ status: 'PASS', changedFiles: ['templates/product.json'], actualOperations: ['report_write'] })
  });
  await assert.rejects(() => runner.run(), HardStopError);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'state', 'run-state.json'), 'utf8')).status, 'STOPPED');
});
