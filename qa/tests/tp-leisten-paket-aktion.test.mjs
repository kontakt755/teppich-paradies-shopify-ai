// F01 / w-286 (Inhaber 06.11.2026): Black Week (-15 %) und "Vinyl komplett: Sockelleiste
// inklusive" sind in Shopify nicht kombinierbar. Solange fuer ein Vinyl eine zentrale Aktion
// (Metaobjekt tp_aktion) laeuft, verspricht weder Karte noch Produktseite noch Warenkorb
// Gratis-Leisten. Endet die Aktion, erscheint der Hinweis von selbst wieder.
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = path.resolve(import.meta.dirname, '../..');
const quelle = (name) => readFileSync(path.join(root, name), 'utf8')
  .replace(/{%-?\s*(doc|stylesheet|schema)\s*-?%}[\s\S]*?{%-?\s*end\1\s*-?%}/g, '');

const engine = new Liquid({ timezoneOffset: 0, templates: {
  'tp-leisten-paket': quelle('snippets/tp-leisten-paket.liquid'),
  'tp-aktion-laufend': quelle('snippets/tp-aktion-laufend.liquid'),
  'tp-rollenrest': '',
} });
engine.registerFilter('divided_by', (a, b) => Math.floor(Number(a) / Number(b)));

const hinweis = quelle('blocks/tp-leisten-paket-hinweis.liquid');
const karte = quelle('blocks/tp-card-aktion.liquid');
const korb = quelle('snippets/tp-cart-leisten-paket.liquid');

const BW = 9;
const SONST = 10;
// Wie die echte Black Week: Kollektion black-week-2026, 15 %, bis 30.11.
const shop = { metaobjects: { tp_aktion: { values: [{
  aktiv: { value: true }, start: { value: '2026-11-06' }, ende: { value: '2026-11-30' },
  kollektion: { value: { id: BW } }, prozent: { value: 15 },
}] } } };
const vinyl = (kollektion, type = 'Klickvinyl') => ({ type, tags: [], collections: [{ id: kollektion }] });
const block = { id: 'lph', settings: { aktiv: true } };
const gemeinsam = {
  block,
  collections: { bodenleisten: { url: '/collections/bodenleisten' } },
  all_products: { 'belmora-sockelleiste-eckig-12x58mm': { available: true, selected_or_first_available_variant: { id: 77 } } },
  routes: { cart_add_url: '/cart/add', cart_url: '/cart' },
};
// shop ist in Shopify global; LiquidJS reicht nur globals in {% render %} weiter.
const rendern = (vorlage, daten) => engine.parseAndRender(vorlage, { ...gemeinsam, ...daten }, { globals: { shop } });

beforeEach((t) => t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-06T12:00:00Z') }));

test('Schalter: Aktionsvinyl ohne Paketvorteil, Vinyl ausserhalb der Aktion mit', async () => {
  const gilt = (product) => rendern("{% render 'tp-leisten-paket', product: product %}", { product });
  assert.equal((await gilt(vinyl(BW))).trim(), '');
  assert.equal((await gilt(vinyl(BW, 'Klebevinyl'))).trim(), '');
  assert.equal((await gilt(vinyl(SONST))).trim(), 'ja');
  assert.equal((await gilt(vinyl(SONST, 'Klebevinyl'))).trim(), 'ja');
  assert.equal((await gilt(vinyl(SONST, 'Teppichboden'))).trim(), '', 'andere Produktarten bleiben aussen vor');
});

test('Produktseite: kein Leisten-Hinweis bei Aktionsvinyl, Hinweis bleibt ausserhalb', async () => {
  assert.doesNotMatch(await rendern(hinweis, { product: vinyl(BW) }), /Sockelleiste inklusive|gratis/i);
  assert.match(await rendern(hinweis, { product: vinyl(SONST) }), /Sockelleiste inklusive/);
});

test('Produktkarte: Aktionsvinyl zeigt nur die Aktion, kein "Sockelleiste inklusive"', async () => {
  const mit = await rendern(karte, { closest: { product: vinyl(BW) } });
  assert.match(mit, /−15 %/);
  assert.doesNotMatch(mit, /Sockelleiste inklusive/);
  const ohne = await rendern(karte, { closest: { product: vinyl(SONST) } });
  assert.match(ohne, /Sockelleiste inklusive/);
  assert.doesNotMatch(ohne, /−15 %/);
});

test('Warenkorb: kein Gratis-Leisten-Versprechen, sobald ein Aktionsprodukt drin liegt', async () => {
  const text = (items) => rendern(korb, { cart: { items } });
  const zeile = (product, quantity) => ({ product, quantity });
  const leiste = zeile({ type: 'Sockelleisten', tags: [], collections: [] }, 5);

  assert.match(await text([zeile(vinyl(SONST), 5)]), /gehören 5 Sockelleisten[\s\S]*weiße Leisten gratis dazulegen/);
  assert.doesNotMatch(await text([zeile(vinyl(BW), 5)]), /gratis/i, 'Black-Week-Vinyl allein');
  assert.doesNotMatch(await text([zeile(vinyl(BW), 5), leiste]), /gratis/i, 'Black-Week-Vinyl mit Leisten');
  assert.doesNotMatch(await text([leiste, zeile(vinyl(BW), 5)]), /gratis/i, 'Leisten zuerst');
  assert.doesNotMatch(await text([zeile(vinyl(SONST), 5), zeile(vinyl(BW, 'Teppichboden'), 1)]), /gratis/i,
    'Shopify nimmt fuer den ganzen Korb nur einen der beiden Rabatte');
  assert.doesNotMatch(await text([zeile(vinyl(SONST), 3), zeile(vinyl(BW), 5)]), /gratis/i,
    'Aktionsvinyl zaehlt nicht zur Fuenferstaffel');
});

test('Nach dem letzten Aktionstag (01.12.) erscheint alles von selbst wieder', async (t) => {
  t.mock.timers.setTime(Date.parse('2026-11-30T23:59:00Z'));
  assert.doesNotMatch(await rendern(hinweis, { product: vinyl(BW) }), /Sockelleiste inklusive/, '30.11. zaehlt noch zur Aktion');
  t.mock.timers.setTime(Date.parse('2026-12-01T00:00:00Z'));
  assert.match(await rendern(hinweis, { product: vinyl(BW) }), /Sockelleiste inklusive/);
  assert.match(await rendern(karte, { closest: { product: vinyl(BW) } }), /Sockelleiste inklusive/);
  assert.match(await rendern(korb, { cart: { items: [{ product: vinyl(BW), quantity: 5 }] } }), /weiße Leisten gratis dazulegen/);
});

test('Karte, Produktseite und Warenkorb fragen denselben Schalter', () => {
  for (const datei of ['blocks/tp-card-aktion.liquid', 'blocks/tp-leisten-paket-hinweis.liquid', 'snippets/tp-cart-leisten-paket.liquid']) {
    assert.match(readFileSync(path.join(root, datei), 'utf8'), /render 'tp-leisten-paket'/, datei);
  }
  assert.match(readFileSync(path.join(root, 'snippets/tp-leisten-paket.liquid'), 'utf8'), /render 'tp-aktion-laufend'/);
});
