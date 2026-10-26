import './_testumgebung.mjs'; // setzt TP_PRIVAT_DIR auf ein leeres Testverzeichnis - muss vor allem anderen laufen
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { anmeldeGeraet } from '../../../operations/lib/anmeldeschutz.mjs';
import { createAuth, loadConfiguredPassword, passwordFilePath, parseCookies, renderLoginPage, sessionCookieHeader, sessionFilePath, SESSION_COOKIE, SESSION_TTL_LANG_MS } from '../../../scripts/dashboard-auth.mjs';

// Isoliertes Privatverzeichnis, unabhaengig davon, was auf dem jeweiligen Rechner liegt.
const TMP_PRIVAT = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-dashboard-auth-test-'));

// ---------------------------------------------------------------------------
// Reine Funktionen aus dashboard-auth.mjs
// ---------------------------------------------------------------------------

test('createAuth: ohne Passwort ist required=false, jede Sitzungspruefung negativ', () => {
  const auth = createAuth({ password: null });
  assert.equal(auth.required, false);
  assert.equal(auth.verifyPassword('irgendwas'), false);
  assert.equal(auth.validSession('nichtvorhanden'), false);
});

test('createAuth: richtiges Passwort erzeugt gueltige Sitzung, falsches nicht', () => {
  const auth = createAuth({ password: 'test-passwort' });
  assert.equal(auth.required, true);
  assert.equal(auth.verifyPassword('falsch'), false);
  assert.equal(auth.verifyPassword('test-passwort'), true);
  const sid = auth.createSession();
  assert.equal(auth.validSession(sid), true);
  auth.destroySession(sid);
  assert.equal(auth.validSession(sid), false);
});

test('createAuth: Ratenbegrenzung sperrt nach mehreren Fehlversuchen je IP', () => {
  const auth = createAuth({ password: 'test-passwort' });
  const ip = '192.168.2.50';
  assert.equal(auth.isLocked(ip), false);
  for (let i = 0; i < 5; i += 1) auth.registerFailure(ip);
  assert.equal(auth.isLocked(ip), true);
  // eine andere IP ist von der Sperre nicht betroffen
  assert.equal(auth.isLocked('192.168.2.51'), false);
});

test('loadConfiguredPassword: Env geht vor Datei, beide leer -> null', () => {
  const readFile = () => { throw new Error('keine Datei'); };
  assert.equal(loadConfiguredPassword({ env: {}, readFile }), null);
  assert.equal(loadConfiguredPassword({ env: { TP_DASHBOARD_PASSWORT: '  ' }, readFile }), null);
  assert.equal(loadConfiguredPassword({ env: { TP_DASHBOARD_PASSWORT: 'ausenv' }, readFile: () => 'ausdatei' }), 'ausenv');
  assert.equal(loadConfiguredPassword({ env: {}, readFile: () => 'ausdatei\n' }), 'ausdatei');
});

test('passwordFilePath liegt unter TP_PRIVAT_DIR, nie im Repository', () => {
  const p = passwordFilePath();
  assert.match(p, /dashboard-passwort\.txt$/);
});

test('parseCookies liest das Sitzungscookie aus dem Header', () => {
  const cookies = parseCookies({ headers: { cookie: `a=b; ${SESSION_COOKIE}=test-sitzung-wert; c=d` } });
  assert.equal(cookies[SESSION_COOKIE], 'test-sitzung-wert');
  assert.deepEqual(parseCookies({ headers: {} }), {});
});

// ---------------------------------------------------------------------------
// Integration: Server im Netzmodus mit Passwort (dynamischer Import pro Fall,
// damit jedes Modul seine eigene Auth-Konfiguration aus process.env liest).
// ---------------------------------------------------------------------------

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}

test('Netzmodus mit Passwort: geschuetzte Route ohne Sitzung 401/302, falsches Passwort abgelehnt, richtiges setzt Sitzung', async () => {
  process.env.TP_PRIVAT_DIR = TMP_PRIVAT;
  process.env.TP_DASHBOARD_PASSWORT = 'sicheres-testpasswort';
  process.env.TP_DASHBOARD_HOST = '192.168.2.222';
  const mod = await import(`../../../scripts/serve-dashboard.mjs?case=auth-required`);
  delete process.env.TP_DASHBOARD_PASSWORT;
  delete process.env.TP_DASHBOARD_HOST;
  assert.equal(mod.auth.required, true);

  await withServer(mod.requestHandler, async base => {
    // API ohne Sitzung -> 401
    const apiNoSession = await fetch(`${base}/api/capabilities`);
    assert.equal(apiNoSession.status, 401);

    // HTML-Route ohne Sitzung -> Redirect auf /login
    const pageNoSession = await fetch(`${base}/`, { redirect: 'manual' });
    assert.equal(pageNoSession.status, 302);
    assert.match(pageNoSession.headers.get('location'), /\/login$/);

    // Login-Seite selbst ist immer erreichbar
    const loginPage = await fetch(`${base}/login`);
    assert.equal(loginPage.status, 200);
    assert.match(await loginPage.text(), /Anmeldung/);

    // Falsches Passwort -> 401, kein Cookie
    const wrong = await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passwort: 'falsch' }),
    });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.headers.get('set-cookie'), null);

    // Fremder Origin bleibt auch beim Login 403
    const foreignLogin = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ passwort: 'sicheres-testpasswort' }),
    });
    assert.equal(foreignLogin.status, 403);

    // Richtiges Passwort -> 200 + Sitzungscookie (HttpOnly, SameSite=Strict)
    const right = await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passwort: 'sicheres-testpasswort' }),
    });
    assert.equal(right.status, 200);
    const setCookie = right.headers.get('set-cookie');
    assert.match(setCookie, new RegExp(`${SESSION_COOKIE}=`));
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    const cookiePair = setCookie.split(';')[0];

    // Mit Cookie: geschuetzte Route liefert 200
    const withCookie = await fetch(`${base}/api/capabilities`, { headers: { cookie: cookiePair } });
    assert.equal(withCookie.status, 200);

    // Fremder Origin bleibt bei schreibenden Endpunkten 403, auch mit gueltiger Sitzung
    const foreignWrite = await fetch(`${base}/api/tasks/1/comment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookiePair, origin: 'https://evil.example' },
      body: '{}',
    });
    assert.equal(foreignWrite.status, 403);

    // Abmelden loescht die Sitzung
    const logout = await fetch(`${base}/api/logout`, { method: 'POST', headers: { cookie: cookiePair } });
    assert.equal(logout.status, 200);
    const afterLogout = await fetch(`${base}/api/capabilities`, { headers: { cookie: cookiePair } });
    assert.equal(afterLogout.status, 401);
  });
});

test('Knopf "Jetzt aktualisieren": POST ohne Sitzung 401, mit Sitzung erlaubt', async () => {
  process.env.TP_PRIVAT_DIR = TMP_PRIVAT;
  process.env.TP_DASHBOARD_PASSWORT = 'sicheres-testpasswort';
  process.env.TP_DASHBOARD_HOST = '192.168.2.222';
  const mod = await import(`../../../scripts/serve-dashboard.mjs?case=aktualisieren-auth`);
  delete process.env.TP_DASHBOARD_PASSWORT;
  delete process.env.TP_DASHBOARD_HOST;

  await withServer(mod.requestHandler, async base => {
    // Ohne Sitzung: 401, egal ob GET (Status) oder POST (Start)
    const statusNoSession = await fetch(`${base}/api/aktualisierung/status`);
    assert.equal(statusNoSession.status, 401);
    const startNoSession = await fetch(`${base}/api/aktualisierung/start`, { method: 'POST' });
    assert.equal(startNoSession.status, 401);

    // Anmelden
    const login = await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passwort: 'sicheres-testpasswort' }),
    });
    const cookiePair = login.headers.get('set-cookie').split(';')[0];

    // Mit Sitzung: GET-Status erlaubt
    const status = await fetch(`${base}/api/aktualisierung/status`, { headers: { cookie: cookiePair } });
    assert.equal(status.status, 200);
    const statusJson = await status.json();
    assert.equal(typeof statusJson.laeuft, 'boolean');

    // Mit Sitzung, aber fremder Origin: 403
    const foreign = await fetch(`${base}/api/aktualisierung/start`, {
      method: 'POST', headers: { cookie: cookiePair, origin: 'https://evil.example' },
    });
    assert.equal(foreign.status, 403);

    // GET auf den Start-Endpunkt: 405 (nur POST)
    const wrongMethod = await fetch(`${base}/api/aktualisierung/start`, { headers: { cookie: cookiePair } });
    assert.equal(wrongMethod.status, 405);
  });
});

test('Standardbetrieb (kein Passwort, 127.0.0.1) bleibt unveraendert: keine Anmeldung noetig', async () => {
  process.env.TP_PRIVAT_DIR = TMP_PRIVAT;
  delete process.env.TP_DASHBOARD_PASSWORT;
  delete process.env.TP_DASHBOARD_HOST;
  const mod = await import(`../../../scripts/serve-dashboard.mjs?case=default`);
  assert.equal(mod.auth.required, false);
  await withServer(mod.requestHandler, async base => {
    const r = await fetch(`${base}/api/capabilities`);
    assert.equal(r.status, 200);
    const session = await (await fetch(`${base}/api/session`)).json();
    assert.deepEqual(session, { required: false, authenticated: true, benutzer: null });
  });
});

test('Netzmodus ohne Passwort: assertStartupAllowed verweigert den Start', async () => {
  process.env.TP_PRIVAT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-dashboard-auth-empty-'));
  delete process.env.TP_DASHBOARD_PASSWORT;
  const mod = await import(`../../../scripts/serve-dashboard.mjs?case=startup-guard`);
  assert.throws(() => mod.assertStartupAllowed({ host: '0.0.0.0', authObj: mod.auth }), /Passwort/);
  // 127.0.0.1 bleibt ohne Passwort erlaubt (Standardbetrieb)
  assert.doesNotThrow(() => mod.assertStartupAllowed({ host: '127.0.0.1', authObj: mod.auth }));
});

// ---------------------------------------------------------------------------
// Mehrbenutzerbetrieb: Name+Passwort gegen benutzer.json, Rolle "lesen"
// serverseitig ohne Schreibrechte, Notzugang bleibt gueltig.
// ---------------------------------------------------------------------------

test('Mehrbenutzerbetrieb: Anmeldung mit Name+Passwort, Rolle "lesen" bekommt 403 auf Schreib-Endpunkte, Notzugang bleibt gueltig', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const privatDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-dashboard-auth-mehrbenutzer-'));
  process.env.TP_PRIVAT_DIR = privatDir;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  process.env.TP_DASHBOARD_HOST = '192.168.2.223';
  let liste = benutzerAnlegen([], { name: 'Lena Lesend', kuerzel: 'lena', passwort: 'platzhalter-lesen-1', rolle: 'lesen' });
  liste = benutzerAnlegen(liste, { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-1', rolle: 'mitarbeiter' });
  schreibeBenutzer(liste, path.join(privatDir, 'benutzer.json'));

  const mod = await import(`../../../scripts/serve-dashboard.mjs?case=mehrbenutzer`);
  delete process.env.TP_DASHBOARD_PASSWORT;
  delete process.env.TP_DASHBOARD_HOST;
  assert.equal(mod.auth.required, true);

  await withServer(mod.requestHandler, async base => {
    // Falscher Name/Passwort -> 401
    const falsch = await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'lena', passwort: 'falsch' }),
    });
    assert.equal(falsch.status, 401);

    // Rolle "lesen": Anmeldung klappt, /api/session nennt Name+Rolle
    const loginLesen = await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'lena', passwort: 'platzhalter-lesen-1' }),
    });
    assert.equal(loginLesen.status, 200);
    const cookieLesen = loginLesen.headers.get('set-cookie').split(';')[0];
    const sessionLesen = await (await fetch(`${base}/api/session`, { headers: { cookie: cookieLesen } })).json();
    assert.deepEqual(sessionLesen.benutzer, { name: 'Lena Lesend', kuerzel: 'lena', rolle: 'lesen' });

    // Rolle "lesen": Statuswechsel (Schreib-Endpunkt) wird serverseitig mit 403 abgelehnt
    const gesperrterSchreibzugriff = await fetch(`${base}/api/einkauf/auftragsstatus`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieLesen },
      body: JSON.stringify({ orderId: '1', lineItemId: '1', status: 'bestellt' }),
    });
    assert.equal(gesperrterSchreibzugriff.status, 403);

    // Rolle "lesen": Benutzerverwaltung ist nicht sichtbar
    const keineBenutzerliste = await fetch(`${base}/api/benutzer`, { headers: { cookie: cookieLesen } });
    assert.equal(keineBenutzerliste.status, 403);

    // Rolle "mitarbeiter": Statuswechsel im Einkauf geht durch, Name landet im Eintrag
    const loginMitarbeiter = await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'mona', passwort: 'platzhalter-mitarbeiter-1' }),
    });
    assert.equal(loginMitarbeiter.status, 200);
    const cookieMona = loginMitarbeiter.headers.get('set-cookie').split(';')[0];
    const erlaubterSchreibzugriff = await fetch(`${base}/api/einkauf/auftragsstatus`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieMona },
      body: JSON.stringify({ orderId: '1', lineItemId: '1', status: 'bestellt' }),
    });
    assert.equal(erlaubterSchreibzugriff.status, 200);
    const j = await erlaubterSchreibzugriff.json();
    assert.equal(j.eintrag.aktualisiertVon, 'Mona Mitarbeiter');

    // Notzugang mit dem alten Einzelpasswort bleibt gueltig, auch wenn benutzer.json existiert
    const notzugang = await fetch(`${base}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'irgendwer', passwort: 'notzugang-testpasswort' }),
    });
    assert.equal(notzugang.status, 200);
    // Kurzer Name mit Absicht, wie cookieMona und cookieLesen weiter oben:
    // secret:scan wertet einen unquotierten Bezeichner ab zwoelf Zeichen hinter
    // "cookie:" als hinterlegtes Geheimnis und blockiert den Lauf.
    const cookieChef = notzugang.headers.get('set-cookie').split(';')[0];
    const notzugangSession = await (await fetch(`${base}/api/session`, { headers: { cookie: cookieChef } })).json();
    assert.equal(notzugangSession.benutzer.rolle, 'inhaber');

    // Das Protokoll sagt, wer wann was getan hat - das ist Inhabersache. Fuer
    // Mitarbeiter und "lesen" ist der Pfad gesperrt, nicht nur der Menuepunkt.
    const protokollMona = await fetch(`${base}/api/protokoll`, { headers: { cookie: cookieMona } });
    assert.equal(protokollMona.status, 403, 'Mitarbeiter duerfen das Protokoll nicht lesen');
    const protokollLesen = await fetch(`${base}/api/protokoll`, { headers: { cookie: cookieLesen } });
    assert.equal(protokollLesen.status, 403, 'Rolle "lesen" erst recht nicht');
    // Claude-Verbrauch nennt die Titel aller KI-Sitzungen - Inhabersache wie "Insights" (#671).
    const verbrauchMona = await fetch(`${base}/api/verbrauch/claude`, { headers: { cookie: cookieMona } });
    assert.equal(verbrauchMona.status, 403, 'Mitarbeiter sehen den Claude-Verbrauch nicht');

    // Protokoll zeigt dem Inhaber den zuletzt geschriebenen Eintrag mit Anzeigenamen
    const protokoll = await (await fetch(`${base}/api/protokoll`, { headers: { cookie: cookieChef } })).json();
    const verbrauchChef = await fetch(`${base}/api/verbrauch/claude`, { headers: { cookie: cookieChef } });
    assert.equal(verbrauchChef.status, 200, 'der Inhaber schon');
    assert.ok(protokoll.eintraege.some(e => e.benutzer === 'Mona Mitarbeiter' && e.aktion === 'Auftragsstatus'));
  });
});


// ---------------------------------------------------------------------------
// "Angemeldet bleiben": der Ladenrechner soll morgens nicht neu fragen
// ---------------------------------------------------------------------------

test('lange Sitzung ueberlebt einen Dienst-Neustart, kurze bleibt im Speicher', () => {
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-auth-sitzung-'));
  const alt = process.env.TP_PRIVAT_DIR;
  process.env.TP_PRIVAT_DIR = privat;
  try {
    const auth = createAuth({ password: 'test-passwort' });
    const sid = auth.createSession({ name: 'Inhaber', kuerzel: null, rolle: 'inhaber' }, { lang: true });
    // Neustart des Dienstes = neues Auth-Objekt, gleiche Datei
    const nachNeustart = createAuth({ password: 'test-passwort' });
    assert.equal(nachNeustart.validSession(sid), true);
    assert.equal(nachNeustart.sessionBenutzer(sid).rolle, 'inhaber');
    nachNeustart.destroySession(sid);
    assert.equal(createAuth({ password: 'test-passwort' }).validSession(sid), false);
  } finally {
    if (alt === undefined) delete process.env.TP_PRIVAT_DIR; else process.env.TP_PRIVAT_DIR = alt;
  }
});

test('die Sitzungsdatei enthaelt nie den Cookie selbst, nur seinen Hash', () => {
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-auth-sitzung-hash-'));
  const alt = process.env.TP_PRIVAT_DIR;
  process.env.TP_PRIVAT_DIR = privat;
  try {
    const auth = createAuth({ password: 'test-passwort' });
    const sid = auth.createSession({ name: 'Inhaber', kuerzel: null, rolle: 'inhaber' }, { lang: true });
    const inhalt = fs.readFileSync(sessionFilePath(), 'utf8');
    assert.equal(inhalt.includes(sid), false);
  } finally {
    if (alt === undefined) delete process.env.TP_PRIVAT_DIR; else process.env.TP_PRIVAT_DIR = alt;
  }
});

test('sessionCookieHeader: lange Sitzung setzt 30 Tage', () => {
  assert.match(sessionCookieHeader('abc', { lang: true }), new RegExp(`Max-Age=${Math.floor(SESSION_TTL_LANG_MS / 1000)}`));
  assert.equal(sessionCookieHeader('abc').includes(`Max-Age=${Math.floor(SESSION_TTL_LANG_MS / 1000)}`), false);
});

test('Anmeldeseite zeigt das Namensfeld nur, wenn es Mitarbeiterzugaenge gibt', () => {
  const ohne = renderLoginPage({ mitBenutzern: false });
  assert.equal(ohne.includes('id="name"'), false);
  assert.match(ohne, /angemeldet bleiben/i);
  const mit = renderLoginPage({ mitBenutzern: true });
  assert.match(mit, /id="name"/);
});

// ---------------------------------------------------------------------------
// Rundgang 26.10., Massnahme 58: Passwortwechsel meldet ab, Sperre je Geraet,
// "Alle anderen Geraete abmelden".
// ---------------------------------------------------------------------------

function mitPrivatDir(praefix, run) {
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), praefix));
  const alt = process.env.TP_PRIVAT_DIR;
  process.env.TP_PRIVAT_DIR = privat;
  try { return run(privat); } finally {
    if (alt === undefined) delete process.env.TP_PRIVAT_DIR; else process.env.TP_PRIVAT_DIR = alt;
  }
}
const INHABER = { name: 'Inhaber', kuerzel: null, rolle: 'inhaber' };
const hashVon = sid => crypto.createHash('sha256').update(sid, 'utf8').digest('hex');

test('Notzugang: ein neues gemeinsames Passwort meldet alle damit angemeldeten Geraete ab', () => mitPrivatDir('tp-auth-abdruck-', () => {
  const sid = createAuth({ password: 'test-passwort-example' }).createSession(INHABER, { lang: true });
  assert.equal(createAuth({ password: 'test-passwort-example' }).validSession(sid), true, 'gleiches Passwort: bleibt angemeldet');
  const inhalt = fs.readFileSync(sessionFilePath(), 'utf8');
  assert.equal(inhalt.includes('test-passwort-example'), false, 'das Passwort selbst steht nie in der Sitzungsdatei');
  const neu = createAuth({ password: 'test-passwort-dummy' });
  assert.equal(neu.validSession(sid), false, 'neues Passwort: alte Sitzung ungueltig');
  assert.equal(fs.readFileSync(sessionFilePath(), 'utf8').includes(hashVon(sid)), false, 'und aus der Datei entfernt');
  assert.equal(createAuth({ password: 'test-passwort-example' }).validSession(sid), false, 'auch zurueck zum alten Passwort kommt sie nicht wieder');
  assert.equal(createAuth({ password: null }).validSession(sid), false);
}));

test('Notzugang-Sitzungen von vor dem Update bleiben gueltig und uebernehmen das jetzige Passwort', () => mitPrivatDir('tp-auth-altbestand-', () => {
  const sid = 'a'.repeat(64);
  const bis = Date.now() + 24 * 60 * 60 * 1000;
  fs.writeFileSync(sessionFilePath(), JSON.stringify({ sitzungen: { [hashVon(sid)]: { expiresAt: bis, benutzer: INHABER } } }));
  const auth = createAuth({ password: 'test-passwort-sample' });
  assert.equal(auth.validSession(sid), true, 'niemand wird durch das Update abgemeldet');
  const eintrag = JSON.parse(fs.readFileSync(sessionFilePath(), 'utf8')).sitzungen[hashVon(sid)];
  assert.match(eintrag.pw, /^[0-9a-f]{24}$/, 'der Abdruck steht schon nach dem Start in der Datei');
  assert.equal(createAuth({ password: 'test-passwort-sample' }).validSession(sid), true);
  assert.equal(createAuth({ password: 'test-passwort-placeholder' }).validSession(sid), false, 'ein spaeterer Wechsel trifft auch sie');
}));

test('andereSitzungenBeenden: alle anderen Geraete enden, das eigene bleibt; sitzungenAnzahl zaehlt nur gueltige', () => mitPrivatDir('tp-auth-andere-', () => {
  const auth = createAuth({ password: 'test-passwort' });
  const eigene = auth.createSession(INHABER, { lang: true });
  const laden = auth.createSession(INHABER, { lang: true });
  const handy = auth.createSession(INHABER);
  assert.equal(auth.sitzungenAnzahl(), 3);
  assert.equal(auth.andereSitzungenBeenden(eigene), 2);
  assert.equal(auth.validSession(eigene), true);
  assert.equal(auth.validSession(laden), false);
  assert.equal(auth.validSession(handy), false);
  assert.equal(auth.sitzungenAnzahl(), 1);
  assert.equal(createAuth({ password: 'test-passwort' }).validSession(laden), false, 'auch nach einem Neustart');
  // Mit neuem Passwort zaehlt die alte Notzugang-Sitzung nicht mehr mit.
  assert.equal(createAuth({ password: 'test-passwort-dummy' }).sitzungenAnzahl(), 0);
}));

test('anmeldeGeraet: Tailscale-Kopf nur von 127.0.0.1, letzter X-Forwarded-For-Eintrag, sonst die Adresse', () => {
  const req = (remoteAddress, headers = {}) => ({ socket: { remoteAddress }, headers });
  assert.deepEqual(anmeldeGeraet(req('127.0.0.1', { 'x-forwarded-for': '100.101.1.2' })), { schluessel: 'tailnet:100.101.1.2', anzeige: '100.101.1.2' });
  assert.equal(anmeldeGeraet(req('::ffff:127.0.0.1', { 'x-forwarded-for': '1.2.3.4, 100.101.1.3' })).schluessel, 'tailnet:100.101.1.3', 'mitgeschickte Eintraege davor zaehlen nicht');
  assert.equal(anmeldeGeraet(req('127.0.0.1', { 'tailscale-user-login': 'Test@Example.org' })).schluessel, 'tailnet-konto:test@example.org');
  assert.equal(anmeldeGeraet(req('127.0.0.1', { 'tailscale-user-login': 'test@example.org' })).anzeige, 'Tailnet', 'das Konto landet nicht im Protokoll');
  assert.equal(anmeldeGeraet(req('127.0.0.1')).schluessel, '127.0.0.1', 'am Mac selbst wie bisher');
  assert.equal(anmeldeGeraet(req('127.0.0.1', { 'x-forwarded-for': 'kein-ip' })).schluessel, '127.0.0.1');
  assert.equal(anmeldeGeraet(req('127.0.0.1', { 'x-forwarded-for': '127.0.0.1' })).schluessel, '127.0.0.1');
  // Von jeder anderen Adresse ist der Kopf faelschbar und bleibt unbeachtet.
  assert.equal(anmeldeGeraet(req('192.168.2.40', { 'x-forwarded-for': '100.101.1.2', 'tailscale-user-login': 'test@example.org' })).schluessel, '192.168.2.40');
});

test('Sperre je Geraet hinter tailscale serve; "Alle anderen Geraete abmelden" nur fuer den Inhaber', async () => {
  const { schreibeBenutzer, benutzerAnlegen } = await import('../../../operations/lib/benutzer.mjs');
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-dashboard-auth-geraete-'));
  process.env.TP_PRIVAT_DIR = privat;
  process.env.TP_DASHBOARD_PASSWORT = 'notzugang-testpasswort';
  process.env.TP_DASHBOARD_HOST = '192.168.2.224';
  schreibeBenutzer(benutzerAnlegen([], { name: 'Mona Mitarbeiter', kuerzel: 'mona', passwort: 'platzhalter-mitarbeiter-2', rolle: 'mitarbeiter' }), path.join(privat, 'benutzer.json'));
  const mod = await import(`../../../scripts/serve-dashboard.mjs?case=geraete`);
  delete process.env.TP_DASHBOARD_PASSWORT;
  delete process.env.TP_DASHBOARD_HOST;

  await withServer(mod.requestHandler, async base => {
    const anmelden = (body, headers = {}) => fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    // Ein Handy vertippt sich fuenfmal ...
    const handyA = { 'x-forwarded-for': '100.101.7.1' };
    for (let i = 0; i < 5; i += 1) assert.equal((await anmelden({ name: 'mona', passwort: 'falsch' }, handyA)).status, 401);
    assert.equal((await anmelden({ name: 'mona', passwort: 'platzhalter-mitarbeiter-2' }, handyA)).status, 429, 'dieses Geraet wartet');
    // ... die anderen Geraete und der Mac selbst kommen weiter herein.
    const handyB = await anmelden({ name: 'mona', passwort: 'platzhalter-mitarbeiter-2' }, { 'x-forwarded-for': '100.101.7.2' });
    assert.equal(handyB.status, 200);
    const cookieMona = handyB.headers.get('set-cookie').split(';')[0];
    const amMac = await anmelden({ passwort: 'notzugang-testpasswort' });
    assert.equal(amMac.status, 200);
    const cookieChef = amMac.headers.get('set-cookie').split(';')[0];
    const laden = await anmelden({ passwort: 'notzugang-testpasswort' }, { 'x-forwarded-for': '100.101.7.3' });
    const cookieLaden = laden.headers.get('set-cookie').split(';')[0];

    // Zugaenge zeigen, wie viele Geraete angemeldet sind.
    const liste = await (await fetch(`${base}/api/team/liste`, { headers: { cookie: cookieChef } })).json();
    assert.equal(liste.angemeldeteGeraete, 3);

    // Mitarbeiter duerfen nicht alle abmelden; GET schreibt nichts.
    assert.equal((await fetch(`${base}/api/sitzungen/abmelden`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieMona }, body: '{}' })).status, 403);
    assert.equal((await fetch(`${base}/api/sitzungen/abmelden`, { headers: { cookie: cookieChef } })).status, 405);
    assert.equal((await fetch(`${base}/api/sitzungen/abmelden`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieChef, origin: 'https://evil.example' }, body: '{}' })).status, 403);
    assert.equal(fs.existsSync(path.join(privat, 'geraete-abgemeldet.json')), false);

    const r = await fetch(`${base}/api/sitzungen/abmelden`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieChef }, body: '{}' });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual({ abgemeldet: j.abgemeldet, social: j.social, angemeldeteGeraete: j.angemeldeteGeraete }, { abgemeldet: 2, social: true, angemeldeteGeraete: 1 });
    assert.equal((await fetch(`${base}/api/capabilities`, { headers: { cookie: cookieChef } })).status, 200, 'das eigene Geraet bleibt angemeldet');
    assert.equal((await fetch(`${base}/api/capabilities`, { headers: { cookie: cookieMona } })).status, 401);
    assert.equal((await fetch(`${base}/api/capabilities`, { headers: { cookie: cookieLaden } })).status, 401);
    assert.ok(Date.parse(JSON.parse(fs.readFileSync(path.join(privat, 'geraete-abgemeldet.json'), 'utf8')).ab) > 0, 'Zeitstempel fuer die Social-Zentrale');
    const protokoll = await (await fetch(`${base}/api/protokoll`, { headers: { cookie: cookieChef } })).json();
    assert.ok(protokoll.eintraege.some(e => e.aktion === 'Alle anderen Geräte abgemeldet' && e.objekt === '2 Sitzungen'));
  });
});
