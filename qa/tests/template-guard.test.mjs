import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeTemplates, blockTypesOf, stripHeader } from '../template-guard.mjs';

const template = (order, types) => JSON.stringify({
  sections: { main: { blocks: { pc: {
    type: '_product-card',
    blocks: Object.fromEntries(order.map((id, i) => [id, { type: types[i] }])),
    block_order: order,
  } } } },
});

test('A: Kommentarkopf wird entfernt, JSON bleibt lesbar', () => {
  const raw = '/*\n * auto-generated\n */\n{"a":1}';
  assert.deepEqual(JSON.parse(stripHeader(raw)), { a: 1 });
  assert.deepEqual(JSON.parse(stripHeader('{"a":1}')), { a: 1 });
});

test('B: Blocktypen kommen in block_order-Reihenfolge', () => {
  const raw = template(['g', 'p'], ['_product-card-gallery', 'price']);
  assert.deepEqual(blockTypesOf(raw, '_product-card'), ['_product-card-gallery', 'price']);
  assert.equal(blockTypesOf(raw, 'gibt-es-nicht'), null);
});

test('C: einheitliche Templates ergeben keine Findings', () => {
  const templates = [
    { name: 'a.json', types: ['price', 'specs'] },
    { name: 'b.json', types: ['price', 'specs'] },
  ];
  assert.deepEqual(analyzeTemplates(templates), []);
});

test('D: Drift nennt genau die Templates, in denen der Block fehlt', () => {
  const findings = analyzeTemplates([
    { name: 'a.json', types: ['price', 'specs'] },
    { name: 'b.json', types: ['price'] },
    { name: 'c.json', types: ['price'] },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'BLOCK_DRIFT');
  assert.equal(findings[0].severity, 'warn');
  assert.deepEqual(findings[0].templates, ['b.json', 'c.json']);
});

test('E: fehlender Pflichtblock ist ein Fehler', () => {
  const findings = analyzeTemplates(
    [{ name: 'a.json', types: ['price'] }, { name: 'b.json', types: [] }],
    { required: ['price'] },
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'REQUIRED_BLOCK_MISSING');
  assert.equal(findings[0].severity, 'error');
  assert.deepEqual(findings[0].templates, ['b.json']);
});

test('F: als optional erklaerte Typen loesen keinen Drift aus', () => {
  const templates = [
    { name: 'a.json', types: ['tp-card-title'] },
    { name: 'b.json', types: ['product-title'] },
  ];
  assert.equal(analyzeTemplates(templates).length, 2);
  assert.deepEqual(analyzeTemplates(templates, { optional: ['tp-card-title', 'product-title'] }), []);
});

// --- bewusstAbwesend: Block plus Template, nicht Block allein ------------

test('G: bewusstAbwesend unterdrueckt den Drift nur in den genannten Templates', () => {
  const templates = [
    { name: 'collection.teppichboden.json', types: ['tp-card-price-sqm'] },
    { name: 'collection.vinyl.json', types: ['tp-card-price-sqm'] },
    { name: 'collection.zubehoer.json', types: [] },
  ];
  const cfg = { bewusstAbwesend: { 'tp-card-price-sqm': ['collection.zubehoer.json'] } };
  assert.deepEqual(analyzeTemplates(templates, cfg), []);
  // Ohne die Ausnahme waere es ein Fund - der Testfall selbst muss also greifen.
  assert.equal(analyzeTemplates(templates).length, 1);
});

test('G2: bewusstAbwesend verdeckt keinen Drift in anderen Templates', () => {
  // Derselbe Block faellt zusaetzlich aus einem Template heraus, das nicht
  // ausgenommen ist. Genau das wuerde `optional` stillschweigend schlucken.
  const templates = [
    { name: 'collection.teppichboden.json', types: [] },
    { name: 'collection.vinyl.json', types: ['tp-card-price-sqm'] },
    { name: 'collection.zubehoer.json', types: [] },
  ];
  const cfg = { bewusstAbwesend: { 'tp-card-price-sqm': ['collection.zubehoer.json'] } };
  const findings = analyzeTemplates(templates, cfg);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'BLOCK_DRIFT');
  assert.deepEqual(findings[0].templates, ['collection.teppichboden.json']);
});

// Diese Liste ist mit Absicht kurz und wird nur nach einer Entscheidung
// erweitert. Zubehoer seit 2026-09-09, Bodenleisten am selben Tag dazu,
// nachdem die Kategorieseite auf eine eigene Produktkarte umgebaut wurde.
const AUSNAHME_ERLAUBT = /^collection\.(zubehoer|bodenleisten)/;

test('G3: die echte Konfiguration nimmt nur Zubehoer und Bodenleisten aus', async () => {
  const { readFileSync } = await import('node:fs');
  const cfg = JSON.parse(readFileSync(new URL('../template-guard.config.json', import.meta.url), 'utf8'));
  for (const [typ, tpls] of Object.entries(cfg.bewusstAbwesend ?? {})) {
    assert.ok(tpls.length > 0, `${typ} hat einen leeren Ausnahmeeintrag`);
    for (const t of tpls) {
      assert.match(t, AUSNAHME_ERLAUBT, `${typ}: ${t} ist weder Zubehoer- noch Bodenleisten-Template`);
    }
  }
});

// --- nurIn: Bloecke, die nur in ein Template gehoeren -------------------

const NUR_IN = { nurIn: { 'tp-card-leisten': ['collection.bodenleisten.json'] } };

test('H: nurIn meldet nicht, dass der Block ueberall sonst fehlt', () => {
  const templates = [
    { name: 'collection.bodenleisten.json', types: ['tp-card-leisten'] },
    { name: 'collection.teppichboden.json', types: [] },
  ];
  assert.deepEqual(analyzeTemplates(templates, NUR_IN), []);
  // Ohne nurIn waere es ein Fund - der Testfall muss also greifen.
  assert.equal(analyzeTemplates(templates).length, 1);
});

test('H2: nurIn meldet, wenn der Block in einem fremden Template auftaucht', () => {
  const templates = [
    { name: 'collection.bodenleisten.json', types: ['tp-card-leisten'] },
    { name: 'collection.teppichboden.json', types: ['tp-card-leisten'] },
  ];
  // In allen Templates vorhanden - ohne nurIn faende der Guard hier nichts.
  assert.deepEqual(analyzeTemplates(templates), []);
  const findings = analyzeTemplates(templates, NUR_IN);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].templates, ['collection.teppichboden.json']);
});

test('H3: nurIn meldet, wenn der Block aus seinem eigenen Template faellt', () => {
  const templates = [
    { name: 'collection.bodenleisten.json', types: [] },
    { name: 'collection.teppichboden.json', types: [] },
  ];
  const findings = analyzeTemplates(templates, NUR_IN);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, 'tp-card-leisten');
  assert.match(findings[0].message, /in keinem Template mehr/);
});

test('H4: nurIn meldet auch, wenn er nur aus seinem Template faellt, sonst aber existiert', () => {
  const templates = [
    { name: 'collection.bodenleisten.json', types: [] },
    { name: 'collection.teppichboden.json', types: ['tp-card-leisten'] },
  ];
  const findings = analyzeTemplates(templates, NUR_IN);
  assert.equal(findings.length, 1);
  assert.ok(findings[0].templates.includes('collection.bodenleisten.json'));
});

test('H5: die echte Konfiguration nennt fuer nurIn nur Bodenleisten', async () => {
  const { readFileSync } = await import('node:fs');
  const cfg = JSON.parse(readFileSync(new URL('../template-guard.config.json', import.meta.url), 'utf8'));
  for (const [typ, tpls] of Object.entries(cfg.nurIn ?? {})) {
    assert.ok(tpls.length > 0, `${typ} hat einen leeren nurIn-Eintrag`);
    assert.deepEqual(tpls, ['collection.bodenleisten.json'], `${typ} nennt ein unerwartetes Template`);
  }
});
