import assert from 'node:assert/strict';
import test from 'node:test';
import { extractOpenRouterUsage, summarizeUsage } from '../core/openrouter-usage.mjs';

const route = { provider: 'OPENROUTER_REVIEW', upstreamProvider: 'ANTHROPIC', gateway: 'OPENROUTER', model: 'anthropic/fixed-model', modelClass: 'STANDARD', effortLevel: 'medium', cacheSessionKey: 'tp-task-review' };

test('OpenRouter usage records actual returned tokens and cost without estimates', () => {
  const record = extractOpenRouterUsage({ id: 'req-1', usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 80, cost: 0.0042 } }, { route, recordedAt: '2026-09-01T00:00:00.000Z' });
  assert.deepEqual(record, { version: 1, recordedAt: '2026-09-01T00:00:00.000Z', requestId: 'req-1', provider: 'OPENROUTER_REVIEW', upstreamProvider: 'ANTHROPIC', gateway: 'OPENROUTER', model: 'anthropic/fixed-model', modelClass: 'STANDARD', effortLevel: 'medium', cacheSessionKey: 'tp-task-review', inputTokens: 120, outputTokens: 30, cacheReadTokens: 80, cacheWriteTokens: 0, costUsd: 0.0042 });
});

test('summary separates known costs from providers that did not return a cost', () => {
  const summary = summarizeUsage([{ provider: 'A', model: 'm', inputTokens: 5, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 0, costUsd: 0.001 }, { provider: 'A', model: 'm', inputTokens: 7, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: null }]);
  assert.equal(summary.requests, 2);
  assert.equal(summary.inputTokens, 12);
  assert.equal(summary.knownCostUsd, 0.001);
  assert.equal(summary.unknownCostRequests, 1);
});
