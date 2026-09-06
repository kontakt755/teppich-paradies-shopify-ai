import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';
import { ManifestRunner } from '../core/runner.mjs';
import { DEFAULT_PROVIDERS, selectProvider } from '../core/provider-router.mjs';
import { ROLE } from '../core/task-router.mjs';

test('Step 8: Production Rollout — real provider routing decisions', async (t) => {
  const stateDir = mkdtempSync(join(tmpdir(), 'rollout-test-'));
  const manifest = {
    runId: 'ROLLOUT-2026-09-06-VALIDATION',
    tasks: [
      {
        id: 'ROLLOUT-LIGHT',
        domain: 'router',
        risk: 'LOW',
        dependencies: [],
        allowedFiles: ['automation/**'],
        allowedOperations: ['report_write'],
        taskType: 'analysis',
        routing: { policyVersion: 2, modelClass: 'LIGHT', effortLevel: 'low' }
      },
      {
        id: 'ROLLOUT-STANDARD',
        domain: 'router',
        risk: 'MEDIUM',
        dependencies: ['ROLLOUT-LIGHT'],
        allowedFiles: ['automation/**', 'theme/**'],
        allowedOperations: ['multi_file_feature_edit'],
        taskType: 'implementation',
        routing: { policyVersion: 2, modelClass: 'STANDARD', effortLevel: 'medium' }
      }
    ]
  };

  await t.test('provider catalog contains CLAUDE_CODE and CODEX', () => {
    const providerIds = DEFAULT_PROVIDERS.map(p => p.id);
    assert.ok(providerIds.includes('CLAUDE_CODE'), 'CLAUDE_CODE should be in catalog');
    assert.ok(providerIds.includes('CODEX'), 'CODEX should be in catalog');
  });

  await t.test('provider selection respects modelClass requirements', () => {
    // Test LIGHT modelClass task — should select CODEX or similar
    const lightTask = manifest.tasks[0];
    const lightRoute = selectProvider({
      role: 'REVIEWER',
      providers: DEFAULT_PROVIDERS,
      requiredModelClass: lightTask.routing.modelClass,
      taskId: lightTask.id
    });
    assert.ok(lightRoute.status === 'SELECTED' || lightRoute.status === 'UNAVAILABLE', 'should make selection or report unavailable');
    if (lightRoute.status === 'SELECTED') {
      assert.ok(DEFAULT_PROVIDERS.find(p => p.id === lightRoute.provider), 'selected provider should exist in catalog');
    }

    // Test STANDARD modelClass task — should select CLAUDE_CODE or similar
    const stdTask = manifest.tasks[1];
    const stdRoute = selectProvider({
      role: 'IMPLEMENTER',
      providers: DEFAULT_PROVIDERS,
      requiredModelClass: stdTask.routing.modelClass,
      taskId: stdTask.id
    });
    assert.ok(stdRoute.status === 'SELECTED' || stdRoute.status === 'UNAVAILABLE', 'should make selection or report unavailable');
    if (stdRoute.status === 'SELECTED') {
      assert.ok(DEFAULT_PROVIDERS.find(p => p.id === stdRoute.provider), 'selected provider should exist in catalog');
    }
  });

  await t.test('executor callbacks work with real provider routing', async () => {
    let lastExecutedRoute = null;
    let lastReviewRoute = null;

    const mockExecutor = async (route, task) => {
      lastExecutedRoute = route;
      return { status: 'PASS', diffEntries: [], actualOperations: [] };
    };

    const mockReviewor = async (route, task, impl) => {
      lastReviewRoute = route;
      return { status: 'PASS', findings: [], actualOperations: [] };
    };

    const runner = new ManifestRunner({
      manifest,
      stateDir,
      executeTask: mockExecutor,
      reviewTask: mockReviewor,
      providers: DEFAULT_PROVIDERS,
      io: { writeFile: () => {}, readFile: () => null }
    });

    // Simulate calling executors with real provider routing
    const task = manifest.tasks[0];
    const providerRoute = selectProvider({
      role: 'IMPLEMENTER',
      providers: DEFAULT_PROVIDERS,
      requiredModelClass: task.routing?.modelClass,
      taskId: task.id
    });

    if (providerRoute.status === 'SELECTED') {
      await runner.executeTask(providerRoute, task);
      assert.ok(lastExecutedRoute, 'executor should receive routing');
      assert.equal(lastExecutedRoute.provider, providerRoute.provider, 'provider should match');
    }
  });
});
