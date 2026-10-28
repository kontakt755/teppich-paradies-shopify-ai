import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = name => readFileSync(path.join(root, name), 'utf8');
const liquidSource = name => read(name)
  .replace(/{%-?\s*(doc|stylesheet|schema)\s*-?%}[\s\S]*?{%-?\s*end\1\s*-?%}/g, '');
const engine = new Liquid({ templates: {
  'tp-leisten-paket': liquidSource('snippets/tp-leisten-paket.liquid'),
  'tp-musteroption': liquidSource('snippets/tp-musteroption.liquid'),
  'tp-muster-grenze': '',
  'tp-muster-hinweis': '',
  'tp-zahlung-abholung': '',
} });
engine.registerFilter('divided_by', (a, b) => Math.floor(Number(a) / Number(b)));
const leisten = liquidSource('blocks/tp-leisten-paket-hinweis.liquid');
const cart = liquidSource('snippets/tp-cart-leisten-paket.liquid');
const muster = liquidSource('blocks/tp-muster-cta.liquid');

const block = { id: 'audit', settings: { aktiv: true, label: 'Kostenloses Muster anfragen' } };
const product = { id: 123, handle: 'mass-test', type: 'Teppich nach Maß', tags: [], template_suffix: 'einfassung',
  options_with_values: [{ name: 'Farbe' }], selected_or_first_available_variant: { options: ['Mausgrau 830'] } };
const musterHtml = overrides => engine.parseAndRender(muster, { product: { ...product, ...overrides }, block });
const musterLink = html => new URL(html.match(/<a class="tp-muster-cta__link-[^"]+" href="([^"]+)"/)[1], 'https://shop.example');

test('Produkttext beschreibt dieselbe Fuenferstaffel wie der Warenkorb, ohne alte Flaechenschwelle', async () => {
  const html = await engine.parseAndRender(leisten, {
    product: { type: 'Klickvinyl' }, block, collections: { bodenleisten: { url: '/collections/bodenleisten' } },
  });
  assert.match(html, /Für je 5 Pakete Klick- oder Klebevinyl erhalten Sie 5 Sockelleisten/);
  assert.match(html, /je 11,90&nbsp;€ Nachlass/);
  // Inhaber 2026-10-09: bei Sockelleisten "Leisten", nie "Stangen" (Rundgang 2026-10-26, #63).
  assert.match(html, /Höchstens 100 rabattierte Leisten/);
  assert.doesNotMatch(html, /Stangen/);
  assert.doesNotMatch(html, /Ab 10|je Paket eine|Höchstens 60|50\s*%/);
  for (const [quantity, expected] of [[4, 0], [5, 5], [6, 5], [9, 5], [10, 10], [105, 100], [200, 100]]) {
    const cartHtml = await engine.parseAndRender(cart, {
      cart: { items: [{ quantity, product: { type: 'Klickvinyl' } }] },
      all_products: { 'belmora-sockelleiste-eckig-12x58mm': { available: true, url: '/products/weiss' } },
      collections: { bodenleisten: { url: '/collections/bodenleisten' } },
    });
    if (expected) assert.match(cartHtml, new RegExp('gehören ' + expected + ' Sockelleisten'), String(quantity));
    else assert.doesNotMatch(cartHtml, /Sockelleiste inklusive/);
  }
});

test('Leistenhinweis bleibt auf die bestehenden berechtigten Produktarten begrenzt', async () => {
  for (const type of ['Klickvinyl', 'Klebevinyl', 'Teppichboden', 'Laminat']) {
    const html = await engine.parseAndRender(leisten, { product: { type }, block });
    assert.equal(html.includes('Sockelleiste inklusive'), ['Klickvinyl', 'Klebevinyl'].includes(type), type);
  }
});

test('Mass-Musterlink nimmt die gewaehlte Farbe exakt und URL-kodiert mit', async () => {
  const html = await musterHtml({ selected_or_first_available_variant: { options: ['Grau & Sand (083)'] } });
  const url = musterLink(html);
  assert.equal(url.pathname, '/pages/muster');
  assert.equal(url.searchParams.get('produkt'), 'mass-test');
  assert.equal(url.searchParams.get('farbe'), 'Grau & Sand (083)');
  assert.match(html, /data-tp-ek-muster="123" data-tp-ek-muster-farbindex="0"/);
});

test('Farbe, Dekor und Color werden auch hinter einer technischen Option richtig zugeordnet', async () => {
  for (const name of ['Farbe', 'Dekor', 'Color']) {
    const html = await musterHtml({ options_with_values: [{ name: 'Breite' }, { name }],
      selected_or_first_available_variant: { options: ['400 cm', 'Graphit 098'] } });
    assert.equal(musterLink(html).searchParams.get('farbe'), 'Graphit 098', name);
    assert.match(html, /data-tp-ek-muster-farbindex="1"/);
  }
});

test('Ohne Farboption wird keine technische Groesse als Musterfarbe uebergeben', async () => {
  const html = await musterHtml({ options_with_values: [{ name: 'Breite' }],
    selected_or_first_available_variant: { options: ['400 cm'] } });
  assert.equal(musterLink(html).searchParams.has('farbe'), false);
  assert.doesNotMatch(html, /data-tp-ek-muster=/);
});

test('Bestehende andere Muster- und Anfragewege bleiben unveraendert oder gesperrt', async () => {
  const normal = await musterHtml({ template_suffix: '', type: 'Klickvinyl' });
  assert.equal(musterLink(normal).searchParams.has('farbe'), false);
  for (const type of ['Parkett', 'Laminat', 'Kork']) {
    const html = await musterHtml({ type });
    assert.equal(musterLink(html).pathname, '/pages/kontakt', type);
    assert.equal(musterLink(html).searchParams.get('thema'), 'musteranfrage', type);
    assert.equal(musterLink(html).searchParams.has('farbe'), false, type);
    assert.doesNotMatch(html, /data-tp-ek-muster=/);
  }
  assert.doesNotMatch(await musterHtml({ tags: ['ohne-muster'] }), /<a /);
  assert.doesNotMatch(await musterHtml({ gift_card: true, 'gift_card?': true }), /<a /);
});

const js = read('assets/tp-einfass-konfigurator.js');
const helperStart = js.indexOf('  function musterFarbeAktualisieren(');
const helperEnd = js.indexOf('  function svgEl(', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart);
function link(id, index = 0) {
  return { href: '/pages/muster?produkt=mass-test&farbe=Alt#auswahl',
    getAttribute: name => ({ 'data-tp-ek-muster': String(id), 'data-tp-ek-muster-farbindex': String(index) })[name] ?? null };
}
function updater(links) {
  return vm.runInNewContext('(' + js.slice(helperStart, helperEnd).trim() + ')', {
    URL, window: { location: { href: 'https://shop.example/products/mass-test' } },
    document: { querySelectorAll: () => links },
  });
}

test('Aktueller Farbwechsel ersetzt die vorige Auswahl, fremde Produktlinks bleiben erhalten', () => {
  const own = link(123, 1), foreign = link(456);
  const update = updater([own, foreign]);
  update(123, { optionen: ['200 cm', 'Mausgrau 830'] });
  assert.equal(new URL(own.href, 'https://shop.example').searchParams.get('farbe'), 'Mausgrau 830');
  update(123, { optionen: ['200 cm', 'Grau & Sand (083)'] });
  const url = new URL(own.href, 'https://shop.example');
  assert.equal(url.searchParams.get('farbe'), 'Grau & Sand (083)');
  assert.equal(url.searchParams.getAll('farbe').length, 1);
  assert.equal(url.searchParams.get('produkt'), 'mass-test');
  assert.equal(url.hash, '#auswahl');
  assert.equal(foreign.href, '/pages/muster?produkt=mass-test&farbe=Alt#auswahl');
});

test('Ungueltige oder technische Variante hinterlaesst keine veraltete Musterfarbe', () => {
  for (const variant of [null, { optionen: ['Default Title'] }, { optionen: ['opc-123'] }, { optionen: [] }]) {
    const own = link(123);
    updater([own])(123, variant);
    const url = new URL(own.href, 'https://shop.example');
    assert.equal(url.searchParams.has('farbe'), false);
    assert.equal(url.searchParams.get('produkt'), 'mass-test');
  }
});

test('Musterlink wird im bestehenden Rechen-/Farbwechselpfad vor dessen fruehen Abbruechen aktualisiert', () => {
  assert.match(js, /function rechnen\(\) \{\s*target = aktuelleVariante\(\);\s*musterFarbeAktualisieren\(d\.produkt_id, target\);/);
});
