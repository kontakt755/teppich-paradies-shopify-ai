import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFollowUpTask, createDashboardState, makeRun, publicRun, sanitizeTask, summarizeUsage } from '../dashboard/dashboard-core.mjs';

test('dashboard task input is bounded and non-empty', () => {
  assert.equal(sanitizeTask('  Prüfe die Karten. '), 'Prüfe die Karten.');
  assert.throws(() => sanitizeTask('   '), /Bitte beschreibe/);
  assert.throws(() => sanitizeTask('x'.repeat(8_001)), /höchstens/);
});

test('dashboard run keeps task and begins queued', () => {
  const run = makeRun('Eine sichere Prüfung', { displayTask: 'Weiter prüfen', parentRunId: 'DASH-1', issue: { number: 61, title: 'Neu', url: 'https://github.test/61', created: true } });
  assert.match(run.id, /^DASH-/);
  assert.equal(run.state, 'QUEUED');
  assert.equal(run.task, 'Eine sichere Prüfung');
  assert.equal(publicRun(run).task, 'Weiter prüfen');
  assert.equal(publicRun(run).parentRunId, 'DASH-1');
  assert.equal(publicRun(run).issue.created, true);
  assert.equal(createDashboardState().current, null);
});

test('follow-up task carries bounded previous context without exposing it as display task', () => {
  const task = buildFollowUpTask({ task: 'Prüfe Filter', message: 'Zwei Fehler gefunden', result: { summary: 'Mobil fehlerhaft' } }, 'Behebe beide Fehler');
  assert.match(task, /Prüfe Filter/);
  assert.match(task, /Mobil fehlerhaft/);
  assert.match(task, /Behebe beide Fehler/);
  assert.throws(() => buildFollowUpTask(null, 'Weiter'), /noch kein Ergebnis/);
});

test('dashboard usage totals provider records', () => {
  assert.deepEqual(summarizeUsage([{ provider: 'GOOGLE', inputTokens: 4, outputTokens: 2, costUsd: 0 }, { provider: 'OPENROUTER', inputTokens: 3, outputTokens: 1, costUsd: 0.01 }]), {
    requests: 2, inputTokens: 7, outputTokens: 3, costUsd: 0.01,
    byProvider: { GOOGLE: { requests: 1, inputTokens: 4, outputTokens: 2, costUsd: 0 }, OPENROUTER: { requests: 1, inputTokens: 3, outputTokens: 1, costUsd: 0.01 } },
  });
});

test('dashboard exposes a redacted compact result but never a provider key', () => {
  const visible = publicRun({ ...makeRun('Prüfung'), activities: [{ kind: 'Bash', message: 'Token sk-or-secret' }], result: { status: 'PASS', result: 'Erledigt sk-or-secret', findings: [{ priority: 'P2', file: 'x.liquid', problem: 'Fehler', recommendedFix: 'Fix' }] } });
  assert.equal(visible.result.status, 'PASS');
  assert.match(visible.result.summary, /\[geschützt\]/);
  assert.equal(visible.result.findings[0].file, 'x.liquid');
  assert.match(visible.activities[0].message, /\[geschützt\]/);
});
