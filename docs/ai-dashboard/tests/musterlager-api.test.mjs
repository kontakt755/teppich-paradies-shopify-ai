// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner (siehe _testumgebung.mjs).
import { PRIVAT_DIR } from './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi, ApiError } from '../../../scripts/dashboard-api.mjs';

// Nur synthetische Daten: erfundene Kunden, ausgedachte SKUs.
const muster = (li, sku, farbe) => ({
  id: `gid://shopify/LineItem/${li}`, sku, title: 'Muster Testteppich', variantTitle: farbe, quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1,
  customAttributes: [], originalUnitPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } },
  variant: { id: `gid://shopify/ProductVariant/9${li}`, sku, title: farbe, metafields: { nodes: [] }, lieferant: { nodes: [] },
    product: { id: 'gid://shopify/Product/9', handle: 'muster-testteppich', title: 'Muster Testteppich', productType: 'Musterservice', metafields: { nodes: [] }, grosshandel: { nodes: [] } } },
});
const bestellung = (nr, zeilen, datum) => ({
  id: `gid://shopify/Order/${nr}`, name: `#T${nr}`, createdAt: datum, cancelledAt: null,
  displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', customAttributes: [], tags: [],
  customer: { id: `gid://shopify/Customer/${nr}`, displayName: `Testkunde ${nr}`, email: `testkunde${nr}@example.invalid`, phone: null },
  totalPriceSet: { shopMoney: { amount: '0.00', currencyCode: 'EUR' } }, fulfillments: [], lineItems: { nodes: zeilen },
});
const ALT = 'gid://shopify/Order/1';
const NEU = 'gid://shopify/Order/2';
const MONA = { name: 'Mona Mitarbeiter', kuerzel: 'mona', rolle: 'mitarbeiter' };

function privat() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-musterlager-'));
  fs.mkdirSync(path.join(dir, 'bestelluebersicht'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), JSON.stringify({ orders: [
    bestellung(1, [muster(11, 'M-TESTTEP4_101', 'Grau')], '2026-01-01T10:00:00Z'),
    bestellung(2, [muster(21, 'M-TESTTEP4_101', 'Grau'), muster(22, 'M-TESTTEP4_102', 'Blau')], '2026-01-03T10:00:00Z'),
  ] }));
  fs.mkdirSync(path.join(dir, 'lexikon'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'lexikon', 'produkte.json'), JSON.stringify({ erstellt: '2026-01-01T00:00:00Z', produkte: [
    { handle: 'testteppich-teppichboden-400cm-500cm', titel: 'Testteppich Teppichboden 400cm 500cm', produktgruppe: 'Teppichboden',
      muster: { vorhanden: true, handle: 'muster-testteppich' },
      varianten: [{ farbe: 'Grau', sku: 'TESTTEP4_101' }, { farbe: 'Grau', sku: 'TESTTEP5_101' }, { farbe: 'Blau', sku: 'TESTTEP4_102' }] },
    { handle: 'muster-testteppich', titel: 'Muster Testteppich', produktgruppe: 'Musterservice',
      varianten: [{ farbe: 'Grau', sku: 'M-TESTTEP4_101' }, { farbe: 'Blau', sku: 'M-TESTTEP4_102' }] },
  ] }));
  return dir;
}

function umgebung() {
  const dir = privat();
  const api = createApi({ gh: async () => '', root: dir, privatDirPath: dir, now: () => new Date('2026-01-05T10:00:00Z') });
  const position = (orderId, li) => api.kundenBestellungen().zeilen.find(z => z.orderId === orderId).auftrag.positionen.find(p => p.lineItemId === `gid://shopify/LineItem/${li}`);
  return { dir, api, position };
}

test('Farben zum Einlagern: aus Produkt und Musterprodukt, alle Breiten einer Farbe zusammen', () => {
  const { api } = umgebung();
  const f = api.einkaufMusterlagerFarben({ handle: 'testteppich-teppichboden-400cm-500cm' });
  assert.equal(f.titel, 'Testteppich Teppichboden');
  assert.deepEqual(f.farben.map(x => [x.farbe, x.schluessel, x.imLager]), [['Grau', ['TESTTEP4_101', 'TESTTEP5_101'], false], ['Blau', ['TESTTEP4_102'], false]]);
  // Das Musterprodukt selbst gewaehlt: dieselben Farben.
  assert.deepEqual(api.einkaufMusterlagerFarben({ handle: 'muster-testteppich' }).farben.map(x => x.farbe), ['Grau', 'Blau']);
  assert.equal(api.einkaufMusterlagerFarben({ handle: 'gibt-es-nicht' }).verfuegbar, false);
});

test('Einlagern -> aelteste offene Musterbestellung kommt aus dem Lager, verschicken zaehlt ab, Nachfuellen gibt das naechste frei', async () => {
  const { dir, api, position } = umgebung();
  const r = await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: 'testteppich-teppichboden-400cm-500cm', farben: ['Grau'], art: 'einzel', anzahl: 1, ort: 'Regal B' }, MONA);
  assert.deepEqual([r.ok, r.anzahl, r.neu], [true, 1, 1]);
  const id = r.eintraege[0].id;

  const alt = position(ALT, 11);
  assert.deepEqual([alt.musterHerkunft, alt.musterHerkunftQuelle, alt.musterLager.ort], ['eigen_versand', 'lager', 'Regal B']);
  const neu = position(NEU, 21);
  assert.equal(neu.musterHerkunft, undefined, 'nur ein Einzelmuster da: die neuere Bestellung geht an den Lieferanten');
  assert.equal(neu.musterLagerLeer.ort, 'Regal B');
  assert.equal(position(NEU, 22).musterLager, undefined, 'andere Farbe bleibt unberuehrt');

  let lager = api.einkaufMusterlager();
  assert.deepEqual(lager.eintraege[0].stand, { verbraucht: 0, reserviert: 1, rest: 0, reichtNoch: null, jeStueck: null });
  assert.deepEqual(lager.eintraege[0].offeneBestellungen.map(o => o.orderName), ['#T1']);

  // Verschickt (ein Klick auf Heute): die Zuordnung wird festgeschrieben.
  const s = await api.einkaufAuftragsstatusSetzen({ aktion: 'schritt', orderId: ALT, schritt: 'kunde_hat_muster' }, MONA);
  assert.equal(s.ok, true);
  const ereignisse = JSON.parse(fs.readFileSync(path.join(dir, 'musterherkunft.json'), 'utf8')).ereignisse;
  assert.deepEqual(ereignisse.map(e => [e.orderId, e.lagerId, e.von]), [[ALT, id, 'Mona Mitarbeiter']]);
  lager = api.einkaufMusterlager();
  assert.deepEqual(lager.eintraege[0].stand, { verbraucht: 1, reserviert: 0, rest: 0, reichtNoch: null, jeStueck: null });
  assert.equal(position(ALT, 11).musterLager.id, id, 'bleibt als Lagerware erkennbar');

  // Nachgefuellt: "noch 1 da" -> Gesamtzahl 2, die neuere Bestellung kommt jetzt aus dem Lager.
  await api.einkaufMusterlagerSetzen({ aktion: 'aendern', id, anzahl: 2 }, MONA);
  assert.equal(position(NEU, 21).musterHerkunftQuelle, 'lager');

  // Leer gesetzt: wieder beim Lieferanten.
  await api.einkaufMusterlagerSetzen({ aktion: 'aendern', id, leer: true }, MONA);
  assert.equal(position(NEU, 21).musterHerkunft, undefined);

  // Die Bestellmail-Quelle sieht dasselbe: ohne Lager steht das Muster wieder "zu bestellen".
  await api.einkaufMusterlagerSetzen({ aktion: 'entfernen', id }, MONA);
  assert.equal(api.einkaufMusterlager().eintraege.length, 0);
  assert.equal(position(NEU, 21).musterLagerLeer, undefined);
});

test('Einzelposition "An Kunden raus" schreibt die Lagerzuordnung ebenfalls fest; "bestellt" nicht', async () => {
  const { dir, api } = umgebung();
  await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', schluessel: ['TESTTEP4_101'], titel: 'Testteppich Teppichboden', farbe: 'Grau', art: 'bahn', anzahl: 1 }, MONA);
  await api.einkaufAuftragsstatusSetzen({ orderId: NEU, lineItemId: 'gid://shopify/LineItem/22', status: 'bestellt' }, MONA);
  assert.equal(fs.existsSync(path.join(dir, 'musterherkunft.json')), false, '"bestellt" ist kein Abgang aus dem Lager');
  await api.einkaufAuftragsstatusSetzen({ orderId: NEU, lineItemId: 'gid://shopify/LineItem/21', status: 'raus' }, MONA);
  const e = JSON.parse(fs.readFileSync(path.join(dir, 'musterherkunft.json'), 'utf8')).ereignisse;
  assert.deepEqual(e.map(x => [x.lineItemId, x.herkunft, !!x.lagerId]), [['gid://shopify/LineItem/21', 'eigen_versand', true]]);
  // Von einer Bahn schneiden wir zu: kein Abzaehlen, aber "1x verschickt".
  assert.deepEqual(api.einkaufMusterlager().eintraege[0].stand, { verbraucht: 1, reserviert: 1, rest: null, reichtNoch: 25, jeStueck: 27 }, 'Bahn: 27 A5-Muster minus verschickt minus reserviert');
});

test('Fehlerfaelle: unbekannte Aktion, fehlende Farbe, beschaedigtes Lager haelt keine Bestellansicht auf', async () => {
  const { dir, api } = umgebung();
  await assert.rejects(api.einkaufMusterlagerSetzen({ aktion: 'zaubern' }, MONA), e => e instanceof ApiError && e.status === 400);
  await assert.rejects(api.einkaufMusterlagerSetzen({ aktion: 'einlagern', art: 'einzel' }, MONA), e => e instanceof ApiError && e.status === 400);
  await assert.rejects(api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: 'testteppich-teppichboden-400cm-500cm', farben: ['Lila'], art: 'einzel' }, MONA), /Lila/);
  await assert.rejects(api.einkaufMusterlagerSetzen({ aktion: 'aendern', id: 'ml-gibtsnicht', leer: true }, MONA), e => e.status === 400);
  fs.writeFileSync(path.join(dir, 'musterlager.json'), '{kaputt');
  assert.equal(api.kundenBestellungen().verfuegbar, true);
  const l = api.einkaufMusterlager();
  assert.deepEqual([l.verfuegbar, l.fehler], [false, true]);
  await assert.rejects(api.einkaufMusterlagerSetzen({ aktion: 'einlagern', schluessel: ['X'], titel: 'X', art: 'einzel' }, MONA), /beschädigt/);
});

async function mitServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Server: /api/einkauf/musterlager - lesen sieht, schreibt nicht (403); mitarbeiter 200', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const dir = privat();
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-1', rolle: 'mitarbeiter' });
  schreibeBenutzer(liste, path.join(dir, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = dir;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=musterlager-rollen');
  delete process.env.TP_DASHBOARD_PASSWORT;
  try {
    await mitServer(mod.requestHandler, async base => {
      const anmelden = async (name, passwort) => {
        const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passwort }) });
        assert.equal(r.status, 200);
        return r.headers.get('set-cookie').split(';')[0];
      };
      const einlagern = keks => fetch(`${base}/api/einkauf/musterlager`, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: keks },
        body: JSON.stringify({ aktion: 'einlagern', handle: 'testteppich-teppichboden-400cm-500cm', farben: ['Blau'], art: 'probestueck', ort: 'Keller' }),
      });
      const lena = await anmelden('lena', 'platzhalter-lesen-1');
      assert.equal((await einlagern(lena)).status, 403);
      assert.equal(fs.existsSync(path.join(dir, 'musterlager.json')), false);
      const lesen = await fetch(`${base}/api/einkauf/musterlager`, { headers: { cookie: lena } });
      assert.equal(lesen.status, 200);
      assert.equal((await fetch(`${base}/api/einkauf/musterlager-farben?handle=muster-testteppich`, { headers: { cookie: lena } })).status, 200);

      const mona = await anmelden('mona', 'platzhalter-mitarbeiter-1');
      const ok = await einlagern(mona);
      assert.equal(ok.status, 200);
      assert.equal((await ok.json()).eintraege[0].angelegtVon, 'Mona Mitarbeiter');
      assert.equal((await fetch(`${base}/api/einkauf/musterlager-farben`, { method: 'POST', headers: { cookie: mona } })).status, 405);
    });
  } finally {
    process.env.TP_PRIVAT_DIR = PRIVAT_DIR;
  }
});

test('Rest pruefen (Regel 2026-10-21): Abgleich gegen A/C, Einlagern als Verlegerest', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-reste-'));
  fs.mkdirSync(path.join(dir, 'lexikon'), { recursive: true });
  const v = (sku, farbe, farbnummer) => ({ sku, farbe, einkauf: { lieferant: 'A', produktname: 'Teppichboden Orbis 400 cm Linie 027', farbnummer, hersteller: 'Xantos Yarns Europe NV' } });
  fs.writeFileSync(path.join(dir, 'lexikon', 'produkte.json'), JSON.stringify({ erstellt: '2026-01-01T00:00:00Z', produkte: [
    { handle: 'kalvia-teppichboden', titel: 'Kalvia Teppichboden 400cm', produktgruppe: 'Teppichboden', status: 'ACTIVE', varianten: [v('TEPORBIS4_033', 'Sand', '33'), v('TEPORBIS4_098', 'Graphit', '98')] },
  ] }));
  const api = createApi({ gh: async () => '', root: dir, privatDirPath: dir, now: () => new Date('2026-01-05T10:00:00Z') });

  const r = api.einkaufResteAbgleich({ hersteller: 'XY', qualitaet: 'Orbis', farbnummer: '033' });
  assert.equal(r.verfuegbar, true);
  assert.deepEqual(r.treffer.map(t => [t.handle, t.titel, t.lieferant, t.farbeGefunden]), [['kalvia-teppichboden', 'Kalvia Teppichboden', 'A', true]]);
  assert.deepEqual(r.treffer[0].farben.map(f => [f.farbe, f.imLager]), [['Sand', false]]);
  assert.deepEqual(api.einkaufResteAbgleich({ hersteller: 'Quorra Mills', qualitaet: 'Orbis' }).treffer, []);
  assert.throws(() => api.einkaufResteAbgleich({}), e => e instanceof ApiError && e.status === 400);

  const e = await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: 'kalvia-teppichboden', farben: ['Sand'], art: 'rest', anzahl: 1, ort: 'Reste-Regal' }, MONA);
  assert.equal(e.eintraege[0].art, 'rest');
  const lager = api.einkaufMusterlager();
  assert.equal(lager.arten.rest, 'Verlegerest');
  assert.deepEqual(lager.reste.lieferanten, ['A', 'C']);
  assert.equal(api.einkaufResteAbgleich({ qualitaet: 'Orbis', farbnummer: '33' }).treffer[0].farben[0].imLager, true);
});
