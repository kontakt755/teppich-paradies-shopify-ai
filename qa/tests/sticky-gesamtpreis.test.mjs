import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Kaufanalyse 26.11.2026: Am Handy stand der Preis weit unter dem Massfeld,
// die Kaufleiste nannte ihn nicht (Einfass-Konfigurator: ausgeblendet;
// Rollenware unter 390 px: dem Muster-Knopf gewichen; Paketware: nur der
// m²-Preis). Die Leiste uebernimmt jetzt am Handy genau den Gesamtpreis, den
// der Rechner anzeigt - sie rechnet nichts. Die echte Klasse laeuft im
// DOM-Adapter.

const source = readFileSync(new URL('../../assets/sticky-add-to-cart.js', import.meta.url), 'utf8');
const section = readFileSync(new URL('../../sections/product-information.liquid', import.meta.url), 'utf8');
const executable = source.replace(/^import .*;\n/gm, '').replace('  // Helper methods', `
  testTarget(target) { this.#setTargetAddToCartButton(target); }
  // Helper methods`);

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
  }
  closest(selector) {
    for (const teil of selector.split(',').map((wert) => wert.trim())) {
      if (this.ancestors.has(teil)) return this.ancestors.get(teil);
    }
    return null;
  }
  querySelector(selector) { return this.children.get(selector) ?? null; }
  querySelectorAll() { return []; }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, wert) { this.attributes.set(name, String(wert)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getClientRects() { return [{}]; }
  contains(node) { return node === this; }
  addEventListener() {}
  click() {}
}

function leiste() {
  let Klasse;
  const beobachter = [];
  class Component extends Node {
    connectedCallback() {}
    disconnectedCallback() {}
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.ziele = []; beobachter.push(this); }
    observe(ziel, optionen) { this.ziele.push({ ziel, optionen }); }
    disconnect() { this.getrennt = true; }
  }
  vm.runInNewContext(executable, {
    Component, ThemeEvents: {}, MutationObserver, HTMLElement: Node, HTMLInputElement: Node, AbortController,
    document: { querySelector: () => null }, setTimeout, clearTimeout,
    window: { matchMedia: () => ({ matches: true }), innerHeight: 800, location: { href: 'https://x.test/' } },
    customElements: { get: () => undefined, define: (_n, wert) => { Klasse = wert; } },
  });
  const sticky = new Klasse();
  const knopf = new Node();
  knopf.children.set('.add-to-cart-text__content > span', new Node());
  const preis = new Node('35,90 €/m²');
  const gesamt = new Node();
  gesamt.hidden = true;
  const wert = new Node();
  sticky.children.set('.sticky-add-to-cart__price', preis);
  sticky.children.set('.sticky-add-to-cart__gesamt', gesamt);
  sticky.children.set('.sticky-add-to-cart__gesamt-wert', wert);
  sticky.refs = {
    stickyBar: new Node(), addToCartButton: knopf,
    quantityDisplay: new Node(), quantityNumber: new Node(),
  };
  const aendern = () => beobachter.filter((b) => !b.getrennt).at(-1).callback();
  const beobachtet = (ziel) => beobachter.some((b) => b.ziele.some((z) => z.ziel === ziel));
  const stand = () => (gesamt.hidden ? null : wert.textContent);
  return { sticky, knopf, preis, aendern, beobachtet, stand };
}

function konfigurator() {
  const l = leiste();
  const kaufweg = new Node();
  kaufweg.attributes.set('data-tp-ek', '');
  const rechnung = new Node();
  rechnung.hidden = true;
  rechnung.ancestors.set('[hidden]', rechnung);
  const summe = new Node('–');
  rechnung.children.set('[data-summe]', summe);
  kaufweg.children.set('[data-rechnung]', rechnung);
  const cta = new Node('In den Warenkorb');
  cta.hidden = true;
  cta.ancestors.set('.tp-kaufweg', kaufweg);
  cta.ancestors.set('[data-tp-ek]', kaufweg);
  const rechne = (wert) => {
    rechnung.hidden = !wert;
    if (wert) rechnung.ancestors.delete('[hidden]'); else rechnung.ancestors.set('[hidden]', rechnung);
    cta.hidden = !wert;
    if (wert) summe.textContent = wert;
    l.aendern();
  };
  l.sticky.testTarget(cta);
  return { ...l, rechnung, summe, cta, rechne };
}

test('Teppich nach Mass: Gesamtpreis erscheint, folgt jeder Aenderung, verschwindet bei ungueltigem Mass', () => {
  const k = konfigurator();
  assert.equal(k.stand(), null);
  assert.ok(k.beobachtet(k.rechnung), 'Preisblock des Konfigurators wird beobachtet');
  k.rechne('616,00 €');
  assert.equal(k.stand(), '616,00 €');
  k.rechne('702,40 €');
  assert.equal(k.stand(), '702,40 €');
  k.rechne(null);
  assert.equal(k.stand(), null);
  // Desktop unveraendert: dort bleibt der Preis der Leiste beim Konfigurator aus
  assert.equal(k.preis.style.display, 'none');
});

function rollenware() {
  const l = leiste();
  const kaufweg = new Node();
  kaufweg.attributes.set('data-tp-laenge', '');
  const total = new Node('–');
  kaufweg.children.set('[data-total]', total);
  const cta = new Node('In den Warenkorb');
  cta.classes.add('is-incomplete');
  cta.ancestors.set('.tp-kaufweg', kaufweg);
  l.sticky.testTarget(cta);
  const rechne = (wert) => {
    total.textContent = wert ?? '–';
    kaufweg.setAttribute('data-tp-laenge', wert ? '300' : '');
    if (wert) cta.classes.delete('is-incomplete'); else cta.classes.add('is-incomplete');
    l.aendern();
  };
  return { ...l, kaufweg, total, rechne };
}

test('Rollenware: derselbe Text wie [data-total], ohne Mass nichts', () => {
  const r = rollenware();
  assert.equal(r.stand(), null);
  assert.ok(r.beobachtet(r.total));
  r.rechne('235,60 €');
  assert.equal(r.stand(), '235,60 €');
  assert.equal(r.preis.textContent, '235,60 €', 'Desktop wie bisher');
  r.rechne(null);
  assert.equal(r.stand(), null);
  // Farbe ohne Zuschnitt: der Rechner blendet seinen Preis aus
  r.rechne('235,60 €');
  r.kaufweg.classes.add('tp-rwc-no-service');
  r.aendern();
  assert.equal(r.stand(), null);
});

test('Paketware: nur wenn der Rechner einen Gesamtpreis meldet, sonst unveraendert', () => {
  const l = leiste();
  const paket = new Node();
  const cta = new Node('In den Warenkorb');
  cta.ancestors.set('.tp-paket-auswahl', paket);
  l.sticky.testTarget(cta);
  assert.equal(l.stand(), null);
  assert.ok(l.beobachtet(paket));
  paket.setAttribute('data-tp-gesamt', '421,36 €');
  l.aendern();
  assert.equal(l.stand(), '421,36 €');
  paket.removeAttribute('data-tp-gesamt');
  l.aendern();
  assert.equal(l.stand(), null);
  assert.equal(l.preis.textContent, '35,90 €/m²');
  assert.equal(l.preis.style.display, undefined);
});

test('Standard-Kaufblock (Zubehoer): kein Gesamtpreis, Preis unveraendert', () => {
  const l = leiste();
  l.sticky.testTarget(new Node('In den Warenkorb'));
  assert.equal(l.stand(), null);
  assert.equal(l.preis.textContent, '35,90 €/m²');
});

test('Gesamtpreis nur am Handy, ersetzt dort den Preis der Leiste', () => {
  assert.match(section, /class="sticky-add-to-cart__gesamt"[^>]*hidden/);
  assert.match(section, /class="sticky-add-to-cart__gesamt-wert"/);
  // Grundregel: unsichtbar (Desktop unveraendert)
  assert.match(section, /\n  \.sticky-add-to-cart__gesamt \{\s*display: none;/);
  const handy = section.slice(section.indexOf('/* Gesamtpreis des Rechners'));
  assert.match(handy, /^[\s\S]{0,400}@media screen and \(max-width: 749px\)/);
  assert.match(handy, /\.sticky-add-to-cart__gesamt:not\(\[hidden\]\) \{[^}]*display: block;/);
  assert.match(handy, /:has\(\.sticky-add-to-cart__gesamt:not\(\[hidden\]\)\) \.sticky-add-to-cart__price \{\s*display: none;/);
});
