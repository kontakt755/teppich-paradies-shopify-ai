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
    { handle: 'testteppich-1234-restrolle', titel: 'Testteppich 1234 – Restposten, 500 cm', produktgruppe: 'Teppichboden',
      muster: { vorhanden: false, handle: null }, varianten: [{ farbe: null, sku: 'TPRTEST-ROLLE' }] },
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

test('Artikel ohne Farboption (Restrolle) laesst sich einlagern: ein Eintrag "Ganzer Artikel", gespeichert ohne Farbe', async () => {
  const { api } = umgebung();
  const f = api.einkaufMusterlagerFarben({ handle: 'testteppich-1234-restrolle' });
  assert.deepEqual(f.farben.map(x => [x.farbe, x.schluessel]), [['Ganzer Artikel', ['TPRTEST-ROLLE']]]);
  const r = await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: 'testteppich-1234-restrolle', farben: ['Ganzer Artikel'], art: 'einzel', anzahl: 15, notiz: 'mehr da' }, MONA);
  assert.equal(r.anzahl, 1);
  const e = r.eintraege[0];
  assert.deepEqual([e.titel, e.farbe, e.anzahl, e.schluessel, e.notiz], ['Testteppich 1234 – Restposten', null, 15, ['TPRTEST-ROLLE'], 'mehr da']);
  assert.equal(api.einkaufMusterlagerFarben({ handle: 'testteppich-1234-restrolle' }).farben[0].imLager, true);
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

test('Nichts doppelt bis Bestand 0 (Inhaber 02.11.): Lagerware laesst sich nicht bestellen, leer gesetzt wieder schon', async () => {
  const { api, position } = umgebung();
  const r = await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: 'testteppich-teppichboden-400cm-500cm', farben: ['Grau'], art: 'einzel', anzahl: 1 }, MONA);
  const id = r.eintraege[0].id;
  const li11 = 'gid://shopify/LineItem/11', li21 = 'gid://shopify/LineItem/21';
  const abgelehnt = versuch => assert.rejects(versuch, e => e instanceof ApiError && e.status === 409 && /Musterlager/.test(e.message));

  await abgelehnt(api.einkaufAuftragsstatusSetzen({ orderId: ALT, lineItemId: li11, status: 'bestellt' }, MONA));
  await abgelehnt(api.einkaufAuftragsstatusSetzen({ aktion: 'schritt', orderId: ALT, schritt: 'bestellt' }, MONA));
  await abgelehnt(api.einkaufAuftragsstatusSetzen({ aktion: 'musterHerkunft', orderId: ALT, lineItemId: li11, herkunft: 'lieferant' }, MONA));
  assert.equal(position(ALT, 11).musterHerkunftQuelle, 'lager', 'bleibt Lagerware');
  assert.equal(api.einkaufMusterlager().eintraege[0].stand.reserviert, 1);

  // Das letzte Stueck ist vergeben: die neuere Bestellung darf zum Lieferanten.
  await api.einkaufAuftragsstatusSetzen({ orderId: NEU, lineItemId: li21, status: 'bestellt' }, MONA);

  // Leer gesetzt, z. B. Muster beschaedigt: wieder normal bestellbar.
  await api.einkaufMusterlagerSetzen({ aktion: 'aendern', id, leer: true }, MONA);
  await api.einkaufAuftragsstatusSetzen({ orderId: ALT, lineItemId: li11, status: 'bestellt' }, MONA);
  assert.equal(position(ALT, 11).musterLager, undefined);
});

test('Gemischter Sammelschritt "bestellt": nur was nicht im Lager liegt', async () => {
  const { api } = umgebung();
  // Beide Grau-Muster und Blau offen, zwei Grau im Lager: in #T2 ist nur Blau zu bestellen.
  await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: 'testteppich-teppichboden-400cm-500cm', farben: ['Grau'], art: 'einzel', anzahl: 2 }, MONA);
  await api.einkaufAuftragsstatusSetzen({ aktion: 'schritt', orderId: NEU, schritt: 'bestellt' }, MONA);
  const status = api.einkaufAuftragsstatus().positionen ?? api.einkaufAuftragsstatus();
  const von = li => Object.entries(status).find(([k]) => k.endsWith(`LineItem/${li}`))?.[1]?.status;
  assert.equal(von(22), 'bestellt');
  assert.equal(von(21), undefined, 'Grau kommt aus dem Lager');
});

test('Jeder Abgang zaehlt ab: "Kunde fertig" und Einzelstatus "erledigt"', async () => {
  const { api } = umgebung();
  await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: 'testteppich-teppichboden-400cm-500cm', farben: ['Grau'], art: 'einzel', anzahl: 3 }, MONA);
  await api.kundenBestellungFertig({ orderId: ALT, lineItemIds: ['gid://shopify/LineItem/11'] }, MONA);
  assert.deepEqual(api.einkaufMusterlager().eintraege[0].stand, { verbraucht: 1, reserviert: 1, rest: 1, reichtNoch: null, jeStueck: null });
  await api.einkaufAuftragsstatusSetzen({ orderId: NEU, lineItemId: 'gid://shopify/LineItem/21', status: 'erledigt' }, MONA);
  assert.deepEqual(api.einkaufMusterlager().eintraege[0].stand, { verbraucht: 2, reserviert: 0, rest: 1, reichtNoch: null, jeStueck: null });
});

test('Wahl "haben wir da" belegt ein Stueck und zaehlt beim Verschicken ab', async () => {
  const { dir, api, position } = umgebung();
  await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: 'testteppich-teppichboden-400cm-500cm', farben: ['Grau'], art: 'einzel', anzahl: 1 }, MONA);
  // Die neuere Bestellung nimmt ausdruecklich das letzte Stueck: die aeltere bekommt es nicht ein zweites Mal versprochen.
  await api.einkaufAuftragsstatusSetzen({ aktion: 'musterHerkunft', orderId: NEU, lineItemId: 'gid://shopify/LineItem/21', herkunft: 'eigen_versand' }, MONA);
  assert.equal(position(NEU, 21).musterLagerReserviert, true);
  assert.equal(position(ALT, 11).musterHerkunft, undefined);
  assert.ok(position(ALT, 11).musterLagerLeer);
  await api.einkaufAuftragsstatusSetzen({ orderId: NEU, lineItemId: 'gid://shopify/LineItem/21', status: 'raus' }, MONA);
  const e = JSON.parse(fs.readFileSync(path.join(dir, 'musterherkunft.json'), 'utf8')).ereignisse;
  assert.equal(e.filter(x => x.lagerId).length, 1);
  assert.deepEqual(api.einkaufMusterlager().eintraege[0].stand, { verbraucht: 1, reserviert: 0, rest: 0, reichtNoch: null, jeStueck: null });
});

test('Packstation "Aus dem Lager genommen" (09.11.): beim Lieferanten bestellt, liegt aber im Lager - Lager 3 -> 2 sofort', async () => {
  const { dir, api, position } = umgebung();
  await api.einkaufAuftragsstatusSetzen({ orderId: ALT, lineItemId: 'gid://shopify/LineItem/11', status: 'bestellt' }, MONA);
  const r = await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: 'testteppich-teppichboden-400cm-500cm', farben: ['Grau'], art: 'einzel', anzahl: 3, ort: 'Regal B' }, MONA);
  const id = r.eintraege[0].id;
  // NEU/21 ist offen und reserviert eins; ALT/11 ist bestellt: nur das Angebot.
  assert.deepEqual(api.einkaufMusterlager().eintraege[0].stand.rest, 2);
  assert.deepEqual(position(ALT, 11).musterLagerMoeglich, { id, artLabel: 'Einzelmuster', ort: 'Regal B' });
  const kunde = () => api.kundenMusterPacken().kunden.find(k => k.muster.some(m => m.lineItemId === 'gid://shopify/LineItem/11'));
  const m = () => kunde().muster.find(x => x.lineItemId === 'gid://shopify/LineItem/11');
  assert.deepEqual(m().lagerMoeglich, { id, ort: 'Regal B' });
  assert.equal(m().stand, 'bestellt');

  await assert.rejects(api.kundenMusterPackenSchreiben({ aktion: 'aus-lager', packSchluessel: kunde().packSchluessel, lineItemId: 'gid://shopify/LineItem/11' }, { ...MONA, rolle: 'lesen' }), e => e.status === 403);
  // Ohne erkennbare Person (kein Benutzer, gh nicht angemeldet): kein Abgang unter "Inhaber".
  await assert.rejects(api.kundenMusterPackenSchreiben({ aktion: 'aus-lager', packSchluessel: kunde().packSchluessel, lineItemId: 'gid://shopify/LineItem/11' }, null), e => e.status === 403);
  const statusVorher = JSON.parse(fs.readFileSync(path.join(dir, 'auftragsstatus.json'), 'utf8'));
  const a = await api.kundenMusterPackenSchreiben({ aktion: 'aus-lager', packSchluessel: kunde().packSchluessel, lineItemId: 'gid://shopify/LineItem/11' }, MONA);
  assert.equal(a.ok, true);
  assert.match(a.hinweis, /bei Ankunft ins Musterlager/);
  // Danach abhaken: die Lieferantenbestellung bleibt "bestellt" - das Muster kam aus dem Lager, nicht vom Lieferanten.
  await api.kundenMusterPackenSchreiben({ aktion: 'haken', packSchluessel: kunde().packSchluessel, lineItemIds: ['gid://shopify/LineItem/11'], an: true }, MONA);
  const statusNachher = JSON.parse(fs.readFileSync(path.join(dir, 'auftragsstatus.json'), 'utf8'));
  const st = x => JSON.stringify(x).match(/LineItem\/11[^}]*?"status":"(\w+)"/)?.[1];
  assert.equal(st(statusVorher), 'bestellt');
  assert.equal(st(statusNachher), 'bestellt', 'kein falsches "geliefert" beim Abhaken');
  const stand = api.einkaufMusterlager().eintraege[0].stand;
  assert.deepEqual([stand.verbraucht, stand.reserviert, stand.rest], [1, 1, 1], 'Lager 3: eins genommen, eins reserviert -> 1 frei');
  assert.deepEqual([m().lagerOrt, m().lagerMoeglich], ['Regal B', undefined]);
  // Zweiter Klick (alte Seite): abgelehnt, kein doppeltes Abzaehlen.
  await assert.rejects(api.kundenMusterPackenSchreiben({ aktion: 'aus-lager', packSchluessel: kunde().packSchluessel, lineItemId: 'gid://shopify/LineItem/11' }, MONA), e => e.status === 409);
  const ev = JSON.parse(fs.readFileSync(path.join(dir, 'musterherkunft.json'), 'utf8')).ereignisse;
  assert.deepEqual(ev.map(e => [e.lineItemId, e.lagerId]), [['gid://shopify/LineItem/11', id]]);
});

test('Packstation "Ins Lager aufnehmen" (11.11.): Stueckzahl ins selbe Musterlager, alle Breiten der Farbe, zweites Mal addiert', async () => {
  const { api } = umgebung();
  // Schon angekommen: das Stueck fuer den Kunden liegt hier, ein weiteres ist uebrig.
  await api.einkaufAuftragsstatusSetzen({ orderId: NEU, lineItemId: 'gid://shopify/LineItem/22', status: 'bestellt' }, MONA);
  const kunde = () => api.kundenMusterPacken().kunden.find(k => k.muster.some(m => m.lineItemId === 'gid://shopify/LineItem/11'));
  const ruf = (lineItemId, anzahl, wer = MONA) => api.kundenMusterPackenSchreiben({ aktion: 'ins-lager', packSchluessel: api.kundenMusterPacken().kunden.find(k => k.muster.some(m => m.lineItemId === lineItemId)).packSchluessel, lineItemId, anzahl }, wer);
  await assert.rejects(ruf('gid://shopify/LineItem/22', 1, { ...MONA, rolle: 'lesen' }), e => e.status === 403);
  for (const falsch of [0, 1.5, 100, 'x']) await assert.rejects(ruf('gid://shopify/LineItem/22', falsch), e => e.status === 400);
  await assert.rejects(api.kundenMusterPackenSchreiben({ aktion: 'ins-lager', packSchluessel: kunde().packSchluessel, lineItemId: 'gid://shopify/LineItem/999', anzahl: 1 }, MONA), e => e.status === 409);
  assert.equal(api.einkaufMusterlager().eintraege.length, 0, 'abgelehnte Aufrufe schreiben nichts');

  const r = await ruf('gid://shopify/LineItem/22', 2);
  assert.deepEqual([r.ok, r.anzahl, r.gesamt], [true, 2, 2]);
  const [e] = api.einkaufMusterlager().eintraege;
  assert.deepEqual([e.titel, e.farbe, e.art, e.anzahl, e.schluessel], ['Testteppich Teppichboden', 'Blau', 'einzel', 2, ['TESTTEP4_102']]);
  // Ohne Angabe 1 Stueck; dieselbe Farbe steht nicht zweimal im Lager.
  assert.equal((await ruf('gid://shopify/LineItem/22')).gesamt, 3);
  // Grau hat zwei Breiten: beide Artikelnummern, wie beim Einlagern aus der Produktsuche.
  await ruf('gid://shopify/LineItem/11', 1);
  const grau = api.einkaufMusterlager().eintraege.find(x => x.farbe === 'Grau');
  assert.deepEqual(grau.schluessel, ['TESTTEP4_101', 'TESTTEP5_101']);
  assert.equal(api.einkaufMusterlager().eintraege.length, 2);
});

test('Shop-Hinweis "Muster sofort lieferbar": nur mit Freigabe, nur bei Aenderung, bei 0 sofort weg', async () => {
  const dir = privat();
  let wert = null;
  const aufrufe = [];
  const proxy = { async execute(q, v) {
    aufrufe.push(q.includes('metafieldsSet') ? 'set' : 'get');
    if (q.includes('metafieldsSet')) { wert = v.m[0].value; return { metafieldsSet: { userErrors: [] } }; }
    return { shop: { id: 'gid://shopify/Shop/1', metafield: wert ? { value: wert } : null } };
  } };
  const api = createApi({ gh: async () => '', root: dir, privatDirPath: dir, now: () => new Date('2026-01-05T10:00:00Z'), shopifyZugang: async () => ({ proxy }) });
  const skus = () => JSON.parse(wert).skus;
  const r = await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: 'testteppich-teppichboden-400cm-500cm', farben: ['Blau'], art: 'einzel', anzahl: 2 }, MONA);
  assert.deepEqual(await api.musterSofortAbgleich(), { status: 'aus' });
  assert.equal(aufrufe.length, 0, 'ohne Freigabe kein Shopify-Aufruf');

  fs.writeFileSync(path.join(dir, 'muster-sofort-shop.json'), JSON.stringify({ aktiv: true }));
  // Blau: 2 da, NEU/22 reserviert eins -> 1 frei, also im Shop.
  assert.equal((await api.musterSofortAbgleich()).status, 'geschrieben');
  assert.deepEqual(skus(), ['TESTTEP4_102']);
  assert.equal((await api.musterSofortAbgleich()).status, 'unveraendert');
  // Anzahl auf 1: das eine ist reserviert, nichts mehr frei -> Hinweis weg.
  await api.einkaufMusterlagerSetzen({ aktion: 'aendern', id: r.eintraege[0].id, anzahl: 1 }, MONA);
  await api.musterSofortAbgleich();
  assert.deepEqual(skus(), []);
});

test('Shop-Hinweis: eine Datenkopie schreibt nie, auch wenn sie die Freigabe mitbringt', async () => {
  const dir = privat();
  fs.writeFileSync(path.join(dir, 'muster-sofort-shop.json'), JSON.stringify({ aktiv: true }));
  let aufrufe = 0;
  const api = createApi({ gh: async () => '', root: dir, privatDirPath: dir, env: { TP_DASHBOARD_DATENKOPIE: dir }, shopifyZugang: async () => ({ proxy: { async execute() { aufrufe += 1; return {}; } } }) });
  assert.deepEqual(await api.musterSofortAbgleich(), { status: 'datenkopie' });
  assert.equal(aufrufe, 0);
});

test('Packstation: abgehaktes Muster bekommt keinen Knopf "Aus dem Lager genommen" (kein Fehlklick)', async () => {
  const { api } = umgebung();
  await api.einkaufAuftragsstatusSetzen({ orderId: ALT, lineItemId: 'gid://shopify/LineItem/11', status: 'bestellt' }, MONA);
  await api.einkaufMusterlagerSetzen({ aktion: 'einlagern', handle: 'testteppich-teppichboden-400cm-500cm', farben: ['Grau'], art: 'einzel', anzahl: 3 }, MONA);
  const kunde = () => api.kundenMusterPacken().kunden.find(k => k.muster.some(m => m.lineItemId === 'gid://shopify/LineItem/11'));
  const m = () => kunde().muster.find(x => x.lineItemId === 'gid://shopify/LineItem/11');
  assert.ok(m().lagerMoeglich);
  await api.kundenMusterPackenSchreiben({ aktion: 'haken', packSchluessel: kunde().packSchluessel, lineItemIds: ['gid://shopify/LineItem/11'], an: true }, MONA);
  assert.equal(m().lagerMoeglich, undefined);
});
