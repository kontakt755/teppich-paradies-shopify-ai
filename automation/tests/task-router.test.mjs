import assert from 'node:assert/strict';
import test from 'node:test';
import { ROLE, routeTaskPolicy } from '../core/task-router.mjs';

const base = { id: 'T', domain: 'shopify', taskType: 'IMPLEMENTATION', routing: { policyVersion: 2 }, dependencies: [], allowedFiles: ['automation/core/x.mjs'], allowedOperations: ['report_write'], risk: 'LOW' };

test('small LOW implementation keeps the autonomous fast path', () => {
  const policy = routeTaskPolicy(base);
  assert.equal(policy.fastPath, true);
  assert.equal(policy.autonomyLevel, 'FULL');
  assert.deepEqual(policy.roles.map(role => role.id), [ROLE.IMPLEMENTER, ROLE.DETERMINISTIC_QA]);
  assert.equal(policy.review.required, false);
});

test('MEDIUM storefront feature adds only triggered specialist roles', () => {
  const policy = routeTaskPolicy({ ...base, risk: 'MEDIUM', allowedFiles: ['sections/a.liquid', 'blocks/a.liquid', 'snippets/a.liquid', 'assets/a.css'], allowedOperations: ['multi_file_theme_edit'], requirementIds: ['TP-COMPARE-001'] });
  const roles = policy.roles.map(role => role.id);
  assert.equal(policy.fastPath, false);
  assert.ok(roles.includes(ROLE.REQUIREMENTS_CHALLENGER));
  assert.ok(roles.includes(ROLE.ARCHITECT));
  assert.ok(roles.includes(ROLE.REVIEWER));
  assert.ok(roles.includes(ROLE.VISUAL_REVIEWER));
});

test('HIGH task never receives autonomous execution', () => {
  assert.equal(routeTaskPolicy({ ...base, risk: 'HIGH' }).autonomyLevel, 'HUMAN_GATE');
});
