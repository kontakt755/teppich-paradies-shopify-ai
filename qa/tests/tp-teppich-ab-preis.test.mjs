// S-04: Der Einstiegspreis "ab XX EUR" auf Karte und Produktseite muss exakt der
// Preis sein, den der Konfigurator fuer das Einstiegsmass (80 x 150 cm) berechnet.
// Die Regel steht zweimal im Repository - in Liquid (Anzeige) und im Rechenkern
// assets/tp-masstepich-rechnung.js (Warenkorb). Dieser Test rendert das echte
// Snippet mit LiquidJS und vergleicht es mit dem Rechenkern, damit beide nicht
// auseinanderlaufen. divided_by-Shim wie in tp-cart-paketzeile-praezision.test.mjs:
// Shopify teilt Integer/Integer ganzzahlig, LiquidJS nicht.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
let source = readFileSync(path.join(root, 'snippets/tp-teppich-ab-preis.liquid'), 'utf8');
source = source.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');

createRequire(import.meta.url)('../../assets/tp-masstepich-rechnung.js');
const M = globalThis.TPMass;

const engine = new Liquid();
engine.registerFilter('divided_by', (a, b) => Math.floor(Number(a) / Number(b)));
engine.registerFilter('money', (c) => (Number(c) / 100).toFixed(2).replace('.', ',') + ' €');
engine.registerFilter('money_without_trailing_zeros', (c) =>
  ((Number(c) / 100).toFixed(2).replace('.', ',') + ' €').replace(',00 €', ' €'));

const W = 80;
const L = 150;

function produkt({ einheitCent, mindest = 99, art = 'Ketteln', p001 = true, maxB = 400, maxL = 1000 }) {
  return {
    price_min: einheitCent,
    metafields: {
      custom: { preis_pro_001_qm: { value: p001 } },
      service: { einfassung: { value: art }, mindestpreis: { value: mindest }, max_breite_cm: { value: maxB }, max_laenge_cm: { value: maxL } },
    },
  };
}
const kettelOk = { kettelservice: { selected_or_first_available_variant: { available: true, price: 19 } } };

async function render(product, all_products = kettelOk, variant = null) {
  return engine.parseAndRender(source, { product, all_products, variant });
}
function abCent(html) {
  const m = html.match(/data-tp-ab-cent="(\d+)"/);
  return m ? Number(m[1]) : null;
}
function erwartet(einheitCent, kettelCentJeEinheit, mindestCent) {
  const flaeche = M.abrechnungsflaecheM2('rechteck', W, L);
  const kante = kettelCentJeEinheit ? M.kanteEinheiten(M.umfangM('rechteck', W, L)) * kettelCentJeEinheit : 0;
  const menge = M.mengeMitMindestpreis(flaeche, einheitCent, Math.max(0, mindestCent - kante));
  return menge * einheitCent + kante;
}

test('Rechenkern ist geladen', () => {
  assert.equal(typeof M.mengeMitMindestpreis, 'function');
});

for (const einheitCent of [26, 27, 34, 89, 147, 296]) {
  test(`ab-Preis bei ${einheitCent} ct je 0,01 m2 entspricht dem Rechenkern`, async () => {
    const html = await render(produkt({ einheitCent }));
    assert.equal(abCent(html), erwartet(einheitCent, 19, 9900));
  });
}

test('Einstiegsmass 80 x 150: Material plus Kettelung, Mass und Grundpreis stehen dabei', async () => {
  const html = await render(produkt({ einheitCent: 92 }));
  assert.equal(abCent(html), 120 * 92 + 460 * 19);
  assert.match(html, /ab 197,80 €/);
  assert.match(html, /80&nbsp;×&nbsp;150&nbsp;cm/);
  assert.doesNotMatch(html, /m²/, 'Bei belegtem ab-Preis steht kein m2-Preis dabei.');
});

test('Mindestpreis greift weiter, wenn das Einstiegsmass darunter liegt', async () => {
  const html = await render(produkt({ einheitCent: 5, mindest: 150 }));
  assert.equal(abCent(html), erwartet(5, 19, 15000));
  assert.ok(abCent(html) >= 15000);
});

test('Einstiegsmass passt nicht in die Rolle: kein ab-Preis', async () => {
  const html = await render(produkt({ einheitCent: 92, maxB: 70 }));
  assert.equal(abCent(html), null);
});

test('andere Einfassart: keine Kettelzeile eingerechnet', async () => {
  const html = await render(produkt({ einheitCent: 129, art: 'Einfassband', mindest: null }));
  assert.equal(abCent(html), erwartet(129, 0, 0));
});

test('Kettelservice nicht kaufbar: kein ab-Preis, nur Preis je m2', async () => {
  const html = await render(produkt({ einheitCent: 26 }), {
    kettelservice: { selected_or_first_available_variant: { available: false, price: 19 } },
  });
  assert.equal(abCent(html), null);
  assert.match(html, /ab 26,00 €<span[^>]*>\/m²/);
});

test('Rollenware mit 0,01-m2-Preis, aber ohne Einfassung: kein ab-Preis', async () => {
  const html = await render(produkt({ einheitCent: 29, art: '' }));
  assert.equal(abCent(html), null);
  assert.match(html, /29,00 €/);
});

test('Produktseite: gewaehlte Farbe bestimmt den ab-Preis, nicht die guenstigste', async () => {
  const html = await render(produkt({ einheitCent: 92 }), kettelOk, { price: 117 });
  assert.equal(abCent(html), 120 * 117 + 460 * 19);
  assert.doesNotMatch(html, /m²/);
});
