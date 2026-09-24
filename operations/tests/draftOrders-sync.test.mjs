import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphQLProxy } from '../../workflow/graphql-proxy.mjs';
import { fetchDraftOrders } from '../sync/draftOrders.mjs';

const ok = (data) => ({ ok: true, status: 200, json: async () => ({ data }), text: async () => '' });
const angebot = (n) => ({ id: `gid://shopify/DraftOrder/${n}`, name: `#D${n}`, status: 'OPEN', totalPriceSet: { shopMoney: { amount: '10', currencyCode: 'EUR' } } });

test('fetchDraftOrders: eine Seite ohne hasNextPage', async () => {
  const proxy = new GraphQLProxy({
    token: 'shpat_test',
    fetch: async () => ok({ draftOrders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [angebot(1)] } }),
  });
  const r = await fetchDraftOrders(proxy);
  assert.equal(r.seiten, 1);
  assert.equal(r.draftOrders.length, 1);
  assert.equal(r.gesammelt, false);
});

test('fetchDraftOrders: Sammelmodus ohne Token', async () => {
  const proxy = new GraphQLProxy({ token: null, fetch: async () => ok({}) });
  const r = await fetchDraftOrders(proxy);
  assert.equal(r.gesammelt, true);
});
