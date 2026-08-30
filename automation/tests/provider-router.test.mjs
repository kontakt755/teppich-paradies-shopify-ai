import assert from 'node:assert/strict';
import test from 'node:test';
import { selectProvider } from '../core/provider-router.mjs';
import { ROLE } from '../core/task-router.mjs';

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
