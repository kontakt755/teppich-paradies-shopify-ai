import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../../assets/tp-rollware-art.js');
require('../../assets/tp-boden-finder.js');
require('../../assets/tp-raummass.js');
const finder = globalThis.TPBodenFinder.logik;
const raumhilfe = globalThis.TPRaummass;
const origin = 'https://shop.example';

test('Finder-Raum in cm erreicht die Produktseite mit Variante und Sprungmarke', () => {
  const raum = { breite: finder.raumMass('3,5 m'), laenge: finder.raumMass('420 cm') };
  const href = finder.produktUrl('/collections/boden/products/beispiel?variant=123&ref=karte#masse', raum, origin);
  const url = new URL(href, origin);
  assert.equal(url.pathname, '/collections/boden/products/beispiel');
  assert.equal(url.searchParams.get('variant'), '123');
  assert.equal(url.searchParams.get('ref'), 'karte');
  assert.equal(url.hash, '#masse');
  assert.deepEqual(raumhilfe.finderRaum(url.search), { breite: 350, laenge: 420 });
});

test('kleinste und groesste Raumseiten behalten ihre Zentimetereinheit', () => {
  for (const raum of [{ breite: 50, laenge: 5000 }, { breite: 5000, laenge: 50 }]) {
    const url = new URL(finder.produktUrl('/de/products/beispiel', raum, origin), origin);
    assert.deepEqual(raumhilfe.finderRaum(url.search), raum);
  }
});

test('neue Finder-Angaben ersetzen alte Werte; ohne Raum verbleibt keine alte Vorgabe', () => {
  const alt = '/products/beispiel?variant=456&tp_raum_b=100&tp_raum_b=200&tp_raum_l=300';
  const neu = new URL(finder.produktUrl(alt, { breite: 320, laenge: 450 }, origin), origin);
  assert.deepEqual(neu.searchParams.getAll('tp_raum_b'), ['320']);
  assert.deepEqual(raumhilfe.finderRaum(neu.search), { breite: 320, laenge: 450 });
  const ohne = new URL(finder.produktUrl(neu.href, null, origin), origin);
  assert.equal(ohne.searchParams.get('variant'), '456');
  assert.equal(ohne.searchParams.has('tp_raum_b'), false);
  assert.equal(ohne.searchParams.has('tp_raum_l'), false);
});

test('Beratungs-, Kollektions- und fremde Links erhalten keine Raumparameter', () => {
  for (const href of ['/pages/beratung', '/collections/boden', '#auswahl', 'https://anders.example/products/beispiel', 'mailto:test@example.test', 'javascript:void(0)']) {
    assert.equal(finder.produktUrl(href, { breite: 350, laenge: 420 }, origin), href);
  }
});

test('fehlende, mehrdeutige oder ungueltige Uebergaben werden als Ganzes ignoriert', () => {
  for (const suche of ['', '?tp_raum_b=350', '?tp_raum_l=420', '?tp_raum_b=350&tp_raum_b=360&tp_raum_l=420',
    '?tp_raum_b=350&tp_raum_l=420&tp_raum_l=430', '?tp_raum_b=3.5&tp_raum_l=4.2',
    '?tp_raum_b=350cm&tp_raum_l=420', '?tp_raum_b=-350&tp_raum_l=420', '?tp_raum_b=49&tp_raum_l=420',
    '?tp_raum_b=350&tp_raum_l=5001', '?tp_raum_b=1e3&tp_raum_l=420']) {
    assert.equal(raumhilfe.finderRaum(suche), null, suche);
  }
});

test('Finder uebertraegt nur ganze, fuer die Raumhilfe gueltige Zentimeter', () => {
  for (const breite of [null, NaN, Infinity, '350', 0, 49, 5001, 350.5]) {
    const url = new URL(finder.produktUrl('/products/beispiel', { breite, laenge: 420 }, origin), origin);
    assert.equal(raumhilfe.finderRaum(url.search), null, String(breite));
  }
});
