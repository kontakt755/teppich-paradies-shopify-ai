import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ManifestRunner, RunnerStoppedError } from '../core/runner.mjs';
import { RunLock, RunLockedError } from '../core/run-lock.mjs';
import { atomicWriteJson } from '../core/state-store.mjs';

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
