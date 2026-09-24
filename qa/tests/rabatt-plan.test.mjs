import assert from 'node:assert/strict';
import test from 'node:test';
import { plane, planeVariante, stufeFuer } from '../../operations/scripts/rabatt-plan.mjs';

const cfg = { stufen: { Teppichboden: 15, Sockelleisten: 5 }, bestehendeRabatteBehalten: true, ohneTypNachHandle: { vinyl: 15 } };
const P = (o) => ({ id: 'gid://shopify/Product/1', handle: 'x', productType: 'Teppichboden', status: 'ACTIVE', ...o });

test('Stufe nur fuer aktive Produkte bekannter Typen', () => {
  assert.equal(stufeFuer(P(), cfg), 15);
  assert.equal(stufeFuer(P({ status: 'DRAFT' }), cfg), null);
  assert.equal(stufeFuer(P({ productType: 'Service' }), cfg), null);
  assert.equal(stufeFuer(P({ productType: '', handle: 'a-klickvinyl-b' }), cfg), 15);
});

test('regulaerer Preis wird Vergleichspreis, Verkaufspreis sinkt', () => {
  assert.deepEqual(planeVariante({ price: '49.95', compareAtPrice: null }, 15, cfg), { price: '42.46', compareAtPrice: '49.95' });
  assert.deepEqual(planeVariante({ price: '10.00', compareAtPrice: '8.00' }, 5, cfg), { price: '9.50', compareAtPrice: '10.00' });
});

test('Muster, Nullpreis und bestehender Rabatt bleiben unberuehrt', () => {
  assert.equal(planeVariante({ price: '5', sku: 'M-123' }, 15, cfg), null);
  assert.equal(planeVariante({ price: '0.00' }, 15, cfg), null);
  assert.equal(planeVariante({ price: '34.95', compareAtPrice: '49.95' }, 15, cfg), null);
});

test('bestehender Rabatt wird trotzdem als dauerrabatt markiert', () => {
  const { varianten, produkte } = plane([{ id: 'v1', price: '34.95', compareAtPrice: '49.95', product: P() }], cfg);
  assert.equal(varianten.size, 0);
  assert.equal(produkte.size, 1);
});
