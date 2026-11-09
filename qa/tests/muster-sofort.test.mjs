// "Muster sofort lieferbar" (09.11.2026): Farben, deren Muster im Musterlager liegt, zeigen im
// Konfigurator einen Hinweis. Rechenkern: Mustervariante -> SKU -> Abgleich mit der Liste aus dem
// Shop-Metafeld (snippets/tp-muster-sofort). Kein Netzwerk.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const kern = { window: { location: { search: '' }, localStorage: { getItem: () => null, setItem() {} } } };
vm.runInNewContext(read('assets/tp-sample-checkout-core.js'), kern);
const core = kern.window.TPSampleCheckoutCore;

const FARBEN = [{ value: 'Grau' }, { value: 'Beige' }, { value: 'Rot' }];
const muster = { options: [{ name: 'Farbe', position: 1 }], variants: [
  { id: 1, option1: 'Grau', available: true, sku: 'M-TESTVEL4_101' },
  { id: 2, option1: 'Beige', available: true, sku: 'M-TESTVEL4_102' },
  { id: 3, option1: 'Rot', available: false, sku: 'M-TESTVEL4_103' },
] };

test('markSofort: nur Farben mit Lager-SKU, ohne M- und Gross/Klein; gesperrte nie', () => {
  const farben = core.markSofort(core.assignSampleVariants(FARBEN, muster, 'Farbe'), ['testvel4_101', 'TESTVEL4_103']);
  assert.deepEqual(farben.map(f => [f.value, f.sampleSofort]), [['Grau', true], ['Beige', false], ['Rot', false]]);
});

test('markSofort: ohne Liste (Metafeld fehlt) kein Hinweis', () => {
  for (const liste of [[], null, undefined, '']) {
    assert.ok(core.markSofort(core.assignSampleVariants(FARBEN, muster, 'Farbe'), liste).every(f => f.sampleSofort === false));
  }
});

test('Snippet liest custom.muster_sofort und der Konfigurator zeigt den Hinweis ohne Rot', () => {
  const snippet = read('snippets/tp-muster-sofort.liquid');
  assert.match(snippet, /shop\.metafields\.custom\.muster_sofort/);
  assert.match(read('sections/tp-sample-checkout.liquid'), /render 'tp-muster-sofort'/);
  assert.match(read('assets/tp-sample-checkout.js'), /Sofort lieferbar – schneller Versand/);
  const css = read('assets/tp-sample-checkout.css').split('.tp-sample__card-sofort')[1].split('}')[0];
  assert.doesNotMatch(css, /c8102e|b3261e|tp-hauptaktion/);
});
