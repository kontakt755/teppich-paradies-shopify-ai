import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const eventsSource = readFileSync(new URL('../../assets/events.js', import.meta.url), 'utf8');
const { ThemeEvents } = await import(`data:text/javascript;base64,${Buffer.from(eventsSource).toString('base64')}`);

const source = readFileSync(new URL('../../assets/sticky-add-to-cart.js', import.meta.url), 'utf8');

// Die komplette echte Klasse laeuft im DOM-Adapter. Nur Testzugriffe auf die
// privaten Einstiegsstellen werden in die Klasse eingefuegt, ihre Logik bleibt.
const executable = source.replace(/^import .*;\n/gm, '').replace('  // Helper methods', `
  testTarget(target) { this.#setTargetAddToCartButton(target); }
  testComplete(event) { return this.#handleCartAddComplete(event); }
  // Helper methods`);

function fixture({ kind = 'rolle', image = false } = {}) {
  const timers = new Map();
  const observers = [];
  const animations = [];
  const flights = [];
  let nextTimer = 0;
  let TargetClass;

  class Node {
    constructor({ id = '', text = '' } = {}) {
      this.id = id;
      this.textContent = text;
      this.hidden = false;
      this.disabled = false;
      this.dataset = {};
      this.attributes = new Map();
      this.ancestors = new Map();
      this.children = new Map();
      this.style = { setProperty() {} };
      this.classes = new Set();
      this.classList = {
        contains: (value) => this.classes.has(value),
        add: (...values) => values.forEach((value) => this.classes.add(value)),
      };
      this.clicks = 0;
      this.onClick = () => {};
    }
    closest(selector) {
      for (const part of selector.split(',').map((value) => value.trim())) {
        if (this.ancestors.has(part)) return this.ancestors.get(part);
      }
      return null;
    }
    querySelector(selector) { return this.children.get(selector) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      for (const observer of observers) {
        if (observer.targets.some(([target, options]) => target === this && options.attributeFilter.includes(name))) {
          observer.callback();
        }
      }
    }
    removeAttribute(name) {
      this.attributes.delete(name);
      if (name === 'data-added') delete this.dataset.added;
    }
    click() { this.clicks++; this.onClick(); }
  }

  class Component extends Node {
    connectedCallback() {}
    disconnectedCallback() {}
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
    observe(target, options) { this.targets.push([target, options]); }
    disconnect() { this.targets = []; }
  }

  const document = {
    querySelector: () => image ? new Node() : null,
    createElement: () => new Node(),
    body: { appendChild: (node) => flights.push(node) },
  };
  vm.runInNewContext(executable, {
    Component, ThemeEvents, MutationObserver, HTMLElement: Node, HTMLInputElement: Node, AbortController,
    document,
    onAnimationEnd: async (nodes) => { animations.push(nodes); },
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    customElements: { get: () => undefined, define: (_name, value) => { TargetClass = value; } },
  });

  const target = new Node({ text: 'In den Warenkorb' });
  const stickyButton = new Node();
  stickyButton.children.set('.add-to-cart-text__content > span', new Node());
  const sticky = new TargetClass();
  sticky.refs = {
    addToCartButton: stickyButton,
    quantityDisplay: new Node(), quantityNumber: new Node(),
    productImage: image ? Object.assign(new Node(), { src: '/produkt.jpg' }) : null,
  };
  sticky.dataset.productId = 'product-1';
  const productForm = kind === 'standard' ? new Node({ id: 'product-form-1' }) : null;
  const form = productForm ? new Node({ id: 'native-form-1' }) : null;
  if (productForm) {
    form.children.set('[name="id"]', { value: 'variant-1' });
    target.ancestors.set('product-form-component', productForm);
    target.ancestors.set('form', form);
  }
  const kaufweg = productForm ? null : new Node({ id: kind === 'paket' ? '' : `${kind}-1` });
  if (kaufweg) {
    kaufweg.dataset.variantId = 'variant-1';
    if (kind === 'paket') {
      kaufweg.classes.add('tp-paket-auswahl');
      target.ancestors.set('.tp-paket-auswahl', kaufweg);
    } else {
      target.ancestors.set('.tp-kaufweg', kaufweg);
      if (kind === 'einfass') target.ancestors.set('[data-tp-ek]', kaufweg);
    }
  }
  sticky.testTarget(target);

  const event = ({ type = ThemeEvents.cartUpdate, sourceId, productId = 'product-1', didError = false,
    origin = productForm, resource = { id: 'variant-1' }, source = 'product-form-component' } = {}) => ({
    type, target: origin,
    detail: {
      sourceId: sourceId ?? (kind === 'standard' ? 'variant-1' : kind === 'paket' ? 'paket-auswahl' : `${kind}-1`),
      resource, data: { productId, source, didError, itemCount: 1 },
    },
  });
  return {
    sticky, target, stickyButton, productForm, form, kaufweg, animations, flights, timers, event,
    complete: (options) => sticky.testComplete(event(options)),
    runTimers(delay) {
      for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.callback(); }
    },
  };
}

for (const kind of ['standard', 'paket', 'rolle', 'einfass']) {
  test(`${kind}: Erfolg erst nach passender Cart-Bestaetigung, nie schon nach dem delegierten Klick`, async () => {
    const f = fixture({ kind, image: true });
    f.sticky.handleAddToCartClick();
    assert.equal(f.target.clicks, 1);
    assert.equal(f.target.dataset.puppet, 'true');
    assert.equal(f.stickyButton.dataset.added, undefined);
    assert.equal(f.flights.length, 0);

    f.complete();
    assert.equal(f.stickyButton.dataset.added, 'true');
    assert.equal(f.target.dataset.puppet, 'false');
    assert.equal(f.flights.length, 1);
    await new Promise(setImmediate);
    f.runTimers(800);
    assert.equal(f.stickyButton.dataset.added, undefined);
  });

  test(`${kind}: hidden, disabled und aria-disabled lassen keinen Sticky-Kaufversuch zu`, () => {
    for (const flag of ['hidden', 'disabled', 'aria-disabled']) {
      const f = fixture({ kind });
      if (flag === 'aria-disabled') f.target.setAttribute(flag, 'true');
      else f.target[flag] = true;
      f.sticky.handleAddToCartClick();
      f.complete();
      assert.equal(f.target.clicks, 0, flag);
      assert.equal(f.stickyButton.dataset.added, undefined, flag);
    }
  });

  test(`${kind}: Cart-Fehler und Teilfehler werden nicht als Erfolg bestaetigt`, () => {
    for (const options of [{ type: ThemeEvents.cartError, sourceId: kind === 'standard' ? 'native-form-1' : undefined }, { didError: true }]) {
      const f = fixture({ kind });
      f.sticky.handleAddToCartClick();
      f.complete(options);
      assert.equal(f.target.dataset.puppet, 'false');
      assert.equal(f.stickyButton.dataset.added, undefined);
      assert.equal(f.animations.length, 0);
    }
  });
}

test('Rechner-Sticky spiegelt aria-disabled-Aenderungen und wird nach Korrektur wieder aktiv', () => {
  const f = fixture();
  assert.equal(f.stickyButton.disabled, false);
  f.target.setAttribute('aria-disabled', 'true');
  assert.equal(f.stickyButton.disabled, true);
  f.target.setAttribute('aria-disabled', 'false');
  assert.equal(f.stickyButton.disabled, false);
  f.sticky.handleAddToCartClick();
  assert.equal(f.target.clicks, 1);
});

test('Fremde Cart-Updates sowie Updates ohne eigenen Sticky-Klick loesen keinen Erfolg aus', () => {
  const f = fixture();
  f.complete();
  assert.equal(f.stickyButton.dataset.added, undefined);
  f.sticky.handleAddToCartClick();
  f.complete({ sourceId: 'anderer-rechner' });
  f.complete({ source: 'cart-items-component' });
  assert.equal(f.stickyButton.dataset.added, undefined);
  f.complete();
  assert.equal(f.stickyButton.dataset.added, 'true', 'die eigene Bestaetigung bleibt nach fremden Updates wirksam');
});

test('Ein anderes Produktformular mit derselben Variante bestaetigt den eigenen Klick nicht', () => {
  const f = fixture({ kind: 'standard' });
  f.sticky.handleAddToCartClick();
  f.complete({ origin: {} });
  assert.equal(f.stickyButton.dataset.added, undefined);
  f.complete();
  assert.equal(f.stickyButton.dataset.added, 'true');
});

test('Standard-Horizon bestaetigt auch seine verzögerte Batch-Antwort vom selben Formular', () => {
  const f = fixture({ kind: 'standard' });
  f.sticky.handleAddToCartClick();
  f.complete({ sourceId: 'product-form-1', resource: { items: [{ id: 'neue-variante' }] } });
  assert.equal(f.stickyButton.dataset.added, 'true');
});

test('Paketantwort muss die beim Klick gewaehlte Variante enthalten, auch mit Zubehoer', () => {
  const f = fixture({ kind: 'paket' });
  f.sticky.handleAddToCartClick();
  f.complete({ resource: { id: 'andere-variante' } });
  assert.equal(f.stickyButton.dataset.added, undefined);
  f.complete({ resource: { items: [{ id: 'leiste' }, { variant_id: 'variant-1' }] } });
  assert.equal(f.stickyButton.dataset.added, 'true');
});

test('Stumm abgewiesener Hauptklick und Abbruch bleiben ohne Erfolg; kein alter Kaufversuch bleibt haengen', () => {
  const f = fixture();
  f.sticky.handleAddToCartClick();
  assert.equal(f.target.clicks, 1);
  assert.equal(f.stickyButton.dataset.added, undefined);
  f.runTimers(30000);
  assert.equal(f.target.dataset.puppet, 'false');
  f.complete();
  assert.equal(f.stickyButton.dataset.added, undefined);

  f.sticky.handleAddToCartClick();
  f.sticky.disconnectedCallback();
  f.complete();
  assert.equal(f.stickyButton.dataset.added, undefined);
  assert.equal(f.target.dataset.puppet, 'false');
});

test('Bestätigter Kauf ohne Produktbild behaelt das Häkchen, ohne Fluganimation', () => {
  const f = fixture();
  f.sticky.handleAddToCartClick();
  f.complete();
  assert.equal(f.stickyButton.dataset.added, 'true');
  assert.equal(f.flights.length, 0);
});
