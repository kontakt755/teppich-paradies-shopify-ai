import assert from 'node:assert/strict';
import test from 'node:test';
import { hasCartPurchasePath } from '../cart-readiness.mjs';

test('direct add-to-cart CTA is accepted for every product type', () => {
  assert.equal(hasCartPurchasePath('packageProduct', 'In den Warenkorb legen'), true);
});

test('guided roll calculator is accepted before required length input', () => {
  const text = 'Länge eingeben Kostenloses Muster anfragen Warenkorb ansehen';
  assert.equal(hasCartPurchasePath('rollProduct', text), true);
  assert.equal(hasCartPurchasePath('carpetProduct', text), true);
});

test('package products still require a direct cart CTA', () => {
  assert.equal(hasCartPurchasePath('packageProduct', 'Länge eingeben Warenkorb ansehen'), false);
});

test('incomplete roll flow fails closed', () => {
  assert.equal(hasCartPurchasePath('rollProduct', 'Länge eingeben'), false);
});
