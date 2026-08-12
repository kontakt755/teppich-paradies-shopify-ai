import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareProviderHandoff, ProviderHandoffError } from '../core/provider-handoff.mjs';

test('provider handoff saves evidence, restores clean baseline, then creates isolated session', async () => {
  const calls = [];
  const result = await prepareProviderHandoff({
    taskId: 'TEST-4', fromProvider: 'CODEX', toProvider: 'CLAUDE_CODE',
    contextPack: { goal: 'fixture' }, failureSummary: { rule: 'QA_FAIL' }, diffSummary: { files: ['fixture.txt'] },
    saveArtifact: async artifact => calls.push(`save:${artifact.type}`),
    restoreCleanBaseline: async () => calls.push('restore'),
    verifyClean: async () => (calls.push('verify'), true),
    createSession: async request => (calls.push(`session:${request.provider}`), { id: 'fixture-session', keys: Object.keys(request.input).sort() }),
    now: () => new Date('2026-08-12T18:00:00Z')
  });
  assert.deepEqual(calls, ['save:TASK_STATE', 'save:FAILURE_SUMMARY', 'save:DIFF_SUMMARY', 'restore', 'verify', 'session:CLAUDE_CODE']);
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.session.keys, ['contextPack', 'evidence', 'failureSummary', 'taskId']);
});

test('unclean baseline prevents new provider session', async () => {
  let sessionCreated = false;
  await assert.rejects(() => prepareProviderHandoff({ taskId: 'X', fromProvider: 'CODEX', toProvider: 'CLAUDE_CODE', contextPack: {}, failureSummary: {}, diffSummary: {}, saveArtifact: async () => {}, restoreCleanBaseline: async () => {}, verifyClean: async () => false, createSession: async () => { sessionCreated = true; } }), ProviderHandoffError);
  assert.equal(sessionCreated, false);
});
