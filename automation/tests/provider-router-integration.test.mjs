import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ManifestRunner } from '../core/runner.mjs';

test('Step 7: Integration — ManifestRunner executes callbacks with proper signatures', async (t) => {
  const stateDir = mkdtempSync(join(tmpdir(), 'router-test-'));
  const manifest = {
    runId: 'integration-test-1',
    tasks: [
      {
        id: 'ROUTER-INTEGRATION-1',
        domain: 'router-test',
        risk: 'LOW',
        dependencies: [],
        allowedFiles: ['tests/**'],
        allowedOperations: ['report_write'],
      }
    ]
  };

  let executeTaskCalled = false;
  let reviewTaskCalled = false;
  let correctTaskCalled = false;

  const mockImplementExecutor = async (route, task, options) => {
    executeTaskCalled = true;
    return {
      status: 'PASS',
      diffEntries: [],
      resources: {},
      actualOperations: []
    };
  };

  const mockReviewExecutor = async (route, task, implementation, options) => {
    reviewTaskCalled = true;
    return {
      status: 'PASS',
      findings: [],
      actualOperations: []
    };
  };

  const mockCorrectExecutor = async (route, task, implementation, review, options) => {
    correctTaskCalled = true;
    return {
      status: 'PASS',
      diffEntries: [],
      actualOperations: []
    };
  };

  const runner = new ManifestRunner({
    manifest,
    stateDir,
    executeTask: mockImplementExecutor,
    reviewTask: mockReviewExecutor,
    correctTask: mockCorrectExecutor,
    io: { writeFile: () => {}, readFile: () => null },
  });

  await t.test('ManifestRunner initializes with executor callbacks', () => {
    assert.equal(runner.manifest.runId, 'integration-test-1', 'manifest should load');
    assert.equal(runner.manifest.tasks.length, 1, 'tasks should be present');
    assert.equal(typeof runner.executeTask, 'function', 'executeTask callback should be set');
    assert.equal(typeof runner.reviewTask, 'function', 'reviewTask callback should be set');
    assert.equal(typeof runner.correctTask, 'function', 'correctTask callback should be set');
  });

  await t.test('executor callbacks can be invoked directly', async () => {
    const task = manifest.tasks[0];
    const mockRoute = { provider: 'CLAUDE_CODE', role: 'IMPLEMENTER' };
    const mockOptions = { timeout: 5000 };

    await runner.executeTask(mockRoute, task, mockOptions);
    assert.ok(executeTaskCalled, 'executeTask should have been called');

    const mockImplementation = { status: 'PASS', diffEntries: [], actualOperations: [] };
    await runner.reviewTask(mockRoute, task, mockImplementation, mockOptions);
    assert.ok(reviewTaskCalled, 'reviewTask should have been called');

    const mockReview = { status: 'PASS', findings: [] };
    await runner.correctTask(mockRoute, task, mockImplementation, mockReview, mockOptions);
    assert.ok(correctTaskCalled, 'correctTask should have been called');
  });
});
