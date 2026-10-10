import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLineItem, metafeldMap, propertiesMap, parseMasse, grosshaendlerId, masspruefung } from '../lib/resolve.mjs';
import { UNGEKLAERT } from '../lib/umrechnung.mjs';

const mf = (namespace, key, value) => ({ namespace, key, value });

const varianteVoll = {
  id: 'gid://shopify/ProductVariant/1',
  sku: 'CVEXPGR04_333',
  metafields: [
    mf('einkauf', 'procurement_id', 'TP-A-CVEXPGR04-333-400'),
    mf('einkauf', 'lieferant', 'A'),
    mf('einkauf', 'artikelnummer', 'CVEXPGR04_333'),
    mf('einkauf', 'farbnummer', '333'),
    mf('einkauf', 'bestelleinheit', 'lfm'),
    mf('einkauf', 'route', 'SUPPLIER_TO_TP'),
    mf('einkauf', 'neutralversand', 'VERIFIED'),
    mf('lieferant', 'lieferant_a_artikelnummer', 'A-ART-333'),
  ],
  product: {
    id: 'gid://shopify/Product/1', handle: 'testboden',
    metafields: [mf('custom', 'rollenbreite', '4'), mf('custom', 'preis_pro_001_qm', 'true'), mf('grosshandel', 'sku', 'GH-FREITEXT')],
  },
};

test('einkauf.* und custom.* werden gelesen, Grosshaendler-ID aus einkauf.artikelnummer', () => {
  const r = resolveLineItem({
    lineItem: { id: 'li1', sku: 'CVEXPGR04_333', quantity: 1102, customAttributes: [
      { key: 'Art', value: 'Raummaß' }, { key: 'Ihre Breite', value: '365 cm' }, { key: 'Aus Rolle', value: '400 cm' },
      { key: 'Gewünschte Länge', value: '302 cm' }, { key: 'Fläche', value: '11,02 m²' }, { key: 'Farbnummer', value: '333' },
    ] },
    variant: varianteVoll,
  });
  assert.equal(r.einkauf.procurement_id, 'TP-A-CVEXPGR04-333-400');
  assert.equal(r.einkauf.lieferant, 'A');
  assert.equal(r.einkauf.bestelleinheit, 'lfm');
  assert.equal(r.einkauf.hersteller, UNGEKLAERT);
  assert.equal(r.einkauf.muster_quelle, UNGEKLAERT);
  assert.equal(r.produkt.rollenbreite, 4);
  assert.equal(r.produkt.qm_pro_paket, UNGEKLAERT);
  assert.equal(r.produkt.preis_pro_001_qm, true);
  // Die Variante traegt beides; das gepflegte Einkaufsfeld geht vor.
  assert.equal(r.grosshaendlerId, 'CVEXPGR04_333');
  assert.equal(r.grosshaendlerIdQuelle, 'einkauf.artikelnummer');
  assert.equal(r.eingaben.ausRolleCm, 400);
  assert.equal(r.eingaben.gewuenschteLaengeCm, 302);
  assert.equal(r.eingaben.ihreBreiteCm, 365);
  assert.equal(r.eingaben.flaecheText, '11,02 m²');
  // 365 x 302 = 110230 cm2 -> (110230 + 50) / 100 = 1102 (kaufmaennisch wie der Rollenrechner)
  assert.equal(r.masspruefung.status, 'ok');
  assert.equal(r.masspruefung.soll, 1102);
  assert.equal(r.istMuster, false);
});

test('Grosshaendler-ID-Kaskade: einkauf -> A -> B -> grosshandel.sku -> Muster-SKU -> UNGEKLAERT', () => {
  assert.equal(grosshaendlerId({ variantMetafelder: { einkauf: { artikelnummer: 'E1' }, lieferant: { lieferant_a_artikelnummer: 'A1' } } }).id, 'E1');
  assert.equal(grosshaendlerId({ variantMetafelder: { einkauf: { artikelnummer: '' }, lieferant: { lieferant_a_artikelnummer: 'A1' } } }).id, 'A1');
  assert.equal(grosshaendlerId({ variantMetafelder: { lieferant: { lieferant_a_artikelnummer: '', lieferant_b_artikelnummer: 'B1' } } }).id, 'B1');
  assert.equal(grosshaendlerId({ variantMetafelder: {}, produktMetafelder: { grosshandel: { sku: 'GH' } } }).id, 'GH');
  assert.equal(grosshaendlerId({ variantMetafelder: {}, produktMetafelder: {}, sku: 'M-CVEXPGR04_333' }).id, 'CVEXPGR04_333');
  // Handle-Slug mit Bindestrich ist keine Artikelnummer
  assert.equal(grosshaendlerId({ variantMetafelder: {}, produktMetafelder: {}, sku: 'M-test-handle' }).id, UNGEKLAERT);
  assert.equal(grosshaendlerId({ sku: 'X' }).id, UNGEKLAERT);
});

test('Masspruefung: Property Flaeche wird nie geglaubt, nur zu wenig wird gemeldet', () => {
  // Masse 250 x 350 cm = 87500 cm2 -> 875 Einheiten (0,01 m2); Flaeche behauptet 1 m2
  const props = { 'Maße': '250 × 350 cm', 'Fläche': '1,00 m²' };
  assert.equal(masspruefung({ props, quantity: 875, hundertstel: true }).status, 'ok');
  assert.equal(masspruefung({ props, quantity: 874, hundertstel: true }).status, 'abweichung');
  // Mindestpreis hebt Menge: mehr ist in Ordnung
  assert.equal(masspruefung({ props, quantity: 2000, hundertstel: true }).status, 'ok');
  // ganze m2: 8,75 -> 9
  const ganz = masspruefung({ props, quantity: 9, hundertstel: false });
  assert.equal(ganz.status, 'ok');
  assert.equal(ganz.soll, 9);
  assert.equal(masspruefung({ props, quantity: 8, hundertstel: false }).status, 'abweichung');
});

test('Masspruefung: Rund/Oval, Fussleiste, Kettelkante ueber _Gruppe, Auffangregel', () => {
  // Wunschmass rund Durchmesser 200: 40000*355/45200 = 314 - 1 = 313
  assert.equal(masspruefung({ props: { Durchmesser: '200 cm', Form: 'Rund' }, quantity: 313, hundertstel: true }).soll, 313);
  // Fussleiste 12,3 m -> 13 volle Meter
  const fl = masspruefung({ props: { 'Zu Teppichboden': 'Testboden', 'Länge': '12,3 m' }, quantity: 12, hundertstel: false });
  assert.equal(fl.status, 'abweichung');
  assert.equal(fl.soll, 13);
  // Kettelkante: Hauptzeile 200 x 300 -> Umfang 1000 cm, 1 cm Spiel
  const haupt = { properties: [{ key: 'Maße', value: '200 × 300 cm' }, { key: '_Gruppe', value: 'G1' }] };
  const kante = { props: { 'Kante umlaufend': 'ja', _Gruppe: 'G1' }, quantity: 999, hundertstel: false, alleZeilen: [haupt] };
  assert.equal(masspruefung(kante).status, 'ok');
  assert.equal(masspruefung({ ...kante, quantity: 998 }).status, 'abweichung');
  assert.equal(masspruefung({ ...kante, alleZeilen: [] }).status, 'waise');
  // 0,01-m2-Produkt ohne Mass ist unlesbar
  assert.equal(masspruefung({ props: {}, quantity: 5, hundertstel: true }).status, 'unlesbar');
  assert.equal(masspruefung({ props: {}, quantity: 5, hundertstel: false }).status, '');
});

test('Musterzeile: Quellvariante aus Property, wenn einkauf.quellvariante fehlt', () => {
  const r = resolveLineItem({
    lineItem: { id: 'li2', sku: 'M-CVEXPGR04_333', quantity: 1, customAttributes: [
      { key: '_Muster_ID', value: 'testboden::Farbe 333' }, { key: '_Quellvariante_ID', value: '12345' },
    ] },
    variant: { id: 'gid://shopify/ProductVariant/9', sku: 'M-CVEXPGR04_333', metafields: [], product: { id: 'p', handle: 'muster-testboden', metafields: [] } },
  });
  assert.equal(r.istMuster, true);
  assert.equal(r.einkauf.quellvariante, '12345');
  assert.equal(r.einkauf.quellvariante_quelle, 'property:_Quellvariante_ID');
  assert.equal(r.einkauf.muster_quelle, UNGEKLAERT);
  assert.equal(r.grosshaendlerId, 'CVEXPGR04_333');
  assert.equal(r.masspruefung.status, '');
});

test('Paketware-Properties und fehlende Variante -> alles UNGEKLAERT, nichts geraten', () => {
  const r = resolveLineItem({ lineItem: { sku: 'PAKET_1', quantity: 16, customAttributes: [{ key: '_bedarf_qm', value: '34,20' }, { key: '_pakete', value: '16' }] } });
  assert.equal(r.eingaben.bedarfQm, 34.2);
  assert.equal(r.eingaben.pakete, 16);
  assert.equal(r.variantId, UNGEKLAERT);
  assert.equal(r.einkauf.lieferant, UNGEKLAERT);
  assert.equal(r.einkauf.neutralversand, 'UNKNOWN');
  assert.equal(r.produkt.qm_pro_paket, UNGEKLAERT);
  assert.equal(r.grosshaendlerId, UNGEKLAERT);
});

test('Hilfsfunktionen: metafeldMap, propertiesMap, parseMasse', () => {
  assert.deepEqual(metafeldMap({ nodes: [mf('a', 'b', 'c')] }), { a: { b: 'c' } });
  assert.deepEqual(metafeldMap({ edges: [{ node: mf('a', 'b', 'c') }] }), { a: { b: 'c' } });
  assert.deepEqual(metafeldMap({ a: { b: 'c' } }), { a: { b: 'c' } });
  assert.deepEqual(propertiesMap([['k', 'v']]), { k: 'v' });
  assert.deepEqual(propertiesMap([{ name: 'k', value: 'v' }]), { k: 'v' });
  assert.deepEqual(parseMasse('250 × 350 cm'), { w: 250, l: 350 });
  assert.deepEqual(parseMasse('Ø 200 cm'), { w: 200, l: 200 });
  assert.equal(parseMasse(''), null);
  assert.throws(() => resolveLineItem({}), /lineItem fehlt/);
});

// Gemeinsamer Rollenbestand (Inhaber 10.10.2026): Rollenware als Bundle-Komponente
// (lineItemGroup) unter "Zuschnitt von der Rolle", Teppich nach Mass mit
// custom.zuschnitt_von_rolle. Nachbau der Pruefung in der internen Bestellmail.
const rolleVariante = {
  id: 'gid://shopify/ProductVariant/61140136821070', sku: 'Y-ROLLE',
  metafields: [mf('custom', 'rollenbreite', '4.0')],
  product: { id: 'gid://shopify/Product/16132122444110', handle: 'yasmin-rolle', metafields: [mf('custom', 'max_roll_laenge_cm', '2000')] },
};
const massVariante = {
  id: 'gid://shopify/ProductVariant/61140136984910', sku: 'Y-MASS', metafields: [],
  product: { id: 'gid://shopify/Product/16132122575182', handle: 'yasmin-mass', metafields: [mf('custom', 'preis_pro_001_qm', 'true'), mf('custom', 'zuschnitt_von_rolle', 'gid://shopify/Product/16134901629262')] },
};
const yTeppich = (masse = '200 × 300 cm', menge = 600) => ({ id: 't', sku: 'Y-MASS', quantity: menge, variant: massVariante, customAttributes: [
  { key: 'Maße', value: masse }, { key: '_Gruppe', value: 'Y1' }, { key: '_Zuschnitt aus Rolle', value: '400 cm' }, { key: '_Rollenzuschnitt', value: '200' }] });
const yKomponente = (menge = 8) => ({ id: 'k', sku: 'Y-ROLLE', quantity: menge, variant: rolleVariante, customAttributes: [],
  lineItemGroup: { id: 'gid://shopify/LineItemGroup/1', title: 'Zuschnitt von der Rolle – Passion Yasmin Anthrazit', quantity: 1, customAttributes: [] } });
const aufloesen = (zeilen) => zeilen.map(li => resolveLineItem({ lineItem: li, variant: li.variant, alleZeilen: zeilen }));

test('Rollenbestand: Komponente ist Bestandsabgang, Teppich mit passendem Abgang ist ok', () => {
  const [t, k] = aufloesen([yTeppich(), yKomponente(8)]);
  assert.equal(k.masspruefung.status, 'bestand');
  assert.match(k.masspruefung.hinweis, /nicht separat zuschneiden/);
  assert.deepEqual(k.bundle, { titel: 'Zuschnitt von der Rolle – Passion Yasmin Anthrazit', menge: 1 });
  assert.equal(t.masspruefung.status, 'ok');
  assert.match(t.masspruefung.hinweis, /8 m² abgebucht/);
  assert.equal(t.bundle, null);
});

test('Rollenbestand: 2,5 x 7 m braucht 28, 201 x 301 braucht 9 Einheiten', () => {
  assert.equal(aufloesen([yTeppich('250 × 700 cm', 1750), yKomponente(28)])[0].masspruefung.status, 'ok');
  assert.equal(aufloesen([yTeppich('250 × 700 cm', 1750), yKomponente(27)])[0].masspruefung.status, 'abweichung');
  assert.equal(aufloesen([yTeppich('201 × 301 cm', 606), yKomponente(9)])[0].masspruefung.status, 'ok');
});

test('Rollenbestand: fehlende oder zu kleine Komponente ist eine Abweichung', () => {
  const [ohne] = aufloesen([yTeppich()]);
  assert.equal(ohne.masspruefung.status, 'abweichung');
  assert.match(ohne.masspruefung.hinweis, /noetig 8 m², abgebucht 0/);
  assert.equal(aufloesen([yTeppich(), yKomponente(7)])[0].masspruefung.status, 'abweichung');
});

test('Rollenbestand: Teppich nach Mass ohne Verweis bleibt bei der Flaechenpruefung', () => {
  const normal = { ...yTeppich(), variant: { ...massVariante, product: { ...massVariante.product, metafields: [mf('custom', 'preis_pro_001_qm', 'true')] } } };
  const r = resolveLineItem({ lineItem: normal, variant: normal.variant, alleZeilen: [normal] });
  assert.equal(r.masspruefung.status, 'ok');
  assert.equal(r.masspruefung.hinweis, undefined);
});
