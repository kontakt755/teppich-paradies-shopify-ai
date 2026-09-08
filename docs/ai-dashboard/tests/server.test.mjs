import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { requestHandler } from '../../../scripts/serve-dashboard.mjs';

async function withServer(run) {
  const server = http.createServer(requestHandler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('statische Dateien mit korrekten MIME-Typen, keine Pfadausbrueche', async () => withServer(async base => {
  const html = await fetch(`${base}/`);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  const mod = await fetch(`${base}/lib/model.mjs`);
  assert.match(mod.headers.get('content-type'), /javascript/);
  const out = await fetch(`${base}/..%2F..%2Fpackage.json`);
  assert.notEqual(out.status, 200);
}));

test('schreibende API-Pfade verlangen POST, JSON und lokalen Origin', async () => withServer(async base => {
  assert.equal((await fetch(`${base}/api/tasks/1/transition`)).status, 405);
  const foreign = await fetch(`${base}/api/tasks/1/comment`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
  assert.equal(foreign.status, 403);
  const form = await fetch(`${base}/api/tasks/1/comment`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=b' });
  assert.equal(form.status, 415);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
}));
