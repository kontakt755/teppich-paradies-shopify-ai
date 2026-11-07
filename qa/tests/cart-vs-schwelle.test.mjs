// Schwelle "kostenlose Lieferung & lose Verlegung" im Warenkorb (Rundgang
// 2026-11-06, WK-02): Aktionsware zaehlt nicht mit (Inhaber 2026-09-20,
// snippets/tp-aktion-aktiv.liquid). Gerechnet wird nur mit den berechtigten
// Zeilen ohne laufende Aktion, nie mit cart.total_price.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Liquid } from 'liquidjs';

const root = path.resolve(import.meta.dirname, '../..');
const lies = name => fs.readFileSync(path.join(root, name), 'utf8');

const templates = {
  'cart-summary': lies('snippets/cart-summary.liquid'),
  'tp-vs-berechtigt': lies('snippets/tp-vs-berechtigt.liquid'),
  'tp-aktion-aktiv': lies('snippets/tp-aktion-aktiv.liquid'),
};
for (const name of ['tp-cart-unterlage-hinweis', 'tp-cart-leisten-paket', 'tp-cart-versandhinweis', 'tp-cart-beratung', 'tp-muster-beratungsanfrage', 'accordion-custom-component', 'tax-info']) templates[name] = '';

function engine() {
  const e = new Liquid({ templates });
  for (const tag of ['doc', 'stylesheet', 'form']) e.registerTag(tag, {
    parse(token, tokens) { while (tokens.length && tokens.shift().name !== `end${tag}`) {} },
    render() { return ''; },
  });
  e.registerFilter('t', key => key);
  e.registerFilter('money', cents => `${(cents / 100).toFixed(2).replace('.', ',')} €`);
  e.registerFilter('inline_asset_content', () => '');
  return e;
}

const datum = tage => new Date(Date.now() + tage * 86400000).toISOString().slice(0, 10);
const zeile = (cent, { aktion = false, template_suffix = 'rolle', type = 'Teppichboden' } = {}) => ({
  final_line_price: cent,
  properties: {},
  variant: { metafields: { custom: {} } },
  product: {
    template_suffix, type,
    metafields: { custom: {}, aktion: aktion ? { start: { value: datum(-3) }, ende: { value: datum(20) } } : {} },
  },
});

async function vsZeile(items) {
  const total = items.reduce((s, i) => s + i.final_line_price, 0);
  const daten = {
    cart: { items, item_count: items.length, total_price: total, cart_level_discount_applications: [] },
    settings: { tp_vs_schwelle: 649, tp_vs_radius_basis: 15, tp_vs_produkttypen: 'Teppichboden' },
  };
  const html = await engine().parseAndRender(`{% render 'cart-summary', teil: 'hinweise' %}`, daten, { globals: daten });
  return html.match(/<p class="tp-cart-shipping-note tp-cart-vs-note">([\s\S]*?)<\/p>/)?.[1].replace(/\s+/g, ' ').trim();
}

test('Restrolle 524,25 € plus Aktionsware 700,98 €: weiter "Noch 124,75 €"', async () => {
  const text = await vsZeile([zeile(52425), zeile(70098, { aktion: true })]);
  assert.ok(text, 'Zeile erscheint');
  assert.match(text, /Noch 124,75 € bis zur kostenlosen Lieferung/);
  assert.doesNotMatch(text, /bis 15&nbsp;km kostenlos<\/strong>/);
});

test('Restrolle allein: "Noch 124,75 €"', async () => {
  assert.match(await vsZeile([zeile(52425)]), /Noch 124,75 €/);
});

test('berechtigte Ware ueber 649 €: kostenlos', async () => {
  assert.match(await vsZeile([zeile(52425), zeile(20000)]), /Lieferung &amp; lose Verlegung bis 15&nbsp;km kostenlos/);
  assert.match(await vsZeile([zeile(64900)]), /kostenlos<\/strong>/);
});

test('Zubehoer und Vinyl zaehlen nicht mit', async () => {
  const text = await vsZeile([zeile(52425), zeile(30000, { template_suffix: 'planken', type: 'Klickvinyl' }), zeile(30000, { type: 'Zubehoer' })]);
  assert.match(text, /Noch 124,75 €/);
});

test('nur Aktionsware oder nur Zubehoer: keine Zeile', async () => {
  assert.equal(await vsZeile([zeile(70098, { aktion: true })]), undefined);
  assert.equal(await vsZeile([zeile(90000, { template_suffix: 'planken', type: 'Klickvinyl' })]), undefined);
});
