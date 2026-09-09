import assert from 'node:assert/strict';
import test from 'node:test';
import { assessAgentRuns, diagnoseRouterRuns, REVIEW_TIMEOUT_MS, stopHookTimeout } from '../core/router-runs.mjs';

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const run = (name, files, ageMin) => ({ name, files, mtimeMs: NOW - ageMin * MIN });

test('runs are classified as reviewed, failed, running or aborted', () => {
  const result = assessAgentRuns({
    now: NOW,
    runs: [
      run('R1', ['codex-review.json'], 120),
      run('R2', ['claude-review.json'], 120),
      run('R3', ['review-error.txt'], 120),
      run('R4', [], 2),
      run('R5', [], 60),
      run('R6', ['notes.txt'], 60),
    ],
  });
  assert.deepEqual({ ...result, abortedNames: undefined }, { total: 6, reviewed: 2, failed: 1, running: 1, aborted: 1, abortedSinceRepair: 0, abortedNames: undefined });
  assert.deepEqual(result.abortedNames, ['R5']);
});

test('aborted runs after the repair count separately from historic ones', () => {
  const repairedAt = NOW - 90 * MIN;
  const result = assessAgentRuns({ now: NOW, repairedAtMs: repairedAt, runs: [run('old', [], 200), run('new', [], 30)] });
  assert.equal(result.aborted, 2);
  assert.equal(result.abortedSinceRepair, 1);
});

test('stop hook timeout defaults to 60 s when missing and must cover the review timeout', () => {
  const settings = h => ({ hooks: { Stop: [{ hooks: [h] }] } });
  const missing = stopHookTimeout(settings({ type: 'command', command: 'node x/codex-stop-review.mjs' }));
  assert.deepEqual(missing, { present: true, configured: null, effectiveSeconds: 60, sufficient: false });
  const small = stopHookTimeout(settings({ type: 'command', command: 'node x/codex-stop-review.mjs', timeout: 120 }));
  assert.equal(small.sufficient, false);
  const ok = stopHookTimeout(settings({ type: 'command', command: 'node x/codex-stop-review.mjs', timeout: REVIEW_TIMEOUT_MS / 1000 }));
  assert.equal(ok.sufficient, true);
  assert.equal(stopHookTimeout({ hooks: {} }).present, false);
});

test('historic aborts after a sufficient timeout are a note, not a problem', () => {
  const assessment = assessAgentRuns({ now: NOW, repairedAtMs: NOW - 10 * MIN, runs: [run('old', [], 300), run('ok', ['codex-review.json'], 1)] });
  const { problems, notes } = diagnoseRouterRuns({ assessment, timeout: { present: true, configured: 900, effectiveSeconds: 900, sufficient: true } });
  assert.deepEqual(problems, []);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /historische/);
});

test('a missing timeout is reported as the cause, aborts after the repair as a new problem', () => {
  const missing = diagnoseRouterRuns({ assessment: assessAgentRuns({ runs: [] }), timeout: { present: true, configured: null, effectiveSeconds: 60, sufficient: false } });
  assert.equal(missing.problems.length, 1);
  assert.match(missing.problems[0], /Default 60 s/);
  const after = diagnoseRouterRuns({
    assessment: assessAgentRuns({ now: NOW, repairedAtMs: NOW - 100 * MIN, runs: [run('x', [], 50)] }),
    timeout: { present: true, configured: 900, effectiveSeconds: 900, sufficient: true },
  });
  assert.equal(after.problems.length, 1);
  assert.match(after.problems[0], /nicht mehr das Timeout/);
});
