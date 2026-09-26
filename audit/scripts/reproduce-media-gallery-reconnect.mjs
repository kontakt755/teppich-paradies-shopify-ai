import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/media-gallery.js', 'assets/events.js', 'snippets/product-media-gallery-content.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

function harness() {
  const section = new EventTarget();
  const zoomDialog = new EventTarget();
  const selections = [];
  let replacements = 0;

  class Component extends EventTarget {
    constructor() {
      super();
      this.dataset = { presentation: 'carousel' };
      this.refs = {
        zoomDialogComponent: zoomDialog,
        slideshow: { select: (index, _direction, options) => selections.push({ index, animate: options.animate }) },
        media: [],
      };
    }
    connectedCallback() {}
    disconnectedCallback() {}
    closest() { return section; }
    replaceWith(node) { if (node) replacements += 1; }
  }

  const registry = new Map();
  const context = vm.createContext({
    Event, CustomEvent, AbortController, Component,
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
  });
  vm.runInContext(read('assets/events.js').replace(/^export /gm, ''), context);
  vm.runInContext(read('assets/media-gallery.js').replace(/^import .*;\n/gm, '').replace('export class MediaGallery', 'class MediaGallery'), context);
  const component = new (registry.get('media-gallery'))();
  const dispatchVariant = () => section.dispatchEvent(new CustomEvent('variant:update', {
    detail: { data: { html: { querySelector: (selector) => selector === 'media-gallery' ? { replacement: true } : null } } },
  }));
  const dispatchZoom = () => zoomDialog.dispatchEvent(new CustomEvent('zoom-media:selected', { detail: { index: 3 } }));
  return { component, dispatchVariant, dispatchZoom, result: () => ({ replacements, selections: [...selections] }) };
}

const cases = [];
{
  const h = harness(); h.component.connectedCallback(); h.dispatchVariant(); h.dispatchZoom();
  assert.deepEqual(h.result(), { replacements: 1, selections: [{ index: 3, animate: false }] });
  cases.push({ name: 'initial-connect', ...h.result() });
}
{
  const h = harness(); h.component.connectedCallback(); h.component.disconnectedCallback(); h.dispatchVariant(); h.dispatchZoom();
  assert.deepEqual(h.result(), { replacements: 0, selections: [] });
  cases.push({ name: 'disconnected-ignores-events', ...h.result() });
}
{
  const h = harness(); h.component.connectedCallback(); h.component.disconnectedCallback(); h.component.connectedCallback(); h.dispatchVariant(); h.dispatchZoom();
  assert.deepEqual(h.result(), { replacements: 0, selections: [] });
  cases.push({ name: 'same-instance-reconnect-stale', ...h.result() });
}
{
  const h = harness(); h.component.connectedCallback(); h.dispatchVariant(); h.dispatchZoom();
  assert.deepEqual(h.result(), { replacements: 1, selections: [{ index: 3, animate: false }] });
  cases.push({ name: 'fresh-instance', ...h.result() });
}

const templateSource = fs.readdirSync('templates').filter((name) => /^product.*\.json$/.test(name)).map((name) => {
  const source = read(`templates/${name}`);
  const json = JSON.parse(source.slice(source.indexOf('{')));
  const galleryBlocks = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.type === '_product-media-gallery') galleryBlocks.push({ disabled: value.disabled === true });
    for (const child of Object.values(value)) visit(child);
  };
  visit(json);
  return { template: name, enabledMediaGallery: galleryBlocks.some((block) => !block.disabled) };
});
assert.equal(templateSource.length, 8);
assert.equal(templateSource.filter((row) => row.enabledMediaGallery).length, 8);

const report = {
  session: 'S32', task: 'JS-001f', status: 'PASS', hashes, cases, templateSource,
  limits: 'Original complete MediaGallery and original events; Component, section, zoom dialog, slideshow and replacement DOM adapted, native EventTarget/AbortController. Variant replacement and zoom-selection listener lifecycle tested. Actual DOM replacement/morphing, browser custom-element reactions, rendered product assignments, quick-add dialog and live theme not tested. Product-template presence is static source reach.',
};
fs.writeFileSync('audit/evidence/media-gallery-reconnect-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: 4 media-gallery lifecycle observations, ${templateSource.filter((row) => row.enabledMediaGallery).length}/8 product templates with enabled gallery`);
