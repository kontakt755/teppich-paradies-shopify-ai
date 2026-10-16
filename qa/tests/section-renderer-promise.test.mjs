import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('assets/section-renderer.js', 'utf8')
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export /gm, '');

function setup(hasSection) {
  const morphs = [];
  const context = vm.createContext({
    URL,
    Shopify: { designMode: false },
    window: { location: { href: 'https://shop.test/search?q=teppich' }, addEventListener() {} },
    document: { getElementById: id => ({ id }) },
    DOMParser: class { parseFromString() { return { getElementById: id => hasSection ? { id } : null }; } },
    fetch: async () => ({ text: async () => hasSection ? '<section>Treffer</section>' : '<h1>Not found</h1>' }),
    morph: (existing, next) => morphs.push([existing.id, next.id]),
    MORPH_OPTIONS: {},
    AbortController,
  });
  vm.runInContext(`${source}\nglobalThis.renderer = sectionRenderer;`, context);
  return { renderer: context.renderer, morphs };
}

test('renderSection erfuellt sein Promise erst nach erfolgreichem Section-Morph', async () => {
  const { renderer, morphs } = setup(true);
  assert.equal(await renderer.renderSection('main'), '<section>Treffer</section>');
  assert.deepEqual(morphs, [['shopify-section-main', 'shopify-section-main']]);
});

test('Fehlende Section in einer Fehlerantwort rejectet renderSection fuer den Rueckfall des Aufrufers', async () => {
  const { renderer, morphs } = setup(false);
  await assert.rejects(renderer.renderSection('alte-section'), /Section alte-section not found in the section rendering response/);
  assert.deepEqual(morphs, []);
});
