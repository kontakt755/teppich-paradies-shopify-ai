// Custom Pixel "TP Funnel und Musterbestellung" (domains/marketing/tp-funnel-pixel.js):
// Ads-Conversion "Kauf Ware" nur, wenn mindestens ein Artikel kein Muster ist
// (Inhaber 26.11.2026). Muster mit 4,99 EUR Versand (ab 01.12.) zaehlen nicht.
// Kein eigenes GA4-purchase (kommt von der Google-&-YouTube-App).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const quelle = readFileSync(new URL('../../domains/marketing/tp-funnel-pixel.js', import.meta.url), 'utf8');

function lauf(checkout, label = 'TESTLABEL') {
  const code = quelle.replace(/const ADS_KAUF_WARE_LABEL = '[^']*'/, `const ADS_KAUF_WARE_LABEL = '${label}'`);
  const handler = {};
  const el = { parentNode: { insertBefore() {} } };
  const ctx = {
    document: { createElement: () => ({}), head: { appendChild() {} }, getElementsByTagName: () => [el] },
    init: { customerPrivacy: { marketingAllowed: true, analyticsProcessingAllowed: true }, context: { document: { location: { href: 'https://x/' } } } },
    analytics: { subscribe: (name, fn) => { handler[name] = fn; } },
  };
  ctx.window = ctx;
  vm.runInNewContext(code, ctx);
  handler.checkout_completed({ data: { checkout }, context: { document: { location: { href: 'https://x/thank-you' } } } });
  return Array.from(ctx.dataLayer, (a) => Array.from(a));
}

const zeile = (typ, sku) => ({ title: 't', quantity: 1, variant: { sku, product: { type: typ } } });
const bestellung = (items, betrag) => ({ lineItems: items, totalPrice: { amount: betrag }, currencyCode: 'EUR', order: { id: '7001' } });
const kaeufe = (dl) => dl.filter((a) => a[0] === 'event' && a[1] === 'conversion');

test('Warenkauf: eine Conversion mit Bruttobetrag und transaction_id', () => {
  const k = kaeufe(lauf(bestellung([zeile('Teppichboden', 'TEPDERB4_039')], 1980.8)));
  assert.equal(k.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(k[0][2])), { send_to: 'AW-10991759596/TESTLABEL', value: 1980.8, currency: 'EUR', transaction_id: '7001' });
});

test('Ware ohne SKU (Teppich nach Mass) zaehlt', () => {
  assert.equal(kaeufe(lauf(bestellung([zeile('Teppich nach Maß', null), zeile('Service', null)], 772))).length, 1);
});

test('Musterbestellung mit 4,99 EUR Versand: keine Conversion', () => {
  assert.equal(kaeufe(lauf(bestellung([zeile('Musterservice', 'M-JAB-3769-264'), zeile('Musterservice', 'M-TEPLARA04_173')], 4.99))).length, 0);
});

test('Gratismuster und Sammelmuster: keine Conversion', () => {
  assert.equal(kaeufe(lauf(bestellung([zeile('Musterservice', 'TP-MUSTER-000')], 0))).length, 0);
});

test('Mischkorb Muster + Ware: Conversion mit Gesamtbetrag', () => {
  const k = kaeufe(lauf(bestellung([zeile('Musterservice', 'M-X'), zeile('Bauchemie', 'ZUBSARHAVS_43')], 28.88)));
  assert.equal(k.length, 1);
  assert.equal(k[0][2].value, 28.88);
});

test('ohne Label nichts an Ads, nie ein eigenes GA4-purchase', () => {
  const dl = lauf(bestellung([zeile('Teppichboden', 'A')], 100), '');
  assert.equal(kaeufe(dl).length, 0);
  assert.ok(!dl.some((a) => a[0] === 'config' && a[1] === 'AW-10991759596'));
  assert.ok(!lauf(bestellung([zeile('Teppichboden', 'A')], 100)).some((a) => a[1] === 'purchase'));
});
