import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildControlCenterState, safeResolve } from './state-reader.mjs';

const centerRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(centerRoot, '..');
const publicRoot = path.join(centerRoot, 'public');
const host = '127.0.0.1';
const requestedPort = Number.parseInt(process.env.CONTROL_CENTER_PORT ?? '4177', 10);
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536 ? requestedPort : 4177;

const STATIC_FILES = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
});

function headers(contentType) {
  return {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  };
}

export function requestHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, headers('application/json; charset=utf-8'));
    res.end(JSON.stringify({ error: 'READ_ONLY' }));
    return;
  }
  let pathname;
  try { pathname = new URL(req.url, `http://${host}`).pathname; } catch { pathname = ''; }
  if (pathname === '/api/state') {
    try {
      const body = JSON.stringify(buildControlCenterState(repoRoot));
      res.writeHead(200, headers('application/json; charset=utf-8'));
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(500, headers('application/json; charset=utf-8'));
      res.end(JSON.stringify({ error: 'STATE_UNAVAILABLE' }));
    }
    return;
  }
  const target = STATIC_FILES[pathname];
  if (!target) {
    res.writeHead(404, headers('text/plain; charset=utf-8'));
    res.end('Not found');
    return;
  }
  const [relative, contentType] = target;
  const body = fs.readFileSync(safeResolve(publicRoot, relative));
  res.writeHead(200, headers(contentType));
  res.end(req.method === 'HEAD' ? undefined : body);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  http.createServer(requestHandler).listen(port, host, () => {
    console.log(`Automation Control Center: http://${host}:${port}`);
    console.log('READ-ONLY · localhost · keine Shopify- oder Agenten-Aktionen');
  });
}
