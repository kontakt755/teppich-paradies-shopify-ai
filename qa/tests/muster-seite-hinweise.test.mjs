// Musterseite: Groesse und Versand unter der Ueberschrift, bei JAB und Vorwerk
// der Hinweis, dass der Hersteller selbst verschickt (Rundgang 26.10.2026,
// Inhaber 15.10.2026). Eine Ankunftszeit steht dort bewusst noch nicht.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

function ladeCore() {
  const window = {};
  vm.runInNewContext(read('assets/tp-sample-checkout-core.js'), { window });
  return window.TPSampleCheckoutCore;
}

test('Herstellermuster: nur JAB Anstoetz und Vorwerk, egal wie geschrieben', () => {
  const core = ladeCore();
  for (const vendor of ['Vorwerk', 'JAB Anstoetz', ' jab anstoetz ']) {
    assert.equal(core.isHerstellerMuster({ vendor }), true, vendor);
  }
  for (const vendor of ['TeppichParadies', 'JAB', 'Vorwerk Kobold', '', undefined]) {
    assert.equal(core.isHerstellerMuster({ vendor }), false, String(vendor));
  }
  assert.equal(core.isHerstellerMuster(null), false);
});

test('Musterseite nennt Groesse und Versand, ohne Ankunftszeit', () => {
  const section = read('sections/tp-sample-checkout.liquid');
  const info = /<p class="tp-sample__info" data-sample-info>([^<]+)<\/p>/.exec(section);
  assert.ok(info, 'Zeile unter der Ueberschrift');
  assert.equal(info[1], 'Muster ca. A5 · kostenloser Versand');
  const hersteller = /<p class="tp-sample__info" data-sample-hersteller hidden>([^<]+)<\/p>/.exec(section);
  assert.ok(hersteller, 'Herstellerzeile, anfangs versteckt');
  assert.match(hersteller[1], /direkt vom Hersteller/);
  assert.doesNotMatch(info[1] + hersteller[1], /Werktag|Tage/, 'keine Lieferzeit ohne Festlegung des Inhabers');
  // Reihenfolge: direkt unter der Ueberschrift
  assert.ok(section.indexOf('data-sample-info') > section.indexOf('</h1>'));
  assert.ok(section.indexOf('data-sample-info') < section.indexOf('data-sample-intro'));
});

test('Konfigurator tauscht die Zeile bei Herstellermustern', () => {
  const js = read('assets/tp-sample-checkout.js');
  assert.match(js, /function showHerstellerHinweis\(\)/);
  assert.match(js, /showVinylLimit\(\);\s*showHerstellerHinweis\(\);/);
  assert.match(js, /core\.isHerstellerMuster\(product\)/);
  // Ohne Musterweg (Laminat, Parkett, Kork, ohne-muster) keine Zeile zu Groesse und Versand
  assert.match(js, /if \(!core\.canSample\(product\)\) \{\s*loadingEl\.hidden = true;[\s\S]{0,200}?querySelector\('\[data-sample-info\]'\);\s*if \(infoEl\) infoEl\.hidden = true;/);
});

// --- Rundgang 06.11.2026 (P06): Musterseite ohne Teppichfliesen, neutraler
// Hinweis ohne Muster, Vinyl-Bild, Sonderposten ohne Herstellerzeile ---

test('Herstellerhinweis entfaellt bei Sonderposten, bleibt bei Vorwerk-Meterware', () => {
  const core = ladeCore();
  assert.equal(core.isHerstellerMuster({ vendor: 'Vorwerk', tags: ['teppichboden'] }), true);
  assert.equal(core.isHerstellerMuster({ vendor: 'Vorwerk', tags: ['Sonderposten', 'teppich'] }), false);
  assert.equal(core.isHerstellerMuster({ vendor: 'JAB Anstoetz', tags: 'a, sonderposten' }), false);
});

test('Vinyl-Einzeldekor: _Bild ist das Produktbild, Farboption bleibt beim Variantenbild', () => {
  const core = ladeCore();
  const dekor = {
    handle: 'eiche-hell-klickvinyl', id: 1, title: 'Eiche Hell – Klickvinyl', type: 'Klickvinyl', tags: [],
    featured_image: '//cdn.example/eiche.jpg', options: [{ name: 'Title', position: 1 }],
    variants: [{ id: 11, option1: 'Default Title', title: 'Default Title', available: true }],
  };
  const farben = core.getUniqueColors(dekor);
  assert.equal(farben.length, 1);
  assert.equal(farben[0].exactImage, '//cdn.example/eiche.jpg');
  const zeilen = core.buildCartItems({ product: dekor, colors: farben, optionName: 'Dekor', sampleVariantId: 900, origin: 'https://shop.example' });
  assert.equal(zeilen[0].properties._Bild, '//cdn.example/eiche.jpg');

  const teppich = {
    handle: 'piumera', id: 2, title: 'Piumera', type: 'Teppichboden', tags: [], featured_image: '//cdn.example/haupt.jpg',
    options: [{ name: 'Farbe', position: 1 }],
    variants: [
      { id: 21, option1: 'Grau', title: 'Grau', available: true, featured_image: { src: 'https://cdn.example/grau.jpg' } },
      { id: 22, option1: 'Beige', title: 'Beige', available: true },
    ],
  };
  const tf = core.getUniqueColors(teppich);
  assert.equal(tf[0].exactImage, 'https://cdn.example/grau.jpg');
  assert.equal(tf[1].exactImage, '', 'ohne Variantenbild kein Hauptbild im Warenkorb');
});

test('Einstiege ohne Produkt: keine Gruppe Teppichfliesen, Vorlage ueberschreibt nichts', () => {
  const section = read('sections/tp-sample-checkout.liquid');
  const schema = JSON.parse(section.split('{% schema %}')[1].split('{% endschema %}')[0]);
  const zeilen = schema.settings.find((s) => s.id === 'kategorien').default.split('\n');
  assert.deepEqual(zeilen.map((z) => z.split('|')[0]), ['Teppichboden', 'Klickvinyl', 'Klebevinyl', 'Vinyl von der Rolle', 'Linoleum']);
  const vorlage = read('templates/page.muster.json');
  assert.doesNotMatch(vorlage, /kategorien|teppichfliesen/i);
});

test('Produktnamen der Einstiegskarten brechen um', () => {
  const css = read('assets/tp-sample-checkout.css');
  const regel = /\.tp-sample__produkt-name \{([^}]+)\}/.exec(css)[1];
  assert.match(regel, /min-width: 0;/);
  assert.match(regel, /overflow-wrap: anywhere;/);
  assert.match(regel, /hyphens: auto;/);
});

class El {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.hidden = false; this.disabled = false;
    this.textContent = ''; this.className = ''; this.href = '';
    this.classList = { toggle() {} };
  }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener() {}
  setAttribute() {}
  getAttribute() { return null; }
  querySelectorAll() { return []; }
}

async function ohneMuster(produkt) {
  const benannt = new Map();
  const rootEl = new El('section');
  rootEl.querySelector = (sel) => {
    if (!benannt.has(sel)) benannt.set(sel, new El());
    return benannt.get(sel);
  };
  rootEl.querySelector('[data-sample-none]').hidden = true;
  rootEl.querySelector('[data-sample-error]').hidden = true;
  const antworten = {
    ['/products/' + produkt.handle + '.js']: produkt,
    '/products/kostenloses-muster.js': { variants: [{ id: 900, available: true }] },
    '/cart.js': { items: [] },
  };
  async function fetch(url) {
    if (url.includes('section_id=')) return { ok: false, text: async () => '' };
    const daten = antworten[url];
    return { ok: Boolean(daten), json: async () => daten, text: async () => '' };
  }
  const window = {
    location: { search: '?produkt=' + produkt.handle, origin: 'https://shop.example', href: '' },
    localStorage: { getItem: () => null, setItem() {} },
  };
  const document = {
    querySelector: (sel) => (sel === '[data-tp-sample-checkout]' ? rootEl : null),
    createElement: (tag) => new El(tag),
  };
  const context = vm.createContext({ window, document, fetch, URLSearchParams, Set, Promise });
  vm.runInContext(read('assets/tp-sample-checkout-core.js'), context);
  vm.runInContext(read('assets/tp-sample-checkout.js'), context);
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));
  const hinweis = rootEl.querySelector('[data-sample-none]');
  const links = hinweis.children.flatMap((c) => c.children).map((a) => ({ text: a.textContent, href: a.href }));
  return {
    hinweis, links,
    fehler: rootEl.querySelector('[data-sample-error]'),
    intro: rootEl.querySelector('[data-sample-intro]'),
    submit: rootEl.querySelector('[data-sample-submit]'),
  };
}

test('Produkt ohne Muster: neutraler Hinweis mit Beratung und Rueckweg, ohne Intro und Knopf', async () => {
  const r = await ohneMuster({ handle: 'ethona-teppichfliese-50x50cm', id: 3, title: 'Ethona Teppichfliese 50x50cm', type: 'Teppichfliesen', tags: ['ohne-muster'], variants: [] });
  assert.equal(r.fehler.hidden, true, 'kein roter Fehlerkasten');
  assert.equal(r.hinweis.hidden, false);
  assert.equal(r.hinweis.textContent, 'Für diesen Boden gibt es leider keine Muster. Wir beraten Sie gern.');
  assert.deepEqual(r.links, [
    { text: 'Beratung anfragen', href: '/pages/kontakt?thema=beratung' },
    { text: 'Zurück zu Ethona Teppichfliese 50x50cm', href: '/products/ethona-teppichfliese-50x50cm' },
  ]);
  assert.equal(r.intro.hidden, true);
  assert.equal(r.submit.hidden, true);
});

test('Laminat: Link "Muster anfragen" ohne "Kostenloses", neutral', async () => {
  const r = await ohneMuster({ handle: 'ribe-eiche-sand-laminat-8mm', id: 4, title: 'Ribe Eiche Sand Laminat 8mm', type: 'Laminat', tags: [], variants: [] });
  assert.equal(r.fehler.hidden, true);
  assert.equal(r.hinweis.hidden, false);
  assert.equal(r.links[0].text, 'Muster anfragen');
  assert.match(r.links[0].href, /^\/pages\/kontakt\?thema=musteranfrage&produkt=Ribe%20Eiche/);
  assert.equal(r.links[1].href, '/products/ribe-eiche-sand-laminat-8mm');
  assert.equal(r.intro.hidden, true);
  assert.equal(r.submit.hidden, true);
  assert.doesNotMatch(read('assets/tp-sample-checkout.js'), /Kostenloses Muster anfragen/);
});
