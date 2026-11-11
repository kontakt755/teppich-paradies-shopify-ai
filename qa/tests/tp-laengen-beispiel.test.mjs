// w-331: Beispielgroesse fuer Laengenware nach Mass (Laeufer 200 cm, Treppenkante 3 x 100 cm)
// und Matten (60 x 90 cm). Der Preis steht in Liquid (snippets/tp-laengen-beispiel, fuer
// JSON-LD, og:price und den Zusatzfeed) und im Rechenkern (assets/tp-laengen-zuschnitt.js).
// Weicht eines ab, stuende im Feed ein anderer Preis als auf der Seite.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';
import { zeilenFuerLaengenware, rechnerPreis, googleZeile, gehoertDazu, mattenZeilen } from '../../operations/scripts/feed-nachmass-abruf.mjs';
import { seiteAuswerten } from '../../scripts/teppich-nach-mass-feed.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lies = (datei) => readFileSync(path.join(root, datei), 'utf8');
const ohneDoc = (datei) => lies(datei).replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const L = globalThis.TPLaengenZuschnitt;
const engine = new Liquid({ templates: { 'tp-rabatt-sichtbar': 'nein' } });
const source = ohneDoc('snippets/tp-laengen-beispiel.liquid');

const EINFASS = [
  { available: true, price: 1053, option1: '65 cm', option2: 'Baumwollband' },
  { available: true, price: 1053, option1: '65 cm', option2: 'Juteband' },
  { available: true, price: 1458, option1: '90 cm', option2: 'Baumwollband' },
];
const shop = (o = {}) => ({
  'einfassung-laeufer-schnittkanten': { variants: EINFASS },
  'wunschmass-pauschale': { selected_or_first_available_variant: { available: o.pauschaleOk ?? true, price: 1499 } },
});
const laeufer = (o = {}) => ({
  template_suffix: 'laeufer-nach-mass', options: ['Farbe', 'Breite'],
  metafields: { custom: { preis_pro_001_lfm: { value: true } }, service: { max_laenge_cm: { value: o.max ?? 1000 }, min_seite_cm: { value: 50 } } },
});
const kante = (o = {}) => ({
  template_suffix: 'treppenkante-nach-mass', options: ['Farbe'],
  metafields: { custom: { preis_pro_001_lfm: { value: true } }, service: { max_laenge_cm: { value: 503 }, min_seite_cm: { value: 70 }, bohrung: { value: o.bohrung ?? ['gebohrt', 'ungebohrt'] } } },
});
const beispiel = async (product, variant, { aktion = 'nein', alle = shop() } = {}) =>
  (await engine.parseAndRender(source, { product, variant, aktion, all_products: alle })).trim().split('|').slice(0, 5).join('|');

test('Laeufer: 200 cm mit erster Einfassung zur Breite und Pauschale, wie der Rechenkern', async () => {
  const v = { price: 25, compare_at_price: null, options: ['Natur', '65 cm'] };
  const erg = L.rechnen({ laenge: '200', anzahl: '1', preisCent: 25, zusatzCent: 1053 + 1499, minCm: 50, maxCm: 1000, maxStueck: 20, art: 'zuschnitt' });
  assert.equal(erg.summeCent, 7552);
  assert.equal(await beispiel(laeufer(), v), `200|1|${erg.summeCent}|0|200`);
});

test('Laeufer: Streichpreis nur bei sichtbarer Aktion, Einfassung und Pauschale ohne Streichpreis', async () => {
  const v = { price: 25, compare_at_price: 30, options: ['Natur', '65 cm'] };
  assert.equal(await beispiel(laeufer(), v, { aktion: 'ja' }), '200|1|7552|8552|200');
  assert.equal(await beispiel(laeufer(), v), '200|1|7552|0|200');
});

test('Laeufer fail closed: keine Einfassung zur Breite, Pauschale nicht kaufbar, Laenge ausserhalb', async () => {
  assert.equal(await beispiel(laeufer(), { price: 25, options: ['Natur', '67 cm'] }), '');
  assert.equal(await beispiel(laeufer(), { price: 25, options: ['Natur', '65 cm'] }, { alle: shop({ pauschaleOk: false }) }), '');
  assert.equal(await beispiel(laeufer({ max: 150 }), { price: 25, options: ['Natur', '65 cm'] }), '');
  assert.equal(await beispiel(laeufer(), { price: 0, options: ['Natur', '65 cm'] }), '');
});

test('Treppenkante: 3 x 100 cm im Zuschnitt, wie der Rechenkern mit Mindestgesamtlaenge', async () => {
  const v = { price: 18, compare_at_price: null, options: ['Alu natur'], metafields: { service: { stange_cm: { value: 250 } } } };
  const erg = L.rechnen({ laenge: '100', anzahl: '3', preisCent: 18, minCm: 70, maxCm: 250, maxStueck: 50, art: 'zuschnitt', minGesamtCm: 300, sperrgut: { preisCent: 3990, abCm: 172 } });
  assert.equal(erg.ok, true);
  assert.equal(await beispiel(kante(), v), `100|3|${erg.summeCent}|0|300`);
  assert.equal(await beispiel(kante({ bohrung: [] }), v), '', 'ohne Bohrungsangabe rendert der Block nicht');
  assert.equal(await beispiel(kante(), { ...v, metafields: { service: { stange_cm: { value: 90 } } } }), '', 'Stange kuerzer als das Beispiel');
  assert.equal(await beispiel({ ...kante(), template_suffix: '' }, v), '', 'andere Vorlage: kein Beispiel');
});

test('JSON-LD-Zusatz: Einheit Meter, Link mit laenge und anzahl, Name', async () => {
  const roh = (await engine.parseAndRender(source, { product: kante(), variant: { price: 18, options: ['Alu natur'], metafields: { service: { stange_cm: { value: 250 } } } }, aktion: 'nein', all_products: shop() })).trim();
  assert.equal(roh, '100|3|5400|0|300|MTR|&laenge=100&anzahl=3|3 x 100 cm');
});

test('Handles und Mindestgesamtlaenge sind dieselben wie in den Vorlagen', () => {
  const tpl = (name) => lies(`templates/${name}.json`);
  assert.match(tpl('product.laeufer-nach-mass'), /"einfass_produkt": "einfassung-laeufer-schnittkanten"/);
  assert.match(tpl('product.laeufer-nach-mass'), /"pauschale_produkt": "wunschmass-pauschale"/);
  const k = tpl('product.treppenkante-nach-mass');
  assert.equal(Number(k.match(/"min_gesamt_cm": (\d+)/)[1]), 300, 'Beispiel 3 x 100 cm = Mindestgesamtlaenge');
  assert.ok(Number(k.match(/"sperrgut_ab_cm": (\d+)/)[1]) >= 100, 'Beispiellaenge ohne Sperrgut');
});

test('Rechner belegt ?laenge=&anzahl= vor, JSON-LD und og:price nutzen das Snippet', () => {
  const js = lies('assets/tp-laengen-zuschnitt.js');
  assert.match(js, /get\('laenge'\)/);
  assert.match(js, /ausLink && passend\[0\]/);
  assert.match(lies('snippets/tp-product-structured-data.liquid'), /render 'tp-laengen-beispiel'/);
  assert.match(lies('snippets/meta-tags.liquid'), /render 'tp-laengen-beispiel'/);
});

test('Matten nach Mass: Beispielgroesse 60 x 90 cm zuerst', async () => {
  const e2 = new Liquid({ templates: { 'tp-teppich-max-breite': '200', 'tp-rabatt-sichtbar': 'nein' } });
  const product = { metafields: { custom: { preis_pro_001_qm: { value: true } }, service: { einfassung: { value: 'Fertig' }, produktwort: { value: 'Matte' }, max_laenge_cm: { value: 300 }, min_seite_cm: { value: 30 } } } };
  const variant = { price: 85, option1: '17 mm', metafields: { service: { einfassen: { value: 'Verfügbar' } } } };
  const aus = (await e2.parseAndRender(ohneDoc('snippets/tp-mass-beispiel.liquid'), { product, variant, aktion: 'nein', all_products: shop() })).trim();
  assert.equal(aus, `60|90|${54 * 85 + 1499}|0|54`);
});

const ORIGIN = 'https://www.teppich-paradies.net';
function seite({ preis = 75.52, laenge = 200, anzahl = 1 } = {}) {
  const url = `${ORIGIN}/products/cocora-kokoslaeufer-fischgrat-nach-mass?variant=11&laenge=${laenge}&anzahl=${anzahl}`;
  const gruppe = { '@type': 'ProductGroup', hasVariant: [{ url, offers: { url, price: preis, priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } }] };
  const lz = { min_cm: 50, max_cm: 1000, max_stueck: 20, modus: 'laeufer', stangen: false, min_gesamt_cm: 0,
    pauschale: { id: 9, price: 1499 }, einfassungen: [{ id: 5, price: 1053, breite: '65 cm', art: 'Baumwollband' }, null],
    varianten: [{ id: 11, price: 25, compare_at_price: null, available: true, breite: '65 cm' }, null] };
  return seiteAuswerten(`<script type="application/ld+json">${JSON.stringify(gruppe)}</script><script type="application/json" data-tp-lz-daten>${JSON.stringify(lz)}</script>`);
}
const produkt = { id: 'gid://shopify/Product/1', handle: 'cocora-kokoslaeufer-fischgrat-nach-mass', title: 'Cocora Kokosläufer Fischgrat nach Maß',
  variants: [{ id: 'gid://shopify/ProductVariant/11', price: '0.25', compareAtPrice: null, availableForSale: true, selectedOptions: [{ name: 'Farbe', value: 'Natur' }, { name: 'Breite', value: '65 cm' }] }] };

test('Feed: Zeile nur, wenn JSON-LD, Rechner und Admin-Preis uebereinstimmen', () => {
  const ok = zeilenFuerLaengenware(produkt, seite());
  assert.deepEqual(ok.fehler, []);
  assert.deepEqual(googleZeile(ok.zeilen[0]), ['shopify_ZZ_1_11', 'Cocora Kokosläufer Fischgrat nach Maß Natur, 65 cm, 200 cm lang, eingefasst', '75.52 EUR', '',
    `${ORIGIN}/products/cocora-kokoslaeufer-fischgrat-nach-mass?variant=11&laenge=200&anzahl=1`, '2 m', '1 m', 'DE:50.00 EUR', 'in_stock']);
  const falsch = zeilenFuerLaengenware(produkt, seite({ preis: 50 }));
  assert.equal(falsch.zeilen.length, 0);
  assert.match(falsch.fehler[0].grund, /JSON-LD 50.00 EUR != Rechner 75.52 EUR/);
  const alt = zeilenFuerLaengenware({ ...produkt, variants: [{ ...produkt.variants[0], price: '0.30' }] }, seite());
  assert.match(alt.fehler[0].grund, /Variantenpreis Admin/);
  assert.match(rechnerPreis(seite().lz, 11, 20, 1).fehler, /Mindestens 50 cm/);
});

test('Matten-Titel tragen alle Optionswerte, damit Staerken unterscheidbar sind', () => {
  const p = { title: 'Cocora Kokosmatte nach Maß', variants: [
    { id: 'gid://shopify/ProductVariant/21', selectedOptions: [{ name: 'Farbe', value: 'Natur' }, { name: 'Stärke', value: '17 mm' }] },
    { id: 'gid://shopify/ProductVariant/22', selectedOptions: [{ name: 'Farbe', value: 'Natur' }, { name: 'Stärke', value: '20 mm' }] },
  ] };
  const r = mattenZeilen(p, { fehler: [], zeilen: [{ googleId: 'shopify_ZZ_2_21', groesse: '60 x 90 cm', title: 'alt' }, { googleId: 'shopify_ZZ_2_22', groesse: '60 x 90 cm', title: 'alt' }] });
  assert.deepEqual(r.zeilen.map((z) => z.title), ['Cocora Kokosmatte nach Maß Natur, 17 mm, 60 x 90 cm', 'Cocora Kokosmatte nach Maß Natur, 20 mm, 60 x 90 cm']);
});

test('Feed-Auswahl wie die Ausschlussregel im Merchant Center', () => {
  const p = { status: 'ACTIVE', productType: 'Läufer nach Maß', handle: 'x-nach-mass', onlineStoreUrl: 'https://x' };
  assert.equal(gehoertDazu(p), true);
  assert.equal(gehoertDazu({ ...p, productType: 'Teppich nach Maß' }), false);
  assert.equal(gehoertDazu({ ...p, handle: 'einfassung-laeufer-schnittkanten' }), false);
});
