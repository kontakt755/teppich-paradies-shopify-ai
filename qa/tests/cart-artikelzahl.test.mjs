import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Warenkorb-Artikelzahl: Eine Zeile Flaechenware (custom.preis_pro_001_qm)
// zaehlt als ein Artikel, nicht als ihre Menge in 0,01 m². Die Zaehlung
// selbst ist Liquid; geprueft wird hier das JS, das sie liest, und der
// Vertrag zwischen beiden (Marke data-tp-artikelzahl, Section-Name, Importmap).

const root = path.resolve(import.meta.dirname, '../..');
const lies = (datei) => fs.readFileSync(path.join(root, datei), 'utf8');

// Theme-Assets sind ES-Module, das package.json kennt kein "type": "module".
// Ueber eine data:-URL laedt Node sie ohne Umweg als Modul.
const az = await import(
  `data:text/javascript;base64,${Buffer.from(lies('assets/tp-cart-artikelzahl.js')).toString('base64')}`
);

/** Kommentare duerfen cart.item_count nennen - der Code nicht. */
const ohneKommentare = (quelle) => quelle
  .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '')
  .replace(/\{%-?\s*doc\s*-?%\}[\s\S]*?\{%-?\s*enddoc\s*-?%\}/g, '')
  .replace(/^\s*#.*$/gm, '');

const drawerSection = (zahl) =>
  `<div id="shopify-section-sections--1__header"><span class="visually-hidden" ref="cartItemCount" data-tp-artikelzahl="${zahl}" aria-hidden="true">${zahl}</span></div>`;

test('A: Marke wird aus Server-HTML gelesen', () => {
  assert.equal(az.artikelzahlAusHtml('<div class="shopify-section"><span data-tp-artikelzahl="3" hidden></span></div>'), 3);
  assert.equal(az.artikelzahlAusHtml('<div>Seite ohne Warenkorb</div>'), null);
  assert.equal(az.artikelzahlAusHtml(undefined), null);
});

test('B: 10-m²-Teppich aus einem Konfigurator wird nicht als 1000 uebernommen', () => {
  // So senden Rollenware-Rechner und Einfass-Konfigurator: itemCount ist die
  // Menge der Zeile in 0,01 m², das Ereignis bringt keine Sections mit.
  const detail = { resource: { quantity: 1000 }, data: { itemCount: 1000, source: 'product-form-component' } };
  assert.equal(az.artikelzahlAusEreignis(detail), null, 'ohne Server-Zahl muss nachgeladen werden');
});

test('C: mitgebrachte Sections haben Vorrang vor itemCount', () => {
  const detail = { data: { itemCount: 1000, source: 'product-form-component', sections: { a: '<div></div>', b: drawerSection(2) } } };
  assert.equal(az.artikelzahlAusEreignis(detail), 2);
});

test('D: Mengenaenderung im Drawer, auch bis zum leeren Warenkorb', () => {
  assert.equal(az.artikelzahlAusEreignis({ data: { itemCount: 2, source: 'cart-items-component', sections: { h: drawerSection(2) } } }), 2);
  // Leerer Warenkorb: Section ohne Zeilen, also ohne Marke; itemCount 0 kommt
  // aus derselben Liquid-Zaehlung ([ref="cartItemCount"]).
  assert.equal(az.artikelzahlAusEreignis({ data: { itemCount: 0, source: 'cart-items-component', sections: { h: '<div></div>' } } }), 0);
  // Andere Quellen ohne Marke gelten nicht als Server-Zahl.
  assert.equal(az.artikelzahlAusEreignis({ data: { itemCount: 3, source: 'quick-order-quantity', sections: {} } }), null);
});

test('E: Nachladen ueber die Section Rendering API auf der Warenkorb-Route', async () => {
  const aufrufe = [];
  const holen = async (url, optionen) => {
    aufrufe.push({ url, optionen });
    return { ok: true, text: async () => '<div id="shopify-section-tp-cart-artikelzahl"><span data-tp-artikelzahl="4" hidden></span></div>' };
  };
  assert.equal(await az.ladeArtikelzahl(holen, 'https://shop.example/en/cart'), 4);
  const url = new URL(aufrufe[0].url);
  assert.equal(url.pathname, '/en/cart', 'Sprachpfad bleibt erhalten');
  assert.equal(url.searchParams.get('section_id'), az.ARTIKELZAHL_SECTION);
  assert.equal(aufrufe[0].optionen.cache, 'no-store');
});

test('F: Server- und Netzfehler ergeben null statt einer Zahl', async () => {
  const basis = 'https://shop.example/cart';
  assert.equal(await az.ladeArtikelzahl(async () => ({ ok: false, text: async () => '' }), basis), null);
  assert.equal(await az.ladeArtikelzahl(async () => { throw new TypeError('offline'); }, basis), null);
  // Theme-Stand ohne die Section: Shopify antwortet mit einer Seite ohne Marke.
  assert.equal(await az.ladeArtikelzahl(async () => ({ ok: true, text: async () => '<html>404</html>' }), basis), null);
});

test('G: Blase und Ansagen teilen sich je Ereignis eine Anfrage', async () => {
  let anfragen = 0;
  const laden = async () => { anfragen += 1; return 2; };
  const ereignis = { detail: { data: { itemCount: 1000, source: 'product-form-component' } } };
  const [blase, ansage] = await Promise.all([az.artikelzahlFuer(ereignis, laden), az.artikelzahlFuer(ereignis, laden)]);
  assert.deepEqual([blase, ansage, anfragen], [2, 2, 1]);
  await az.artikelzahlFuer({ detail: ereignis.detail }, laden);
  assert.equal(anfragen, 2, 'ein neues Ereignis fragt neu, der Warenkorb hat sich geaendert');
});

test('H: mitgebrachte Zahl braucht keine Anfrage', async () => {
  let anfragen = 0;
  const zahl = await az.artikelzahlFuer({ detail: { data: { sections: { h: drawerSection(5) } } } }, async () => { anfragen += 1; return 0; });
  assert.deepEqual([zahl, anfragen], [5, 0]);
});

test('I: artikelzahlUrl ersetzt section_id und verwirft den Anker', () => {
  const url = new URL(az.artikelzahlUrl('https://shop.example/en/cart?section_id=alt#oben'));
  assert.deepEqual(url.searchParams.getAll('section_id'), ['tp-cart-artikelzahl']);
  assert.equal(url.hash, '');
  assert.equal(url.pathname, '/en/cart');
});

test('J: Liquid zaehlt Flaechenware je Zeile als 1, alles andere nach Menge', () => {
  const code = ohneKommentare(lies('snippets/tp-cart-artikelzahl.liquid'));
  assert.match(code, /for tp_az_zeile in cart\.items/);
  assert.match(
    code,
    /if tp_az_zeile\.product\.metafields\.custom\.preis_pro_001_qm\.value == true\s+assign tp_az_summe = tp_az_summe \| plus: 1\s+else\s+assign tp_az_summe = tp_az_summe \| plus: tp_az_zeile\.quantity/,
  );
  assert.doesNotMatch(code, /item_count/);
});

test('K: Header-Blase, Warenkorbtitel und Drawer zaehlen nicht mehr cart.item_count', () => {
  for (const datei of ['snippets/cart-bubble.liquid', 'snippets/cart-products.liquid']) {
    const code = ohneKommentare(lies(datei));
    assert.doesNotMatch(code, /cart\.item_count/, `${datei} zaehlt wieder Mengen`);
    // capture um render - "render ... as var" verwirft Shopify still (CLAUDE.md Punkt 3).
    assert.match(code, /\{%-?\s*capture \w+\s*-?%\}\{%-?\s*render 'tp-cart-artikelzahl'\s*-?%\}\{%-?\s*endcapture\s*-?%\}/, datei);
  }
});

test('L: Drawer und Section tragen dieselbe Marke, die das JS liest', () => {
  assert.match(lies('snippets/cart-products.liquid'), /ref="cartItemCount"\s+data-tp-artikelzahl="\{\{ tp_artikelzahl \}\}"/);
  const section = lies(`sections/${az.ARTIKELZAHL_SECTION}.liquid`);
  assert.match(section, /render 'tp-cart-artikelzahl'/);
  assert.match(section, /data-tp-artikelzahl="\{\{ tp_az_zahl \| strip \}\}"/);
  assert.doesNotMatch(section, /"presets"/, 'die Section gehoert nicht in die Editor-Auswahl');
});

test('M: Blase und beide Screenreader-Ansagen haengen am selben Modul', () => {
  assert.match(lies('snippets/scripts.liquid'), /"@theme\/tp-cart-artikelzahl": "\{\{ 'tp-cart-artikelzahl\.js' \| asset_url \}\}"/);
  for (const datei of ['assets/cart-icon.js', 'assets/header-actions.js', 'assets/cart-drawer.js']) {
    const quelle = lies(datei);
    assert.match(quelle, /import \{ artikelzahlFuer \} from '@theme\/tp-cart-artikelzahl';/, datei);
    assert.match(quelle, /await artikelzahlFuer\(event\)/, datei);
  }
});

test('N: Flaechenzeile zeigt m² und behaelt den Mengenwaehler im Formular', () => {
  const produkte = lies('snippets/cart-products.liquid');
  const flaeche = produkte.indexOf("render 'tp-cart-flaeche', line_item: item");
  const waehler = produkte.indexOf("render 'quantity-selector'");
  assert.ok(flaeche > 0 && flaeche < waehler, 'Flaeche steht vor dem Mengenwaehler');
  // Der Warenkorb verzweigt nicht selbst auf Flaechenware: Der Mengenwaehler
  // (updates[] fuer den Checkout-Knopf) steht fuer jede Zeile im Formular,
  // sonst verschoebe sich die Menge jeder folgenden Zeile.
  assert.doesNotMatch(ohneKommentare(produkte), /preis_pro_001_qm/);

  const snippet = lies('snippets/tp-cart-flaeche.liquid');
  assert.match(snippet, /line_item\.product\.metafields\.custom\.preis_pro_001_qm\.value == true/);
  for (const name of ['Fläche (abgerechnet)', 'Fläche']) {
    assert.ok(snippet.includes(`line_item.properties['${name}']`), name);
  }
  assert.match(snippet, /:has\(> \.cart-items__flaeche\) > \.quantity-selector-wrapper \{\s*display: none;/);
  assert.doesNotMatch(snippet, /disabled/, 'deaktivierte Felder schickt das Formular nicht mit');
  assert.match(snippet, /\{\{ tp_fl_text \| escape \}\}/, 'Property-Werte kommen vom Client');
});
