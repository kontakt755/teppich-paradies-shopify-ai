// Farb-Vorauswahl der Suchkarten (Inhaberentscheidung 2026-10-10): Wer nach
// "grauer Teppichboden" sucht, sieht Karten in einem grauen Farbton. Die Variante
// waehlt allein snippets/tp-suchfarbe-variante.liquid; Bild, alle Links, Preis,
// Rabatt-Badge und Verfuegbarkeit der Karte muessen aus genau dieser Variante
// kommen. Der Test rendert die echten Snippets mit LiquidJS und prueft, dass jede
// Kartenstelle dieselbe Quelle fragt.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lies = (datei) => readFileSync(path.join(root, datei), 'utf8');
const ohneDoc = (datei) => lies(datei).replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const ohneStylesheet = (code) => code.replace(/{%-?\s*stylesheet\s*-?%}[\s\S]*?{%-?\s*endstylesheet\s*-?%}/g, '');

const engine = new Liquid({
  templates: {
    'tp-suchfarbe-variante': ohneDoc('snippets/tp-suchfarbe-variante.liquid'),
    'tp-suchfarbe-gruppen': ohneDoc('snippets/tp-suchfarbe-gruppen.liquid'),
    'tp-verkaufseinheit': ohneDoc('snippets/tp-verkaufseinheit.liquid'),
    'tp-aktion-aktiv': ohneDoc('snippets/tp-aktion-aktiv.liquid'),
    'tp-rabatt-sichtbar': ohneDoc('snippets/tp-rabatt-sichtbar.liquid'),
    'tp-teppich-ab-preis': ohneDoc('snippets/tp-teppich-ab-preis.liquid'),
    'tp-teppich-qualitaet': ohneDoc('snippets/tp-teppich-qualitaet.liquid'),
    'tp-teppich-max-breite': ohneDoc('snippets/tp-teppich-max-breite.liquid'),
    'tp-musteroption': ohneDoc('snippets/tp-musteroption.liquid'),
    'tp-paketinhalt': '',
    'unit-price': '',
  },
});
// Shopify teilt Integer/Integer ganzzahlig, LiquidJS nicht (wie tp-teppich-ab-preis.test.mjs).
engine.registerFilter('divided_by', (a, b) => {
  const q = Number(a) / Number(b);
  return Number.isInteger(Number(a)) && Number.isInteger(Number(b)) ? Math.floor(q) : q;
});
const euro = (c) => (Number(c) / 100).toFixed(2).replace('.', ',');
engine.registerFilter('money_without_currency', euro);
engine.registerFilter('money', (c) => `${euro(c)} €`);
engine.registerFilter('money_with_currency', (c) => `${euro(c)} EUR`);
engine.registerFilter('money_without_trailing_zeros', (c) => `${euro(c)} €`.replace(',00 €', ' €'));
engine.registerFilter('t', (schluessel) => schluessel);

const suche = (terms) => ({ request: { page_type: 'search' }, search: { performed: true, terms } });
const schnellsuche = (terms) => ({ request: { page_type: 'index' }, predictive_search: { performed: true, terms } });
const kollektion = () => ({ request: { page_type: 'collection' }, search: { performed: false } });

let naechsteId = 100;
function variante(farbe, zweite, { price = 3690, compare = null, available = true, bild = true, metafields = {} } = {}) {
  const id = naechsteId++;
  return {
    id,
    title: `${farbe} / ${zweite}`,
    url: `/products/test?variant=${id}`,
    available,
    price,
    compare_at_price: compare,
    featured_media: bild ? { id: id * 10, src: `bild-${id}.jpg` } : null,
    featured_image: bild ? `bild-${id}.jpg` : null,
    options: [farbe, zweite],
    option1: farbe,
    option2: zweite,
    metafields,
  };
}
function produkt(variants, { zweiteOption = 'Breite', metafields = {} } = {}) {
  return {
    id: 1,
    handle: 'test',
    title: 'Test Teppichboden 400cm 500cm',
    available: variants.some((v) => v.available),
    options_with_values: [{ name: 'Farbe', position: 1 }, { name: zweiteOption, position: 2 }],
    variants,
    price_min: Math.min(...variants.map((v) => v.price)),
    price_max: Math.max(...variants.map((v) => v.price)),
    price_varies: new Set(variants.map((v) => v.price)).size > 1,
    selected_or_first_available_variant: variants.find((v) => v.available) || variants[0],
    selected_variant: null,
    metafields,
  };
}

async function wahl(product, globals) {
  const out = (await engine.parseAndRender("{% render 'tp-suchfarbe-variante', product: product %}", { product }, { globals })).trim();
  if (!out) return null;
  const [pos, index] = out.split('|').map(Number);
  assert.equal(index, 0, 'Farbe ist die erste Option');
  assert.ok(Number.isInteger(pos) && pos >= 0 && pos < product.variants.length, `Position ${out} liegt in product.variants`);
  return product.variants[pos];
}

// Corvella-aehnlich: Greige steht vor Blaugrau und Steingrau, Mokka ist die Raumfarbe.
function rollenware() {
  const farben = ['Tannengrün (024)', 'Mokka (048)', 'Greige (049)', 'Blaugrau (078)', 'Steingrau (095)', 'Anthrazit (099)'];
  const breite = { custom: { rollenbreite: { value: 4 } } };
  const v = farben.flatMap((f) => [variante(f, '400 cm', { metafields: breite }), variante(f, '500 cm', { metafields: breite })]);
  return produkt(v);
}

test('Farbgruppen: nur die entschiedene Gruppe grau mit den sechs Woertern', () => {
  const daten = ohneDoc('snippets/tp-suchfarbe-gruppen.liquid').replace(/{%-?\s*comment\s*-?%}[\s\S]*?{%-?\s*endcomment\s*-?%}/g, '').trim();
  assert.deepEqual(daten.split('\n').map((z) => z.trim()).filter(Boolean), ['grau: grau, silber, stein*, anthrazit, greige, taupe']);
});

// Review PR #1078: "stein" als Teilwort machte "feinsteinzeug" (16 Karten) und
// "bernstein" (7 Karten) im Development-Theme zu Grau-Suchen. "stein*" trifft nur am Wortanfang.
test('"stein" nur am Wortanfang: Bernstein, Feinsteinzeug, Sandstein sind keine Grau-Suche', async () => {
  for (const begriff of ['bernstein', 'feinsteinzeug', 'sandstein teppich', 'naturstein-optik']) {
    assert.equal(await wahl(rollenware(), suche(begriff)), null, begriff);
  }
  assert.equal((await wahl(rollenware(), suche('stein teppichboden'))).title, 'Steingrau (095) / 400 cm');
  assert.equal((await wahl(rollenware(), suche('teppichboden-stein'))).title, 'Steingrau (095) / 400 cm');
});

test('"stein" nur am Wortanfang: Farben Bernstein und Sandstein zaehlen nicht als grau', async () => {
  const p = produkt([variante('Bernstein (012)', '400 cm'), variante('Sandstein', '400 cm'), variante('Creme/Stein', '400 cm')]);
  assert.equal((await wahl(p, suche('grauer teppich'))).option1, 'Creme/Stein');
  const ohne = produkt([variante('Bernstein (012)', '400 cm'), variante('Sandstein', '400 cm')]);
  assert.equal(await wahl(ohne, suche('grauer teppich')), null);
});

test('Teilwort bleibt fuer die uebrigen Woerter: hellgraue, dunkelgrau, Mausgrau', async () => {
  const p = produkt([variante('Beige', '400 cm'), variante('Mausgrau (074)', '400 cm')]);
  for (const begriff of ['hellgrauer teppichboden', 'dunkelgrau', 'silbergraue teppiche', 'anthrazitfarben']) {
    assert.equal((await wahl(p, suche(begriff))).option1, 'Mausgrau (074)', begriff);
  }
});

test('"grauer teppichboden": erste verfuegbare Variante mit "grau" im Farbnamen', async () => {
  const p = rollenware();
  assert.equal((await wahl(p, suche('grauer teppichboden'))).title, 'Blaugrau (078) / 400 cm');
  assert.equal((await wahl(p, suche('Teppichboden Grau'))).title, 'Blaugrau (078) / 400 cm');
});

test('"anthrazit": Variante mit genau diesem Wort vor anderen Grautoenen', async () => {
  assert.equal((await wahl(rollenware(), suche('anthrazit'))).title, 'Anthrazit (099) / 400 cm');
});

test('Gruppenwort ohne eigene Variante: erste Variante der Gruppe (hier Greige)', async () => {
  assert.equal((await wahl(rollenware(), suche('taupe teppichboden'))).title, 'Greige (049) / 400 cm');
  assert.equal((await wahl(rollenware(), suche('greige'))).title, 'Greige (049) / 400 cm');
});

test('Zusammensetzungen zaehlen: Hellgrau, Grau Mittel, Silbergrau', async () => {
  for (const farbe of ['Hellgrau', 'Grau Mittel', 'Silbergrau (070)']) {
    const p = produkt([variante('Beige', '400 cm'), variante(farbe, '400 cm')]);
    assert.equal((await wahl(p, suche('grauer teppichboden'))).option1, farbe);
  }
});

test('ohne Farbwort bleibt alles wie bisher', async () => {
  assert.equal(await wahl(rollenware(), suche('teppichboden')), null);
  assert.equal(await wahl(rollenware(), suche('')), null);
});

test('Kollektions- und Produktseite: keine Vorauswahl', async () => {
  assert.equal(await wahl(rollenware(), kollektion()), null);
  // Suchobjekt mit Begriff, aber keine Suchseite (z. B. eingebettete Ausgabe)
  assert.equal(await wahl(rollenware(), { request: { page_type: 'collection' }, search: { performed: true, terms: 'grau' } }), null);
  assert.equal(await wahl(rollenware(), { request: { page_type: 'product' } }), null);
});

// Shopify waehlt bei exakten Worttreffern ("teppichboden grau") selbst eine Variante
// (product.selected_variant). Live-Beleg 2026-10-10: Granuro "Grau Tief" verlinkt,
// in der Schnellsuche aber das Raumbild einer roten Farbe.
test('Shopify-Treffer bleibt, wenn er grau, verfuegbar und bebildert ist', async () => {
  const p = rollenware();
  p.selected_variant = p.variants.find((v) => v.title === 'Steingrau (095) / 500 cm');
  assert.equal((await wahl(p, suche('teppichboden grau'))).title, 'Steingrau (095) / 500 cm');
});

// Ersatz behaelt die uebrigen Optionen (hier 500 cm) der Shopify-Auswahl, siehe Filter-Tests unten.
test('Shopify-Treffer ohne Bild, nicht lieferbar oder nicht grau wird ersetzt', async () => {
  for (const aendern of [(v) => { v.featured_media = null; }, (v) => { v.available = false; }]) {
    const p = rollenware();
    const sel = p.variants.find((v) => v.title === 'Steingrau (095) / 500 cm');
    aendern(sel);
    p.selected_variant = sel;
    assert.equal((await wahl(p, suche('teppichboden grau'))).title, 'Blaugrau (078) / 500 cm');
  }
  const p = rollenware();
  p.selected_variant = p.variants.find((v) => v.title === 'Mokka (048) / 500 cm');
  assert.equal((await wahl(p, suche('teppichboden grau'))).title, 'Blaugrau (078) / 500 cm');
});

// Review PR #1078: Bei aktivem Varianten-Filter (z. B. /search?q=teppichboden+grau
// &filter.v.m.custom.rollenbreite=5.0) setzt Shopify product.selected_variant auf eine
// passende Variante - oft in einer anderen Farbe ("Mokka / 500 cm"). Die graue Karte
// muss dieselbe Breite behalten, sonst hebelt die Vorauswahl den Filter aus.
const titel = (p, t) => p.variants.find((v) => v.title === t);
test('Filter Rollenbreite 500 cm: graue Variante derselben Breite', async () => {
  const p = rollenware();
  p.selected_variant = titel(p, 'Mokka (048) / 500 cm');
  assert.equal((await wahl(p, suche('teppichboden grau'))).title, 'Blaugrau (078) / 500 cm');
  assert.equal((await wahl(p, suche('grauer teppichboden'))).title, 'Blaugrau (078) / 500 cm');
  assert.equal((await wahl(p, schnellsuche('grauer teppichboden'))).title, 'Blaugrau (078) / 500 cm');
});

test('Filter Rollenbreite 500 cm: Wort aus dem Suchbegriff zuerst, aber in der gefilterten Breite', async () => {
  const p = rollenware();
  p.selected_variant = titel(p, 'Mokka (048) / 500 cm');
  assert.equal((await wahl(p, suche('anthrazit'))).title, 'Anthrazit (099) / 500 cm');
  // Anthrazit 500 cm nicht lieferbar: die Breite geht vor dem genauen Farbwort.
  titel(p, 'Anthrazit (099) / 500 cm').available = false;
  assert.equal((await wahl(p, suche('anthrazit'))).title, 'Greige (049) / 500 cm');
});

test('Filter Rollenbreite 500 cm ohne graue 500-cm-Variante: erste graue Variante wie bisher', async () => {
  const p = rollenware();
  for (const v of p.variants) if (v.option2 === '500 cm' && v.option1 !== 'Mokka (048)') v.featured_media = null;
  p.selected_variant = titel(p, 'Mokka (048) / 500 cm');
  assert.equal((await wahl(p, suche('teppichboden grau'))).title, 'Blaugrau (078) / 400 cm');
  assert.equal((await wahl(p, suche('taupe'))).title, 'Greige (049) / 400 cm');
});

test('Filter auf eine Groesse: graue Variante derselben Groesse', async () => {
  const p = produkt([
    variante('Beige', '80x150'), variante('Beige', '160x230'),
    variante('Grau', '80x150'), variante('Grau', '160x230'),
  ], { zweiteOption: 'Größe' });
  p.selected_variant = titel(p, 'Beige / 160x230');
  assert.equal((await wahl(p, suche('grauer teppich'))).title, 'Grau / 160x230');
});

test('Produkt nur mit Farboption: Shopify-Auswahl in anderer Farbe stoert nicht', async () => {
  const p = produkt([variante('Beige', '-'), variante('Hellgrau', '-'), variante('Anthrazit', '-')]);
  p.options_with_values = [{ name: 'Farbe', position: 1 }];
  for (const v of p.variants) { v.options = [v.option1]; v.title = v.option1; }
  p.selected_variant = p.variants[0];
  assert.equal((await wahl(p, suche('grau'))).option1, 'Hellgrau');
  assert.equal((await wahl(p, suche('anthrazit'))).option1, 'Anthrazit');
});

test('Schnellsuche nutzt denselben Begriff', async () => {
  assert.equal((await wahl(rollenware(), schnellsuche('grauer teppichboden'))).title, 'Blaugrau (078) / 400 cm');
});

test('nicht verfuegbare, unbebilderte und OPC-Varianten werden uebersprungen', async () => {
  const p = produkt([
    variante('Grau', '400 cm', { available: false }),
    variante('Grau', '500 cm', { bild: false }),
    { ...variante('Grau', 'OPC-1'), title: 'Grau / opc-1' },
    variante('Grau', 'Wunschmaß'),
  ]);
  assert.equal((await wahl(p, suche('grau'))).option2, 'Wunschmaß');
  const ohne = produkt([variante('Grau', '400 cm', { available: false }), variante('Beige', '400 cm')]);
  assert.equal(await wahl(ohne, suche('grau')), null);
});

test('Produkt ohne Farboption: keine Vorauswahl', async () => {
  const p = produkt([variante('Grau', '400 cm')]);
  p.options_with_values = [{ name: 'Größe', position: 1 }, { name: 'Breite', position: 2 }];
  assert.equal(await wahl(p, suche('grau')), null);
});

test('Teppich nach Mass: nur fuers Einfassen freigegebene Farben', async () => {
  const einfassen = (wert) => ({ service: { einfassen: { value: wert } } });
  const p = produkt(
    [variante('Grau Hell', 'Standard', { metafields: einfassen('Nicht verfügbar') }), variante('Anthrazit', 'Standard', { metafields: einfassen('Verfügbar') })],
    { metafields: { custom: { preis_pro_001_qm: { value: true } }, service: { einfassung: { value: 'Ketteln' } } } },
  );
  assert.equal((await wahl(p, suche('grauer teppich'))).option1, 'Anthrazit');
});

// --- Preis: aus der gewaehlten Farbe, nicht aus dem guenstigsten Farbton des Produkts ---
// LiquidJS-Shim: "assign x = blank" ergibt dort keinen Wert, der "== blank" ist - die
// Min/Max-Schleife liefe ins Leere. Shopify behandelt das wie nil.
const preisSnippet = ohneStylesheet(ohneDoc('snippets/price.liquid'))
  .replace(/(assign sqm_(?:price_min|price_max|compare_at_for_min)) = blank/g, '$1 = nil')
  .replace(/(sqm_price_(?:min|max)) == blank/g, '$1 == nil');
async function preis(product, globals) {
  const html = await engine.parseAndRender(preisSnippet, { product_resource: product, template: { name: 'search' }, settings: {} }, { globals });
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

test('Rollenware: Kartenpreis aus den Breiten der gewaehlten Farbe', async () => {
  const breite = { custom: { rollenbreite: { value: 4 } } };
  const p = produkt([
    variante('Mokka', '400 cm', { price: 3690, metafields: breite }),
    variante('Steingrau', '400 cm', { price: 3990, metafields: breite }),
    variante('Steingrau', '500 cm', { price: 3990, metafields: breite }),
    variante('Mokka', 'Wunschmaß', { price: 5000 }),
    variante('Steingrau', 'Wunschmaß', { price: 5200 }),
  ]);
  assert.match(await preis(p, suche('teppichboden')), /ab 36,90 €\/m²/);
  assert.match(await preis(p, suche('grauer teppichboden')), /ab 39,90 €\/m²/);
});

test('Teppiche in festen Groessen: ab-Preis nur ueber die Groessen der gewaehlten Farbe', async () => {
  const p = produkt([
    variante('Beige', '80x150', { price: 9900 }),
    variante('Grau', '80x150', { price: 12900 }),
    variante('Grau', '160x230', { price: 29900 }),
  ], { zweiteOption: 'Größe' });
  p.options_by_name = { 'Größe': { name: 'Größe' } };
  assert.match(await preis(p, suche('teppich')), /ab 99,00 €/);
  assert.match(await preis(p, suche('grauer teppich')), /ab 129,00 €/);
});

test('Teppich nach Mass auf der Karte: Preis der gewaehlten Farbe, Kartenoptik bleibt', async () => {
  const einfassen = { service: { einfassen: { value: 'Verfügbar' } } };
  const p = produkt(
    [variante('Beige', 'Standard', { price: 89, metafields: einfassen }), variante('Grau', 'Standard', { price: 99, metafields: einfassen })],
    { metafields: { custom: { preis_pro_001_qm: { value: true } }, service: { einfassung: { value: 'Ketteln' }, mindestpreis: { value: 0 }, max_breite_cm: { value: 400 }, max_laenge_cm: { value: 1000 } } } },
  );
  const kettel = { kettelservice: { selected_or_first_available_variant: { available: true, price: 19 } } };
  const render = (globals) => engine.parseAndRender(preisSnippet, { product_resource: p, template: { name: 'search' }, settings: {}, all_products: kettel }, { globals: { ...globals, all_products: kettel } });
  const ohne = await render(suche('teppich'));
  const grau = await render(suche('grauer teppich'));
  const cent = (html) => Number(html.match(/data-tp-ab-cent="(\d+)"/)[1]);
  assert.equal(cent(ohne), 120 * 89 + 460 * 19);
  assert.equal(cent(grau), 120 * 99 + 460 * 19);
  assert.match(grau, /tp-ab-preis__ab/);
});

test('Kartenaktionen: Konfigurator- und Musterlink fuehren zur gewaehlten Farbe', async () => {
  const karte = ohneStylesheet(ohneDoc('blocks/tp-card-actions.liquid')).replace(/{%-?\s*schema\s*-?%}[\s\S]*?{%-?\s*endschema\s*-?%}/g, '');
  const einfassen = { service: { einfassen: { value: 'Verfügbar' } } };
  const p = produkt(
    [variante('Beige (030)', 'Standard', { metafields: einfassen }), variante('Grau Hell (095)', 'Standard', { metafields: einfassen })],
    { metafields: { custom: { preis_pro_001_qm: { value: true } }, service: { einfassung: { value: 'Ketteln' }, max_breite_cm: { value: 400 }, max_laenge_cm: { value: 1000 } } } },
  );
  Object.assign(p, { url: '/products/test', handle: 'test-teppich-nach-mass', tags: [], type: 'Teppich' });
  const grau = p.variants[1];
  const html = (globals) => engine.parseAndRender(karte, { closest: { product: p } }, { globals });
  const ohne = await html(suche('teppich'));
  assert.match(ohne, /class="tp-card-actions__konfig" href="\/products\/test"/);
  assert.match(ohne, /href="\/pages\/muster\?produkt=test-teppich-nach-mass"/);
  const mit = await html(suche('grauer teppich'));
  assert.match(mit, new RegExp(`class="tp-card-actions__konfig" href="${grau.url.replace(/[?]/g, '\\?')}"`));
  assert.match(mit, /href="\/pages\/muster\?produkt=test-teppich-nach-mass&farbe=Grau(%20|\+)Hell(%20|\+)(\(|%28)095(\)|%29)"/);
});

// --- Jede Kartenstelle fragt dieselbe Quelle ---
const STELLEN = {
  'snippets/product-card.liquid': 'Kartenflaeche (Link ueber die ganze Karte)',
  'snippets/card-gallery.liquid': 'Bild und Bildlink',
  'blocks/tp-card-title.liquid': 'Titellink',
  'blocks/_product-card-gallery.liquid': 'Rabatt-Badge',
  'snippets/price.liquid': 'Preis',
  'blocks/price.liquid': 'Preis Teppich nach Mass',
  'blocks/tp-card-actions.liquid': 'Konfigurator- und Musterlink',
  'snippets/tp-suche-ergebnisse.liquid': 'Schnellsuche',
};
for (const [datei, rolle] of Object.entries(STELLEN)) {
  test(`${datei} (${rolle}) nutzt snippets/tp-suchfarbe-variante`, () => {
    assert.match(lies(datei), /render 'tp-suchfarbe-variante'/);
  });
}

// Review PR #1078 (Kosten): Das Snippet liefert die Position; keine Kartenstelle sucht die
// Variante noch einmal per ID-Schleife ueber alle Varianten.
test('Kartenstellen lesen die Variante per Position, ohne eigene Suchschleife', () => {
  for (const datei of Object.keys(STELLEN)) {
    const code = lies(datei);
    assert.match(code, /\.variants\[tp_\w*such_pos\]/, `${datei} liest product.variants[Position]`);
    assert.doesNotMatch(code, /such_id/, `${datei} sucht die Variante per ID`);
  }
});

test('nur das zentrale Snippet liest den Suchbegriff fuer die Farbwahl', () => {
  for (const datei of Object.keys(STELLEN)) {
    assert.doesNotMatch(lies(datei), /tp-suchfarbe-gruppen/, `${datei} liest die Farbgruppen selbst`);
  }
});

test('Suchkarte: die Variante hat Vorrang vor der Raumfarbe', () => {
  for (const datei of ['snippets/product-card.liquid', 'snippets/card-gallery.liquid', 'blocks/tp-card-title.liquid']) {
    const code = lies(datei);
    const such = code.indexOf("render 'tp-suchfarbe-variante'");
    const raum = code.indexOf("render 'tp-sprint-raumdaten'");
    assert.ok(such > -1 && raum > such, `${datei}: Suchfarbe muss vor der Raumfarbe stehen`);
  }
});
