import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { requestHandler } from '../server.mjs';

async function withServer(run) {
  const server = http.createServer(requestHandler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('state endpoint is read-only and returns no stored approval', async () => withServer(async base => {
  const response = await fetch(`${base}/api/state`);
  assert.equal(response.status, 200);
  const state = await response.json();
  assert.equal(state.readOnly, true);
  assert.equal(state.humanGate.approvalStored, false);
  assert.equal(state.summary.shopifyWriteApproved, false);

  const writeAttempt = await fetch(`${base}/api/state`, { method: 'POST' });
  assert.equal(writeAttempt.status, 405);
  assert.deepEqual(await writeAttempt.json(), { error: 'READ_ONLY' });
}));

test('unknown files are not exposed', async () => withServer(async base => {
  const response = await fetch(`${base}/unknown-file`);
  assert.equal(response.status, 404);
}));
