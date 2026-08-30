import assert from 'node:assert/strict';
import test from 'node:test';
import { loadInvariantRegistry, SpecDriftGuard } from '../core/spec-drift.mjs';

const registry = {
  invariants: [
    { id: 'CART-1', title: 'Ganze Pakete', severity: 'HARD', appliesWhen: { files: ['assets/*cart*'] }, facts: { wholePackagesRequired: true }, constraints: ['Nur ganze Pakete'] },
    { id: 'COPY-1', title: 'Copy', severity: 'REVIEW', appliesWhen: { effects: ['content'] }, facts: { tone: 'clear' } },
  ],
};
const guard = new SpecDriftGuard({ registry });

test('matching invariant supplies requirement evidence without blocking autonomy', () => {
  const result = guard.evaluate({ task: { requirementIds: ['CART-1'], allowedFiles: ['assets/cart.js'], allowedOperations: [], proposedFacts: { wholePackagesRequired: true } }, policy: { effects: [] } });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.applicable.map(item => item.id), ['CART-1']);
});

test('hard conflict and unknown requirement id fail closed', () => {
  const conflict = guard.evaluate({ task: { allowedFiles: ['assets/cart.js'], allowedOperations: [], proposedFacts: { wholePackagesRequired: false } }, policy: { effects: [] } });
  assert.equal(conflict.status, 'FAIL');
  assert.equal(conflict.conflicts[0].fact, 'wholePackagesRequired');
  const unknown = guard.evaluate({ task: { requirementIds: ['UNKNOWN'], allowedFiles: [], allowedOperations: [] }, policy: { effects: [] } });
  assert.equal(unknown.status, 'FAIL');
  assert.deepEqual(unknown.unknownRequirementIds, ['UNKNOWN']);
});

test('unmentioned facts are context, not an automatic blocker', () => {
  const result = guard.evaluate({ task: { allowedFiles: ['assets/cart.js'], allowedOperations: [] }, policy: { effects: [] } });
  assert.equal(result.status, 'PASS');
  assert.equal(result.conflicts.length, 0);
});

test('a leading wildcard selector does not match unrelated files by empty prefix', () => {
  const wildcardGuard = new SpecDriftGuard({ registry: { invariants: [{
    id: 'SHIP-1', title: 'Versand', severity: 'HARD', appliesWhen: { files: ['**/*shipping*'] }, facts: { free: true },
  }] } });
  const result = wildcardGuard.evaluate({ task: { allowedFiles: ['automation/core/runner.mjs'], allowedOperations: [] }, policy: { effects: [] } });
  assert.deepEqual(result.applicable, []);
});

test('Shopify invariant registry is valid and contains protected fallback theme', () => {
  const loaded = loadInvariantRegistry(new URL('../../domains/shopify/invariants.json', import.meta.url));
  const fallback = loaded.invariants.find(invariant => invariant.id === 'TP-FALLBACK-001');
  assert.equal(fallback.facts.fallbackThemeId, '196301750606');
  assert.equal(fallback.facts.fallbackThemeWritable, false);
});
