import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createUsageMetrics, hashTaskText, readUsageSummary, readUsageRange } from '../usage-metrics.mjs';

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-usage-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('task hashing is deterministic and does not expose the task text', () => {
  assert.equal(hashTaskText('gleich'), hashTaskText('gleich'));
  assert.notEqual(hashTaskText('eins'), hashTaskText('zwei'));
  assert.ok(!hashTaskText('Kundin Erika Mustermann').includes('Erika'));
});

test('a script-only run records exact zero model usage without raw task text', t => {
  const root = tempRoot(t);
  const secretTask = 'Kundin Erika Mustermann mit token=supersecret123';
  const metrics = createUsageMetrics({
    root,
    task: { taskId: 'TASK-1', taskClass: 'A', taskText: secretTask },
    clock: () => new Date('2026-08-22T10:00:00.000Z'),
    nowMs: () => 100,
    makeId: () => 'run-1',
  });
  const written = metrics.finish({ outcome: { stopReason: 'DONE' } });
  assert.equal(written.written, true);
  assert.equal(written.entry.modelCalls, 0);
  assert.equal(written.entry.inputTokens, 0);
  assert.equal(written.entry.outputTokens, 0);
  assert.equal(written.entry.scriptOnly, true);
  const raw = fs.readFileSync(path.join(root, '.workflow/usage/router-2026-08-22.jsonl'), 'utf8');
  assert.ok(!raw.includes('Erika'));
  assert.ok(!raw.includes('supersecret123'));
});

test('token metrics stay null when a provider does not report structured usage', t => {
  const metrics = createUsageMetrics({
    root: tempRoot(t),
    task: { taskId: 'TASK-2', taskClass: 'B', taskText: 'Fix' },
    clock: () => new Date('2026-08-22T10:00:00.000Z'),
    nowMs: () => 100,
    makeId: () => 'run-2',
  });
  metrics.recordProviderCheck({ provider: 'CODEX', status: 'AVAILABLE' });
  metrics.recordModelCall({ role: 'CODEX_LIGHT', agentRole: 'IMPLEMENTER', result: { provider: 'CODEX', status: 'PASS', durationMs: 12 } });
  const { entry } = metrics.finish({ outcome: { stopReason: 'DONE' } });
  assert.equal(entry.modelCalls, 1);
  assert.equal(entry.inputTokens, null);
  assert.equal(entry.outputTokens, null);
  assert.equal(entry.tokenMetricsComplete, false);
  assert.deepEqual(entry.providerChecks, [{ provider: 'CODEX', status: 'AVAILABLE' }]);
});

test('structured provider usage is summed without estimating missing values', t => {
  const metrics = createUsageMetrics({
    root: tempRoot(t),
    task: { taskId: 'TASK-3', taskClass: 'C', taskText: 'Analyse' },
    clock: () => new Date('2026-08-22T10:00:00.000Z'),
    nowMs: () => 100,
    makeId: () => 'run-3',
  });
  metrics.recordModelCall({ result: { provider: 'CLAUDE_CODE', model: 'haiku', status: 'PASS', usage: {
    input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 80, cache_creation_input_tokens: 10,
  } } });
  const { entry } = metrics.finish({ outcome: { stopReason: 'DONE' } });
  assert.equal(entry.inputTokens, 120);
  assert.equal(entry.outputTokens, 30);
  assert.equal(entry.cacheReadTokens, 80);
  assert.equal(entry.cacheCreationTokens, 10);
  assert.equal(entry.tokenMetricsComplete, true);
});

test('daily summary counts zero-token and model runs without inventing token totals', t => {
  const root = tempRoot(t);
  const make = (taskId, makeId) => createUsageMetrics({
    root,
    task: { taskId, taskClass: taskId === 'SCRIPT' ? 'A' : 'B', taskText: taskId },
    clock: () => new Date('2026-08-22T10:00:00.000Z'),
    nowMs: () => 100,
    makeId: () => makeId,
  });
  make('SCRIPT', 'run-script').finish({ outcome: { stopReason: 'DONE' } });
  const model = make('MODEL', 'run-model');
  model.recordModelCall({ result: { provider: 'CODEX', status: 'PASS' } });
  model.finish({ outcome: { stopReason: 'DONE' } });
  const summary = readUsageSummary({ root, day: '2026-08-22' });
  assert.equal(summary.runs, 2);
  assert.equal(summary.scriptOnlyRuns, 1);
  assert.equal(summary.modelCalls, 1);
  assert.equal(summary.inputTokens, null);
  assert.equal(summary.tokenMetricsComplete, false);
  assert.deepEqual(summary.byProvider, { CODEX: 1 });
  assert.deepEqual(summary.byClass, { A: 1, B: 1 });
});

test('usage summary rejects path-like day values', () => {
  assert.throws(() => readUsageSummary({ root: '/tmp', day: '../../etc/passwd' }), /YYYY-MM-DD/);
});

test('usage range aggregates multiple days correctly', t => {
  const root = tempRoot(t);
  const baseDate = new Date('2026-08-25T00:00:00.000Z');

  const make = (taskId, makeId, dateOffset) => {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - dateOffset);
    return createUsageMetrics({
      root,
      task: { taskId, taskClass: 'B', taskText: taskId },
      clock: () => date,
      nowMs: () => 100,
      makeId: () => makeId,
    });
  };

  make('DAY2_1', 'run-1', 2).finish({ outcome: { stopReason: 'DONE' } });
  const m2 = make('DAY2_2', 'run-2', 2);
  m2.recordModelCall({ result: { provider: 'CODEX', status: 'PASS' } });
  m2.finish({ outcome: { stopReason: 'ERROR' } });

  make('DAY1_1', 'run-3', 1).finish({ outcome: { stopReason: 'DONE' } });
  const m4 = make('DAY1_2', 'run-4', 1);
  m4.recordModelCall({ result: { provider: 'NEMOTRON', status: 'PASS' } });
  m4.finish({ outcome: { stopReason: 'REVIEW_LIMIT' } });

  const summary = readUsageRange({ root, days: 3, today: () => baseDate });
  assert.equal(summary.runs, 4);
  assert.equal(summary.scriptOnlyRuns, 2);
  assert.equal(summary.modelCalls, 2);
  assert.equal(summary.daysWithData, 2);
  assert.equal(summary.days, 3);
  assert.deepEqual(summary.byProvider, { CODEX: 1, NEMOTRON: 1 });
  assert.deepEqual(summary.byClass, { B: 4 });
});

test('usage range tolerates missing day files', t => {
  const root = tempRoot(t);
  const baseDate = new Date('2026-08-25T00:00:00.000Z');

  const date = new Date(baseDate);
  date.setDate(date.getDate() - 1);
  const m = createUsageMetrics({
    root,
    task: { taskId: 'TASK', taskClass: 'B', taskText: 'Task' },
    clock: () => date,
    nowMs: () => 100,
    makeId: () => 'run-1',
  });
  m.recordModelCall({ result: { provider: 'CLAUDE_CODE', status: 'PASS' } });
  m.finish({ outcome: { stopReason: 'DONE' } });

  const summary = readUsageRange({ root, days: 5, today: () => baseDate });
  assert.equal(summary.daysWithData, 1);
  assert.equal(summary.runs, 1);
  assert.equal(summary.modelCalls, 1);
});

test('usage range tracks byStopReason including null for script-only runs', t => {
  const root = tempRoot(t);
  const baseDate = new Date('2026-08-25T00:00:00.000Z');

  const make = (taskId, makeId) => createUsageMetrics({
    root,
    task: { taskId, taskClass: 'A', taskText: taskId },
    clock: () => baseDate,
    nowMs: () => 100,
    makeId: () => makeId,
  });

  make('SCRIPT_ONLY', 'run-1').finish({ outcome: { stopReason: null } });

  const m2 = make('WITH_MODEL', 'run-2');
  m2.recordModelCall({ result: { provider: 'CODEX', status: 'PASS' } });
  m2.finish({ outcome: { stopReason: 'DONE' } });

  const m3 = make('WITH_MODEL_2', 'run-3');
  m3.recordModelCall({ result: { provider: 'CODEX', status: 'PASS' } });
  m3.finish({ outcome: { stopReason: 'ERROR' } });

  const summary = readUsageRange({ root, days: 1, today: () => baseDate });
  assert.deepEqual(summary.byStopReason, { 'null': 1, DONE: 1, ERROR: 1 });
});

test('usage range reworkStopReasons excludes DONE and null, sorted by count descending', t => {
  const root = tempRoot(t);
  const baseDate = new Date('2026-08-25T00:00:00.000Z');

  const make = (taskId, makeId, stopReason) => {
    const m = createUsageMetrics({
      root,
      task: { taskId, taskClass: 'B', taskText: taskId },
      clock: () => baseDate,
      nowMs: () => 100,
      makeId: () => makeId,
    });
    m.recordModelCall({ result: { provider: 'CODEX', status: 'PASS' } });
    m.finish({ outcome: { stopReason } });
    return m;
  };

  make('TASK1', 'run-1', 'REVIEW_LIMIT');
  make('TASK2', 'run-2', 'REVIEW_LIMIT');
  make('TASK3', 'run-3', 'REVIEW_LIMIT');
  make('TASK4', 'run-4', 'ERROR');
  make('TASK5', 'run-5', 'ERROR');
  make('TASK6', 'run-6', 'DONE');

  const summary = readUsageRange({ root, days: 1, today: () => baseDate });
  assert.deepEqual(summary.reworkStopReasons, [
    { stopReason: 'REVIEW_LIMIT', count: 3 },
    { stopReason: 'ERROR', count: 2 },
  ]);
});

test('usage range applies tokenMetricsComplete rule across multiple days', t => {
  const root = tempRoot(t);
  const baseDate = new Date('2026-08-25T00:00:00.000Z');

  const date1 = new Date(baseDate);
  date1.setDate(date1.getDate() - 1);
  const m1 = createUsageMetrics({
    root,
    task: { taskId: 'DAY2', taskClass: 'B', taskText: 'DAY2' },
    clock: () => date1,
    nowMs: () => 100,
    makeId: () => 'run-1',
  });
  m1.recordModelCall({ result: {
    provider: 'CLAUDE_CODE', model: 'haiku', status: 'PASS', usage: {
      input_tokens: 100, output_tokens: 50,
    },
  } });
  m1.finish({ outcome: { stopReason: 'DONE' } });

  const m2 = createUsageMetrics({
    root,
    task: { taskId: 'DAY1', taskClass: 'B', taskText: 'DAY1' },
    clock: () => baseDate,
    nowMs: () => 100,
    makeId: () => 'run-2',
  });
  m2.recordModelCall({ result: { provider: 'CODEX', status: 'PASS' } });
  m2.finish({ outcome: { stopReason: 'DONE' } });

  const summary = readUsageRange({ root, days: 2, today: () => baseDate });
  assert.equal(summary.runs, 2);
  assert.equal(summary.modelCalls, 2);
  assert.equal(summary.inputTokens, null);
  assert.equal(summary.outputTokens, null);
  assert.equal(summary.tokenMetricsComplete, false);
});
