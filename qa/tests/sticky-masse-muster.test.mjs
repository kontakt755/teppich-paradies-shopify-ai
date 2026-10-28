import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Handy-Kaufleiste (Fehlersuche 28.10., Idee 3): Auf Rechner-Seiten ohne
// Masse zeigte die Leiste einen gesperrten Warenkorb-Knopf ohne Wirkung. Jetzt
// heisst sie "Masse eingeben" und reicht den Tipp an den Rechner weiter, der
// das fehlende Feld nennt. Daneben steht "Muster", wenn die Seite einen
// sichtbaren Muster-Knopf hat. Die echte Klasse laeuft im DOM-Adapter wie in
// sticky-kaufbestaetigung.test.mjs.

const eventsSource = readFileSync(new URL('../../assets/events.js', import.meta.url), 'utf8');
const { ThemeEvents } = await import(`data:text/javascript;base64,${Buffer.from(eventsSource).toString('base64')}`);
const source = readFileSync(new URL('../../assets/sticky-add-to-cart.js', import.meta.url), 'utf8');
const section = readFileSync(new URL('../../sections/product-information.liquid', import.meta.url), 'utf8');

const executable = source.replace(/^import .*;\n/gm, '').replace('  // Helper methods', `
  testTarget(target) { this.#setTargetAddToCartButton(target); }
  testShow() { this.#showStickyBar(); }
  // Helper methods`);

function fixture({ klassen = ['is-incomplete'], muster = [], laenge = '' } = {}) {
  let TargetClass;
  class Node {
    constructor(text = '') {
      this.textContent = text;
      this.hidden = false;
      this.disabled = false;
      this.dataset = {};
      this.attributes = new Map();
      this.ancestors = new Map();
      this.children = new Map();
      this.style = {};
      this.classes = new Set();
      this.classList = { contains: (wert) => this.classes.has(wert) };
      this.clicks = 0;
      this.rects = [{}];
    }
    closest(selector) {
      for (const teil of selector.split(',').map((wert) => wert.trim())) {
        if (this.ancestors.has(teil)) return this.ancestors.get(teil);
      }
      return null;
    }
    querySelector(selector) { return this.children.get(selector) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, wert) { this.attributes.set(name, String(wert)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getClientRects() { return this.rects; }
    click() { this.clicks++; this.ortBeimKlick = this.getAttribute('data-tp-klick-ort'); }
  }
  class Component extends Node {
    connectedCallback() {}
    disconnectedCallback() {}
  }
  class MutationObserver {
    observe() {}
    disconnect() {}
  }
  const musterLinks = muster.map(({ hidden = false, sichtbar = true } = {}) => {
    const link = new Node('Kostenloses Muster anfragen');
    link.hidden = hidden;
    link.rects = sichtbar ? [{}] : [];
    return link;
  });
  const MUSTER = 'a[data-muster-link], a[class*="tp-muster-cta__link-"]';
  // Muster-Knoepfe gibt es nur in der eigenen Section; die Seite traegt einen
  // fremden (z. B. in Empfehlungen), den die Leiste nie nehmen darf.
  const fremd = new Node('Muster eines anderen Produkts');
  const produktSection = { querySelector: () => null, querySelectorAll: (selector) => (selector === MUSTER ? musterLinks : []) };
  const document = {
    querySelector: () => null,
    querySelectorAll: (selector) => (selector === MUSTER ? [fremd, ...musterLinks] : []),
  };
  vm.runInNewContext(executable, {
    Component, ThemeEvents, MutationObserver, HTMLElement: Node, HTMLInputElement: Node, AbortController,
    document, setTimeout, clearTimeout,
    onAnimationEnd: async () => {},
    customElements: { get: () => undefined, define: (_name, wert) => { TargetClass = wert; } },
  });

  const target = new Node('In den Warenkorb');
  for (const klasse of klassen) target.classes.add(klasse);
  target.attributes.set('aria-disabled', 'true');
  // Das Stueck am Kaufweg: data-tp-laenge leer = Breite oder Laenge fehlt
  const kaufweg = new Node();
  kaufweg.attributes.set('data-tp-laenge', laenge);
  target.ancestors.set('.tp-kaufweg', kaufweg);
  const knopf = new Node();
  const beschriftung = new Node();
  knopf.children.set('.add-to-cart-text__content > span', beschriftung);
  const musterKnopf = new Node('Muster');
  musterKnopf.hidden = true;
  const sticky = new TargetClass();
  sticky.refs = {
    stickyBar: new Node(), addToCartButton: knopf, musterButton: musterKnopf,
    quantityDisplay: new Node(), quantityNumber: new Node(), productImage: null,
  };
  sticky.dataset.productId = 'product-1';
  sticky.ancestors.set('.shopify-section', produktSection);
  sticky.testTarget(target);
  return { sticky, target, knopf, beschriftung, musterKnopf, musterLinks, fremd };
}

test('Rechner ohne Masse: Leiste bleibt aktiv und heisst "Maße eingeben"', () => {
  const { knopf, beschriftung } = fixture();
  assert.equal(knopf.disabled, false);
  assert.equal(beschriftung.textContent, 'Maße eingeben');
});

test('Tipp auf "Maße eingeben" geht an den Rechner, nicht in den Warenkorb', () => {
  const { sticky, target } = fixture();
  sticky.handleAddToCartClick();
  assert.equal(target.clicks, 1);
  assert.equal(target.dataset.puppet, undefined);
});

test('waehrend des Warenkorb-Aufrufs bleibt die Leiste gesperrt', () => {
  const { sticky, target, knopf } = fixture({ klassen: ['is-incomplete', 'is-busy'] });
  assert.equal(knopf.disabled, true);
  sticky.handleAddToCartClick();
  assert.equal(target.clicks, 0);
});

test('Masse vollstaendig, aber Breite nicht lieferbar oder Fussleiste fehlt: gesperrt wie bisher', () => {
  // calculate() setzt is-incomplete auch dann; data-tp-laenge traegt aber das Stueck
  const { sticky, target, knopf, beschriftung } = fixture({ laenge: '300' });
  assert.equal(knopf.disabled, true);
  assert.equal(beschriftung.textContent, 'In den Warenkorb');
  sticky.handleAddToCartClick();
  assert.equal(target.clicks, 0);
});

test('vollstaendige Masse: Beschriftung kommt wieder vom Rechner', () => {
  const { knopf, beschriftung } = fixture({ klassen: [] });
  // aria-disabled ohne is-incomplete ist die echte Sperre (#targetBlocked)
  assert.equal(knopf.disabled, true);
  assert.equal(beschriftung.textContent, 'In den Warenkorb');
});

test('Muster-Knopf nur, wenn die Seite einen sichtbaren Muster-Knopf hat', () => {
  const ohne = fixture();
  ohne.sticky.testShow();
  assert.equal(ohne.musterKnopf.hidden, true);

  const voll = fixture({ muster: [{ hidden: true }] });
  voll.sticky.testShow();
  assert.equal(voll.musterKnopf.hidden, true, 'Vinyl mit 3 Mustern im Warenkorb: kein Muster-Knopf');

  const mit = fixture({ muster: [{ sichtbar: false }, {}] });
  mit.sticky.testShow();
  assert.equal(mit.musterKnopf.hidden, false);
  mit.sticky.handleMusterClick();
  assert.deepEqual(mit.musterLinks.map((link) => link.clicks), [0, 1]);
  assert.equal(mit.fremd.clicks, 0, 'nur Muster-Knoepfe der eigenen Produkt-Section');
  // Klickmessung: ort "leiste" nur waehrend des Klicks
  assert.equal(mit.musterLinks[1].ortBeimKlick, 'leiste');
  assert.equal(mit.musterLinks[1].hasAttribute('data-tp-klick-ort'), false);

  // Waehrend die Leiste offen ist, wird das Muster-Kontingent voll
  mit.musterLinks[1].hidden = true;
  mit.sticky.handleMusterClick();
  assert.deepEqual(mit.musterLinks.map((link) => link.clicks), [0, 1]);
  assert.equal(mit.musterKnopf.hidden, true);
});

test('Leiste traegt den Muster-Knopf, versteckt und mit Klick-Verdrahtung', () => {
  assert.match(section, /class="sticky-add-to-cart__muster"\s+ref="musterButton"\s+on:click="\/handleMusterClick"\s+hidden/);
  // Nebenknopf in der Grundfarbe, Rot bleibt dem Warenkorb-Knopf
  assert.match(section, /\.sticky-add-to-cart__muster \{[^}]*color: var\(--tp-ink/);
});

test('Klickmessung: Muster mit ort, auch der Rechner-Link zaehlt', () => {
  const funnel = readFileSync(new URL('../../snippets/tp-funnel-events.liquid', import.meta.url), 'utf8');
  assert.match(funnel, /publish\('tp_muster_cta_klick', \{ product_handle: handle\(\), ort: link\.getAttribute\('data-tp-klick-ort'\) \|\| 'seite' \}\)/);
  assert.match(funnel, /link\.hasAttribute\('data-muster-link'\)/);
});

test('Handy: Warenkorb-Knopf darf schrumpfen und umbrechen, Desktop bleibt einzeilig', () => {
  const handy = section.slice(section.indexOf('/* Handy (Fehlersuche 28.10., Idee 3)'));
  assert.match(handy, /\.sticky-add-to-cart__bar \.sticky-add-to-cart__button \{[^}]*flex: 0 1 auto;[^}]*min-width: 0;[^}]*white-space: normal;/);
  assert.match(handy, /\.sticky-add-to-cart__bar \.add-to-cart-text__content \{[^}]*white-space: normal;/);
  // Desktop: einzeilig, mit Muster breitere Leiste - nur ab 750 px, am Handy bleibt sie 100 %
  assert.match(section, /@media screen and \(min-width: 750px\) \{\s*\.sticky-add-to-cart__bar:has\(\.sticky-add-to-cart__muster:not\(\[hidden\]\)\) \{\s*width: min\(720px/);
});
