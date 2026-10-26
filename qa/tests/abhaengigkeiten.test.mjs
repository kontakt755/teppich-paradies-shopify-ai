import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { fehlendePakete, meldung } from '../../scripts/abhaengigkeiten.mjs';
import { ladePuppeteer } from '../../scripts/puppeteer-laden.mjs';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skript = path.join(wurzel, 'scripts', 'abhaengigkeiten.mjs');

/** Kleines Wegwerf-Repository mit package.json und wahlweise installierten Paketen. */
function repo(installiert = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-abhaengigkeiten-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { liquidjs: '^10' }, devDependencies: { puppeteer: '^25', 'playwright-core': '1' } }));
  for (const name of installiert) {
    fs.mkdirSync(path.join(dir, 'node_modules', name), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', name, 'package.json'), '{}');
  }
  return dir;
}

test('leeres node_modules (Hauptcheckout seit 23.10.): alle Pakete fehlen, die Meldung sagt npm ci', () => {
  const dir = repo();
  fs.mkdirSync(path.join(dir, 'node_modules'));
  assert.deepEqual(fehlendePakete(dir), ['liquidjs', 'playwright-core', 'puppeteer']);
  const text = meldung(fehlendePakete(dir), dir);
  assert.match(text, /^FEHLER: Bibliotheken fehlen/, 'beginnt mit FEHLER - so zeigt npm run pruefen die Zeile');
  assert.match(text, /liquidjs, playwright-core, puppeteer/);
  assert.match(text, /npm ci/);
});

test('vollstaendig installiert: nichts fehlt; ein leerer Paketordner zaehlt nicht', () => {
  assert.deepEqual(fehlendePakete(repo(['liquidjs', 'puppeteer', 'playwright-core'])), []);
  const halb = repo(['liquidjs', 'puppeteer']);
  fs.mkdirSync(path.join(halb, 'node_modules', 'playwright-core'));
  assert.deepEqual(fehlendePakete(halb), ['playwright-core']);
});

test('dieses Repository hat alles, was package.json verlangt (sonst liefe diese Suite gar nicht)', () => {
  assert.deepEqual(fehlendePakete(wurzel), []);
  const r = spawnSync(process.execPath, [skript], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('puppeteer: erst das eigene, dann der Dienst-Checkout, sonst eine klare Meldung', async () => {
  const echt = { launch() {} };
  const eigen = await ladePuppeteer({ importieren: async () => ({ default: echt }), ersatzDir: null, melden: () => {} });
  assert.equal(eigen.puppeteer, echt);
  assert.equal(eigen.quelle, 'eigen');

  // Eigenes fehlt: aus dem Ersatzordner (hier ein Wegwerf-Paket statt ~/tp-dashboard).
  const ersatz = repo();
  const paket = path.join(ersatz, 'node_modules', 'puppeteer');
  fs.mkdirSync(paket, { recursive: true });
  fs.writeFileSync(path.join(paket, 'package.json'), JSON.stringify({ name: 'puppeteer', main: 'index.js' }));
  fs.writeFileSync(path.join(paket, 'index.js'), 'module.exports = { launch() { return "ersatz"; } };');
  const hinweise = [];
  const importieren = async (s) => { if (s === 'puppeteer') throw new Error('Cannot find package'); return import(s); };
  const r = await ladePuppeteer({ importieren, ersatzDir: ersatz, melden: (t) => hinweise.push(t) });
  assert.equal(r.quelle, ersatz);
  assert.equal(r.puppeteer.launch(), 'ersatz');
  assert.match(hinweise[0], /npm ci/);

  await assert.rejects(ladePuppeteer({ importieren, ersatzDir: repo(), melden: () => {} }), /puppeteer fehlt - im Repository-Root `npm ci`/);
});
