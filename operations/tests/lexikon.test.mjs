import test from 'node:test';
import assert from 'node:assert/strict';
import { aufbereiten, suche, normalisieren } from '../lib/lexikon.mjs';

const JETZT = new Date('2026-09-23T12:00:00Z');

function produkt(overrides = {}) {
  return {
    id: 'gid://shopify/Product/9001',
    handle: 'nordsee-teppich',
    title: 'Nordsee Teppich Grün 200x300',
    status: 'ACTIVE',
    templateSuffix: null,
    productType: 'Teppichboden',
    featuredImage: { url: 'https://cdn.example/nordsee.jpg' },
    metafields: [
      { namespace: 'custom', key: 'material', value: { name: 'Wolle' } },
      { namespace: 'custom', key: 'rollenbreite', value: '400' },
    ],
    variants: [
      {
        id: 'gid://shopify/ProductVariant/5001',
        title: 'Grün / 200x300',
        sku: 'NS-200-GR',
        price: '129.90',
        availableForSale: true,
        selectedOptions: [{ name: 'Farbe', value: 'Grün' }],
        metafields: [
          { namespace: 'einkauf', key: 'lieferant', value: { kuerzel: 'A' } },
          { namespace: 'einkauf', key: 'artikelnummer', value: 'ART-4711' },
          { namespace: 'einkauf', key: 'farbnummer', value: 'FB-33' },
          { namespace: 'einkauf', key: 'lieferant_produktname', value: 'Ostseewelle' },
          { namespace: 'einkauf', key: 'lieferant_url', value: 'https://lieferant-a.example/produkt/ostseewelle' },
          { namespace: 'einkauf', key: 'lieferant_kollektion', value: 'Meereswelten' },
          { namespace: 'einkauf', key: 'hersteller', value: 'Herstellwerk Nord' },
          { namespace: 'einkauf', key: 'bestelleinheit', value: 'm2' },
          { namespace: 'einkauf', key: 'procurement_id', value: 'TP-A-4711-33-400' },
        ],
      },
    ],
    ...overrides,
  };
}

test('aufbereiten baut das verbindliche Format', () => {
  const modell = aufbereiten({ produkte: [produkt()] }, { jetzt: JETZT });
  assert.equal(modell.erstellt, JETZT.toISOString());
  assert.equal(modell.anzahl, 1);
  const p = modell.produkte[0];
  assert.equal(p.handle, 'nordsee-teppich');
  assert.equal(p.titel, 'Nordsee Teppich Grün 200x300');
  assert.equal(p.shopUrl, 'https://www.teppich-paradies.net/products/nordsee-teppich');
  assert.equal(p.adminUrl, 'https://admin.shopify.com/store/sjjyq1-6w/products/9001');
  assert.equal(p.status, 'ACTIVE');
  assert.equal(p.produktgruppe, 'Teppichboden');
  assert.equal(p.bild, 'https://cdn.example/nordsee.jpg');
  assert.equal(p.eigenschaften.material, 'Wolle');
  assert.equal(p.eigenschaften.rollenbreite, '400');
  assert.deepEqual(p.muster, { vorhanden: false, handle: null });

  const v = p.varianten[0];
  assert.equal(v.sku, 'NS-200-GR');
  assert.equal(v.farbe, 'Grün');
  assert.equal(v.preis, 129.9);
  assert.equal(v.waehrung, 'EUR');
  assert.equal(v.verfuegbar, true);
  assert.deepEqual(v.einkauf, {
    lieferant: 'A',
    artikelnummer: 'ART-4711',
    farbnummer: 'FB-33',
    produktname: 'Ostseewelle',
    url: 'https://lieferant-a.example/produkt/ostseewelle',
    kollektion: 'Meereswelten',
    hersteller: 'Herstellwerk Nord',
    bestelleinheit: 'm2',
    procurementId: 'TP-A-4711-33-400',
        lieferweg: null,
    marke: null,
  });
});

test('fehlende Metafelder brechen nichts, Werte werden null statt erfunden', () => {
  const p = produkt({
    metafields: [],
    templateSuffix: null,
    productType: null,
    featuredImage: null,
    variants: [{
      id: 'gid://shopify/ProductVariant/5002',
      title: 'Default Title',
      sku: null,
      price: null,
      availableForSale: null,
      selectedOptions: [],
      metafields: [],
    }],
  });
  const modell = aufbereiten({ produkte: [p] }, { jetzt: JETZT });
  const pr = modell.produkte[0];
  assert.equal(pr.produktgruppe, null);
  assert.equal(pr.bild, null);
  assert.deepEqual(pr.eigenschaften, {});
  const v = pr.varianten[0];
  assert.equal(v.sku, null);
  assert.equal(v.farbe, null);
  assert.equal(v.preis, null);
  assert.equal(v.waehrung, null);
  assert.equal(v.verfuegbar, null);
  assert.equal(v.einkauf.lieferant, null);
  assert.equal(v.einkauf.artikelnummer, null);
});

test('Mustererkennung: SKU beginnt mit M- oder Handle beginnt mit muster-', () => {
  const perSku = produkt({
    handle: 'wunschteppich-nordsee',
    variants: [{
      id: 'gid://shopify/ProductVariant/6001',
      title: 'Muster',
      sku: 'M-4711',
      price: '4.90',
      availableForSale: true,
      selectedOptions: [],
      metafields: [],
    }],
  });
  const mSku = aufbereiten({ produkte: [perSku] }, { jetzt: JETZT }).produkte[0];
  assert.deepEqual(mSku.muster, { vorhanden: true, handle: null });

  const perHandle = produkt({ handle: 'muster-nordsee-teppich' });
  const mHandle = aufbereiten({ produkte: [perHandle] }, { jetzt: JETZT }).produkte[0];
  assert.deepEqual(mHandle.muster, { vorhanden: true, handle: 'muster-nordsee-teppich' });

  const keins = produkt();
  const mKeins = aufbereiten({ produkte: [keins] }, { jetzt: JETZT }).produkte[0];
  assert.deepEqual(mKeins.muster, { vorhanden: false, handle: null });
});

test('Mustererkennung ueber den Produkt-Handle: muster-<handle> existiert im Datensatz', () => {
  const echtesProdukt = produkt({ handle: 'piumera-teppichboden' });
  const musterProdukt = produkt({
    id: 'gid://shopify/Product/9099',
    handle: 'muster-piumera-teppichboden',
    title: 'Muster Piumera Teppichboden',
    variants: [{
      id: 'gid://shopify/ProductVariant/6099',
      title: 'Muster',
      sku: 'M-9099',
      price: '4.90',
      availableForSale: true,
      selectedOptions: [],
      metafields: [],
    }],
  });
  const modell = aufbereiten({ produkte: [echtesProdukt, musterProdukt] }, { jetzt: JETZT });
  const echtes = modell.produkte.find((p) => p.handle === 'piumera-teppichboden');
  assert.deepEqual(echtes.muster, { vorhanden: true, handle: 'muster-piumera-teppichboden' });
});

test('Mustererkennung ueber die Mustervariante (einkauf.muster_variante), wenn der Handle nicht passt', () => {
  const echtesProdukt = produkt({
    handle: 'anderer-name',
    variants: [{
      id: 'gid://shopify/ProductVariant/5001',
      title: 'Grün / 200x300',
      sku: 'NS-200-GR',
      price: '129.90',
      availableForSale: true,
      selectedOptions: [{ name: 'Farbe', value: 'Grün' }],
      metafields: [
        {
          namespace: 'einkauf',
          key: 'muster_variante',
          value: { id: 'gid://shopify/ProductVariant/9999', product: { handle: 'muster-irgendwas' } },
        },
      ],
    }],
  });
  const modell = aufbereiten({ produkte: [echtesProdukt] }, { jetzt: JETZT });
  assert.deepEqual(modell.produkte[0].muster, { vorhanden: true, handle: 'muster-irgendwas' });
});

test('wunschmass: Option "Wunschmaß" markiert die Variante, keine Datenluecke', () => {
  const p = produkt({
    variants: [{
      id: 'gid://shopify/ProductVariant/7001',
      title: 'Sand Hell / Wunschmaß',
      sku: null,
      price: '75.00',
      availableForSale: true,
      selectedOptions: [{ name: 'Farbe', value: 'Sand Hell' }, { name: 'Breite', value: 'Wunschmaß' }],
      metafields: [],
    }],
  });
  const v = aufbereiten({ produkte: [p] }, { jetzt: JETZT }).produkte[0].varianten[0];
  assert.equal(v.wunschmass, true);
  assert.equal(v.sku, null, 'Wunschmass hat bewusst keine feste SKU');

  const normaleVariante = aufbereiten({ produkte: [produkt()] }, { jetzt: JETZT }).produkte[0].varianten[0];
  assert.equal(normaleVariante.wunschmass, false);
});

test('normalisieren macht Umlaute zu ae/oe/ue/ss', () => {
  assert.equal(normalisieren('Grün'), 'gruen');
  assert.equal(normalisieren('Straße'), 'strasse');
  assert.equal(normalisieren('Höhe'), 'hoehe');
  assert.equal(normalisieren(null), '');
});

test('suche findet ueber Titel, Handle, SKU, Artikelnummer, Farbe, Kollektion', () => {
  const zweitesProdukt = produkt({
    id: 'gid://shopify/Product/9002',
    handle: 'suedsee-teppich',
    title: 'Südsee Teppich Blau',
    variants: [{
      id: 'gid://shopify/ProductVariant/5003',
      title: 'Blau',
      sku: 'SS-BLAU-01',
      price: '99.00',
      availableForSale: true,
      selectedOptions: [{ name: 'Farbe', value: 'Blau' }],
      metafields: [
        { namespace: 'einkauf', key: 'artikelnummer', value: 'ART-9999' },
        { namespace: 'einkauf', key: 'lieferant_kollektion', value: 'Suedwelt' },
      ],
    }],
  });
  const modell = aufbereiten({ produkte: [produkt(), zweitesProdukt] }, { jetzt: JETZT });

  assert.deepEqual(suche(modell, 'nordsee').map(p => p.handle), ['nordsee-teppich']);
  assert.deepEqual(suche(modell, 'NORDSEE-TEPPICH').map(p => p.handle), ['nordsee-teppich']);
  assert.deepEqual(suche(modell, 'NS-200-GR').map(p => p.handle), ['nordsee-teppich']);
  assert.deepEqual(suche(modell, 'ART-4711').map(p => p.handle), ['nordsee-teppich']);
  assert.deepEqual(suche(modell, 'gruen').map(p => p.handle), ['nordsee-teppich']); // Umlaut-tolerant
  assert.deepEqual(suche(modell, 'suedwelt').map(p => p.handle), ['suedsee-teppich']);
  assert.deepEqual(suche(modell, 'südwelt').map(p => p.handle), ['suedsee-teppich']);
  assert.deepEqual(suche(modell, 'ART-9999').map(p => p.handle), ['suedsee-teppich']);
  assert.deepEqual(suche(modell, 'unbekannt-xyz'), []);
  assert.deepEqual(suche(modell, ''), []);
});

test('suche akzeptiert auch das rohe Array (ohne {produkte})', () => {
  const modell = aufbereiten({ produkte: [produkt()] }, { jetzt: JETZT });
  assert.deepEqual(suche(modell.produkte, 'nordsee').map(p => p.handle), ['nordsee-teppich']);
});
