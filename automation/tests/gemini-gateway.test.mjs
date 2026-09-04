import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGeminiRequest, GeminiGatewayError } from '../core/gemini-gateway.mjs';

test('Gemini request keeps the API key out of URL and body', () => {
  const request = buildGeminiRequest({ model: 'gemini-3.5-flash-lite', apiKey: 'fixture-secret', body: { contents: [] } });
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.equal(request.init.headers['x-goog-api-key'], 'fixture-secret');
  assert.doesNotMatch(request.url, /fixture-secret/);
  assert.doesNotMatch(request.init.body, /fixture-secret/);
});

test('Gemini gateway rejects alternate hosts and invalid model paths', () => {
  assert.throws(() => buildGeminiRequest({ model: 'x', apiKey: 'k', body: {}, baseUrl: 'https://example.com/v1beta' }), GeminiGatewayError);
  assert.throws(() => buildGeminiRequest({ model: '../secret', apiKey: 'k', body: {} }), GeminiGatewayError);
});
