// #1283: Zusatzfeed Teppich nach Mass (scripts/teppich-nach-mass-feed.mjs). Geprueft wird
// die Logik ohne Netz: Seite auswerten, Endpreis wie im Konfigurator nachrechnen, jede
// Abweichung als ausgelassene Zeile melden statt zu schaetzen, Feed-Formate.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  argumente, seiteAuswerten, beispielAngebote, konfiguratorPreis, zeilenFuerProdukt,
  csv, tsv, googleZeile, metaZeile, GOOGLE_SPALTEN, META_SPALTEN, adminLaden, AUS_STANDARD, katalogAusJson, feedErzeugen,
} from '../../scripts/teppich-nach-mass-feed.mjs';

const ORIGIN = 'https://www.teppich-paradies.net';

function ek(o = {}) {
  return {
    art: o.art ?? 'ketteln',
    max_breite_cm: 400,
    max_laenge_cm: 600,
    mindestpreis_cent: o.mindest ?? 9900,
    kettel: o.kettel === null ? null : { id: 9, price: 19 },
    kettel_service_failed: false,
    kante_inklusive: o.inkl ?? false,
    pauschale: null,
    pauschale_failed: false,
    zuschnitt: null,
    kg_pro_qm: 0,
    max_gewicht_kg: 0,
    varianten: [
      { id: 11, price: 85, compare_at_price: o.alt11 ?? null, available: true, max_breite_cm: 400 },
      { id: 12, price: 129, compare_at_price: null, available: o.verfuegbar12 ?? true, max_breite_cm: 400 },
      null,
    ],
  };
}

function jsonLd(angebote) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    url: `${ORIGIN}/products/rivena-teppich-nach-mass`,
    hasVariant: angebote.map((a) => ({
      '@type': 'Product',
      url: `${ORIGIN}/products/rivena-teppich-nach-mass?variant=${a.id}${a.w ? `&breite=${a.w}&laenge=${a.l}` : ''}`,
      offers: {
        '@type': 'Offer',
        url: `${ORIGIN}/products/rivena-teppich-nach-mass?variant=${a.id}${a.w ? `&breite=${a.w}&laenge=${a.l}` : ''}`,
        price: a.preis,
        priceCurrency: 'EUR',
        availability: a.available === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
        priceSpecification: a.w ? [
          { '@type': 'UnitPriceSpecification', price: a.preis },
          ...(a.alt ? [{ '@type': 'UnitPriceSpecification', priceType: 'https://schema.org/StrikethroughPrice', price: a.alt }] : []),
        ] : { '@type': 'UnitPriceSpecification', price: a.preis },
      },
    })),
  };
}

const html = (gruppe, daten) => [
  '<html><head>',
  '<script type="application/ld+json">{"@type":"Organization","name":"x"}</script>',
  `<script type="application/ld+json">${JSON.stringify(gruppe)}</script>`,
  '</head><body>',
  daten ? `<script type="application/json" data-tp-ek-daten>${JSON.stringify(daten)}</script>` : '',
  '</body></html>',
].join('\n');

const produkt = (o = {}) => ({
  id: 'gid://shopify/Product/77',
  handle: 'rivena-teppich-nach-mass',
  title: 'Rivena Teppich nach Maß',
  onlineStoreUrl: o.online === false ? null : `${ORIGIN}/products/rivena-teppich-nach-mass`,
  productType: 'Teppich nach Maß',
  status: 'ACTIVE',
  updatedAt: '2026-10-23T10:00:00Z',
  vendor: 'Teppich Paradies',
  description: 'Weich\tund\n dicht.',
  featuredMedia: { preview: { image: { url: 'https://cdn/p.jpg' } } },
  variants: [
    { id: 'gid://shopify/ProductVariant/11', price: '0.85', compareAtPrice: o.cmp11 ?? null, availableForSale: true, image: { url: 'https://cdn/v.jpg' }, selectedOptions: [{ name: 'Farbe', value: 'Greige (026)' }] },
    { id: 'gid://shopify/ProductVariant/12', price: o.preis12 ?? '1.29', compareAtPrice: null, availableForSale: o.available12 ?? true, selectedOptions: [{ name: 'Farbe', value: 'Graphit (097)' }] },
  ],
});

test('Aufruf: Standardordner ausserhalb des Repositorys, Theme nur als Zahl', () => {
  const o = argumente(['--theme', '123', '--handles', 'a, b']);
  assert.equal(o.theme, '123');
  assert.deepEqual(o.handles, ['a', 'b']);
  assert.equal(o.aus, AUS_STANDARD);
  assert.match(AUS_STANDARD, /teppich-paradies-analyse[\\/]teppich-nach-mass-feed$/);
  assert.throws(() => argumente(['--theme', 'abc']), /Theme-ID/);
  assert.throws(() => argumente(['--irgendwas', '1']), /unbekannte Option/);
});

test('Seite: ProductGroup und Konfigurator-Daten werden gefunden, fremdes JSON-LD ignoriert', () => {
  const s = seiteAuswerten(html(jsonLd([{ id: 11, w: 80, l: 150, preis: 189.4 }]), ek()));
  assert.equal(s.gruppe['@type'], 'ProductGroup');
  assert.equal(s.ek.art, 'ketteln');
  const a = beispielAngebote(s.gruppe).get('11');
  assert.deepEqual(a, { w: 80, l: 150, cent: 18940, altCent: 0, currency: 'EUR', availability: 'https://schema.org/InStock', pfad: '/products/rivena-teppich-nach-mass?variant=11&breite=80&laenge=150' });
});

test('Konfigurator-Rechnung: Material + Kante, Mindestpreis, Streichpreis wie im Konfigurator', () => {
  assert.deepEqual(konfiguratorPreis(ek(), 11, 80, 150), { summe: 18940, alt: 0, einheiten: 120, mindest: false, preis: 85, preisAlt: 0, available: true, fehler: [] });
  // Kante inklusive: nur Material, Mindestpreis 99 hebt 120 x 0,25 an.
  const inkl = konfiguratorPreis({ ...ek({ inkl: true }), varianten: [{ id: 1, price: 25, available: true, max_breite_cm: 400 }] }, 1, 80, 150);
  assert.equal(inkl.mindest, true);
  assert.equal(inkl.summe, 9900);
  // Streichpreis: 120 x 1,00 + 87,40
  assert.equal(konfiguratorPreis(ek({ alt11: 100 }), 11, 80, 150).alt, 20740);
  assert.match(konfiguratorPreis(ek(), 99, 80, 150).fehler[0], /nicht angeboten/);
  assert.ok(konfiguratorPreis(ek(), 11, 450, 500).fehler.some((f) => /höchstens 400/.test(f)));
  // Wie der Konfigurator: Mindestseite und vorgewaehlte erste Form (Codex-Review #1290).
  assert.ok(konfiguratorPreis({ ...ek(), min_seite_cm: 100 }, 11, 80, 150).fehler.some((f) => /mindestens 100/.test(f)));
  assert.deepEqual(konfiguratorPreis({ ...ek(), min_seite_cm: 100 }, 11, 120, 170).fehler, []);
  assert.ok(konfiguratorPreis({ ...ek(), formen: ['rund', 'rechteck'] }, 11, 80, 150).fehler.some((f) => /zuerst rund/.test(f)));
  assert.deepEqual(konfiguratorPreis({ ...ek(), formen: ['rechteck', 'rund'] }, 11, 80, 150).fehler, []);
});

test('Zeilen: Titel mit Mass, Endpreis, Link mit Massen, IDs wie die Apps', () => {
  const seite = seiteAuswerten(html(jsonLd([
    { id: 11, w: 80, l: 150, preis: 189.4 },
    { id: 12, w: 80, l: 150, preis: 242.2 },
  ]), ek()));
  const { zeilen, fehler } = zeilenFuerProdukt(produkt(), seite);
  assert.deepEqual(fehler, []);
  assert.equal(zeilen.length, 2);
  const [z] = zeilen;
  assert.equal(z.googleId, 'shopify_ZZ_77_11');
  assert.equal(z.metaId, '11');
  assert.equal(z.title, 'Rivena Teppich nach Maß Greige (026), 80 x 150 cm');
  assert.equal(z.price, '189.40 EUR');
  assert.equal(z.salePrice, '');
  assert.equal(z.link, `${ORIGIN}/products/rivena-teppich-nach-mass?variant=11&breite=80&laenge=150`);
  assert.deepEqual(googleZeile(z), ['shopify_ZZ_77_11', z.title, '189.40 EUR', '', z.link, '1.2 sqm', '1 sqm', 'DE:50.00 EUR', 'in_stock']);
  const meta = Object.fromEntries(META_SPALTEN.map((key, i) => [key, metaZeile(z)[i]]));
  assert.equal(meta.id, '11');
  assert.equal(meta.item_group_id, '77');
  assert.equal(meta.image_link, 'https://cdn/v.jpg');
  assert.equal(meta.price, '189.40 EUR');
  assert.equal(meta.availability, 'in stock');
  assert.equal(meta.condition, 'new');
  assert.equal(meta.brand, 'Teppich Paradies');
  assert.equal(meta.color, 'Greige (026)');
  assert.match(meta.description, /Beispielgroesse 80 x 150 cm/);
});

test('Aktion: price = Endpreis zum alten Preis, sale_price = aktueller Endpreis', () => {
  const seite = seiteAuswerten(html(jsonLd([{ id: 11, w: 80, l: 150, preis: 189.4, alt: 207.4 }, { id: 12, w: 80, l: 150, preis: 242.2 }]), ek({ alt11: 100 })));
  const { zeilen, fehler } = zeilenFuerProdukt(produkt({ cmp11: '1.00' }), seite);
  assert.deepEqual(fehler, []);
  assert.equal(zeilen[0].price, '207.40 EUR');
  assert.equal(zeilen[0].salePrice, '189.40 EUR');
});

test('fail closed: jede Abweichung laesst die Zeile aus und nennt den Grund', () => {
  const gut = [{ id: 11, w: 80, l: 150, preis: 189.4 }, { id: 12, w: 80, l: 150, preis: 242.2 }];
  const grund = (p, gruppe, daten) => zeilenFuerProdukt(p, seiteAuswerten(html(gruppe, daten))).fehler.map((f) => f.grund).join(' | ');
  // JSON-LD und Konfigurator rechnen verschieden
  assert.match(grund(produkt(), jsonLd([{ id: 11, w: 80, l: 150, preis: 190 }, gut[1]]), ek()), /JSON-LD 190\.00 EUR != Konfigurator 189\.40 EUR/);
  // altes Theme: JSON-LD ohne Beispielgroesse
  assert.match(grund(produkt(), jsonLd([{ id: 11, preis: 85 }, gut[1]]), ek()), /keine Beispielgroesse/);
  // Admin-Preis und Seite passen nicht (Seiten-Cache)
  assert.match(grund(produkt({ preis12: '1.30' }), jsonLd(gut), ek()), /Variantenpreis Admin 1\.30/);
  // Vergleichspreis in Shopify, aber keine sichtbare Aktion: die App schickte sale_price = 0,85
  assert.match(grund(produkt({ cmp11: '1.00' }), jsonLd(gut), ek()), /Vergleichspreis ohne sichtbare Aktion/);
  // Farbe nicht lieferbar: Seite zeigt keinen Preis
  assert.match(grund(produkt(), jsonLd(gut), ek({ verfuegbar12: false })), /Verfuegbarkeit/);
  // nicht im Onlineshop, keine Seite mit Konfigurator
  assert.match(grund(produkt({ online: false }), jsonLd(gut), ek()), /nicht im Onlineshop/);
  assert.match(grund(produkt(), jsonLd(gut), null), /kein Konfigurator/);
});

test('CSV quotet Kommas (Titel mit Mass), TSV bleibt einzeilig', () => {
  const zeile = ['shopify_ZZ_1_2', 'Rivena Teppich nach Maß Sand, 80 x 150 cm', '189.40 EUR', '', 'https://x/?a=1&b=2', '1.2 sqm', '1 sqm', 'DE:50.00 EUR', 'in_stock'];
  const c = csv(GOOGLE_SPALTEN, [zeile]).split('\n');
  assert.equal(c[0], 'id,title,price,sale_price,link,unit_pricing_measure,unit_pricing_base_measure,free_shipping_threshold,availability');
  assert.equal(c[1], 'shopify_ZZ_1_2,"Rivena Teppich nach Maß Sand, 80 x 150 cm",189.40 EUR,,https://x/?a=1&b=2,1.2 sqm,1 sqm,DE:50.00 EUR,in_stock');
  assert.equal(csv(['a'], [['er sagte "ja"']]).split('\n')[1], '"er sagte ""ja"""');
  assert.equal(tsv(['a', 'b'], [['x\ty', 'z']]).split('\n')[1], 'x y\tz');
});

test('Admin: Seiten werden zusammengefuehrt, auch asynchroner Proxy statt CLI', async () => {
  const antworten = {
    products: [{ nodes: [
      { id: 'P1', handle: 'b', title: 'B', productType: 'Teppich nach Maß', status: 'ACTIVE', onlineStoreUrl: 'u' },
      { id: 'P2', handle: 'a', title: 'A', productType: 'Teppich nach Maß', status: 'ACTIVE', onlineStoreUrl: 'u' },
      { id: 'P3', handle: 'c', title: 'C', productType: 'Teppichboden', status: 'ACTIVE', onlineStoreUrl: 'u' },
    ], pageInfo: { hasNextPage: false } }],
    productVariants: [
      { nodes: [{ id: 'V1', product: { id: 'P1' } }], pageInfo: { hasNextPage: true, endCursor: 'x' } },
      { nodes: [{ id: 'V2', product: { id: 'P2' } }, { id: 'V3', product: { id: 'P3' } }], pageInfo: { hasNextPage: false } },
    ],
  };
  const aufrufe = [];
  const abfrage = async (query, variables) => {
    aufrufe.push(variables);
    const feld = query.includes('productVariants') ? 'productVariants' : 'products';
    return { [feld]: antworten[feld].shift() };
  };
  const p = await adminLaden(abfrage);
  assert.deepEqual(p.map((x) => [x.handle, x.variants.map((v) => v.id)]), [['a', ['V2']], ['b', ['V1']]]);
  assert.match(aufrufe[0].q, /product_type:'Teppich nach Maß' status:active/);
  assert.equal(aufrufe[2].after, 'x');
});

test('aktiver Vergleichspreis muss auch mit dem Admin-Stand uebereinstimmen', () => {
  const s = seiteAuswerten(html(jsonLd([{ id: 11, w: 80, l: 150, preis: 189.4, alt: 267.4 }, { id: 12, w: 80, l: 150, preis: 242.2 }]), ek({ alt11: 150 })));
  const r = zeilenFuerProdukt(produkt({ cmp11: '1.00' }), s);
  assert.equal(r.zeilen.length, 1);
  assert.match(r.fehler[0].grund, /Vergleichspreis Admin/);
});

test('nicht lieferbare Farbe bleibt vollstaendig mit out of stock, niemals in stock', () => {
  const s = seiteAuswerten(html(jsonLd([{ id: 11, w: 80, l: 150, preis: 189.4 }, { id: 12, w: 80, l: 150, preis: 242.2, available: false }]), ek({ verfuegbar12: false })));
  const r = zeilenFuerProdukt(produkt({ available12: false }), s);
  assert.deepEqual(r.fehler, []);
  assert.equal(r.zeilen[1].availability, 'out_of_stock');
  assert.equal(metaZeile(r.zeilen[1])[4], 'out of stock');
  assert.equal(r.zeilen[1].imageLink, 'https://cdn/p.jpg');
});

test('gemeinsamer Rollenbestand nutzt denselben Zuschnittabgleich wie der Konfigurator', () => {
  const daten = { ...ek(), rollen: ['', '400'], zuschnitt: { failed: false, varianten: [
    { id: 31, cm: 100, price: 85, available: true },
    { id: 32, cm: 200, price: 85, available: true }, null,
  ] } };
  assert.deepEqual(konfiguratorPreis(daten, 11, 80, 150).fehler, []);
  assert.equal(konfiguratorPreis(daten, 11, 80, 150).summe, 18940);
  daten.zuschnitt.varianten[0].available = false;
  assert.match(konfiguratorPreis(daten, 11, 80, 150).fehler.join(' '), /Rollenrest reicht/);
  daten.zuschnitt.varianten[0].available = true;
  daten.zuschnitt.varianten[1].price = 0;
  assert.match(konfiguratorPreis(daten, 11, 80, 150).fehler.join(' '), /uneinheitlich/);
  daten.zuschnitt.varianten[0].price = 0;
  assert.deepEqual(konfiguratorPreis(daten, 11, 80, 150).fehler, []);
  daten.rollen.push('500');
  assert.match(konfiguratorPreis(daten, 11, 80, 150).fehler.join(' '), /nicht kaufbar/);
});

test('MCP-Katalogdatei muss vollstaendig und aktuell sein', () => {
  const now = Date.now();
  const gut = { format: 'tp-tnm-katalog-v1', complete: true, capturedAt: new Date(now).toISOString(), products: [produkt()] };
  assert.equal(katalogAusJson(JSON.stringify(gut), now).length, 1);
  assert.throws(() => katalogAusJson(JSON.stringify({ ...gut, complete: false }), now), /complete/);
  assert.throws(() => katalogAusJson(JSON.stringify({ ...gut, capturedAt: new Date(now - 31 * 60_000).toISOString() }), now), /Zeitstempel/);
});

test('gemeinsamer Builder meldet fehlende Beispielgroesse und unvollstaendige Meta-Zeile', async () => {
  const s = seiteAuswerten(html(jsonLd([{ id: 11, w: 80, l: 150, preis: 189.4 }]), ek()));
  const p = produkt();
  p.featuredMedia = null;
  p.variants[0].image = null;
  const r = await feedErzeugen([p], { laden: async () => s });
  assert.equal(r.zeilen.length, 0);
  assert.equal(r.pruefung.ausgelassen.length, 2);
  assert.match(r.pruefung.ausgelassen[0].grund, /Bild fehlt/);
});
