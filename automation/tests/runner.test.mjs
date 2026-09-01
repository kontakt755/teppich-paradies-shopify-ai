import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ManifestRunner, MissingPostflightDataError, RunnerStoppedError } from '../core/runner.mjs';
import { RunLock, RunLockedError } from '../core/run-lock.mjs';
import { atomicWriteJson } from '../core/state-store.mjs';
import { SpecDriftGuard } from '../core/spec-drift.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../fixtures/manifest-basic.json', import.meta.url), 'utf8'));
const temporary = testContext => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-runner-'));
  testContext.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('normal LOW and MEDIUM tasks run in dependency order; HIGH becomes NEEDS_AHMET', async t => {
  const stateDir = temporary(t); const calls = [];
  const result = await new ManifestRunner({ manifest, stateDir, executeTask: async task => { calls.push(task.id); return { status: 'PASS' }; } }).run();
  assert.deepEqual(calls, ['LOW-1', 'MEDIUM-1']);
  assert.equal(result.tasks['LOW-1'].status, 'PASS');
  assert.equal(result.tasks['MEDIUM-1'].status, 'PASS');
  assert.equal(result.tasks['HIGH-1'].status, 'NEEDS_AHMET');
});

test('failed dependency is skipped and PARKED task is never restarted', async t => {
  const stateDir = temporary(t); const calls = [];
  fs.mkdirSync(path.join(stateDir, 'tasks'), { recursive: true });
  atomicWriteJson(path.join(stateDir, 'tasks', 'LOW-1.json'), { taskId: 'LOW-1', status: 'PARKED', attempts: 2 });
  const result = await new ManifestRunner({ manifest, stateDir, executeTask: async task => { calls.push(task.id); return { status: 'PASS' }; } }).run();
  assert.deepEqual(calls, []);
  assert.equal(result.tasks['LOW-1'].status, 'PARKED');
  assert.equal(result.tasks['MEDIUM-1'].status, 'SKIPPED_DEPENDENCY');
});

test('manifest with a missing dependency is rejected before execution', t => {
  const stateDir = temporary(t);
  const invalid = structuredClone(manifest);
  invalid.tasks[0].dependencies = ['DOES-NOT-EXIST'];
  assert.throws(() => new ManifestRunner({ manifest: invalid, stateDir }), /missing dependency/);
});

test('resume converts interrupted RUNNING to pending, runs it once, and preserves PASS', async t => {
  const stateDir = temporary(t); const calls = [];
  fs.mkdirSync(path.join(stateDir, 'tasks'), { recursive: true });
  atomicWriteJson(path.join(stateDir, 'tasks', 'LOW-1.json'), { taskId: 'LOW-1', status: 'RUNNING', attempts: 1 });
  atomicWriteJson(path.join(stateDir, 'tasks', 'MEDIUM-1.json'), { taskId: 'MEDIUM-1', status: 'PASS', attempts: 1 });
  const result = await new ManifestRunner({ manifest, stateDir, executeTask: async task => { calls.push(task.id); return { status: 'PASS' }; } }).run();
  assert.deepEqual(calls, ['LOW-1']);
  assert.equal(result.tasks['LOW-1'].attempts, 2);
  assert.equal(result.tasks['MEDIUM-1'].attempts, 1);
});

test('lock prevents a second runner', t => {
  const stateDir = temporary(t); const lockPath = path.join(stateDir, 'run.lock');
  const first = new RunLock({ lockPath }); const second = new RunLock({ lockPath });
  first.acquire('one');
  assert.throws(() => second.acquire('two'), RunLockedError);
  first.release();
});

test('state or heartbeat write failure stops the run', async t => {
  const stateDir = temporary(t);
  const failingIo = new Proxy(fs, { get(target, property) {
    if (property === 'renameSync') return () => { const error = new Error('fixture write failure'); error.code = 'EACCES'; throw error; };
    return Reflect.get(target, property);
  }});
  const runner = new ManifestRunner({ manifest, stateDir, io: failingIo });
  await assert.rejects(() => runner.run(), RunnerStoppedError);
});

test('completed roadmap block is detected and completed tasks are not rerun', async t => {
  const stateDir = temporary(t); let calls = 0;
  const runner = new ManifestRunner({ manifest, stateDir, executeTask: async () => { calls++; return { status: 'PASS' }; } });
  const first = await runner.run(); const second = await runner.run();
  assert.equal(first.runState.roadMapBlockComplete, true);
  assert.equal(second.runState.roadMapBlockComplete, true);
  assert.equal(calls, 2);
});

test('runner persists review limit and does not mark roadmap complete', async t => {
  const stateDir = temporary(t);
  let reviews = 0;
  let corrections = 0;
  const finding = { priority: 'P1', file: 'qa/a.mjs', problem: 'Problem', reason: 'Grund', recommendedFix: 'Fix' };
  const result = await new ManifestRunner({
    manifest,
    stateDir,
    maxReviewRounds: 2,
    executeTask: async () => ({ status: 'PASS' }),
    reviewTask: async () => { reviews += 1; return { findings: [finding] }; },
    correctTask: async () => { corrections += 1; return { status: 'PASS' }; },
  }).run();
  assert.equal(result.tasks['LOW-1'].status, 'REVIEW_LIMIT_REACHED');
  assert.equal(result.tasks['LOW-1'].reviewRound, 2);
  assert.equal(result.tasks['MEDIUM-1'].status, 'SKIPPED_DEPENDENCY');
  assert.equal(result.runState.roadMapBlockComplete, false);
  assert.equal(reviews, 2);
  assert.equal(corrections, 1);
});

test('runner fails closed when a correction omits final postflight evidence', async t => {
  const stateDir = temporary(t); let reviews = 0; let guardCalls = 0;
  const finding = { priority: 'P1', file: 'qa/a.mjs', problem: 'Problem', reason: 'Grund', recommendedFix: 'Fix' };
  const runner = new ManifestRunner({
    manifest, stateDir, diffBudgetGuard: { evaluate: () => { guardCalls += 1; } },
    executeTask: async () => ({ status: 'PASS', diffEntries: [{ file: 'fixture/a.mjs', added: 1, deleted: 0 }], resources: ['storefront'], actualOperations: ['report_write'] }),
    reviewTask: async () => ({ findings: ++reviews === 1 ? [finding] : [] }),
    correctTask: async () => ({ status: 'PASS' }),
  });
  await assert.rejects(() => runner.run(), MissingPostflightDataError);
  assert.equal(guardCalls, 1);
});

test('runner uses replacement post-correction postflight data', async t => {
  const stateDir = temporary(t); const calls = []; let reviews = 0;
  const finding = { priority: 'P1', file: 'qa/a.mjs', problem: 'Problem', reason: 'Grund', recommendedFix: 'Fix' };
  await new ManifestRunner({
    manifest, stateDir, diffBudgetGuard: { evaluate: input => calls.push(input) },
    executeTask: async () => ({ status: 'PASS', diffEntries: [{ file: 'fixture/old.mjs', added: 1, deleted: 0 }], resources: ['old'], actualOperations: ['report_write'] }),
    reviewTask: async () => ({ findings: ++reviews === 1 ? [finding] : [] }),
    correctTask: async () => ({ status: 'PASS', diffEntries: [{ file: 'fixture/new.mjs', added: 2, deleted: 0 }], resources: ['new'], actualOperations: ['report_write'] }),
  }).run();
  const lowTaskCalls = calls.filter(call => call.task.id === 'LOW-1');
  assert.deepEqual(lowTaskCalls.map(call => call.entries), [
    [{ file: 'fixture/old.mjs', added: 1, deleted: 0 }],
    [{ file: 'fixture/new.mjs', added: 2, deleted: 0 }],
  ]);
  assert.deepEqual(lowTaskCalls.at(-1).resources, ['new']);
  assert.deepEqual(lowTaskCalls.at(-1).actualOperations, ['report_write']);
});

test('runner uses only the final correction evidence after multiple review rounds', async t => {
  const stateDir = temporary(t); const calls = []; let reviews = 0; let corrections = 0;
  const finding = { priority: 'P1', file: 'qa/a.mjs', problem: 'Problem', reason: 'Grund', recommendedFix: 'Fix' };
  await new ManifestRunner({
    manifest, stateDir, diffBudgetGuard: { evaluate: input => calls.push(input) },
    executeTask: async () => ({ status: 'PASS', diffEntries: [{ file: 'fixture/implement.mjs', added: 1, deleted: 0 }], resources: ['implement'], actualOperations: ['report_write'] }),
    reviewTask: async () => ({ findings: ++reviews < 3 ? [finding] : [] }),
    correctTask: async () => ({ status: 'PASS', diffEntries: [{ file: `fixture/correct-${++corrections}.mjs`, added: corrections, deleted: 0 }], resources: [`correct-${corrections}`], actualOperations: ['report_write'] }),
  }).run();
  assert.equal(corrections, 2);
  const lowTaskCalls = calls.filter(call => call.task.id === 'LOW-1');
  assert.deepEqual(lowTaskCalls.map(call => call.entries[0].file), ['fixture/implement.mjs', 'fixture/correct-1.mjs', 'fixture/correct-2.mjs']);
  assert.deepEqual(lowTaskCalls.at(-1).resources, ['correct-2']);
});

test('runner fails closed when a postflight guard lacks required evidence', async t => {
  const stateDir = temporary(t);
  const runner = new ManifestRunner({ manifest, stateDir, diffBudgetGuard: { evaluate: () => assert.fail('guard must not run') }, executeTask: async () => ({ status: 'PASS' }) });
  await assert.rejects(() => runner.run(), MissingPostflightDataError);
});

test('runner accepts implementation evidence when no correction ran', async t => {
  const stateDir = temporary(t); const calls = [];
  await new ManifestRunner({
    manifest, stateDir, diffBudgetGuard: { evaluate: input => calls.push(input) },
    executeTask: async () => ({ status: 'PASS', diffEntries: [{ file: 'fixture/a.mjs', added: 1, deleted: 0 }], resources: ['storefront'] }),
  }).run();
  assert.deepEqual(calls[0].entries, [{ file: 'fixture/a.mjs', added: 1, deleted: 0 }]);
  assert.deepEqual(calls[0].resources, ['storefront']);
  assert.deepEqual(calls[0].actualOperations, manifest.tasks[0].allowedOperations);
});

test('policy v2 LOW fast path skips an available model reviewer', async t => {
  const stateDir = temporary(t); let reviewCalls = 0;
  const v2Manifest = { runId: 'v2-low', tasks: [{
    id: 'LOW-V2', domain: 'automation', risk: 'LOW', taskType: 'IMPLEMENTATION', routing: { policyVersion: 2 },
    dependencies: [], allowedFiles: ['automation/core/**'], allowedOperations: ['report_write'],
  }] };
  const result = await new ManifestRunner({
    manifest: v2Manifest,
    stateDir,
    diffBudgetGuard: { evaluate: () => ({ status: 'PASS', changedLines: 5 }) },
    executeTask: async () => ({
      status: 'PASS', diffEntries: [{ file: 'automation/core/example.mjs', added: 5, deleted: 0 }],
      resources: ['router'], tests: [{ id: 'unit', status: 'PASS' }],
    }),
    reviewTask: async () => { reviewCalls += 1; return { findings: [] }; },
  }).run();
  assert.equal(result.tasks['LOW-V2'].status, 'PASS');
  assert.equal(result.tasks['LOW-V2'].routingPolicy.fastPath, true);
  assert.equal(result.tasks['LOW-V2'].qualityGates.releaseReady, true);
  assert.equal(reviewCalls, 0);
});

test('policy v2 blocks completion when triggered visual evidence is missing', async t => {
  const stateDir = temporary(t);
  const v2Manifest = { runId: 'v2-ui', tasks: [{
    id: 'UI-V2', domain: 'shopify', risk: 'MEDIUM', taskType: 'IMPLEMENTATION', routing: { policyVersion: 2 },
    dependencies: [], allowedFiles: ['sections/example.liquid'], allowedOperations: ['multi_file_theme_edit'],
  }] };
  const result = await new ManifestRunner({
    manifest: v2Manifest,
    stateDir,
    diffBudgetGuard: { evaluate: () => ({ status: 'PASS', changedLines: 15 }) },
    executeTask: async () => ({
      status: 'PASS', changedFiles: ['sections/example.liquid'], diffEntries: [{ file: 'sections/example.liquid', added: 15, deleted: 0 }],
      resources: ['draft-theme'], tests: [{ id: 'theme-check', status: 'PASS' }], gateEvidence: { architecture: { status: 'PASS', evidence: 'bounded change' } },
    }),
    reviewTask: async () => ({ findings: [] }),
  }).run();
  assert.equal(result.tasks['UI-V2'].status, 'BLOCKED');
  assert.ok(result.tasks['UI-V2'].qualityGates.blocking.some(gate => gate.id === 'visualQa'));
});

test('policy v2 stops a conflicting shop fact before model execution', async t => {
  const stateDir = temporary(t); let executeCalls = 0;
  const v2Manifest = { runId: 'v2-spec', tasks: [{
    id: 'SPEC-V2', domain: 'shopify', risk: 'LOW', taskType: 'IMPLEMENTATION', routing: { policyVersion: 2 },
    dependencies: [], allowedFiles: ['assets/cart.js'], allowedOperations: ['report_write'],
    requirementIds: ['CART-1'], proposedFacts: { wholePackagesRequired: false },
  }] };
  const specGuard = new SpecDriftGuard({ registry: { invariants: [{
    id: 'CART-1', title: 'Ganze Pakete', severity: 'HARD', appliesWhen: { files: ['assets/*cart*'] }, facts: { wholePackagesRequired: true },
  }] } });
  const result = await new ManifestRunner({
    manifest: v2Manifest, stateDir, specGuard,
    executeTask: async () => { executeCalls += 1; return { status: 'PASS' }; },
  }).run();
  assert.equal(result.tasks['SPEC-V2'].status, 'BLOCKED');
  assert.equal(result.tasks['SPEC-V2'].specCheck.conflicts[0].fact, 'wholePackagesRequired');
  assert.equal(executeCalls, 0);
});

test('provider timeout parks one task while independent work continues', async t => {
  const stateDir = temporary(t);
  const timeoutManifest = { runId: 'provider-timeout', tasks: [
    { id: 'HANG', domain: 'fixture', risk: 'LOW', dependencies: [], allowedFiles: ['fixture/**'], allowedOperations: ['report_write'] },
    { id: 'CONTINUE', domain: 'fixture', risk: 'LOW', dependencies: [], allowedFiles: ['fixture/**'], allowedOperations: ['report_write'] },
  ] };
  const result = await new ManifestRunner({
    manifest: timeoutManifest, stateDir, providerTimeoutMs: 10,
    executeTask: async (task, { signal }) => task.id === 'HANG'
      ? new Promise(() => signal.addEventListener('abort', () => {}))
      : { status: 'PASS' },
  }).run();
  assert.equal(result.tasks.HANG.status, 'PARKED');
  assert.equal(result.tasks.CONTINUE.status, 'PASS');
});

test('runner persists one cache-stable route and passes it to implement, review and correction', async t => {
  const stateDir = temporary(t);
  const routingManifest = { runId: 'sticky-provider-route', tasks: [{
    id: 'STICKY', domain: 'automation', risk: 'LOW', taskType: 'IMPLEMENTATION', reviewRequired: true,
    routing: { policyVersion: 2 }, dependencies: [], allowedFiles: ['automation/core/**'], allowedOperations: ['report_write'],
  }] };
  const providers = [
    { id: 'NVIDIA_NIM', upstreamProvider: 'NVIDIA', gateway: 'DIRECT', available: true, modelClass: 'STANDARD', model: 'configured-nvidia-model', costRank: 0, roles: ['IMPLEMENTER'] },
    { id: 'OPENROUTER_REVIEW', upstreamProvider: 'ANTHROPIC', gateway: 'OPENROUTER', available: true, modelClass: 'STANDARD', model: 'configured-review-model', costRank: 1, roles: ['REVIEWER'] },
  ];
  let implementRoute;
  let correctionRoute;
  const reviewRoutes = [];
  let reviews = 0;
  const finding = { priority: 'P1', file: 'automation/core/example.mjs', problem: 'Problem', reason: 'Grund', recommendedFix: 'Fix' };
  const candidate = version => ({
    status: 'PASS', result: version, diffEntries: [{ file: 'automation/core/example.mjs', added: 2, deleted: 0 }],
    resources: ['router'], actualOperations: ['report_write'], tests: [{ id: 'unit', status: 'PASS' }],
  });
  const result = await new ManifestRunner({
    manifest: routingManifest,
    stateDir,
    providers,
    diffBudgetGuard: { evaluate: () => ({ status: 'PASS', changedLines: 2 }) },
    executeTask: async (_task, metadata) => { implementRoute = metadata.routing; return candidate('implemented'); },
    reviewTask: async (_task, _candidate, metadata) => {
      reviewRoutes.push(metadata.routing);
      reviews += 1;
      return { findings: reviews === 1 ? [finding] : [] };
    },
    correctTask: async (_task, _candidate, _findings, metadata) => { correctionRoute = metadata.routing; return candidate('corrected'); },
  }).run();
  assert.equal(result.tasks.STICKY.status, 'PASS');
  assert.equal(result.tasks.STICKY.routingDecision.status, 'READY');
  assert.equal(implementRoute.provider, 'NVIDIA_NIM');
  assert.equal(correctionRoute.provider, implementRoute.provider);
  assert.equal(correctionRoute.model, implementRoute.model);
  assert.equal(correctionRoute.effortLevel, implementRoute.effortLevel);
  assert.equal(correctionRoute.cacheSessionKey, implementRoute.cacheSessionKey);
  assert.ok(reviewRoutes.every(route => route.provider === 'OPENROUTER_REVIEW'));
  assert.ok(reviewRoutes.every(route => route.cacheSessionKey === reviewRoutes[0].cacheSessionKey));
  assert.notEqual(reviewRoutes[0].provider, implementRoute.provider);
});
