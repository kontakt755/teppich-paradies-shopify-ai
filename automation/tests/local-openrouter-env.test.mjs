import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLocalOpenRouterEnvironment } from '../core/local-openrouter-env.mjs';

test('local loader imports only unset OpenRouter exports and never evaluates shell content', () => {
  const env = { OPENROUTER_USAGE_LEDGER: 'existing' };
  const io = { existsSync: () => true, readFileSync: () => "export OPENROUTER_API_KEY='fixture-key'\nexport OPENROUTER_USAGE_LEDGER='ignored'\nexport OTHER='ignored'\n$(unsafe)\n" };
  const result = loadLocalOpenRouterEnvironment({ filePath: '/tmp/.env.local', env, io });
  assert.deepEqual(result.loaded, ['OPENROUTER_API_KEY']);
  assert.equal(env.OPENROUTER_API_KEY, 'fixture-key');
  assert.equal(env.OPENROUTER_USAGE_LEDGER, 'existing');
  assert.equal(env.OTHER, undefined);
});

test('local loader imports Gemini and shared router settings without accepting unrelated variables', () => {
  const env = {};
  const io = { existsSync: () => true, readFileSync: () => "export GEMINI_API_KEY='fixture-google'\nexport GEMINI_MODEL='gemini-fixture'\nexport AI_ROUTER_USAGE_LEDGER='.router/test.jsonl'\nexport AGENT_LOOP_CLAUDE_MAX_BUDGET_USD='1'\nexport ANTHROPIC_FALLBACK_API_KEY='fixture-claude'\nexport PATH='/unsafe'\n" };
  const result = loadLocalOpenRouterEnvironment({ filePath: '/tmp/.env.local', env, io });
  assert.deepEqual(result.loaded, ['GEMINI_API_KEY', 'GEMINI_MODEL', 'AI_ROUTER_USAGE_LEDGER', 'AGENT_LOOP_CLAUDE_MAX_BUDGET_USD', 'ANTHROPIC_FALLBACK_API_KEY']);
  assert.equal(env.PATH, undefined);
});
