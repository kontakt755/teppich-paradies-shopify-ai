import assert from 'node:assert/strict';
import test from 'node:test';
import { executeOpenRouterWithFallback } from '../core/openrouter-fallback.mjs';
import { OpenRouterExecutorError } from '../core/openrouter-executor.mjs';

test('fallback uses the next exact model after an empty response failure', async () => {
  const previous = process.env.OPENROUTER_LIGHT_FALLBACK_MODELS;
  process.env.OPENROUTER_LIGHT_FALLBACK_MODELS = 'first/model:free,second/model:free';
  const calls = [];
  const result = await executeOpenRouterWithFallback({
    taskId: 'FALLBACK-1', role: 'ANALYST', modelClass: 'LIGHT', cacheSessionKey: 'tp-fallback', messages: [{ role: 'user', content: 'x' }],
    call: async ({ route }) => {
      calls.push(route.model);
      if (route.model.startsWith('first')) throw new OpenRouterExecutorError('OpenRouter returned no visible text response');
      return { json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'Fallback OK' } }], usage: { cost: 0 } }) };
    },
    recordUsage: () => '/tmp/ledger',
  });
  if (previous === undefined) delete process.env.OPENROUTER_LIGHT_FALLBACK_MODELS; else process.env.OPENROUTER_LIGHT_FALLBACK_MODELS = previous;
  assert.equal(result.text, 'Fallback OK');
  assert.deepEqual(calls, ['first/model:free', 'second/model:free']);
  assert.deepEqual(result.attempts.map(item => item.status), ['FAILED', 'PASS']);
});
