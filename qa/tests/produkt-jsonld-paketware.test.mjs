// Paketware (Teppichfliesen, Klick-/Klebevinyl) im Product-JSON-LD.
//
// Befund 2026-09-23: Der Variantenpreis dieser Produkte ist der PAKETPREIS,
// die Produktseite zeigt Paket- und Quadratmeterpreis. Google las am
// 20.10. den m2-Preis aus den Metadaten und lehnte die Paketpreise ab.
//
// Grenze: LiquidJS ist nicht Shopifys Liquid; image_url/structured_data sind
// Attrappen. Geprueft wird die Angebotsstruktur, nicht das Rendering.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Liquid } from 'liquidjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tpl = readFileSync(join(root, 'snippets', 'tp-product-structured-data.liquid'), 'utf8');
const metaTpl = readFileSync(join(root, 'snippets', 'meta-tags.liquid'), 'utf8');

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
eng.registerFilter('json', v => JSON.stringify(v ?? null));
const metaEng = new Liquid({ strictFilters: false, strictVariables: false });
// Shopify teilt bei ganzzahligem Divisor ganzzahlig; LiquidJS verwendet JS-Zahlen.
metaEng.registerFilter('divided_by', (value, divisor) => Number.isInteger(divisor)
  ? Math.floor(Number(value) / divisor) : Number(value) / divisor);
const ogPreis = async p => {
  const meta = await metaEng.parseAndRender(metaTpl.slice(metaTpl.indexOf("{%- if request.page_type == 'product' -%}")), {
    product: p, request: { page_type: 'product' },
    shop: { name: 'TeppichParadies' }, cart: { currency: { iso_code: 'EUR' } },
  });
  const amount = meta.match(/property="og:price:amount"\s+content="([^"]+)"/);
  assert.ok(amount, 'og:price fehlt');
  return Number(amount[1]);
};

const variante = (o = {}) => ({
  id: o.id ?? 1,
  title: o.title ?? 'Grau',
  price: o.price ?? 21846,
  sku: o.sku ?? 'ALV-1',
  available: true,
  options: o.options ?? ['Grau'],
  featured_image: null,
  metafields: { custom: { rollenbreite: { value: o.rollenbreite ?? null } } },
});

const produkt = (o = {}) => ({
  id: 42,
  title: o.title ?? 'Alvora Terrazzo Grau',
  type: o.type ?? 'Vinylboden',
  tags: [],
  vendor: 'TeppichParadies',
  description: 'Beschreibung',
  url: '/products/alvora',
  images: [],
  featured_image: null,
  options: ['Farbe'],
  variants: o.variants ?? [variante()],
  selected_or_first_available_variant: (o.variants ?? [variante()])[0],
  metafields: {
    custom: {
      qm_pro_paket: { value: o.qm === undefined ? 4.86 : o.qm },
      preis_pro_001_qm: { value: o.per001 === undefined ? false : o.per001 },
      wunschmass_mindestbreite_cm: { value: null },
    },
  },
});

const rendern = (p) => eng.parseAndRender(tpl, {
  product_resource: p,
  product: p,
  request: { origin: 'https://www.teppich-paradies.net' },
  cart: { currency: { iso_code: 'EUR' } },
  template: { name: 'product' },
});

const preise = (html) => [...html.matchAll(/"price":\s*([0-9.]+)/g)].map(m => Number(m[1]));

test('Paketware meldet den kaufbaren Paketpreis in beiden Preisfeldern', async () => {
  const html = await rendern(produkt());
  assert.ok(!html.includes('"nativ"'), 'Paketware faellt noch in Shopifys nativen Zweig');
  const p = preise(html);
  assert.ok(p.length >= 1, 'kein Preis im Markup');
  assert.deepEqual(p, [218.46, 218.46]);
});

test('Grundpreis bleibt ueber Paketflaeche und Basis 1 MTK bestimmbar', async () => {
  const html = await rendern(produkt());
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const unit = data.hasVariant[0].offers.priceSpecification;
  assert.equal(unit['@type'], 'UnitPriceSpecification');
  assert.equal(unit.price, 218.46);
  assert.deepEqual(unit.referenceQuantity, {
    '@type': 'QuantitativeValue', value: 4.86, unitCode: 'MTK',
    valueReference: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MTK' },
  });
  assert.equal(Math.round(unit.price / unit.referenceQuantity.value * 100) / 100, 44.95);
});

test('Paketpreis bleibt auch bei periodischem Grundpreis centgenau', async () => {
  const html = await rendern(produkt({ qm: 3, variants: [variante({ price: 5000 })] }));
  assert.deepEqual(preise(html), [50, 50]);
});

test('Paketware gewinnt gegen eine Rollenbreite an der Variante', async () => {
  const html = await rendern(produkt({ variants: [variante({ rollenbreite: 4 })] }));
  assert.deepEqual(preise(html), [218.46, 218.46]);
});

for (const [name, qm, cents, grundpreis] of [
  ['Designboden', 5.25, 33332, 63.49],
  ['Teppichfliese', 5, 20752, 41.5],
]) {
  test(`Merchant-Regression ${name}: Feedpreis und Seitenmetadaten stimmen ueberein`, async () => {
    const p = produkt({ qm, variants: [variante({ price: cents })] });
    const html = await rendern(p);
    const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const offer = data.hasVariant[0].offers;
    assert.equal(offer.price, cents / 100);
    assert.equal(offer.priceSpecification.price, cents / 100);
    assert.equal(Math.round(offer.price / qm * 100) / 100, grundpreis);
    assert.equal(await ogPreis(p), offer.price);
  });
}

test('og:price folgt der ausgewaehlten Variante statt dem kleinsten Paketpreis', async () => {
  const p = produkt({ variants: [variante({ id: 1, price: 10000 }), variante({ id: 2, price: 20752 })] });
  p.selected_or_first_available_variant = p.variants[1];
  assert.equal(await ogPreis(p), 207.52);
});

test('og:price von Stueckware, Massware und Laengenware bleibt unveraendert', async () => {
  const stueck = produkt({ qm: null, variants: [variante({ price: 949 })] });
  const mass = produkt({ qm: null, per001: true, variants: [variante({ price: 57 })] });
  const laenge = produkt({ qm: null, variants: [variante({ price: 18 })] });
  laenge.metafields.custom.preis_pro_001_lfm = { value: true };
  assert.equal(await ogPreis(stueck), 9.49);
  assert.equal(await ogPreis(mass), 57);
  assert.equal(await ogPreis(laenge), 18);
});

test('Ohne qm_pro_paket bleibt alles wie bisher', async () => {
  const html = await rendern(produkt({ qm: null, variants: [variante({ rollenbreite: null })] }));
  assert.ok(!html.includes('"nativ"'), 'nicht-Paketware muss dieselbe ProductGroup-Quelle nutzen');
  assert.ok(preise(html).includes(218.46), 'normale Ware muss den aktuellen Variantenpreis behalten');
  assert.ok(!html.includes('UnitPriceSpecification'), 'Stueckware darf keine m2-Referenz erhalten');
});
