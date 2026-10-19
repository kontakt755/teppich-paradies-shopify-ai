import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Checkout-Texte, die Shopify falsch uebersetzt, ueberschreibt das Theme in
// locales/de.json unter "shopify.*". Eine Aenderung im Admin-Spracheditor landet
// nur im Live-Theme und wuerde beim naechsten Deploy ueberschrieben - deshalb
// stehen die Werte hier im Repository.

const root = path.resolve(import.meta.dirname, '../..');
const de = JSON.parse(fs.readFileSync(path.join(root, 'locales/de.json'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));

test('Checkout-Fusszeile: Cookie-Link heisst "Cookie-Einstellungen", nicht "Plaetzchen" (w-083)', () => {
  assert.equal(de.shopify?.checkout?.shop_policies?.cookie_preferences, 'Cookie-Einstellungen');
});

test('Bestehende Checkout-Ueberschreibungen bleiben erhalten', () => {
  assert.equal(de.shopify.checkout.order_summary.number_items.one, 'Warenkorb');
  assert.equal(de.shopify.checkout.order_summary.subtotal_label_with_quantity.other, 'Zwischensumme');
});
