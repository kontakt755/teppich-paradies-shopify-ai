import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/media.js', 'assets/events.js', 'snippets/product-media.liquid', 'snippets/video.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class FakeHTMLElement extends EventTarget {
  classList = { add() {}, remove() {}, toggle() {} };
  focus() {}
  querySelector() { return null; }
}
class FakeVideoElement extends FakeHTMLElement {
  plays = 0;
  pauses = 0;
  play() { this.plays += 1; }
  pause() { this.pauses += 1; }
  getAttribute() { return null; }
}

function runtime() {
  const document = new EventTarget();
  const window = new EventTarget();
  const registry = new Map();
  const video = new FakeVideoElement();
  const modelElement = new EventTarget();
  const modelUis = [];

  class Component extends FakeHTMLElement {
    constructor() {
      super();
      this.refs = {
        deferredMediaPlayButton: new FakeHTMLElement(),
        toggleMediaButton: new FakeHTMLElement(),
      };
      this.attributes = new Map([['data-media-loaded', 'true']]);
    }
    connectedCallback() {}
    disconnectedCallback() {}
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    appendChild() {}
    querySelector(selector) {
      if (selector === 'model-viewer') return modelElement;
      if (selector === 'video') return video;
      return null;
    }
  }

  class ModelViewerUI {
    constructor() { this.plays = 0; this.pauses = 0; modelUis.push(this); }
    play() { this.plays += 1; }
    pause() { this.pauses += 1; }
  }
  const Shopify = { ModelViewerUI, loadFeatures() {} };
  const context = vm.createContext({
    Event, CustomEvent, EventTarget, AbortController, Component, document, window, Shopify,
    HTMLElement: FakeHTMLElement, HTMLVideoElement: FakeVideoElement, setTimeout,
    DialogCloseEvent: class { static eventName = 'dialog:close'; },
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
  });
  vm.runInContext(read('assets/events.js').replace(/^export /gm, ''), context);
  vm.runInContext(read('assets/media.js').replace(/^import .*;\n/gm, ''), context);
  return { document, window, registry, video, modelElement, modelUis };
}

const deferredCases = [];
function exerciseDeferred(name, lifecycle) {
  const h = runtime();
  const component = new (h.registry.get('deferred-media'))();
  lifecycle(component);
  component.isPlaying = true;
  h.document.dispatchEvent(new Event('media:started-playing'));
  component.isPlaying = true;
  h.window.dispatchEvent(new Event('dialog:close'));
  deferredCases.push({ name, pauses: h.video.pauses, finalPlaying: component.isPlaying });
  return deferredCases.at(-1);
}
assert.deepEqual(exerciseDeferred('initial-connect', (c) => c.connectedCallback()), { name: 'initial-connect', pauses: 2, finalPlaying: false });
assert.deepEqual(exerciseDeferred('disconnected-ignores-events', (c) => { c.connectedCallback(); c.disconnectedCallback(); }), { name: 'disconnected-ignores-events', pauses: 0, finalPlaying: true });
assert.deepEqual(exerciseDeferred('same-instance-reconnect-stale', (c) => { c.connectedCallback(); c.disconnectedCallback(); c.connectedCallback(); }), { name: 'same-instance-reconnect-stale', pauses: 0, finalPlaying: true });
assert.deepEqual(exerciseDeferred('fresh-instance', (c) => c.connectedCallback()), { name: 'fresh-instance', pauses: 2, finalPlaying: false });

const modelCases = [];
async function exerciseModel(name, lifecycle) {
  const h = runtime();
  const component = new (h.registry.get('product-model'))();
  lifecycle(component);
  await component.setupModelViewerUI(null);
  h.modelElement.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 10, clientY: 10 }));
  h.modelElement.dispatchEvent(Object.assign(new Event('click'), { clientX: 12, clientY: 12 }));
  const ui = h.modelUis.at(-1);
  const result = { name, uiPlays: ui.plays, uiPauses: ui.pauses, videoPauses: h.video.pauses };
  modelCases.push(result);
  return result;
}
assert.deepEqual(await exerciseModel('initial-connect', (c) => c.connectedCallback()), { name: 'initial-connect', uiPlays: 1, uiPauses: 1, videoPauses: 1 });
assert.deepEqual(await exerciseModel('disconnected-ignores-pointer', (c) => { c.connectedCallback(); c.disconnectedCallback(); }), { name: 'disconnected-ignores-pointer', uiPlays: 1, uiPauses: 0, videoPauses: 0 });
assert.deepEqual(await exerciseModel('same-instance-reconnect-stale', (c) => { c.connectedCallback(); c.disconnectedCallback(); c.connectedCallback(); }), { name: 'same-instance-reconnect-stale', uiPlays: 1, uiPauses: 0, videoPauses: 0 });
assert.deepEqual(await exerciseModel('fresh-instance', (c) => c.connectedCallback()), { name: 'fresh-instance', uiPlays: 1, uiPauses: 1, videoPauses: 1 });

const templateSource = fs.readdirSync('templates').filter((name) => /^product.*\.json$/.test(name)).map((name) => {
  const source = read(`templates/${name}`);
  const json = JSON.parse(source.slice(source.indexOf('{')));
  let enabledMediaGallery = false;
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.type === '_product-media-gallery' && value.disabled !== true) enabledMediaGallery = true;
    for (const child of Object.values(value)) visit(child);
  };
  visit(json);
  return { template: name, enabledMediaGallery };
});
assert.equal(templateSource.length, 8);
assert.equal(templateSource.filter((row) => row.enabledMediaGallery).length, 8);

const report = {
  session: 'S33', task: 'JS-001g', status: 'PASS', hashes, deferredCases, modelCases, templateSource,
  sourceReach: {
    productMediaTypes: ['model', 'video', 'external_video'],
    globalVideoSnippetEmitsDeferredMedia: /<deferred-media/.test(read('snippets/video.liquid')),
    mediaScriptLoadedGlobally: /media\.js/.test(read('snippets/scripts.liquid')),
  },
  limits: 'Original complete DeferredMedia/ProductModel and original events; Component, HTMLElement/video/model-viewer, refs, DOM and Shopify ModelViewerUI adapted, native EventTarget/AbortController. Global pause listeners and model pointer listeners tested. Loading/template cloning, iframe postMessage, autoplay, browser custom-element reactions, actual product media assignments and live theme not tested. Eight gallery templates are static potential reach, not evidence that each product has video or 3D media.',
};
fs.writeFileSync('audit/evidence/media-runtime-reconnect-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log('PASS: 4 deferred-media and 4 product-model lifecycle observations; 8/8 product templates expose gallery reach');
