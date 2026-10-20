import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Liquid } from 'liquidjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const templates = Object.fromEntries(['cart-summary', 'tax-info', 'tp-cart-versandhinweis', 'tp-muster-position', 'tp-cart-leisten-paket', 'tp-leisten-paket'].map(name => [name, read(`snippets/${name}.liquid`)]));
for (const name of ['tp-cart-unterlage-hinweis', 'tp-cart-beratung', 'tp-muster-beratungsanfrage', 'tp-zahlung-abholung', 'border-override', 'cart-bubble', 'cart-products']) templates[name] = '';
templates['cart-items-component'] = '{{ children }}';
templates['accordion-custom-component'] = '{{ children }}';

function renderer(language = 'de') {
  const engine = new Liquid({ templates });
  for (const tag of ['doc', 'stylesheet', 'schema', 'form']) engine.registerTag(tag, {
    parse(token, tokens) { while (tokens.length && tokens.shift().name !== `end${tag}`) {} },
    render() { return ''; },
  });
  const localeSource = read(`locales/${language === 'en' ? 'en.default' : language}.json`);
  const translations = JSON.parse(localeSource.slice(localeSource.indexOf('{')).replace(/^\s*\/\/.*$/gm, ''));
  engine.registerFilter('t', (key, ...args) => {
    const value = key.split('.').reduce((obj, part) => obj?.[part], translations);
    assert.equal(typeof value, 'string', `Fehlende Uebersetzung: ${key}`);
    return args.reduce((text, [name, replacement]) => text.replaceAll(`{{ ${name} }}`, replacement), value);
  });
  engine.registerFilter('money', cents => `${(cents / 100).toFixed(2).replace('.', ',')} €`);
  return engine;
}

const item = (sample = false) => ({ sku: sample ? 'M-123' : 'TEST-123', properties: {}, variant: { metafields: { custom: {} } }, product: { type: 'Teppich', metafields: { custom: {} } } });
const source = view => read(view === 'drawer' ? 'snippets/header-actions.liquid' : 'blocks/_cart-summary.liquid');
const context = (total = 29440, items = [item()], extra = {}) => ({
  cart: { items, item_count: items.length, total_price: total, taxes_included: true, duties_included: false, cart_level_discount_applications: [], ...extra.cart },
  settings: { tp_versand_frei_ab: 50, show_add_discount_code: true, cart_type: 'drawer', ...extra.settings },
  shop: { shipping_policy: { body: 'Versandbedingungen', url: '/policies/shipping-policy' }, ...extra.shop },
  pages: extra.pages ?? {}, section: { id: 'test-cart', settings: {} }, block: { settings: {} }, template: { name: 'product' },
});
const render = (view, data, language) => renderer(language).parseAndRender(source(view), data, { globals: data });
const notice = html => html.match(/<div class="cart-totals__item cart-totals__tax-note[^>]*>([\s\S]*?)<\/div>/)?.[1].replace(/\s+/g, ' ').trim();

for (const view of ['cart', 'drawer']) {
  test(`${view}: Versandfreiheit und Summe widersprechen sich nicht; Link und Kaufknopf bleiben`, async () => {
    const html = await render(view, context());
    assert.match(html, /Versandkostenfrei in Deutschland\./);
    assert.match(notice(html), /Inkl\. MwSt\.\s+Details zu <a href="\/pages\/versand-lieferung">Versand und Lieferung<\/a>\./);
    assert.doesNotMatch(notice(html), /Versand.*Checkout|Rabatte|Zölle/);
    assert.match(html, /name="checkout"/);
    assert.match(html, /294,40 €/);
  });

  test(`${view}: Schwelle nach Rabatt, Muster und gemischter Warenkorb behalten ihren Versandhinweis`, async () => {
    for (const [total, items, settings, expected] of [
      [4999, [item()], {}, /ab 50 € Bestellwert/],
      [5000, [item()], {}, /Versandkostenfrei in Deutschland\./],
      [6000, [item()], { tp_versand_frei_ab: 75 }, /ab 75 € Bestellwert/],
      [0, [item(true)], {}, /Kostenloser Musterversand innerhalb Deutschlands\./],
      [4000, [item(true), item()], {}, /ab 50 € Bestellwert/],
    ]) {
      const html = await render(view, context(total, items, { settings, cart: { original_total_price: 10000 } }));
      assert.match(html, expected);
      assert.doesNotMatch(notice(html), /Versand.*Checkout/);
    }
  });

  test(`${view}: alle Steuer-, Zoll-, Rabatt- und Policy-Zustaende bleiben erklaert`, async () => {
    for (const taxes of [true, false]) for (const duties of [true, false]) for (const discounts of [true, false]) for (const policy of ['', 'Versandbedingungen']) {
      const html = await render(view, context(29440, [item()], {
        cart: { taxes_included: taxes, duties_included: duties },
        settings: { show_add_discount_code: discounts },
        shop: { shipping_policy: { body: policy, url: '/policies/shipping-policy' } },
      }));
      const text = notice(html);
      assert.ok(text);
      assert.equal(text.includes('Inkl. MwSt.'), taxes);
      assert.equal(text.includes('Steuern werden beim Checkout berechnet.'), !taxes);
      assert.equal(text.includes('Zölle enthalten.'), duties);
      assert.equal(text.includes('Rabatte werden beim Checkout berechnet.'), !discounts);
      assert.match(text, /href="\/pages\/versand-lieferung"/);
      assert.doesNotMatch(text, /Versand.*Checkout|translation missing/);
    }
  });

  test(`${view}: Sprach-Fallback und lokalisierte Versandseite ohne Auslandszusage`, async () => {
    const data = context(29440, [item()], { pages: { 'versand-lieferung': { url: '/en/pages/versand-lieferung' } } });
    data.localization = { country: { iso_code: 'AT' } };
    const html = await render(view, data, 'en');
    assert.match(notice(html), /Taxes included\.\s+Details on <a href="\/en\/pages\/versand-lieferung">shipping and delivery<\/a>\./);
    assert.match(html, /Versandkostenfrei in Deutschland\./);
    assert.doesNotMatch(html, /Versandkostenfrei in Österreich|free shipping in Austria/);
  });
}

test('Andere Nutzer von tax-info behalten den bestehenden Checkout-Hinweis', async () => {
  const engine = renderer();
  const html = await engine.parseAndRender(templates['tax-info'], { ...context(), has_discounts_enabled: true });
  assert.match(html, /Inkl\. MwSt\. Versand wird beim Checkout berechnet\./);
  assert.doesNotMatch(html, /Details zu/);
});

test('Alle mitgelieferten Sprachen rendern die neuen Angaben mit funktionierendem Link', async () => {
  for (const file of fs.readdirSync(path.join(root, 'locales')).filter(name => name.endsWith('.json') && !name.endsWith('.schema.json'))) {
    const engine = renderer(file.replace('.json', ''));
    const data = { ...context(29440, [item()], { cart: { taxes_included: false, duties_included: true } }), has_discounts_enabled: false, cart_shipping_details: true };
    const html = await engine.parseAndRender(templates['tax-info'], data);
    assert.match(html, /href="\/pages\/versand-lieferung"/, file);
    assert.doesNotMatch(html, /translation missing|\{\{|cart_tax_notice/, file);
  }
});
