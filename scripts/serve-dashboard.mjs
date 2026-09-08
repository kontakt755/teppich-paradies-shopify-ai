#!/usr/bin/env node
/**
 * Lokaler Server des Control Centers.
 *
 *   npm run dashboard          # issues.json erzeugen + Server
 *   npm run dashboard:serve    # nur Server (nutzt vorhandene issues.json)
 *
 * Liefert docs/ai-dashboard statisch (noetig, weil fetch() unter file://
 * blockiert wird) und stellt unter /api die lokale Aktions-API bereit
 * (scripts/dashboard-api.mjs). Bindet ausschliesslich an 127.0.0.1.
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

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const ROOT = resolve(REPO_ROOT, 'docs/ai-dashboard');
const PORT = Number(process.env.PORT || 8001);
const HOST = '127.0.0.1';
const MAX_BODY = 64 * 1024;

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

function sameOrigin(req) {
  const host = req.headers.host || '';
  const origin = req.headers.origin;
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return false;
  if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return false;
  return true;
}

export async function handleApi(req, res, pathname) {
  const m = pathname.match(/^\/api\/(?:(capabilities|sync|activity|agent-runs)|tasks\/(\d+)\/(activity|transition|assign|comment))$/);
  if (!m) { send(res, 404, { error: 'Unbekannter API-Pfad' }); return; }
  const [, simple, number, taskOp] = m;
  const write = simple === 'sync' || ['transition', 'assign', 'comment'].includes(taskOp);
  try {
    if (write) {
      if (req.method !== 'POST') { send(res, 405, { error: 'POST erwartet' }); return; }
      if (!sameOrigin(req)) { send(res, 403, { error: 'Nur lokal erlaubt' }); return; }
    } else if (req.method !== 'GET') { send(res, 405, { error: 'GET erwartet' }); return; }
    let result;
    if (simple === 'capabilities') result = await api.capabilities();
    else if (simple === 'sync') result = await api.sync();
    else if (simple === 'activity') result = await api.activity();
    else if (simple === 'agent-runs') result = api.agentRuns();
    else if (taskOp === 'activity') result = await api.activityForTask(number);
    else if (taskOp === 'transition') result = await api.transition(number, await readJson(req));
    else if (taskOp === 'assign') result = await api.assign(number, await readJson(req));
    else if (taskOp === 'comment') result = await api.comment(number, await readJson(req));
    send(res, 200, result);
  } catch (e) {
    if (e instanceof ApiError) { send(res, e.status, { error: e.message, ...e.extra }); return; }
    const msg = String(e?.message || e).split('\n')[0].slice(0, 300);
    console.error(`[api] ${pathname}: ${msg}`);
    send(res, 500, { error: `Interner Fehler: ${msg}` });
  }
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

export function requestHandler(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url || '/', `http://${HOST}`).pathname); } catch { pathname = '/'; }
  if (pathname.startsWith('/api/')) return handleApi(req, res, pathname);
  return handleStatic(req, res, pathname);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer(requestHandler).listen(PORT, HOST, () => {
    console.log(`Control Center: http://localhost:${PORT}`);
    console.log('Lokaler Aktionsmodus: Statuswechsel und Kommentare laufen über gh (angemeldetes Konto).');
  });
}
