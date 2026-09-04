import assert from 'node:assert/strict';
import test from 'node:test';
import { executeGeminiTask } from '../core/gemini-executor.mjs';

test('Gemini executor normalizes text and exact token usage', async () => {
  let recorded;
  const result = await executeGeminiTask({
    taskId: 'G-1', role: 'ANALYST', system: 'Kurz', messages: [{ role: 'user', content: 'Auftrag' }], apiKey: 'fixture',
    call: async ({ model, body }) => {
      assert.equal(model, 'gemini-3.5-flash-lite');
      assert.equal(body.generationConfig.maxOutputTokens, 256);
      return { json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Plan' }] } }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, thoughtsTokenCount: 2 } }) };
    },
    recordUsage: record => { recorded = record; return '/tmp/ledger'; },
  });
  assert.equal(result.text, 'Plan');
  assert.equal(result.usage.inputTokens, 12);
  assert.equal(result.usage.outputTokens, 4);
  assert.equal(result.usage.reasoningTokens, 2);
  assert.equal(recorded.upstreamProvider, 'GOOGLE');
  assert.equal(recorded.usage.costUsd, 0);
});
