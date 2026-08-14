import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { resolveBrowserExecutable, systemBrowserCandidates } from '../browser-resolver.mjs';
import { closeBrowserSafely, installHardProcessTimeout, OperationTimeoutError, withTimeout } from '../browser-lifecycle.mjs';

test('explicit environment path has highest priority', () => {
  const result = resolveBrowserExecutable({ environment: { TP_BROWSER_EXECUTABLE: '/explicit/browser' }, existsSync: value => value === '/explicit/browser', playwrightChromium: { executablePath: () => '/bundled' } });
  assert.deepEqual(result, { executablePath: '/explicit/browser', source: 'explicit' });
});

test('available Playwright Chromium wins over system fallback', () => {
  const result = resolveBrowserExecutable({ environment: {}, existsSync: value => value === '/bundled', playwrightChromium: { executablePath: () => '/bundled' } });
  assert.deepEqual(result, { executablePath: '/bundled', source: 'playwright-chromium' });
});

test('system browser is used when bundled Chromium is absent', () => {
  const candidate = systemBrowserCandidates('linux')[1];
  const result = resolveBrowserExecutable({ environment: {}, platform: 'linux', existsSync: value => value === candidate, playwrightChromium: { executablePath: () => '/missing' } });
  assert.deepEqual(result, { executablePath: candidate, source: 'system-browser' });
});

test('missing explicit path fails closed', () => {
  const result = resolveBrowserExecutable({ configuredPath: '/missing', environment: {}, existsSync: () => false });
  assert.equal(result.source, 'explicit-missing');
  assert.equal(result.executablePath, null);
});

test('operation timeout is finite and classified', async () => {
  await assert.rejects(() => withTimeout(new Promise(() => {}), 10, 'Fixture'), OperationTimeoutError);
});

test('browser cleanup reports a normal close truthfully', async () => {
  const result = await closeBrowserSafely({ close: async () => {} }, 10);
  assert.deepEqual(result, { closed: true });
});

test('browser cleanup timeout is bounded and never claims a hard kill', async () => {
  const result = await closeBrowserSafely({ close: () => new Promise(() => {}) }, 10);
  assert.equal(result.closed, false);
  assert.equal(result.timedOut, true);
  assert.equal(result.hardKillAttempted, false);
  assert.equal(result.errorClass, 'OperationTimeoutError');
});

test('missing browser cleanup is skipped', async () => {
  assert.deepEqual(await closeBrowserSafely(null, 10), { closed: true, skipped: true });
});

test('browser cleanup error is reported without a false kill confirmation', async () => {
  const result = await closeBrowserSafely({ close: async () => { throw new Error('close failed'); } }, 10);
  assert.equal(result.closed, false);
  assert.equal(result.timedOut, false);
  assert.equal(result.hardKillAttempted, false);
  assert.equal(result.errorClass, 'Error');
});

test('outer process watchdog has a finite hard deadline and reports its real termination', () => {
  let callback; let exitCode; const messages = [];
  const watchdog = installHardProcessTimeout({
    timeoutMs: 123, label: 'Fixture', setTimer: fn => { callback = fn; return 'timer'; }, clearTimer: () => {},
    exit: code => { exitCode = code; }, report: message => messages.push(message),
  });
  callback();
  assert.equal(watchdog.expired, true);
  assert.equal(exitCode, 1);
  assert.match(messages[0], /123 ms/);
});

test('outer process watchdog clears after a completed run', () => {
  let cleared;
  const watchdog = installHardProcessTimeout({ timeoutMs: 123, setTimer: () => 'timer', clearTimer: timer => { cleared = timer; }, exit: () => {}, report: () => {} });
  watchdog.clear();
  assert.equal(cleared, 'timer');
  assert.equal(watchdog.expired, false);
});

test('outer process watchdog terminates a real hanging child process', async () => {
  const child = spawn(process.execPath, [new URL('./fixtures/watchdog-child.mjs', import.meta.url).pathname], { stdio: 'ignore' });
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('watchdog child did not exit')); }, 1_000);
    child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    child.once('error', reject);
  });
  assert.deepEqual(result, { code: 1, signal: null });
});
