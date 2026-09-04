import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaudeContextPack, classifyClaudeRequest, prepareClaudeBridge } from '../core/claude-bridge.mjs';

test('bridge classifies ordinary implementation as a low-risk compact handoff', async () => {
  const result = await prepareClaudeBridge({
    taskId: 'bridge 1', task: 'Repariere den kleinen CSS-Abstand im Warenkorb.', outputDir: '/tmp/claude-bridge-fixture',
    execute: async () => ({ text: 'Prüfe zuerst die bestehende CSS-Regel.', route: { model: 'fixture/model:free' }, usage: { costUsd: 0 }, attempts: [] }),
  });
  assert.equal(result.status, 'READY');
  assert.equal(result.policy.modelRequirement.class, 'LIGHT');
  assert.match(result.handoffPath, /BRIDGE-1\.md$/);
});

test('bridge keeps protected requests out of both model and Claude execution', async () => {
  let invoked = false;
  const result = await prepareClaudeBridge({ task: 'Veröffentliche das Live Theme', execute: async () => { invoked = true; } });
  assert.equal(result.status, 'HUMAN_GATE');
  assert.equal(invoked, false);
});

test('context pack contains the task and constraints but no hidden source context', () => {
  const classified = classifyClaudeRequest({ task: 'Analysiere die Navigation' });
  const content = buildClaudeContextPack({ classified, policy: { modelRequirement: { class: 'LIGHT', effortLevel: 'low' }, autonomyLevel: 'FULL' }, analysis: 'Kurzbefund' });
  assert.match(content, /Analysiere die Navigation/);
  assert.match(content, /keine Shopify-Live-Veröffentlichung/i);
});

test('design and optimization requests are implementation work, not cheap analysis', () => {
  const result = classifyClaudeRequest({ task: 'Gestalte das Mega Menu für mobile Ansicht schöner und verbessere die Titel.' });
  assert.equal(result.taskType, 'IMPLEMENTATION');
});

test('a short retry prompt without any action verb keeps a forced original task type', () => {
  const unforced = classifyClaudeRequest({ task: 'Versuch es erneut. Letztes Mal hat das Analysebudget nicht gereicht.' });
  assert.equal(unforced.taskType, 'ANALYSIS');
  const forced = classifyClaudeRequest({ task: 'Versuch es erneut. Letztes Mal hat das Analysebudget nicht gereicht.', forceTaskType: 'IMPLEMENTATION' });
  assert.equal(forced.taskType, 'IMPLEMENTATION');
});

test('an invalid or missing forceTaskType falls back to text classification', () => {
  const result = classifyClaudeRequest({ task: 'Analysiere die Navigation', forceTaskType: 'NOT_A_REAL_TYPE' });
  assert.equal(result.taskType, 'ANALYSIS');
});

test('risk can only escalate on a repeat run, never be silently downgraded', () => {
  const stillHigh = classifyClaudeRequest({ task: 'Versuch es erneut.', previousRisk: 'HIGH' });
  assert.equal(stillHigh.risk, 'HIGH');
  const staysLow = classifyClaudeRequest({ task: 'Versuch es erneut.', previousRisk: 'LOW' });
  assert.equal(staysLow.risk, 'LOW');
  const escalatesOnItsOwnText = classifyClaudeRequest({ task: 'Ändere den Preis der Kollektion.', previousRisk: null });
  assert.equal(escalatesOnItsOwnText.risk, 'HIGH');
});
