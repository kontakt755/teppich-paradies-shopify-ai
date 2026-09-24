import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { erzeugePlan, schreibePlanDateien, argumente } from '../scripts/anreicherung.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tp-anreicherung-'));
}

function schreibeQuellen(dir) {
  const lieferantenDir = path.join(dir, 'lieferantendaten');
  fs.mkdirSync(lieferantenDir, { recursive: true });
  const cachePfad = path.join(lieferantenDir, 'lieferant-a-produktseiten-2026-09-23.json');
  const katalogPfad = path.join(lieferantenDir, 'lieferant-a-katalog-2026-09-22.json');
  fs.writeFileSync(cachePfad, JSON.stringify({
    4711: { kollektion: 'Testkollektion', marke: 'Testmarke', attrs: { Material: 'Polyester' }, url: 'https://lieferant-a.example/de-DE/product/4711' },
  }));
  fs.writeFileSync(katalogPfad, JSON.stringify({
    'SKU-1': { found: true, total: 1, match: { material_number: 'SKU-1', url: 'https://lieferant-a.example/de-DE/product/4711' } },
  }));
  const lexikonDir = path.join(dir, 'lexikon');
  fs.mkdirSync(lexikonDir, { recursive: true });
  fs.writeFileSync(path.join(lexikonDir, 'produkte.json'), JSON.stringify({
    produkte: [{
      handle: 'testteppich',
      adminUrl: 'https://admin.shopify.com/store/sjjyq1-6w/products/9001',
      eigenschaften: {},
      varianten: [{ sku: 'SKU-1', id: 'gid://shopify/ProductVariant/1', einkauf: {} }],
    }],
  }));
  return { cachePfad, katalogPfad };
}

test('erzeugePlan: findet die neueste Cache-/Katalogdatei automatisch und plant Werte', () => {
  const dir = tmpDir();
  schreibeQuellen(dir);
  const plan = erzeugePlan({ privatDir: dir });
  assert.ok(plan.werte.length > 0);
  assert.ok(plan.quellen.cachePfad.includes('lieferant-a-produktseiten-'));
  assert.ok(plan.quellen.katalogPfad.includes('lieferant-a-katalog-'));
});

test('erzeugePlan: fehlendes Lexikon wirft eine klare Fehlermeldung statt still leer zu planen', () => {
  const dir = tmpDir();
  schreibeQuellen(dir);
  fs.rmSync(path.join(dir, 'lexikon'), { recursive: true, force: true });
  assert.throws(() => erzeugePlan({ privatDir: dir }), /Lexikon/);
});

test('schreibePlanDateien: legt plan.json, offen.json, rollback.json, Batches an - schreibt nichts nach Shopify', () => {
  const dir = tmpDir();
  schreibeQuellen(dir);
  const plan = erzeugePlan({ privatDir: dir });
  const zielDir = path.join(dir, 'anreicherung');
  const { batchDateien } = schreibePlanDateien(zielDir, plan);

  assert.ok(fs.existsSync(path.join(zielDir, 'plan.json')));
  assert.ok(fs.existsSync(path.join(zielDir, 'offen.json')));
  assert.ok(fs.existsSync(path.join(zielDir, 'rollback.json')));
  assert.ok(fs.existsSync(path.join(zielDir, 'konflikte.json')));
  assert.ok(fs.existsSync(path.join(zielDir, 'neue-metaobjekte.json')));
  assert.ok(batchDateien >= 1);
  const batchDatei = fs.readdirSync(path.join(zielDir, 'batches')).find((n) => /^x\d+\.gql$/.test(n));
  assert.ok(batchDatei);
  const inhalt = fs.readFileSync(path.join(zielDir, 'batches', batchDatei), 'utf8');
  assert.ok(inhalt.includes('metafieldsSet'));

  const geplant = JSON.parse(fs.readFileSync(path.join(zielDir, 'plan.json'), 'utf8'));
  assert.equal(geplant.length, plan.werte.length);
});

test('schreibePlanDateien: ein zweiter Lauf mit weniger Werten raeumt alte Batchdateien auf', () => {
  const dir = tmpDir();
  schreibeQuellen(dir);
  const zielDir = path.join(dir, 'anreicherung');
  const vieleWerte = Array.from({ length: 300 }, (_, i) => ({ ownerId: `gid://shopify/Product/${i}`, namespace: 'custom', key: 'material', type: 'single_line_text_field', value: 'x' }));
  schreibePlanDateien(zielDir, { werte: vieleWerte, offen: [], konflikte: [], neueMetaobjekte: {} });
  const vorher = fs.readdirSync(path.join(zielDir, 'batches')).filter((n) => /^x\d+\.gql$/.test(n));
  assert.ok(vorher.length > 1);

  schreibePlanDateien(zielDir, { werte: [vieleWerte[0]], offen: [], konflikte: [], neueMetaobjekte: {} });
  const nachher = fs.readdirSync(path.join(zielDir, 'batches')).filter((n) => /^x\d+\.gql$/.test(n));
  assert.equal(nachher.length, 1);
});

test('argumente: --schreiben ist standardmaessig aus (nur planen)', () => {
  assert.equal(argumente([]).schreiben, false);
  assert.equal(argumente(['--schreiben']).schreiben, true);
});

test('argumente: wirft bei unbekanntem Argument', () => {
  assert.throws(() => argumente(['--unbekannt']), /Unbekanntes Argument/);
});
