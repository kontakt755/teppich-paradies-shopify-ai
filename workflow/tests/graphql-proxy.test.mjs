import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GraphQLProxy, DEFAULT_API_VERSION } from '../graphql-proxy.mjs';

const okResponse = (data, extra = {}) => ({ ok: true, status: 200, json: async () => ({ data, ...extra }), text: async () => '' });

test('ohne Token werden Aufrufe nur gesammelt und liefern null', async () => {
  const proxy = new GraphQLProxy({ token: null, fetch: () => { throw new Error('darf nicht aufgerufen werden'); } });
  assert.equal(proxy.live, false);
  assert.equal(await proxy.execute('query { shop { name } }'), null);
  assert.equal(proxy.requestLog.length, 1);
});

test('mit shpat_-Token geht der Aufruf mit Access-Token-Header an die Admin API und liefert data', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return okResponse({ products: { nodes: [{ id: 'gid://shopify/Product/1' }] } }, { extensions: { cost: { actualQueryCost: 3 } } }); };
  const proxy = new GraphQLProxy({ store: 'sjjyq1-6w', token: 'shpat_test', fetch, apiVersion: '2026-07' });
  const data = await proxy.execute('query { products(first: 1) { nodes { id } } }', { a: 1 });
  assert.deepEqual(data.products.nodes, [{ id: 'gid://shopify/Product/1' }]);
  assert.equal(calls[0].url, 'https://sjjyq1-6w.myshopify.com/admin/api/2026-07/graphql.json');
  assert.equal(calls[0].init.headers['X-Shopify-Access-Token'], 'shpat_test');
  assert.deepEqual(JSON.parse(calls[0].init.body).variables, { a: 1 });
  assert.equal(proxy.requestLog[0].cost, 3);
});

test('HTTP 401 und GraphQL-errors werden zu klaren Fehlern, kein stilles undefined', async () => {
  const p401 = new GraphQLProxy({ token: 'shpat_x', fetch: async () => ({ ok: false, status: 401, text: async () => 'Invalid API key' }) });
  await assert.rejects(() => p401.execute('query { shop { name } }'), /HTTP 401 \(Token ungueltig/);
  const pErr = new GraphQLProxy({ token: 'shpat_x', fetch: async () => okResponse(null, { errors: [{ message: 'Field x doesn\'t exist' }] }) });
  await assert.rejects(() => pErr.execute('query { x }'), /Shopify GraphQL: Field x/);
});

test('atkn_-Token wird sofort abgelehnt - die Admin API braucht shpat_', () => {
  assert.throws(() => new GraphQLProxy({ token: 'atkn_abc' }), /atkn_/);
});

test('Standard-API-Version ist aktuell und per SHOPIFY_API_VERSION ueberschreibbar', () => {
  assert.match(DEFAULT_API_VERSION, /^20(2[6-9]|[3-9]\d)-(01|04|07|10)$/);
  assert.equal(new GraphQLProxy({ token: null, apiVersion: '2025-10' }).apiVersion, '2025-10');
});

test('exportLog schreibt das Protokoll ohne Token in das angegebene Verzeichnis', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gql-log-'));
  const proxy = new GraphQLProxy({ token: 'shpat_secret', fetch: async () => okResponse({}) });
  await proxy.execute('query { shop { name } }');
  const file = proxy.exportLog(dir);
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /shop \{ name \}/);
  assert.doesNotMatch(text, /shpat_secret/);
});
