import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abgleichen, standPfad, leseStand } from '../lib/muster-sofort.mjs';

// Attrappe der Admin-API: zaehlt Schreibaufrufe, kann scheitern.
function shop({ scheitern = false } = {}) {
  let wert = null;
  const proxy = { schreib: 0, async execute(q, v) {
    if (q.includes('metafieldsSet')) {
      proxy.schreib += 1;
      if (scheitern) throw new Error('HTTP 503');
      wert = v.m[0].value; return { metafieldsSet: { userErrors: [] } };
    }
    return { shop: { id: 'gid://shopify/Shop/1', metafield: wert ? { value: wert } : null } };
  } };
  return proxy;
}
const ordner = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-ms-')); fs.writeFileSync(standPfad(d), JSON.stringify({ aktiv: true })); return d; };
const um = (min) => new Date(Date.parse('2026-11-09T12:00:00Z') + min * 60000);

test('Auffrischen: ohne Aenderung erst nach einer Stunde wieder schreiben (Lebenszeichen fuers Theme)', async () => {
  const dir = ordner(); const p = shop();
  assert.equal((await abgleichen({ dir, skus: ['A'], proxy: p, jetzt: um(0) })).status, 'geschrieben');
  assert.equal((await abgleichen({ dir, skus: ['A'], proxy: p, jetzt: um(59) })).status, 'unveraendert');
  assert.equal((await abgleichen({ dir, skus: ['A'], proxy: p, jetzt: um(61) })).status, 'geschrieben');
  assert.equal(p.schreib, 2);
});

test('Fehler: 15 Minuten Pause, derselbe Fehler wird nur einmal geworfen (eine Protokollzeile)', async () => {
  const dir = ordner(); const p = shop({ scheitern: true });
  await assert.rejects(abgleichen({ dir, skus: ['A'], proxy: p, jetzt: um(0) }), /503/);
  assert.equal((await abgleichen({ dir, skus: ['A'], proxy: p, jetzt: um(5) })).status, 'pause');
  assert.equal(p.schreib, 1, 'in der Pause keine Anfrage');
  assert.equal((await abgleichen({ dir, skus: ['A'], proxy: p, jetzt: um(16) })).status, 'fehler', 'gleicher Fehler: kein Wurf');
  assert.equal(p.schreib, 2);
  // Wieder erreichbar: nach der Pause geschrieben, Fehler weg.
  const ok = shop();
  assert.equal((await abgleichen({ dir, skus: ['A'], proxy: ok, jetzt: um(40) })).status, 'geschrieben');
  assert.equal(leseStand(standPfad(dir)).fehler, null);
});
