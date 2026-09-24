import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Liquid } from 'liquidjs';

// Product-JSON-LD der Flaechenware. Merchant Center liest die Produktseite
// ("automatische Artikelaktualisierung") und verwirft jedes Angebot ohne
// offers.price - es erscheint dann als "Produkt wird nicht angezeigt".
// Geprueft wird deshalb: jedes Angebot hat einen Preis, er ist der m2-Preis
// der Seite, und Service-/Hilfsprodukte bekommen weiterhin gar kein JSON-LD.
//
// Grenze: LiquidJS ist nicht Shopifys Liquid; image_url/structured_data sind
// hier Attrappen. Geprueft wird die Angebotsstruktur, nicht das Rendering.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tpl = readFileSync(join(root, 'snippets', 'tp-product-structured-data.liquid'), 'utf8');

// Das Snippet rendert seit 2026-09-23 ein Teil-Snippet (Merkmale als
// additionalProperty), deshalb muss LiquidJS Partials aus snippets/ finden.
// Shopifys {% doc %} kennt es nicht - hier als Leertag angemeldet.
const eng = new Liquid({
  strictFilters: false,
  strictVariables: false,
  root: join(root, 'snippets'),
  extname: '.liquid',
});
eng.registerTag('doc', {
  parse(tagToken, remainTokens) {
    while (remainTokens.length) {
      const t = remainTokens.shift();
      if (t.name === 'enddoc') return;
    }
  },
  render: () => '',
});
eng.registerFilter('image_url', v => (typeof v === 'string' ? v : '//cdn/bild.jpg'));
eng.registerFilter('structured_data', () => '{"@type":"Product","name":"nativ"}');
eng.registerFilter('json', v => JSON.stringify(v ?? null));

const variante = (o = {}) => ({
  id: o.id ?? 1,
  title: o.title ?? '400 cm / Sand',
  price: o.price ?? 2390,
  sku: o.sku ?? 'CVX_333',
  available: o.available ?? true,
  options: o.options ?? ['400 cm', 'Sand'],
  featured_image: null,
  metafields: { custom: { rollenbreite: { value: o.rollenbreite ?? 4 } } },
});

const produkt = (o = {}) => ({
  id: 42,
  title: o.title ?? 'Eichwald Eiche Greige',
  type: o.type ?? 'Vinyl von der Rolle',
  tags: o.tags ?? [],
  vendor: 'TeppichParadies',
  description: 'Beschreibung',
  url: '/products/eichwald',
  images: [],
  featured_image: null,
  options: o.options ?? ['Breite', 'Farbe'],
  variants: o.variants ?? [variante()],
  metafields: {
    custom: {
      preis_pro_001_qm: { value: o.per001 ?? false },
      wunschmass_mindestbreite_cm: { value: 0 },
      ...(o.merkmale ?? {}),
    },
  },
});

const rendern = async (p) => eng.parseAndRender(tpl, {
  product_resource: p,
  request: { origin: 'https://www.teppich-paradies.net' },
  cart: { currency: { iso_code: 'EUR' } },
  shop: { name: 'TeppichParadies' },
});

const gruppe = (html) => {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'kein JSON-LD ausgegeben');
  return JSON.parse(m[1]);
};

test('Meterware: jede Variante hat offers.price in Euro je m2', async () => {
  const d = gruppe(await rendern(produkt()));
  assert.equal(d['@type'], 'ProductGroup');
  assert.equal(d.hasVariant.length, 1);
  const off = d.hasVariant[0].offers;
  assert.equal(off.price, 23.9, 'offers.price fehlt oder ist falsch');
  assert.equal(off.priceCurrency, 'EUR');
  assert.equal(off.priceSpecification.price, 23.9, 'Einheitspreis muss gleich offers.price sein');
  assert.equal(off.priceSpecification.referenceQuantity.unitCode, 'MTK');
});

test('Preis je 0,01 m2 wird auf den m2-Preis hochgerechnet', async () => {
  const p = produkt({ per001: true, variants: [variante({ price: 89, rollenbreite: 0 })] });
  const d = gruppe(await rendern(p));
  assert.equal(d.hasVariant[0].offers.price, 89);
  assert.equal(d.hasVariant[0].offers.priceSpecification.price, 89);
});

test('Wunschmass-, opc- und Nullpreis-Varianten bleiben ohne Angebot', async () => {
  const p = produkt({ variants: [
    variante({ id: 1 }),
    variante({ id: 2, title: 'Wunschmaß / Sand', options: ['Wunschmaß', 'Sand'] }),
    variante({ id: 3, title: 'opc-rechner' }),
    variante({ id: 4, title: '500 cm / Sand', price: 0 }),
  ] });
  const d = gruppe(await rendern(p));
  assert.equal(d.hasVariant.length, 1);
  assert.equal(d.hasVariant[0].offers.price, 23.9);
});

test('Serviceprodukte bekommen weiterhin gar kein JSON-LD', async () => {
  for (const p of [produkt({ type: 'Service' }), produkt({ type: 'Musterservice' }), produkt({ tags: ['service'] })]) {
    assert.equal((await rendern(p)).trim(), '');
  }
});

test('Produkte ohne Flaechenpreis behalten Shopifys natives JSON-LD', async () => {
  const p = produkt({ type: 'Klickvinyl', variants: [variante({ rollenbreite: 0 })] });
  const html = await rendern(p);
  assert.match(html, /"nativ"/);
});

test('Merkmale stehen als additionalProperty im ProductGroup-Knoten', async () => {
  const d = gruppe(await rendern(produkt({
    merkmale: {
      material: { type: 'single_line_text_field', value: 'PVC' },
      nutzungsklassen: { type: 'list.metaobject_reference', value: [{ nutzungsklasse: '23' }, { nutzungsklasse: '33' }] },
      rollenbreite: { type: 'number_decimal', value: 4 },
    },
  })));
  const alsMap = Object.fromEntries((d.additionalProperty ?? []).map((x) => [x.name, x.value]));
  assert.equal(alsMap.Material, 'PVC');
  assert.equal(alsMap.Nutzungsklassen, '23, 33');
  assert.equal(alsMap.Rollenbreite, '4 m');
  // Der Preis bleibt unangetastet - genau dafuer gibt es diese Datei.
  assert.equal(d.hasVariant[0].offers.price, 23.9);
});

test('Ohne gepflegte Merkmale entsteht kein leeres additionalProperty', async () => {
  const d = gruppe(await rendern(produkt()));
  assert.equal('additionalProperty' in d, false);
  assert.equal(d.hasVariant[0].offers.price, 23.9);
});
