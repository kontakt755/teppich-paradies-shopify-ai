import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EXTERNAL_BLOCKS, MAX_IMMEDIATE_SCRIPT_RETRIES, PREVIEW_HTTP_WAITS_MS, classifyFailure, fetchWithServerErrorRetry, isTransientHttpStatus, runWithExternalRetry } from '../retry.mjs';
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

test('erfolgreicher HTTP-503-Testname verdeckt keinen echten Assertion-Stack', () => {
  let stack;
  try { assert.equal('ist', 'soll'); } catch (error) { stack = error.stack; }
  let calls = 0;
  const defect = runWithExternalRetry(() => {
    calls += 1;
    return { exitCode: 1, stdout: '✔ HTTP 503 Service Unavailable wird korrekt wiederholt', stderr: stack };
  });
  assert.equal(classifyFailure(defect.result), EXTERNAL_BLOCKS.CODE_DEFECT);
  assert.equal(defect.blocker, EXTERNAL_BLOCKS.CODE_DEFECT);
  assert.equal(defect.attempts, 1);
  assert.equal(calls, 1);
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

// Antworten nach dem Muster von fetch: status, ok und ein abbrechbarer Body.
function httpSequence(statuses) {
  const calls = [];
  const cancelled = [];
  const fetchImpl = async (url, options) => {
    const status = statuses[calls.length];
    calls.push({ url, options });
    return { status, ok: status >= 200 && status < 300, body: { cancel: async () => { cancelled.push(status); } } };
  };
  return { fetchImpl, calls, cancelled };
}

test('5xx gilt als voruebergehend, 4xx und 2xx nicht', () => {
  for (const status of [500, 502, 503, 504, 599]) assert.equal(isTransientHttpStatus(status), true, String(status));
  for (const status of [200, 301, 400, 401, 403, 404, 429, 600, undefined]) assert.equal(isTransientHttpStatus(status), false, String(status));
});

test('Preview-Kaltstart: hoechstens zwei weitere Pruefungen mit wachsender Wartezeit', () => {
  // Am 2026-10-12 kam eine Minute nach HTTP 500 ein 200 - die Summe der
  // Wartezeiten muss das abdecken, ohne den Lauf beliebig zu verlaengern.
  assert.deepEqual([...PREVIEW_HTTP_WAITS_MS], [20_000, 40_000]);
  assert.ok(Object.isFrozen(PREVIEW_HTTP_WAITS_MS));
});

test('HTTP 500 und danach 200: eine Wartezeit, zweite Antwort zaehlt', async () => {
  const { fetchImpl, calls, cancelled } = httpSequence([500, 200]);
  const sleeps = [];
  const retries = [];
  const result = await fetchWithServerErrorRetry('https://example.test/?preview_theme_id=1', {
    fetchImpl, sleep: async ms => { sleeps.push(ms); }, onRetry: info => retries.push(info),
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.statuses, [500, 200]);
  assert.deepEqual(sleeps, [20_000]);
  assert.deepEqual(retries, [{ status: 500, attempt: 1, maxAttempts: 3, waitMs: 20_000 }]);
  assert.deepEqual(cancelled, [500]);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, 'https://example.test/?preview_theme_id=1');
    assert.equal(call.options.redirect, 'follow');
    assert.ok(call.options.signal instanceof AbortSignal);
  }
  // Jede Anfrage bekommt ihr eigenes Timeout, sonst laeuft die zweite mit dem Rest der ersten.
  assert.notEqual(calls[0].options.signal, calls[1].options.signal);
});

test('dauerhaft 5xx: nach drei Versuchen kommt die letzte Antwort zurueck', async () => {
  const { fetchImpl, calls } = httpSequence([500, 503, 500, 200]);
  const sleeps = [];
  const result = await fetchWithServerErrorRetry('https://example.test/', { fetchImpl, sleep: async ms => { sleeps.push(ms); } });
  assert.equal(calls.length, 3);
  assert.equal(result.attempts, 3);
  assert.equal(result.response.status, 500);
  assert.deepEqual(result.statuses, [500, 503, 500]);
  assert.deepEqual(sleeps, [20_000, 40_000]);
});

test('4xx wird nicht wiederholt, auch nicht nach einem 5xx', async () => {
  for (const status of [404, 429]) {
    const { fetchImpl, calls } = httpSequence([status, 200]);
    const sleeps = [];
    const result = await fetchWithServerErrorRetry('https://example.test/', { fetchImpl, sleep: async ms => { sleeps.push(ms); } });
    assert.equal(result.response.status, status);
    assert.equal(calls.length, 1);
    assert.deepEqual(sleeps, []);
  }
  const { fetchImpl, calls } = httpSequence([502, 404, 200]);
  const result = await fetchWithServerErrorRetry('https://example.test/', { fetchImpl, sleep: async () => {} });
  assert.equal(result.response.status, 404);
  assert.equal(calls.length, 2);
});

test('Netzwerkfehler werden nicht verschluckt und nicht wiederholt', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new TypeError('fetch failed'); };
  await assert.rejects(fetchWithServerErrorRetry('https://example.test/', { fetchImpl, sleep: async () => {} }), /fetch failed/);
  assert.equal(calls, 1);
});
