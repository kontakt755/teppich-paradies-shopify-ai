import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

function startDashboard(stateDir) {
  const child = spawn(process.execPath, ['automation/dashboard/server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, DASHBOARD_PORT: '0', DASHBOARD_ACCESS_TOKEN: 'test-dashboard-token', DASHBOARD_STATE_DIR: stateDir, DASHBOARD_AGENT_LOOP_SCRIPT: 'automation/tests/fixtures/dashboard-agent-loop.mjs' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`dashboard did not start: ${stderr}`)), 5_000);
    child.stdout.on('data', chunk => {
      const match = String(chunk).match(/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    child.once('error', reject);
  });
  return { child, ready };
}

async function login(base) {
  const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'test-dashboard-token' }) });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie');
}

async function waitForLatest(base, cookie) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
    const status = await fetch(`${base}/api/status`, { headers: { cookie } }).then(response => response.json());
    if (!status.current && status.latest) return status;
  }
  throw new Error('expected dashboard run to finish');
}

function stop(child) {
  return new Promise(resolve => { child.once('exit', resolve); child.kill(); });
}

test('dashboard authenticates, persists results and accepts contextual follow-ups', { skip: process.env.TP_TEST_DASHBOARD_SERVER !== '1' }, async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-dashboard-test-'));
  let running = startDashboard(stateDir);
  try {
    let base = `http://127.0.0.1:${await running.ready}`;
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/status`)).status, 401);
    let cookie = await login(base);
    const task = await fetch(`${base}/api/tasks`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ task: 'Ändere den Preis auf 1 Euro.' }) });
    assert.equal(task.status, 202);
    let status = await waitForLatest(base, cookie);
    assert.equal(status.latest.state, 'PASS');
    assert.equal(status.history.length, 1);

    const followUp = await fetch(`${base}/api/follow-ups`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ command: 'Erkläre nur, welche Freigabe fehlt.' }) });
    assert.equal(followUp.status, 202);
    status = await waitForLatest(base, cookie);
    assert.equal(status.latest.task, 'Erkläre nur, welche Freigabe fehlt.');
    assert.ok(status.latest.parentRunId);

    await stop(running.child);
    running = startDashboard(stateDir);
    base = `http://127.0.0.1:${await running.ready}`;
    cookie = await login(base);
    status = await fetch(`${base}/api/status`, { headers: { cookie } }).then(response => response.json());
    assert.equal(status.latest.task, 'Erkläre nur, welche Freigabe fehlt.');
    assert.equal(status.history.length, 2);
  } finally {
    if (running.child.exitCode === null) await stop(running.child);
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});
