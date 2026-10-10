import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eintragAus, istVorlage, leseListe, verkaufeImLaden, alsDateTime, istZugriffVerweigert,
  SonderpostenFehler, RECHT_FEHLT, STANDORT_ID, adminLink, UEBERVERKAUF_OFFEN, ERGEBNIS_UNKLAR,
} from '../lib/sonderposten.mjs';
import { attrappe, PRODUKT_ID, ITEM_ID } from './sonderposten-attrappe.mjs';

const JETZT = new Date('2026-10-08T12:34:56.789Z');

test('eintragAus: Masse, berechnete Flaeche, Bestand, Knopf nur bei Bestand 1', async () => {
  const { proxy } = attrappe();
  const { product } = await proxy.execute('query SonderpostenEinzeln', { id: PRODUKT_ID });
  const e = eintragAus(product);
  assert.equal(e.sku, 'SP-TEST-0001');
  assert.equal(e.preis, 149);
  assert.equal(e.breiteM, 4);
  assert.equal(e.laengeM, 2.35);
  assert.equal(e.flaecheM2, 9.4, 'Flaeche aus Breite x Laenge, wenn das Feld fehlt');
  assert.equal(e.bestand, 1);
  assert.equal(e.verkaufbar, true);
  assert.equal(e.inventoryItemId, ITEM_ID);
  assert.equal(e.lagerort, 'Regal 3');
  assert.equal(e.adminUrl, adminLink(PRODUKT_ID));
  assert.match(e.adminUrl, /\/products\/9001$/);
  assert.equal(eintragAus({ ...product, variants: { nodes: [{ ...product.variants.nodes[0], inventoryItem: { id: ITEM_ID, tracked: false } }] } }).verkaufbar, false, 'ohne gefuehrten Bestand kein Knopf');
});

test('istVorlage: SKU SP-0000 oder Titel "VORLAGE ..."', () => {
  assert.equal(istVorlage({ title: 'VORLAGE Sonderposten – nicht veröffentlichen', variants: { nodes: [{ sku: 'SP-0001' }] } }), true);
  assert.equal(istVorlage({ title: 'Reststück', variants: { nodes: [{ sku: 'sp-0000' }] } }), true);
  assert.equal(istVorlage({ title: 'Reststück grau', variants: { nodes: [{ sku: 'SP-0042' }] } }), false);
});

test('leseListe: Vorlage faellt weg, Suche fragt nur Sonderposten ohne Archiv am einen Standort', async () => {
  const { proxy, aufrufe } = attrappe();
  const liste = await leseListe(proxy, { jetzt: JETZT });
  assert.equal(liste.anzahl, 1);
  assert.equal(liste.eintraege[0].sku, 'SP-TEST-0001');
  assert.equal(liste.verfuegbarAnzahl, 1);
  assert.equal(aufrufe[0].variables.locationId, STANDORT_ID);
  assert.match(aufrufe[0].variables.query, /product_type:Sonderposten/);
  assert.doesNotMatch(aufrufe[0].variables.query, /archived/);
  assert.equal(await leseListe({ execute: async () => null }), null, 'Sammelmodus = kein Zugang');
});

test('verkaufeImLaden: Bestand 1 -> 0 mit changeFromQuantity, dann Felder, dann Gegenprobe', async () => {
  const { proxy, aufrufe, namen, zustand } = attrappe();
  const r = await verkaufeImLaden(proxy, { produktId: PRODUKT_ID, inventoryItemId: ITEM_ID, verkauftVon: 'Mona Mitarbeiter', jetzt: JETZT, schluessel: 'test-schluessel' });
  assert.deepEqual(namen(), ['SonderpostenEinzeln', 'SonderpostenLadenverkauf', 'SonderpostenVerkauftFelder', 'SonderpostenEinzeln']);
  const buchung = aufrufe[1].variables;
  assert.equal(buchung.schluessel, 'test-schluessel');
  assert.deepEqual(buchung.input.quantities, [{ inventoryItemId: ITEM_ID, locationId: STANDORT_ID, quantity: 0, changeFromQuantity: 1 }]);
  assert.equal(buchung.input.name, 'available');
  assert.equal(buchung.input.reason, 'correction');
  assert.equal(buchung.input.referenceDocumentUri, 'tp://laden-verkauf/SP-TEST-0001/2026-10-08T12:34:56Z');
  assert.deepEqual(aufrufe[2].variables.metafields.map(m => [m.key, m.type, m.value]), [
    ['verkauft_am', 'date_time', '2026-10-08T12:34:56Z'],
    ['verkauft_von', 'single_line_text_field', 'Mona Mitarbeiter'],
    ['verkauft_kanal', 'single_line_text_field', 'Laden'],
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.bestandVorher, 1);
  assert.equal(r.bestandNachher, 0, 'Gegenprobe liest den neuen Bestand');
  assert.equal(r.felderGesetzt, true);
  assert.equal(r.felderFehler, null);
  assert.equal(zustand.available, 0);
});

test('verkaufeImLaden: Bestand 0 -> 409, nichts geschrieben', async () => {
  const { proxy, namen } = attrappe({ available: 0 });
  await assert.rejects(
    verkaufeImLaden(proxy, { produktId: PRODUKT_ID, verkauftVon: 'Mona', jetzt: JETZT }),
    e => e instanceof SonderpostenFehler && e.status === 409 && /bereits verkauft/.test(e.message),
  );
  assert.deepEqual(namen(), ['SonderpostenEinzeln']);
});

test('verkaufeImLaden: Bestand 2 -> 409 mit Zahl, nichts geschrieben', async () => {
  const { proxy, namen } = attrappe({ available: 2 });
  await assert.rejects(verkaufeImLaden(proxy, { produktId: PRODUKT_ID, verkauftVon: 'Mona', jetzt: JETZT }), e => e.status === 409 && /aktuell 2/.test(e.message));
  assert.deepEqual(namen(), ['SonderpostenEinzeln']);
});

test('verkaufeImLaden: fehlendes write_inventory -> 403 mit Klartext, keine Metafelder', async () => {
  const { proxy, namen } = attrappe({ verweigert: true });
  await assert.rejects(
    verkaufeImLaden(proxy, { produktId: PRODUKT_ID, verkauftVon: 'Mona', jetzt: JETZT }),
    e => e.status === 403 && e.message === RECHT_FEHLT && e.extra.grund === 'recht-fehlt',
  );
  assert.ok(!namen().includes('SonderpostenVerkauftFelder'), 'ohne Bestandsbuchung keine Verkaufsfelder');
});

test('verkaufeImLaden: gleichzeitige Buchung (CAS) -> 409, keine Metafelder', async () => {
  const a = attrappe();
  // Zwischen Lesen und Buchen verkauft jemand anderes: die Attrappe sieht dann 0.
  const original = a.proxy.execute;
  a.proxy.execute = async (q, v) => {
    if (/mutation SonderpostenLadenverkauf/.test(q)) a.zustand.available = 0;
    return original(q, v);
  };
  await assert.rejects(verkaufeImLaden(a.proxy, { produktId: PRODUKT_ID, verkauftVon: 'Mona', jetzt: JETZT }), e => e.status === 409 && /gleichzeitig/.test(e.message));
  assert.ok(!a.namen().includes('SonderpostenVerkauftFelder'));
});

test('verkaufeImLaden: Felder scheitern -> Bestand trotzdem 0, Fehler wird gemeldet', async () => {
  const { proxy } = attrappe({ felderFehler: true });
  const r = await verkaufeImLaden(proxy, { produktId: PRODUKT_ID, verkauftVon: 'Mona', jetzt: JETZT });
  assert.equal(r.bestandNachher, 0);
  assert.equal(r.felderGesetzt, false);
  assert.match(r.felderFehler, /Wert nicht erlaubt/);
});

test('verkaufeImLaden: kein Sonderposten, Vorlage, falsche Item-ID, unbekanntes Produkt', async () => {
  await assert.rejects(verkaufeImLaden(attrappe({ productType: 'Teppichboden' }).proxy, { produktId: PRODUKT_ID }), e => e.status === 400);
  await assert.rejects(verkaufeImLaden(attrappe({ sku: 'SP-0000' }).proxy, { produktId: PRODUKT_ID }), e => e.status === 400);
  await assert.rejects(verkaufeImLaden(attrappe().proxy, { produktId: PRODUKT_ID, inventoryItemId: 'gid://shopify/InventoryItem/1' }), e => e.status === 409 && /neu laden/.test(e.message));
  await assert.rejects(verkaufeImLaden(attrappe().proxy, { produktId: 'gid://shopify/Product/1' }), e => e.status === 404);
  await assert.rejects(verkaufeImLaden(attrappe().proxy, { produktId: 'irgendwas' }), e => e.status === 400);
  await assert.rejects(verkaufeImLaden(attrappe({ tracked: false }).proxy, { produktId: PRODUKT_ID }), e => e.status === 409 && /Bestand verfolgen/.test(e.message));
});

test('alsDateTime und istZugriffVerweigert', () => {
  assert.equal(alsDateTime(JETZT), '2026-10-08T12:34:56Z');
  assert.equal(istZugriffVerweigert(new Error('Shopify GraphQL: Access denied for inventorySetQuantities field.')), true);
  assert.equal(istZugriffVerweigert(new Error('Shopify Admin API HTTP 503')), false);
});

// ---------------------------------------------------------------------------
// Review-Befunde 2026-10-09 (PR #986): Ueberverkauf und Antwortverlust.
// ---------------------------------------------------------------------------

test('Ueberverkauf erlaubt (CONTINUE) oder unbekannt: kein Knopf, keine Buchung', async () => {
  for (const policy of ['CONTINUE', null]) {
    const { proxy, namen } = attrappe({ policy });
    const { product } = await proxy.execute('query SonderpostenEinzeln', { id: PRODUKT_ID });
    const e = eintragAus(product);
    assert.equal(e.ueberverkaufGesperrt, false, String(policy));
    assert.equal(e.verkaufbar, false, `${policy}: Bestand 1, aber Bestand 0 wuerde den Onlinekauf nicht sperren`);
    await assert.rejects(
      verkaufeImLaden(proxy, { produktId: PRODUKT_ID, verkauftVon: 'Mona', jetzt: JETZT }),
      err => err.status === 409 && err.message === UEBERVERKAUF_OFFEN && err.extra.grund === 'ueberverkauf',
    );
    assert.deepEqual(namen(), ['SonderpostenEinzeln', 'SonderpostenEinzeln'], 'nur gelesen, nichts geschrieben');
  }
});

test('Gegenprobe: Bestand 0, aber Ueberverkauf inzwischen erlaubt -> ok false, onlineGesperrt false', async () => {
  const a = attrappe();
  const original = a.proxy.execute;
  a.proxy.execute = async (q, v) => {
    const r = await original(q, v);
    if (/mutation SonderpostenLadenverkauf/.test(q)) a.zustand.policy = 'CONTINUE';
    return r;
  };
  const r = await verkaufeImLaden(a.proxy, { produktId: PRODUKT_ID, verkauftVon: 'Mona', jetzt: JETZT });
  assert.equal(r.bestandNachher, 0);
  assert.equal(r.onlineGesperrt, false);
  assert.equal(r.ok, false, 'Bestand 0 allein ist nicht "online nicht mehr bestellbar"');
});

test('Antwortverlust nach der Buchung: erneutes Lesen zeigt 0 -> gebucht, Felder gesetzt', async () => {
  const { proxy, namen, zustand } = attrappe({ antwortWeg: 'nach' });
  const r = await verkaufeImLaden(proxy, { produktId: PRODUKT_ID, verkauftVon: 'Mona', jetzt: JETZT });
  assert.deepEqual(namen(), ['SonderpostenEinzeln', 'SonderpostenLadenverkauf', 'SonderpostenEinzeln', 'SonderpostenVerkauftFelder', 'SonderpostenEinzeln']);
  assert.equal(r.ok, true);
  assert.equal(r.gebucht, true);
  assert.equal(r.antwortVerloren, true);
  assert.equal(zustand.available, 0);
  assert.equal(zustand.felder.verkauft_kanal, 'Laden');
});

test('Antwortverlust vor der Buchung: Bestand weiterhin 1 -> 502 "nicht angekommen", keine Felder', async () => {
  const { proxy, namen, zustand } = attrappe({ antwortWeg: 'vor' });
  await assert.rejects(verkaufeImLaden(proxy, { produktId: PRODUKT_ID, verkauftVon: 'Mona', jetzt: JETZT }), e => {
    assert.equal(e.status, 502);
    assert.equal(e.extra.grund, 'nicht-angekommen');
    assert.match(e.message, /weiterhin 1/);
    return true;
  });
  assert.ok(!namen().includes('SonderpostenVerkauftFelder'));
  assert.equal(zustand.available, 1);
});

test('Antwortverlust und erneutes Lesen scheitert: "unklar", nie "nichts gebucht"', async () => {
  const { proxy, namen, zustand } = attrappe({ antwortWeg: 'nach', lesenScheitert: [2] });
  await assert.rejects(verkaufeImLaden(proxy, { produktId: PRODUKT_ID, verkauftVon: 'Mona', jetzt: JETZT }), e => {
    assert.equal(e.status, 504);
    assert.equal(e.extra.grund, 'unklar');
    assert.equal(e.message, ERGEBNIS_UNKLAR);
    assert.doesNotMatch(e.message, /nichts gebucht/);
    return true;
  });
  assert.equal(zustand.available, 0, 'Shopify hat tatsaechlich gebucht - genau deshalb darf die Meldung nicht "nichts gebucht" sagen');
  assert.ok(!namen().includes('SonderpostenVerkauftFelder'));
});

test('Gegenprobe scheitert nach erfolgreicher Buchung: Ergebnis statt Fehler', async () => {
  const { proxy, zustand } = attrappe({ lesenScheitert: [2] });
  const r = await verkaufeImLaden(proxy, { produktId: PRODUKT_ID, verkauftVon: 'Mona', jetzt: JETZT });
  assert.equal(r.gebucht, true);
  assert.equal(r.gegenprobe, 'fehlgeschlagen');
  assert.equal(r.ok, false);
  assert.equal(r.bestandNachher, null);
  assert.equal(zustand.available, 0);
  assert.equal(zustand.felder.verkauft_kanal, 'Laden');
});

test('Erstes Lesen scheitert: 502 "nichts gebucht" ist hier belegt - keine Mutation gesendet', async () => {
  const { proxy, namen } = attrappe({ lesenScheitert: [1] });
  await assert.rejects(verkaufeImLaden(proxy, { produktId: PRODUKT_ID, verkauftVon: 'Mona', jetzt: JETZT }),
    e => e.status === 502 && e.extra.grund === 'nicht-erreichbar' && /nichts gebucht/.test(e.message));
  assert.deepEqual(namen(), ['SonderpostenEinzeln']);
});
