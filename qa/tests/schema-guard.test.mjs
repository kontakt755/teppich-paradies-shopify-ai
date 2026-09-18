import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeSchemaSource } from '../schema-guard.mjs';

const wrap = schema => `{% doc %}x{% enddoc %}\n<div></div>\n{% schema %}\n${JSON.stringify(schema, null, 2)}\n{% endschema %}\n`;
const rules = result => result.findings.map(finding => finding.rule);

test('A: gueltiger Block ohne Beanstandung', () => {
  const source = wrap({ name: 'TP Test', tag: null, settings: [], presets: [{ name: 'TP Test' }] });
  const result = analyzeSchemaSource({ source, dir: 'blocks', name: 'tp-test.liquid' });
  assert.equal(result.hasSchema, true);
  assert.deepEqual(result.findings, []);
});

test('B: unbekannter Top-Level-Key ist ein Fehler', () => {
  // Genau der Fehler, der einen Block deployen laesst, ohne dass er im
  // Theme-Editor auftaucht - Shopify ignoriert "target" wortlos.
  const source = wrap({ name: 'TP Test', target: 'product_cards', settings: [], presets: [{ name: 'TP Test' }] });
  const result = analyzeSchemaSource({ source, dir: 'blocks', name: 'tp-test.liquid' });
  const unknown = result.findings.find(finding => finding.rule === 'SCHEMA_UNKNOWN_KEY');
  assert.ok(unknown, 'SCHEMA_UNKNOWN_KEY erwartet');
  assert.equal(unknown.severity, 'error');
  assert.match(unknown.message, /target/);
});

test('C: fehlendes presets warnt, private und statische Bloecke nicht', () => {
  const source = wrap({ name: 'TP Test', settings: [] });
  assert.ok(rules(analyzeSchemaSource({ source, dir: 'blocks', name: 'tp-test.liquid' })).includes('SCHEMA_NO_PRESETS'));

  // Unterstrich-Praefix markiert private Bloecke, die nur verschachtelt
  // vorkommen; die fuenf statischen Bloecke sind dokumentierte Ausnahmen.
  assert.deepEqual(rules(analyzeSchemaSource({ source, dir: 'blocks', name: '_intern.liquid' })), []);
  assert.deepEqual(rules(analyzeSchemaSource({ source, dir: 'blocks', name: 'filters.liquid' })), []);
});

test('D: section-only Keys sind in Sections erlaubt, in Bloecken nicht', () => {
  const source = wrap({ name: 'S', settings: [], presets: [{ name: 'S' }], limit: 1, default: {} });
  assert.deepEqual(rules(analyzeSchemaSource({ source, dir: 'sections', name: 's.liquid' })), []);
  assert.deepEqual(
    rules(analyzeSchemaSource({ source, dir: 'blocks', name: 'b.liquid' })),
    ['SCHEMA_UNKNOWN_KEY', 'SCHEMA_UNKNOWN_KEY'],
  );
});

test('E: kaputtes JSON meldet genau einen Fehler', () => {
  const source = '{% schema %}\n{ "name": "X", }\n{% endschema %}\n';
  const result = analyzeSchemaSource({ source, dir: 'blocks', name: 'x.liquid' });
  assert.deepEqual(rules(result), ['SCHEMA_INVALID_JSON']);
});

test('F: Settings ohne id und doppelte ids', () => {
  const source = wrap({
    name: 'X',
    presets: [{ name: 'X' }],
    settings: [
      { type: 'header', content: 'Ohne id erlaubt' },
      { type: 'range', label: 'Kaputt' },
      { type: 'text', id: 'a', label: 'A' },
      { type: 'text', id: 'a', label: 'Nochmal A' },
    ],
  });
  assert.deepEqual(
    rules(analyzeSchemaSource({ source, dir: 'blocks', name: 'x.liquid' })),
    ['SETTING_WITHOUT_ID', 'DUPLICATE_SETTING_ID'],
  );
});

test('G: Datei ohne Schema wird uebersprungen', () => {
  const result = analyzeSchemaSource({ source: '<div>nur Markup</div>', dir: 'blocks', name: 'x.liquid' });
  assert.equal(result.hasSchema, false);
  assert.deepEqual(result.findings, []);
});

test('H: Block-Name ueber 25 Zeichen bricht den Push ab', () => {
  // Der echte Fall vom 2026-09-15: 29 Zeichen, lokal gruen, Push abgelehnt.
  const source = wrap({ name: 'TP Google-Bewertung (inaktiv)', tag: null, settings: [] });
  assert.deepEqual(rules(analyzeSchemaSource({ source, dir: 'blocks', name: 'tp-x.liquid' })), [
    'SCHEMA_NAME_TOO_LONG',
    'SCHEMA_NO_PRESETS',
  ]);
});

test('H2: genau 25 Zeichen sind erlaubt', () => {
  const name = 'x'.repeat(25);
  const source = wrap({ name, tag: null, settings: [], presets: [{ name: 'k' }] });
  assert.deepEqual(rules(analyzeSchemaSource({ source, dir: 'blocks', name: 'tp-x.liquid' })), []);
});

test('H3: langer Preset-Name im Block wird gemeldet', () => {
  const source = wrap({ name: 'TP Kurz', tag: null, settings: [], presets: [{ name: 'y'.repeat(26) }] });
  assert.deepEqual(rules(analyzeSchemaSource({ source, dir: 'blocks', name: 'tp-x.liquid' })), [
    'PRESET_NAME_TOO_LONG',
  ]);
});

test('H4: Sections und t:-Schluessel bleiben unangetastet', () => {
  // Sections mit 30 Zeichen liegen im Bestand und pushen sauber; ein
  // "t:"-Name wird erst beim Rendern aufgeloest und ist hier nicht messbar.
  const lang = wrap({ name: 'Section rendering product card', settings: [], presets: [{ name: 'a' }] });
  assert.deepEqual(rules(analyzeSchemaSource({ source: lang, dir: 'sections', name: 's.liquid' })), []);

  const key = wrap({ name: 't:names.product_recommendations', settings: [], presets: [{ name: 'a' }] });
  assert.deepEqual(rules(analyzeSchemaSource({ source: key, dir: 'blocks', name: 'b.liquid' })), []);
});
