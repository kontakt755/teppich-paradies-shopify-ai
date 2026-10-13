import { PRIVAT_DIR } from './_testumgebung.mjs';   // muss zuerst stehen: setzt TP_PRIVAT_DIR vor dem Laden des Servers
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { requestHandler, dateiKoepfe } from '../../../scripts/serve-dashboard.mjs';
import { parseCookies, SESSION_COOKIE } from '../../../scripts/dashboard-auth.mjs';
import { logFehler, pfadOhneAbfrage } from '../../../scripts/dashboard-log.mjs';
import { chipZeit } from '../kern/helfer.mjs';

// Pruefung vom 2026-10-12: eine Anfrage mit "Cookie: x=%" beendete den ganzen
// Dienst - ohne Anmeldung. Diese Tests halten fest, dass kaputte Eingaben eine
// Antwort bekommen und der Prozess weiterlaeuft.

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

/** Faengt console.error ab, solange `fn` laeuft. */
async function mitProtokoll(fn) {
  const zeilen = [];
  const vorher = console.error;
  console.error = (...a) => zeilen.push(a.join(' '));
  try { await fn(); } finally { console.error = vorher; }
  return zeilen;
}

test('parseCookies ueberspringt kaputt kodierte Werte statt zu werfen', () => {
  assert.deepEqual(parseCookies({ headers: { cookie: 'x=%' } }), {});
  const kopfzeile = ['a=%E0%A4%A', `${SESSION_COOKIE}=abc123`, 'b=gut%20so'].join('; ');
  assert.deepEqual(parseCookies({ headers: { cookie: kopfzeile } }), { [SESSION_COOKIE]: 'abc123', b: 'gut so' });
});

test('kaputte Cookies im Netzmodus: Antwort statt Absturz, gueltige Sitzung wirkt weiter', async () => {
  process.env.TP_DASHBOARD_PASSWORT = 'test-passwort-robust';
  process.env.TP_DASHBOARD_HOST = '192.168.2.222';
  const mod = await import('../../../scripts/serve-dashboard.mjs?case=cookie-absturz');
  delete process.env.TP_DASHBOARD_PASSWORT;
  delete process.env.TP_DASHBOARD_HOST;
  assert.equal(mod.auth.required, true);

  await withServer(mod.requestHandler, async base => {
    for (const cookie of ['x=%', 'a=%E0%A4%A']) {
      const seite = await fetch(`${base}/`, { headers: { cookie }, redirect: 'manual' });
      assert.equal(seite.status, 302, `Seite mit Cookie ${cookie}`);
      assert.equal((await fetch(`${base}/api/capabilities`, { headers: { cookie } })).status, 401, `API mit Cookie ${cookie}`);
      assert.equal((await fetch(`${base}/api/session`, { headers: { cookie } })).status, 200);
      assert.equal((await fetch(`${base}/api/logout`, { method: 'POST', headers: { cookie } })).status, 200);
      assert.equal((await fetch(`${base}/login`, { headers: { cookie } })).status, 200);
    }
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passwort: 'test-passwort-robust' }) });
    assert.equal(login.status, 200);
    const sitzung = login.headers.get('set-cookie').split(';')[0];
    // Ein kaputtes Cookie daneben kostet die Sitzung nicht.
    const mit = await fetch(`${base}/api/session`, { headers: { cookie: `x=%; ${sitzung}` } });
    assert.equal((await mit.json()).authenticated, true);
  });
});

test('ein Fehler, der bis in den requestHandler durchschlaegt, wird zur 500 mit Protokollzeile', async () => {
  const antwort = { status: null, koepfe: null, body: '', headersSent: false };
  const res = {
    get headersSent() { return antwort.headersSent; },
    writeHead(status, koepfe) { antwort.status = status; antwort.koepfe = koepfe; antwort.headersSent = true; },
    setHeader() {}, end(b) { antwort.body += b ?? ''; }, destroy() {},
  };
  // Abmelden liest die Cookies - hier wirft schon der Zugriff auf die Kopfzeilen.
  const req = { url: '/api/logout?x=1', method: 'POST', socket: {}, get headers() { throw new Error('kaputte Anfrage'); } };
  const zeilen = await mitProtokoll(async () => { await requestHandler(req, res); });
  assert.equal(antwort.status, 500);
  assert.match(JSON.parse(antwort.body).error, /Fehler melden/);
  assert.equal(zeilen.length, 1);
  assert.match(zeilen[0], /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z \[server\] 500 POST \/api\/logout: Error: kaputte Anfrage/);
});

test('Fehlerantworten der API: eine Zeile mit Zeit, Status und Pfad - ohne Abfrageteil', async () => withServer(requestHandler, async base => {
  const zeilen = await mitProtokoll(async () => {
    const leer = await fetch(`${base}/api/org/neu`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(leer.status, 400, 'fehlender Titel ist ein Eingabefehler, kein 500');
    assert.match((await leer.json()).error, /Ohne Titel/);
    assert.equal((await fetch(`${base}/api/gibtsnicht?q=Erika%20Mustermann`)).status, 404);
  });
  assert.equal(zeilen.length, 2);
  assert.match(zeilen[0], /^\d{4}-\d\d-\d\dT[\d:.]+Z \[api\] 400 POST \/api\/org\/neu: Ohne Titel geht es nicht$/);
  assert.match(zeilen[1], /\[api\] 404 GET \/api\/gibtsnicht: Unbekannter API-Pfad$/);
  assert.ok(!zeilen.join('\n').includes('Mustermann'), 'Suchbegriffe (Kundennamen) gehoeren nicht ins Protokoll');
}));

test('zu grosser Koerper: die 413 kommt beim Browser an, statt einer abgerissenen Verbindung', async () => withServer(requestHandler, async base => {
  const gross = JSON.stringify({ titel: 'x'.repeat(100 * 1024) });
  let r;
  const zeilen = await mitProtokoll(async () => {
    r = await fetch(`${base}/api/org/neu`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: gross });
  });
  assert.equal(r.status, 413);
  assert.match((await r.json()).error, /zu groß/);
  assert.match(zeilen[0], /\[api\] 413 POST \/api\/org\/neu/);
  // Der Dienst laeuft weiter.
  assert.equal((await fetch(`${base}/index.html`)).status, 200);
}));

test('kein Einbetten in fremde Seiten: jede Antwort verbietet Rahmen', async () => withServer(requestHandler, async base => {
  for (const pfad of ['/', '/login', '/api/session', '/api/gibtsnicht']) {
    let r;
    await mitProtokoll(async () => { r = await fetch(`${base}${pfad}`); });
    assert.equal(r.headers.get('x-frame-options'), 'DENY', pfad);
    assert.equal(r.headers.get('content-security-policy'), "frame-ancestors 'none'", pfad);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', pfad);
  }
}));

test('Anhaenge: nur Bilder, PDF und Text im Fenster, alles andere als Download - immer nosniff', () => {
  const bild = dateiKoepfe({ typ: 'image/png', name: 'Aufmaß Küche.png' });
  assert.equal(bild['Content-Type'], 'image/png');
  assert.match(bild['Content-Disposition'], /^inline; filename="Aufma_ K_che\.png"; filename\*=UTF-8''Aufma%C3%9F%20K%C3%BCche\.png$/);
  assert.equal(bild['X-Content-Type-Options'], 'nosniff');
  assert.equal(dateiKoepfe({ typ: 'text/plain', name: 'notiz.txt' })['Content-Type'], 'text/plain; charset=utf-8');
  for (const typ of ['text/csv', 'image/heic', 'text/html', 'image/svg+xml', undefined]) {
    const k = dateiKoepfe({ typ, name: 'datei' });
    assert.match(k['Content-Disposition'], /^attachment;/, String(typ));
    assert.equal(k['Content-Type'], 'application/octet-stream', String(typ));
  }
});

test('Anhang ueber den Server: ein CSV kommt als Download mit nosniff', async () => {
  // Eintrag samt Anhang direkt in der Testablage anlegen (wie org/anhang es taete).
  const ordner = path.join(PRIVAT_DIR, 'organisation');
  fs.mkdirSync(path.join(ordner, 'anhaenge', 'tp-test-1'), { recursive: true });
  fs.writeFileSync(path.join(ordner, 'anhaenge', 'tp-test-1', 'liste.csv'), 'a;b\n1;2\n');
  const eintraege = fs.existsSync(path.join(ordner, 'eintraege.json')) ? JSON.parse(fs.readFileSync(path.join(ordner, 'eintraege.json'), 'utf8')) : { version: 1, eintraege: [] };
  eintraege.eintraege.push({ id: 'tp-test-1', typ: 'TASK', titel: 'Test', status: 'INBOX', sichtbarkeit: 'TEAM', besitzer: 'inhaber', fuer: [], anhaenge: [{ datei: 'liste.csv', name: 'liste.csv', typ: 'text/csv' }], kommentare: [], verlauf: [] });
  fs.writeFileSync(path.join(ordner, 'eintraege.json'), JSON.stringify(eintraege));
  await withServer(requestHandler, async base => {
    const r = await fetch(`${base}/api/org/anhang-lesen?id=tp-test-1&datei=liste.csv`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-disposition'), /^attachment;/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await r.text(), 'a;b\n1;2\n');
  });
});

test('logFehler: einzeilig, mit Zeit; pfadOhneAbfrage schneidet Suchbegriffe ab', () => {
  const zeilen = [];
  logFehler('api', 'zwei\nZeilen', { ziel: { error: z => zeilen.push(z) }, jetzt: new Date('2026-10-12T14:00:00Z') });
  assert.deepEqual(zeilen, ['2026-10-12T14:00:00.000Z [api] zwei Zeilen']);
  assert.equal(pfadOhneAbfrage('/api/kunden/suche?q=Erika'), '/api/kunden/suche');
});

test('beschaedigte benutzer.json: Anmeldung sagt das (503), der Notzugang kommt trotzdem herein', async () => {
  const dir = fs.mkdtempSync(path.join(PRIVAT_DIR, 'benutzer-kaputt-'));
  fs.writeFileSync(path.join(dir, 'benutzer.json'), '{"benutzer": [{"name": "Test"');
  const vorher = process.env.TP_PRIVAT_DIR;
  process.env.TP_PRIVAT_DIR = dir;
  process.env.TP_DASHBOARD_PASSWORT = 'test-notzugang-robust';
  process.env.TP_DASHBOARD_HOST = '192.168.2.222';
  try {
    const mod = await import('../../../scripts/serve-dashboard.mjs?case=benutzer-kaputt');
    delete process.env.TP_DASHBOARD_PASSWORT;
    delete process.env.TP_DASHBOARD_HOST;
    await withServer(mod.requestHandler, async base => {
      const anmelden = body => fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      let falsch;
      const zeilen = await mitProtokoll(async () => { falsch = await anmelden({ name: 'Test', passwort: 'irgendwas' }); });
      assert.equal(falsch.status, 503);
      assert.match((await falsch.json()).error, /Liste der Zugänge ist nicht lesbar/);
      assert.match(zeilen.join('\n'), /\[anmeldung\] 503 Zugangsliste nicht lesbar/);
      assert.ok(!zeilen.join('\n').includes('irgendwas'), 'kein Passwort im Protokoll');
      const not = await anmelden({ passwort: 'test-notzugang-robust' });
      assert.equal(not.status, 200);
    });
    assert.equal(fs.readFileSync(path.join(dir, 'benutzer.json'), 'utf8'), '{"benutzer": [{"name": "Test"', 'Datei unveraendert');
  } finally {
    process.env.TP_PRIVAT_DIR = vorher;
    delete process.env.TP_DASHBOARD_PASSWORT;
    delete process.env.TP_DASHBOARD_HOST;
  }
});

test('Datenstand-Chip: heute nur die Uhrzeit, an jedem anderen Tag mit Datum', () => {
  const jetzt = new Date(2026, 9, 12, 16, 30);
  assert.equal(chipZeit(new Date(2026, 9, 12, 14, 5).toISOString(), jetzt), '14:05');
  assert.equal(chipZeit(new Date(2026, 9, 10, 9, 0).toISOString(), jetzt), '10.10. 09:00');
  assert.equal(chipZeit(null, jetzt), '–');
  assert.equal(chipZeit('kein Datum', jetzt), '–');
});
