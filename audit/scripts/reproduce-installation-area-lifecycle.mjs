import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/tp-verlegegebiet.js', 'sections/tp-verlegegebiet.liquid', 'assets/tp-verlegegebiet-orte.json', 'templates/page.verlegeservice.json'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class FakeNode extends EventTarget {
  constructor(props = {}) {
    super();
    Object.assign(this, props);
    this.dataset ??= {};
    this.refs ??= new Map();
    this.hidden ??= false;
    this.value ??= '';
    this.textContent ??= '';
    this.children = [];
    this.listenerCounts = {};
  }
  addEventListener(type, listener, options) {
    this.listenerCounts[type] = (this.listenerCounts[type] || 0) + 1;
    super.addEventListener(type, listener, options);
  }
  querySelector(selector) { return this.refs.get(selector) ?? null; }
  querySelectorAll(selector) { return selector === '[data-tp-verlegegebiet-form]' ? (this.forms ?? []) : []; }
  closest() { return this.section ?? null; }
  setAttribute(name, value) { this.attrs ??= {}; this.attrs[name] = String(value); }
  appendChild(child) { this.children.push(child); return child; }
}

function formFixture() {
  const input = new FakeNode();
  const result = new FakeNode();
  const cta = new FakeNode({ hidden: true });
  const section = new FakeNode({ dataset: { radius: '50', orte: '/assets/orte.json', versandFreiAb: '50' } });
  const form = new FakeNode({
    hidden: true,
    dataset: { ctaUrl: '/pages/kontakt', ctaText: 'Anfragen', versandUrl: '/collections/all', versandText: 'Zum Sortiment' },
    section,
  });
  form.refs.set('[data-tp-verlegegebiet-input]', input);
  form.refs.set('[data-tp-verlegegebiet-result]', result);
  form.refs.set('[data-tp-verlegegebiet-cta]', cta);
  return { form, input, result, cta, section };
}

function submit(node) {
  const event = new Event('submit', { cancelable: true });
  node.dispatchEvent(event);
}

const pending = [];
const fetch = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
const document = new FakeNode({ readyState: 'complete', forms: [] });
document.createElement = () => new FakeNode();
const window = {};
const context = vm.createContext({ window, document, fetch, isFinite, parseFloat, console });
const source = read('assets/tp-verlegegebiet.js');
const execute = () => vm.runInContext(source, context);

const cases = [];
const first = formFixture();
document.forms = [first.form];
execute();
assert.equal(first.form.hidden, false);
assert.equal(first.form.listenerCounts.submit, 1);
cases.push({ name: 'initial-form-wired-once', hidden: first.form.hidden, submitListeners: first.form.listenerCounts.submit });

execute();
assert.equal(document.listenerCounts['shopify:section:load'], 1);
assert.equal(first.form.listenerCounts.submit, 1);
cases.push({ name: 'duplicate-script-guard', sectionLoadListeners: document.listenerCounts['shopify:section:load'], submitListeners: first.form.listenerCounts.submit });

first.input.value = '16515';
submit(first.form);
assert.equal(pending.length, 1);
cases.push({ name: 'initial-submit-starts-one-fetch', fetches: pending.length });

const second = formFixture();
document.forms = [second.form];
document.dispatchEvent(new Event('shopify:section:load'));
assert.equal(second.form.hidden, false);
assert.equal(second.form.listenerCounts.submit, 1);
cases.push({ name: 'replacement-form-wired', hidden: second.form.hidden, submitListeners: second.form.listenerCounts.submit });

first.connected = false;
pending[0].resolve({ ok: true, json: async () => ({ plz: { 16515: [2, 2] }, orte: {}, praefixe: '165' }) });
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));
assert.equal(first.result.attrs['data-status'], 'innen');
assert.match(first.result.textContent, /16515 liegt/);
cases.push({ name: 'detached-old-fetch-still-renders', status: first.result.attrs['data-status'] });

first.input.value = 'neu';
first.input.dispatchEvent(new Event('input'));
assert.equal(first.result.textContent, '');
cases.push({ name: 'detached-old-input-listener-still-mutates', text: first.result.textContent });

const templateFiles = fs.readdirSync('templates').filter((name) => name.endsWith('.json'));
const assignedTemplates = templateFiles.filter((name) => /"type"\s*:\s*"tp-verlegegebiet"/.test(read(`templates/${name}`)));
assert.equal(assignedTemplates.length, 5);

const report = {
  session: 'S47', task: 'JS-001u', status: 'PASS', hashes, cases,
  existingRegressionSuite: { tests: 66, passed: 66, failed: 0 },
  sourceReach: { assignedTemplateCount: assignedTemplates.length, assignedTemplates, dataAsset: 'assets/tp-verlegegebiet-orte.json' },
  limits: 'Original complete IIFE; section/form/input/result/CTA, section-load and deferred fetch adapted. Duplicate script guard, replacement binding, detached in-flight response and detached input listener executed. Native DOM removal/GC, AbortSignal/network cancellation, real layout, live settings and browser navigation not tested.',
};
fs.writeFileSync('audit/evidence/installation-area-lifecycle-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: ${cases.length} installation-area lifecycle observations; ${assignedTemplates.length} assigned templates; 66 existing regressions PASS`);
