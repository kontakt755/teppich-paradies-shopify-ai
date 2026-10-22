import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi } from '../../../scripts/dashboard-api.mjs';

const O = 'gid://shopify/Order/992';
function api() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-abhaken-api-')); fs.mkdirSync(path.join(dir, 'bestelluebersicht'));
  fs.writeFileSync(path.join(dir, 'bestelluebersicht/orders.json'), JSON.stringify({ orders: [{ id: O, name: '#ATTRAPPE', createdAt: '2026-10-01T10:00:00Z', displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', lineItems: { nodes: [] } }] }));
  const neu = () => createApi({ root: dir, privatDirPath: dir, env: {}, gh: async () => '', shopifyZugang: async () => { throw new Error('Shopify darf nicht aufgerufen werden'); } });
  return { neu };
}

test('Haken bleibt nach Neuladen erhalten und laesst sich zuruecknehmen - ohne Shopify', () => {
  const u = api();
  assert.equal(u.neu().kundenBestellungen().zeilen[0].abgehakt, null);
  u.neu().bestellungAbhaken({ orderId: O, erledigt: true }, { benutzer: { name: 'Lena' } });
  assert.equal(u.neu().kundenBestellungen().zeilen[0].abgehakt.von, 'Lena');
  u.neu().bestellungAbhaken({ orderId: O, erledigt: false });
  assert.equal(u.neu().kundenBestellungen().zeilen[0].abgehakt, null);
});

test('ohne Bestellkennung: 400', () => {
  assert.throws(() => api().neu().bestellungAbhaken({}), e => e.status === 400);
});
