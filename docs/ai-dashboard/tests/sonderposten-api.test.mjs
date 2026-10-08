import { PRIVAT_DIR } from './_testumgebung.mjs'; // muss zuerst stehen: TP_PRIVAT_DIR und kein echter Shopify-Zugang
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApi, ApiError } from '../../../scripts/dashboard-api.mjs';
import { RECHT_FEHLT } from '../../../operations/lib/sonderposten.mjs';
import { attrappe, PRODUKT_ID, ITEM_ID } from '../../../operations/tests/sonderposten-attrappe.mjs';

const JETZT = new Date('2026-10-08T09:15:00.000Z');
const MONA = { name: 'Mona Mitarbeiter', kuerzel: 'mona', rolle: 'mitarbeiter' };

function protokoll() {
  const datei = path.join(process.env.TP_PRIVAT_DIR, 'protokoll.jsonl');
  if (!fs.existsSync(datei)) return [];
  return fs.readFileSync(datei, 'utf8').split('\n').filter(Boolean).map(z => JSON.parse(z));
}

function apiMit(a) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-sonderposten-root-'));
  return createApi({ root, now: () => JETZT, shopifyZugang: async () => ({ proxy: a.proxy, art: 'client-credentials' }) });
}

test('Liste: ohne Zugang derselbe Hinweis wie bei den anderen Quellen, kein Abruf', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-sonderposten-root-'));
  const api = createApi({ root, env: {} });
  const d = await api.sonderpostenListe();
  assert.equal(d.verfuegbar, false);
  assert.match(d.hinweis, /^Kein Zugang zu Shopify/);
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

test('Verkauft: ohne Zugang 503, ohne Produkt-ID 400', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-sonderposten-root-'));
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

test('Server: /api/sonderposten/verkauft - lesen 403, mitarbeiter 200, inhaber 200, GET 405', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-sonderposten-rollen-'));
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
