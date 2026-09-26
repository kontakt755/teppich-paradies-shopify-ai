import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const read = (file) => fs.readFileSync(file, 'utf8');
const files = ['assets/accordion-custom.js', 'snippets/accordion-custom-component.liquid', 'snippets/cart-summary.liquid', 'snippets/list-filter.liquid', 'blocks/menu.liquid'];
const hashes = files.map((file) => ({ file, sha256: createHash('sha256').update(read(file)).digest('hex') }));

class FakeHTMLElement extends EventTarget {
  constructor() { super(); this.dataset = {}; this.attributes = new Set(); this.focuses = 0; }
  hasAttribute(name) { return this.attributes.has(name); }
  focus() { this.focuses += 1; }
  querySelector(selector) { return selector === 'details' ? this._details ?? null : null; }
}
class FakeDetailsElement extends FakeHTMLElement {
  constructor() { super(); this.open = false; this.summary = new FakeHTMLElement(); }
  querySelector(selector) { return selector === 'summary' ? this.summary : null; }
}

function harness() {
  let mobile = false;
  const mediaQueryLarge = new EventTarget();
  const details = new FakeDetailsElement();
  const registry = new Map();
  const context = vm.createContext({
    Event, EventTarget, AbortController, HTMLElement: FakeHTMLElement, HTMLDetailsElement: FakeDetailsElement,
    mediaQueryLarge, isMobileBreakpoint: () => mobile,
    customElements: { get: (name) => registry.get(name), define: (name, klass) => registry.set(name, klass) },
  });
  vm.runInContext(read('assets/accordion-custom.js').replace(/^import .*;\n/gm, ''), context);
  const component = new (registry.get('accordion-custom'))();
  component._details = details;
  component.dataset = { disableOnDesktop: 'true', disableOnMobile: 'false', closeWithEscape: 'true' };
  component.attributes.add('open-by-default-on-desktop');
  const click = () => {
    const event = new Event('click', { cancelable: true });
    details.summary.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const escape = () => {
    details.open = true;
    const event = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' });
    component.dispatchEvent(event);
    return { prevented: event.defaultPrevented, open: details.open, focuses: details.summary.focuses };
  };
  const switchMobile = () => { mobile = true; mediaQueryLarge.dispatchEvent(new Event('change')); return details.open; };
  return { component, details, click, escape, switchMobile };
}

const cases = [];
{
  const h = harness(); h.component.connectedCallback();
  const result = { name: 'initial-connect', defaultOpen: h.details.open, clickPrevented: h.click(), escape: h.escape(), openAfterMobileChange: h.switchMobile() };
  assert.deepEqual(result, { name: 'initial-connect', defaultOpen: true, clickPrevented: true, escape: { prevented: true, open: false, focuses: 1 }, openAfterMobileChange: false });
  cases.push(result);
}
{
  const h = harness(); h.component.connectedCallback(); h.component.disconnectedCallback();
  const result = { name: 'disconnected-ignores-events', clickPrevented: h.click(), escape: h.escape(), openAfterMobileChange: h.switchMobile() };
  assert.deepEqual(result, { name: 'disconnected-ignores-events', clickPrevented: false, escape: { prevented: false, open: true, focuses: 0 }, openAfterMobileChange: true });
  cases.push(result);
}
{
  const h = harness(); h.component.connectedCallback(); h.component.disconnectedCallback(); h.component.connectedCallback();
  const result = { name: 'same-instance-reconnect-stale', defaultOpen: h.details.open, clickPrevented: h.click(), escape: h.escape(), openAfterMobileChange: h.switchMobile() };
  assert.deepEqual(result, { name: 'same-instance-reconnect-stale', defaultOpen: true, clickPrevented: false, escape: { prevented: false, open: true, focuses: 0 }, openAfterMobileChange: true });
  cases.push(result);
}
{
  const h = harness(); h.component.connectedCallback();
  const result = { name: 'fresh-instance', defaultOpen: h.details.open, clickPrevented: h.click(), escape: h.escape(), openAfterMobileChange: h.switchMobile() };
  assert.deepEqual(result, { name: 'fresh-instance', defaultOpen: true, clickPrevented: true, escape: { prevented: true, open: false, focuses: 1 }, openAfterMobileChange: false });
  cases.push(result);
}

const callers = ['blocks/_accordion-row.liquid', 'blocks/menu.liquid', 'snippets/cart-summary.liquid', 'snippets/list-filter.liquid', 'snippets/price-filter.liquid', 'snippets/sorting.liquid'];
for (const file of callers) assert.match(read(file), /accordion-custom-component/);
const report = {
  session: 'S35', task: 'JS-001i', status: 'PASS', hashes, cases,
  sourceReach: {
    scriptLoadedGlobally: /accordion-custom\.js/.test(read('snippets/scripts.liquid')),
    callers,
    headerDrawerIntegration: /accordion-custom/.test(read('assets/header-drawer.js')),
  },
  limits: 'Original complete AccordionCustom; HTMLElement/details/summary and breakpoint MediaQueryList adapted, native EventTarget/AbortController. Desktop-disabled click, Escape close/focus and breakpoint default-open lifecycle tested. Native details toggle animation, actual responsive browser behavior, concrete rendered section/settings combinations and live theme not tested. Caller list is static source reach.',
};
fs.writeFileSync('audit/evidence/accordion-reconnect-2026-09-22.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`PASS: 4 accordion lifecycle observations, ${callers.length} static caller files`);
