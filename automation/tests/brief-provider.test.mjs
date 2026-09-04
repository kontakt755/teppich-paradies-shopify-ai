import assert from 'node:assert/strict';
import test from 'node:test';
import { executeBriefWithFallback } from '../core/brief-provider.mjs';

const request = { taskId: 'B-1', role: 'ANALYST', modelClass: 'LIGHT', messages: [{ role: 'user', content: 'x' }] };

test('Gemini is preferred and OpenRouter is not called in parallel', async () => {
  let openRouterCalls = 0;
  const result = await executeBriefWithFallback(request, {
    env: { GEMINI_API_KEY: 'configured', GEMINI_MODEL: 'gemini-fixture' },
    gemini: async () => ({ text: 'gemini', route: { model: 'gemini-fixture' } }),
    openRouter: async () => { openRouterCalls += 1; },
  });
  assert.equal(result.text, 'gemini');
  assert.equal(openRouterCalls, 0);
  assert.equal(result.attempts[0].provider, 'GEMINI');
});

test('OpenRouter is used only after Gemini fails', async () => {
  const calls = [];
  const result = await executeBriefWithFallback(request, {
    env: { GEMINI_API_KEY: 'configured', OPENROUTER_API_KEY: 'configured' },
    gemini: async () => { calls.push('gemini'); throw new Error('quota'); },
    openRouter: async () => { calls.push('openrouter'); return { text: 'fallback', route: { model: 'free/model' }, attempts: [{ model: 'free/model', status: 'PASS' }] }; },
  });
  assert.equal(result.text, 'fallback');
  assert.deepEqual(calls, ['gemini', 'openrouter']);
  assert.deepEqual(result.attempts.map(item => item.status), ['FAILED', 'PASS']);
});

test('missing Gemini key skips directly to configured OpenRouter', async () => {
  const result = await executeBriefWithFallback(request, {
    env: { OPENROUTER_API_KEY: 'configured' },
    gemini: async () => { throw new Error('must not run'); },
    openRouter: async () => ({ text: 'openrouter', route: { model: 'free/model' }, attempts: [] }),
  });
  assert.equal(result.text, 'openrouter');
  assert.equal(result.attempts[0].status, 'SKIPPED_NO_KEY');
});
