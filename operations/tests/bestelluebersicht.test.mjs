import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { aufbereiten, renderHtml, kopierText, adminLink, istOffen, lieferantFuer, einkaufsmenge } from '../lib/bestelluebersicht.mjs';
import { argumente, pruefeAusgabe, ladeExport, STANDARD_AUSGABE } from '../scripts/bestelluebersicht.mjs';
import { UNGEKLAERT } from '../lib/umrechnung.mjs';

// Nur synthetische Testdaten: erfundene Artikel, keine Kunden, Lieferanten als A/B.
const mf = (namespace, key, value) => ({ namespace, key, value });

function zeile({ id, sku, title, variantTitle = null, quantity = 1, attrs = [], einkauf = [], lieferant = [], custom = [], gh = null, handle = 'testprodukt', variant = true }) {
  return {
    id: `gid://shopify/LineItem/${id}`, sku, title, variantTitle, quantity, currentQuantity: quantity, unfulfilledQuantity: quantity,
    customAttributes: attrs,
    variant: variant ? {
      id: `gid://shopify/ProductVariant/${id}`, sku, title: variantTitle ?? 'Default Title',
      metafields: { nodes: einkauf.map(([k, v]) => mf('einkauf', k, v)) },
      lieferant: { nodes: lieferant.map(([k, v]) => mf('lieferant', k, v)) },
      product: {
        id: `gid://shopify/Product/${id}`, handle, title,
        metafields: { nodes: custom.map(([k, v]) => mf('custom', k, v)) },
        grosshandel: { nodes: gh ? [mf('grosshandel', 'sku', gh)] : [] },
      },
    } : null,
  };
}

function bestellung(nr, zeilen, extra = {}) {
  return {
    id: `gid://shopify/Order/9000${nr}`, name: `#T${nr}`, createdAt: '2026-01-05T10:00:00Z', cancelledAt: null,
    displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [],
    lineItems: { nodes: zeilen }, ...extra,
  };
}

const paket = zeile({ id: 1, sku: 'TEST-PAKET-1', title: 'Testdiele Eiche', variantTitle: 'Natur', quantity: 3,
  einkauf: [['lieferant', 'B'], ['bestelleinheit', 'paket'], ['route', 'SUPPLIER_TO_TP']],
  lieferant: [['lieferant_b_artikelnummer', 'B-4711']], custom: [['qm_pro_paket', '2,2']] });
const rolle = zeile({ id: 2, sku: 'TEST-ROLLE-1', title: 'Testboden Rolle', variantTitle: '400 cm', quantity: 1102,
  attrs: [{ key: 'Ihre Breite', value: '365 cm' }, { key: 'Aus Rolle', value: '400 cm' }, { key: 'Gewünschte Länge', value: '302 cm' }],
  lieferant: [['lieferant_a_artikelnummer', 'A-0815'], ['bevorzugt', 'a']], custom: [['rollenbreite', '4'], ['preis_pro_001_qm', 'true']] });
const ohneStamm = zeile({ id: 3, sku: 'TEST-FREI', title: 'Testteppich ohne Stammdaten', variantTitle: 'Grau', gh: 'GH-TEXT-1' });
const nichts = zeile({ id: 4, sku: 'TEST-LEER', title: 'Testartikel leer', variantTitle: 'Blau' });
const geloescht = zeile({ id: 5, sku: null, title: 'Alter Testartikel', variantTitle: 'x', variant: false });
const musterM = zeile({ id: 6, sku: 'M-TESTROLLE_1', title: 'Muster Testboden', variantTitle: 'Taupe', handle: 'muster-testboden',
  attrs: [{ key: '_Muster_ID', value: 'testboden--taupe' }, { key: '_Quellvariante_ID', value: '777' }], gh: 'Musterplatzhalter' });
const musterFrei = zeile({ id: 7, sku: 'TP-MUSTER-000', title: 'Kostenloses Muster', handle: 'kostenloses-muster',
  attrs: [{ key: 'Produkt', value: 'Testteppich Nord' }, { key: 'Farbe', value: 'Sand' }], gh: 'Muster - siehe Bestellung' });

const quellvariante = {
  id: 'gid://shopify/ProductVariant/777', sku: 'TESTROLLE_1', title: 'Taupe / 400cm',
  metafields: { nodes: [] }, lieferant: { nodes: [mf('lieferant', 'lieferant_a_artikelnummer', 'A-9999')] },
  product: { id: 'gid://shopify/Product/77', handle: 'testboden', title: 'Testboden', grosshandel: { nodes: [] } },
};

const daten = {
  orders: [
    bestellung(1, [paket, rolle, musterM], { customAttributes: [{ key: 'Beratung', value: 'Ja' }, { key: 'Telefon', value: '0000 000000' }, { key: 'Verlegung', value: 'Nein' }] }),
    bestellung(2, [ohneStamm, nichts, geloescht, musterFrei], { customAttributes: [{ key: 'Beratung', value: 'Ja' }] }),
    bestellung(3, [zeile({ id: 8, sku: 'TEST-PAKET-1', title: 'Testdiele Eiche', variantTitle: 'Natur', quantity: 2,
      einkauf: [['lieferant', 'B'], ['bestelleinheit', 'paket'], ['route', 'SUPPLIER_TO_TP']],
      lieferant: [['lieferant_b_artikelnummer', 'B-4711']], custom: [['qm_pro_paket', '2,2']] })], { cancelledAt: '2026-01-06T00:00:00Z' }),
  ],
  quellvarianten: [quellvariante],
};

const m = aufbereiten(daten, { jetzt: new Date('2026-01-07T00:00:00Z') });
const pos = name => m.auftraege.flatMap(a => a.positionen).find(p => p.sku === name || p.titel === name);

test('Grosshaendler-ID-Kaskade aus resolve.mjs: lieferant.* vor grosshandel.sku', () => {
  assert.equal(pos('TEST-PAKET-1').grosshaendlerId, 'B-4711');
  assert.equal(pos('TEST-ROLLE-1').grosshaendlerId, 'A-0815');
  assert.equal(pos('TEST-FREI').grosshaendlerId, 'GH-TEXT-1');
  assert.equal(pos('TEST-LEER').grosshaendlerId, UNGEKLAERT);
  assert.ok(pos('TEST-LEER').idGrund);
});

test('Lieferant: einkauf.lieferant, sonst Quelle der ID, sonst UNGEKLAERT', () => {
  assert.equal(pos('TEST-PAKET-1').lieferant, 'B');
  assert.equal(pos('TEST-ROLLE-1').lieferant, 'A');
  assert.equal(pos('TEST-FREI').lieferant, UNGEKLAERT);
  assert.equal(lieferantFuer({ einkauf: {}, grosshaendlerIdQuelle: null }, { lieferant: { bevorzugt: 'c' } }), 'C');
  assert.equal(lieferantFuer({ einkauf: {}, grosshaendlerIdQuelle: null }, { lieferant: { bevorzugt: 'Klarname' } }), UNGEKLAERT);
});

test('Einkaufsmenge ueber umrechnung.mjs, sonst UNGEKLAERT - nie geraten', () => {
  const p = pos('TEST-PAKET-1').bestellmenge;
  assert.equal(p.menge, 3);
  assert.equal(p.einheit, 'paket');
  assert.match(p.text, /6,60 m²/);
  const r = pos('TEST-ROLLE-1').bestellmenge;
  assert.equal(r.menge, 3.02); // 302 cm aus der Rolle 400 cm
  assert.equal(r.einheit, 'lfm');
  assert.match(r.text, /Lieferantenraster ungeklärt/);
  assert.doesNotMatch(r.text, /UNGEKLAERT/, 'kein interner Marker im angezeigten Text');
  assert.equal(pos('TEST-FREI').bestellmenge.menge, UNGEKLAERT);
  assert.match(pos('TEST-FREI').bestellmenge.grund, /bestelleinheit/);
  assert.equal(pos('Alter Testartikel').bestellmenge.menge, UNGEKLAERT);
  assert.equal(pos('Alter Testartikel').idGrund, 'Variante geloescht');
});

test('Muster werden getrennt gefuehrt; ID kommt aus der Quellvariante', () => {
  const mm = pos('M-TESTROLLE_1');
  assert.equal(mm.istMuster, true);
  assert.equal(mm.grosshaendlerId, 'A-9999');
  assert.equal(mm.lieferant, 'A');
  const mf2 = pos('TP-MUSTER-000');
  assert.equal(mf2.istMuster, true);
  assert.equal(mf2.grosshaendlerId, UNGEKLAERT, 'Platzhalter aus grosshandel.sku ist keine ID');
  assert.equal(mf2.titel, 'Muster: Testteppich Nord');
  assert.equal(mf2.farbe, 'Sand');
  assert.equal(m.zahlen.muster, 2);
  assert.ok(m.gruppen.every(g => g.positionen.every(p => !p.istMuster)));
});

test('Stornierte Bestellungen erscheinen nicht in der Einkaufsliste', () => {
  assert.equal(istOffen(daten.orders[2]), false);
  assert.equal(istOffen({ displayFulfillmentStatus: 'FULFILLED' }), false);
  assert.equal(istOffen({ displayFulfillmentStatus: 'PARTIALLY_FULFILLED' }), true);
  const b = m.gruppen.find(g => g.lieferant === 'B');
  assert.equal(b.positionen.length, 1);
  assert.equal(b.positionen[0].orderName, '#T1');
  assert.equal(m.zahlen.offeneAuftraege, 2);
});

test('Gruppierung ueber einkauf.gruppieren; UNGEKLAERT-Gruppe zuletzt', () => {
  assert.deepEqual(m.gruppen.map(g => g.lieferant), ['A', 'B', UNGEKLAERT]);
  assert.equal(m.gruppen.at(-1).positionen.length, 3);
});

test('Ampel und Checks je Auftrag', () => {
  const [a1, a2, a3] = m.auftraege;
  assert.equal(a1.checks.beratung, 'Ja');
  assert.equal(a1.checks.telefon, 'vorhanden');
  assert.equal(a1.checks.verlegung, 'Nein');
  assert.equal(a1.ampel, 'gelb');
  assert.equal(a2.ampel, 'rot');
  assert.ok(a2.hinweise.some(h => /keine Telefonnummer/.test(h)));
  assert.ok(a2.hinweise.some(h => /ohne Großhändler-ID/.test(h)));
  assert.equal(a3.ampel, 'grau');
  assert.equal(a1.adminUrl, 'https://admin.shopify.com/store/sjjyq1-6w/orders/90001');
  assert.equal(adminLink('gid://shopify/Order/123'), 'https://admin.shopify.com/store/sjjyq1-6w/orders/123');
});

test('Kopiertext je Lieferant ist Klartext mit ID, Menge und Bestellnummer', () => {
  const t = kopierText(m.gruppen.find(g => g.lieferant === 'B'));
  assert.equal(t, 'Bestellung Lieferant B (SUPPLIER_TO_TP)\n1. B-4711 | Testdiele Eiche | Natur | 3 Paket(e) = 6,60 m² | Kd.-Best. #T1');
  assert.match(m.gruppen.at(-1).text, /UNGEKLAERT \(Kunde: 1 Stk\.\)/);
});

test('Zahlen', () => {
  assert.deepEqual(m.zahlen, { auftraege: 3, offeneAuftraege: 2, positionen: 8, ohneId: 3, mengeUngeklaert: 3, zuBestellen: 5, muster: 2, testbestellungen: 0 });
});

test('Testbestellungen (Tag TESTBESTELLUNG oder test=true) landen getrennt und zaehlen nirgends mit', () => {
  const echte = bestellung(1, [paket], { customAttributes: [] });
  const testTag = bestellung(2, [rolle], { tags: ['TESTBESTELLUNG'], customAttributes: [] });
  const testFeld = bestellung(3, [paket], { test: true, customAttributes: [] });
  const testKleingeschrieben = bestellung(4, [paket], { tags: ['testbestellung'], customAttributes: [] });
  const modell = aufbereiten({ orders: [echte, testTag, testFeld, testKleingeschrieben] });

  assert.equal(modell.auftraege.length, 1);
  assert.equal(modell.auftraege[0].name, '#T1');
  assert.equal(modell.testauftraege.length, 3);
  assert.ok(modell.testauftraege.every(a => a.testbestellung === true));
  assert.ok(modell.auftraege.every(a => a.testbestellung === false));

  // Zahlen zaehlen nur die echte Bestellung.
  assert.equal(modell.zahlen.auftraege, 1);
  assert.equal(modell.zahlen.testbestellungen, 3);
  assert.equal(modell.zahlen.zuBestellen, 1);

  // Testpositionen erscheinen nicht in den Einkaufsgruppen je Lieferant.
  const alleGruppenPositionen = modell.gruppen.flatMap(g => g.positionen);
  assert.ok(!alleGruppenPositionen.some(p => p.orderName === '#T2'));

  // HTML zeigt einen eigenen eingeklappten Bereich.
  const html = renderHtml(modell);
  assert.match(html, /Testbestellungen \(3\)/);
});

test('details enthaelt Kunde, Adressen, Summen, Beratung, Tags und Positionsdaten', () => {
  const order = bestellung(5, [paket], {
    customer: { displayName: 'Max Mustermann', email: 'max@example.test', phone: '+49 000' },
    email: 'max@example.test', phone: '+49 000',
    shippingAddress: { name: 'Max Mustermann', address1: 'Teststr. 1', zip: '12345', city: 'Teststadt', country: 'Deutschland', phone: '+49 000' },
    billingAddress: { name: 'Max Mustermann', address1: 'Teststr. 1', zip: '12345', city: 'Teststadt', country: 'Deutschland', phone: '+49 000' },
    shippingLine: { title: 'Standardversand' },
    subtotalPriceSet: { shopMoney: { amount: '100.00', currencyCode: 'EUR' } },
    totalShippingPriceSet: { shopMoney: { amount: '5.00', currencyCode: 'EUR' } },
    totalTaxSet: { shopMoney: { amount: '19.00', currencyCode: 'EUR' } },
    totalPriceSet: { shopMoney: { amount: '124.00', currencyCode: 'EUR' } },
    paymentGatewayNames: ['Shopify Payments'],
    note: 'Bitte vorsichtig verpacken',
    tags: ['BERATUNG-NEIN', 'TYP-MUSTER'],
    customAttributes: [{ key: 'Beratung', value: 'Nein' }],
  });
  const modell = aufbereiten({ orders: [order] });
  const d = modell.auftraege[0].details;
  assert.equal(d.kunde.name, 'Max Mustermann');
  assert.equal(d.kunde.email, 'max@example.test');
  assert.equal(d.lieferadresse.ort, 'Teststadt');
  assert.equal(d.versandart, 'Standardversand');
  assert.deepEqual(d.summen.gesamt, { betrag: 124, waehrung: 'EUR' });
  assert.equal(d.zahlungsart, 'Shopify Payments');
  assert.equal(d.notiz, 'Bitte vorsichtig verpacken');
  assert.deepEqual(d.tags, ['BERATUNG-NEIN', 'TYP-MUSTER']);
  assert.equal(d.beratungsangaben.Beratung, 'Nein');
  assert.equal(d.positionen[0].titel, 'Testdiele Eiche');
  assert.equal(d.positionen[0].lieferantenArtikelnummer, 'B-4711');
});

test('HTML: eigenstaendig, deutsch, escaped, mobil', () => {
  const html = renderHtml(aufbereiten({ orders: [bestellung(9, [zeile({ id: 9, sku: 'X', title: '<script>alert(1)</script>', gh: 'G' })])] }));
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<html lang="de">/);
  assert.match(html, /name="viewport"/);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!/<(link|script)[^>]+(src|href)=/.test(html), 'keine externen Ressourcen');
  assert.match(html, /Zu bestellen je Lieferant/);
  assert.match(html, /Liste kopieren/);
});

test('CLI: Argumente, Ausgabe nie im Repository, Exportformate', () => {
  assert.equal(argumente(['--input', 'x.json']).output, STANDARD_AUSGABE);
  assert.ok(STANDARD_AUSGABE.startsWith(os.homedir()));
  assert.throws(() => argumente([]), /--input/);
  assert.throws(() => argumente(['--foo']), /Unbekanntes Argument/);
  const repo = path.resolve('/tmp/repo-test');
  assert.throws(() => pruefeAusgabe('/tmp/repo-test/docs/x.html', repo), /Repository/);
  assert.equal(pruefeAusgabe('/tmp/anderswo/x.html', repo), '/tmp/anderswo/x.html');
  assert.equal(ladeExport(JSON.stringify({ data: { orders: { nodes: [{ id: 1 }] } } })).orders.length, 1);
  assert.equal(ladeExport(JSON.stringify([{ id: 1 }])).orders.length, 1);
  assert.throws(() => ladeExport('{}'), /orders/);
});

// Zuschnittbestellungen tragen die Laenge in "Maße" (Breite x Laenge), nicht in
// "Gewuenschte Laenge". Ohne diesen Zweig blieb die Einkaufsmenge UNGEKLAERT,
// obwohl das Mass in der Bestellung steht (belegt an Bestellung #1008).
test('Einkaufsmenge nimmt die Laenge auch aus der Eigenschaft Maße', () => {
  const item = {
    einkauf: { bestelleinheit: 'lfm' },
    produkt: { rollenbreite: 4, preis_pro_001_qm: false, qm_pro_paket: 'UNGEKLAERT' },
    eingaben: { masse: { breiteCm: 250, laengeCm: 350 } },
  };
  const r = einkaufsmenge(item, 1);
  assert.equal(r.einheit, 'lfm');
  assert.notEqual(r.menge, 'UNGEKLAERT');
  assert.match(r.text, /3,5/);
});

test('ohne jede Laengenangabe bleibt es UNGEKLAERT und nennt beide Eigenschaften', () => {
  const r = einkaufsmenge({ einkauf: { bestelleinheit: 'lfm' }, produkt: { rollenbreite: 4 }, eingaben: {} }, 1);
  assert.equal(r.menge, 'UNGEKLAERT');
  assert.match(r.grund, /Gewuenschte Laenge oder Maße/);
});

test('Jede Position traegt den Produkt-Handle fuers Lexikon', () => {
  // Ohne handle bliebe im Dashboard nur die Volltextsuche - der Weg
  // Bestellung -> Originalartikel waere wieder Handarbeit.
  const alle = m.gruppen.flatMap(g => g.positionen);
  assert.ok(alle.length > 0);
  // Einzige Ausnahme: eine Position, deren Variante im Shop geloescht wurde -
  // dort gibt es kein Produkt mehr, auf das das Lexikon zeigen koennte.
  const ohneHandle = alle.filter(p => !p.handle);
  assert.deepEqual(ohneHandle.map(p => p.titel), ['Alter Testartikel']);
  assert.ok(alle.some(p => p.handle === 'testprodukt'));
  // Muster werden getrennt gefuehrt und brauchen den Handle genauso.
  const musterListe = m.musterGruppen.flatMap(g => g.positionen);
  assert.ok(musterListe.length > 0);
  assert.equal(musterListe.find(p => p.sku === 'M-TESTROLLE_1').handle, 'muster-testboden');
});

test('Variante "je lfm": Stueckzahl ist die Laenge, Breite aus dem Variantentitel', async () => {
  const { ausVariantentitel } = await import('../lib/resolve.mjs');
  const { einkaufsmenge } = await import('../lib/bestelluebersicht.mjs');
  assert.deepEqual(ausVariantentitel('2,5 mm, 80 cm breit (je lfm)'), { jeLfm: true, variantBreiteCm: 80 });
  assert.deepEqual(ausVariantentitel('Natur'), { jeLfm: false, variantBreiteCm: null });
  const item = { einkauf: { bestelleinheit: 'lfm' }, produkt: { rollenbreite: 'UNGEKLAERT', qm_pro_paket: 'UNGEKLAERT' }, eingaben: ausVariantentitel('2,5 mm, 80 cm breit (je lfm)') };
  const r = einkaufsmenge(item, 25);
  assert.equal(r.menge, 25);
  assert.equal(r.einheit, 'lfm');
  assert.equal(r.text, '25 lfm · 80 cm breit');
  assert.equal(r.grund, null);
  // Ohne "je lfm" bleibt es ungeklaert - geraten wird nichts.
  assert.equal(einkaufsmenge({ ...item, eingaben: ausVariantentitel('Natur') }, 25).menge, 'UNGEKLAERT');
});

// Teppich nach Mass: der Konfigurator schreibt die Rolle privat als
// "_Zuschnitt aus Rolle", der Kettelservice haengt als eigene Zeile in
// derselben _Gruppe dran (Fall #1031, hier mit erfundenen Daten).
test('Teppich nach Mass: ein Stueck im Fertigmass (keine Rollenrechnung), Kettelservice ist Eigenleistung', () => {
  const teppich = zeile({ id: 41, sku: null, title: 'Testteppich nach Maß', variantTitle: 'Blau', quantity: 336, handle: 'testteppich-nach-mass',
    attrs: [{ key: 'Maße', value: '120 × 280 cm' }, { key: '_Zuschnitt aus Rolle', value: '200 cm' }, { key: '_Gruppe', value: 'g1' }],
    einkauf: [['lieferant', 'A'], ['artikelnummer', 'A-733-120'], ['bestelleinheit', 'lfm'], ['route', 'SUPPLIER_TO_TP']],
    custom: [['preis_pro_001_qm', 'true']] });
  const kettel = zeile({ id: 42, sku: null, title: 'Kettelservice', variantTitle: 'je 0,01 laufender Meter', quantity: 800, handle: 'kettelservice',
    attrs: [{ key: 'Zu Teppich', value: 'Testteppich nach Maß' }, { key: 'Kante umlaufend', value: '8,00 m' }, { key: '_Gruppe', value: 'g1' }] });
  const mm = aufbereiten({ orders: [bestellung(41, [teppich, kettel])] }, { jetzt: new Date('2026-01-07T00:00:00Z') });
  const [t, k] = mm.auftraege[0].positionen;

  // Rollenbreite oder Raummass entscheidet der Lieferant (Inhaber 2026-10-14):
  // die Kettelservice-Zeile derselben _Gruppe macht daraus eine Massanfertigung.
  assert.equal(t.bestellmenge.menge, 1);
  assert.equal(t.bestellmenge.einheit, 'stueck');
  assert.equal(t.bestellmenge.text, '1 Stück nach Maß · 120 × 280 cm');
  assert.ok(!t.ausfuehrung.some(z => /Rolle/.test(z)), t.ausfuehrung.join(' | '));

  assert.equal(k.eigenleistung, true);
  assert.equal(k.menge, 0);
  assert.equal(k.bestellmenge.text, 'Eigenleistung – nichts zu bestellen');
  assert.match(k.kundenmenge, /800/);
  assert.ok(!mm.auftraege[0].hinweise.some(h => /ohne Großhändler-ID/.test(h)), mm.auftraege[0].hinweise.join(' | '));
  assert.equal(mm.zahlen.ohneId, 0);
  assert.equal(mm.zahlen.zuBestellen, 1);
  assert.ok(mm.gruppen.flatMap(g => g.positionen).every(p => p.titel !== 'Kettelservice'));
  assert.match(renderHtml(mm), /Eigenleistung/);
});

test('"Aus Rolle" des Rollenrechners geht vor "_Zuschnitt aus Rolle"', () => {
  const z = zeile({ id: 43, sku: 'TEST-ROLLE-2', title: 'Testboden Rolle', quantity: 1,
    attrs: [{ key: 'Aus Rolle', value: '400 cm' }, { key: '_Zuschnitt aus Rolle', value: '200 cm' }, { key: 'Gewünschte Länge', value: '150 cm' }],
    einkauf: [['lieferant', 'A'], ['artikelnummer', 'A-1'], ['bestelleinheit', 'lfm']] });
  const mm = aufbereiten({ orders: [bestellung(43, [z])] }, { jetzt: new Date('2026-01-07T00:00:00Z') });
  assert.match(mm.auftraege[0].positionen[0].bestellmenge.text, /× 4,00 m/);
});

test('Muster ueber das Sammelprodukt verweist aufs Quellprodukt (Lexikon, Lieferant, Link)', () => {
  // Vinylboeden von der Rolle haben fast nie ein eigenes Musterprodukt: die
  // Zeile ist "Kostenloses Muster". Dessen Lexikon-Eintrag hat weder
  // Lieferant noch Link - "Im Lexikon ansehen" muss zum Quellprodukt fuehren.
  const qv = {
    id: 'gid://shopify/ProductVariant/888', sku: 'CVTEST_210', title: 'Default Title',
    metafields: { nodes: [mf('einkauf', 'lieferant', 'gid://shopify/Metaobject/1828679713102'), mf('einkauf', 'lieferant_url', 'https://lieferant-a.example/p/1')] },
    lieferant: { nodes: [] },
    product: { id: 'gid://shopify/Product/88', handle: 'testvinyl-eiche-von-der-rolle', title: 'Testvinyl Eiche', grosshandel: { nodes: [mf('grosshandel', 'sku', 'CVTEST_210')] } },
  };
  const sammel = zeile({ id: 30, sku: 'TP-MUSTER-000', title: 'Kostenloses Muster', handle: 'kostenloses-muster',
    attrs: [{ key: '_Muster_ID', value: 'testvinyl--eiche' }, { key: '_Quellprodukt', value: 'testvinyl-eiche-von-der-rolle' }, { key: '_Quellvariante_ID', value: '888' }, { key: 'Produkt', value: 'Testvinyl Eiche' }, { key: 'Farbe', value: 'Eiche' }] });
  const ohneQv = zeile({ id: 31, sku: 'TP-MUSTER-000', title: 'Kostenloses Muster', handle: 'kostenloses-muster',
    attrs: [{ key: '_Muster_ID', value: 'testvinyl2--grau' }, { key: '_Quellprodukt', value: 'testvinyl-grau-von-der-rolle' }, { key: 'Produkt', value: 'Testvinyl Grau' }] });
  const mm = aufbereiten({ orders: [bestellung(30, [sammel, ohneQv, musterM])], quellvarianten: [qv, quellvariante] });
  const alle = mm.auftraege.flatMap(a => a.positionen);
  const p = alle.find(x => x.lineItemId === 'gid://shopify/LineItem/30');
  assert.equal(p.handle, 'testvinyl-eiche-von-der-rolle');
  assert.equal(p.lieferant, 'A');
  assert.equal(p.lieferantUrl, 'https://lieferant-a.example/p/1');
  assert.equal(p.grosshaendlerId, 'CVTEST_210');
  // Quellvariante nicht geladen: der Handle aus der Property reicht fuers Lexikon.
  assert.equal(alle.find(x => x.lineItemId === 'gid://shopify/LineItem/31').handle, 'testvinyl-grau-von-der-rolle');
  // Eigenes Musterprodukt bleibt: das Lexikon zeigt dort das Original selbst.
  assert.equal(alle.find(x => x.sku === 'M-TESTROLLE_1').handle, 'muster-testboden');
});

test('Lieferant aus Metaobjekt-GID: feste Liste kennt A-E, der Export liefert weitere mit', () => {
  const gid = n => `gid://shopify/Metaobject/${n}`;
  const mitLieferant = (id, wert) => zeile({ id, sku: `TEST-LF-${id}`, title: `Testartikel ${id}`, einkauf: [['lieferant', wert]] });
  const orders = [bestellung(40, [mitLieferant(41, gid(1845606482254)), mitLieferant(42, gid(1846305227086)), mitLieferant(43, gid(1846305259854)), mitLieferant(44, gid(1999))])];
  const lf = modell => Object.fromEntries(modell.auftraege.flatMap(a => a.positionen).map(p => [p.sku, p.lieferant]));
  const ohneListe = lf(aufbereiten({ orders }));
  assert.deepEqual(ohneListe, { 'TEST-LF-41': 'C', 'TEST-LF-42': 'D', 'TEST-LF-43': 'E', 'TEST-LF-44': UNGEKLAERT });
  const mitListe = lf(aufbereiten({ orders, lieferanten: [{ id: gid(1999), kuerzel: 'f' }] }));
  assert.equal(mitListe['TEST-LF-44'], 'F');
});

test('Kundenmenge: bei gelieferter Ware die bestellte Menge, Kettelservice in laufenden Metern', () => {
  // Vorher: "0 Stk." bei gelieferter Ware (offene Menge) und "800 Stk. Kettelservice".
  const geliefert = { ...zeile({ id: 50, sku: 'TEST-ROLLE-9', title: 'Testunterlage', variantTitle: '80 cm breit (je lfm)', quantity: 3 }), unfulfilledQuantity: 0 };
  const kettel = zeile({ id: 51, sku: null, title: 'Kettelservice', variantTitle: 'je 0,01 laufender Meter', quantity: 800, handle: 'kettelservice' });
  const mm = aufbereiten({ orders: [bestellung(50, [geliefert, kettel])] });
  const pos = mm.auftraege[0].positionen;
  assert.match(pos.find(p => p.titel === 'Testunterlage').kundenmenge, /^3 lfm/, 'je lfm: Stueckzahl ist die Laenge');
  assert.match(pos.find(p => p.titel === 'Kettelservice').kundenmenge, /800 × 0,01 lfm = 8,00 lfm/);
});
