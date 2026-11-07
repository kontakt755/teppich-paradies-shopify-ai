// Gesamtbetrag und "Zur Kasse" bleiben im Schubfach und auf der Warenkorbseite
// im Bild (Pruefung 2026-11-05: Knopf am Handy bei y=903 bis 1189 von 844 px).
// Die Trennung haelt snippets/cart-summary.liquid ueber den Parameter teil.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Liquid } from 'liquidjs';

const root = path.resolve(import.meta.dirname, '../..');
const lies = name => fs.readFileSync(path.join(root, name), 'utf8');

const leer = ['tp-cart-checkout-menge', 'tp-cart-beratung', 'tp-muster-beratungsanfrage', 'tp-cart-leisten-paket', 'tp-cart-unterlage-hinweis', 'tax-info', 'accordion-custom-component'];
const templates = { 'cart-summary': lies('snippets/cart-summary.liquid') };
for (const name of leer) templates[name] = `[${name}]`;
templates['tp-cart-versandhinweis'] = '[versandhinweis]';
templates['tp-zahlung-abholung'] = '[zahlung-abholung]';

function engine() {
  const e = new Liquid({ templates });
  for (const tag of ['doc', 'stylesheet', 'form']) e.registerTag(tag, {
    parse(token, tokens) { while (tokens.length && tokens.shift().name !== `end${tag}`) {} },
    render() { return ''; },
  });
  e.registerFilter('t', key => key);
  e.registerFilter('money', cents => `${cents} ct`);
  e.registerFilter('inline_asset_content', () => '');
  return e;
}

const daten = {
  cart: { items: [], item_count: 1, total_price: 1000, cart_level_discount_applications: [] },
  settings: { show_add_discount_code: true, show_accelerated_checkout_buttons: true, show_installments: true },
  additional_checkout_buttons: true,
  content_for_additional_checkout_buttons: '[schnellkauf-knoepfe]',
};
const teil = name => engine().parseAndRender(`{% render 'cart-summary', teil: '${name}' %}`, daten, { globals: daten });

test('kasse: nur Summe, Preishinweis, Mengensatz und Kaufknopf', async () => {
  const html = await teil('kasse');
  assert.match(html, /name="checkout"/);
  const satz = html.indexOf('[tp-cart-checkout-menge]');
  assert.ok(satz >= 0 && satz < html.indexOf('cart-totals__total-value'), 'Mengensatz steht ueber dem Gesamtbetrag');
  assert.match(html, /cart-totals__total-value/);
  assert.match(html, /\[tax-info\]/);
  for (const fremd of ['versandhinweis', 'zahlung-abholung', 'schnellkauf-knoepfe', 'cart-actions']) {
    assert.ok(!html.includes(fremd), `${fremd} gehoert nicht in die feste Leiste`);
  }
});

test('hinweise: Rabatt, Versand und Musterberatung, aber kein Kaufknopf', async () => {
  const html = await teil('hinweise');
  assert.ok(!html.includes('name="checkout"'));
  assert.ok(!html.includes('cart-totals__total-value'));
  for (const hinweis of ['cart-actions', '[versandhinweis]', '[tp-cart-unterlage-hinweis]', '[tp-cart-leisten-paket]', '[tp-muster-beratungsanfrage]']) {
    assert.ok(html.includes(hinweis), `${hinweis} fehlt`);
  }
});

test('schnellkauf und zahlung geben nur sich selbst aus', async () => {
  const schnell = await teil('schnellkauf');
  assert.match(schnell, /\[schnellkauf-knoepfe\]/);
  assert.ok(!schnell.includes('name="checkout"'));
  const zahlung = await teil('zahlung');
  assert.match(zahlung, /\[zahlung-abholung\]/);
  assert.ok(!zahlung.includes('name="checkout"'));
});

test('jeder Teil steht genau einmal in Schubfach und Warenkorbseite', () => {
  for (const datei of ['snippets/header-actions.liquid', 'blocks/_cart-summary.liquid']) {
    const quelle = lies(datei);
    for (const name of ['hinweise', 'kasse', 'schnellkauf', 'zahlung']) {
      const treffer = quelle.match(new RegExp(`render 'cart-summary'[^%]*teil: '${name}'`, 'g')) ?? [];
      assert.equal(treffer.length, 1, `${datei}: Teil ${name}`);
    }
    assert.ok(!/render 'cart-summary'(?![^%]*teil:)/.test(quelle), `${datei}: Aufruf ohne teil gibt nichts aus`);
  }
});

test('Schubfach: Hinweise scrollen mit den Artikeln, Kasse steht in der festen Leiste', () => {
  const quelle = lies('snippets/header-actions.liquid');
  const scroller = quelle.slice(quelle.indexOf('class="cart-drawer__items"\n                >'), quelle.indexOf('class="cart-drawer__summary"'));
  assert.ok(scroller.includes("teil: 'hinweise'"));
  assert.ok(scroller.includes("teil: 'zahlung'"));
  assert.ok(!scroller.includes("teil: 'kasse'"));
  const leiste = quelle.slice(quelle.indexOf('class="cart-drawer__summary"'));
  assert.ok(leiste.includes("teil: 'kasse'"));
});

test('Warenkorbseite: Kasse haftet, untereinanderstehende Schnellkauf-Knoepfe nicht', () => {
  const quelle = lies('blocks/_cart-summary.liquid');
  const kasse = quelle.slice(quelle.indexOf('<div class="tp-cart-kasse">'), quelle.indexOf('<div class="tp-cart-schnellkauf">'));
  assert.ok(kasse.includes("teil: 'kasse'"));
  assert.ok(!kasse.includes("teil: 'schnellkauf'"));
  assert.match(quelle, /\.tp-cart-kasse \{\s*position: sticky;/);
});

test('Leerer Warenkorb schaltet das Festhalten nicht ab', () => {
  // Beim ersten Hinzufuegen oeffnet das Schubfach, bevor der Warenkorb da ist;
  // morph.js behaelt das Attribut, "aus" bliebe also bis zum naechsten Oeffnen.
  const js = lies('assets/cart-drawer.js');
  const zweig = js.slice(js.indexOf('if (!content || !summary)'), js.indexOf('const drawerHeight'));
  assert.match(zweig, /'cart-summary-sticky', 'true'/);
  assert.ok(!zweig.includes("'false'"));
});
