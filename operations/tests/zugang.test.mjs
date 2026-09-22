import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { erzeugeProxy, tauscheClientCredentials, ladeEnvLocal } from '../sync/zugang.mjs';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

test('ohne Zugangsdaten bleibt es beim Sammelmodus', async () => {
  const { proxy, art } = await erzeugeProxy({ env: {}, fetch: () => { throw new Error('kein Aufruf'); } });
  assert.equal(art, 'sammeln');
  assert.equal(proxy.live, false);
});

test('Admin-Token hat Vorrang und wird nicht getauscht', async () => {
  const { art, proxy } = await erzeugeProxy({ env: { SHOPIFY_ADMIN_TOKEN: 'shpat_x', SHOPIFY_CLIENT_ID: 'id' }, fetch: () => { throw new Error('kein Tausch'); } });
  assert.equal(art, 'admin-token');
  assert.equal(proxy.token, 'shpat_x');
});

test('Client-Credentials: Tausch per Formular-POST, Token landet im Header', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/admin/oauth/access_token')) return json({ access_token: 'tok_1', scope: 'read_orders,write_orders', expires_in: 86399 });
    return json({ data: { shop: { name: 'X' } } });
  };
  const { art, scope, proxy } = await erzeugeProxy({ env: { SHOPIFY_CLIENT_ID: 'cid', SHOPIFY_CLIENT_SECRET: 'geheim' }, fetch });
  assert.equal(art, 'client-credentials');
  assert.equal(scope, 'read_orders,write_orders');
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get('grant_type'), 'client_credentials');
  assert.equal(body.get('client_id'), 'cid');
  await proxy.execute('query { shop { name } }');
  assert.equal(calls[1].init.headers['X-Shopify-Access-Token'], 'tok_1');
  assert.ok(!JSON.stringify(proxy.requestLog).includes('geheim'));
});

test('abgelaufener Token wird vor dem naechsten Aufruf erneuert', async () => {
  let t = 0; let n = 0;
  const fetch = async (url) => url.endsWith('/access_token') ? json({ access_token: `tok_${++n}`, expires_in: 600 }) : json({ data: {} });
  const { proxy } = await erzeugeProxy({ env: { SHOPIFY_CLIENT_ID: 'a', SHOPIFY_CLIENT_SECRET: 'b' }, fetch, jetzt: () => t });
  assert.equal(proxy.token, 'tok_1');
  t = 10 * 60 * 1000;
  await proxy.execute('query { shop { name } }');
  assert.equal(proxy.token, 'tok_2');
});

test('fehlgeschlagener Tausch wirft klaren Fehler', async () => {
  await assert.rejects(() => tauscheClientCredentials({ clientId: 'a', clientSecret: 'b', fetch: async () => json({ error: 'invalid_client' }, 401) }), /HTTP 401/);
});

test('.env.local wird gelesen, Kommentare ignoriert', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tp-')), '.env.local');
  fs.writeFileSync(f, '# x\nSHOPIFY_CLIENT_ID=abc\nSHOPIFY_CLIENT_SECRET="def"\n');
  assert.deepEqual(ladeEnvLocal(f), { SHOPIFY_CLIENT_ID: 'abc', SHOPIFY_CLIENT_SECRET: 'def' });
});
