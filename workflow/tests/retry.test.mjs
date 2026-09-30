import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EXTERNAL_BLOCKS, MAX_IMMEDIATE_SCRIPT_RETRIES, classifyFailure, runWithExternalRetry } from '../retry.mjs';
import { runValidation } from '../core.mjs';

test('hoechstens ein sofortiger Wiederholungsversuch', () => {
  assert.equal(MAX_IMMEDIATE_SCRIPT_RETRIES, 1);
});

test('external blocker classification is explicit', () => {
  assert.equal(classifyFailure({ stderr: 'HTTP 429 Cloudflare rate limit' }), EXTERNAL_BLOCKS.RATE_LIMIT);
  assert.equal(classifyFailure({ stderr: 'HTTP 503 Service Unavailable' }), EXTERNAL_BLOCKS.UPSTREAM);
  assert.equal(classifyFailure({ stderr: "Fetch to https://error-analytics-sessions-production.shopifysvc.com/observeonly was blocked by CORS policy" }), EXTERNAL_BLOCKS.UPSTREAM);
  assert.equal(classifyFailure({ stderr: 'Claude Cloud Agent Proxy returned 403 for storefront' }), EXTERNAL_BLOCKS.LOCAL_RUNNER);
  assert.equal(classifyFailure({ stderr: 'Storefront image returned 403\nLater request returned HTTP 503 Service Unavailable' }), EXTERNAL_BLOCKS.UPSTREAM);
  assert.equal(classifyFailure({ stderr: 'AssertionError: expected 2 to equal 3' }), EXTERNAL_BLOCKS.CODE_DEFECT);
  assert.equal(classifyFailure({ stderr: 'something unexplained' }), EXTERNAL_BLOCKS.UNKNOWN);
});

test('external script retry is bounded to one and never changes agent', () => {
  let calls = 0;
  const external = runWithExternalRetry(() => ({ exitCode: 1, stderr: `HTTP 503 attempt ${++calls}`, stdout: '', timedOut: false, spawnError: null }));
  assert.equal(calls, 2);
  assert.equal(external.attempts, 2);
  assert.equal(external.blocker, EXTERNAL_BLOCKS.UPSTREAM);
  assert.equal(MAX_IMMEDIATE_SCRIPT_RETRIES, 1);
  calls = 0;
  const defect = runWithExternalRetry(() => ({ exitCode: 1, stderr: `AssertionError ${++calls}`, stdout: '', timedOut: false, spawnError: null }));
  assert.equal(calls, 1);
  assert.equal(defect.blocker, EXTERNAL_BLOCKS.CODE_DEFECT);
  calls = 0;
  const cors = runWithExternalRetry(() => ({ exitCode: 1, stderr: `CORS blocked https://error-analytics-sessions-production.shopifysvc.com/observeonly ${++calls}`, stdout: '', timedOut: false, spawnError: null }));
  assert.equal(calls, 1);
  assert.equal(cors.blocker, EXTERNAL_BLOCKS.UPSTREAM);
});

test('fresh structured 503 report triggers exactly one immediate script retry', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-router-report-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const directory of ['qa/tests', 'automation/tests', 'workflow/tests', 'qa/results']) fs.mkdirSync(path.join(root, directory), { recursive: true });
  let seoCalls = 0;
  const run = (_command, args) => {
    if (args.includes('qa/run-seo-check.mjs')) {
      seoCalls += 1;
      fs.writeFileSync(path.join(root, 'qa/results/seo-latest.json'), JSON.stringify({ status: 'FAIL', findings: [
        { severity: 'WARN', message: 'unrelated rate limit documentation' },
        { severity: 'ERROR', message: 'HTTP 503 Service Unavailable' },
      ] }));
      return { exitCode: 1, stdout: 'SEO FAIL', stderr: '', timedOut: false, spawnError: null };
    }
    return { exitCode: 0, stdout: '', stderr: '', timedOut: false, spawnError: null };
  };
  assert.throws(
    () => runValidation({ root, run }),
    error => error.code === EXTERNAL_BLOCKS.UPSTREAM && error.summary.externalBlock === EXTERNAL_BLOCKS.UPSTREAM,
  );
  assert.equal(seoCalls, 2);
});
