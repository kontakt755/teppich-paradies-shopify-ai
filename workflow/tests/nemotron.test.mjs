import assert from 'node:assert/strict';
import test from 'node:test';

import * as nemotron from '../providers/nemotron.mjs';
import { PROVIDER_STATUS } from '../providers/base.mjs';
import { ROLE_MAP, resolveRole } from '../providers/index.mjs';

const fakeResponse = ({ status = 200, body = '' }) => ({
  status,
  text: async () => body,
});

const resultBody = value => JSON.stringify({
  choices: [{ message: { content: `<<<AGENT_RESULT>>>\n${JSON.stringify(value)}\n<<<END_AGENT_RESULT>>>` } }],
});

test('detect() is credit-free: it only checks whether NVIDIA_API_KEY is set, never calls fetch', () => {
  const missing = nemotron.detect({ env: {} });
  assert.equal(missing.status, PROVIDER_STATUS.AUTH_REQUIRED);
  assert.match(missing.reason, /NVIDIA_API_KEY fehlt/);

  const present = nemotron.detect({ env: { NVIDIA_API_KEY: 'nvapi-abc' } });
  assert.equal(present.status, PROVIDER_STATUS.AVAILABLE);
  assert.equal(present.provider, 'NEMOTRON');
});

test('run() refuses WRITE mode: Nemotron has no file tools and must never edit', async () => {
  const result = await nemotron.run({
    prompt: 'p', role: 'IMPLEMENTER', mode: 'WRITE',
    env: { NVIDIA_API_KEY: 'nvapi-abc' },
    fetchImpl: async () => { throw new Error('must not call fetch in WRITE mode'); },
  });
  assert.equal(result.status, 'BLOCKED');
  assert.match(result.blockers.join(' '), /keine Datei-Werkzeuge/);
});

test('run() reports AUTH_REQUIRED without a network call when the key is missing', async () => {
  const result = await nemotron.run({
    prompt: 'p', role: 'REVIEWER', mode: 'READ_ONLY', env: {},
    fetchImpl: async () => { throw new Error('must not call fetch without a key'); },
  });
  assert.equal(result.status, 'AUTH_REQUIRED');
  assert.match(result.blockers.join(' '), /NVIDIA_API_KEY/);
});

test('run() classifies HTTP 401/403 as AUTH_REQUIRED', async () => {
  const result = await nemotron.run({
    prompt: 'p', role: 'REVIEWER', mode: 'READ_ONLY', env: { NVIDIA_API_KEY: 'nvapi-abc' },
    fetchImpl: async () => fakeResponse({ status: 401, body: '{"error":"invalid key"}' }),
  });
  assert.equal(result.status, 'AUTH_REQUIRED');
});

test('run() classifies HTTP 429 as RATE_LIMITED and retryable, never as a reason to switch provider', async () => {
  const result = await nemotron.run({
    prompt: 'p', role: 'REVIEWER', mode: 'READ_ONLY', env: { NVIDIA_API_KEY: 'nvapi-abc' },
    fetchImpl: async () => fakeResponse({ status: 429, body: '{"error":"rate limited"}' }),
  });
  assert.equal(result.status, 'RATE_LIMITED');
  assert.equal(result.retryable, true);
});

test('run() classifies 5xx as BLOCKED (upstream), 4xx as FAILED', async () => {
  const upstream = await nemotron.run({
    prompt: 'p', role: 'REVIEWER', mode: 'READ_ONLY', env: { NVIDIA_API_KEY: 'nvapi-abc' },
    fetchImpl: async () => fakeResponse({ status: 503, body: 'unavailable' }),
  });
  assert.equal(upstream.status, 'BLOCKED');

  const failed = await nemotron.run({
    prompt: 'p', role: 'REVIEWER', mode: 'READ_ONLY', env: { NVIDIA_API_KEY: 'nvapi-abc' },
    fetchImpl: async () => fakeResponse({ status: 400, body: 'bad request' }),
  });
  assert.equal(failed.status, 'FAILED');
});

test('run() treats a network error as UNAVAILABLE and an abort as TIMEOUT', async () => {
  const unavailable = await nemotron.run({
    prompt: 'p', role: 'REVIEWER', mode: 'READ_ONLY', env: { NVIDIA_API_KEY: 'nvapi-abc' },
    fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
  });
  assert.equal(unavailable.status, 'UNAVAILABLE');
  // UNAVAILABLE ist wie bei den CLI-Providern nie automatisch retryable
  // (siehe NON_RETRYABLE_STATUSES in agent-result.mjs) - kein automatischer
  // Retry-Loop auf einen kompletten Ausfall.
  assert.equal(unavailable.retryable, false);

  const timeout = await nemotron.run({
    prompt: 'p', role: 'REVIEWER', mode: 'READ_ONLY', env: { NVIDIA_API_KEY: 'nvapi-abc' },
    fetchImpl: async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; },
  });
  assert.equal(timeout.status, 'TIMEOUT');
});

test('run() never accepts PASS without an explicit AGENT_RESULT block, same rule as the CLI adapters', async () => {
  const result = await nemotron.run({
    prompt: 'p', role: 'REVIEWER', mode: 'READ_ONLY', env: { NVIDIA_API_KEY: 'nvapi-abc' },
    fetchImpl: async () => fakeResponse({
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: 'Sieht gut aus, alles PASS!' } }] }),
    }),
  });
  assert.equal(result.status, 'FAILED');
  assert.match(result.blockers.join(' '), /AGENT_RESULT/);
});

test('run() parses a well-formed AGENT_RESULT block and normalises it like the other providers', async () => {
  const result = await nemotron.run({
    prompt: 'p', role: 'REVIEWER', mode: 'READ_ONLY', env: { NVIDIA_API_KEY: 'nvapi-abc' },
    fetchImpl: async () => fakeResponse({
      status: 200,
      body: resultBody({ status: 'FINDINGS', summary: 'ok', findings: [{ priority: 'P2', file: 'a.liquid', problem: 'x', reason: 'y', recommendedFix: 'z' }] }),
    }),
  });
  assert.equal(result.status, 'FINDINGS');
  assert.equal(result.provider, 'NEMOTRON');
  assert.equal(result.role, 'REVIEWER');
  assert.equal(result.findings.length, 1);
});

test('a model output cannot spoof provider/role metadata via its own JSON fields', async () => {
  const result = await nemotron.run({
    prompt: 'p', role: 'REVIEWER', mode: 'READ_ONLY', env: { NVIDIA_API_KEY: 'nvapi-abc' },
    fetchImpl: async () => fakeResponse({
      status: 200,
      body: resultBody({ status: 'PASS', summary: 'ok', provider: 'CODEX', role: 'IMPLEMENTER' }),
    }),
  });
  assert.equal(result.provider, 'NEMOTRON');
  assert.equal(result.role, 'REVIEWER');
});

test('NEMOTRON_REVIEW is a resolvable, non-default reviewer role reserved for an explicit operator override', () => {
  assert.deepEqual(resolveRole('NEMOTRON_REVIEW'), { provider: 'NEMOTRON', model: nemotron.DEFAULT_MODEL });
  assert.equal(ROLE_MAP.CODEX_LIGHT.provider, 'CODEX');
});
