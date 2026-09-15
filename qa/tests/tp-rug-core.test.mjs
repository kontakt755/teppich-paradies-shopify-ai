// Tests fuer den Teppichbereich (Entwurf): Grenzen, Eingaben, fail closed,
// Groessenberater, Teilen-Link, keine Preise, Veroeffentlichungssperre.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const src = fs.readFileSync(path.join(root, 'assets/tp-rug-core.js'), 'utf8');
const core = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'domains/shopify/teppiche/demo-katalog.json'), 'utf8'));

test('Laenge ueber 1.000 cm wird abgelehnt, 1.000 cm ist erlaubt', () => {
  assert.equal(core.validateDims('rechteck', { width: '200', length: '1500' }).ok, false);
  assert.match(core.validateDims('rechteck', { width: '200', length: '1500' }).errors.length, /1\.000 cm/);
  assert.equal(core.validateDims('rechteck', { width: '200', length: '1000' }).ok, true);
  assert.equal(core.validateDims('laeufer', { width: '80', length: '1001' }).ok, false);
  assert.equal(core.validateDims('rund', { diameter: '1200' }).ok, false);
});

test('0 cm, Text und Meter-Eingaben werden verstaendlich abgefangen', () => {
  assert.match(core.validateDims('rechteck', { width: '0', length: '300' }).errors.width, /größer als 0/);
  assert.match(core.validateDims('rechteck', { width: 'abc', length: '300' }).errors.width, /nur Zahlen/);
  const m = core.validateDims('rechteck', { width: '2,5', length: '300' });
  assert.equal(m.suggestions.width, 250);
  assert.match(m.errors.width, /Zentimetern/);
  assert.equal(core.validateDims('rechteck', { width: '12', length: '300' }).suggestions.width, 1200 > 1000 ? undefined : 1200);
  assert.equal(core.parseCm('1.000').value, 1000);
  assert.equal(core.parseCm('').error, 'empty');
});

test('Breitengrenze kommt nur aus den Produktdaten', () => {
  assert.equal(core.validateDims('rechteck', { width: '900', length: '1000' }, {}).ok, true);
  const p = core.normalizeProduct({ shapes: ['rechteck'], max_width_cm: 390 });
  const r = core.validateDims('rechteck', { width: '400', length: '500' }, p);
  assert.equal(r.ok, false);
  assert.match(r.errors.width, /390 cm/);
  assert.equal(core.validateDims('rechteck', { width: '390', length: '1000' }, p).ok, true);
});

test('Geometrie: Dreieck, Vieleck, Seitenverhaeltnis', () => {
  assert.equal(core.validateDims('dreieck', { a: '100', b: '50', c: '40' }).ok, false);
  assert.equal(core.validateDims('dreieck', { a: '200', b: '180', c: '160' }).ok, true);
  assert.equal(core.validateDims('vieleck', { corners: '9', edge: '100' }).ok, false);
  const runner = core.validateDims('laeufer', { width: '100', length: '500' });
  assert.equal(Math.round(runner.metrics.lengthCm / runner.metrics.widthCm), 5);
  const r = core.validateDims('rechteck', { width: '200', length: '300' });
  assert.equal(r.metrics.areaM2.toFixed(2), '6.00');
  assert.equal(r.metrics.perimeterM.toFixed(2), '10.00');
  for (const s of ['rund', 'oval', 'ellipse', 'halbkreis', 'viertelkreis', 'organisch']) {
    const dims = s === 'rund' || s === 'halbkreis' ? { diameter: '200' } : s === 'viertelkreis' ? { radius: '150' } : { width: '160', length: '240' };
    assert.equal(core.validateDims(s, dims).ok, true, s);
  }
});

test('Produktdaten fail closed: Unbekanntes faellt weg', () => {
  const p = core.normalizeProduct({ shapes: ['rechteck', 'stern'], edges: ['kettel', 'gold'], antislip: 'vielleicht', outdoor_suitable: 'ja', camper_suitable: true });
  assert.deepEqual(p.shapes, ['rechteck']);
  assert.deepEqual(p.edges, ['kettel']);
  assert.equal(p.antislip, 'nicht_verfuegbar');
  assert.deepEqual(Object.keys(p.flags), ['camper_suitable']);
});

test('Cover enthaelt immer Antirutschvlies, sonst nur wenn optional gewaehlt', () => {
  const p = core.normalizeProduct({ shapes: ['rechteck'], edges: ['cover', 'kettel'], antislip: 'optional' });
  assert.equal(core.antislipState(p, { edge: 'cover', antiSlip: false }), 'inklusive');
  assert.equal(core.antislipState(p, { edge: 'kettel', antiSlip: true }), 'ja');
  const q = core.normalizeProduct({ shapes: ['rechteck'], edges: ['kettel'], antislip: 'nicht_verfuegbar' });
  assert.equal(core.antislipState(q, { edge: 'kettel', antiSlip: true }), 'nicht_verfuegbar');
});

test('Groessenberater: Regeln und 10-m-Grenze', () => {
  assert.deepEqual([core.adviseSize('wohnzimmer', { sofaBreite: 220 }).width, core.adviseSize('wohnzimmer', { sofaBreite: 220 }).length], [180, 260]);
  const e = core.adviseSize('esszimmer', { tischLaenge: 180, tischBreite: 90 });
  assert.deepEqual([e.width, e.length], [230, 320]);
  const r = core.adviseSize('esszimmer', { tischForm: 'rund', tischLaenge: 120 });
  assert.equal(r.shape, 'rund');
  const f = core.adviseSize('flur', { flurBreite: 110, flurLaenge: 1200 });
  assert.equal(f.capped, true);
  assert.equal(f.length, 1000);
  assert.equal(core.adviseSize('wohnzimmer', {}), null);
});

test('Teilen-Link: nur erlaubte Werte kommen zurueck', () => {
  const enc = core.encodeShare({ product: 'tp-rug-test-wohnzimmer', color: 'Sand', shape: 'rund', dims: { diameter: '200' }, edge: 'paspel', edgeColor: 'beige', antiSlip: true, room: 'wohnzimmer' });
  const dec = core.decodeShare(enc);
  assert.equal(dec.shape, 'rund');
  assert.equal(dec.antiSlip, true);
  assert.equal(core.decodeShare(core.encodeShare({ shape: 'stern', edge: 'gold', room: 'mond' })).shape, '');
  assert.equal(core.decodeShare('%%%'), null);
});

test('Zusammenfassung ohne Preise', () => {
  const p = core.normalizeProduct(catalog.products[0]);
  const text = core.summaryText({ ...core.emptyConfig(p.handle), color: 'Sand', shape: 'rechteck', dims: { width: '200', length: '300' }, edge: 'baumwolle', edgeColor: 'beige', antiSlip: true }, p, 'TPT-TEST');
  assert.doesNotMatch(text, /€|EUR|Preis:/);
  assert.match(text, /Fläche\s+: ca\. 6,00 m²/);
  assert.equal(core.quote().status, 'none');
});

test('Demo-Katalog: TEST-Titel, gueltige Daten, keine Preise', () => {
  assert.ok(catalog.products.length >= 16);
  for (const p of catalog.products) {
    assert.match(p.title, /^TEST /, p.handle);
    assert.match(p.handle, /^tp-rug-test-/);
    const n = core.normalizeProduct(p);
    assert.equal(n.shapes.length, p.shapes.length, `${p.handle}: unbekannte Form`);
    assert.equal(n.edges.length, p.edges.length, `${p.handle}: unbekannte Einfassung`);
    assert.ok(!('price' in p) && !('preis' in p), `${p.handle}: Preis im Katalog`);
    for (const c of p.colors) assert.match(c.hex, /^#[0-9a-f]{6}$/i);
  }
});

test('Jede Teppich-Section steht hinter der Veroeffentlichungssperre', () => {
  const dir = path.join(root, 'sections');
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith('tp-rug-'))) {
    assert.match(fs.readFileSync(path.join(dir, f), 'utf8'), /render 'tp-rug-gate'/, f);
  }
  assert.match(fs.readFileSync(path.join(root, 'snippets/tp-rug-gate.liquid'), 'utf8'), /theme\.role != 'main'/);
});

test('Keine Preise und keine Lieferantennamen im Teppichbereich', () => {
  const files = [
    ...fs.readdirSync(path.join(root, 'sections')).filter((f) => f.startsWith('tp-rug-')).map((f) => `sections/${f}`),
    ...fs.readdirSync(path.join(root, 'snippets')).filter((f) => f.startsWith('tp-rug-')).map((f) => `snippets/${f}`),
    ...fs.readdirSync(path.join(root, 'assets')).filter((f) => /^tp-rug-.*\.js$/.test(f)).map((f) => `assets/${f}`),
    ...fs.readdirSync(path.join(root, 'templates')).filter((f) => /tp-teppich|teppich-konfigurator/.test(f)).map((f) => `templates/${f}`),
    'domains/shopify/teppiche/demo-katalog.json',
  ];
  for (const f of files) {
    const t = fs.readFileSync(path.join(root, f), 'utf8');
    assert.doesNotMatch(t, /\|\s*money|product\.price|variant\.price|€/, `${f}: Preisangabe`);
    assert.doesNotMatch(t, /jordan|joka|m-plus|mplus|knitte|hunnenberg/i, `${f}: Lieferantenname`);
  }
});

test('Erzeugte Bausteine sind aktuell (npm run tp-rug:build)', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts/tp-rug/build-assets.mjs'), '--check'], { cwd: root, stdio: 'pipe' });
});
