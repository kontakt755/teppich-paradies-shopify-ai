// Paketware (Teppichfliesen, Klick-/Klebevinyl) im Product-JSON-LD.
//
// Befund 2026-09-23: Der Variantenpreis dieser Produkte ist der PAKETPREIS,
// die Produktseite fuehrt aber EUR/m2. Ohne Umrechnung meldete das JSON-LD
// 218,46 gegen einen sichtbaren Preis von 44,95 - eine Preisabweichung, die
// das Merchant Center beanstandet ("automatische Artikelaktualisierung"
// liest die Seite und vergleicht).
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

const eng = new Liquid({ strictFilters: false, strictVariables: false });
eng.registerFilter('image_url', v => (typeof v === 'string' ? v : '//cdn/bild.jpg'));
eng.registerFilter('structured_data', () => '{"@type":"Product","name":"nativ"}');
eng.registerFilter('json', v => JSON.stringify(v ?? null));

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

test('Paketware meldet den Quadratmeterpreis, nicht den Paketpreis', async () => {
  // 218,46 EUR je Paket / 4,86 m2 = 44,95 EUR/m2 - genau der Seitenpreis.
  const html = await rendern(produkt());
  assert.ok(!html.includes('"nativ"'), 'Paketware faellt noch in Shopifys nativen Zweig');
  const p = preise(html);
  assert.ok(p.length >= 1, 'kein Preis im Markup');
  assert.ok(p.every(x => x === 44.95), `erwartet 44.95, gefunden ${JSON.stringify(p)}`);
  assert.ok(!p.includes(218.46), 'der Paketpreis steht weiterhin im Markup');
});

test('Der Quadratmeterpreis steht auch als UnitPriceSpecification je 1 MTK', async () => {
  const html = await rendern(produkt());
  assert.match(html, /"UnitPriceSpecification"/);
  assert.match(html, /"unitCode":\s*"MTK"/);
});

test('Gerundet wird auf ganze Cent - wie snippets/price.liquid', async () => {
  // 5000 Cent / 3 m2 = 1666,67 Cent -> 16,67 EUR/m2
  const html = await rendern(produkt({ qm: 3, variants: [variante({ price: 5000 })] }));
  assert.deepEqual(preise(html), [16.67, 16.67]);
});

test('Paketware gewinnt gegen eine Rollenbreite an der Variante', async () => {
  // Sonst wuerde der Paketpreis unveraendert als m2-Preis durchgereicht.
  const html = await rendern(produkt({ variants: [variante({ rollenbreite: 4 })] }));
  assert.ok(preise(html).every(x => x === 44.95), 'Rollenzweig hat den Paketpreis durchgereicht');
});

test('Ohne qm_pro_paket bleibt alles wie bisher', async () => {
  const html = await rendern(produkt({ qm: null, variants: [variante({ rollenbreite: null })] }));
  assert.ok(html.includes('"nativ"'), 'nicht-Paketware muss Shopifys nativen Block behalten');
});
