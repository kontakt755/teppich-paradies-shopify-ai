import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const templates = fs.readdirSync('templates').filter((name) => /^product.*\.json$/.test(name));
const templateMatrix = templates.map((name) => {
  const source = read(path.join('templates', name));
  const json = JSON.parse(source.slice(source.indexOf('{')));
  const blocks = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.type === 'string') blocks.push({ type: value.type, disabled: value.disabled === true });
    for (const child of Object.values(value)) visit(child);
  };
  visit(json);
  return {
    template: name,
    colorSwatchPicker: blocks.some((block) => block.type === 'color-swatch-picker' && !block.disabled),
    colorDisplay: blocks.some((block) => block.type === 'tp-farbanzeige' && !block.disabled),
    buyButtons: blocks.some((block) => block.type === 'buy-buttons' && !block.disabled),
    recommendations: blocks.some((block) => block.type === 'product-recommendations' && !block.disabled),
  };
});

const settingsSource = read('config/settings_data.json');
const settings = JSON.parse(settingsSource.slice(settingsSource.indexOf('{')));
const current = settings.current ?? {};
const sources = {
  morph: read('assets/morph.js'),
  quickAdd: read('assets/quick-add.js'),
  farbe: read('assets/tp-farbe.js'),
  swatch: read('blocks/color-swatch-picker.liquid'),
  quickAddSnippet: read('snippets/quick-add.liquid'),
  propertiesSnippet: read('snippets/tp-farbe-properties.liquid'),
};

assert.match(sources.swatch, /document\.dispatchEvent\(new CustomEvent\('tp:farbe-wechsel'/);
assert.match(sources.farbe, /document\.addEventListener\(FARBE_WECHSEL/);
assert.match(sources.farbe, /host\.closest\('\.shopify-section, dialog, product-card'\) \?\? document/);
assert.match(sources.quickAddSnippet, /render 'tp-farbe-properties'/);
assert.match(sources.quickAdd, /morph\(modalContent, productGrid\)/);
assert.match(sources.morph, /oldNode\.insertBefore\(morphed, oldChild\)/);
assert.match(sources.propertiesSnippet, /data-product-id="{{ product.id }}"/);

const activeCustomColorTemplates = templateMatrix.filter((row) => row.colorSwatchPicker);
assert.ok(activeCustomColorTemplates.length > 0);

const report = {
  session: 'S26',
  task: 'VAR-001a.2c.3',
  status: 'PASS',
  hashes: Object.keys(sources).map((key) => {
    const file = {
      morph: 'assets/morph.js', quickAdd: 'assets/quick-add.js', farbe: 'assets/tp-farbe.js',
      swatch: 'blocks/color-swatch-picker.liquid', quickAddSnippet: 'snippets/quick-add.liquid',
      propertiesSnippet: 'snippets/tp-farbe-properties.liquid',
    }[key];
    return { file, sha256: createHash('sha256').update(read(file)).digest('hex') };
  }),
  localSettings: {
    quickAdd: current.quick_add ?? null,
    mobileQuickAdd: current.mobile_quick_add ?? null,
    warning: 'settings_data.json is not historically live-hash-equal; these are repository settings, not current live proof.',
  },
  templateMatrix,
  conclusions: [
    'Custom tp:farbe-wechsel is emitted on document and both tp-farbe consumers listen on document without product-id filtering for that custom event.',
    'Native variant:update listeners are scoped to nearest section, dialog or product-card and retain product-id filtering.',
    'Quick-add markup can render tp-farbe-properties for another product and modal content is morphed, but repository current.quick_add is false.',
    'Product templates with the custom color picker and recommendations exist; static template presence alone does not prove a simultaneous foreign tp-farbe consumer.',
    'Morph can preserve or reorder old nodes; source inspection identifies a reconnect-capable boundary but does not prove a browser callback sequence.',
  ],
  limits: 'Static source/config contract only. No old lifecycle reproduction rerun, DOM implementation, browser, live settings or product data. H-016 remains conditional rather than a new confirmed issue.',
};

fs.writeFileSync('audit/evidence/variant-morph-reach-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: ${templateMatrix.length} product templates, ${activeCustomColorTemplates.length} with active custom color picker`);
