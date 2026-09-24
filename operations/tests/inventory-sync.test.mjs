import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphQLProxy } from '../../workflow/graphql-proxy.mjs';
import { fetchLocations, fetchInventoryLevels } from '../sync/inventory.mjs';

const ok = (data) => ({ ok: true, status: 200, json: async () => ({ data }), text: async () => '' });

test('fetchLocations: eine Seite', async () => {
  const proxy = new GraphQLProxy({
    token: 'shpat_test',
    fetch: async () => ok({ locations: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'gid://shopify/Location/1', name: 'Lager Oranienburg', isActive: true, fulfillsOnlineOrders: true }] } }),
  });
  const r = await fetchLocations(proxy);
  assert.equal(r.locations.length, 1);
  assert.equal(r.gesammelt, false);
});

test('fetchInventoryLevels: ein Standort, eine Seite Bestand', async () => {
  const proxy = new GraphQLProxy({
    token: 'shpat_test',
    fetch: async (url, init) => {
      const { query } = JSON.parse(init.body);
      if (query.includes('OpsLocations')) {
        return ok({ locations: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'gid://shopify/Location/1', name: 'Lager', isActive: true }] } });
      }
      return ok({
        location: {
          id: 'gid://shopify/Location/1', name: 'Lager',
          inventoryLevels: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [{ id: 'l1', quantities: [{ name: 'available', quantity: 5 }], item: { id: 'i1', sku: 'TEST-1', tracked: true, variant: { id: 'v1', sku: 'TEST-1', title: 'Farbe 1', product: { id: 'p1', handle: 'x', title: 'X' } } } }],
          },
        },
      });
    },
  });
  const r = await fetchInventoryLevels(proxy);
  assert.equal(r.standorte.length, 1);
  assert.equal(r.bestand.length, 1);
  assert.equal(r.bestand[0].standort.name, 'Lager');
  assert.equal(r.gesammelt, false);
});

test('fetchInventoryLevels: Sammelmodus ohne Token', async () => {
  const proxy = new GraphQLProxy({ token: null, fetch: async () => ok({}) });
  const r = await fetchInventoryLevels(proxy);
  assert.equal(r.gesammelt, true);
});
