import assert from 'node:assert/strict';
import test from 'node:test';
import { executeOpenRouterTask, normalizeOpenRouterUsage, OpenRouterExecutorError } from '../core/openrouter-executor.mjs';

const route = { provider: 'OPENROUTER_LIGHT', upstreamProvider: 'OPENROUTER', gateway: 'OPENROUTER', model: 'liquid/fixture:free', cacheSessionKey: 'tp-fixture-worker', sticky: true };

test('executor bounds output, returns text, and records actual reported usage without prompt content', async () => {
  let received;
  let record;
  const times = [new Date('2026-09-03T08:00:00.000Z'), new Date('2026-09-03T08:00:00.250Z')];
  const result = await executeOpenRouterTask({
    taskId: 'ROUTE-1', role: 'IMPLEMENTER', route, messages: [{ role: 'user', content: 'secret prompt must not be logged' }], maxTokens: 32,
    now: () => times.shift(),
    call: async input => {
      received = input;
      return { json: async () => ({ content: [{ type: 'text', text: 'Erledigt.' }], stop_reason: 'end_turn', usage: { input_tokens: 11, output_tokens: 7, cost: 0 } }) };
    },
    recordUsage: value => { record = value; return '/tmp/usage.jsonl'; },
  });
  assert.equal(received.body.max_tokens, 32);
  assert.deepEqual(received.body.reasoning, { enabled: false, exclude: true });
  assert.equal(result.text, 'Erledigt.');
  assert.deepEqual(result.usage, { inputTokens: 11, outputTokens: 7, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0 });
  assert.equal(record.durationMs, 250);
  assert.deepEqual(record.responseContentTypes, ['text']);
  assert.equal(JSON.stringify(record).includes('secret prompt'), false);
});

test('executor fails before a request for invalid token limits', async () => {
  await assert.rejects(() => executeOpenRouterTask({ taskId: 'ROUTE-2', role: 'IMPLEMENTER', route, messages: [{ role: 'user', content: 'x' }], maxTokens: 15, call: async () => { throw new Error('must not call'); } }), OpenRouterExecutorError);
});

test('chat protocol normalizes an OpenRouter chat completion into visible text and usage', async () => {
  const result = await executeOpenRouterTask({
    taskId: 'ROUTE-CHAT', role: 'ANALYST', route, protocol: 'CHAT', messages: [{ role: 'user', content: 'x' }], maxTokens: 32,
    call: async ({ body }) => {
      assert.equal(body.messages[0].role, 'user');
      return { json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'Chat OK' } }], usage: { prompt_tokens: 4, completion_tokens: 2, cost: 0 } }) };
    }, recordUsage: () => '/tmp/usage.jsonl',
  });
  assert.equal(result.text, 'Chat OK');
  assert.equal(result.usage.inputTokens, 4);
});

test('executor logs but rejects an answer without visible text', async () => {
  let record;
  await assert.rejects(() => executeOpenRouterTask({
    taskId: 'ROUTE-3', role: 'IMPLEMENTER', route, messages: [{ role: 'user', content: 'x' }], maxTokens: 16,
    call: async () => ({ json: async () => ({ content: [{ type: 'thinking', thinking: 'hidden' }], usage: { cost: 0 } }) }),
    recordUsage: value => { record = value; return '/tmp/usage.jsonl'; },
  }), /no visible text/);
  assert.equal(record.usage.costUsd, 0);
});

test('usage normalization accepts only finite provider values', () => {
  assert.deepEqual(normalizeOpenRouterUsage({ input_tokens: 3, output_tokens: Number.NaN, cost: '0' }), { inputTokens: 3, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: null });
});
