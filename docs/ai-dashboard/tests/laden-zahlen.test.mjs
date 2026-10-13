// Zuerst: $TP_PRIVAT_DIR auf einen Wegwerf-Ordner (siehe _testumgebung.mjs).
import { PRIVAT_DIR } from './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  ladenKonfig, ladenUrl, zahlenAus, montageAus, ladenFehlt, createLadenZahlen, LADEN_ZAHLEN_FELDER, MONTAGE_FELDER, LADEN_CACHE_MS, LADEN_FEHLER_CACHE_MS,
} from '../../../scripts/laden-zahlen.mjs';
import { dashboardLinks } from '../../../scripts/weitere-dashboards.mjs';

// Kachel "Laden" auf "Heute": der lokale Server holt die Zahlen aus der Auftrags-App
// (Apps Script, ?ansicht=zahlen&s=<Schluessel>). URL und Schluessel kommen aus .env.local
// bzw. der Umgebung, nie aus dem Repository; der Browser bekommt nur Zahlen und den Link.
// Alle Werte hier sind erfunden - keine echte Deployment-ID, kein echter Schluessel.

// Die Tests duerfen nie die echte .env.local des Rechners lesen (sie koennte eingerichtet sein).
const KEINE_DATEI = path.join(PRIVAT_DIR, 'gibt-es-nicht.env');
process.env.TP_ENV_LOCAL = KEINE_DATEI;
delete process.env.LADEN_ZAHLEN_URL;
delete process.env.LADEN_ZAHLEN_SCHLUESSEL;
delete process.env.AUFTRAGS_APP_URL;
delete process.env.WERKBANK_URL;

const BASIS = 'https://script.google.com/macros/s/TEST-DEPLOYMENT/exec';
const SCHLUESSEL = 'test-schluessel-nur-fuer-tests-0123456789';
const ENV = { TP_ENV_LOCAL: KEINE_DATEI, LADEN_ZAHLEN_URL: BASIS, LADEN_ZAHLEN_SCHLUESSEL: SCHLUESSEL };
const ZAHLEN = { offen: 6, neu: 4, angebot: 1, nachfassen: 1, faellig: 2, ausShop7Tage: 2, gewonnen30Tage: 2, verloren30Tage: 2, angeboteOffen: 2 };
// Ab App-Version 43 kommt spamVerdacht dazu (in genau dieser Reihenfolge am Ende); ZAHLEN allein ist die aeltere App.
const ZAHLEN_V43 = { ...ZAHLEN, spamVerdacht: 3 };
const STAND = '2026-10-14T08:00:00.000Z';

function antwort(body, { status = 200 } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

/** fetch-Attrappe: zaehlt Aufrufe, merkt sich URL und Optionen. */
function attrappe(antworten) {
  const aufrufe = [];
  const f = async (url, opt) => {
    aufrufe.push({ url: String(url), opt });
    const a = typeof antworten === 'function' ? antworten(aufrufe.length) : antworten;
    if (a instanceof Error) throw a;
    return a;
  };
  f.aufrufe = aufrufe;
  return f;
}

function uhr(start = Date.parse('2026-10-14T08:00:00Z')) {
  let t = start;
  const jetzt = () => t;
  jetzt.weiter = ms => { t += ms; };
  return jetzt;
}

const stumm = { warn() {} };

test('ladenKonfig: nicht eingerichtet ohne URL oder Schluessel; nur https://script.google.com; Umgebung vor .env.local; Query/Hash fallen weg', () => {
  assert.equal(ladenKonfig({ env: { TP_ENV_LOCAL: KEINE_DATEI } }), null);
  assert.equal(ladenKonfig({ env: { TP_ENV_LOCAL: KEINE_DATEI, LADEN_ZAHLEN_URL: BASIS } }), null);
  assert.equal(ladenKonfig({ env: { TP_ENV_LOCAL: KEINE_DATEI, LADEN_ZAHLEN_SCHLUESSEL: SCHLUESSEL } }), null);
  for (const url of ['http://script.google.com/macros/s/X/exec', 'https://beispiel.example/exec', 'https://script.google.com.beispiel.example/x', 'kein url']) {
    assert.equal(ladenKonfig({ env: { ...ENV, LADEN_ZAHLEN_URL: url } }), null, url);
  }
  assert.deepEqual(ladenKonfig({ env: { ...ENV, LADEN_ZAHLEN_URL: `${BASIS}?ansicht=laden#oben` } }), { basis: BASIS, schluessel: SCHLUESSEL });

  // .env.local im Ordner des Dienstes - beide Schreibweisen, Platzhalter zaehlen nicht
  const root = fs.mkdtempSync(path.join(PRIVAT_DIR, 'dienst-'));
  fs.writeFileSync(path.join(root, '.env.local'), `# Laden\nexport LADEN_ZAHLEN_URL='${BASIS}'\nLADEN_ZAHLEN_SCHLUESSEL=${SCHLUESSEL}\n`);
  assert.deepEqual(ladenKonfig({ root, env: {} }), { basis: BASIS, schluessel: SCHLUESSEL });
  assert.equal(ladenKonfig({ root, env: { LADEN_ZAHLEN_SCHLUESSEL: 'anderer-test-schluessel-1234' } }).schluessel, 'anderer-test-schluessel-1234');
  fs.writeFileSync(path.join(root, '.env.local'), `LADEN_ZAHLEN_URL=<https://script.google.com/macros/s/DEPLOYMENT-ID/exec>\nLADEN_ZAHLEN_SCHLUESSEL=<Schluessel>\n`);
  assert.equal(ladenKonfig({ root, env: {} }), null, 'Platzhalter aus der Vorlage gelten nicht als eingerichtet');
  assert.equal(ladenUrl(BASIS), `${BASIS}?ansicht=laden`);
});

test('zahlenAus: genau die bekannten Felder als ganze Zahlen >= 0, alles andere faellt weg; sonst null', () => {
  const ok = zahlenAus({ stand: STAND, ...ZAHLEN_V43, kunde: 'Max Muster', telefon: '0171 9876543' });
  assert.deepEqual(ok, { zahlen: ZAHLEN_V43, stand: STAND, montage: null });
  assert.deepEqual(Object.keys(ok.zahlen), LADEN_ZAHLEN_FELDER);
  assert.deepEqual(LADEN_ZAHLEN_FELDER, ['offen', 'neu', 'angebot', 'nachfassen', 'faellig', 'ausShop7Tage', 'gewonnen30Tage', 'verloren30Tage', 'angeboteOffen', 'spamVerdacht']);
  assert.equal(zahlenAus({ ...ZAHLEN_V43, stand: 'gestern' }).stand, null);
  for (const kaputt of [null, [], 'text', { fehler: 'kein Zugriff' }, { ...ZAHLEN, offen: -1 }, { ...ZAHLEN, faellig: 1.5 }, { ...ZAHLEN, neu: '4' }, (({ offen, ...r }) => r)(ZAHLEN)]) {
    assert.equal(zahlenAus(kaputt), null, JSON.stringify(kaputt));
  }
});

test('zahlenAus: spamVerdacht fehlt (App vor Version 43) → 0, die Antwort bleibt brauchbar; ist es da, gilt dieselbe Pruefung', () => {
  const alt = zahlenAus({ stand: STAND, ...ZAHLEN });
  assert.deepEqual(alt, { zahlen: { ...ZAHLEN, spamVerdacht: 0 }, stand: STAND, montage: null });
  assert.deepEqual(Object.keys(alt.zahlen), LADEN_ZAHLEN_FELDER);
  assert.equal(zahlenAus({ ...ZAHLEN, spamVerdacht: 0 }).zahlen.spamVerdacht, 0);
  assert.equal(zahlenAus({ ...ZAHLEN, spamVerdacht: 12 }).zahlen.spamVerdacht, 12);
  for (const kaputt of [-1, 1.5, '3', null, true]) {
    assert.equal(zahlenAus({ ...ZAHLEN, spamVerdacht: kaputt }), null, `spamVerdacht: ${JSON.stringify(kaputt)}`);
  }
  // Nur spamVerdacht darf fehlen - jedes andere Feld bleibt Pflicht.
  assert.equal(zahlenAus((({ angeboteOffen, ...r }) => r)(ZAHLEN_V43)), null);
});

test('Abruf: nicht eingerichtet ruft nichts ab; eingerichtet holt ?ansicht=zahlen&s=… (Weiterleitung folgen) und gibt nur Zahlen und den Link zurueck - nie den Schluessel', async () => {
  const f0 = attrappe(antwort({ stand: STAND, ...ZAHLEN }));
  const leer = createLadenZahlen({ env: { TP_ENV_LOCAL: KEINE_DATEI }, fetch: f0, log: stumm });
  assert.deepEqual(await leer.abrufen(), { eingerichtet: false, fehlt: 'url', ladenUrl: null, montageUrl: null });
  assert.equal(f0.aufrufe.length, 0);

  const jetzt = uhr();
  const f = attrappe(antwort({ stand: STAND, ...ZAHLEN_V43, kunde: 'Max Muster' }));
  const lz = createLadenZahlen({ env: ENV, fetch: f, jetzt, log: stumm });
  const r = await lz.abrufen();
  assert.equal(f.aufrufe.length, 1);
  const u = new URL(f.aufrufe[0].url);
  assert.equal(`${u.origin}${u.pathname}`, BASIS);
  assert.equal(u.searchParams.get('ansicht'), 'zahlen');
  assert.equal(u.searchParams.get('s'), SCHLUESSEL);
  assert.equal(f.aufrufe[0].opt.redirect, 'follow');
  assert.ok(f.aufrufe[0].opt.signal, 'Zeitlimit gesetzt');
  assert.deepEqual(r, { eingerichtet: true, erreichbar: true, zahlen: ZAHLEN_V43, stand: STAND, montage: null, abgerufen: new Date(jetzt()).toISOString(), ladenUrl: `${BASIS}?ansicht=laden`, montageUrl: BASIS });
  const text = JSON.stringify(r);
  assert.ok(!text.includes(SCHLUESSEL) && !text.includes('s=') && !text.includes('Muster'), text);

  // Aeltere App ohne spamVerdacht: weiter erreichbar, Spam-Verdacht 0 statt „nicht erreichbar"
  const alt = await createLadenZahlen({ env: ENV, fetch: attrappe(antwort({ stand: STAND, ...ZAHLEN })), jetzt, log: stumm }).abrufen();
  assert.equal(alt.erreichbar, true);
  assert.deepEqual(alt.zahlen, { ...ZAHLEN, spamVerdacht: 0 });
});

test('Zwischenspeicher: Erfolg 5 Minuten, Fehlschlag 1 Minute; gleichzeitige Anfragen teilen einen Abruf; neue Konfiguration verwirft den alten Stand', async () => {
  const jetzt = uhr();
  let n = 0;
  const f = attrappe(() => { n++; return n === 2 ? antwort({ fehler: 'kein Zugriff' }) : antwort({ stand: STAND, ...ZAHLEN, offen: n }); });
  const env = { ...ENV };
  const lz = createLadenZahlen({ env, fetch: f, jetzt, log: stumm });

  const [a, b, c] = await Promise.all([lz.abrufen(), lz.abrufen(), lz.abrufen()]);
  assert.equal(f.aufrufe.length, 1, 'gleichzeitige Anfragen: ein Abruf');
  assert.equal(a.zahlen.offen, 1); assert.deepEqual(b, a); assert.deepEqual(c, a);
  jetzt.weiter(LADEN_CACHE_MS - 1);
  assert.equal((await lz.abrufen()).zahlen.offen, 1);
  assert.equal(f.aufrufe.length, 1);

  jetzt.weiter(2);   // 5 Minuten um
  const kz = await lz.abrufen();
  assert.equal(f.aufrufe.length, 2);
  assert.deepEqual({ erreichbar: kz.erreichbar, grund: kz.grund, zahlen: kz.zahlen }, { erreichbar: false, grund: 'kein-zugriff', zahlen: undefined });
  assert.equal(kz.ladenUrl, `${BASIS}?ansicht=laden`, 'der Link bleibt auch ohne Zahlen');
  jetzt.weiter(LADEN_FEHLER_CACHE_MS - 1);
  await lz.abrufen();
  assert.equal(f.aufrufe.length, 2, 'Fehlschlag 1 Minute gemerkt');
  jetzt.weiter(2);
  assert.equal((await lz.abrufen()).zahlen.offen, 3);
  assert.equal(f.aufrufe.length, 3);

  env.LADEN_ZAHLEN_SCHLUESSEL = 'neuer-test-schluessel-9876543210';
  assert.equal((await lz.abrufen()).zahlen.offen, 4);
  assert.equal(new URL(f.aufrufe[3].url).searchParams.get('s'), 'neuer-test-schluessel-9876543210');
});

test('Fehlerfaelle werden "nicht erreichbar" mit Grund; das Protokoll nennt nie URL oder Schluessel', async () => {
  const faelle = [
    [Object.assign(new Error('zu langsam'), { name: 'TimeoutError' }), 'zeitlimit'],
    [new TypeError(`fetch failed ${BASIS}?s=${SCHLUESSEL}`), 'netz'],
    [antwort('Fehler', { status: 500 }), 'http'],
    [antwort('<!doctype html><title>Anmelden – Google-Konten</title>'), 'antwort'],
    [antwort(JSON.stringify({ ...ZAHLEN, x: 'y'.repeat(20000) })), 'antwort'],
    [antwort({ fehler: 'nicht verfügbar' }), 'antwort'],
    [antwort({ ...ZAHLEN, faellig: 'zwei' }), 'antwort'],
  ];
  for (const [a, grund] of faelle) {
    const meldungen = [];
    const lz = createLadenZahlen({ env: ENV, fetch: attrappe(a), log: { warn: m => meldungen.push(m) } });
    const r = await lz.abrufen();
    assert.equal(r.eingerichtet, true);
    assert.equal(r.erreichbar, false, grund);
    assert.equal(r.grund, grund);
    assert.equal(r.zahlen, undefined);
    assert.ok(meldungen.length === 1 && !meldungen.join(' ').includes(SCHLUESSEL) && !meldungen.join(' ').includes('script.google'), meldungen.join(' '));
  }
});

test('echtes Zeitlimit: eine haengende Antwort bricht ab', async () => {
  const haengt = (url, opt) => new Promise((_, nein) => opt.signal.addEventListener('abort', () => nein(opt.signal.reason)));
  const lz = createLadenZahlen({ env: ENV, fetch: haengt, zeitlimitMs: 20, log: stumm });
  const r = await lz.abrufen();
  assert.equal(r.grund, 'zeitlimit');
});

test('Montage: optionales Objekt, nur bekannte ganze Zahlen >= 0 je Feld; ohne gueltiges Feld null - die Laden-Zahlen bleiben unberuehrt', () => {
  assert.deepEqual(MONTAGE_FELDER, ['einsaetzeHeute', 'einsaetzeMorgen', 'meldungenOffen', 'offenVonGestern', 'neueAuftraege', 'antraegeOffen', 'rueckmeldungenNeu']);
  const voll = { einsaetzeHeute: 3, einsaetzeMorgen: 2, meldungenOffen: 1, offenVonGestern: 0, neueAuftraege: 4, antraegeOffen: 1, rueckmeldungenNeu: 2 };
  // Beispielantwort der App: Laden-Zahlen plus montage, dazu ein Name, der nie durchkommen darf.
  const r = zahlenAus({ stand: STAND, ...ZAHLEN_V43, montage: { ...voll, monteur: 'Max Muster', einsatzliste: ['Max Muster'] } });
  assert.deepEqual(r.zahlen, ZAHLEN_V43);
  assert.deepEqual(r.montage, voll);
  assert.ok(!JSON.stringify(r).includes('Muster'));
  // Teilweise: fehlende und ungueltige Felder fallen einzeln weg.
  assert.deepEqual(montageAus({ einsaetzeHeute: 2, meldungenOffen: -1, antraegeOffen: '3', neueAuftraege: 1.5 }), { einsaetzeHeute: 2 });
  for (const leer of [undefined, null, [], 'text', 5, {}, { einsaetzeHeute: null }]) assert.equal(montageAus(leer), null, JSON.stringify(leer));
  // Eine kaputte montage macht die Laden-Antwort nicht unbrauchbar.
  assert.deepEqual(zahlenAus({ ...ZAHLEN_V43, montage: 'kaputt' }).zahlen, ZAHLEN_V43);
});

test('Laden: Adresse ohne Schluessel heisst "Schluessel fehlt"; Links in die App kommen aus AUFTRAGS_APP_URL, sonst LADEN_ZAHLEN_URL', async () => {
  assert.equal(ladenFehlt({ LADEN_ZAHLEN_URL: BASIS }), 'schluessel');
  assert.equal(ladenFehlt({}), 'url');
  assert.equal(ladenFehlt({ LADEN_ZAHLEN_SCHLUESSEL: SCHLUESSEL }), 'url');
  assert.equal(ladenFehlt({ LADEN_ZAHLEN_URL: 'https://example.test/exec' }), 'url', 'fremde Adresse zaehlt nicht');
  const f = attrappe(antwort({ stand: STAND, ...ZAHLEN }));
  const ohneSchluessel = await createLadenZahlen({ env: { TP_ENV_LOCAL: KEINE_DATEI, LADEN_ZAHLEN_URL: BASIS }, fetch: f, log: stumm }).abrufen();
  assert.deepEqual(ohneSchluessel, { eingerichtet: false, fehlt: 'schluessel', ladenUrl: `${BASIS}?ansicht=laden`, montageUrl: BASIS });
  assert.equal(f.aufrufe.length, 0, 'ohne Schluessel kein Abruf');
  const APP = 'https://script.google.com/macros/s/TEST-APP/exec';
  const nurApp = await createLadenZahlen({ env: { TP_ENV_LOCAL: KEINE_DATEI, AUFTRAGS_APP_URL: `${APP}?ansicht=monteur` }, fetch: f, log: stumm }).abrufen();
  assert.deepEqual(nurApp, { eingerichtet: false, fehlt: 'url', ladenUrl: `${APP}?ansicht=laden`, montageUrl: APP });
});

test('Weitere Dashboards: Werkbank, Laden und Montage aus der Umgebung, nur https; fehlt eine Adresse, fehlt der Link', () => {
  const ohne = dashboardLinks({ env: { TP_ENV_LOCAL: KEINE_DATEI } });
  assert.deepEqual(ohne, { werkbank: null, laden: null, montage: null });
  const APP = 'https://script.google.com/macros/s/TEST-APP/exec';
  const mit = dashboardLinks({ env: { TP_ENV_LOCAL: KEINE_DATEI, WERKBANK_URL: 'https://claude.ai/artifact/TEST-WERKBANK', AUFTRAGS_APP_URL: APP } });
  assert.deepEqual(mit, { werkbank: 'https://claude.ai/artifact/TEST-WERKBANK', laden: `${APP}?ansicht=laden`, montage: APP });
  // http, javascript: und Unsinn werden kein Link
  for (const kaputt of ['http://claude.ai/x', 'javascript:alert(1)', 'kein link']) {
    assert.deepEqual(dashboardLinks({ env: { TP_ENV_LOCAL: KEINE_DATEI, WERKBANK_URL: kaputt, AUFTRAGS_APP_URL: kaputt } }), { werkbank: null, laden: null, montage: null }, kaputt);
  }
  // Ohne AUFTRAGS_APP_URL gilt die Adresse der Laden-Zahlen (dieselbe App), ohne deren Schluessel.
  const ueberLaden = dashboardLinks({ env: { TP_ENV_LOCAL: KEINE_DATEI, LADEN_ZAHLEN_URL: BASIS, LADEN_ZAHLEN_SCHLUESSEL: SCHLUESSEL } });
  assert.equal(ueberLaden.montage, BASIS);
  assert.ok(!JSON.stringify(ueberLaden).includes(SCHLUESSEL));
  // .env.local wird gelesen, Platzhalter aus der Vorlage zaehlen nicht.
  const root = fs.mkdtempSync(path.join(PRIVAT_DIR, 'env-'));
  fs.writeFileSync(path.join(root, '.env.local'), `WERKBANK_URL=<https://claude.ai/artifact/ID>\nAUFTRAGS_APP_URL=${APP}\n`);
  assert.deepEqual(dashboardLinks({ root, env: {} }), { werkbank: null, laden: `${APP}?ansicht=laden`, montage: APP });
});

test('GET /api/laden/zahlen steht in der Pfadliste und meldet ohne Einrichtung ruhig { eingerichtet: false }; nur GET', async () => {
  const { requestHandler } = await import('../../../scripts/serve-dashboard.mjs');
  const server = http.createServer(requestHandler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const r = await fetch(`${base}/api/laden/zahlen`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { eingerichtet: false, fehlt: 'url', ladenUrl: null, montageUrl: null });
    const p = await fetch(`${base}/api/laden/zahlen`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(p.status, 405);
  } finally { await new Promise(r => server.close(r)); }
});

test('Kachel auf "Heute": fuenf Zahlen, faellige Wiedervorlagen in Bernstein, 0 grau, Link in neuem Tab; ohne Einrichtung ruhig "Nicht eingerichtet"', async () => {
  // Die Ansicht laeuft im Browser; fuer den Import reichen kleine Attrappen.
  globalThis.document ??= { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, documentElement: { dataset: {}, setAttribute() {} } };
  globalThis.location ??= { hash: '', search: '' };
  const holt = [];
  globalThis.fetch = async (url) => { holt.push(String(url)); return { ok: true, json: async () => ({ eingerichtet: false }) }; };
  const { heuteLaden, ladenKachel } = await import('../ansichten/heute/laden.mjs');

  ladenKachel.daten = { eingerichtet: true, erreichbar: true, zahlen: { ...ZAHLEN, ausShop7Tage: 0 }, stand: STAND, abgerufen: STAND, ladenUrl: `${BASIS}?ansicht=laden` };
  ladenKachel.am = Date.now();
  const html = heuteLaden();
  assert.equal(holt.length, 0, 'frischer Stand: kein neuer Abruf');
  assert.equal((html.match(/class="heute-kpi"/g) || []).length, 5);
  for (const t of ['Offene Beratungen', 'Wiedervorlage fällig', 'Angebote offen', 'Aus dem Shop', 'Gewonnen', 'davon 4 neu', 'davon 1 zum Nachfassen', 'verloren 2 · 30 Tage']) assert.ok(html.includes(t), t);
  assert.match(html, /<div class="n warn">2<\/div>\s*<div class="l">Wiedervorlage fällig/);
  assert.match(html, /<div class="n null">0<\/div>\s*<div class="l">Aus dem Shop/);
  assert.match(html, /href="https:\/\/script\.google\.com\/macros\/s\/TEST-DEPLOYMENT\/exec\?ansicht=laden" target="_blank" rel="noopener">Laden-Ansicht öffnen/);
  assert.ok(!/Spam/.test(html), 'ohne Feld (aeltere App) kein Spam-Hinweis');

  // Spam-Verdacht: nur bei > 0 eine Zeile unter den Zahlen, Zahl in Bernstein, keine sechste Kachel
  const mitSpam = n => { ladenKachel.daten = { ...ladenKachel.daten, zahlen: { ...ZAHLEN_V43, spamVerdacht: n } }; return heuteLaden(); };
  assert.ok(!/Spam/.test(mitSpam(0)), '0 Spam-Verdacht: keine Zeile');
  const zwei = mitSpam(2);
  assert.equal((zwei.match(/class="heute-kpi"/g) || []).length, 5, 'weiter fuenf Zahlen');
  assert.match(zwei, /<p class="heute-hinweis heute-laden-spam"><b>2<\/b> Fälle aus dem Shop mit Spam-Verdacht – in den Zahlen oben nicht enthalten\. <a href="https:\/\/script\.google\.com\/macros\/s\/TEST-DEPLOYMENT\/exec\?ansicht=laden&amp;filter=spam" target="_blank" rel="noopener">Spam prüfen <span aria-hidden="true">↗<\/span><\/a><\/p>/);
  assert.ok(zwei.indexOf('heute-laden-spam') > zwei.indexOf('Gewonnen'), 'Zeile steht unter den Zahlen');
  assert.match(mitSpam(1), /<b>1<\/b> Fall aus dem Shop mit Spam-Verdacht/);
  assert.equal((zwei.match(/target="_blank" rel="noopener"/g) || []).length, 2, 'Kopf-Link und Spam-Link, beide in neuem Tab');

  // ohne ladenUrl: dieselbe Zeile ohne Link, mit dem Weg in Worten
  ladenKachel.daten = { ...ladenKachel.daten, zahlen: ZAHLEN_V43, ladenUrl: undefined };
  const ohneUrl = heuteLaden();
  assert.match(ohneUrl, /<p class="heute-hinweis heute-laden-spam"><b>3<\/b> Fälle aus dem Shop mit Spam-Verdacht – in der Laden-Ansicht unter „Spam prüfen“ ansehen\. In den Zahlen oben nicht enthalten\.<\/p>/);
  assert.ok(!/href=/.test(ohneUrl), 'ohne ladenUrl weder Kopf- noch Spam-Link');

  ladenKachel.daten = { eingerichtet: false };
  const leer = heuteLaden();
  assert.match(leer, /Nicht eingerichtet/);
  assert.ok(!/heute-kpi"|href=/.test(leer), 'ohne Einrichtung keine Zahlen und kein Link');

  // Adresse da, Schluessel fehlt: das sagen - und die Laden-Ansicht trotzdem verlinken.
  ladenKachel.daten = { eingerichtet: false, fehlt: 'schluessel', ladenUrl: `${BASIS}?ansicht=laden`, montageUrl: BASIS };
  const ohneSchluessel = heuteLaden();
  assert.match(ohneSchluessel, /Schlüssel fehlt/);
  assert.ok(!/Nicht eingerichtet/.test(ohneSchluessel));
  assert.match(ohneSchluessel, /href="https:\/\/script\.google\.com\/macros\/s\/TEST-DEPLOYMENT\/exec\?ansicht=laden" target="_blank" rel="noopener">Laden-Ansicht öffnen/);

  ladenKachel.daten = { eingerichtet: true, erreichbar: false, grund: 'kein-zugriff', abgerufen: STAND, ladenUrl: `${BASIS}?ansicht=laden` };
  const kz = heuteLaden();
  assert.match(kz, /nicht erreichbar/);
  assert.match(kz, /Schlüssel am Mac passt nicht/);
  assert.match(kz, /Laden-Ansicht öffnen/);

  // veralteter Stand: still nachladen (ohne Neuzeichnen - hier gibt es kein DOM)
  const { state } = await import('../kern/zustand.mjs');
  state.route.view = 'test';
  ladenKachel.am = Date.now() - 61_000;
  heuteLaden();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(holt, ['/api/laden/zahlen']);
});

test('Spam-Link: aus ladenUrl per URL-API, ansicht=laden und filter=spam, weitere Parameter bleiben; sonst kein Link', async () => {
  globalThis.document ??= { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, documentElement: { dataset: {}, setAttribute() {} } };
  globalThis.location ??= { hash: '', search: '' };
  const { spamUrl } = await import('../ansichten/heute/laden.mjs');
  const params = url => Object.fromEntries(new URL(url).searchParams);

  // so liefert ihn der Server (ladenUrl() oben)
  assert.equal(spamUrl(ladenUrl(BASIS)), `${BASIS}?ansicht=laden&filter=spam`);
  // vorhandene Parameter bleiben, ein anderer Filter wird ersetzt, ansicht wird gesetzt, wenn sie fehlt
  assert.deepEqual(params(spamUrl(`${BASIS}?ansicht=laden&authuser=1`)), { ansicht: 'laden', authuser: '1', filter: 'spam' });
  assert.deepEqual(params(spamUrl(`${BASIS}?ansicht=laden&filter=neu`)), { ansicht: 'laden', filter: 'spam' });
  assert.deepEqual(params(spamUrl(BASIS)), { ansicht: 'laden', filter: 'spam' });
  assert.equal(new URL(spamUrl(`${BASIS}?ansicht=laden`)).pathname, '/macros/s/TEST-DEPLOYMENT/exec', 'Pfad bleibt');
  // kein oder unbrauchbarer ladenUrl: kein Link
  for (const kaputt of [undefined, null, '', 'kein-url', '/relativ?ansicht=laden', 'javascript:alert(1)', 'http://script.google.com/macros/s/X/exec']) {
    assert.equal(spamUrl(kaputt), '', String(kaputt));
  }
});

test('Kachel "Montage": vorhandene Zahlen zeigen, fehlende weglassen; ohne Objekt oder Schluessel "noch nicht verbunden"; Link aus der App-Adresse', async () => {
  globalThis.document ??= { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, documentElement: { dataset: {}, setAttribute() {} } };
  globalThis.location ??= { hash: '', search: '' };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ eingerichtet: false }) });
  const { heuteMontage, ladenKachel } = await import('../ansichten/heute/laden.mjs');
  const APP_LINK = /href="https:\/\/script\.google\.com\/macros\/s\/TEST-DEPLOYMENT\/exec" target="_blank" rel="noopener">Montage-App öffnen/;
  ladenKachel.am = Date.now();

  // Beispielantwort mit allen sieben Zahlen
  ladenKachel.daten = { eingerichtet: true, erreichbar: true, zahlen: ZAHLEN_V43, stand: STAND, abgerufen: STAND, ladenUrl: `${BASIS}?ansicht=laden`, montageUrl: BASIS,
    montage: { einsaetzeHeute: 3, einsaetzeMorgen: 2, meldungenOffen: 1, offenVonGestern: 0, neueAuftraege: 4, antraegeOffen: 1, rueckmeldungenNeu: 2 } };
  const voll = heuteMontage();
  assert.equal((voll.match(/class="heute-kpi"/g) || []).length, 7);
  for (const t of ['Einsätze heute', 'Einsätze morgen', 'Offen von gestern', 'Meldungen offen', 'Anträge offen', 'Neue Aufträge', 'Neue Rückmeldungen']) assert.ok(voll.includes(t), t);
  assert.match(voll, /<div class="n warn">1<\/div>\s*<div class="l">Meldungen offen/);
  assert.match(voll, /<div class="n null">0<\/div>\s*<div class="l">Offen von gestern/);
  assert.match(voll, /<div class="n">3<\/div>\s*<div class="l">Einsätze heute/);
  assert.match(voll, APP_LINK);

  // nur zwei Zahlen: genau zwei Kacheln
  ladenKachel.daten = { ...ladenKachel.daten, montage: { einsaetzeHeute: 5, rueckmeldungenNeu: 1 } };
  const zwei = heuteMontage();
  assert.equal((zwei.match(/class="heute-kpi"/g) || []).length, 2);
  assert.ok(!/Anträge offen/.test(zwei));

  // ohne montage (aeltere App): noch nicht verbunden, Link bleibt
  ladenKachel.daten = { ...ladenKachel.daten, montage: null };
  const alt = heuteMontage();
  assert.match(alt, /noch nicht verbunden/);
  assert.ok(!/heute-kpi"/.test(alt));
  assert.match(alt, APP_LINK);

  // ohne Schluessel: noch nicht verbunden; ohne App-Adresse kein Link
  ladenKachel.daten = { eingerichtet: false, fehlt: 'schluessel', ladenUrl: `${BASIS}?ansicht=laden`, montageUrl: BASIS };
  assert.match(heuteMontage(), /noch nicht verbunden/);
  ladenKachel.daten = { eingerichtet: false, fehlt: 'url', ladenUrl: null, montageUrl: null };
  const nichts = heuteMontage();
  assert.match(nichts, /noch nicht verbunden/);
  assert.ok(!/href=/.test(nichts));

  // App nicht erreichbar
  ladenKachel.daten = { eingerichtet: true, erreichbar: false, grund: 'netz', abgerufen: STAND, ladenUrl: `${BASIS}?ansicht=laden`, montageUrl: BASIS };
  assert.match(heuteMontage(), /nicht erreichbar/);
});
