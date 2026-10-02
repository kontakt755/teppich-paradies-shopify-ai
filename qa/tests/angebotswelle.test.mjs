import assert from 'node:assert/strict';
import test from 'node:test';
import { ende, ladeExport, plane, planeVariante, sperrgrund } from '../../operations/scripts/angebotswelle.mjs';

const P = (o) => ({ id: 'gid://shopify/Product/1', handle: 'velours-x', productType: 'Teppichboden', status: 'ACTIVE', ...o });
const V = (o) => ({ id: 'gid://shopify/ProductVariant/1', title: '400 cm', sku: 'S1', price: '20.00', compareAtPrice: null, product: P(), ...o });
const opt = { prozent: 15, start: '2026-11-03', ende: '2026-11-16', typ: 'Teppichboden' };

test('regulaerer Preis wird Vergleichspreis, Aktionspreis gerundet', () => {
  assert.deepEqual(planeVariante(V(), 15), { price: '17.00', compareAtPrice: '20.00' });
  assert.deepEqual(planeVariante(V({ price: '49.95' }), 15), { price: '42.46', compareAtPrice: '49.95' });
});

test('Muster, Nullpreis und schon reduzierte Varianten bleiben unberuehrt', () => {
  assert.equal(planeVariante(V({ sku: 'M-1' }), 15).grund, 'Muster');
  assert.equal(planeVariante(V({ price: '0' }), 15).grund, 'Preis 0');
  assert.equal(planeVariante(V({ compareAtPrice: '25.00' }), 15).grund, 'schon reduziert');
});

test('30-Tage-Sperre nach der letzten Aktion (PAngV 11)', () => {
  assert.match(sperrgrund(P({ ende: '2026-11-01' }), '2026-11-20'), /frei ab 2026-12-02/);
  assert.equal(sperrgrund(P({ ende: '2026-11-01' }), '2026-12-02'), null);
  assert.equal(sperrgrund(P({ status: 'DRAFT' }), '2026-12-02'), 'nicht aktiv');
});

test('Plan liefert Setzen, Rueckstellen und Aktionsdaten passend zueinander', () => {
  const r = plane([V(), V({ id: 'v2', product: P({ productType: 'Klickvinyl' }) })], opt);
  assert.equal(r.csv.length, 1);
  assert.deepEqual(r.setzen.get(P().id), [{ id: V().id, price: '17.00', compareAtPrice: '20.00' }]);
  assert.deepEqual(r.zurueck.get(P().id), [{ id: V().id, price: '20.00', compareAtPrice: null }]);
  const felder = Object.fromEntries(r.metafelder[0].metafields.map((m) => [m.key, m.value]));
  assert.deepEqual(felder, { start: '2026-11-03', ende: '2026-11-16', klasse: 'aktion' });
});

test('Auswahl per Handle und Plausibilitaet der Eingaben', () => {
  assert.equal(plane([V()], { ...opt, typ: undefined, handles: ['anders'] }).csv.length, 0);
  assert.throws(() => plane([V()], { ...opt, prozent: 0 }), /prozent/);
  assert.throws(() => plane([V()], { ...opt, ende: '2026-11-01' }), /Ende/);
});

test('Ende stellt nur abgelaufene, noch reduzierte Produkte zurueck', () => {
  const ab = P({ ende: '2026-11-01', klasse: 'preisanker' });
  const r = ende([
    V({ price: '17.00', compareAtPrice: '20.00', product: ab }),
    V({ id: 'v2', price: '17.00', compareAtPrice: '20.00', product: P({ id: 'p2', ende: '2026-11-30' }) }),
    V({ id: 'v3', price: '20.00', compareAtPrice: null, product: ab }),
  ], { stichtag: '2026-11-02' });
  assert.deepEqual([...r.zurueck.values()].flat(), [{ id: V().id, price: '20.00', compareAtPrice: null }]);
  assert.equal(ende([V({ price: '17.00', compareAtPrice: '20.00', product: ab })], { stichtag: '2026-11-02', klasse: 'aktion' }).csv.length, 0);
});

test('Bulk-Export mit __parentId wird eingebettet', () => {
  const text = [
    JSON.stringify({ id: 'gid://shopify/Product/9', handle: 'h', status: 'ACTIVE', ende: { value: '2026-11-01' }, klasse: null }),
    JSON.stringify({ id: 'gid://shopify/ProductVariant/7', price: '1.00', __parentId: 'gid://shopify/Product/9' }),
  ].join('\n');
  const [v] = ladeExport(text);
  assert.equal(v.product.handle, 'h');
  assert.equal(v.product.ende, '2026-11-01');
});
