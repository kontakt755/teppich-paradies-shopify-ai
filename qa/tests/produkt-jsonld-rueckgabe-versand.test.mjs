// Rueckgabe- und Versandangaben im Product-JSON-LD (Werkbank w-117).
//
// Quellen und Freigabetabelle: docs/weiterentwicklung/produkt-json-ld-rueckgabe-versand.md
// - Rueckgabe aus der Widerrufsbelehrung: 14 Tage, Kunde traegt die
//   Ruecksendekosten; Zuschnitt und Anfertigung nach Kundenwunsch sind
//   ausgeschlossen (Mass-Ware, Laengenware nach Mass, Rollenware).
// - Versand aus settings.tp_versand_preis / tp_versand_frei_ab, Lieferzeit
//   aus derselben Quelle wie snippets/tp-lieferzeit.
//
// Grenze: LiquidJS ist nicht Shopifys Liquid; image_url ist eine Attrappe.
// Geprueft werden Struktur, Werte und gueltiges JSON, nicht das Rendering.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Liquid } from 'liquidjs';

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

const EINSTELLUNGEN = { tp_versand_preis: '4,99 €', tp_versand_frei_ab: 50, tp_lieferzeit_sonderposten: '5–7 Werktage' };

const variante = (o = {}) => ({
  id: o.id ?? 1,
  title: o.title ?? 'Grau',
  price: o.price ?? 2999,
  barcode: '',
  available: true,
  requires_shipping: o.versand ?? true,
  options: o.options ?? ['Grau'],
  featured_image: null,
  metafields: { custom: { rollenbreite: { value: o.rollenbreite ?? null } } },
});

const produkt = (o = {}) => ({
  id: 42,
  title: o.title ?? 'Beispielprodukt',
  type: o.type ?? 'Zubehör',
  tags: o.tags ?? [],
  vendor: 'TeppichParadies',
  description: 'Beschreibung',
  url: '/products/beispiel',
  template_suffix: o.suffix ?? 'zubehoer',
  images: [],
  featured_image: null,
  options: ['Farbe'],
  'gift_card?': o.gutschein ?? false,
  variants: o.variants ?? [variante()],
  metafields: {
    custom: {
      qm_pro_paket: { value: o.qm ?? null },
      preis_pro_001_qm: { value: o.per001 ?? false },
      preis_pro_001_lfm: { value: o.lfm ?? false },
      wunschmass_mindestbreite_cm: { value: null },
    },
    service: { lieferzeit: { value: o.lieferzeit ?? null } },
  },
});

const rendern = (p, o = {}) => eng.parseAndRender(tpl, {
  product_resource: p,
  request: { origin: 'https://www.teppich-paradies.net' },
  cart: { currency: { iso_code: o.waehrung ?? 'EUR' } },
  shop: { name: 'TeppichParadies' },
  settings: o.settings ?? EINSTELLUNGEN,
});

/** Alle JSON-LD-Skripte der Ausgabe - jedes muss gueltiges JSON sein. */
const knoten = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const offers = async (p, o) => knoten(await rendern(p, o))[0].hasVariant.map((v) => v.offers);

const FRIST = 'https://schema.org/MerchantReturnFiniteReturnWindow';
const AUSGESCHLOSSEN = 'https://schema.org/MerchantReturnNotPermitted';

test('Festpreisware: 14 Tage, per Post, Kunde traegt die Ruecksendekosten', async () => {
  const [offer] = await offers(produkt());
  assert.deepEqual(offer.hasMerchantReturnPolicy, {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: 'DE',
    returnPolicyCategory: FRIST,
    merchantReturnDays: 14,
    returnMethod: 'https://schema.org/ReturnByMail',
    returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
  });
  // ReturnFeesCustomerResponsibility verlangt laut Google KEINEN Betrag.
  assert.ok(!('returnShippingFeesAmount' in offer.hasMerchantReturnPolicy));
});

test('Paketware behaelt die Frist (Standardware, kein Zuschnitt)', async () => {
  const [offer] = await offers(produkt({ qm: 1.73, suffix: 'planken', type: 'Klickvinyl', variants: [variante({ price: 7180 })] }));
  assert.equal(offer.hasMerchantReturnPolicy.returnPolicyCategory, FRIST);
});

test('Zuschnitt und Anfertigung nach Kundenwunsch: kein Rueckgaberecht', async () => {
  const faelle = [
    produkt({ per001: true, suffix: 'einfassung', type: 'Teppich nach Maß', variants: [variante({ price: 42 })] }),
    produkt({ lfm: true, suffix: 'treppenkante-nach-mass', type: 'Abschlussprofile', variants: [variante({ price: 30 })] }),
    produkt({ suffix: 'rolle', type: 'Teppichboden', variants: [variante({ rollenbreite: 4, options: ['Grau', '400 cm'] })] }),
  ];
  for (const p of faelle) {
    const [offer] = await offers(p);
    assert.deepEqual(offer.hasMerchantReturnPolicy, {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'DE',
      returnPolicyCategory: AUSGESCHLOSSEN,
    }, p.type);
  }
});

test('Paketware mit Rollenbreite an der Variante bleibt Paketware (Frist)', async () => {
  const [offer] = await offers(produkt({ qm: 2, variants: [variante({ rollenbreite: 4, price: 9000 })] }));
  assert.equal(offer.hasMerchantReturnPolicy.returnPolicyCategory, FRIST);
});

test('Versand: unter der Schwelle die Versandkosten, ab der Schwelle 0', async () => {
  const [billig, teuer, grenze] = await offers(produkt({ variants: [
    variante({ id: 1, price: 2999 }),
    variante({ id: 2, title: 'Blau', price: 7180 }),
    variante({ id: 3, title: 'Rot', price: 5000 }),
  ] }));
  assert.deepEqual(billig.shippingDetails, {
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: 4.99, currency: 'EUR' },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'DE' },
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      transitTime: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 5, unitCode: 'DAY' },
    },
  });
  assert.equal(teuer.shippingDetails.shippingRate.value, 0);
  assert.equal(grenze.shippingDetails.shippingRate.value, 0, 'ab 50 EUR heisst einschliesslich 50 EUR');
});

test('Paketware: es zaehlt der Paketpreis, nicht der m2-Preis', async () => {
  // 71,80 EUR je Paket / 1,73 m2 = 41,50 EUR/m2 - das Paket liegt ueber der Schwelle.
  const [offer] = await offers(produkt({ qm: 1.73, suffix: 'planken', variants: [variante({ price: 7180 })] }));
  assert.equal(offer.price, 71.8);
  assert.equal(offer.shippingDetails.shippingRate.value, 0);
});

test('Rollenware: Mindestzuschnitt 1 m (bzw. Mindestlaenge) ueber die Rollenbreite', async () => {
  const rolle = (o) => produkt({ suffix: 'rolle', type: 'Teppichboden', ...o });
  // 29,95 EUR/m2 x 4 m x 1 m = 119,80 EUR -> versandfrei
  const [breit] = await offers(rolle({ variants: [variante({ price: 2995, rollenbreite: 4 })] }));
  assert.equal(breit.shippingDetails.shippingRate.value, 0);
  // 9,95 EUR/m2 x 2 m x 1 m = 19,90 EUR -> Versandkosten
  const [schmal] = await offers(rolle({ variants: [variante({ price: 995, rollenbreite: 2 })] }));
  assert.equal(schmal.shippingDetails.shippingRate.value, 4.99);
  // Mindestlaenge 5 lfm: 9,95 x 2 x 5 = 99,50 EUR -> versandfrei
  const p = rolle({ variants: [variante({ price: 995, rollenbreite: 2 })] });
  p.metafields.custom.mindestlaenge_lfm = { value: 5 };
  const [lang] = await offers(p);
  assert.equal(lang.shippingDetails.shippingRate.value, 0);
});

test('Mass-Ware: Mindestseite und Mindestpreis wie im Konfigurator', async () => {
  const mass = (o = {}) => {
    const p = produkt({ per001: true, suffix: 'einfassung', lieferzeit: 'ca. 5–8 Werktage inkl. Ketteln', variants: [variante({ price: o.preis ?? 89 })] });
    if (o.mindestpreis !== undefined) p.metafields.service.mindestpreis = { value: o.mindestpreis };
    if (o.seite !== undefined) p.metafields.service.min_seite_cm = { value: o.seite };
    return p;
  };
  // 89 EUR/m2, Mindestseite 50 cm -> 0,25 m2 = 22,25 EUR -> Versandkosten
  const [klein] = await offers(mass());
  assert.equal(klein.price, 89);
  assert.equal(klein.shippingDetails.shippingRate.value, 4.99);
  assert.deepEqual(
    [klein.shippingDetails.deliveryTime.transitTime.minValue, klein.shippingDetails.deliveryTime.transitTime.maxValue],
    [5, 8],
  );
  // Mindestpreis 79 EUR -> versandfrei
  const [mp] = await offers(mass({ mindestpreis: 79 }));
  assert.equal(mp.shippingDetails.shippingRate.value, 0);
  // Mindestseite 80 cm -> 0,64 m2 x 89 = 56,96 EUR -> versandfrei
  const [seite] = await offers(mass({ seite: 80 }));
  assert.equal(seite.shippingDetails.shippingRate.value, 0);
});

test('Lieferzeit: Metafeld vor Sonderposten-Einstellung vor Vorlage', async () => {
  const zeit = async (p) => {
    const [o] = await offers(p);
    return o.shippingDetails && [o.shippingDetails.deliveryTime.transitTime.minValue, o.shippingDetails.deliveryTime.transitTime.maxValue];
  };
  assert.deepEqual(await zeit(produkt({ suffix: 'rolle', lieferzeit: '5–7 Werktage' })), [5, 7]);
  assert.deepEqual(await zeit(produkt({ suffix: 'rolle' })), [2, 5]);
  assert.deepEqual(await zeit(produkt({ suffix: 'teppich' })), [3, 5]);
  assert.deepEqual(await zeit(produkt({ suffix: '' })), [5, 7]);
  assert.deepEqual(await zeit(produkt({ suffix: 'sonderposten', tags: ['sonderposten'] })), [5, 7]);
  assert.deepEqual(await zeit(produkt({ suffix: 'zubehoer', lieferzeit: '3 Werktage' })), [3, 3]);
});

test('Bearbeitungszeit: handlingTime nur mit Einstellung, Summe bleibt die Lieferzeit', async () => {
  const zeiten = async (p, bearbeitung) => {
    const settings = bearbeitung === undefined ? EINSTELLUNGEN : { ...EINSTELLUNGEN, tp_versand_bearbeitungszeit: bearbeitung };
    const [o] = await offers(p, { settings });
    const d = o.shippingDetails.deliveryTime;
    const spanne = (q) => q && [q.minValue, q.maxValue];
    return { bearbeitung: spanne(d.handlingTime), transport: spanne(d.transitTime) };
  };
  // Ohne Eintrag wie bisher: nur die Gesamtzeit als transitTime.
  assert.deepEqual(await zeiten(produkt({ suffix: 'rolle' })), { bearbeitung: undefined, transport: [2, 5] });
  assert.deepEqual(await zeiten(produkt({ suffix: 'rolle' }), ''), { bearbeitung: undefined, transport: [2, 5] });
  // Mit Eintrag: Transport = Lieferzeit minus Bearbeitung je Grenze.
  assert.deepEqual(await zeiten(produkt({ suffix: 'rolle' }), '1–2 Werktage'), { bearbeitung: [1, 2], transport: [1, 3] });
  assert.deepEqual(await zeiten(produkt({ suffix: 'teppich' }), '1-2 Werktage'), { bearbeitung: [1, 2], transport: [2, 3] });
  assert.deepEqual(await zeiten(produkt({ suffix: 'zubehoer', lieferzeit: 'ca. 5–8 Werktage inkl. Ketteln' }), '1 Werktag'), { bearbeitung: [1, 1], transport: [4, 7] });
  assert.deepEqual(await zeiten(produkt({ suffix: 'rolle' }), '0–1 Werktage'), { bearbeitung: [0, 1], transport: [2, 4] });
  // Laenger als die Lieferzeit oder unlesbar: keine Aufteilung (fail closed).
  assert.deepEqual(await zeiten(produkt({ suffix: 'zubehoer', lieferzeit: '3 Werktage' }), '3–4 Werktage'), { bearbeitung: undefined, transport: [3, 3] });
  assert.deepEqual(await zeiten(produkt({ suffix: 'rolle' }), 'morgen'), { bearbeitung: undefined, transport: [2, 5] });
  assert.deepEqual(await zeiten(produkt({ suffix: 'rolle' }), '2 Tage'), { bearbeitung: undefined, transport: [2, 5] });
  // Vertauschte Spanne ("2–1") waere ein ungueltiges handlingTime (min > max).
  assert.deepEqual(await zeiten(produkt({ suffix: 'rolle' }), '2–1 Werktage'), { bearbeitung: undefined, transport: [2, 5] });
});

test('Bearbeitungszeit allein erzeugt kein shippingDetails', async () => {
  const settings = { ...EINSTELLUNGEN, tp_versand_bearbeitungszeit: '1 Werktag' };
  const [offer] = await offers(produkt({ per001: true, suffix: 'wunschmass-fertig' }), { settings });
  assert.ok(!('shippingDetails' in offer));
});

test('Ohne Werktage-Spanne kein shippingDetails, Rueckgabe bleibt', async () => {
  for (const p of [
    produkt({ per001: true, suffix: 'wunschmass-fertig' }), // "ca. 14 Tage" sind Kalendertage
    produkt({ per001: true, suffix: 'matte-nach-mass' }),
    produkt({ suffix: 'wohnteppich' }), // Vorlage zeigt keine Lieferzeit
    produkt({ suffix: 'zubehoer', lieferzeit: '2–3 Wochen, Muster in 2 Werktagen' }),
  ]) {
    const [offer] = await offers(p);
    assert.ok(!('shippingDetails' in offer), `${p.template_suffix}: shippingDetails ohne belegte Werktage`);
    assert.ok(offer.hasMerchantReturnPolicy, `${p.template_suffix}: Rueckgabe fehlt`);
  }
});

test('Fail closed: fremde Waehrung, unlesbare Versandkosten, kein Versand', async () => {
  const [usd] = await offers(produkt(), { waehrung: 'USD' });
  assert.ok(!('shippingDetails' in usd));
  const [kaputt] = await offers(produkt(), { settings: { ...EINSTELLUNGEN, tp_versand_preis: 'auf Anfrage' } });
  assert.ok(!('shippingDetails' in kaputt));
  const [ohne] = await offers(produkt({ variants: [variante({ versand: false })] }));
  assert.ok(!('shippingDetails' in ohne));
});

test('Geschenkgutschein: weder Rueckgabe- noch Versandangabe', async () => {
  const [offer] = await offers(produkt({ gutschein: true, type: 'Geschenkgutschein', variants: [variante({ price: 5000 })] }));
  assert.ok(!('hasMerchantReturnPolicy' in offer));
  assert.ok(!('shippingDetails' in offer));
});

test('Service- und Musterprodukte bleiben ohne JSON-LD', async () => {
  for (const type of ['Musterservice', 'Service']) {
    const html = await rendern(produkt({ type, variants: [variante({ price: 0 })] }));
    assert.equal(knoten(html).length, 0, type);
  }
});

// Die Vorlagenwerte der Lieferzeit stehen als Block-Einstellung in
// templates/product*.json. Das Snippet fuehrt sie je template_suffix nach -
// dieser Test faellt, sobald eine Vorlage etwas anderes zeigt als das Markup.
const LIEFERZEIT_BLOECKE = {
  'tp-service-links': 'delivery_time',
  'tp-teppich-versand': 'delivery_time',
  'tp-rollware-rechner': 'lieferzeit',
};

function schemaStandard(block, id) {
  const quelle = readFileSync(join(root, 'blocks', `${block}.liquid`), 'utf8');
  const schema = JSON.parse(quelle.split('{% schema %}')[1].split('{% endschema %}')[0]);
  return (schema.settings || []).find((s) => s.id === id)?.default ?? '';
}

function vorlagenLieferzeiten(datei) {
  const roh = readFileSync(join(root, 'templates', datei), 'utf8').replace(/^\s*\/\*[\s\S]*?\*\//, '');
  const vorlage = JSON.parse(roh);
  const werte = new Set();
  const laufen = (bloecke) => {
    for (const b of Object.values(bloecke || {})) {
      const id = LIEFERZEIT_BLOECKE[b.type];
      if (id && !b.disabled) {
        const wert = (b.settings && id in b.settings ? b.settings[id] : schemaStandard(b.type, id)) || '';
        if (wert.trim()) werte.add(wert.trim());
      }
      laufen(b.blocks);
    }
  };
  for (const s of Object.values(vorlage.sections || {})) laufen(s.blocks);
  return [...werte];
}

function werktage(text) {
  const m = /^(?:ca\.\s*)?(\d+)(?:\s*[–-]\s*(\d+))?\s*werktag/i.exec(text.trim());
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null;
}

test('Lieferzeit je Vorlage stimmt mit templates/product*.json ueberein', async () => {
  const dateien = readdirSync(join(root, 'templates')).filter((f) => /^product(\..+)?\.json$/.test(f));
  assert.ok(dateien.length > 5, 'keine Produktvorlagen gefunden');
  for (const datei of dateien) {
    const suffix = datei === 'product.json' ? '' : datei.slice('product.'.length, -'.json'.length);
    const werte = vorlagenLieferzeiten(datei);
    assert.ok(werte.length <= 1, `${datei}: mehrere Lieferzeiten sichtbar (${werte.join(' / ')})`);
    const erwartet = werte.length ? werktage(werte[0]) : null;
    const [offer] = await offers(produkt({ suffix }));
    const ist = offer.shippingDetails
      ? [offer.shippingDetails.deliveryTime.transitTime.minValue, offer.shippingDetails.deliveryTime.transitTime.maxValue]
      : null;
    assert.deepEqual(ist, erwartet, `${datei}: Vorlage zeigt ${JSON.stringify(werte)}, Markup sagt ${JSON.stringify(ist)}`);
  }
});
