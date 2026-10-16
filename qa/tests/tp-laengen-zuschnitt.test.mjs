// Profile nach Mass (Treppenkanten): Laengen-Zuschnitt in cm wie der
// Kettelservice - Variantenpreis je 0,01 lfm, Menge = Laenge je Stueck x
// Stueckzahl. Geprueft werden Rechenkern, Datenvertrag des Blocks (fail
// closed), Warenkorb-Erkennung (Menge gesperrt, "10 × 95 cm", Sperre ohne
// Laengenangabe), Meterpreis auf Karte/Seite und JSON-LD je Meter.
// LiquidJS ist nicht Shopifys Liquid: Shopify-Tags (doc, stylesheet, schema)
// sind hier Leertags, Filter wie asset_url Attrappen.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lies = (datei) => readFileSync(path.join(root, datei), 'utf8');
const require = createRequire(import.meta.url);
require('../../assets/tp-laengen-zuschnitt.js');
require('../../assets/tp-cart-gruppen.js');
const L = globalThis.TPLaengenZuschnitt;
const G = globalThis.TPCartGruppen;

// Aktion fuer den Streichpreis: tp-rabatt-sichtbar wird hier durch ein
// Testflag ersetzt (die echte Regel hat eigene Tests).
const engine = new Liquid({
  relativeReference: false,
  strictFilters: false,
  fs: {
    resolve: (_dir, file) => path.join(root, 'snippets', file + '.liquid'),
    exists: async (file) => existsSync(file),
    existsSync,
    readFile: async (file) => quelle(file),
    readFileSync: (file) => quelle(file),
    contains: () => true,
  },
});
function quelle(file) {
  if (file.endsWith('tp-rabatt-sichtbar.liquid')) return '{% if product.test_aktion %}ja{% endif %}';
  return readFileSync(file, 'utf8');
}
for (const tag of ['doc', 'stylesheet', 'schema', 'javascript']) {
  const ende = 'end' + tag;
  engine.registerTag(tag, {
    parse(_t, rest) { while (rest.length) { if (rest.shift().name === ende) return; } },
    render: () => '',
  });
}
engine.registerFilter('json', (v) => JSON.stringify(v ?? null));
engine.registerFilter('money_without_currency', (c) => (Number(c) / 100).toFixed(2).replace('.', ','));

const val = (value) => ({ value });
const variante = (o = {}) => ({
  id: o.id ?? 11, title: o.title ?? 'Messing poliert', price: o.price ?? 26,
  compare_at_price: o.compare_at_price ?? null, available: o.available ?? true,
});
function produkt(o = {}) {
  const varianten = o.varianten ?? [variante(), variante({ id: 12, title: 'Messing unpoliert', price: 24 })];
  return {
    title: 'Berliner Treppenkante Messing 40 × 23 mm nach Maß',
    handle: 'berliner-treppenkante-messing-nach-mass',
    variants: varianten,
    selected_or_first_available_variant: varianten[0],
    test_aktion: o.aktion ?? false,
    metafields: {
      custom: { preis_pro_001_lfm: val(o.lfm ?? true) },
      service: {
        max_laenge_cm: val(o.max ?? 503),
        ...(o.min === undefined ? {} : { min_seite_cm: val(o.min) }),
        ...(o.bohrung === null ? {} : { bohrung: val(o.bohrung ?? ['gebohrt', 'ungebohrt']) }),
      },
    },
  };
}

const block = lies('blocks/tp-laengen-zuschnitt.liquid');
const blockOhneSchema = block.slice(0, block.indexOf('{% stylesheet %}'));
const blockRendern = (p) => engine.parseAndRender(blockOhneSchema, {
  product: p, block: { id: 'abc_1', settings: { max_stueck: 50, messhilfe: '', preishinweis: 'Ohne Aufpreis.' }, shopify_attributes: '' },
  settings: { tp_versand_frei_ab: 150 }, pages: {}, routes: { cart_url: '/cart' },
});
const daten = (html) => {
  const m = html.match(/<script type="application\/json" data-tp-lz-daten>([\s\S]*?)<\/script>/);
  assert.ok(m, 'kein Datenblock');
  return JSON.parse(m[1]);
};

test('Rechenkern: Menge in cm, Preis = Variantenpreis x Menge', () => {
  const e = { laenge: '95', anzahl: '10', preisCent: 26, minCm: 10, maxCm: 503, maxStueck: 50 };
  const r = L.rechnen(e);
  assert.equal(r.ok, true);
  assert.equal(r.menge, 950);
  assert.equal(r.summeCent, 24700);
  assert.equal(r.meterpreisCent, 2600);
  assert.equal(L.euro(r.summeCent), '247,00 €');
  assert.equal(L.meter(r.menge), '9,50');
  assert.equal(L.euro(123456789), '1.234.567,89 €');
});

test('Rechenkern: Grenzen und Fehler, leeres Feld ohne Meldung', () => {
  const basis = { anzahl: '1', preisCent: 26, minCm: 10, maxCm: 503, maxStueck: 50 };
  assert.deepEqual([L.rechnen({ ...basis, laenge: '' }).ok, L.rechnen({ ...basis, laenge: '' }).fehler], [false, '']);
  assert.match(L.rechnen({ ...basis, laenge: '9' }).fehler, /Mindestens 10 cm/);
  assert.match(L.rechnen({ ...basis, laenge: '504' }).fehler, /Höchstens 503 cm/);
  assert.equal(L.rechnen({ ...basis, laenge: '503' }).menge, 503);
  assert.match(L.rechnen({ ...basis, laenge: '95,5' }).fehler, /ganzen Zentimetern/);
  assert.match(L.rechnen({ ...basis, laenge: '95', anzahl: '0' }).fehler, /Stückzahl/);
  assert.match(L.rechnen({ ...basis, laenge: '95', anzahl: '51' }).fehler, /Höchstens 50 Stück/);
  assert.match(L.rechnen({ ...basis, laenge: '95', preisCent: 0 }).fehler, /nicht bestellbar/);
});

test('Rechenkern: Streichsumme nur mit hoeherem Vergleichspreis', () => {
  const e = { laenge: '100', anzahl: '2', preisCent: 26, vergleichCent: 30, minCm: 10, maxCm: 503, maxStueck: 50 };
  assert.equal(L.rechnen(e).altSummeCent, 6000);
  assert.equal(L.rechnen({ ...e, vergleichCent: 26 }).altSummeCent, 0);
});

test('Warenkorbzeile: Properties, die tp-cart-gruppe liest', () => {
  const r = L.rechnen({ laenge: '95', anzahl: '10', preisCent: 26, minCm: 10, maxCm: 503, maxStueck: 50 });
  const p = L.eigenschaften(r, 'gebohrt', 'Labc');
  assert.deepEqual(p, { 'Länge je Stück': '95 cm', 'Anzahl': '10 Stück', 'Gesamtlänge': '9,50 m', 'Bohrung': 'gebohrt', '_Gruppe': 'Labc' });
  const gruppe = lies('snippets/tp-cart-gruppe.liquid');
  const lw = lies('snippets/tp-cart-laengenware.liquid');
  assert.ok(lw.includes("zeile.properties['Länge je Stück']"));
  assert.ok(lw.includes('custom.preis_pro_001_lfm'));
  assert.ok(lw.includes(G.TEXT[G.GRUND.OHNE_MASS]), 'derselbe Sperrtext wie im JS');
  assert.match(gruppe, /render 'tp-cart-laengenware', zeile: tp_gz_it, teil: 'waise'/, 'Sperre ueber den ganzen Warenkorb');
  assert.match(gruppe, /render 'tp-cart-laengenware', zeile: line_item, teil: 'waise'/, 'Hinweis an der Zeile');
  assert.match(gruppe, /render 'tp-cart-laengenware', zeile: line_item, teil: 'menge'/);
});

test('Warenkorb (JS-Spiegel): Laengenware ist berechnet, zeigt Stueck x Laenge, ohne Laenge Waise', () => {
  const zeile = { key: 'p1', quantity: 950, preisPro001Lfm: true, optionen: ['Messing poliert'],
    properties: { 'Länge je Stück': '95 cm', 'Anzahl': '10 Stück', 'Gesamtlänge': '9,50 m', 'Bohrung': 'gebohrt', _Gruppe: 'L1' } };
  assert.equal(G.istBerechnet(zeile), true);
  // Ohne Konfigurator (keine _Gruppe) nicht berechnet, aber Waise - wie in Liquid.
  assert.equal(G.istBerechnet({ ...zeile, properties: {} }), false);
  assert.equal(G.kundeneinheit(zeile), '10 × 95 cm');
  assert.deepEqual(G.waisen([zeile]), []);
  const roh = { key: 'p2', quantity: 1, preisPro001Lfm: true, properties: {} };
  assert.equal(G.waisen([roh])[0].grund, G.GRUND.OHNE_MASS);
});

test('Warenkorb (Liquid): Menge "10 × 95 cm", gesperrt, Waise ohne Laengenangabe', async () => {
  const snippet = lies('snippets/tp-cart-gruppe.liquid');
  const produktLfm = { type: 'Treppenkanten', title: 'Berliner Treppenkante', metafields: { custom: { preis_pro_001_lfm: val(true) } } };
  const zeile = { quantity: 950, product: produktLfm, variant: { options: ['Messing poliert'] }, url: '/products/x',
    properties: { 'Länge je Stück': '95 cm', 'Anzahl': '10 Stück', 'Bohrung': 'gebohrt', _Gruppe: 'L1' } };
  const roh = { ...zeile, properties: {} };
  const r = (line_item, teil, items) => engine.parseAndRender(snippet, { line_item, teil, cart: { items: items ?? [line_item], attributes: {} } });
  assert.equal((await r(zeile, 'berechnet')).trim(), 'ja');
  assert.match(await r(zeile, 'menge'), /10 × 95 cm/);
  assert.doesNotMatch(await r(zeile, 'hinweis'), /tp-cart-waise/);
  assert.equal((await r(null, 'sperre', [zeile])).trim(), '');
  assert.match(await r(roh, 'hinweis'), /braucht eine Maßangabe/);
  assert.match(await r(null, 'sperre', [zeile, roh]), /Bestellung nicht möglich/);
});

test('Warenkorb: Einzelpreis je Meter', async () => {
  const s = lies('snippets/tp-cart-einzelpreis-einheit.liquid');
  const out = await engine.parseAndRender(s, { line_item: { variant: { title: 'Messing poliert' }, product: { metafields: { custom: { preis_pro_001_lfm: val(true) } } } } });
  assert.equal(out.trim(), '100|/m');
  const kettel = await engine.parseAndRender(s, { line_item: { variant: { title: 'je 0,01 laufender Meter' }, product: { metafields: {} } } });
  assert.equal(kettel.trim(), '100|/lfm');
});

test('Block: rendert mit vollstaendigen Daten, nur Varianten mit Preis', async () => {
  const p = produkt({ varianten: [variante(), variante({ id: 13, title: 'ohne Preis', price: 0 })] });
  const html = await blockRendern(p);
  const d = daten(html);
  assert.equal(d.min_cm, 10);
  assert.equal(d.max_cm, 503);
  assert.equal(d.max_stueck, 50);
  assert.deepEqual(d.bohrungen, ['gebohrt', 'ungebohrt']);
  assert.deepEqual(d.varianten.filter(Boolean).map((v) => v.id), [11]);
  assert.equal(d.varianten[0].compare_at_price, null);
  assert.match(html, /name="tp-lz-bohrung-abc1" value="gebohrt" checked/);
  assert.match(html, /max="503"/);
});

test('Block: Streichpreis nur bei aktiver Aktion', async () => {
  const v = variante({ compare_at_price: 30 });
  assert.equal(daten(await blockRendern(produkt({ varianten: [v] }))).varianten[0].compare_at_price, null);
  assert.equal(daten(await blockRendern(produkt({ varianten: [v], aktion: true }))).varianten[0].compare_at_price, 30);
});

test('Block: eine einzige Bohrung wird genannt, nicht gewaehlt', async () => {
  const html = await blockRendern(produkt({ bohrung: ['gebohrt'] }));
  assert.doesNotMatch(html, /tp-lz-bohrung-/);
  assert.match(html, /Bohrung: <span>gebohrt<\/span>/);
});

test('Block: fail closed ohne Metafeld, Laengengrenze, Bohrung oder Preis', async () => {
  assert.equal((await blockRendern(produkt({ lfm: false }))).trim(), '');
  assert.equal((await blockRendern(produkt({ max: 0 }))).trim(), '');
  assert.equal((await blockRendern(produkt({ bohrung: null }))).trim(), '');
  assert.equal((await blockRendern(produkt({ bohrung: [] }))).trim(), '');
  assert.equal((await blockRendern(produkt({ varianten: [variante({ price: 0 })] }))).trim(), '');
  assert.equal(daten(await blockRendern(produkt({ min: 30 }))).min_cm, 30);
});

test('Preis: Karte "ab 24,00 €/m", Produktseite Preis der gewaehlten Variante', async () => {
  const s = lies('snippets/tp-laengen-preis.liquid');
  const p = produkt();
  const karte = await engine.parseAndRender(s, { product: p });
  assert.match(karte, /ab&nbsp;<\/span>24,00/);
  assert.match(karte, /€\/m/);
  const seite = await engine.parseAndRender(s, { product: p, variant: p.variants[0] });
  assert.doesNotMatch(seite, /ab&nbsp;/);
  assert.match(seite, /26,00/);
  const einzeln = await engine.parseAndRender(s, { product: produkt({ varianten: [variante()] }) });
  assert.doesNotMatch(einzeln, /ab&nbsp;/);
  // Streichpreis nur mit Aktion
  const mitAlt = produkt({ varianten: [variante({ compare_at_price: 30 })] });
  assert.doesNotMatch(await engine.parseAndRender(s, { product: mitAlt }), /compare-at-price/);
  mitAlt.test_aktion = true;
  assert.match(await engine.parseAndRender(s, { product: mitAlt }), /compare-at-price">30,00/);
});

test('snippets/price.liquid leitet Laengenware an den Meterpreis weiter', () => {
  const s = lies('snippets/price.liquid');
  assert.match(s, /elsif product_resource\.metafields\.custom\.preis_pro_001_lfm\.value == true -%\}[\s\S]{0,400}render 'tp-laengen-preis'/);
});

test('Produktvorlage: Kaufknoepfe aus, Laengen-Zuschnitt an', () => {
  const s = lies('templates/product.treppenkante-nach-mass.json');
  const d = JSON.parse(s.slice(s.indexOf('{')));
  const pd = d.sections.main.blocks['product-details'];
  const typen = pd.block_order.map((k) => pd.blocks[k].type);
  assert.ok(typen.includes('tp-laengen-zuschnitt'));
  assert.ok(!typen.includes('tp-zubehoer-menge'), 'die Mengenhilfe schreibt ins Mengenfeld der Kaufknoepfe');
  const kauf = pd.block_order.find((k) => pd.blocks[k].type === 'buy-buttons');
  assert.equal(pd.blocks[kauf].disabled, true, 'normaler Kaufknopf legte 1 cm in den Warenkorb');
});

test('JSON-LD und og:price: Meterpreis mit referenceQuantity 1 MTR', async () => {
  const s = lies('snippets/tp-product-structured-data.liquid');
  engine.registerFilter('image_url', (v) => (typeof v === 'string' ? v : '//cdn/bild.jpg'));
  const p = {
    ...produkt(), id: 7, type: 'Treppenkanten', tags: [], vendor: 'TeppichParadies', description: 'Profil',
    url: '/products/berliner', images: [], featured_image: null, options: ['Farbe'],
  };
  p.variants = p.variants.map((v) => ({ ...v, sku: '', barcode: '', options: [v.title], featured_image: null, metafields: {} }));
  const html = await engine.parseAndRender(s, {
    product_resource: p, request: { origin: 'https://www.teppich-paradies.net' },
    cart: { currency: { iso_code: 'EUR' } }, shop: { name: 'TeppichParadies' },
  });
  const d = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const off = d.hasVariant[0].offers;
  assert.equal(off.price, 26);
  assert.equal(off.priceSpecification.price, 26);
  assert.equal(off.priceSpecification.referenceQuantity.unitCode, 'MTR');
  assert.match(lies('snippets/meta-tags.liquid'), /preis_pro_001_qm\.value == true or product\.metafields\.custom\.preis_pro_001_lfm\.value == true/);
});

// Laeufer nach Mass (seit 2026-10-16, domains/shopify/laeufer-nach-mass.md):
// derselbe Block mit modus = laeufer. Statt Bohrung die Einfassung der beiden
// Schnittkanten (Variante des Einfass-Produkts zur Breite) und je Laeufer die
// Pauschale - beide als Servicezeilen derselben _Gruppe.
const einfassProdukt = () => ({
  handle: 'einfassung-laeufer-schnittkanten',
  metafields: { service: { bandfarben: val({ Baumwollband: ['Mohn', 'Tanne'], Juteband: ['Natur'] }) } },
  variants: [
    { id: 801, option1: '65 cm', option2: 'Baumwollband', price: 1053, available: true },
    { id: 802, option1: '90 cm', option2: 'Baumwollband', price: 1458, available: true },
    { id: 803, option1: '65 cm', option2: 'Juteband', price: 1053, available: true },
    { id: 804, option1: '90 cm', option2: 'Juteband', price: 1458, available: false },
  ],
});
const pauschaleProdukt = (o = {}) => ({ selected_or_first_available_variant: { id: 901, price: o.price ?? 1499, available: o.available ?? true } });
function laeufer(o = {}) {
  const varianten = [
    { ...variante({ id: 21, title: 'Natur / 65 cm / ohne Rücken', price: 39 }), options: ['Natur', '65 cm', 'ohne Rücken'] },
    { ...variante({ id: 22, title: 'Natur / 90 cm / ohne Rücken', price: 35 }), options: ['Natur', '90 cm', 'ohne Rücken'] },
  ];
  const p = produkt({ varianten, bohrung: null, max: 2500, min: 50 });
  p.title = 'Cocora Kokosläufer Fischgrat nach Maß';
  p.options_with_values = [{ name: 'Farbe' }, { name: 'Breite' }, { name: 'Rücken' }];
  return p;
}
const laeuferRendern = (p, s = {}) => engine.parseAndRender(blockOhneSchema, {
  product: p,
  block: { id: 'abc_1', shopify_attributes: '', settings: {
    max_stueck: 20, messhilfe: '', preishinweis: 'Pauschale je Läufer.', modus: 'laeufer',
    titel_masse: 'Länge und Anzahl', label_laenge: 'Länge des Läufers',
    einfass_produkt: s.einfass === undefined ? einfassProdukt() : s.einfass,
    pauschale_produkt: s.pauschale === undefined ? pauschaleProdukt() : s.pauschale,
  } },
  settings: { tp_versand_frei_ab: 150 }, pages: {}, routes: { cart_url: '/cart' },
});

test('Laeufer: Rechenkern rechnet Einfassung und Pauschale je Laeufer obendrauf', () => {
  const r = L.rechnen({ laenge: '350', anzahl: '2', preisCent: 39, zusatzCent: 1053 + 1499, minCm: 50, maxCm: 2500, maxStueck: 20 });
  assert.equal(r.menge, 700);
  assert.equal(r.materialCent, 27300);
  assert.equal(r.zusatzCent, 5104);
  assert.equal(r.summeCent, 32404);
  // Streichsumme nur auf das Material, Zusatz unveraendert
  const a = L.rechnen({ laenge: '100', anzahl: '1', preisCent: 39, vergleichCent: 45, zusatzCent: 1499, minCm: 50, maxCm: 2500, maxStueck: 20 });
  assert.equal(a.altSummeCent, 4500 + 1499);
  // ohne Zusatz bleibt die Profil-Rechnung gleich
  assert.equal(L.rechnen({ laenge: '95', anzahl: '10', preisCent: 26, minCm: 10, maxCm: 503, maxStueck: 50 }).summeCent, 24700);
});

test('Laeufer: Bandfarben je Ausfuehrung, leer ohne Angabe', () => {
  const b = { Baumwollband: ['Mohn', '', 'Tanne'], Juteband: ['Natur'] };
  assert.deepEqual(L.bandfarbenFuer(b, 'Baumwollband'), ['Mohn', 'Tanne']);
  assert.deepEqual(L.bandfarbenFuer(b, 'Juteband'), ['Natur']);
  assert.deepEqual(L.bandfarbenFuer(b, 'Gummi'), []);
  assert.deepEqual(L.bandfarbenFuer(null, 'Juteband'), []);
});

test('Laeufer: Einfassungen nur zur Breite der Variante', () => {
  const e = [{ id: 1, breite: '65 cm', art: 'A' }, { id: 2, breite: '90 cm', art: 'A' }, null];
  assert.deepEqual(L.einfassungenFuer(e, '65 cm').map((x) => x.id), [1]);
  assert.deepEqual(L.einfassungenFuer(e, '67 cm'), []);
  assert.deepEqual(L.einfassungenFuer(e, null), []);
});

test('Laeufer: Warenkorbzeilen Laeufer + Einfassung + Pauschale in einer Gruppe', () => {
  const erg = L.rechnen({ laenge: '350', anzahl: '2', preisCent: 39, zusatzCent: 2552, minCm: 50, maxCm: 2500, maxStueck: 20 });
  const z = L.laeuferZeilen({
    erg, varianteId: 21, variantenTitel: 'Natur / 65 cm / ohne Rücken', produkt: 'Cocora Kokosläufer',
    einfassung: { id: 801, art: 'Baumwollband' }, bandfarbe: 'Mohn', pauschale: { id: 901 }, gruppe: 'Lx',
  });
  assert.deepEqual(z.map((x) => [x.id, x.quantity]), [[21, 700], [801, 2], [901, 2]]);
  assert.deepEqual(z[0].properties, { 'Länge je Stück': '350 cm', 'Anzahl': '2 Stück', 'Gesamtlänge': '7,00 m', 'Einfassung': 'Baumwollband', 'Bandfarbe': 'Mohn', '_Gruppe': 'Lx' });
  assert.equal(z[1].properties['Zu Teppich'], 'Cocora Kokosläufer');
  assert.equal(z[1].properties.Einfassung, 'Baumwollband');
  assert.equal(z[1].properties.Bandfarbe, 'Mohn');
  assert.equal(z[2].properties['Zu Teppich'], 'Cocora Kokosläufer');
  assert.equal(z[2].properties['Maße'], undefined, '"Maße" liest die Masspruefung als Flaeche');
  assert.ok(z.every((x) => x.properties._Gruppe === 'Lx'));
  const ohne = L.laeuferZeilen({ erg, varianteId: 21, produkt: 'X', einfassung: null, bandfarbe: 'Mohn', pauschale: { id: 901 }, gruppe: 'Ly' });
  assert.deepEqual(ohne.map((x) => x.id), [21, 901]);
  assert.equal(ohne[0].properties.Einfassung, 'ohne Einfassung');
  assert.equal(ohne[0].properties.Bandfarbe, undefined, 'ohne Einfassung keine Bandfarbe');
});

test('Laeufer (JS-Spiegel): Servicezeilen haengen am Laeufer, ohne Laeufer verwaist', () => {
  const haupt = { key: 'a', quantity: 700, preisPro001Lfm: true, properties: { 'Länge je Stück': '350 cm', 'Anzahl': '2 Stück', 'Einfassung': 'Baumwollband Mohn', _Gruppe: 'Lx' } };
  const band = { key: 'b', quantity: 2, properties: { 'Zu Teppich': 'Cocora', 'Einfassung': 'Baumwollband Mohn', _Gruppe: 'Lx' } };
  const pauschale = { key: 'c', quantity: 2, properties: { 'Zu Teppich': 'Cocora', 'Läufer': '2 × 350 cm', _Gruppe: 'Lx' } };
  assert.deepEqual(G.waisen([haupt, band, pauschale]), []);
  assert.equal(G.waisen([band, pauschale]).length, 2);
});

test('Laeufer: Block rendert ohne service.bohrung, mit Breite je Variante und Einfassungen', async () => {
  const html = await laeuferRendern(laeufer());
  const d = daten(html);
  assert.equal(d.modus, 'laeufer');
  assert.equal(d.produkt, 'Cocora Kokosläufer Fischgrat nach Maß');
  assert.deepEqual(d.pauschale, { id: 901, price: 1499 });
  assert.deepEqual(d.einfassungen.filter(Boolean).map((e) => [e.id, e.breite, e.art]),
    [[801, '65 cm', 'Baumwollband'], [802, '90 cm', 'Baumwollband'], [803, '65 cm', 'Juteband']], 'nur kaufbare');
  assert.deepEqual(d.bandfarben, { Baumwollband: ['Mohn', 'Tanne'], Juteband: ['Natur'] });
  assert.match(html, /data-bandfarbe-feld hidden/);
  assert.deepEqual(d.varianten.filter(Boolean).map((v) => v.breite), ['65 cm', '90 cm']);
  assert.match(html, /data-einfassung/);
  assert.match(html, /Einfassung der Schnittkanten/);
  assert.match(html, /Länge des Läufers/);
  assert.match(html, /cm je Läufer\./);
  assert.doesNotMatch(html, /Bohrung/);
});

test('Laeufer: fail closed ohne Einfass- oder Pauschale-Produkt', async () => {
  assert.equal((await laeuferRendern(laeufer(), { einfass: '' })).trim(), '');
  assert.equal((await laeuferRendern(laeufer(), { pauschale: '' })).trim(), '');
  assert.equal((await laeuferRendern(laeufer(), { pauschale: pauschaleProdukt({ available: false }) })).trim(), '');
  assert.equal((await laeuferRendern(laeufer(), { pauschale: pauschaleProdukt({ price: 0 }) })).trim(), '');
  // Profil-Modus ohne Bohrung bleibt leer wie bisher
  assert.equal((await blockRendern(laeufer())).trim(), '');
});

test('Laeufer: Vorlage mit Einfass- und Pauschale-Produkt, Kaufknoepfe aus', () => {
  const s = lies('templates/product.laeufer-nach-mass.json');
  const d = JSON.parse(s.slice(s.indexOf('{')));
  const pd = d.sections.main.blocks['product-details'];
  const lz = Object.values(pd.blocks).find((b) => b.type === 'tp-laengen-zuschnitt');
  assert.equal(lz.settings.modus, 'laeufer');
  assert.equal(lz.settings.einfass_produkt, 'einfassung-laeufer-schnittkanten');
  assert.equal(lz.settings.pauschale_produkt, 'wunschmass-pauschale');
  const kauf = pd.block_order.find((k) => pd.blocks[k].type === 'buy-buttons');
  assert.equal(pd.blocks[kauf].disabled, true);
});

// Review #1401: Nach einer Farbwahl (tp:farbe-wechsel) blieb deren Variante
// gesetzt - ein anschliessender Wechsel von Breite/Staerke in Horizons
// Variantenwahl kam nicht an, im Warenkorb landete die alte Breite.
test('variant:update: Horizons Variante gilt auch nach einer Farbwahl', () => {
  const ev = (productId, resource) => ({ detail: { resource, data: { productId } } });
  assert.equal(L.variantVonHorizon(ev('77', { id: 22 }), 77, '21'), '22', 'neue Breite ersetzt die Farbwahl');
  assert.equal(L.variantVonHorizon(ev('77', null), 77, '21'), 'keine', 'Kombination gibt es nicht: keine Auswahl');
  assert.equal(L.variantVonHorizon(ev('99', { id: 5 }), 77, '21'), '21', 'fremdes Produkt (Schnellkauf) aendert nichts');
  assert.equal(L.variantVonHorizon({ detail: { resource: { id: 5 } } }, 77, null), null, 'ohne Produkt-ID nichts');
  assert.equal(L.variantVonHorizon(ev('77', { id: 22 }), null, '21'), '21', 'ohne eigene ID nichts');
});

test('variant:update: beide Konfiguratoren nutzen die Regel, Bloecke liefern die Produkt-ID', async () => {
  for (const js of ['assets/tp-laengen-zuschnitt.js', 'assets/tp-einfass-konfigurator.js']) {
    const s = lies(js);
    assert.match(s, /addEventListener\('variant:update', function \(e\) \{\s+gewaehlt = variantVonHorizon\(e, d\.produkt_id, gewaehlt\);/, js);
  }
  assert.match(lies('blocks/tp-einfass-konfigurator.liquid'), /"produkt_id": \{\{ product\.id \| json \}\}/);
  const p = laeufer();
  p.id = 4711;
  assert.equal(daten(await laeuferRendern(p)).produkt_id, 4711);
});

test('Farbwahl: fehlende Kombination wird an Horizon uebergeben statt still verworfen', () => {
  const s = lies('blocks/color-swatch-picker.liquid');
  const i = s.indexOf('const variant = findMatchingVariant(input.value);');
  assert.ok(i > 0);
  const zweig = s.slice(i, s.indexOf('syncSwatchUI(input.value);\n        setVariantIdInput', i));
  assert.match(zweig, /if \(!variant\) \{/);
  assert.match(zweig, /setNativeColorValue\(input\.value\);/, 'Horizon entscheidet ueber die Kombination');
  assert.match(zweig, /syncSwatchUI\(getCurrentOptionValues\(\)\[colorOptionIndex\]\)/, 'ohne native Felder zurueck zur geltenden Farbe');
});

test('Laeufer: Fehlertexte sprechen von Laeufern, Profile bleiben bei Stueck', () => {
  const b = { preisCent: 39, minCm: 50, maxCm: 1000, maxStueck: 20, je: 'Läufer' };
  assert.equal(L.rechnen({ ...b, laenge: '40', anzahl: '1' }).fehler, 'Mindestens 50 cm je Läufer.');
  assert.equal(L.rechnen({ ...b, laenge: '1200', anzahl: '1' }).fehler, 'Höchstens 1000 cm je Läufer.');
  assert.equal(L.rechnen({ ...b, laenge: '100', anzahl: '' }).fehler, 'Bitte die Anzahl angeben.');
  assert.match(L.rechnen({ ...b, laenge: '100', anzahl: '21' }).fehler, /^Höchstens 20 Läufer je Bestellung/);
  assert.equal(L.rechnen({ ...b, je: '', laenge: '40', anzahl: '1' }).fehler, 'Mindestens 50 cm je Stück.');
});

test('Laeufer: fail closed ohne Option "Breite"', async () => {
  const p = laeufer();
  p.options_with_values = [{ name: 'Farbe' }, { name: 'Größe' }];
  assert.equal((await laeuferRendern(p)).trim(), '');
});
