import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { istTrackingAnfrage, sperreTracking } from '../tracking-sperre.mjs';

test('Messanfragen werden erkannt', () => {
  for (const url of [
    'https://region1.google-analytics.com/g/collect?v=2&tid=G-XYZ',
    'https://www.googletagmanager.com/gtag/js?id=G-XYZ',
    'https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1/',
    'https://www.google.com/pagead/1p-conversion/1/',
    'https://www.googleadservices.com/pagead/conversion/1/',
    'https://connect.facebook.net/en_US/fbevents.js',
    'https://www.facebook.com/tr/?id=1&ev=PageView',
    'https://monorail-edge.shopifysvc.com/v1/produce',
    'https://www.teppich-paradies.net/.well-known/shopify/monorail/unstable/produce_batch',
    'https://www.teppich-paradies.net/api/collect',
  ]) assert.equal(istTrackingAnfrage(url), true, url);
});

test('Shop, Warenkorb, Checkout und CDN bleiben frei', () => {
  for (const url of [
    'https://www.teppich-paradies.net/products/rivena-teppich-nach-mass',
    'https://www.teppich-paradies.net/cart/add.js',
    'https://www.teppich-paradies.net/checkouts/cn/abc',
    'https://cdn.shopify.com/s/files/1/x.js',
    'https://www.google.com/maps/embed?pb=1',
    'https://fonts.googleapis.com/css2?family=Inter',
    'https://www.teppich-paradies.net/collections/analytics-heft',
  ]) assert.equal(istTrackingAnfrage(url), false, url);
});

test('sperreTracking beantwortet mit 204 und zaehlt', async () => {
  let handler;
  let filter;
  const context = { route: async (f, h) => { filter = f; handler = h; } };
  const sperre = await sperreTracking(context);
  assert.equal(filter('https://www.facebook.com/tr/?ev=x'), true);
  let antwort;
  await handler({ fulfill: async (a) => { antwort = a; } });
  assert.deepEqual(antwort, { status: 204, body: '' });
  assert.equal(sperre.gesperrt(), 1);
});

test('alle Storefront-Laeufe mit Warenkorb oder Klicks haengen die Sperre an', () => {
  for (const datei of ['run-qa.mjs', 'run-sales-readiness.mjs', 'run-compare-check.mjs', 'run-compare-remove-dialog.mjs', 'run-menu-visual.mjs']) {
    const source = fs.readFileSync(new URL(`../${datei}`, import.meta.url), 'utf8');
    const text = source.trim() === "import './run-compare-check.mjs';"
      ? fs.readFileSync(new URL('../run-compare-check.mjs', import.meta.url), 'utf8')
      : source;
    assert.match(text, /sperreTracking\(/, `${datei} ohne Tracking-Sperre`);
  }
});
