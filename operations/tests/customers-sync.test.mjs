import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphQLProxy } from '../../workflow/graphql-proxy.mjs';
import { fetchCustomers } from '../sync/customers.mjs';

const ok = (data) => ({ ok: true, status: 200, json: async () => ({ data }), text: async () => '' });
const kunde = (n) => ({ id: `gid://shopify/Customer/${n}`, displayName: `Test ${n}`, numberOfOrders: n, amountSpent: { amount: '0', currencyCode: 'EUR' }, tags: [] });

test('fetchCustomers: blaettert ueber zwei Seiten', async () => {
  const aufrufe = [];
  const proxy = new GraphQLProxy({
    token: 'shpat_test',
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      aufrufe.push(body.variables);
      const seite = aufrufe.length === 1
        ? { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [kunde(1), kunde(2)] }
        : { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [kunde(3)] };
      return ok({ customers: seite });
    },
  });
  const r = await fetchCustomers(proxy);
  assert.equal(r.gesammelt, false);
  assert.equal(r.seiten, 2);
  assert.equal(r.customers.length, 3);
  assert.equal(aufrufe[1].after, 'c1');
});

test('fetchCustomers: ohne Token (Sammelmodus) liefert leere Liste, kein Fehler', async () => {
  const proxy = new GraphQLProxy({ token: null, fetch: async () => ok({}) });
  const r = await fetchCustomers(proxy);
  assert.equal(r.gesammelt, true);
  assert.deepEqual(r.customers, []);
});

test('fetchCustomers: proxy fehlt wirft', async () => {
  await assert.rejects(() => fetchCustomers(null), /proxy fehlt/);
});
