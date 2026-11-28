import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchEinkauf } from '../kern/api.mjs';

function mitFetch(antworten, fn) {
  const alt = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => { const a = antworten[Math.min(n++, antworten.length - 1)]; if (a instanceof Error) throw a; return a; };
  return fn(() => n).finally(() => { globalThis.fetch = alt; });
}
const ok = { ok: true, status: 200, json: async () => ({ verfuegbar: true }) };

test('Neustart des Dienstes: Lesen wird wiederholt und liefert dann die Daten', () => mitFetch(
  [new TypeError('Failed to fetch'), new TypeError('Failed to fetch'), ok],
  async anzahl => {
    assert.deepEqual(await fetchEinkauf('/api/x', { pausen: [1, 1, 1] }), { verfuegbar: true });
    assert.equal(anzahl(), 3);
  }));

test('Bleibt der Dienst weg, ist der Fehler als Verbindungsfehler markiert', () => mitFetch(
  [new TypeError('Failed to fetch')],
  async anzahl => {
    const d = await fetchEinkauf('/api/x', { pausen: [1] });
    assert.equal(d.fehler, true);
    assert.equal(d.verbindung, true);
    assert.equal(anzahl(), 2);
  }));

test('Ein Serverfehler wird nicht wiederholt', () => mitFetch(
  [{ ok: false, status: 500, json: async () => ({}) }],
  async anzahl => {
    const d = await fetchEinkauf('/api/x', { pausen: [1, 1] });
    assert.equal(d.verbindung, false);
    assert.equal(anzahl(), 1);
  }));

test('Eine gelungene Antwort wird nicht wiederholt', () => mitFetch([ok], async anzahl => {
  await fetchEinkauf('/api/x', { pausen: [1, 1, 1] });
  assert.equal(anzahl(), 1);
}));
