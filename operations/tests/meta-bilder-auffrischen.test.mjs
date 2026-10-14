import test from 'node:test';
import assert from 'node:assert/strict';
import { produktIds, auffrischen, TAG } from '../scripts/meta-bilder-auffrischen.mjs';

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
