// Shop-Analyse 13.10.2026 (P1): "Ein Paket weniger" schrieb das Flaechenfeld
// still von 18,00 auf 17,04 m² um - danach war nicht mehr zu sehen, dass die
// eingegebene Flaeche nicht gedeckt ist. Jetzt bleibt die Flaeche stehen, und
// ein Hinweis nennt fehlende Flaeche, reduzierte Reserve oder Mehrmenge.
// Warenkorbmenge und Preis kommen weiter aus derselben Paketzahl.
// Fuehrt das echte <script> aus blocks/paket-auswahl.liquid in einem
// Node-VM-DOM-Adapter aus (wie paket-auswahl-validierung.test.mjs).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const packageFile = 'blocks/paket-auswahl.liquid';
const packageSource = readFileSync(path.join(root, packageFile), 'utf8');
const [, packageScript] = packageSource.match(/<script>\s*([\s\S]*?)<\/script>/);

class Element {
  constructor() {
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.checked = false;
    this.attributes = new Map();
    this.listeners = new Map();
  }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  focus() {}
  scrollIntoView() {}
  emit(type, event = {}) { return this.listeners.get(type)?.(event); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
}

// Fixture wie im Befund: Klickvinyl mit 1,988 m² je Paket, 105,34 € je Paket.
function rechner({ waste = true } = {}) {
  const selectors = ['sqm-input', 'need-label', 'need-display', 'sqm-display',
    'package-display', 'package-word', 'unit-hint', 'pieces-line', 'total-display',
    'waste-checkbox', 'add-to-cart', 'cart-message', 'package-hint', 'package-hint-text',
    'package-hint-detail', 'package-reset'];
  const nodes = Object.fromEntries(selectors.map((s) => [`[data-${s}]`, new Element()]));
  nodes['[data-waste-checkbox]'].checked = waste;
  const component = new Element();
  component.dataset = { sqmPerPackage: '1.988', packagePriceCents: '10534',
    variantId: '1', initialPackages: '1', pieceCount: '', pieceLabel: '', railLength: '' };
  component.querySelector = (selector) => nodes[selector] ?? null;
  component.closest = () => null;
  const doc = new Element();
  doc.querySelector = (selector) => selector.startsWith('carpet-package-selector-') ? component : null;
  doc.dispatchEvent = () => {};
  const requests = [];
  const context = vm.createContext({
    document: doc, window: { location: {} }, setTimeout() {},
    CustomEvent: class { constructor(type, detail) { Object.assign(this, { type, ...detail }); } },
    fetch: async (url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({}) };
    },
  });
  vm.runInContext(packageScript, context, { filename: packageFile, timeout: 1000 });
  const input = nodes['[data-sqm-input]'];
  const click = (name) => component.emit('click', {
    target: { closest: (query) => query === `[data-${name}]` ? nodes[query] ?? {} : null },
    preventDefault() {}, stopPropagation() {},
  });
  return {
    tippe(raw) { input.value = raw; input.emit('input'); input.emit('blur'); },
    minus() { click('decrease-packages'); },
    plus() { click('increase-packages'); },
    zurueck() { click('package-reset'); },
    flaechePlus() { click('increase-sqm'); },
    verschnitt(an) { nodes['[data-waste-checkbox]'].checked = an; nodes['[data-waste-checkbox]'].emit('change'); },
    fokusOhneEingabe() { input.emit('blur'); },
    async kaufen() { click('add-to-cart'); await new Promise((r) => setImmediate(r)); return requests.at(-1); },
    get feld() { return input.value; },
    get pakete() { return nodes['[data-package-display]'].textContent; },
    get flaeche() { return nodes['[data-sqm-display]'].textContent; },
    get preis() { return nodes['[data-total-display]'].textContent; },
    get hinweisSichtbar() { return !nodes['[data-package-hint]'].hidden; },
    get hinweis() { return nodes['[data-package-hint-text]'].textContent.replace(/ /g, ' '); },
    get empfehlung() { return nodes['[data-package-hint-detail]'].textContent; },
  };
}

test('Befund: 18 m² + 5 %, ein Paket weniger - Feld bleibt, Fehlflaeche wird genannt', async () => {
  const r = rechner();
  r.tippe('18');
  assert.equal(r.pakete, '10');
  assert.equal(r.hinweisSichtbar, false);
  r.minus();
  assert.equal(r.feld, '18,00', 'eingegebene Flaeche wird nicht ueberschrieben');
  assert.equal(r.pakete, '9');
  assert.equal(r.flaeche, '17,892 m²');
  assert.equal(r.preis, '948,06 €');
  assert.equal(r.hinweisSichtbar, true);
  assert.equal(r.hinweis, 'Für Ihre 18,00 m² fehlen 0,108 m². Die empfohlene Reserve entfällt.');
  assert.equal(r.empfehlung, 'Empfohlen: 10 Originalpakete.');
  const body = await r.kaufen();
  assert.equal(body.quantity, 9, 'Warenkorb bekommt die gewaehlte Paketzahl');
  assert.equal(body.properties._pakete, '9');
  assert.equal(body.properties._qm_gesamt, '17,892');
  assert.equal(body.properties._bedarf_qm, '18,000', 'Bedarf ist die echte Kundenflaeche');
  assert.equal(body.properties._verschnitt, '5%');
});

test('Reserve reduziert, aber Flaeche gedeckt', () => {
  // 19 m² + 5 % = 19,95 m² -> 11 Pakete; 10 Pakete = 19,88 m² decken 19 m²,
  // nur die Reserve schrumpft von 0,95 auf 0,88 m².
  const r = rechner();
  r.tippe('19');
  assert.equal(r.pakete, '11');
  r.minus();
  assert.equal(r.pakete, '10');
  assert.equal(r.hinweis, 'Ihre 19,00 m² sind gedeckt. Reserve reduziert: 0,880 m² statt 0,950 m².');
});

test('Plus: Mehrmenge gegenueber der Empfehlung', async () => {
  const r = rechner();
  r.tippe('18');
  r.plus();
  r.plus();
  assert.equal(r.feld, '18,00');
  assert.equal(r.pakete, '12');
  assert.equal(r.hinweis, '3,976 m² mehr als berechnet.');
  assert.equal((await r.kaufen()).quantity, 12);
});

test('Zurueck zur Empfehlung, und zurueck auf die Empfehlung per Knopf', () => {
  const r = rechner();
  r.tippe('18');
  r.minus();
  r.zurueck();
  assert.equal(r.pakete, '10');
  assert.equal(r.hinweisSichtbar, false);
  r.minus();
  r.plus();
  assert.equal(r.pakete, '10');
  assert.equal(r.hinweisSichtbar, false, 'wieder auf der Empfehlung = kein Hinweis');
});

test('Neue Flaeche, m²-Steller und Verschnitt-Schalter heben die manuelle Wahl auf', () => {
  const r = rechner();
  r.tippe('18');
  r.minus();
  r.tippe('20');
  assert.equal(r.pakete, '11');
  assert.equal(r.hinweisSichtbar, false);

  r.minus();
  r.flaechePlus();
  assert.equal(r.hinweisSichtbar, false);
  assert.equal(r.feld, '20,25');

  r.minus();
  r.verschnitt(false);
  assert.equal(r.pakete, '11', '20,25 m² ohne Reserve = 10,19 Pakete -> 11');
  assert.equal(r.hinweisSichtbar, false);
});

test('Ohne Reserve: Minus nennt nur die fehlende Flaeche', () => {
  const r = rechner({ waste: false });
  r.tippe('18');
  assert.equal(r.pakete, '10');
  r.minus();
  assert.equal(r.hinweis, 'Für Ihre 18,00 m² fehlen 0,108 m².');
});

test('Leeres Feld: Paket-Knoepfe schreiben keine erfundene Flaeche, kein Hinweis', async () => {
  const r = rechner();
  r.plus();
  r.plus();
  assert.equal(r.feld, '');
  assert.equal(r.pakete, '3');
  assert.equal(r.hinweisSichtbar, false);
  r.fokusOhneEingabe();
  assert.equal(r.pakete, '3', 'Hinein- und Hinausklicken setzt nicht auf ein Paket zurueck');
  assert.equal((await r.kaufen()).quantity, 3);
  r.minus();
  r.minus();
  r.minus();
  assert.equal(r.pakete, '1');
});

test('Feld 0 fuehrt in den Ein-Paket-Ruhezustand ohne Hinweis', () => {
  const r = rechner();
  r.tippe('18');
  r.minus();
  r.tippe('0');
  assert.equal(r.feld, '');
  assert.equal(r.pakete, '1');
  assert.equal(r.hinweisSichtbar, false);
});

test('Minus stoppt bei einem Paket', () => {
  const r = rechner();
  r.tippe('3');
  for (let i = 0; i < 5; i += 1) r.minus();
  assert.equal(r.pakete, '1');
  assert.equal(r.hinweis, 'Für Ihre 3,00 m² fehlen 1,012 m². Die empfohlene Reserve entfällt.');
});
