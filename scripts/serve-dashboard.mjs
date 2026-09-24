#!/usr/bin/env node
/**
 * Lokaler Server des Control Centers.
 *
 *   npm run dashboard          # issues.json erzeugen + Server
 *   npm run dashboard:serve    # nur Server (nutzt vorhandene issues.json)
 *
 * Liefert docs/ai-dashboard statisch (noetig, weil fetch() unter file://
 * blockiert wird) und stellt unter /api die lokale Aktions-API bereit
 * (scripts/dashboard-api.mjs).
 *
 * Standard: bindet ausschliesslich an 127.0.0.1, kein Verhaltenswechsel ohne
 * Absicht. Ueber TP_DASHBOARD_HOST (z. B. 0.0.0.0) und PORT im Firmennetz
 * erreichbar machen - dafuer MUSS ein Passwort gesetzt sein
 * (TP_DASHBOARD_PASSWORT oder $TP_PRIVAT_DIR/dashboard-passwort.txt), sonst
 * verweigert der Prozess den Start. Ist ein Passwort gesetzt, verlangt JEDE
 * Route (statisch und /api/*) eine gueltige Sitzung - auch auf 127.0.0.1.
 * Siehe scripts/dashboard-auth.mjs und docs/control-center/ARCHITEKTUR.md.
 *
 * Schreibende Requests werden nur als JSON mit passendem Host/Origin
 * akzeptiert - ein fremder Tab im Browser kann die API nicht ueber ein
 * Formular ansprechen.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createApi, ApiError } from './dashboard-api.mjs';
import {
  createAuth, loadConfiguredPassword, parseCookies, sessionCookieHeader,
  clearedCookieHeader, renderLoginPage, sleep, SESSION_COOKIE,
} from './dashboard-auth.mjs';
import { leseBenutzer, benutzerDateiExistiert, benutzerDateiPfad } from '../operations/lib/benutzer.mjs';
import { protokollPfad, letzteEintraege } from '../operations/lib/protokoll.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const ROOT = resolve(REPO_ROOT, 'docs/ai-dashboard');
const PORT = Number(process.env.PORT || 8001);
const HOST = process.env.TP_DASHBOARD_HOST || '127.0.0.1';
const MAX_BODY = 64 * 1024;

const CONFIGURED_PASSWORD = loadConfiguredPassword();
export const auth = createAuth({ password: CONFIGURED_PASSWORD });

/** Wirft, wenn der Netzmodus ohne Passwort gestartet werden soll. Vor jedem listen() pruefen. */
export function assertStartupAllowed({ host = HOST, authObj = auth } = {}) {
  if (host !== '127.0.0.1' && !authObj.required) {
    throw new Error(
      `Start verweigert: TP_DASHBOARD_HOST=${host} (Netzmodus) verlangt ein gesetztes Passwort. ` +
      'TP_DASHBOARD_PASSWORT setzen oder $TP_PRIVAT_DIR/dashboard-passwort.txt anlegen.'
    );
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const execFileP = promisify(execFile);
async function rebuild() {
  await execFileP(process.execPath, [join(HERE, 'build-dashboard-data.mjs')], { cwd: REPO_ROOT, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
}

export const api = createApi({ root: REPO_ROOT, rebuild });

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolveBody, reject) => {
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) { reject(new ApiError(415, 'Nur application/json')); return; }
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { req.destroy(); reject(new ApiError(413, 'Request zu groß')); } else chunks.push(c); });
    req.on('end', () => { try { resolveBody(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new ApiError(400, 'Ungültiges JSON')); } });
    req.on('error', reject);
  });
}

// Firmennetz: private Adressbereiche (RFC 1918) zusaetzlich zu localhost.
// Der Host-Header kommt vom TCP-Ziel der Verbindung, ein fremder Browser-Tab
// kann ihn per fetch()/Formular nicht faelschen - nur der Origin-Header ist
// vom anfragenden Ursprung gesetzt und wird zusaetzlich geprueft.
const LAN_HOST_RE = /^(127\.0\.0\.1|localhost|10(\.\d{1,3}){3}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|192\.168(\.\d{1,3}){2})(:\d+)?$/i;

function sameOrigin(req) {
  const host = req.headers.host || '';
  const origin = req.headers.origin;
  if (!LAN_HOST_RE.test(host)) return false;
  if (origin) {
    const m = /^https?:\/\/(.+)$/i.exec(origin);
    if (!m || !LAN_HOST_RE.test(m[1])) return false;
  }
  return true;
}

export async function handleApi(req, res, pathname, benutzer = null) {
  // Pfadliste aus beiden Zweigen: Benutzer/Protokoll (Mehrbenutzerbetrieb) und
  // Kunden/Rueckrufe (Kundenansicht) - fehlt einer, antwortet der Server 404.
  const m = pathname.match(/^\/api\/(?:(capabilities|sync|activity|agent-runs|benutzer|protokoll|einkauf\/bestellungen|einkauf\/produktstatus|einkauf\/klaerung|einkauf\/auftragsstatus|einkauf\/kennzahlen|lexikon\/liste|lexikon\/produkt|kunden\/suche|kunden\/detail|kunden\/rueckrufe|aktualisierung|aktualisierung\/status|aktualisierung\/start)|tasks\/(\d+)\/(activity|transition|assign|comment))$/);
  if (!m) { send(res, 404, { error: 'Unbekannter API-Pfad' }); return; }
  const [, simple, number, taskOp] = m;
  const write = simple === 'sync' || simple === 'aktualisierung/start' || (simple === 'einkauf/auftragsstatus' && req.method === 'POST') || (simple === 'kunden/rueckrufe' && req.method === 'POST') || ['transition', 'assign', 'comment'].includes(taskOp);
  try {
    if (write) {
      if (req.method !== 'POST') { send(res, 405, { error: 'POST erwartet' }); return; }
      if (!sameOrigin(req)) { send(res, 403, { error: 'Nur lokal erlaubt' }); return; }
      // Rolle "lesen" darf serverseitig nichts veraendern - unabhaengig davon, ob das
      // Frontend die Aktion anzeigt. Ohne Mehrbenutzerbetrieb (kein `benutzer`) gilt
      // weiterhin der bisherige Notzugang (Inhaber, alle Rechte).
      if (benutzer && benutzer.rolle === 'lesen') { send(res, 403, { error: 'Rolle "lesen" darf keine Aenderungen vornehmen' }); return; }
    } else if (simple === 'benutzer') {
      if (req.method !== 'GET') { send(res, 405, { error: 'GET erwartet' }); return; }
      if (benutzer && benutzer.rolle !== 'inhaber') { send(res, 403, { error: 'Nur fuer die Rolle "inhaber" sichtbar' }); return; }
    } else if (req.method !== 'GET') { send(res, 405, { error: 'GET erwartet' }); return; }
    let result;
    const url = new URL(req.url, `http://${req.headers.host || HOST}`);
    if (simple === 'capabilities') result = await api.capabilities();
    else if (simple === 'sync') result = await api.sync();
    else if (simple === 'activity') result = await api.activity();
    else if (simple === 'agent-runs') result = api.agentRuns();
    else if (simple === 'benutzer') result = benutzerListeOeffentlich();
    else if (simple === 'protokoll') result = { eintraege: letzteEintraege(protokollPfad(), 50) };
    else if (simple === 'einkauf/bestellungen') result = api.einkaufBestellungen();
    else if (simple === 'einkauf/produktstatus') result = api.einkaufProduktstatus({ page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize'), q: url.searchParams.get('q') || '', gruppe: url.searchParams.get('gruppe') || '', filter: url.searchParams.get('filter') || '' });
    else if (simple === 'einkauf/klaerung') result = api.einkaufKlaerung();
    else if (simple === 'einkauf/kennzahlen') result = api.einkaufKennzahlen();
    else if (simple === 'einkauf/auftragsstatus' && req.method === 'GET') result = api.einkaufAuftragsstatus();
    else if (simple === 'einkauf/auftragsstatus' && req.method === 'POST') result = await api.einkaufAuftragsstatusSetzen(await readJson(req), benutzer);
    else if (simple === 'lexikon/liste') result = api.lexikonListe({ q: url.searchParams.get('q') || '', page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') });
    else if (simple === 'lexikon/produkt') result = api.lexikonProdukt(url.searchParams.get('handle') || '');
    else if (simple === 'kunden/suche') result = api.kundenSuche({ q: url.searchParams.get('q') || '' });
    else if (simple === 'kunden/detail') result = api.kundenDetail({ key: url.searchParams.get('key') || '' });
    else if (simple === 'kunden/rueckrufe' && req.method === 'GET') result = api.kundenRueckrufe();
    else if (simple === 'kunden/rueckrufe' && req.method === 'POST') result = await api.kundenRueckrufSetzen(await readJson(req));
    else if (simple === 'aktualisierung') result = api.aktualisierung();
    else if (simple === 'aktualisierung/status') result = api.aktualisierungStatus();
    else if (simple === 'aktualisierung/start') result = api.aktualisierungStarten();
    else if (taskOp === 'activity') result = await api.activityForTask(number);
    else if (taskOp === 'transition') result = await api.transition(number, await readJson(req), benutzer);
    else if (taskOp === 'assign') result = await api.assign(number, await readJson(req), benutzer);
    else if (taskOp === 'comment') result = await api.comment(number, await readJson(req), benutzer);
    send(res, 200, result);
  } catch (e) {
    if (e instanceof ApiError) { send(res, e.status, { error: e.message, ...e.extra }); return; }
    const msg = String(e?.message || e).split('\n')[0].slice(0, 300);
    console.error(`[api] ${pathname}: ${msg}`);
    send(res, 500, { error: `Interner Fehler: ${msg}` });
  }
}

/** Benutzerverwaltung im UI: nur Liste (Anlegen/Deaktivieren laeuft ueber das Skript). Nie Hashes ausliefern. */
function benutzerListeOeffentlich() {
  if (!benutzerDateiExistiert()) return { benutzer: [], hinweis: 'Keine benutzer.json - Notzugang per Einzelpasswort aktiv.' };
  const liste = leseBenutzer().map(b => ({ name: b.name, kuerzel: b.kuerzel, rolle: b.rolle, aktiv: b.aktiv !== false }));
  return { benutzer: liste, hinweis: `Anlegen/Deaktivieren: npm run benutzer -- anlegen (Datei: ${benutzerDateiPfad()})` };
}

export async function handleStatic(req, res, pathname) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) { send(res, 403, '403', 'text/plain; charset=utf-8'); return; }
  try {
    const data = await readFile(file);
    send(res, 200, data, TYPES[extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, '404 - nicht gefunden', 'text/plain; charset=utf-8');
  }
}

function clientIp(req) {
  return req.socket?.remoteAddress || 'unbekannt';
}

function isAuthed(req) {
  if (!auth.required) return true;
  const cookies = parseCookies(req);
  return auth.validSession(cookies[SESSION_COOKIE]);
}

/** Angemeldeter Benutzer ({name, kuerzel, rolle}) oder null (Standardbetrieb ohne Anmeldung). */
function sessionBenutzer(req) {
  if (!auth.required) return null;
  const cookies = parseCookies(req);
  return auth.sessionBenutzer(cookies[SESSION_COOKIE]);
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') { send(res, 405, { error: 'POST erwartet' }); return; }
  if (!sameOrigin(req)) { send(res, 403, { error: 'Nur lokal erlaubt' }); return; }
  const ip = clientIp(req);
  let body;
  try { body = await readJson(req); } catch (e) {
    if (e instanceof ApiError) { send(res, e.status, { error: e.message }); return; }
    send(res, 400, { error: 'Ungültige Anfrage' });
    return;
  }
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  // Begrenzung je Benutzer UND je IP: ein Sperrschluessel aus beidem, damit weder ein
  // einzelner Name noch eine einzelne IP-Adresse andere Konten mitsperrt.
  const rateKey = `${ip}::${name.toLowerCase() || 'unbekannt'}`;
  if (auth.isLocked(rateKey) || auth.isLocked(ip)) {
    send(res, 429, { error: 'Zu viele Fehlversuche. Kurz warten und erneut versuchen.' });
    return;
  }
  const benutzer = auth.required ? auth.verifyLogin({ name, passwort: body?.passwort }) : null;
  await sleep(auth.failDelayMs);
  if (!benutzer) {
    auth.registerFailure(rateKey);
    auth.registerFailure(ip);
    send(res, 401, { error: 'Name oder Passwort falsch' });
    return;
  }
  auth.registerSuccess(rateKey);
  auth.registerSuccess(ip);
  const sid = auth.createSession(benutzer);
  res.setHeader('Set-Cookie', sessionCookieHeader(sid));
  send(res, 200, { ok: true, benutzer });
}

function handleLogout(req, res) {
  if (req.method !== 'POST') { send(res, 405, { error: 'POST erwartet' }); return; }
  const cookies = parseCookies(req);
  auth.destroySession(cookies[SESSION_COOKIE]);
  res.setHeader('Set-Cookie', clearedCookieHeader());
  send(res, 200, { ok: true });
}

function handleSession(req, res) {
  send(res, 200, { required: auth.required, authenticated: isAuthed(req), benutzer: sessionBenutzer(req) });
}

export function requestHandler(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url || '/', `http://${HOST}`).pathname); } catch { pathname = '/'; }

  if (pathname === '/api/login') return handleLogin(req, res);
  if (pathname === '/api/logout') return handleLogout(req, res);
  if (pathname === '/api/session') return handleSession(req, res);

  if (pathname === '/login') {
    let error = null;
    try { error = new URL(req.url, `http://${HOST}`).searchParams.get('fehler'); } catch { /* ignoriert */ }
    send(res, 200, renderLoginPage({ error }), 'text/html; charset=utf-8');
    return;
  }

  if (!isAuthed(req)) {
    if (pathname.startsWith('/api/')) { send(res, 401, { error: 'Anmeldung erforderlich' }); return; }
    res.writeHead(302, { Location: '/login', 'Cache-Control': 'no-store' });
    res.end();
    return;
  }

  if (pathname.startsWith('/api/')) return handleApi(req, res, pathname, sessionBenutzer(req));
  return handleStatic(req, res, pathname);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assertStartupAllowed();
  } catch (e) {
    console.error(`[dashboard] ${e.message}`);
    process.exit(1);
  }
  createServer(requestHandler).listen(PORT, HOST, () => {
    if (HOST === '127.0.0.1') {
      console.log(`Control Center: http://localhost:${PORT}`);
    } else {
      console.log(`Control Center (Netzmodus): http://${HOST}:${PORT} - erreichbar im Firmennetz.`);
      console.log('Zugriff nur mit Passwort. Jede Route verlangt eine Anmeldung; Sitzung 12 Stunden gültig.');
    }
    console.log('Lokaler Aktionsmodus: Statuswechsel und Kommentare laufen über gh (angemeldetes Konto).');
  });
}
