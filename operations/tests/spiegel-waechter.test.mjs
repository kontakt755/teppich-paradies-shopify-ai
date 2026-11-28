import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main, bewerte, befunde, SHOP, SPERRE_MERKMAL, BEKANNT } from '../scripts/spiegel-waechter.mjs';

const shopHtml = sperre => `<script>Shopify.shop = "${SHOP}";</script>${sperre ? `<i>${SPERRE_MERKMAL}</i>` : ''}`;

test('bewerte erkennt Spiegel und Sperre', () => {
  assert.deepEqual(bewerte({ header: 'Shopify', html: shopHtml(true) }), { gespiegelt: true, sperre: true });
  assert.equal(bewerte({ header: 'nginx', html: shopHtml(true) }).gespiegelt, false);
  assert.equal(bewerte({ header: 'Shopify', html: '<html></html>' }).gespiegelt, false);
});

test('befunde: bekannte Seite mit Sperre ruhig, ohne Sperre und unbekannte Seite melden', () => {
  assert.deepEqual(befunde([{ host: BEKANNT[0], gespiegelt: true, sperre: true }]), []);
  assert.match(befunde([{ host: BEKANNT[0], gespiegelt: true, sperre: false }])[0].art, /^sperre-weg/);
  assert.match(befunde([{ host: 'teppich-paradies.shop', gespiegelt: true, sperre: true }])[0].art, /^neue-spiegel/);
  assert.deepEqual(befunde([{ host: 'teppich-paradies.shop', gespiegelt: false, sperre: false }]), []);
});

test('main: ruhig, dann Befund nur einmal melden', async () => {
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-spiegel-'));
  const env = { TP_PRIVAT_DIR: privat };
  const meldungen = []; const todos = [];
  const deps = (sperre) => ({ env, aus: () => {}, melde: (...m) => meldungen.push(m), todo: (...t) => todos.push(t),
    abruf: async host => (host === BEKANNT[0] ? { host, gespiegelt: true, sperre } : null) });
  assert.equal(await main([], deps(true)), 0);
  assert.equal(meldungen.length, 0);
  assert.equal(await main([], deps(false)), 1);
  assert.equal(await main([], deps(false)), 1);
  assert.equal(meldungen.length, 1);
  assert.deepEqual(todos.map(t => t[1]), [true]);
  assert.equal(await main(['--trocken'], deps(false)), 1);
  assert.equal(meldungen.length, 1);
});

test('kandidatenHosts: Schreibweise ohne Bindestrich dabei, eigene Domain nie', async () => {
  const { kandidatenHosts } = await import('../scripts/spiegel-waechter.mjs');
  const h = kandidatenHosts();
  assert.ok(h.includes('teppichparadies.de') && h.includes('www.teppich-paradies.shop'));
  assert.ok(BEKANNT.every(b => h.includes(b)));
  assert.ok(!h.includes('teppich-paradies.net') && !h.includes('www.teppich-paradies.net'));
});
