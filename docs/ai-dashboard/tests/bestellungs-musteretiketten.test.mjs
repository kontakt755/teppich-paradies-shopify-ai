import test from 'node:test';
import assert from 'node:assert/strict';
import { musteretikettenFuerAuftrag } from '../lib/bestellungs-musteretiketten.mjs';
import { etikettenAusLexikon } from '../lib/lexikon-etiketten.mjs';

// Ausschliesslich synthetische Varianten, Auftraege und Namen.
const boden = {
  handle: 'testvelours-teppichboden', titel: 'Testvelours Teppichboden', eigenschaften: {},
  varianten: [
    { id: 'gid://shopify/ProductVariant/101', sku: 'TV-SA', farbe: 'Sand', titel: 'Sand / 400cm' },
    { id: 'gid://shopify/ProductVariant/102', sku: 'TV-SA', farbe: 'Sand', titel: 'Sand / 500cm' },
    { id: 'gid://shopify/ProductVariant/103', sku: 'TV-GR', farbe: 'Grau', titel: 'Grau / 400cm' },
  ],
};
const karte = (...produkte) => new Map(produkte.map(p => [p.handle, p]));
const position = (extra = {}) => ({ lineItemId: 'gid://shopify/LineItem/301', istMuster: true, handle: 'kostenloses-muster', sku: 'TP-MUSTER-0', menge: 2, mengeBestellt: 3,
  musterQuelle: { quellvariante: '101', produktHandle: boden.handle, sku: 'TV-SA' }, ...extra });
const zeilen = (positionen, produkte = karte(boden)) => musteretikettenFuerAuftrag({ positionen }, produkte);

test('offizielle Quell-ID wird als numerische oder GID-Kennung kanonisch aufgeloest', () => {
  for (const quellvariante of [101, '101', 'gid://shopify/ProductVariant/101']) {
    const [r] = zeilen([position({ musterQuelle: { quellvariante, sku: 'TV-SA', produktHandle: boden.handle } })]);
    const kanonisch = etikettenAusLexikon(boden)[0];
    assert.deepEqual(r.etikett, kanonisch.etikett);
    assert.equal(r.key, kanonisch.key);
    assert.deepEqual([r.anzahl, r.bestellmenge], [2, 3]);
    assert.deepEqual(r.fehlt, []);
  }
});

test('Quell-ID geht vor alter Muster-Carrier-SKU, eine widersprechende belegte Quell-SKU blockiert', () => {
  const [r] = zeilen([position({ sku: 'M-TV-GR' })]);
  assert.equal(r.etikett.sku, 'TV-SA');
  assert.equal(r.etikett.farbe, 'Sand');
  assert.deepEqual(r.fehlt, []);
  const [widerspruch] = zeilen([position({ musterQuelle: { quellvariante: '101', sku: 'TV-GR' } })]);
  assert.ok(widerspruch.fehlt.includes('Originalzuordnung'));
  assert.equal(widerspruch.etikett.sku, '');
});

test('bekannte veraltete oder ungueltige ID faellt nie auf SKU, Farbe oder alleinige Variante zurueck', () => {
  const einzel = { ...boden, varianten: [boden.varianten[0]] };
  for (const quellvariante of ['999', 'gid://shopify/Product/101', 'fremd-101']) {
    const [r] = zeilen([position({ sku: 'M-TV-SA', farbe: 'Sand', musterQuelle: { quellvariante, sku: 'TV-SA' } })], karte(einzel));
    assert.ok(r.fehlt.includes('Originalzuordnung'), quellvariante);
    assert.equal(r.key, '');
    assert.equal(r.etikett.url, '');
  }
});

test('SKU ohne ID darf gleiche Breiten buendeln, bekannte falsche oder widersprechende SKU wird nicht ersetzt', () => {
  const [r] = zeilen([position({ musterQuelle: { sku: 'TV-SA' } })]);
  assert.equal(r.etikett.sku, 'TV-SA');
  assert.deepEqual(r.fehlt, []);
  for (const extra of [
    { sku: 'M-TV-GR', musterQuelle: { sku: 'TV-SA' } },
    { sku: 'M-STALE', musterQuelle: null, farbe: 'Sand' },
    { sku: 'TP-MUSTER-0', musterQuelle: { sku: 'STALE' }, farbe: 'Sand' },
  ]) assert.ok(zeilen([position(extra)])[0].fehlt.includes('Originalzuordnung'));
});

test('SKU mit verschiedenen Farben oder Produkten ist ohne Quell-ID mehrdeutig', () => {
  const farben = { ...boden, varianten: [...boden.varianten, { id: '104', sku: 'TV-SA', farbe: 'Rot' }] };
  const anderes = { ...boden, handle: 'testvelours-anderes-produkt', varianten: [{ id: '201', sku: 'TV-SA', farbe: 'Sand' }] };
  assert.ok(zeilen([position({ musterQuelle: { sku: 'TV-SA' } })], karte(farben))[0].fehlt.includes('Originalzuordnung'));
  assert.ok(zeilen([position({ musterQuelle: { sku: 'TV-SA' } })], karte(boden, anderes))[0].fehlt.includes('Originalzuordnung'));
});

test('eigener Musterhandle nutzt explizites anderes Original und den vorhandenen Etikettenhelfer', () => {
  const muster = { handle: 'muster-test-massteppich', titel: 'Muster Test Maßteppich', varianten: [
    { id: '501', sku: 'M-TV-SA', farbe: 'Sand', original: { produktHandle: boden.handle } },
  ] };
  const produkte = karte(boden, muster);
  const [r] = zeilen([position({ handle: muster.handle, sku: 'M-TV-SA', musterQuelle: null })], produkte);
  const [k] = etikettenAusLexikon(muster, produkte);
  assert.deepEqual(r.etikett, k.etikett);
  assert.equal(r.key, k.key);
  assert.equal(r.produktHandle, boden.handle);
  assert.equal(r.produktTitel, boden.titel);
  assert.deepEqual(r.fehlt, []);
});

test('Sammelmuster-Eigenschaften sind nur nach Gegenpruefung im Lexikon ausreichend', () => {
  const [validiert] = zeilen([position({ musterQuelle: { quellvariante: '101', produktHandle: boden.handle, sku: 'TV-SA' } })]);
  assert.deepEqual(validiert.fehlt, []);
  for (const musterQuelle of [null, { produktHandle: boden.handle }, { produktHandle: 'test-falsches-produkt', sku: 'TV-SA' }]) {
    const [r] = zeilen([position({ musterQuelle, farbe: 'Sand' })]);
    assert.ok(r.fehlt.includes('Originalzuordnung'));
  }
});

test('Null- und Default-Farbe nutzt nur die kanonische Ausfuehrung oder belegte Markenregel', () => {
  for (const titel of ['Default', 'Default Title', 'default']) {
    const paket = { handle: 'testlinea-eiche-natur', titel: 'Testlinea Eiche Natur', eigenschaften: { marke: 'Testlinea', qmProPaket: '2', arten: 'Klickvinyl', format: '120 × 20 cm' },
      varianten: [{ id: '701', sku: 'TL-1', farbe: null, titel }] };
    const [r] = zeilen([position({ farbe: 'Kundentext unzuverlaessig', musterQuelle: { quellvariante: '701', sku: 'TL-1' } })], karte(paket));
    assert.deepEqual(r.etikett, etikettenAusLexikon(paket)[0].etikett);
    assert.deepEqual([r.etikett.serie, r.etikett.farbe], ['Testlinea', 'Eiche Natur']);
    assert.deepEqual(r.fehlt, []);
  }
  const ausfuehrung = { ...boden, varianten: [{ id: '702', sku: 'TV-OH', farbe: null, titel: 'Ocker Hell' }] };
  assert.equal(zeilen([position({ musterQuelle: { quellvariante: '702' } })], karte(ausfuehrung))[0].etikett.farbe, 'Ocker Hell');
});

test('identische SKU auf getrennten Bestellpositionen bleibt getrennt und Nicht-Muster fehlen', () => {
  const p = position(), zweite = position({ lineItemId: 'gid://shopify/LineItem/302', menge: 1 });
  const r = zeilen([p, zweite, position({ istMuster: false, lineItemId: 'gid://shopify/LineItem/303' })]);
  assert.equal(r.length, 2);
  assert.notEqual(r[0].lineItemId, r[1].lineItemId);
  assert.equal(r[0].key, r[1].key);
  assert.deepEqual(r.map(x => x.anzahl), [2, 1]);
  assert.deepEqual(zeilen([]), []);
});

test('Mengen 0 und20 bleiben erhalten; fehlende, negative, gebrochene und21 werden niemals geraten oder gekappt', () => {
  for (const wert of [0, 20]) {
    const [r] = zeilen([position({ menge: wert, mengeBestellt: wert })]);
    assert.deepEqual([r.anzahl, r.bestellmenge], [wert, wert]);
    assert.deepEqual(r.fehlt, []);
    assert.equal(r.etikett.sku, 'TV-SA');
  }
  for (const wert of [undefined, null, -1, 0.5, 21, '2']) {
    const [r] = zeilen([position({ menge: wert, mengeBestellt: wert })]);
    assert.deepEqual([r.anzahl, r.bestellmenge], [null, null]);
    assert.ok(r.fehlt.includes('Menge'));
    assert.ok(r.fehlt.includes('Bestellmenge'));
    if (wert === 21) assert.ok(r.fehlt.some(x => x.includes('20')));
  }
});

test('Kunde, Bestellnummer und Lieferantenangaben gelangen weder ins Etikett noch in die Bezeichnung', () => {
  const p = position({ titel: 'Vertraulicher Bestelltext', kunde: 'Kunde Geheim', orderName: '#VERTRAULICH', lieferant: 'Lieferant Z',
    musterQuelle: { quellvariante: '101', sku: 'TV-SA', titel: 'Hersteller Geheim', bezeichnung: 'Lieferantenbezeichnung Geheim' } });
  const auftrag = { kunde: 'Kunde Geheim', name: '#VERTRAULICH', positionen: [p] }, vorher = structuredClone(auftrag);
  const r = musteretikettenFuerAuftrag(auftrag, karte(boden));
  assert.doesNotMatch(JSON.stringify(r), /Geheim|VERTRAULICH|Lieferant Z|Vertraulicher/);
  assert.deepEqual(auftrag, vorher, 'Quelldaten werden nicht veraendert');
  assert.deepEqual(Object.keys(r[0].etikett).sort(), ['farbe', 'fehlt', 'serie', 'sku', 'technik', 'url']);
});

test('offene Menge groesser als die gesamte Bestellmenge bleibt sichtbar und wird als Widerspruch blockiert', () => {
  const [r] = zeilen([position({ menge: 3, mengeBestellt: 2 })]);
  assert.deepEqual([r.anzahl, r.bestellmenge], [3, 2]);
  assert.deepEqual(r.fehlt, ['Mengenwiderspruch']);
  assert.equal(r.etikett.sku, 'TV-SA');
  assert.deepEqual(zeilen([position({ menge: 0, mengeBestellt: 2 })])[0].fehlt, []);
});

test('Massartikel ohne eigene SKU: belegte Artikelnummer und Farbe waehlen genau eine Musterfarbe', () => {
  const muster = { handle: 'muster-testvelours-nach-mass', titel: 'Muster Testvelours Teppich nach Maß', varianten: [
    { id: '601', sku: 'M-TV-SA', farbe: 'Sand', original: { produktHandle: boden.handle, variantenId: 'gid://shopify/ProductVariant/101', sku: 'TV-SA' } },
    { id: '602', sku: 'M-TV-GR', farbe: 'Grau', original: { produktHandle: boden.handle, variantenId: 'gid://shopify/ProductVariant/103', sku: 'TV-GR' } },
  ] };
  const mass = { handle: 'testvelours-nach-mass', titel: 'Testvelours Teppich nach Maß', muster: { handle: muster.handle }, varianten: [
    { id: 'gid://shopify/ProductVariant/701', sku: null, farbe: 'Sand', einkauf: { artikelnummer: 'TV-SA' } },
    { id: 'gid://shopify/ProductVariant/702', sku: null, farbe: 'Grau', einkauf: { artikelnummer: 'TV-GR' } },
    { id: 'gid://shopify/ProductVariant/703', sku: null, farbe: 'Grau', einkauf: { artikelnummer: 'TV-SA' } },
    { id: 'gid://shopify/ProductVariant/704', sku: null, farbe: 'Sand', einkauf: {} },
  ] };
  const produkte = karte(boden, muster, mass);
  const pos = (quellvariante, extra = {}) => position({ handle: muster.handle, sku: 'M-TV-XX', musterQuelle: { quellvariante, produktHandle: mass.handle }, ...extra });
  const [sand, grau] = zeilen([pos('701'), pos('702')], produkte);
  assert.deepEqual([sand.etikett.sku, sand.etikett.farbe, sand.fehlt], ['TV-SA', 'Sand', []]);
  assert.deepEqual([grau.etikett.sku, grau.etikett.farbe, grau.fehlt], ['TV-GR', 'Grau', []]);
  assert.equal(sand.produktHandle, boden.handle);
  // Artikelnummer und Farbe widersprechen sich oder die Artikelnummer fehlt: nie raten.
  for (const id of ['703', '704']) assert.ok(zeilen([pos(id)], produkte)[0].fehlt.includes('Originalzuordnung'));
  // Ohne Artikelnummer belegt die Muster-SKU der Position die Farbe - aber nur, wenn auch die Farbe passt.
  assert.deepEqual(zeilen([pos('704', { sku: 'M-TV-SA' })], produkte)[0].etikett.sku, 'TV-SA');
  assert.ok(zeilen([pos('704', { sku: 'M-TV-GR' })], produkte)[0].fehlt.includes('Originalzuordnung'));
});

test('Massartikel: gleiche Lieferanten-Artikelnummer genuegt, auch wenn die Shop-SKU sie anders schreibt', () => {
  const schlinge = { handle: 'testschlinge-teppichboden', titel: 'Testschlinge Teppichboden', eigenschaften: {}, varianten: [
    { id: 'gid://shopify/ProductVariant/111', sku: 'TS04_43', farbe: 'Espresso', titel: 'Espresso / 400cm', einkauf: { artikelnummer: 'TS04_043' } },
    { id: 'gid://shopify/ProductVariant/112', sku: 'TS04_44', farbe: 'Mokka', titel: 'Mokka / 400cm', einkauf: { artikelnummer: 'TS04_044' } },
  ] };
  const muster = { handle: 'muster-testschlinge-nach-mass', titel: 'Muster Testschlinge Teppich nach Maß', varianten: [
    { id: '611', sku: 'M-TS04_43', farbe: 'Espresso', original: { produktHandle: schlinge.handle, variantenId: 'gid://shopify/ProductVariant/111', sku: 'TS04_43' } },
    { id: '612', sku: 'M-TS04_44', farbe: 'Mokka', original: { produktHandle: schlinge.handle, variantenId: 'gid://shopify/ProductVariant/112', sku: 'TS04_44' } },
  ] };
  const mass = { handle: 'testschlinge-nach-mass', titel: 'Testschlinge Teppich nach Maß', muster: { handle: muster.handle }, varianten: [
    { id: 'gid://shopify/ProductVariant/711', sku: null, farbe: 'Espresso', einkauf: { artikelnummer: 'TS04_043' } },
    { id: 'gid://shopify/ProductVariant/712', sku: null, farbe: 'Mokka', einkauf: { artikelnummer: 'TS04_043' } },
    { id: 'gid://shopify/ProductVariant/713', sku: null, farbe: 'Espresso', einkauf: { artikelnummer: 'TS04_099' } },
  ] };
  const produkte = karte(schlinge, muster, mass);
  const pos = quellvariante => position({ handle: muster.handle, sku: 'M-TS04_43', musterQuelle: { quellvariante, produktHandle: mass.handle } });
  const [espresso] = zeilen([pos('711')], produkte);
  // Die Shop-SKU bleibt auf dem Etikett; die Lieferantennummer dient nur der Zuordnung.
  assert.deepEqual([espresso.etikett.sku, espresso.etikett.farbe, espresso.fehlt], ['TS04_43', 'Espresso', []]);
  assert.equal(espresso.produktHandle, schlinge.handle);
  assert.ok(!JSON.stringify(espresso.etikett).includes('TS04_043'));
  // Gleiche Nummer bei anderer Farbe oder passende Farbe mit fremder Nummer: nie raten.
  for (const id of ['712', '713']) assert.ok(zeilen([pos(id)], produkte)[0].fehlt.includes('Originalzuordnung'), id);
});
