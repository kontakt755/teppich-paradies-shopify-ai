import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphQLProxy } from '../../workflow/graphql-proxy.mjs';
import { fetchAbandonedCheckouts, baueQuery } from '../sync/abandonedCheckouts.mjs';

const ok = (data) => ({ ok: true, status: 200, json: async () => ({ data }), text: async () => '' });
const checkout = (n) => ({ id: `gid://shopify/AbandonedCheckout/${n}`, name: `#C${n}`, createdAt: '2026-09-01T00:00:00Z', totalPriceSet: { shopMoney: { amount: '20', currencyCode: 'EUR' } } });

test('baueQuery: 30-Tage-Fenster als created_at Filter', () => {
  const jetzt = () => new Date('2026-09-24T00:00:00Z').getTime();
  const q = baueQuery(30, jetzt);
  assert.match(q, /created_at:>='2026-08-25/);
});

test('fetchAbandonedCheckouts: eine Seite, query im Ergebnis', async () => {
  const gesehen = [];
  const proxy = new GraphQLProxy({
    token: 'shpat_test',
    fetch: async (url, init) => {
      gesehen.push(JSON.parse(init.body).variables);
      return ok({ abandonedCheckouts: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [checkout(1)] } });
    },
  });
  const r = await fetchAbandonedCheckouts(proxy, { tageFenster: 30, jetzt: () => new Date('2026-09-24T00:00:00Z').getTime() });
  assert.equal(r.checkouts.length, 1);
  assert.match(r.query, /created_at:>=/);
  assert.match(gesehen[0].query, /created_at:>=/);
});

test('fetchAbandonedCheckouts: Sammelmodus ohne Token', async () => {
  const proxy = new GraphQLProxy({ token: null, fetch: async () => ok({}) });
  const r = await fetchAbandonedCheckouts(proxy);
  assert.equal(r.gesammelt, true);
});
