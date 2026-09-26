import test from 'node:test';
import assert from 'node:assert/strict';
import { argumente, typVon, baue, umwandeln, TEILE } from '../scripts/bulk-zu-eingabe.mjs';

const zeilen = (...o) => o.map(x => JSON.stringify(x)).join('\n');

test('argumente: Teil und Datei sind Pflicht', () => {
  assert.deepEqual(argumente(['--teil', 'kunden', '--jsonl', '/tmp/a.jsonl']).teil, 'kunden');
  assert.throws(() => argumente(['--teil', 'quatsch', '--jsonl', '/tmp/a.jsonl']), /unbekannt/);
  assert.throws(() => argumente(['--teil', 'kunden']), /--jsonl/);
  assert.throws(() => argumente(['--kaputt']), /Unbekanntes Argument/);
});

test('typVon liest den Typ aus der gid', () => {
  assert.equal(typVon('gid://shopify/Customer/1'), 'Customer');
  assert.equal(typVon('gid://shopify/InventoryLevel/9?inventory_item_id=3'), 'InventoryLevel');
  assert.equal(typVon('keine-gid'), null);
  assert.equal(typVon(undefined), null);
});

test('Kindzeilen ohne id landen im vorgegebenen Feld', () => {
  // Der Kern: Anschriften und Positionen sind Wertobjekte und haben in der
  // Massenausgabe KEINE id - ohne standardFeld verschwanden sie in "kinder".
  const text = zeilen(
    { id: 'gid://shopify/Customer/1', displayName: 'A' },
    { name: 'A', zip: '12345', __parentId: 'gid://shopify/Customer/1' },
    { name: 'A zweite', zip: '54321', __parentId: 'gid://shopify/Customer/1' },
  );
  const { customers } = umwandeln('kunden', text);
  assert.equal(customers.length, 1);
  assert.equal(customers[0].addressesV2.nodes.length, 2);
  assert.equal(customers[0].addressesV2.nodes[0].zip, '12345');
  assert.ok(!('__parentId' in customers[0].addressesV2.nodes[0]), '__parentId gehoert nicht ins Ergebnis');
});

test('Kinder ohne passendes Elternteil werden verworfen, Reihenfolge bleibt', () => {
  const text = zeilen(
    { id: 'gid://shopify/Customer/1', displayName: 'Erster' },
    { id: 'gid://shopify/Customer/2', displayName: 'Zweiter' },
    { name: 'verwaist', __parentId: 'gid://shopify/Customer/999' },
  );
  const { customers } = umwandeln('kunden', text);
  assert.deepEqual(customers.map(c => c.displayName), ['Erster', 'Zweiter']);
  assert.ok(!customers.some(c => c.addressesV2));
});

test('leere Zeilen und fremde Knoten stoeren nicht', () => {
  const text = `${zeilen({ id: 'gid://shopify/Customer/1', displayName: 'A' }, { id: 'gid://shopify/Product/7', title: 'fremd' })}\n\n`;
  const { customers } = umwandeln('kunden', text);
  assert.deepEqual(customers.map(c => c.displayName), ['A']);
});

test('Angebote: Positionen landen unter lineItems', () => {
  const text = zeilen(
    { id: 'gid://shopify/DraftOrder/1', name: '#D1', status: 'OPEN' },
    { title: 'Teppich', quantity: 2, __parentId: 'gid://shopify/DraftOrder/1' },
  );
  const { draftOrders } = umwandeln('angebote', text);
  assert.equal(draftOrders[0].lineItems.nodes[0].title, 'Teppich');
});

test('Bestand: Standort haengt an der Zeile, nicht am Artikel', () => {
  const text = zeilen(
    { id: 'gid://shopify/InventoryItem/1', sku: 'X-1', tracked: true, variant: { title: 'Default' } },
    {
      id: 'gid://shopify/InventoryLevel/9',
      quantities: [{ name: 'available', quantity: 5 }],
      location: { id: 'gid://shopify/Location/3', name: 'Lager' },
      __parentId: 'gid://shopify/InventoryItem/1',
    },
  );
  const modell = umwandeln('bestand', text);
  assert.deepEqual(modell.standorte, [{ id: 'gid://shopify/Location/3', name: 'Lager' }]);
  assert.equal(modell.bestand.length, 1);
  assert.equal(modell.bestand[0].standort.name, 'Lager');
  assert.equal(modell.bestand[0].item.sku, 'X-1');
  assert.equal(modell.bestand[0].item.tracked, true);
});

test('Bestand: derselbe Standort wird nur einmal gefuehrt', () => {
  const ort = { id: 'gid://shopify/Location/3', name: 'Lager' };
  const text = zeilen(
    { id: 'gid://shopify/InventoryItem/1', tracked: true },
    { id: 'gid://shopify/InventoryLevel/9', quantities: [], location: ort, __parentId: 'gid://shopify/InventoryItem/1' },
    { id: 'gid://shopify/InventoryItem/2', tracked: false },
    { id: 'gid://shopify/InventoryLevel/10', quantities: [], location: ort, __parentId: 'gid://shopify/InventoryItem/2' },
  );
  const modell = umwandeln('bestand', text);
  assert.equal(modell.standorte.length, 1);
  assert.equal(modell.bestand.length, 2);
});

test('alle Teile haben Wurzel und Knotentyp', () => {
  for (const [name, spec] of Object.entries(TEILE)) {
    assert.ok(spec.wurzel, `${name} ohne Wurzel`);
    assert.ok(spec.knoten, `${name} ohne Knotentyp`);
  }
});
