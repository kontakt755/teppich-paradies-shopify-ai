import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphQLProxy } from '../../workflow/graphql-proxy.mjs';
import { fetchOrdersSince, writeOrderState, normalisiereLineItem, ORDERS_QUERY } from '../sync/orders.mjs';
import { resolveLineItem } from '../lib/resolve.mjs';

const ok = (data) => ({ ok: true, status: 200, json: async () => ({ data }), text: async () => '' });

// Fixture ohne echte Kundendaten.
const bestellung = (n, cursor) => ({
  cursor,
  id: `gid://shopify/Order/${n}`,
  name: `#T${n}`,
  updatedAt: '2026-09-22T08:00:00Z',
  note: null,
  tags: [],
  displayFinancialStatus: 'PAID',
  displayFulfillmentStatus: 'UNFULFILLED',
  customAttributes: [{ key: 'Beratung', value: 'nein' }],
  shippingAddress: { name: 'Test Kundin', address1: 'Teststrasse 1', zip: '00000', city: 'Teststadt', country: 'Germany' },
  metafields: { nodes: [] },
  lineItems: { nodes: [{
    id: `gid://shopify/LineItem/${n}`, sku: 'CVEXPGR04_333', quantity: 9,
    customAttributes: [{ key: 'Maße', value: '250 × 350 cm' }],
    variant: {
      id: 'gid://shopify/ProductVariant/1', sku: 'CVEXPGR04_333', title: 'Farbe 333',
      metafields: { nodes: [{ namespace: 'einkauf', key: 'lieferant', type: 'single_line_text_field', value: 'A' }] },
      lieferant: { nodes: [{ namespace: 'lieferant', key: 'lieferant_a_artikelnummer', type: 'single_line_text_field', value: 'A-333' }] },
      product: {
        id: 'gid://shopify/Product/1', handle: 'testboden', title: 'Testboden',
        metafields: { nodes: [{ namespace: 'custom', key: 'rollenbreite', type: 'number_decimal', value: '4.0' }] },
        grosshandel: { nodes: [] },
      },
    },
  }] },
});

function seitenFetch(seiten, aufrufe) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    aufrufe.push(body.variables);
    const idx = aufrufe.length - 1;
    const s = seiten[idx];
    return ok({ orders: { pageInfo: { hasNextPage: idx < seiten.length - 1, endCursor: s.cursor }, nodes: s.nodes } });
  };
}

test('fetchOrdersSince blaettert ueber zwei Seiten mit endCursor und first 50', async () => {
  const aufrufe = [];
  const seiten = [
    { cursor: 'c1', nodes: [bestellung(1), bestellung(2)] },
    { cursor: 'c2', nodes: [bestellung(3)] },
  ];
  const proxy = new GraphQLProxy({ token: 'shpat_test', fetch: seitenFetch(seiten, aufrufe) });
  const r = await fetchOrdersSince(proxy, '2026-09-21T00:00:00Z');
  assert.equal(r.gesammelt, false);
  assert.equal(r.seiten, 2);
  assert.equal(r.orders.length, 3);
  assert.deepEqual(r.orders.map(o => o.name), ['#T1', '#T2', '#T3']);
  assert.equal(aufrufe[0].first, 50);
  assert.equal(aufrufe[0].after, null);
  assert.equal(aufrufe[1].after, 'c1');
  assert.match(aufrufe[0].query, /^updated_at:>'2026-09-21T00:00:00\.000Z'$/);
  // Query traegt die verlangten Felder
  for (const f of ['customAttributes', 'note', 'tags', 'shippingAddress', 'displayFinancialStatus', 'displayFulfillmentStatus', 'namespace: "einkauf"', 'namespace: "ops"', 'pageInfo { hasNextPage endCursor }']) {
    assert.ok(ORDERS_QUERY.includes(f), f);
  }
});

test('Geladene Positionen sind fuer resolveLineItem normalisiert (Aliasse zusammengefuehrt)', async () => {
  const proxy = new GraphQLProxy({ token: 'shpat_test', fetch: seitenFetch([{ cursor: 'c1', nodes: [bestellung(5)] }], []) });
  const { orders } = await fetchOrdersSince(proxy, '2026-09-21T00:00:00Z');
  const li = orders[0].lineItems.nodes[0];
  assert.ok(Array.isArray(li.variant.metafields));
  const r = resolveLineItem({ lineItem: li, variant: li.variant });
  assert.equal(r.einkauf.lieferant, 'A');
  assert.equal(r.grosshaendlerId, 'A-333');
  assert.equal(r.produkt.rollenbreite, 4);
  assert.equal(r.masspruefung.status, 'ok'); // 8,75 m2 -> 9 m2, bestellt 9
  assert.equal(normalisiereLineItem({ id: 'x' }).id, 'x');
});

test('Im Sammelmodus (kein Token) gibt es keine Bestellungen und keinen Fehler', async () => {
  const proxy = new GraphQLProxy({ token: null, fetch: () => { throw new Error('darf nicht aufgerufen werden'); } });
  const r = await fetchOrdersSince(proxy, '2026-09-21T00:00:00Z');
  assert.deepEqual(r, { orders: [], seiten: 0, gesammelt: true });
  assert.equal(proxy.requestLog.length, 1);
  const w = await writeOrderState(proxy, 'gid://shopify/Order/1', { status: 'PRUEFUNG' });
  assert.equal(w.gesammelt, true);
  assert.equal(w.ok, false);
});

test('fetchOrdersSince lehnt ungueltige Eingaben und hasNextPage ohne Cursor ab', async () => {
  await assert.rejects(() => fetchOrdersSince(null, '2026-09-21'), /proxy fehlt/);
  const proxy = new GraphQLProxy({ token: 'shpat_test', fetch: async () => ok({ orders: { pageInfo: { hasNextPage: true, endCursor: null }, nodes: [] } }) });
  await assert.rejects(() => fetchOrdersSince(proxy, 'gestern'), /sinceIso/);
  await assert.rejects(() => fetchOrdersSince(proxy, '2026-09-21T00:00:00Z'), /ohne endCursor/);
});

test('writeOrderState schreibt Metafelder und Tags und liest gegen - userErrors leer reicht nicht', async () => {
  const gespeichert = { mf: {}, tags: new Set() };
  const calls = [];
  const fetch = async (url, init) => {
    const { query, variables } = JSON.parse(init.body);
    calls.push(query.trim().split(/\s+/)[1]);
    if (query.includes('metafieldsSet')) {
      for (const m of variables.metafields) gespeichert.mf[m.key] = m.value;
      return ok({ metafieldsSet: { metafields: [], userErrors: [] } });
    }
    if (query.includes('tagsAdd')) {
      for (const t of variables.tags) gespeichert.tags.add(t);
      return ok({ tagsAdd: { node: { id: variables.id }, userErrors: [] } });
    }
    return ok({ order: { id: variables.id, tags: [...gespeichert.tags], metafields: { nodes: Object.entries(gespeichert.mf).map(([key, value]) => ({ namespace: 'ops', key, value })) } } });
  };
  const proxy = new GraphQLProxy({ token: 'shpat_test', fetch });
  const r = await writeOrderState(proxy, 'gid://shopify/Order/7', { status: 'BERATUNG_OFFEN', beratung: { gewuenscht: true, telefon: null }, tags: ['ops:beratung'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.abweichungen, []);
  assert.deepEqual(calls, ['OpsMetafieldsSet($metafields:', 'OpsTagsAdd($id:', 'OpsOrderState($id:']);
  assert.equal(gespeichert.mf.status, 'BERATUNG_OFFEN');
  assert.equal(JSON.parse(gespeichert.mf.beratung).gewuenscht, true);
});

test('writeOrderState meldet Abweichung, wenn der Wert nach dem Schreiben nicht zurueckkommt', async () => {
  const fetch = async (url, init) => {
    const { query } = JSON.parse(init.body);
    if (query.includes('metafieldsSet')) return ok({ metafieldsSet: { metafields: [], userErrors: [] } });
    if (query.includes('tagsAdd')) return ok({ tagsAdd: { node: null, userErrors: [] } });
    return ok({ order: { id: 'gid://shopify/Order/8', tags: [], metafields: { nodes: [{ namespace: 'ops', key: 'status', value: 'NEU' }] } } });
  };
  const proxy = new GraphQLProxy({ token: 'shpat_test', fetch });
  const r = await writeOrderState(proxy, 'gid://shopify/Order/8', { status: 'PRUEFUNG', tags: ['ops:problem'] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.abweichungen, ['ops.status: erwartet PRUEFUNG, ist NEU', 'Tag fehlt: ops:problem']);
  await assert.rejects(() => writeOrderState(proxy, '8', { status: 'NEU' }), /orderId ungueltig/);
  await assert.rejects(() => writeOrderState(proxy, 'gid://shopify/Order/8', {}), /nichts zu schreiben/);
});
