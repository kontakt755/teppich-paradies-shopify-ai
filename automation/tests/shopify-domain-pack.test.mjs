import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createShopifyDomainPack } from '../../domains/shopify/domain-pack.mjs';
import { ManifestRunner } from '../core/runner.mjs';

test('Shopify domain pack wires risk, diff and spec guards for the runner', () => {
  const pack = createShopifyDomainPack();
  assert.equal(pack.domain, 'shopify');
  assert.equal(pack.riskGuard.map.domain, 'shopify');
  assert.equal(pack.diffBudgetGuard.riskGuard, pack.riskGuard);
  const result = pack.specGuard.evaluate({
    task: { requirementIds: ['TP-CART-001'], allowedFiles: ['assets/cart.js'], allowedOperations: [], proposedFacts: { wholePackagesRequired: true } },
    policy: { effects: ['commerce'] },
  });
  assert.equal(result.status, 'PASS');
});

test('Shopify policy v2 pilot completes autonomously with the real domain guards', async t => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-domain-pack-'));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const pack = createShopifyDomainPack();
  const manifest = { runId: 'shopify-pack-pilot', tasks: [{
    id: 'SHP-PILOT', domain: 'shopify', risk: 'LOW', taskType: 'IMPLEMENTATION', routing: { policyVersion: 2 },
    dependencies: [], allowedFiles: ['qa/**'], allowedOperations: ['test_write'], maxFiles: 1, maxChangedLines: 20,
    requirementIds: ['TP-CART-001'], proposedFacts: { wholePackagesRequired: true },
  }] };
  const result = await new ManifestRunner({
    manifest, stateDir, riskGuard: pack.riskGuard, diffBudgetGuard: pack.diffBudgetGuard, specGuard: pack.specGuard,
    executeTask: async () => ({
      status: 'PASS', diffEntries: [{ file: 'qa/pilot.test.mjs', added: 4, deleted: 0 }], resources: [], actualOperations: ['test_write'],
      tests: [{ id: 'pilot', status: 'PASS' }],
    }),
  }).run();
  assert.equal(result.tasks['SHP-PILOT'].status, 'PASS');
  assert.equal(result.tasks['SHP-PILOT'].qualityGates.records.requirements.source, 'spec-drift-guard');
});
