import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// Mengenhilfe fuer Zubehoer (blocks/tp-zubehoer-menge.liquid).
//
// Der Liquid-Teil laesst sich ohne Shopify nicht rendern. Geprueft wird
// deshalb, was ohne Shopify pruefbar ist: das Skript des Blocks gegen eine
// Attrappe von Kaufformular und Mengenfeld, und dass Block und vorbereitete
// Quelldaten dieselben Metafelder meinen.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const blockSource = readFileSync(path.join(root, 'blocks/tp-zubehoer-menge.liquid'), 'utf8');
const readJson = name => JSON.parse(readFileSync(path.join(root, 'domains/shopify/zubehoer-mengen', name), 'utf8'));

function ladeElement() {
  const script = blockSource.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'Block enthaelt kein <script>');
  const registry = new Map();
  const sandbox = {
    HTMLElement: class {},
    customElements: { get: name => registry.get(name), define: (name, cls) => registry.set(name, cls) },
    document: { addEventListener() {}, removeEventListener() {} },
    Event: class { constructor(type) { this.type = type; } },
    setTimeout: () => 0,
  };
  vm.runInNewContext(script[1], sandbox);
  const Klasse = registry.get('tp-zubehoer-menge');
  assert.ok(Klasse, 'Custom Element tp-zubehoer-menge nicht registriert');
  return Klasse;
}

const Klasse = ladeElement();

function feld(extra = {}) {
  return {
    hidden: true,
    textContent: '',
    value: '',
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    contains() { return false; },
    dispatchEvent() { return true; },
    ...extra,
  };
}

// Eine Produktseite mit genau einer gewaehlten Variante und Menge 1.
function seite(eintrag) {
  const variante = '4711';
  const el = new Klasse();
  const teile = {
    '[data-box]': feld(),
    '[data-label]': feld(),
    '[data-input]': feld(),
    '[data-unit]': feld(),
    '[data-result]': feld(),
    '[data-hint]': feld(),
  };
  const menge = feld({ value: '1' });
  const id = feld({ value: variante });
  el.dataset = { map: JSON.stringify(eintrag ? { [variante]: eintrag } : {}), selected: variante };
  el.querySelector = selector => teile[selector] || null;
  el.closest = () => ({
    querySelector: selector => {
      if (selector === 'input[name="quantity"]') return menge;
      if (selector.includes('name="id"')) return id;
      return null;
    },
  });
  el.connectedCallback();
  const eingeben = wert => {
    teile['[data-input]'].value = wert;
    teile['[data-input]'].listeners.input();
  };
  return { teile, menge, eingeben };
}

test('A: Reichweite laut Hersteller rundet auf und nennt ihre Quelle', () => {
  const { teile, menge, eingeben } = seite({ m: 'gebinde', w: 0, a: 100, n: 'reichweite' });
  assert.equal(teile['[data-box]'].hidden, false);
  assert.equal(teile['[data-unit]'].textContent, 'm²');
  assert.equal(teile['[data-hint]'].textContent, 'Laut Herstellerangabe reicht ein Gebinde für etwa 100 m².');
  eingeben('250');
  assert.equal(menge.value, '3');
  assert.match(teile['[data-result]'].textContent, /^3 Gebinde bestellen \(reicht laut Herstellerangabe für etwa 300 m²\)\./);
});

test('B: Gebinde mit Flaeche aus der Bezeichnung rechnet wie bisher', () => {
  const { teile, menge, eingeben } = seite({ m: 'gebinde', w: 0, a: 30.14, n: '' });
  assert.equal(teile['[data-hint]'].textContent, 'Ein Gebinde reicht für 30,14 m².');
  eingeben('60');
  assert.equal(menge.value, '2');
  assert.match(teile['[data-result]'].textContent, /^2 Gebinde bestellen \(deckt 60,28 m²\)\./);
});

test('C: Klebeband rechnet in Metern je Rolle', () => {
  const { teile, menge, eingeben } = seite({ m: 'stange', w: 0, a: 50, n: 'rolle' });
  assert.equal(teile['[data-label]'].textContent, 'Benötigte Bandlänge');
  assert.equal(teile['[data-unit]'].textContent, 'm');
  assert.match(teile['[data-hint]'].textContent, /^Eine Rolle ist 50 m lang\./);
  eingeben('120');
  assert.equal(menge.value, '3');
  assert.match(teile['[data-result]'].textContent, /^3 Rollen bestellen \(ergibt 150 m\)\./);
  eingeben('30');
  assert.equal(menge.value, '1');
  assert.match(teile['[data-result]'].textContent, /^1 Rolle bestellen/);
});

test('D: Gleitkomma bestellt keine Stange zu viel', () => {
  // 7,2 / 2,4 ist in Gleitkomma 3,0000000000000004 - ohne Toleranz 4 Stangen.
  const { menge, eingeben } = seite({ m: 'stange', w: 0, a: 2.4, n: 'stange' });
  eingeben('7,2');
  assert.equal(menge.value, '3');
  eingeben('7,3');
  assert.equal(menge.value, '4');
});

test('E: Variante ohne belegte Einheit zeigt nichts und laesst die Menge stehen', () => {
  const { teile, menge, eingeben } = seite(null);
  assert.equal(teile['[data-box]'].hidden, true);
  eingeben('25');
  assert.equal(menge.value, '1');
  assert.equal(teile['[data-result]'].textContent, '');
});

test('F: Block liest genau die vorbereiteten Metafelder am richtigen Traeger', () => {
  const { definitionen } = readJson('metafeld-definitionen.json');
  assert.ok(definitionen.length > 0);
  for (const d of definitionen) {
    const traeger = d.ownerType === 'PRODUCTVARIANT' ? 'tp_zm_v' : 'tp_zm_product';
    const zugriff = `${traeger}.metafields.${d.namespace}.${d.key}.value`;
    assert.ok(blockSource.includes(zugriff), `${zugriff} fehlt im Block`);
    assert.equal(d.type, 'number_decimal', `${d.key}: Typ`);
  }
});

test('G: Zielfelder der Quelldaten tragen nur belegte, abgeschriebene Werte', () => {
  // Zielfeld = was spaeter in Shopify geschrieben wird. Vorschlaege, Spannen
  // und gerechnete Werte stehen daneben, nie im Zielfeld.
  const band = readJson('bandlaenge.json');
  for (const p of band.produkte) {
    assert.match(p.productId, /^gid:\/\/shopify\/Product\/\d+$/, p.handle);
    assert.ok(p.quelle && p.quelle.length > 10, `${p.handle}: Quelle fehlt`);
    if (p.status === 'belegt') {
      assert.ok(Number(p.bandlaenge_m) > 0, `${p.handle}: belegt ohne Wert`);
      // Abgeschrieben, nicht gesetzt: der Wert steht woertlich in der Quelle.
      assert.ok(p.quelle.includes(`${Number(p.bandlaenge_m)} m`), `${p.handle}: Wert nicht in der Quelle`);
    } else {
      assert.equal(p.bandlaenge_m, null, `${p.handle}: Zielfeld nur bei Status belegt`);
    }
  }

  const reich = readJson('reichweite.json');
  const erlaubt = new Set(Object.keys(reich.status_bedeutung));
  for (const v of reich.varianten) {
    const name = `${v.handle} / ${v.variante}`;
    assert.ok(erlaubt.has(v.status), `${name}: unbekannter Status ${v.status}`);
    assert.match(v.variantId, /^gid:\/\/shopify\/ProductVariant\/\d+$/, name);
    if (v.status === 'belegt') assert.ok(Number(v.reichweite_m2) > 0, `${name}: belegt ohne Wert`);
    else assert.equal(v.reichweite_m2, null, `${name}: Zielfeld nur bei Status belegt`);
    if (v.status === 'freigabe_noetig') assert.ok(v.offen, `${name}: offene Frage fehlt`);
  }
});
