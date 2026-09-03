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
