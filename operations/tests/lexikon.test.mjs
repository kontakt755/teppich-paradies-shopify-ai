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

// -- Muster <-> Original -----------------------------------------------

test('Muster-Original ueber einkauf.muster_variante (Tier 1)', () => {
  const echtes = produkt(); // Variante NS-200-GR mit voller einkauf-Ausstattung
  const muster = produkt({
    id: 'gid://shopify/Product/9101',
    handle: 'muster-nordsee-teppich',
    title: 'Muster Nordsee Teppich',
    variants: [{
      id: 'gid://shopify/ProductVariant/6101',
      title: 'Muster',
      sku: 'M-9101',
      price: '4.90',
      availableForSale: true,
      selectedOptions: [],
      metafields: [
        { namespace: 'einkauf', key: 'muster_variante', value: { id: 'gid://shopify/ProductVariant/5001', product: { handle: 'nordsee-teppich' } } },
      ],
    }],
  });
  const modell = aufbereiten({ produkte: [echtes, muster] }, { jetzt: JETZT });
  const musterProdukt = modell.produkte.find((p) => p.handle === 'muster-nordsee-teppich');
  const v = musterProdukt.varianten[0];
  assert.equal(v.original.gefunden, true);
  assert.equal(v.original.quelle, 'muster_variante');
  assert.equal(v.original.artikelnummer, 'ART-4711');
  assert.equal(v.original.lieferant, 'A');
  assert.equal(v.original.url, 'https://lieferant-a.example/produkt/ostseewelle');
  assert.equal(v.original.kollektion, 'Meereswelten');
  assert.equal(v.original.produktHandle, 'nordsee-teppich');
  assert.equal(v.link, undefined, 'Mustervariante bekommt original statt link');
});

test('Muster-Original ueber die SKU ohne M-Praefix (Tier 2)', () => {
  const echtes = produkt({
    handle: 'suedsee-teppich',
    id: 'gid://shopify/Product/9002',
    variants: [{
      id: 'gid://shopify/ProductVariant/5003',
      title: 'Blau',
      sku: 'ART-9999',
      price: '99.00',
      availableForSale: true,
      selectedOptions: [{ name: 'Farbe', value: 'Blau' }],
      metafields: [
        { namespace: 'einkauf', key: 'lieferant', value: { kuerzel: 'A' } },
        { namespace: 'einkauf', key: 'artikelnummer', value: 'ART-9999' },
        { namespace: 'einkauf', key: 'lieferant_url', value: 'https://lieferant-a.example/produkt/suedsee' },
      ],
    }],
  });
  const muster = produkt({
    id: 'gid://shopify/Product/9102',
    handle: 'muster-suedsee-teppich-anderer-name',
    variants: [{
      id: 'gid://shopify/ProductVariant/6102', title: 'Muster', sku: 'M-ART-9999', price: '4.90',
      availableForSale: true, selectedOptions: [], metafields: [],
    }],
  });
  const modell = aufbereiten({ produkte: [echtes, muster] }, { jetzt: JETZT });
  const v = modell.produkte.find((p) => p.handle === 'muster-suedsee-teppich-anderer-name').varianten[0];
  assert.equal(v.original.gefunden, true);
  assert.equal(v.original.quelle, 'sku');
  assert.equal(v.original.artikelnummer, 'ART-9999');
  assert.equal(v.original.url, 'https://lieferant-a.example/produkt/suedsee');
});

test('Muster-Original ueber den Produkt-Handle (Tier 3), eindeutig bei genau einer Farbe', () => {
  const echtes = produkt(); // handle nordsee-teppich, eine Variante
  const muster = produkt({ id: 'gid://shopify/Product/9103', handle: 'muster-nordsee-teppich' });
  const modell = aufbereiten({ produkte: [echtes, muster] }, { jetzt: JETZT });
  const v = modell.produkte.find((p) => p.handle === 'muster-nordsee-teppich').varianten[0];
  assert.equal(v.original.gefunden, true);
  assert.equal(v.original.quelle, 'handle');
  assert.equal(v.original.artikelnummer, 'ART-4711');
});

test('Muster-Original: kein Treffer ergibt ehrlichen Grund statt Erfindung', () => {
  const muster = produkt({ id: 'gid://shopify/Product/9104', handle: 'muster-unbekannt', variants: [{
    id: 'gid://shopify/ProductVariant/6104', title: 'Muster', sku: 'M-9104', price: '4.90',
    availableForSale: true, selectedOptions: [], metafields: [],
  }] });
  const modell = aufbereiten({ produkte: [muster] }, { jetzt: JETZT });
  const v = modell.produkte[0].varianten[0];
  assert.equal(v.original.gefunden, false);
  assert.equal(v.original.grund, 'kein Original beim Lieferanten hinterlegt');
});

test('Muster-Original: Handle-Tier bei mehreren Farben mehrdeutig statt geraten', () => {
  const echtesA = produkt({
    id: 'gid://shopify/Product/9005', handle: 'zweifarbig',
    variants: [{
      id: 'gid://shopify/ProductVariant/5010', title: 'Rot', sku: 'ZW-ROT', price: '10', availableForSale: true,
      selectedOptions: [{ name: 'Farbe', value: 'Rot' }],
      metafields: [{ namespace: 'einkauf', key: 'artikelnummer', value: 'ZW-ROT-ART' }],
    }, {
      id: 'gid://shopify/ProductVariant/5011', title: 'Blau', sku: 'ZW-BLAU', price: '10', availableForSale: true,
      selectedOptions: [{ name: 'Farbe', value: 'Blau' }],
      metafields: [{ namespace: 'einkauf', key: 'artikelnummer', value: 'ZW-BLAU-ART' }],
    }],
  });
  const muster = produkt({ id: 'gid://shopify/Product/9105', handle: 'muster-zweifarbig', variants: [{
    id: 'gid://shopify/ProductVariant/6105', title: 'Muster', sku: 'M-9105', price: '4.90',
    availableForSale: true, selectedOptions: [], metafields: [],
  }] });
  const modell = aufbereiten({ produkte: [echtesA, muster] }, { jetzt: JETZT });
  const v = modell.produkte.find((p) => p.handle === 'muster-zweifarbig').varianten[0];
  assert.equal(v.original.gefunden, false);
  assert.match(v.original.grund, /mehrdeutig|Farben zur Auswahl/);
});

// -- Fehlende Links bei echten Varianten --------------------------------

test('link: vorhanden bei URL, nur_artikelnummer mit Suchlink, fehlt ohne Einkaufsdaten', () => {
  const mitUrl = produkt(); // NS-200-GR hat eine url
  const nurArtikelnummer = produkt({
    id: 'gid://shopify/Product/9200', handle: 'nur-artikelnummer', variants: [{
      id: 'gid://shopify/ProductVariant/5200', title: 'Default', sku: 'NA-1', price: '10', availableForSale: true,
      selectedOptions: [],
      metafields: [
        { namespace: 'einkauf', key: 'lieferant', value: { kuerzel: 'A' } },
        { namespace: 'einkauf', key: 'artikelnummer', value: '123456' },
      ],
    }],
  });
  const ohneDaten = produkt({
    id: 'gid://shopify/Product/9201', handle: 'ohne-einkauf', variants: [{
      id: 'gid://shopify/ProductVariant/5201', title: 'Default', sku: 'OD-1', price: '10', availableForSale: true,
      selectedOptions: [], metafields: [],
    }],
  });
  const modell = aufbereiten(
    { produkte: [mitUrl, nurArtikelnummer, ohneDaten] },
    { jetzt: JETZT, lieferantSuchen: { A: 'https://lieferant-a.example' } },
  );
  const vMitUrl = modell.produkte.find((p) => p.handle === 'nordsee-teppich').varianten[0];
  assert.equal(vMitUrl.link.status, 'vorhanden');
  assert.equal(vMitUrl.link.suchlink, null);

  const vNurArt = modell.produkte.find((p) => p.handle === 'nur-artikelnummer').varianten[0];
  assert.equal(vNurArt.link.status, 'nur_artikelnummer');
  assert.match(vNurArt.link.grund, /Artikelnummer vorhanden/);
  assert.equal(vNurArt.link.suchlink, 'https://lieferant-a.example/de-DE/quicksearch?query=123456');

  const vOhne = modell.produkte.find((p) => p.handle === 'ohne-einkauf').varianten[0];
  assert.equal(vOhne.link.status, 'fehlt');
  assert.equal(vOhne.link.suchlink, null);
});

test('preisJeEinheit: m2 bei qm_pro_paket, sonst stueck', () => {
  const paket = produkt({
    metafields: [{ namespace: 'custom', key: 'qm_pro_paket', value: '2.5' }],
  });
  const modell = aufbereiten({ produkte: [paket] }, { jetzt: JETZT });
  const v = modell.produkte[0].varianten[0];
  assert.equal(v.preisJeEinheit.einheit, 'm2');
  assert.equal(v.preisJeEinheit.betrag, Math.round((129.9 / 2.5) * 100) / 100);

  const ohnePaket = produkt();
  const modell2 = aufbereiten({ produkte: [ohnePaket] }, { jetzt: JETZT });
  const v2 = modell2.produkte[0].varianten[0];
  assert.equal(v2.preisJeEinheit.einheit, 'stueck');
  assert.equal(v2.preisJeEinheit.betrag, 129.9);
});
