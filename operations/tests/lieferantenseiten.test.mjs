import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mitEinheit,
  nutzungsklasseGids,
  metaobjektGid,
  seitenIdFuerSku,
  planeTechnikFelder,
  planeEinkaufFelder,
  planeAlles,
  baueBatches,
  baueRollback,
  METAOBJEKTE,
} from '../lib/lieferantenseiten.mjs';

// -- Einheiten -------------------------------------------------------

test('mitEinheit: reine Zahl bekommt Einheit + deutsches Komma', () => {
  assert.equal(mitEinheit('gesamtstaerke', '7.5'), '7,5 mm');
  assert.equal(mitEinheit('trittschallverbesserung', '14'), '14 dB');
  assert.equal(mitEinheit('florhoehe', '3'), '3 mm');
});

test('mitEinheit: Wert mit Text/Einheit bleibt unveraendert', () => {
  assert.equal(mitEinheit('gesamtstaerke', 'ca. 7,5 mm'), 'ca. 7,5 mm');
});

test('mitEinheit: Feld ohne Einheiten-Tabelle bleibt unveraendert', () => {
  assert.equal(mitEinheit('material', '100% Polyester'), '100% Polyester');
});

// -- Metaobjekt-Zuordnung ---------------------------------------------

test('metaobjektGid: exakte Entsprechung (case-/whitespace-insensitiv)', () => {
  const gid = metaobjektGid('fasermaterial', '  polyester  ');
  assert.equal(gid, Object.entries(METAOBJEKTE.fasermaterial).find(([, n]) => n === 'Polyester')[0]);
});

test('metaobjektGid: kein Treffer ohne exakte Entsprechung', () => {
  assert.equal(metaobjektGid('fasermaterial', 'Erfundenes Fasermaterial'), null);
});

test('metaobjektGid: Gleichbedeutend-Tabelle fuer Fussbodenheizung', () => {
  const gid = metaobjektGid('fusbodenheizung', 'Warmwasser');
  assert.equal(gid, Object.entries(METAOBJEKTE.fusbodenheizung).find(([, n]) => n === 'Ja')[0]);
});

test('nutzungsklasseGids: mehrere Klassen, exakte Ziffernentsprechung', () => {
  const { gids, unbekannt } = nutzungsklasseGids('32, 23');
  assert.equal(gids.length, 2);
  assert.deepEqual(unbekannt, []);
});

test('nutzungsklasseGids: unbekannte Klasse landet in unbekannt, nicht in gids', () => {
  const { gids, unbekannt } = nutzungsklasseGids('99');
  assert.deepEqual(gids, []);
  assert.deepEqual(unbekannt, ['99']);
});

// -- Katalog-Abgleich ---------------------------------------------------

test('seitenIdFuerSku: nur bei exaktem 1:1-Treffer', () => {
  const katalog = {
    'SKU-1': { found: true, total: 1, match: { material_number: 'SKU-1', url: 'https://lieferant-a.example/de-DE/product/4711' } },
    'SKU-2': { found: true, total: 2, match: { material_number: 'SKU-2', url: 'https://lieferant-a.example/de-DE/product/4712' } },
    'SKU-3': { found: false, total: 0 },
    'SKU-4': { found: true, total: 1, match: { material_number: 'ANDERE-NUMMER', url: 'https://lieferant-a.example/de-DE/product/4714' } },
  };
  assert.equal(seitenIdFuerSku(katalog, 'SKU-1'), '4711');
  assert.equal(seitenIdFuerSku(katalog, 'SKU-2'), null, 'mehrere Treffer sind kein Beleg');
  assert.equal(seitenIdFuerSku(katalog, 'SKU-3'), null);
  assert.equal(seitenIdFuerSku(katalog, 'SKU-4'), null, 'material_number weicht ab');
  assert.equal(seitenIdFuerSku(katalog, 'UNBEKANNT'), null);
});

// -- Fixtures fuer die Planer ------------------------------------------

function katalogFuer(skuZuPid) {
  const katalog = {};
  for (const [sku, pid] of Object.entries(skuZuPid)) {
    katalog[sku] = { found: true, total: 1, match: { material_number: sku, url: `https://lieferant-a.example/de-DE/product/${pid}` } };
  }
  return katalog;
}

function produktFixture({ handle = 'testteppich', adminId = '9001', eigenschaften = {}, varianten }) {
  return {
    handle,
    adminUrl: `https://admin.shopify.com/store/sjjyq1-6w/products/${adminId}`,
    eigenschaften,
    varianten,
  };
}

// -- Technik-Felder (custom.*) ------------------------------------------

test('planeTechnikFelder: Freitextfeld mit Einheit, wenn leer', () => {
  const katalog = katalogFuer({ 'SKU-1': '4711' });
  const cache = { 4711: { attrs: { 'Stärke (mm)': '7.5' }, url: 'https://lieferant-a.example/de-DE/product/4711' } };
  const produkte = [produktFixture({ varianten: [{ sku: 'SKU-1', id: 'gid://shopify/ProductVariant/1' }] })];

  const { werte, offen } = planeTechnikFelder({ cache, katalog, produkte });
  const treffer = werte.find((w) => w.key === 'gesamtstarke');
  assert.ok(treffer, 'gesamtstarke sollte geplant werden');
  assert.equal(treffer.value, '7,5 mm');
  assert.equal(treffer.ownerId, 'gid://shopify/Product/9001');
  assert.equal(treffer.type, 'single_line_text_field');
  assert.equal(offen.length, 0, 'keine offenen Faelle fuer die uebrigen Felder ohne Seiten-Attribut');
});

test('planeTechnikFelder: bereits gefuelltes Feld wird nie ueberschrieben', () => {
  const katalog = katalogFuer({ 'SKU-1': '4711' });
  const cache = { 4711: { attrs: { 'Stärke (mm)': '9' }, url: 'x' } };
  const produkte = [produktFixture({ eigenschaften: { gesamtstaerke: '7,5 mm' }, varianten: [{ sku: 'SKU-1', id: 'gid://shopify/ProductVariant/1' }] })];

  const { werte } = planeTechnikFelder({ cache, katalog, produkte });
  assert.equal(werte.find((w) => w.key === 'gesamtstarke'), undefined);
});

test('planeTechnikFelder: Metaobjekt-Referenz nur bei exakter Entsprechung, sonst offen', () => {
  const katalog = katalogFuer({ 'SKU-1': '4711' });
  const cache = { 4711: { attrs: { Fasermaterial: 'Polyester' }, url: 'x' } };
  const produkte = [produktFixture({ varianten: [{ sku: 'SKU-1', id: 'gid://shopify/ProductVariant/1' }] })];

  const { werte } = planeTechnikFelder({ cache, katalog, produkte });
  const treffer = werte.find((w) => w.key === 'fasermaterial');
  assert.ok(treffer);
  assert.equal(treffer.type, 'list.metaobject_reference');
  const gids = JSON.parse(treffer.value);
  assert.equal(gids.length, 1);
});

test('planeTechnikFelder: unbekannter Metaobjekt-Wert bleibt offen mit Grund, kein automatisches Anlegen', () => {
  const katalog = katalogFuer({ 'SKU-1': '4711' });
  const cache = { 4711: { attrs: { Fasermaterial: 'Erfundenes Material XY' }, url: 'x' } };
  const produkte = [produktFixture({ varianten: [{ sku: 'SKU-1', id: 'gid://shopify/ProductVariant/1' }] })];

  const { werte, offen, neueMetaobjekte } = planeTechnikFelder({ cache, katalog, produkte });
  assert.equal(werte.find((w) => w.key === 'fasermaterial'), undefined);
  const fund = offen.find((o) => o.feld === 'fasermaterial');
  assert.ok(fund && /neuer Eintrag noetig/.test(fund.grund));
  assert.deepEqual(neueMetaobjekte.fasermaterial, ['Erfundenes Material XY']);
});

test('planeTechnikFelder: widerspruechliche Werte je Variante gehen in Konflikte, nicht in den Plan', () => {
  const katalog = katalogFuer({ 'SKU-1': '4711', 'SKU-2': '4712' });
  const cache = {
    4711: { attrs: { Material: 'Polyester' }, url: 'x' },
    4712: { attrs: { Material: 'Polyamid' }, url: 'y' },
  };
  const produkte = [produktFixture({
    varianten: [
      { sku: 'SKU-1', id: 'gid://shopify/ProductVariant/1' },
      { sku: 'SKU-2', id: 'gid://shopify/ProductVariant/2' },
    ],
  })];

  const { werte, konflikte, offen } = planeTechnikFelder({ cache, katalog, produkte });
  assert.equal(werte.find((w) => w.key === 'material'), undefined);
  assert.equal(konflikte.length, 1);
  assert.ok(offen.some((o) => /widerspruechlich/.test(o.grund)));
});

test('planeTechnikFelder: fehlende Seite im Cache bleibt offen mit "noch nicht" statt eines geratenen Werts', () => {
  const katalog = katalogFuer({ 'SKU-1': '4711' });
  const produkte = [produktFixture({ varianten: [{ sku: 'SKU-1', id: 'gid://shopify/ProductVariant/1' }] })];

  const { werte, offen } = planeTechnikFelder({ cache: {}, katalog, produkte });
  assert.equal(werte.length, 0);
  assert.ok(offen.every((o) => /noch nicht im Crawler-Cache/.test(o.grund)));
});

test('planeTechnikFelder: Produkt ohne SKU (Fixpreis-/Rollenware) liefert keine Werte', () => {
  const produkte = [produktFixture({ varianten: [{ sku: null, id: 'gid://shopify/ProductVariant/1' }] })];
  const { werte, offen } = planeTechnikFelder({ cache: {}, katalog: {}, produkte });
  assert.equal(werte.length, 0);
  assert.equal(offen.length, 0);
});

// -- Einkauf-Felder (Kollektion/Marke) -----------------------------------

test('planeEinkaufFelder: Kollektion und Marke werden aus der Seite uebernommen', () => {
  const katalog = katalogFuer({ 'SKU-1': '4711' });
  const cache = { 4711: { kollektion: 'Testkollektion', marke: 'Testmarke', attrs: {}, url: 'https://lieferant-a.example/de-DE/product/4711' } };
  const produkte = [produktFixture({ varianten: [{ sku: 'SKU-1', id: 'gid://shopify/ProductVariant/1', einkauf: {} }] })];

  const { werte } = planeEinkaufFelder({ cache, katalog, produkte });
  assert.equal(werte.length, 2);
  assert.ok(werte.some((w) => w.key === 'lieferant_kollektion' && w.value === 'Testkollektion'));
  assert.ok(werte.some((w) => w.key === 'marke' && w.value === 'Testmarke'));
  assert.ok(werte.every((w) => w.namespace === 'einkauf'));
});

test('planeEinkaufFelder: vorhandener Wert wird nie ueberschrieben, auch wenn er abweicht', () => {
  const katalog = katalogFuer({ 'SKU-1': '4711' });
  const cache = { 4711: { kollektion: 'Neue Kollektion', attrs: {}, url: 'x' } };
  const produkte = [produktFixture({ varianten: [{ sku: 'SKU-1', id: 'gid://shopify/ProductVariant/1', einkauf: { kollektion: 'Alte Kollektion' } }] })];

  const { werte } = planeEinkaufFelder({ cache, katalog, produkte });
  assert.equal(werte.find((w) => w.key === 'lieferant_kollektion'), undefined);
});

test('planeEinkaufFelder: gleicher Wert steht schon so drin -> kein Schreibpaket', () => {
  const katalog = katalogFuer({ 'SKU-1': '4711' });
  const cache = { 4711: { kollektion: 'Testkollektion', attrs: {}, url: 'x' } };
  const produkte = [produktFixture({ varianten: [{ sku: 'SKU-1', id: 'gid://shopify/ProductVariant/1', einkauf: { kollektion: 'Testkollektion' } }] })];

  const { werte } = planeEinkaufFelder({ cache, katalog, produkte });
  assert.equal(werte.find((w) => w.key === 'lieferant_kollektion'), undefined);
});

// -- planeAlles / Zaehlung ------------------------------------------------

test('planeAlles: zaehlt technik und einkauf getrennt, summiert in werte', () => {
  const katalog = katalogFuer({ 'SKU-1': '4711' });
  const cache = { 4711: { kollektion: 'K', attrs: { Material: 'Polyester' }, url: 'x' } };
  const produkte = [produktFixture({ varianten: [{ sku: 'SKU-1', id: 'gid://shopify/ProductVariant/1', einkauf: {} }] })];

  const plan = planeAlles({ cache, katalog, produkte });
  assert.equal(plan.werte.length, plan.technikAnzahl + plan.einkaufAnzahl);
  assert.ok(plan.technikAnzahl >= 1);
  assert.ok(plan.einkaufAnzahl >= 1);
});

// -- Batchdateien ----------------------------------------------------------

test('baueBatches: hoechstens 25 Metafelder je Aufruf, 8 Aufrufe je Datei', () => {
  const werte = Array.from({ length: 210 }, (_, i) => ({ ownerId: `gid://shopify/Product/${i}`, namespace: 'custom', key: 'material', type: 'single_line_text_field', value: `Wert ${i}` }));
  const dateien = baueBatches(werte);
  // 210 Werte / 25 je Aufruf = 9 Aufrufe (8 volle + 1 mit 10) -> 2 Dateien (8 + 1 Aufruf)
  assert.equal(dateien.length, 2);
  const aufrufeErsteDatei = (dateien[0].match(/metafieldsSet/g) || []).length;
  assert.equal(aufrufeErsteDatei, 8);
  const aufrufeZweiteDatei = (dateien[1].match(/metafieldsSet/g) || []).length;
  assert.equal(aufrufeZweiteDatei, 1);
  for (const inhalt of dateien) {
    assert.ok(inhalt.startsWith('mutation{'));
    assert.ok(inhalt.endsWith('}'));
  }
});

test('baueBatches: list.metaobject_reference-Werte bleiben als JSON-Array im Text, nicht doppelt escaped', () => {
  const werte = [{ ownerId: 'gid://shopify/Product/1', namespace: 'custom', key: 'fasermaterial', type: 'list.metaobject_reference', value: JSON.stringify(['gid://shopify/Metaobject/1']) }];
  const [datei] = baueBatches(werte);
  assert.ok(datei.includes('value:"[\\"gid://shopify/Metaobject/1\\"]"'));
});

test('baueRollback: liefert je Wert einen Altwert-Eintrag (Standard null)', () => {
  const werte = [{ ownerId: 'gid://shopify/Product/1', namespace: 'custom', key: 'material', type: 'single_line_text_field', value: 'Polyester' }];
  const rollback = baueRollback(werte);
  assert.equal(rollback.length, 1);
  assert.equal(rollback[0].vorher, null);
});
