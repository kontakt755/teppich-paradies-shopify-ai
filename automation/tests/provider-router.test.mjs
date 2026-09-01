import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTaskRoutingDecision, providerRouteForPhase, selectProvider } from '../core/provider-router.mjs';
import { ROLE, routeTaskPolicy } from '../core/task-router.mjs';

const providers = [
  { id: 'NEMOTRON', available: true, costRank: 1, roles: [ROLE.REVIEWER] },
  { id: 'CLAUDE_CODE', available: true, costRank: 2, roles: [ROLE.IMPLEMENTER, ROLE.REVIEWER] },
  { id: 'CODEX', available: true, costRank: 2, roles: [ROLE.IMPLEMENTER, ROLE.REVIEWER] },
];

test('cheapest capable provider wins when no measured preference exists', () => {
  assert.equal(selectProvider({ role: ROLE.REVIEWER, providers, authorProvider: 'CLAUDE_CODE' }).provider, 'NEMOTRON');
});

test('independent review never routes back to the author', () => {
  const withoutNemotron = providers.filter(provider => provider.id !== 'NEMOTRON');
  assert.equal(selectProvider({ role: ROLE.REVIEWER, providers: withoutNemotron, authorProvider: 'CLAUDE_CODE' }).provider, 'CODEX');
});

test('missing independent provider fails closed without blocking unrelated work', () => {
  const result = selectProvider({ role: ROLE.REVIEWER, providers: providers.filter(provider => provider.id === 'CLAUDE_CODE'), authorProvider: 'CLAUDE_CODE' });
  assert.equal(result.status, 'UNAVAILABLE');
});

test('provider must satisfy the task model class', () => {
  const result = selectProvider({
    role: ROLE.IMPLEMENTER,
    requiredModelClass: 'STANDARD',
    providers: [
      { id: 'NVIDIA_LIGHT', available: true, modelClass: 'LIGHT', costRank: 0, roles: [ROLE.IMPLEMENTER] },
      { id: 'CLAUDE_STANDARD', available: true, modelClass: 'STANDARD', costRank: 2, roles: [ROLE.IMPLEMENTER] },
    ],
  });
  assert.equal(result.provider, 'CLAUDE_STANDARD');
});

test('task routing pins provider, model, effort and session instead of reclassifying mid-task', () => {
  const task = {
    id: 'CACHE-1', domain: 'automation', risk: 'LOW', taskType: 'IMPLEMENTATION', reviewRequired: true,
    routing: { policyVersion: 2 }, allowedFiles: ['automation/core/**'], allowedOperations: ['report_write'],
  };
  const policy = routeTaskPolicy(task);
  const initialProviders = [
    { id: 'NVIDIA_NIM', upstreamProvider: 'NVIDIA', gateway: 'DIRECT', available: true, modelClass: 'STANDARD', model: 'configured-nvidia-model', costRank: 0, roles: [ROLE.IMPLEMENTER] },
    { id: 'OPENROUTER_REVIEW', upstreamProvider: 'ANTHROPIC', gateway: 'OPENROUTER', available: true, modelClass: 'STANDARD', model: 'configured-review-model', costRank: 1, roles: [ROLE.REVIEWER] },
  ];
  const first = buildTaskRoutingDecision({ task, policy, providers: initialProviders });
  assert.equal(first.status, 'READY');
  assert.equal(providerRouteForPhase(first, 'IMPLEMENT').provider, 'NVIDIA_NIM');
  assert.equal(providerRouteForPhase(first, 'REVIEW').gateway, 'OPENROUTER');
  assert.equal(providerRouteForPhase(first, 'CORRECT').cacheSessionKey, providerRouteForPhase(first, 'IMPLEMENT').cacheSessionKey);
  assert.equal(providerRouteForPhase(first, 'IMPLEMENT').effortLevel, 'medium');

  const cheaperProviderAppears = [
    { id: 'NEW_CHEAP', available: true, modelClass: 'STANDARD', costRank: -1, roles: [ROLE.IMPLEMENTER, ROLE.REVIEWER] },
    ...initialProviders,
  ];
  const resumed = buildTaskRoutingDecision({ task, policy, providers: cheaperProviderAppears, existingDecision: first });
  assert.deepEqual(resumed, first);
});
