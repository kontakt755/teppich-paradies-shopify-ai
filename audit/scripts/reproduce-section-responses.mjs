import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
const file = 'assets/section-renderer.js';
const source = fs.readFileSync(file, 'utf8');
const manifest = JSON.parse(fs.readFileSync('audit/evidence/source-manifest.json'));
const sha256 = createHash('sha256').update(source).digest('hex');
assert.equal(sha256, manifest.files[file].live.sha256);
function harness() {
  const requests = [], morphs = [];
  const context = vm.createContext({ URL, AbortController, Shopify: { designMode: false },
    window: { location: { href: 'https://fixture.invalid/cart' }, addEventListener() {} },
    document: { getElementById: id => ({ id }), querySelectorAll: () => [] },
    DOMParser: class { parseFromString(html) { return { getElementById: id => ({ id, html }) }; } },
    MORPH_OPTIONS: {}, morph: (old, next, options) => morphs.push({ html: next.html, options }),
    fetch: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject })) });
  vm.runInContext(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.renderer = sectionRenderer;', context);
  return { renderer: context.renderer, requests, morphs };
}
const cases = [];
const observe = promise => promise.then(value => ({ value }), error => ({ error: error.message }));
for (const failure of ['fetch', 'body']) {
  const h = harness();
  const first = observe(h.renderer.renderSection('cart', { cache: false }));
  if (failure === 'fetch') h.requests[0].reject(new Error('synthetic-network-failure'));
  else h.requests[0].resolve({ text: () => Promise.reject(new Error('synthetic-body-failure')) });
  const initial = await first;
  for (const cache of [false, true, false]) {
    const retry = await observe(h.renderer.renderSection('cart', { cache }));
    assert.deepEqual(retry, initial);
  }
  assert.equal(h.requests.length, 1);
  assert.equal(h.morphs.length, 0);
  const other = h.renderer.renderSection('other', { cache: false });
  h.requests[1].resolve({ text: async () => 'other-success' });
  await other;
  assert.equal(h.morphs.length, 1);
  cases.push({ name: `${failure}-failure-three-retries`, defect: 'TP-012', retryRequests: 0, initial, otherSectionRecovers: true });
}
{
  const h = harness();
  const a = h.renderer.renderSection('cart', { cache: false });
  const b = h.renderer.renderSection('cart', { cache: false });
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ text: async () => 'shared' });
  await a; await b;
  assert.equal(h.morphs.length, 1);
  const cached = await h.renderer.renderSection('cart');
  assert.equal(cached, 'shared'); assert.equal(h.requests.length, 1);
  const fresh = h.renderer.renderSection('cart', { cache: false });
  h.requests[1].resolve({ text: async () => 'fresh' }); await fresh;
  assert.equal(h.morphs.at(-1).html, 'fresh');
  cases.push({ name: 'dedup-success-cache-and-forced-refresh', requests: h.requests.length, morphs: h.morphs.length });
}
for (const order of ['new-first', 'old-first']) {
  const h = harness();
  const a = h.renderer.renderSection('cart', { url: new URL('https://fixture.invalid/cart?v=1') });
  const b = h.renderer.renderSection('cart', { url: new URL('https://fixture.invalid/cart?v=2'), mode: 'hydration' });
  if (order === 'new-first') {
    h.requests[1].resolve({ text: async () => 'new' }); await b;
    h.requests[0].resolve({ text: async () => 'old' }); await a;
  } else {
    h.requests[0].resolve({ text: async () => 'old' }); await a;
    assert.equal(h.morphs.length, 0);
    h.requests[1].resolve({ text: async () => 'new' }); await b;
  }
  assert.equal(h.morphs.length, 1); assert.equal(h.morphs[0].html, 'new');
  assert.equal(h.morphs[0].options.hydrationMode, true);
  cases.push({ name: order, requests: 2, onlyNewestMorphs: true });
}
const report = { session: 'S10', task: 'CART-002b.2a', status: 'PASS', source: { file, sha256, historicalMatch: true }, cases,
  limitations: 'Original full SectionRenderer and morphSection; controlled fetch and minimal parser/DOM/morph adapter. No live requests, real browser or CartItems response integration. PASS confirms diagnosis, not repair.' };
fs.writeFileSync('audit/evidence/section-responses-2026-09-21.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, cases: cases.length, defectCases: 2, historicalHashes: 1 }));
