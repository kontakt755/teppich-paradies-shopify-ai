import test from 'node:test';
import assert from 'node:assert/strict';
import { aufbereiten } from '../lib/bestelluebersicht.mjs';
import { sucheKunden, offeneBestellungenJeProdukt, kundenListenEintrag } from '../lib/kundensuche.mjs';
import { positionSuchtext } from '../../docs/ai-dashboard/lib/lexikon-suche.mjs';
import { positionKey } from '../lib/auftragsstatus.mjs';

// Nur synthetische Testdaten: erfundene Kunden, Produkte und Bestellnummern.
function zeile({ id, title, handle, variantTitle = 'Natur', sku = `TEST-${id}` }) {
  return {
    id: `gid://shopify/LineItem/${id}`, sku, title, variantTitle, quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
    customAttributes: [],
    variant: {
      id: `gid://shopify/ProductVariant/${id}`, sku, title: variantTitle,
      metafields: { nodes: [] }, lieferant: { nodes: [] },
      product: { id: `gid://shopify/Product/${id}`, handle, title, metafields: { nodes: [] }, grosshandel: { nodes: [] } },
    },
  };
}

function bestellung(nr, zeilen, extra = {}) {
  return {
    id: `gid://shopify/Order/7000${nr}`, name: `#P${nr}`, createdAt: `2026-02-0${nr}T10:00:00Z`, cancelledAt: null,
    displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [], tags: [],
    customer: { id: `gid://shopify/Customer/600${nr}`, displayName: `Probekunde ${nr}`, email: `probekunde${nr}@example.invalid`, phone: null },
    sourceName: 'web', lineItems: { nodes: zeilen }, ...extra,
  };
}

const modell = aufbereiten({
  orders: [
    bestellung(1, [zeile({ id: 11, title: 'Testteppich Wolke', handle: 'testteppich-wolke' })]),
    bestellung(2, [zeile({ id: 21, title: 'Testteppich Wolke', handle: 'testteppich-wolke', variantTitle: 'Grau' }), zeile({ id: 22, title: 'Testvinyl Stein', handle: 'testvinyl-stein' })]),
    bestellung(3, [zeile({ id: 31, title: 'Testteppich Wolke', handle: 'testteppich-wolke' })], { cancelledAt: '2026-02-04T00:00:00Z' }),
    bestellung(4, [zeile({ id: 41, title: 'Testteppich Wolke', handle: 'testteppich-wolke' })], { displayFulfillmentStatus: 'FULFILLED' }),
    bestellung(5, [zeile({ id: 51, title: 'Testteppich Wolke', handle: 'testteppich-wolke' })], { tags: ['TESTBESTELLUNG'] }),
    // In Shopify archiviert, ohne Versand: abgehakt.
    bestellung(6, [zeile({ id: 61, title: 'Testteppich Wolke', handle: 'testteppich-wolke' })], { closedAt: '2026-02-10T00:00:00Z' }),
    // Teilversand: Wolke schon verschickt, Stein noch offen.
    bestellung(7, [{ ...zeile({ id: 71, title: 'Testteppich Wolke', handle: 'testteppich-wolke' }), unfulfilledQuantity: 0 }, zeile({ id: 72, title: 'Testvinyl Stein', handle: 'testvinyl-stein' })], { displayFulfillmentStatus: 'PARTIALLY_FULFILLED' }),
  ],
});

test('offeneBestellungenJeProdukt: nur offene, echte, nicht stornierte, nicht archivierte Bestellungen', () => {
  const map = offeneBestellungenJeProdukt(modell, { statusAlle: {} });
  const wolke = map.get('testteppich-wolke');
  assert.deepEqual(wolke.map(o => o.bestellung), ['#P1', '#P2']);
  assert.equal(wolke[1].farbe, 'Grau');
  assert.equal(wolke[0].kunde, 'Probekunde 1');
  assert.equal(wolke[0].kundenKey, 'email:probekunde1@example.invalid');
  assert.equal(wolke[0].stand, 'Noch nicht bestellt');
  assert.deepEqual(map.get('testvinyl-stein').map(o => o.bestellung), ['#P2', '#P7']);
});

test('offeneBestellungenJeProdukt: bei Teilversand verschwindet die schon verschickte Position', () => {
  const map = offeneBestellungenJeProdukt(modell, { statusAlle: {} });
  assert.ok(!map.get('testteppich-wolke').some(o => o.bestellung === '#P7'));
  assert.ok(map.get('testvinyl-stein').some(o => o.bestellung === '#P7'));
});

test('offeneBestellungenJeProdukt: Auftragsfluss "erledigt" schliesst die Position, "bestellt" zeigt den Stand', () => {
  const p1 = modell.auftraege.find(a => a.name === '#P1');
  const p2 = modell.auftraege.find(a => a.name === '#P2');
  const statusAlle = {
    [positionKey(p1.id, p1.positionen[0].lineItemId)]: { status: 'erledigt' },
    [positionKey(p2.id, p2.positionen[0].lineItemId)]: { status: 'bestellt' },
  };
  const wolke = offeneBestellungenJeProdukt(modell, { statusAlle }).get('testteppich-wolke');
  assert.deepEqual(wolke.map(o => o.bestellung), ['#P2']);
  assert.equal(wolke[0].stand, 'Bestellt');
});

test('sucheKunden: findet Kunden ueber den Produktnamen und sagt, was sie bestellt haben', () => {
  const treffer = sucheKunden(modell, 'stein', { statusAlle: {} });
  assert.deepEqual(treffer.map(k => k.kunde.name), ['Probekunde 7', 'Probekunde 2']);
  const eintrag = kundenListenEintrag(treffer[1]);
  assert.equal(eintrag.trefferProdukt.titel, 'Testvinyl Stein');
  assert.equal(eintrag.trefferProdukt.bestellung, '#P2');
});

test('sucheKunden: Treffer ueber Kontakt stehen vor Treffern ueber das Produkt', () => {
  // "Probekunde 1" passt direkt (Name), alle anderen nur ueber "Testteppich".
  const treffer = sucheKunden(modell, 'probekunde1', { statusAlle: {} });
  assert.equal(treffer.length, 1);
  assert.equal(treffer[0].trefferProdukt, undefined);
  const ueberProdukt = sucheKunden(modell, 'testteppich', { statusAlle: {} });
  assert.ok(ueberProdukt.length >= 4);
  assert.ok(ueberProdukt.every(k => k.trefferProdukt?.titel === 'Testteppich Wolke'));
});

test('sucheKunden: Wortweise wie die Packstation - Reihenfolge, Umlaute, Farbe im Produkt', () => {
  const modell = { auftraege: [{ id: 'o1', name: '#T1', datum: '2026-10-20', details: { kunde: { name: 'Müller, Hans', email: 'test@example.com', telefon: '0300' } },
    positionen: [{ lineItemId: 'l1', titel: 'Muster Testprodukt', farbe: 'Hellgrau (073)', sku: 'SKU_1', menge: 1 }, { lineItemId: 'l2', titel: 'Muster Anderes', farbe: 'Grau (8H73)', sku: 'SKU_2', menge: 1 }] }] };
  for (const q of ['Hans Müller', 'hans mueller', 'mueller #T1']) assert.equal(sucheKunden(modell, q).length, 1, q);
  assert.equal(sucheKunden(modell, 'Hans Meier').length, 0);
  const produkt = sucheKunden(modell, 'Testprodukt 73');
  assert.equal(produkt[0].trefferProdukt.farbe, 'Hellgrau (073)');
  assert.equal(sucheKunden(modell, 'Anderes 73').length, 0, '73 passt nicht auf 8H73');
  assert.equal(sucheKunden(modell, 'Anderes 74').length, 0);
});

test('sucheKunden: findet Warenbestellungen ueber Lieferantenangaben, auch bei Wunschmass ohne SKU', () => {
  const position = (lineItemId, handle, titel, farbe, sku) => ({ lineItemId, handle, titel, farbe, sku, menge: 1 });
  const auftrag = (id, name, kunde, positionen) => ({ id, name, datum: '2026-10-20', details: { kunde: { name: kunde, email: `${id}@example.com`, telefon: '–' } }, positionen });
  const modell = { auftraege: [
    auftrag('o1', '#T1', 'Testkunde Rolle', [position('l1', 'shop-eins', 'Shopname Eins', 'Grau (040) / 400cm', 'SKU-1')]),
    auftrag('o2', '#T2', 'Testkunde Wunschmass', [position('l2', 'shop-zwei', 'Shopname Zwei', 'Grau (078) / Wunschmaß', 'UNGEKLAERT')]),
    auftrag('o3', '#T3', 'Testkunde Fremd', [position('l3', 'nicht-im-lexikon', 'Fremdware', 'Grau', 'UNGEKLAERT')]),
  ] };
  const produkte = [
    { handle: 'shop-eins', titel: 'Shopname Eins', varianten: [{ sku: 'SKU-1', farbe: 'Grau (040)', titel: 'Grau (040) / 400cm', einkauf: { produktname: 'Orion 400 cm Linie 029', farbnummer: '40', lieferant: 'Z' } }] },
    { handle: 'shop-zwei', titel: 'Shopname Zwei', varianten: [
      { sku: 'SKU-2', farbe: 'Grau (078)', titel: 'Grau (078) / 400cm', einkauf: { produktname: 'Vega 400 cm Linie 029', farbnummer: '78' } },
      { sku: null, farbe: 'Grau (078)', titel: 'Grau (078) / Wunschmaß', wunschmass: true, einkauf: { farbnummer: '78' } },
      { sku: 'SKU-3', farbe: 'Rot (079)', titel: 'Rot (079) / 400cm', einkauf: { produktname: 'Mira 400 cm', farbnummer: '79' } },
    ] },
  ];
  const einkaufText = positionSuchtext(produkte);
  const namen = q => sucheKunden(modell, q, { einkaufText }).map(k => k.kunde.name);
  assert.deepEqual(namen('Orion Linie 029 40'), ['Testkunde Rolle']);
  assert.deepEqual(namen('Vega 78'), ['Testkunde Wunschmass'], 'Wunschmass ohne SKU: ueber Handle und Farbe');
  assert.equal(sucheKunden(modell, 'Vega 78', { einkaufText })[0].trefferProdukt.titel, 'Shopname Zwei');
  assert.deepEqual(namen('Linie 029').sort(), ['Testkunde Rolle', 'Testkunde Wunschmass']);
  assert.deepEqual(namen('Mira'), [], 'andere Farbe desselben Produkts zaehlt nicht');
  assert.deepEqual(namen('Orion 78'), [], 'alle Woerter an derselben Position');
  assert.deepEqual(namen('Fremdware'), ['Testkunde Fremd'], 'ohne Lexikon-Eintrag bleibt der Shopname');
  assert.equal(positionSuchtext(produkte)({ sku: 'SKU-1' }).includes('z'), false, 'das Lieferantenkuerzel zaehlt nicht mit');
  // Ohne Quelle bleibt alles wie vorher.
  assert.deepEqual(sucheKunden(modell, 'Vega 78').map(k => k.kunde.name), []);
  assert.deepEqual(sucheKunden(modell, 'Shopname Eins').map(k => k.kunde.name), ['Testkunde Rolle']);
});
