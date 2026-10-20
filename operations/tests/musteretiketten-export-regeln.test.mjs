import test from 'node:test';
import assert from 'node:assert/strict';
import { aufbereiten } from '../lib/lexikon.mjs';
import { BULK_QUERY, jsonlZuProdukten } from '../scripts/lexikon-export.mjs';

// Ausschliesslich erfundene Katalogdaten, keine Zugangsdaten oder Live-Abfragen.
const JETZT = new Date('2026-01-20T12:00:00Z');
const gid = n => `gid://shopify/ProductVariant/${n}`;
const feld = (namespace, key, value) => ({ namespace, key, value });
function variante(n, sku = 'TEST-SAND', farbe = 'Sand', extra = {}) {
  return { id: gid(n), title: `${farbe} / 400 cm`, sku, price: '10.00', availableForSale: true,
    selectedOptions: [{ name: 'Farbe', value: farbe }, { name: 'Breite', value: '400 cm' }], metafields: [], ...extra };
}
function produkt(handle = 'testvelours', varianten = [variante(11)], extra = {}) {
  return { id: `gid://shopify/Product/${handle.length}`, handle, title: 'Testvelours Teppichboden', status: 'ACTIVE',
    productType: 'Teppichboden', onlineStoreUrl: `https://www.teppich-paradies.net/products/${handle}`,
    tags: [], isGiftCard: false, musterBasis: null, metafields: [], variants: varianten, ...extra };
}
function muster(v = variante(99, 'M-TEST-SAND'), handle = 'muster-testvelours') {
  return produkt(handle, [v], { title: 'Muster Testvelours', status: 'UNLISTED' });
}
function modell(produkte) { return aufbereiten({ produkte }, { jetzt: JETZT }); }
function original(produkte, handle = 'muster-testvelours') {
  return modell(produkte).produkte.find(p => p.handle === handle).varianten[0].original;
}

test('Massenexport und JSONL-Weg bewahren die Felder fuer Musterregeln und Dekoroptionen', () => {
  assert.match(BULK_QUERY, /onlineStoreUrl\s+tags\s+isGiftCard/);
  assert.match(BULK_QUERY, /musterBasis:\s*metafield\(namespace:\s*"service",\s*key:\s*"einfass_basis"\)/);
  assert.match(BULK_QUERY, /selectedOptions\s*\{\s*name\s+value\s*\}/);
  const p = produkt('test-vinyl', [], { tags: ['ohne-muster', 'Testtag'], isGiftCard: true,
    musterBasis: { reference: { handle: 'test-basis' } } });
  const v = variante(12, 'TEST-EICHE', null, { title: 'Eiche Rauch / 200 cm', __parentId: p.id,
    selectedOptions: [{ name: 'Dekor', value: 'Eiche Rauch' }, { name: 'Breite', value: '200 cm' }] });
  const roh = jsonlZuProdukten([p, v].map(x => JSON.stringify(x)).join('\n'));
  const vorher = structuredClone(roh);
  const [ergebnis] = aufbereiten(roh, { jetzt: JETZT }).produkte;
  assert.deepEqual(ergebnis.musterRegeln, { tags: ['ohne-muster', 'Testtag'], geschenkgutschein: true,
    basisHandle: 'test-basis', vollstaendig: true });
  assert.equal(ergebnis.onlineStoreUrl, p.onlineStoreUrl);
  assert.equal(ergebnis.varianten[0].farbe, 'Eiche Rauch');
  assert.deepEqual(ergebnis.varianten[0].optionen, [{ name: 'Dekor', wert: 'Eiche Rauch' }, { name: 'Breite', wert: '200 cm' }]);
  assert.deepEqual(roh, vorher, 'Aufbereitung veraendert den Rohkatalog nicht');
});

test('unvollstaendige alte Exporte behaupten keine vollstaendigen Musterregeln oder Optionen', () => {
  const p = produkt();
  delete p.tags;
  delete p.isGiftCard;
  delete p.musterBasis;
  delete p.variants[0].selectedOptions;
  const [alt] = modell([p]).produkte;
  assert.equal(Object.hasOwn(alt, 'musterRegeln'), false);
  assert.equal(Object.hasOwn(alt.varianten[0], 'optionen'), false);
  const ohneBasis = produkt();
  delete ohneBasis.musterBasis;
  assert.equal(modell([ohneBasis]).produkte[0].musterRegeln.vollstaendig, false);
});

test('Shop-SKU hat Vorrang vor gleichlautender Lieferanten-Artikelnr.; Original behaelt ID und SKU', () => {
  const a = produkt('test-a', [variante(11, 'TEST-SAND')]);
  const b = produkt('test-b', [variante(12, 'TEST-ANDERS', 'Grau', { metafields: [feld('einkauf', 'artikelnummer', 'TEST-SAND')] })]);
  const o = original([a, b, muster()]);
  assert.equal(o.gefunden, true);
  assert.equal(o.produktHandle, 'test-a');
  assert.equal(o.variantenId, gid(11));
  assert.equal(o.sku, 'TEST-SAND');
  assert.equal(o.artikelnummer, null, 'Shop-SKU wird nicht zur Lieferanten-Artikelnr. umgedeutet');
});

test('explizite Quellvarianten-ID ist massgeblich auch bei alter abweichender Muster-SKU', () => {
  const a = produkt('test-a', [variante(11, 'TEST-ALT', 'Sand')]);
  const b = produkt('test-b', [variante(12, 'TEST-NEU', 'Grau')]);
  const m = muster(variante(99, 'M-TEST-ALT', 'Sand', { metafields: [feld('einkauf', 'muster_variante', { id: gid(12) })] }));
  const o = original([a, b, m]);
  assert.equal(o.gefunden, true);
  assert.equal(o.produktHandle, 'test-b');
  assert.equal(o.variantenId, gid(12));
  assert.equal(o.sku, 'TEST-NEU');
});

test('veraltete explizite ID faellt weder auf passende M-SKU noch auf Handle zurueck', () => {
  const p = produkt('testvelours', [variante(11, 'TEST-SAND', 'Sand', { metafields: [feld('einkauf', 'artikelnummer', 'TEST-ART')] })]);
  const m = muster(variante(99, 'M-TEST-SAND', 'Sand', { metafields: [feld('einkauf', 'muster_variante', gid(404))] }));
  const o = original([p, m]);
  assert.equal(o.gefunden, false);
  assert.equal(o.quelle, 'muster_variante');
  assert.equal(o.produktHandle, null);
});

test('doppelte Quell-ID fuer verschiedene Produkte darf nie den letzten Treffer waehlen', () => {
  const a = produkt('test-a', [variante(11, 'TEST-A', 'Sand')]);
  const b = produkt('test-b', [variante(11, 'TEST-B', 'Grau')]);
  const m = muster(variante(99, 'M-TEST-A', 'Sand', { metafields: [feld('einkauf', 'muster_variante', gid(11))] }));
  for (const reihenfolge of [[a, b, m], [b, a, m]]) {
    const o = original(reihenfolge);
    assert.equal(o.gefunden, false);
    assert.equal(o.produktHandle, null);
  }
});

for (const fall of ['anderes Produkt', 'andere Farbe']) {
  test(`mehrdeutige Shop-SKU (${fall}) wird gesperrt statt anhand der Reihenfolge zugeordnet`, () => {
    const varianten = [variante(11, 'TEST-DOPPELT', 'Sand'), variante(12, 'TEST-DOPPELT', 'Grau')];
    const normale = fall === 'andere Farbe' ? [produkt('test-a', varianten)]
      : [produkt('test-a', [varianten[0]]), produkt('test-b', [variante(12, 'TEST-DOPPELT', 'Sand')])];
    for (const reihenfolge of [normale, [...normale].reverse()]) {
      const o = original([...reihenfolge, muster(variante(99, 'M-TEST-DOPPELT'))]);
      assert.equal(o.gefunden, false);
      assert.equal(o.produktHandle, null);
    }
  });
}

test('gleiche Shop-SKU und Farbe ueber zwei Breiten bleibt eine belegte Ausfuehrung', () => {
  const p = produkt('test-a', [variante(11), variante(12, 'TEST-SAND', 'Sand', { title: 'Sand / 500 cm' })]);
  const o = original([p, muster()]);
  assert.equal(o.gefunden, true);
  assert.equal(o.produktHandle, p.handle);
  assert.equal(o.sku, 'TEST-SAND');
});

test('mehrdeutige Lieferanten-Artikelnr. wird auch ohne passende Shop-SKU gesperrt', () => {
  const einkauf = [feld('einkauf', 'artikelnummer', 'ART-DOPPELT')];
  const p = produkt('test-a', [variante(11, 'TEST-A', 'Sand', { metafields: einkauf }), variante(12, 'TEST-B', 'Sand', { metafields: einkauf })]);
  const o = original([p, muster(variante(99, 'M-ART-DOPPELT'))]);
  assert.equal(o.gefunden, false);
  assert.equal(o.produktHandle, null);
});

test('bekannte M-SKU ohne Treffer faellt nicht auf die einzige Variante des Handle-Originals', () => {
  const p = produkt('testvelours', [variante(11, 'TEST-NEU', 'Sand', { metafields: [feld('einkauf', 'artikelnummer', 'TEST-ART')] })]);
  const o = original([p, muster(variante(99, 'M-TEST-FEHLT'))]);
  assert.equal(o.gefunden, false);
  assert.equal(o.produktHandle, null);
});

test('Wunschmass und andere Muster sind nie eine gueltige explizite Originalquelle', () => {
  const zuschnitt = produkt('test-zuschnitt', [variante(11, 'TEST-SAND', 'Sand', {
    selectedOptions: [{ name: 'Breite', value: 'Wunschmaß' }] })]);
  const anderesMuster = muster(variante(12, 'M-TEST-ANDERS'), 'muster-anders');
  for (const id of [11, 12]) {
    const m = muster(variante(99, 'M-TEST-SAND', 'Sand', { metafields: [feld('einkauf', 'muster_variante', gid(id))] }));
    assert.equal(original([zuschnitt, anderesMuster, m]).gefunden, false);
  }
});
