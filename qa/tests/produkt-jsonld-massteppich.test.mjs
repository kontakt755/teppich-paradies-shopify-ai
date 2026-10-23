import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Liquid } from 'liquidjs';

// Product-JSON-LD der Teppiche nach Mass (Vorlage einfassung): Merkmale vom Teppichboden,
// FAQPage nur fuer die sichtbaren Fragen, LimitedAvailability bei Auslaufkollektionen -
// und dabei weder ein zweiter Product-Knoten noch ungueltiges JSON.
//
// Grenze: LiquidJS ist nicht Shopifys Liquid; image_url ist hier eine Attrappe.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tpl = readFileSync(join(root, 'snippets', 'tp-product-structured-data.liquid'), 'utf8');

const eng = new Liquid({ strictFilters: false, strictVariables: false, root: join(root, 'snippets'), extname: '.liquid' });
eng.registerTag('doc', {
  parse(tagToken, remainTokens) {
    while (remainTokens.length) {
      const t = remainTokens.shift();
      if (t.name === 'enddoc') return;
    }
  },
  render: () => '',
});
eng.registerFilter('image_url', (v) => (typeof v === 'string' ? v : '//cdn/bild.jpg'));
eng.registerFilter('json', (v) => JSON.stringify(v ?? null));

const BESCHREIBUNG = [
  '<h2>Rivena Teppich nach Maß – zugeschnitten und rundum gekettelt</h2>',
  '<p>Ihr Teppich aus dem Rivena-Teppichboden.</p>',
  '<h3>So bestellen Sie</h3><ul><li>Breite und Länge eingeben.</li></ul>',
  '<h3>Häufige Fragen</h3>',
  '<h4>Was ist der Unterschied zum Raummaß der Meterware?</h4>',
  '<p>Beim Raummaß bleiben die Kanten unversäubert.</p>',
  '<h4>Wie groß darf der Teppich sein?</h4>',
  '<p>Bis 400 cm breit und bis 600 cm lang.</p>',
  '<h4>Wie hoch ist der Flor?</h4><p>3,5&nbsp;mm.</p>',
].join('\n');

const text = (v) => ({ type: 'single_line_text_field', value: v });
const variante = (o = {}) => ({
  id: o.id ?? 1,
  title: o.title ?? 'Greige (026)',
  price: 36,
  compare_at_price: null,
  barcode: '',
  available: o.available ?? true,
  options: ['Greige (026)'],
  featured_image: null,
  metafields: { custom: {} },
});

const teppich = (o = {}) => ({
  id: 77,
  title: 'Rivena Teppich nach Maß',
  type: 'Teppich nach Maß',
  tags: o.tags ?? ['gekettelt', 'teppich-nach-mass'],
  vendor: 'TeppichParadies',
  description: o.description ?? BESCHREIBUNG,
  url: '/products/rivena-teppich-nach-mass',
  template_suffix: o.suffix ?? 'einfassung',
  images: [],
  featured_image: null,
  options: ['Farbe'],
  variants: o.variants ?? [variante({ id: 1 }), variante({ id: 2, title: 'Graphit (097)' })],
  metafields: {
    custom: { preis_pro_001_qm: { value: true }, wunschmass_mindestbreite_cm: { value: 0 } },
    service: {
      einfassung: { value: 'Ketteln' },
      einfass_basis: o.basis === null ? undefined : { value: { metafields: { custom: o.basis ?? {
        florhohe: text('3,5 mm'),
        ruckenausstattung: text('Vliesrücken'),
        fasermaterial: { type: 'list.metaobject_reference', value: [{ fasermaterial: 'Polyester' }] },
        nutzungsklassen: { type: 'list.metaobject_reference', value: [{ nutzungsklasse: 'Klasse 22 (Wohnen, normal)' }] },
      } } } },
    },
  },
});

const rendern = (p) => eng.parseAndRender(tpl, {
  product_resource: p,
  request: { origin: 'https://www.teppich-paradies.net' },
  cart: { currency: { iso_code: 'EUR' } },
  shop: { name: 'TeppichParadies' },
});

/** Alle JSON-LD-Skripte der Ausgabe, jedes muss gueltiges JSON sein. */
const knoten = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test('Teppich nach Mass: genau ein ProductGroup-Knoten, alle Skripte parsen', async () => {
  const k = knoten(await rendern(teppich()));
  assert.deepEqual(k.map((x) => x['@type']), ['ProductGroup', 'FAQPage']);
  // Product-Knoten gibt es nur als hasVariant der Gruppe - nie daneben.
  assert.equal(k.filter((x) => x['@type'] === 'Product').length, 0);
  assert.equal(k[0].hasVariant.length, 2);
  assert.ok(k[0].hasVariant.every((v) => v['@type'] === 'Product'));
  const ids = k[0].hasVariant.map((v) => v['@id']);
  assert.equal(new Set(ids).size, ids.length, 'doppelte @id');
});

test('additionalProperty traegt die Merkmale des Teppichbodens, nur belegte', async () => {
  const [gruppe] = knoten(await rendern(teppich()));
  const alsMap = Object.fromEntries(gruppe.additionalProperty.map((x) => [x.name, x.value]));
  assert.equal(alsMap.Fasermaterial, 'Polyester');
  assert.equal(alsMap['Rückenausstattung'], 'Vliesrücken');
  assert.equal(alsMap['Florhöhe'], '3,5 mm');
  assert.equal(alsMap.Nutzungsklassen, 'Klasse 22 (Wohnen, normal)');
  assert.ok(!('Fußbodenheizung' in alsMap), 'Fussbodenheizung ist nicht belegt und darf nicht erscheinen');
  for (const p of gruppe.additionalProperty) assert.equal(p['@type'], 'PropertyValue');
});

test('ohne Merkmale am Teppichboden entsteht kein additionalProperty', async () => {
  const [gruppe] = knoten(await rendern(teppich({ basis: {} })));
  assert.equal('additionalProperty' in gruppe, false);
});

test('FAQPage enthaelt genau die sichtbaren Fragen mit ihren Antworten', async () => {
  const faq = knoten(await rendern(teppich())).find((x) => x['@type'] === 'FAQPage');
  assert.equal(faq['@id'], 'https://www.teppich-paradies.net/products/rivena-teppich-nach-mass#faq');
  assert.deepEqual(faq.mainEntity.map((q) => q.name), [
    'Was ist der Unterschied zum Raummaß der Meterware?',
    'Wie groß darf der Teppich sein?',
    'Wie hoch ist der Flor?',
  ]);
  assert.deepEqual(faq.mainEntity.map((q) => q.acceptedAnswer.text), [
    'Beim Raummaß bleiben die Kanten unversäubert.',
    'Bis 400 cm breit und bis 600 cm lang.',
    '3,5 mm.',
  ]);
  for (const q of faq.mainEntity) {
    assert.equal(q['@type'], 'Question');
    assert.equal(q.acceptedAnswer['@type'], 'Answer');
  }
});

test('ohne FAQ im Text oder auf anderer Vorlage gibt es keinen FAQPage-Knoten', async () => {
  const ohne = knoten(await rendern(teppich({ description: '<h2>Titel</h2><p>Text ohne Fragen.</p>' })));
  assert.deepEqual(ohne.map((x) => x['@type']), ['ProductGroup']);
  const andere = knoten(await rendern(teppich({ suffix: 'rolle' })));
  assert.deepEqual(andere.map((x) => x['@type']), ['ProductGroup']);
});

test('Frage ohne Antwort oder Antwort ohne Frage wird ausgelassen', async () => {
  const beschreibung = '<h3>Häufige Fragen</h3><h4>Nur Frage?</h4><h4>Vollstaendig?</h4><p>Ja.</p><h4></h4><p>Antwort ohne Frage.</p>';
  const faq = knoten(await rendern(teppich({ description: beschreibung }))).find((x) => x['@type'] === 'FAQPage');
  assert.deepEqual(faq.mainEntity.map((q) => q.name), ['Vollstaendig?']);
});

test('die FAQ endet an der naechsten Ueberschrift, danach folgender Text wird nicht eingelesen', async () => {
  const beschreibung = '<h3>Häufige Fragen</h3><h4>Frage?</h4><p>Antwort.</p><h3>Versand</h3><p>Fremder Text.</p>';
  const faq = knoten(await rendern(teppich({ description: beschreibung }))).find((x) => x['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, 'Antwort.');
});

test('Anfuehrungszeichen in Frage und Antwort bleiben gueltiges JSON', async () => {
  const beschreibung = '<h3>Häufige Fragen</h3><h4>Was heißt "gekettelt"?</h4><p>Die Kante ist &quot;umnäht&quot; &amp; fest.</p>';
  const faq = knoten(await rendern(teppich({ description: beschreibung }))).find((x) => x['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity[0].name, 'Was heißt "gekettelt"?');
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, 'Die Kante ist "umnäht" & fest.');
});

test('Auslauf (Tag auslauf): lieferbar = LimitedAvailability, nicht lieferbar = OutOfStock', async () => {
  const [gruppe] = knoten(await rendern(teppich({
    tags: ['auslauf', 'gekettelt', 'teppich-nach-mass'],
    variants: [variante({ id: 1 }), variante({ id: 2, title: 'Graphit (097)', available: false })],
  })));
  assert.deepEqual(gruppe.hasVariant.map((v) => v.offers.availability), [
    'https://schema.org/LimitedAvailability',
    'https://schema.org/OutOfStock',
  ]);
});

test('ohne Tag auslauf bleibt es bei InStock', async () => {
  const [gruppe] = knoten(await rendern(teppich()));
  assert.deepEqual(gruppe.hasVariant.map((v) => v.offers.availability), [
    'https://schema.org/InStock',
    'https://schema.org/InStock',
  ]);
});

test('ohne Beispielgroesse (Farbe nicht freigegeben, keine Grenzen): Preis je m2 mit Bezugsmenge 1 m2', async () => {
  const [gruppe] = knoten(await rendern(teppich({ tags: ['auslauf'] })));
  const offer = gruppe.hasVariant[0].offers;
  assert.equal(offer.price, 36);
  assert.equal(offer.priceSpecification.price, 36);
  assert.equal(offer.priceSpecification.referenceQuantity.unitCode, 'MTK');
});

/* ─── #1283: Angebot in Beispielgroesse statt Preis je m2 ─────────────────────── */

const freigegeben = { custom: {}, service: { einfassen: { value: 'Verfügbar' } } };
const kaufbar = (o = {}) => {
  const p = teppich({ variants: [
    { ...variante({ id: 1 }), price: 85, metafields: freigegeben },
    { ...variante({ id: 2, title: 'Graphit (097)' }), price: 129, compare_at_price: o.alt ?? null, metafields: freigegeben },
  ] });
  p.metafields.service.max_breite_cm = { value: 400 };
  p.metafields.service.max_laenge_cm = { value: 600 };
  p.metafields.service.mindestpreis = { value: o.mindest ?? 99 };
  if (o.preisanker) p.metafields.aktion = { klasse: { value: 'preisanker' } };
  return p;
};
// all_products ist in Shopify global - auch in per render eingebundenen Snippets.
const rendernMass = (p, kettelOk = true) => eng.parseAndRender(tpl, {
  product_resource: p,
  request: { origin: 'https://www.teppich-paradies.net' },
  cart: { currency: { iso_code: 'EUR' } },
  shop: { name: 'TeppichParadies' },
  settings: { tp_versand_preis: '4,99 €', tp_versand_frei_ab: 50 },
}, { globals: { all_products: { kettelservice: { selected_or_first_available_variant: { available: kettelOk, price: 19 } } } } });

test('Teppich nach Mass: Angebot je Farbe als Beispielgroesse mit Endpreis und Mass im Link', async () => {
  const [gruppe] = knoten(await rendernMass(kaufbar()));
  const [sand, graphit] = gruppe.hasVariant;
  // 80 x 150 cm: 120 Einheiten x 0,85 + 460 cm Kante x 0,19 = 189,40 EUR
  assert.equal(sand.offers.price, 189.4);
  assert.equal(sand.url, 'https://www.teppich-paradies.net/products/rivena-teppich-nach-mass?variant=1&breite=80&laenge=150');
  assert.equal(sand.offers.url, sand.url);
  assert.equal(sand['@id'], `${sand.url}#variant`);
  assert.equal(sand.name, 'Rivena Teppich nach Maß - Greige (026), 80 x 150 cm');
  // 120 x 1,29 + 87,40 = 242,20 EUR
  assert.equal(graphit.offers.price, 242.2);
  // Grundpreis: Endpreis fuer 1,2 m2, bezogen auf 1 m2 - kein zweiter, abweichender Preis.
  const [grund] = sand.offers.priceSpecification;
  assert.equal(grund['@type'], 'UnitPriceSpecification');
  assert.equal(grund.price, 189.4);
  assert.equal(grund.referenceQuantity.value, 1.2);
  assert.equal(grund.referenceQuantity.unitCode, 'MTK');
  assert.equal(grund.referenceQuantity.valueReference.value, 1);
  assert.equal(grund.referenceQuantity.valueReference.unitCode, 'MTK');
  assert.equal(sand.offers.priceSpecification.length, 1, 'ohne Aktion kein Streichpreis');
  // Die Gruppe selbst bleibt die Produktseite ohne Mass.
  assert.equal(gruppe.url, 'https://www.teppich-paradies.net/products/rivena-teppich-nach-mass');
});

test('Teppich nach Mass mit Aktion: StrikethroughPrice zum alten Variantenpreis', async () => {
  const [gruppe] = knoten(await rendernMass(kaufbar({ preisanker: true, alt: 149 })));
  const graphit = gruppe.hasVariant[1];
  assert.equal(graphit.offers.price, 242.2);
  const streich = graphit.offers.priceSpecification.find((s) => s.priceType === 'https://schema.org/StrikethroughPrice');
  // 120 x 1,49 + 87,40 = 266,20 EUR
  assert.equal(streich.price, 266.2);
  assert.equal(gruppe.hasVariant[0].offers.priceSpecification.length, 1, 'Farbe ohne Vergleichspreis: kein Streichpreis');
});

test('Teppich nach Mass ohne kaufbaren Kettelservice: Preis je m2 wie bisher', async () => {
  const [gruppe] = knoten(await rendernMass(kaufbar(), false));
  const sand = gruppe.hasVariant[0];
  assert.equal(sand.offers.price, 85);
  assert.equal(sand.url, 'https://www.teppich-paradies.net/products/rivena-teppich-nach-mass?variant=1');
  assert.equal(sand.offers.priceSpecification.referenceQuantity.value, 1);
});

test('Versandfreigrenze bezieht sich auf das beworbene Beispielangebot mit Kettelung', async () => {
  const p = kaufbar({ mindest: 0 });
  p.metafields.service.lieferzeit = { value: '5–8 Werktage' };
  const [gruppe] = knoten(await rendernMass(p));
  const offer = gruppe.hasVariant[0].offers;
  assert.equal(offer.price, 189.4);
  assert.equal(offer.shippingDetails.shippingRate.value, 0, '189,40 EUR liegen ueber 50 EUR; die Mindestflaeche ist hier kein Angebot');
});
