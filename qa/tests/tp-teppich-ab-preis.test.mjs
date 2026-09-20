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

const ohneDoc = (datei) => readFileSync(path.join(root, datei), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
// Das Snippet bindet die Qualitaetszeile ein - die Engine bekommt das echte Snippet mit.
const engine = new Liquid({ templates: {
  'tp-teppich-qualitaet': ohneDoc('snippets/tp-teppich-qualitaet.liquid'),
  'tp-teppich-max-breite': ohneDoc('snippets/tp-teppich-max-breite.liquid'),
} });
engine.registerFilter('divided_by', (a, b) => Math.floor(Number(a) / Number(b)));
engine.registerFilter('money', (c) => (Number(c) / 100).toFixed(2).replace('.', ',') + ' €');
engine.registerFilter('money_without_trailing_zeros', (c) =>
  ((Number(c) / 100).toFixed(2).replace('.', ',') + ' €').replace(',00 €', ' €'));

const W = 80;
const L = 150;

function produkt({ einheitCent, mindest = 99, art = 'Ketteln', p001 = true, maxB = 400, maxL = 1000, varianten = null }) {
  const variants = varianten || [{ price: einheitCent, available: true, metafields: { service: { einfassen: { value: 'Verfügbar' } } } }];
  return {
    price_min: Math.min(...variants.map((v) => v.price)),
    variants,
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
  assert.match(html, /tp-ab-preis__betrag">197,80 €/);
  assert.match(html, /inkl\. Kettelung/);
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

test('Karte: Qualitaetszeile kommt vom Teppichboden, nichts wird ergaenzt', async () => {
  const p = produkt({ einheitCent: 117 });
  p.metafields.service.einfass_basis = { value: { metafields: { custom: {
    fasermaterial: { type: 'list.metaobject_reference', value: [{ fasermaterial: { value: 'Schurwolle' } }] },
    arten: { type: 'list.metaobject_reference', value: [{ name: { value: 'Schlinge' } }, { name: { value: 'Natur' } }] },
    florhohe: { value: '6 mm' },
  } } } };
  const html = await render(p);
  assert.match(html, /tp-ab-preis__qualitaet">Schurwolle · Schlinge · 6 mm Flor</);
});

test('Karte ohne Daten am Teppichboden: keine Qualitaetszeile, Preis bleibt', async () => {
  const html = await render(produkt({ einheitCent: 117 }));
  assert.doesNotMatch(html, /tp-ab-preis__qualitaet/);
  assert.equal(abCent(html), 120 * 117 + 460 * 19);
});

test('Produktseite (mit Variante): keine Qualitaetszeile', async () => {
  const p = produkt({ einheitCent: 117 });
  p.metafields.service.einfass_basis = { value: { metafields: { custom: { florhohe: { value: '6 mm' } } } } };
  const html = await render(p, kettelOk, { price: 117 });
  assert.doesNotMatch(html, /tp-ab-preis__qualitaet/);
});

const v = (price, available = true, einfassen = 'Verfügbar') => ({ price, available, metafields: { service: { einfassen: { value: einfassen } } } });

test('Karte: nicht verfuegbare oder nicht freigegebene Farben zaehlen nicht fuer den ab-Preis', async () => {
  const html = await render(produkt({ varianten: [v(20, false), v(30, true, 'Nicht verfügbar'), v(92)] }));
  assert.equal(abCent(html), 120 * 92 + 460 * 19, 'die guenstigste KAUFBARE Farbe (92) zaehlt, nicht price_min (20)');
});

test('keine einzige kaufbare Farbe: kein ab-Preis', async () => {
  const html = await render(produkt({ varianten: [v(20, false)] }));
  assert.equal(abCent(html), null);
});

test('fehlende Grenzen (leer oder 0): kein ab-Preis - der Konfigurator faellt dann auch aus', async () => {
  assert.equal(abCent(await render(produkt({ einheitCent: 92, maxL: null }))), null);
  assert.equal(abCent(await render(produkt({ einheitCent: 92, maxB: 0 }))), null);
});

test('Text nennt Kettelung nur bei Ketteln, sonst Einfassung', async () => {
  assert.match(await render(produkt({ einheitCent: 92 })), /inkl\. Kettelung/);
  const band = await render(produkt({ einheitCent: 129, art: 'Einfassband', mindest: null }));
  assert.match(band, /inkl\. Einfassung/);
  assert.doesNotMatch(band, /Kettelung/);
});

test('Kettelservice-Handle im Snippet = Einstellung im Produkt-Template', () => {
  const tpl = readFileSync(path.join(root, 'templates/product.einfassung.json'), 'utf8');
  const handle = tpl.match(/"kettelservice_produkt":\s*"([^"]+)"/)[1];
  assert.match(source, new RegExp(`all_products\\['${handle}'\\]`), 'Anzeige und Warenkorb wuerden mit verschiedenen Kettelpreisen rechnen.');
});

test('Qualitaetszeile ohne Fasermaterial: zwei gepflegte Arten statt einer, nichts erfunden', async () => {
  const p = produkt({ einheitCent: 92 });
  p.metafields.service.einfass_basis = { value: { metafields: { custom: {
    arten: { type: 'list.metaobject_reference', value: [{ name: { value: 'Schlinge' } }, { name: { value: 'Wolle' } }, { name: { value: 'Natur' } }] },
    florhohe: { value: '3,2 mm' },
  } } } };
  assert.match(await render(p), /tp-ab-preis__qualitaet">Schlinge · Wolle · 3,2 mm Flor</);
});
