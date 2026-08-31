import assert from 'node:assert/strict';
import test from 'node:test';
import { validateManifest } from '../core/manifest.mjs';

const task = {
  id: 'V2', domain: 'shopify', risk: 'LOW', dependencies: [], allowedFiles: ['qa/**'], allowedOperations: ['report_write'],
};

test('optional autonomy policy fields remain backward compatible', () => {
  const manifest = validateManifest({ runId: 'manifest-v2', tasks: [{
    ...task, taskType: 'implementation', routing: { policyVersion: 2, modelClass: 'LIGHT', effortLevel: 'low', preferredProviders: ['NVIDIA_NIM'] }, effects: ['ui'],
    requirementIds: ['TP-CART-001'], acceptanceCriteria: ['cart passes'], qaCommands: ['npm test'], proposedFacts: { wholePackagesRequired: true },
  }] });
  assert.equal(manifest.tasks[0].routing.policyVersion, 2);
  assert.equal(manifest.tasks[0].routing.modelClass, 'LIGHT');
});

test('malformed optional autonomy policy fields fail closed', () => {
  assert.throws(() => validateManifest({ runId: 'bad-v2', tasks: [{ ...task, routing: { policyVersion: 0 } }] }), /policyVersion/);
  assert.throws(() => validateManifest({ runId: 'bad-model-class', tasks: [{ ...task, routing: { modelClass: 'FREE' } }] }), /modelClass/);
  assert.throws(() => validateManifest({ runId: 'bad-effort', tasks: [{ ...task, routing: { effortLevel: 'maximum' } }] }), /effortLevel/);
  assert.throws(() => validateManifest({ runId: 'bad-provider-list', tasks: [{ ...task, routing: { preferredProviders: 'NVIDIA_NIM' } }] }), /preferredProviders/);
  assert.throws(() => validateManifest({ runId: 'bad-facts', tasks: [{ ...task, proposedFacts: [] }] }), /proposedFacts/);
});
