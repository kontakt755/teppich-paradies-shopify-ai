import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { requestHandler } from '../../../scripts/serve-dashboard.mjs';

// Die einkauf-Endpunkte lesen das private Datenverzeichnis ($TP_PRIVAT_DIR,
// sonst ~/teppich-paradies-analyse). Ohne diese Zeile pruefen sie den echten
// Stand des Rechners: am 2026-09-23 schlug "verfuegbar:false ohne Export"
// fehl, weil dort tatsaechlich ein Kennzahlen-Export lag. Ein Unit-Test darf
// nicht davon abhaengen, was jemand nebenher in sein Heimatverzeichnis legt.
process.env.TP_PRIVAT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-dashboard-test-'));

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

test('Einkauf-API ist GET-only und liefert JSON (verfuegbar:false ohne private Fixtures im Test-Repo)', async () => withServer(async base => {
  const b = await fetch(`${base}/api/einkauf/bestellungen`);
  assert.equal(b.status, 200);
  const bj = await b.json();
  assert.equal(typeof bj.verfuegbar, 'boolean');
  const p = await fetch(`${base}/api/einkauf/produktstatus?page=1&pageSize=5`);
  assert.equal(p.status, 200);
  const post = await fetch(`${base}/api/einkauf/bestellungen`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(post.status, 405);
}));

test('einkauf/kennzahlen ist GET-only und liefert JSON (verfuegbar:false ohne Export)', async () => withServer(async base => {
  const g = await fetch(`${base}/api/einkauf/kennzahlen`);
  assert.equal(g.status, 200);
  const gj = await g.json();
  assert.equal(gj.verfuegbar, false);
  assert.ok(gj.befehl);
  const post = await fetch(`${base}/api/einkauf/kennzahlen`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(post.status, 405);
}));

test('einkauf/auftragsstatus: GET liest lokal, POST verlangt JSON und lokalen Origin', async () => withServer(async base => {
  const g = await fetch(`${base}/api/einkauf/auftragsstatus`);
  assert.equal(g.status, 200);
  const gj = await g.json();
  assert.equal(gj.verfuegbar, true);
  assert.deepEqual(gj.positionen, {});

  const foreign = await fetch(`${base}/api/einkauf/auftragsstatus`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
  assert.equal(foreign.status, 403);

  const form = await fetch(`${base}/api/einkauf/auftragsstatus`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=b' });
  assert.equal(form.status, 415);
}));
