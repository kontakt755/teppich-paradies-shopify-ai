import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpenRouterAnthropicRequest, buildOpenRouterChatRequest, callOpenRouterAnthropic, OpenRouterGatewayError } from '../core/openrouter-gateway.mjs';

const route = {
  gateway: 'OPENROUTER', provider: 'OPENROUTER_REVIEW', model: 'anthropic/configured-review-model',
  cacheSessionKey: 'tp-task-1-review-reviewer', sticky: true,
};

test('OpenRouter request uses the fixed model and sticky task session', () => {
  const controller = new AbortController();
  const request = buildOpenRouterAnthropicRequest({
    route,
    apiKey: 'fixture-key',
    body: { model: 'must-not-win', max_tokens: 100, messages: [{ role: 'user', content: 'fixture' }] },
    signal: controller.signal,
  });
  assert.equal(request.url, 'https://openrouter.ai/api/v1/messages');
  assert.equal(request.init.headers.authorization, 'Bearer fixture-key');
  assert.equal(request.init.headers['x-session-id'], route.cacheSessionKey);
  assert.equal(request.init.signal, controller.signal);
  assert.equal(JSON.parse(request.init.body).model, route.model);
});

test('nested OpenRouter model routers and non-sticky routes fail closed', () => {
  for (const model of ['openrouter/auto', 'openrouter/free', 'openrouter/pareto-code']) {
    assert.throws(() => buildOpenRouterAnthropicRequest({ route: { ...route, model }, apiKey: 'fixture-key', body: {} }), OpenRouterGatewayError);
  }
  assert.throws(() => buildOpenRouterAnthropicRequest({ route: { ...route, sticky: false }, apiKey: 'fixture-key', body: {} }), /sticky cache key/);
  assert.throws(() => buildOpenRouterAnthropicRequest({ route, apiKey: 'fixture-key', body: {}, baseUrl: 'https://example.invalid/api' }), /official HTTPS host/);
});

test('OpenRouter chat request also pins the exact model and session', () => {
  const request = buildOpenRouterChatRequest({ route, apiKey: 'fixture-key', body: { messages: [] } });
  assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(JSON.parse(request.init.body).model, route.model);
  assert.equal(request.init.headers['x-session-id'], route.cacheSessionKey);
});

test('gateway returns the raw response for streaming callers without exposing provider error bodies', async () => {
  const expected = { ok: true, status: 200, body: 'stream' };
  const response = await callOpenRouterAnthropic({
    route,
    body: { messages: [] },
    apiKey: 'fixture-key',
    fetchImpl: async () => expected,
  });
  assert.equal(response, expected);

  await assert.rejects(() => callOpenRouterAnthropic({
    route,
    body: { messages: [] },
    apiKey: 'fixture-key',
    fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'sensitive upstream body' }),
  }), error => error instanceof OpenRouterGatewayError && error.status === 429 && !error.message.includes('sensitive'));
});
