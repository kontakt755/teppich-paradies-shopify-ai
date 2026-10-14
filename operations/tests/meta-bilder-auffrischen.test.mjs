import test from 'node:test';
import assert from 'node:assert/strict';
import { produktIds, auffrischen, medienNeuAnhaengen, abfrage, TAG } from '../scripts/meta-bilder-auffrischen.mjs';

test('produktIds blaettert alle Seiten durch', async () => {
  const seiten = [
    { products: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [{ id: 'p1' }, { id: 'p2' }] } },
    { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'p3' }] } },
  ];
  assert.deepEqual(await produktIds({ execute: async () => seiten.shift() }), ['p1', 'p2', 'p3']);
});

test('auffrischen setzt und entfernt den Tag je Produkt, pausiert dazwischen und zaehlt Fehler', async () => {
  const aufrufe = [];
  const proxy = {
    execute: async (q, v) => {
      const art = q.includes('tagsAdd') ? 'tagsAdd' : 'tagsRemove';
      aufrufe.push(`${art}:${v.id}`);
      assert.ok(q.includes(TAG));
      const userErrors = v.id === 'p2' && art === 'tagsAdd' ? [{ message: 'kaputt' }] : [];
      return { [art]: { userErrors } };
    },
  };
  const pausen = [];
  const fehler = await auffrischen(proxy, ['p1', 'p2'], { pause: 5, warte: async (ms) => pausen.push(ms), log: () => {} });
  assert.deepEqual(aufrufe, ['tagsAdd:p1', 'tagsRemove:p1', 'tagsAdd:p2', 'tagsRemove:p2'], 'Entfernen auch nach Fehler beim Setzen');
  assert.deepEqual(pausen, [5], 'keine Pause nach dem letzten Produkt');
  assert.equal(fehler, 1);
});

test('abfrage haengt die Zusatzsuche an den Kanal-Filter', () => {
  assert.equal(abfrage(), 'publication_ids:376821973326 status:active');
  assert.equal(abfrage('vendor:Vorwerk'), 'publication_ids:376821973326 status:active vendor:Vorwerk');
});

test('medienNeuAnhaengen haengt ab und wieder an und haengt fehlende ein zweites Mal an', async () => {
  const bild = { v1: 'm1', v2: 'm2', v3: null };
  let ersterAnhang = true;
  const aufrufe = [];
  const proxy = {
    execute: async (q, v) => {
      if (q.includes('variants(first')) {
        return { product: { variants: { pageInfo: { hasNextPage: false }, nodes: Object.entries(bild).map(([id, m]) => ({ id, media: { nodes: m ? [{ id: m }] : [] } })) } } };
      }
      if (q.includes('DetachMedia')) { aufrufe.push(['ab', v.m.map((x) => x.variantId)]); v.m.forEach((x) => { bild[x.variantId] = null; }); return { productVariantDetachMedia: { userErrors: [] } }; }
      aufrufe.push(['an', v.m.map((x) => x.variantId)]);
      // Erster Anhang verliert v2, der zweite klappt.
      v.m.forEach((x) => { if (!(ersterAnhang && x.variantId === 'v2')) bild[x.variantId] = x.mediaIds[0]; });
      ersterAnhang = false;
      return { productVariantAppendMedia: { userErrors: [] } };
    },
  };
  assert.equal(await medienNeuAnhaengen(proxy, 'p1'), '');
  assert.deepEqual(aufrufe, [['ab', ['v1', 'v2']], ['an', ['v1', 'v2']], ['an', ['v2']]]);
  assert.deepEqual(bild, { v1: 'm1', v2: 'm2', v3: null }, 'Endzustand wie vorher, Variante ohne Bild bleibt ohne');
});

test('medienNeuAnhaengen teilt mehr als 100 Varianten auf mehrere Aufrufe auf', async () => {
  const ids = Array.from({ length: 146 }, (_, i) => `v${i}`);
  const groessen = [];
  const proxy = {
    execute: async (q, v) => {
      if (q.includes('variants(first')) return { product: { variants: { pageInfo: { hasNextPage: false }, nodes: ids.map((id) => ({ id, media: { nodes: [{ id: `m${id}` }] } })) } } };
      groessen.push(v.m.length);
      return q.includes('DetachMedia') ? { productVariantDetachMedia: { userErrors: [] } } : { productVariantAppendMedia: { userErrors: [] } };
    },
  };
  assert.equal(await medienNeuAnhaengen(proxy, 'p'), '');
  assert.deepEqual(groessen, [100, 46, 100, 46]);
});
