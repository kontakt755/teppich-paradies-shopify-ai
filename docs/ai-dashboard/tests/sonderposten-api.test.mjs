import { PRIVAT_DIR } from './_testumgebung.mjs'; // muss zuerst stehen: TP_PRIVAT_DIR und kein echter Shopify-Zugang
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { wegwerfOrdner } from '../../../scripts/test-temp.mjs';
import { createApi, ApiError } from '../../../scripts/dashboard-api.mjs';
import { RECHT_FEHLT, ERGEBNIS_UNKLAR, UEBERVERKAUF_OFFEN } from '../../../operations/lib/sonderposten.mjs';
import { attrappe, PRODUKT_ID, ITEM_ID } from '../../../operations/tests/sonderposten-attrappe.mjs';

const JETZT = new Date('2026-10-08T09:15:00.000Z');
const MONA = { name: 'Mona Mitarbeiter', kuerzel: 'mona', rolle: 'mitarbeiter' };
// So meldet die Anmeldung den gemeinsamen Zugang (Einzelpasswort): Name "Inhaber", kein Kuerzel.
const NOTZUGANG = { name: 'Inhaber', kuerzel: null, rolle: 'inhaber' };
const INVENTUR = { produktId: PRODUKT_ID, inventoryItemId: ITEM_ID, laengeM: 12, erwarteterBestand: 80, operationId: 'e143b490-5db8-40d3-a75b-31c4b8ddf864' };

function protokoll() {
  const datei = path.join(process.env.TP_PRIVAT_DIR, 'protokoll.jsonl');
  if (!fs.existsSync(datei)) return [];
  return fs.readFileSync(datei, 'utf8').split('\n').filter(Boolean).map(z => JSON.parse(z));
}

function apiMit(a) {
  const root = wegwerfOrdner('tp-sonderposten-root-');
  return createApi({ root, now: () => JETZT, shopifyZugang: async () => ({ proxy: a.proxy, art: 'client-credentials' }) });
}

test('Liste: ohne Zugang ein Satz fuer den Laden, kein Abruf; Einrichtungsanleitung nur im Dienstprotokoll', async () => {
  const root = wegwerfOrdner('tp-sonderposten-root-');
  const api = createApi({ root, env: {} });
  const d = await api.sonderpostenListe();
  assert.equal(d.verfuegbar, false);
  assert.equal(d.keinZugang, true);
  assert.match(d.hinweis, /^Geht an diesem Rechner nicht – der Shopify-Zugang fehlt\. Bitte dem Inhaber Bescheid geben\.$/);
  assert.doesNotMatch(JSON.stringify(d), /\.env\.local|npm run|SHOPIFY_CLIENT/);
});

test('Liste: Sonderposten ohne Vorlage, mit Knopf-Regel', async () => {
  const d = await apiMit(attrappe()).sonderpostenListe();
  assert.equal(d.verfuegbar, true);
  assert.deepEqual(d.eintraege.map(e => e.sku), ['SP-TEST-0001']);
  assert.equal(d.eintraege[0].verkaufbar, true);
  assert.equal(d.abgerufenAm, JETZT.toISOString());
});

test('Verkauft: Bestand 1 -> Buchung, Metafelder mit angemeldetem Namen, Protokoll, Gegenprobe', async () => {
  const a = attrappe();
  const vorher = protokoll().length;
  const r = await apiMit(a).sonderpostenVerkauft({ produktId: PRODUKT_ID, inventoryItemId: ITEM_ID, verkauftVon: 'Faelschung' }, MONA);
  assert.equal(r.ok, true);
  assert.equal(r.bestandNachher, 0);
  assert.equal(a.zustand.available, 0);
  assert.equal(a.zustand.felder.verkauft_von, 'Mona Mitarbeiter', 'Name kommt aus der Sitzung, nie aus der Anfrage');
  assert.equal(a.zustand.felder.verkauft_kanal, 'Laden');
  assert.equal(a.zustand.felder.verkauft_am, '2026-10-08T09:15:00Z');
  const neu = protokoll().slice(vorher);
  assert.equal(neu.length, 1);
  assert.equal(neu[0].benutzer, 'Mona Mitarbeiter');
  assert.equal(neu[0].aktion, 'sonderposten-im-laden-verkauft');
  assert.match(neu[0].objekt, /SP-TEST-0001/);
  assert.match(neu[0].objekt, /gid:\/\/shopify\/Product\/9001/);
});

test('Verkauft: Bestand 0 -> 409, nichts geschrieben, kein Protokoll', async () => {
  const a = attrappe({ available: 0 });
  const vorher = protokoll().length;
  await assert.rejects(apiMit(a).sonderpostenVerkauft({ produktId: PRODUKT_ID }, MONA), e => e instanceof ApiError && e.status === 409 && /bereits verkauft/.test(e.message));
  assert.deepEqual(a.namen(), ['SonderpostenEinzeln']);
  assert.equal(protokoll().length, vorher);
});

test('Verkauft: ACCESS_DENIED -> verstaendliche Meldung, keine Metafelder, kein Protokoll', async () => {
  const a = attrappe({ verweigert: true });
  const vorher = protokoll().length;
  await assert.rejects(apiMit(a).sonderpostenVerkauft({ produktId: PRODUKT_ID }, MONA), e => {
    assert.equal(e.status, 403);
    assert.equal(e.message, RECHT_FEHLT);
    assert.match(e.message, /write_inventory/);
    assert.match(e.message, /Shopify-App auf 0/);
    assert.equal(e.extra.grund, 'recht-fehlt');
    return true;
  });
  assert.ok(!a.namen().includes('SonderpostenVerkauftFelder'));
  assert.equal(a.zustand.felder.verkauft_am, undefined);
  assert.equal(protokoll().length, vorher);
});

test('Verkauft: Ueberverkauf erlaubt -> 409, nichts geschrieben, kein Protokoll', async () => {
  const a = attrappe({ policy: 'CONTINUE' });
  const vorher = protokoll().length;
  await assert.rejects(apiMit(a).sonderpostenVerkauft({ produktId: PRODUKT_ID }, MONA),
    e => e.status === 409 && e.message === UEBERVERKAUF_OFFEN && e.extra.grund === 'ueberverkauf');
  assert.deepEqual(a.namen(), ['SonderpostenEinzeln']);
  assert.equal(protokoll().length, vorher);
  const liste = await apiMit(attrappe({ policy: 'CONTINUE' })).sonderpostenListe();
  assert.equal(liste.eintraege[0].verkaufbar, false, 'kein Knopf in der Liste');
});

test('Verkauft: Antwort verloren und Ergebnis unklar -> 504 mit Protokolleintrag', async () => {
  const a = attrappe({ antwortWeg: 'nach', lesenScheitert: [2] });
  const vorher = protokoll().length;
  await assert.rejects(apiMit(a).sonderpostenVerkauft({ produktId: PRODUKT_ID }, MONA),
    e => e instanceof ApiError && e.status === 504 && e.message === ERGEBNIS_UNKLAR && e.extra.grund === 'unklar');
  const neu = protokoll().slice(vorher);
  assert.equal(neu.length, 1, 'die Mutation kann angekommen sein - wer wann gebucht hat, steht trotzdem im Protokoll');
  assert.equal(neu[0].aktion, 'sonderposten-im-laden-verkauft-unklar');
  assert.equal(neu[0].benutzer, 'Mona Mitarbeiter');
});

test('Verkauft: Gegenprobe scheitert nach der Buchung -> 200 mit Hinweis, Protokoll vermerkt es', async () => {
  const a = attrappe({ lesenScheitert: [2] });
  const vorher = protokoll().length;
  const r = await apiMit(a).sonderpostenVerkauft({ produktId: PRODUKT_ID }, MONA);
  assert.equal(r.gebucht, true);
  assert.equal(r.gegenprobe, 'fehlgeschlagen');
  assert.equal(a.zustand.available, 0);
  const neu = protokoll().slice(vorher);
  assert.equal(neu.length, 1);
  assert.match(neu[0].objekt, /Gegenprobe nicht lesbar/);
});

test('Verkauft: ohne Zugang 503, ohne Produkt-ID 400', async () => {
  const root = wegwerfOrdner('tp-sonderposten-root-');
  const api = createApi({ root, env: {} });
  await assert.rejects(api.sonderpostenVerkauft({ produktId: PRODUKT_ID }, MONA), e => e.status === 503);
  await assert.rejects(apiMit(attrappe()).sonderpostenVerkauft({}, MONA), e => e.status === 400);
});

// ---------------------------------------------------------------------------
// Ueber den Server: Rolle "lesen" 403, Mitarbeiter und Inhaber 200, nur POST.
// ---------------------------------------------------------------------------

async function mitServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Rolle: Laenge -> m2 vom Bestand, Protokoll mit Laenge und m2, Name aus der Sitzung', async () => {
  const a = attrappe({ rolle: true });
  const vorher = protokoll().length;
  const r = await apiMit(a).sonderpostenVerkauft({ produktId: PRODUKT_ID, inventoryItemId: ITEM_ID, laengeM: '3.5' }, MONA);
  assert.equal(r.ok, true);
  assert.equal(r.qm, 14);
  assert.equal(a.zustand.available, 66);
  const neu = protokoll().slice(vorher);
  assert.equal(neu.length, 1);
  assert.equal(neu[0].benutzer, 'Mona Mitarbeiter');
  assert.equal(neu[0].aktion, 'sonderposten-rolle-im-laden-verkauft');
  assert.match(neu[0].objekt, /3,5 m = 14 m² · Bestand 80 → 66 m²/);
});

test('Rolle: zu viel -> 409 ohne Buchung und ohne Protokoll; Liste zeigt die Rolle mit Rest', async () => {
  const a = attrappe({ rolle: true, available: 10 });
  const vorher = protokoll().length;
  await assert.rejects(() => apiMit(a).sonderpostenVerkauft({ produktId: PRODUKT_ID, laengeM: 3 }, MONA), e => e instanceof ApiError && e.status === 409);
  assert.equal(a.zustand.available, 10);
  assert.equal(protokoll().length, vorher);
  const d = await apiMit(attrappe({ rolle: true })).sonderpostenListe();
  assert.equal(d.eintraege[0].typ, 'rolle');
  assert.equal(d.eintraege[0].laengeM, 20);
});

test('Gemeinsamer Zugang (ohne Konto): ohne Namen 400 ohne Shopify-Aufruf, mit Namen steht er in Feld und Protokoll', async () => {
  const a = attrappe();
  await assert.rejects(apiMit(a).sonderpostenVerkauft({ produktId: PRODUKT_ID, verkauftVon: '   ' }, NOTZUGANG), e => e instanceof ApiError && e.status === 400 && e.extra?.grund === 'name-fehlt');
  await assert.rejects(apiMit(a).sonderpostenVerkauft({ produktId: PRODUKT_ID }, null), e => e instanceof ApiError && e.status === 400);
  assert.deepEqual(a.namen(), [], 'ohne Namen wird nichts gelesen oder gebucht');
  const vorher = protokoll().length;
  const r = await apiMit(a).sonderpostenVerkauft({ produktId: PRODUKT_ID, verkauftVon: '  Thomas  ' }, NOTZUGANG);
  assert.equal(r.ok, true);
  assert.equal(a.zustand.felder.verkauft_von, 'Thomas');
  const neu = protokoll().slice(vorher);
  assert.equal(neu.length, 1);
  assert.equal(neu[0].benutzer, 'Thomas');
  assert.match(neu[0].objekt, /Name im gemeinsamen Zugang angegeben/);
});

test('Gemeinsamer Zugang, Restrolle: Name ins Protokoll; persoenliches Konto schlaegt den Namen aus der Anfrage', async () => {
  const vorher = protokoll().length;
  await apiMit(attrappe({ rolle: true })).sonderpostenVerkauft({ produktId: PRODUKT_ID, laengeM: 2, verkauftVon: 'Enrico' }, NOTZUGANG);
  await apiMit(attrappe({ rolle: true })).sonderpostenVerkauft({ produktId: PRODUKT_ID, laengeM: 2, verkauftVon: 'Faelschung' }, MONA);
  const neu = protokoll().slice(vorher);
  assert.deepEqual(neu.map(x => x.benutzer), ['Enrico', 'Mona Mitarbeiter']);
  assert.match(neu[0].objekt, /2 m = 8 m² · Bestand 80 → 72 m².*gemeinsamen Zugang/);
  assert.doesNotMatch(neu[1].objekt, /gemeinsamen Zugang/);
});

test('Inventur: Inhaber, persoenlicher Name, physischer Bestand und Protokoll mit Vorgangs-ID', async () => {
  const a = attrappe({ rolle: true }); const api = apiMit(a);
  const vorher = protokoll().length;
  await assert.rejects(() => api.sonderpostenBestand(INVENTUR, MONA), e => e.status === 403);
  assert.deepEqual(a.namen(), []);
  await assert.rejects(() => api.sonderpostenBestand(INVENTUR, NOTZUGANG), e => e.status === 400 && e.extra.grund === 'name-fehlt');
  const r = await api.sonderpostenBestand({ ...INVENTUR, verkauftVon: 'Faelschung', standortId: 'gid://shopify/Location/1' }, { name: 'Ina Inhaber', kuerzel: 'ina', rolle: 'inhaber' });
  assert.equal(r.ok, true); assert.equal(r.bestandNachher, 48);
  const neu = protokoll().slice(vorher);
  assert.equal(neu.length, 1); assert.equal(neu[0].benutzer, 'Ina Inhaber');
  assert.equal(neu[0].aktion, 'sonderposten-rollenbestand');
  assert.match(neu[0].objekt, new RegExp(INVENTUR.operationId));
  assert.equal(a.aufrufe.find(x => x.name === 'SonderpostenRolleninventur').variables.input.quantities[0].locationId, 'gid://shopify/Location/98426814798', 'Browser darf den Standort nicht austauschen');
});

test('Inventur: unklarer Ausgang steht im Protokoll, gebundene Ware bleibt unveraendert', async () => {
  const a = attrappe({ rolle: true, antwortWeg: 'nach' });
  const vorher = protokoll().length;
  await assert.rejects(() => apiMit(a).sonderpostenBestand({ ...INVENTUR, verkauftVon: 'Test Inhaber' }, NOTZUGANG), e => e.status === 504);
  assert.equal(protokoll().slice(vorher)[0].aktion, 'sonderposten-rollenbestand-unklar');
  const b = attrappe({ rolle: true }); b.zustand.committed = 4; b.zustand.onHand = 84;
  await assert.rejects(() => apiMit(b).sonderpostenBestand({ ...INVENTUR, verkauftVon: 'Test Inhaber' }, NOTZUGANG), e => e.status === 409);
  assert.equal(b.zustand.available, 80);
});

test('Server: /api/sonderposten/verkauft - lesen 403, mitarbeiter 200, inhaber 200, GET 405', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const privat = wegwerfOrdner('tp-sonderposten-rollen-');
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-1', rolle: 'mitarbeiter' });
  liste = benutzerAnlegen(liste, { name: 'Ina Inhaber', kuerzel: 'ina', passwort: 'platzhalter-inhaber-1', rolle: 'inhaber' });
  schreibeBenutzer(liste, path.join(privat, 'benutzer.json'));
  process.env.TP_PRIVAT_DIR = privat;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=sonderposten-rollen');
  delete process.env.TP_DASHBOARD_PASSWORT;
  assert.equal(mod.auth.required, true);

  let aktuell = attrappe();
  mod.ersetzeShopifyZugang(async () => ({ proxy: aktuell.proxy, art: 'client-credentials' }));
  try {
    await mitServer(mod.requestHandler, async base => {
      const anmelden = async (name, passwort) => {
        const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passwort }) });
        assert.equal(r.status, 200);
        return r.headers.get('set-cookie').split(';')[0];
      };
      const buchen = (keks) => fetch(`${base}/api/sonderposten/verkauft`, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: keks },
        body: JSON.stringify({ produktId: PRODUKT_ID, inventoryItemId: ITEM_ID }),
      });

      const lena = await anmelden('lena', 'platzhalter-lesen-1');
      const gesperrt = await buchen(lena);
      assert.equal(gesperrt.status, 403);
      assert.deepEqual(aktuell.namen(), [], 'Rolle "lesen" erreicht Shopify gar nicht');
      const listeLesen = await fetch(`${base}/api/sonderposten/liste`, { headers: { cookie: lena } });
      assert.equal(listeLesen.status, 200, 'Lesen darf die Liste sehen');

      const mona = await anmelden('mona', 'platzhalter-mitarbeiter-1');
      aktuell = attrappe();
      const ok = await buchen(mona);
      assert.equal(ok.status, 200);
      const j = await ok.json();
      assert.equal(j.bestandNachher, 0);
      assert.equal(aktuell.zustand.felder.verkauft_von, 'Mona Mitarbeiter');

      // Zweiter Klick auf dasselbe Stueck: bereits verkauft.
      const nochmal = await buchen(mona);
      assert.equal(nochmal.status, 409);
      assert.match((await nochmal.json()).error, /bereits verkauft/);

      const ina = await anmelden('ina', 'platzhalter-inhaber-1');
      aktuell = attrappe();
      assert.equal((await buchen(ina)).status, 200);

      const inventur = keks => fetch(`${base}/api/sonderposten/bestand`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: keks }, body: JSON.stringify(INVENTUR) });
      aktuell = attrappe({ rolle: true });
      assert.equal((await inventur(lena)).status, 403);
      assert.equal((await inventur(mona)).status, 403);
      assert.deepEqual(aktuell.namen(), [], 'Inventur ist serverseitig Inhabersache');
      const inventurOk = await inventur(ina);
      assert.equal(inventurOk.status, 200); assert.equal((await inventurOk.json()).bestandNachher, 48);
      assert.equal((await fetch(`${base}/api/sonderposten/bestand`, { headers: { cookie: ina } })).status, 405);

      aktuell = attrappe({ verweigert: true });
      const ohneRecht = await buchen(ina);
      assert.equal(ohneRecht.status, 403);
      const fehler = await ohneRecht.json();
      assert.equal(fehler.error, RECHT_FEHLT);
      assert.equal(fehler.grund, 'recht-fehlt');

      const get = await fetch(`${base}/api/sonderposten/verkauft`, { headers: { cookie: ina } });
      assert.equal(get.status, 405);
    });
  } finally {
    mod.ersetzeShopifyZugang(null);
    process.env.TP_PRIVAT_DIR = PRIVAT_DIR;
  }
});
