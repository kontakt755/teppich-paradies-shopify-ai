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
