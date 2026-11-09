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
  const js = read('assets/tp-sample-checkout.js');
  assert.match(js, /'Muster auf Lager'/);
  assert.match(js, /'sofort lieferbar, solange der Vorrat reicht'/);
  for (const klasse of ['.tp-sample__card-plakette', '.tp-sample__card-sofort']) {
    const css = read('assets/tp-sample-checkout.css').split(klasse + ' {')[1].split('}')[0];
    assert.doesNotMatch(css, /c8102e|b3261e|B0303F|tp-hauptaktion/i);
  }
});

test('sofortListe: nur frische Listen (hoechstens 2 Stunden alt), sonst kein Hinweis', () => {
  const jetzt = Date.parse('2026-11-09T12:00:00Z');
  const liste = ['TESTVEL4_101'];
  assert.deepEqual([...core.sofortListe({ skus: liste, stand: '2026-11-09T11:00:00Z' }, jetzt)], liste);
  assert.deepEqual([...core.sofortListe({ skus: liste, stand: '2026-11-09T10:00:00Z' }, jetzt)], liste, 'genau 2 Stunden gilt noch');
  assert.deepEqual([...core.sofortListe({ skus: liste, stand: '2026-11-09T09:59:00Z' }, jetzt)], [], 'Dienst ruht: Hinweis weg');
  assert.deepEqual([...core.sofortListe({ skus: liste }, jetzt)], [], 'ohne Zeitstempel kein Hinweis');
  assert.deepEqual([...core.sofortListe({ skus: '', stand: '' }, jetzt)], [], 'leeres Metafeld');
  assert.deepEqual([...core.sofortListe(null, jetzt)], []);
  assert.match(read('snippets/tp-muster-sofort.liquid'), /"stand":\{\{ tp_ms\.stand/);
});

// Arrays aus dem vm-Kontext haben einen anderen Prototyp: fuer deepEqual in ein eigenes Array kopieren.
const flags = (farben) => Array.from(farben, (f) => f.sampleSofort);

test('markSofort: ohne eigene Mustervariante zaehlt die SKU der Quellvariante (Vinyl von der Rolle, Restrolle)', () => {
  const vinyl = { handle: 'marano-eiche-weiss', id: 1, title: 'Terracora Eiche Weiß – Vinylboden', type: 'Vinyl von der Rolle', tags: [],
    options: [{ name: 'Breite', position: 1 }],
    variants: [{ id: 11, option1: '200 cm', available: true, sku: 'CVALL2_770' }, { id: 12, option1: '400 cm', available: true, sku: 'CVALL4_770' }] };
  const rolle = { handle: 'rustica-restrolle', id: 2, title: 'Rustica 5578 – Restposten', type: 'Teppichboden', tags: ['sonderposten'],
    options: [{ name: 'Title', position: 1 }], variants: [{ id: 21, option1: 'Default Title', available: true, sku: 'TPR0088-VOR-ROLLE' }] };
  const liste = ['CVALL2_770', 'TPR0088-VOR-ROLLE'];
  for (const produkt of [vinyl, rolle]) {
    const farben = core.markSofort(core.assignSampleVariants(core.getUniqueColors(produkt), null, 'Farbe'), liste);
    assert.deepEqual(flags(farben), [true], produkt.handle);
  }
  assert.deepEqual(flags(core.markSofort(core.assignSampleVariants(core.getUniqueColors(vinyl), null, 'Farbe'), ['CVALL4_770'])), [false], 'nur die Quellvariante der Karte zaehlt');
});

test('markSofort: mit eigener Mustervariante entscheidet deren SKU, nicht die der Quelle', () => {
  const quelle = { handle: 'piumera', id: 3, title: 'Piumera', type: 'Teppichboden', tags: [], options: [{ name: 'Farbe', position: 1 }],
    variants: [{ id: 31, option1: 'Grau', available: true, sku: 'QUELLE_1' }] };
  const farben = core.assignSampleVariants(core.getUniqueColors(quelle), { options: [{ name: 'Farbe', position: 1 }], variants: [{ id: 91, option1: 'Grau', available: true, sku: 'M-MUSTER_1' }] }, 'Farbe');
  assert.deepEqual(flags(core.markSofort(farben, ['QUELLE_1'])), [false]);
  assert.deepEqual(flags(core.markSofort(farben, ['MUSTER_1'])), [true]);
});
