import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/quick-add.js', 'assets/events.js', 'assets/dialog.js'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));
const source = read('assets/quick-add.js');
const classSource = source.slice(source.indexOf('class QuickAddDialog'), source.indexOf("if (!customElements.get('quick-add-dialog'))"));

function harness() {
  let closes = 0;
  let linkQueries = 0;
  let animationFrames = 0;
  const grid = { style: {}, getBoundingClientRect: () => ({ width: 100 }) };
  class DialogComponent extends EventTarget {
    connectedCallback() {}
    disconnectedCallback() {}
    closeDialog() { closes += 1; }
    querySelector() { linkQueries += 1; return { href: 'old' }; }
  }
  const context = vm.createContext({
    Event, CustomEvent, AbortController, DialogComponent,
    DialogCloseEvent: { eventName: 'dialog:close' },
    getIOSVersion: () => ({ major: 16, minor: 3 }),
    requestAnimationFrame: (callback) => { animationFrames += 1; callback(); },
    document: { querySelector: () => grid },
  });
  vm.runInContext(read('assets/events.js').replace(/^export /gm, ''), context);
  vm.runInContext(classSource, context);
  const Dialog = vm.runInContext('QuickAddDialog', context);
  const dialog = new Dialog();
  const dispatchCart = () => dialog.dispatchEvent(new CustomEvent('cart:update', { detail: { data: { didError: false } } }));
  const dispatchVariant = () => dialog.dispatchEvent(new CustomEvent('variant:update', { detail: { data: { html: { querySelector: () => ({ href: 'new' }) } } } }));
  const dispatchClose = () => dialog.dispatchEvent(new Event('dialog:close'));
  return { dialog, dispatchCart, dispatchVariant, dispatchClose, metrics: () => ({ closes, linkQueries, animationFrames }) };
}

const cases = [];
{
  const h = harness(); h.dialog.connectedCallback(); h.dispatchCart(); h.dispatchVariant(); h.dispatchClose();
  assert.deepEqual(h.metrics(), { closes: 1, linkQueries: 2, animationFrames: 2 });
  cases.push({ name: 'initial-connect', ...h.metrics() });
}
{
  const h = harness(); h.dialog.connectedCallback(); h.dialog.disconnectedCallback(); h.dispatchCart(); h.dispatchVariant(); h.dispatchClose();
  assert.deepEqual(h.metrics(), { closes: 0, linkQueries: 2, animationFrames: 0 });
  cases.push({ name: 'disconnected-variant-listener-remains', ...h.metrics() });
}
{
  const h = harness(); h.dialog.connectedCallback(); h.dialog.disconnectedCallback(); h.dialog.connectedCallback(); h.dispatchCart(); h.dispatchVariant(); h.dispatchClose();
  assert.deepEqual(h.metrics(), { closes: 0, linkQueries: 2, animationFrames: 2 });
  cases.push({ name: 'same-instance-reconnect', ...h.metrics() });
}
{
  const h = harness(); h.dialog.connectedCallback(); h.dispatchCart(); h.dispatchVariant(); h.dispatchClose();
  assert.deepEqual(h.metrics(), { closes: 1, linkQueries: 2, animationFrames: 2 });
  cases.push({ name: 'fresh-instance', ...h.metrics() });
}

const report = {
  session: 'S29', task: 'JS-001c', status: 'PASS', hashes, cases,
  limits: 'Original complete QuickAddDialog and original events; DialogComponent/DOM/iOS layout dependencies adapted, native EventTarget/AbortController. Tests listener lifecycle only, not dialog UI, modal morph, fetch, browser or live shop. Repository quick_add is false and live setting unknown.',
};
fs.writeFileSync('audit/evidence/quick-add-dialog-reconnect-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log('PASS: 4 QuickAddDialog lifecycle observations');
