// Restrollen (Tag "sonderposten", z. B. Passion Yasmin): im Laden verkaufte Laenge
// abbuchen. Laenge x volle Rollenbreite, auf ganze m2 aufgerundet, kommt vom
// Bestand; Compare-and-swap gegen Doppelbuchung, Gegenprobe, nie "nichts gebucht"
// auf Verdacht. Kein Test spricht echtes Shopify.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eintragAus, leseListe, verkaufeVonRolle, verkaufeImLaden, qmFuerLaenge, istRolle, SUCHE,
  SonderpostenFehler, RECHT_FEHLT_ROLLE, ERGEBNIS_UNKLAR,
} from '../lib/sonderposten.mjs';
import { attrappe, rohProdukt, PRODUKT_ID, ITEM_ID } from './sonderposten-attrappe.mjs';

const JETZT = new Date('2026-10-12T08:00:00.000Z');

async function wirft(fn, status, muster) {
  await assert.rejects(fn, (e) => {
    assert.ok(e instanceof SonderpostenFehler, `SonderpostenFehler erwartet, war ${e}`);
    assert.equal(e.status, status);
    if (muster) assert.match(e.message, muster);
    return true;
  });
}

test('qmFuerLaenge: Laenge x volle Breite, auf ganze m2 aufgerundet', () => {
  assert.equal(qmFuerLaenge(5, 4), 20);
  assert.equal(qmFuerLaenge(3.5, 4), 14);
  assert.equal(qmFuerLaenge(3.3, 4), 14, '13,2 m2 -> 14 (lieber zu wenig Rest anbieten)');
  assert.equal(qmFuerLaenge(2, 4), 8, 'ein Teppich 2 x 3 m verbraucht 2 m der 4-m-Rolle');
  assert.equal(qmFuerLaenge(0.25, 4), 1);
  assert.equal(qmFuerLaenge(0, 4), null);
  assert.equal(qmFuerLaenge(-1, 4), null);
  assert.equal(qmFuerLaenge(2, 0), null);
});

test('Liste: Restrolle mit Breite, Restlaenge und m2; Massprodukt ohne Rollenbreite fehlt', async () => {
  const massprodukt = rohProdukt({
    id: 'gid://shopify/Product/9100', titel: 'Kettelteppich nach Mass', status: 'DRAFT', productType: 'Teppich nach Maß',
    sku: null, tracked: true, available: 0, policy: 'DENY', tags: ['sonderposten', 'teppich-nach-mass'], felder: {},
  });
  const { proxy, aufrufe } = attrappe({ rolle: true, weitere: [massprodukt] });
  const liste = await leseListe(proxy, { jetzt: JETZT });
  assert.equal(liste.anzahl, 1);
  const e = liste.eintraege[0];
  assert.equal(e.typ, 'rolle');
  assert.equal(e.breiteM, 4);
  assert.equal(e.flaecheM2, 80);
  assert.equal(e.laengeM, 20);
  assert.equal(e.preis, 41.95);
  assert.equal(e.verkaufbar, true);
  assert.equal(istRolle(massprodukt), false);
  assert.match(aufrufe[0].variables.query, /tag:sonderposten/);
  assert.equal(aufrufe[0].variables.query, SUCHE);
});

test('Liste: Einzelstueck bleibt typ "stueck", Rolle mit Bestand 0 ist nicht verkaufbar', async () => {
  const { proxy } = attrappe();
  const { product } = await proxy.execute('query SonderpostenEinzeln', { id: PRODUKT_ID });
  assert.equal(eintragAus(product).typ, 'stueck');
  const leer = attrappe({ rolle: true, available: 0 });
  const { product: p0 } = await leer.proxy.execute('query SonderpostenEinzeln', { id: PRODUKT_ID });
  const e0 = eintragAus(p0);
  assert.equal(e0.verkaufbar, false);
  assert.equal(e0.onlineGesperrt, true);
  assert.equal(e0.laengeM, 0);
});

test('verkaufeVonRolle: 3,5 m -> 14 m2 ab, changeFromQuantity 80, Gegenprobe 66', async () => {
  const a = attrappe({ rolle: true });
  const r = await verkaufeVonRolle(a.proxy, { produktId: PRODUKT_ID, inventoryItemId: ITEM_ID, laengeM: 3.5, jetzt: JETZT, schluessel: 'k1' });
  assert.equal(r.ok, true);
  assert.equal(r.typ, 'rolle');
  assert.equal(r.qm, 14);
  assert.equal(r.bestandVorher, 80);
  assert.equal(r.bestandNachher, 66);
  assert.equal(r.restLaengeM, 16.5);
  assert.equal(a.zustand.available, 66);
  const buchung = a.aufrufe.find(x => x.name === 'SonderpostenLadenverkauf');
  assert.deepEqual(buchung.variables.input.quantities[0], { inventoryItemId: ITEM_ID, locationId: 'gid://shopify/Location/98426814798', quantity: 66, changeFromQuantity: 80 });
  assert.equal(buchung.variables.input.reason, 'correction');
  assert.equal(buchung.variables.schluessel, 'k1');
  assert.match(buchung.variables.input.referenceDocumentUri, /^tp:\/\/laden-verkauf\/test-restrolle\/2026-10-12T08:00:00Z\?laenge_cm=350&qm=14$/);
  assert.ok(!a.namen().includes('SonderpostenVerkauftFelder'), 'Restrolle: keine Verkaufsfelder, das Produkt bleibt im Shop');
});

test('verkaufeVonRolle: genau der Rest geht, mehr als der Rest -> 409, nichts geschrieben', async () => {
  const a = attrappe({ rolle: true, available: 14 });
  await wirft(() => verkaufeVonRolle(a.proxy, { produktId: PRODUKT_ID, laengeM: 3.6, jetzt: JETZT }), 409, /nur noch 14 m² \(3,5 m\)/);
  assert.ok(!a.namen().includes('SonderpostenLadenverkauf'));
  const r = await verkaufeVonRolle(a.proxy, { produktId: PRODUKT_ID, laengeM: 3.5, jetzt: JETZT });
  assert.equal(r.bestandNachher, 0);
  await wirft(() => verkaufeVonRolle(a.proxy, { produktId: PRODUKT_ID, laengeM: 1, jetzt: JETZT }), 409, /schon leer/);
});

test('verkaufeVonRolle: ungueltige Laenge -> 400 ohne Shopify-Aufruf', async () => {
  const a = attrappe({ rolle: true });
  for (const laengeM of [0, -2, 'abc', null, 101, 3.456]) {
    // eslint-disable-next-line no-await-in-loop
    await wirft(() => verkaufeVonRolle(a.proxy, { produktId: PRODUKT_ID, laengeM, jetzt: JETZT }), 400);
  }
  assert.equal(a.aufrufe.length, 0);
});

test('Weg vertauscht: Stueck-Buchung auf einer Rolle und Laenge auf einem Stueck -> 400, nichts geschrieben', async () => {
  const r = attrappe({ rolle: true });
  await wirft(() => verkaufeImLaden(r.proxy, { produktId: PRODUKT_ID, verkauftVon: 'Mona', jetzt: JETZT }), 400, /Restrolle/);
  const s = attrappe();
  await wirft(() => verkaufeVonRolle(s.proxy, { produktId: PRODUKT_ID, laengeM: 2, jetzt: JETZT }), 400, /keine Restrolle/);
  assert.ok(!r.namen().includes('SonderpostenLadenverkauf'));
  assert.ok(!s.namen().includes('SonderpostenLadenverkauf'));
});

test('verkaufeVonRolle: ohne gefuehrten Bestand oder mit Ueberverkauf -> 409, nichts geschrieben', async () => {
  for (const opt of [{ tracked: false }, { policy: 'CONTINUE' }]) {
    const a = attrappe({ rolle: true, ...opt });
    // eslint-disable-next-line no-await-in-loop
    await wirft(() => verkaufeVonRolle(a.proxy, { produktId: PRODUKT_ID, laengeM: 2, jetzt: JETZT }), 409);
    assert.ok(!a.namen().includes('SonderpostenLadenverkauf'), JSON.stringify(opt));
  }
});

test('verkaufeVonRolle: fehlendes write_inventory -> 403 mit Rollen-Handgriff', async () => {
  const a = attrappe({ rolle: true, verweigert: true });
  await wirft(() => verkaufeVonRolle(a.proxy, { produktId: PRODUKT_ID, laengeM: 2, jetzt: JETZT }), 403);
  await assert.rejects(() => verkaufeVonRolle(a.proxy, { produktId: PRODUKT_ID, laengeM: 2, jetzt: JETZT }), e => e.message === RECHT_FEHLT_ROLLE && e.extra.grund === 'recht-fehlt');
  assert.equal(a.zustand.available, 80);
});

test('verkaufeVonRolle: falsche Item-ID aus der Liste -> 409', async () => {
  const a = attrappe({ rolle: true });
  await wirft(() => verkaufeVonRolle(a.proxy, { produktId: PRODUKT_ID, inventoryItemId: 'gid://shopify/InventoryItem/1', laengeM: 2, jetzt: JETZT }), 409, /neu laden/);
});

test('Antwortverlust nach der Buchung: erneutes Lesen zeigt den neuen Bestand -> gebucht', async () => {
  const a = attrappe({ rolle: true, antwortWeg: 'nach' });
  const r = await verkaufeVonRolle(a.proxy, { produktId: PRODUKT_ID, laengeM: 2, jetzt: JETZT });
  assert.equal(r.gebucht, true);
  assert.equal(r.antwortVerloren, true);
  assert.equal(r.bestandNachher, 72);
  assert.equal(r.ok, true);
});

test('Antwortverlust vor der Buchung: Bestand unveraendert -> 502 "nicht angekommen"', async () => {
  const a = attrappe({ rolle: true, antwortWeg: 'vor' });
  await assert.rejects(() => verkaufeVonRolle(a.proxy, { produktId: PRODUKT_ID, laengeM: 2, jetzt: JETZT }), e => e.status === 502 && e.extra.grund === 'nicht-angekommen' && /weiterhin 80/.test(e.message));
  assert.equal(a.zustand.available, 80);
});

test('Antwortverlust und erneutes Lesen scheitert: "unklar", nie "nichts gebucht"', async () => {
  const a = attrappe({ rolle: true, antwortWeg: 'nach', lesenScheitert: [2] });
  await assert.rejects(() => verkaufeVonRolle(a.proxy, { produktId: PRODUKT_ID, laengeM: 2, jetzt: JETZT }), e => e.status === 504 && e.message === ERGEBNIS_UNKLAR);
});

test('Gegenprobe scheitert nach erfolgreicher Buchung: Ergebnis mit Hinweis statt Fehler', async () => {
  const a = attrappe({ rolle: true, lesenScheitert: [2] });
  const r = await verkaufeVonRolle(a.proxy, { produktId: PRODUKT_ID, laengeM: 2, jetzt: JETZT });
  assert.equal(r.gebucht, true);
  assert.equal(r.gegenprobe, 'fehlgeschlagen');
  assert.equal(r.ok, false);
  assert.equal(r.bestandErwartet, 72);
  assert.equal(a.zustand.available, 72);
});

test('Gleichzeitige Buchung (CAS): Bestand hat sich zwischen Lesen und Buchen geaendert -> 409', async () => {
  const a = attrappe({ rolle: true });
  const original = a.proxy.execute.bind(a.proxy);
  a.proxy.execute = async (q, v) => {
    // Kurz vor der Buchung verkauft jemand online 4 m2.
    if (/mutation SonderpostenLadenverkauf/.test(q)) a.zustand.available = 76;
    return original(q, v);
  };
  await wirft(() => verkaufeVonRolle(a.proxy, { produktId: PRODUKT_ID, laengeM: 2, jetzt: JETZT }), 409, /gleichzeitig/);
  assert.equal(a.zustand.available, 76);
});
