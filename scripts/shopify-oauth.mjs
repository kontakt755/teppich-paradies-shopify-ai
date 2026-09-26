#!/usr/bin/env node

/**
 * Admin-API-Token (shpat_) fuer die eigene Store-App beschaffen.
 *
 * Hintergrund: #34 blieb liegen, weil das Repository-Secret SHOPIFY_ADMIN_TOKEN
 * ein atkn_-Token war. Die Admin GraphQL API nimmt nur shpat_. Dieses Werkzeug
 * holt so einen Token ueber OAuth und weist nach, dass er wirklich traegt.
 *
 * Zwei Varianten, beide liefern shpat_:
 *
 *   client-credentials   Ein einziger POST mit Client-ID und Secret. Kein
 *                        Browser, keine Zustimmung, keine Redirect-URL. Nur
 *                        fuer Apps, die auf Stores der eigenen Organisation
 *                        arbeiten. Der Token laeuft nach 24 Stunden ab, muss
 *                        also vor jedem Lauf neu geholt werden.
 *
 *   authorization-code   Der Install-Flow: Browser -> Zustimmung -> Rueckleitung
 *                        auf 127.0.0.1 -> Code gegen Token tauschen. Liefert
 *                        einen Offline-Token, der bei Custom Apps nicht
 *                        ablaeuft. Setzt voraus, dass die Redirect-URL in den
 *                        App-Einstellungen eingetragen ist.
 *
 * Eine Custom App, die direkt im Shopify-Admin unter "Apps entwickeln" angelegt
 * wurde, braucht keinen der beiden Wege: dort steht der Token in der Oberflaeche.
 *
 *   node scripts/shopify-oauth.mjs --grant client-credentials
 *   node scripts/shopify-oauth.mjs --grant authorization-code --write-env
 *
 * Der Token wird nie vollstaendig ausgegeben. --write-env legt ihn in
 * .env.local ab (chmod 600). Das Repository-Secret setzt der Inhaber selbst.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_API_VERSION } from '../workflow/graphql-proxy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

export const DEFAULT_SHOP = 'sjjyq1-6w.myshopify.com';
export const DEFAULT_SCOPES = 'read_products,write_products';
export const DEFAULT_PORT = 3456;
export const TOKEN_ENV_KEY = 'SHOPIFY_ADMIN_TOKEN';

/** Werte aus .env.example bzw. dem Platzhalter-Block; damit laeuft kein Aufruf. */
const PLACEHOLDERS = new Set(['', 'HIER_CLIENT_ID', 'HIER_SECRET', 'HIER_TOKEN']);

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/** Liest `KEY=wert` und `export KEY='wert'`, ohne die Datei je auszufuehren. */
const ENV_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(?:'([^']*)'|"([^"]*)"|([^\s#]*))\s*$/;

export function parseEnvFile(content) {
  const values = {};
  for (const line of String(content).split('\n')) {
    const match = line.match(ENV_LINE);
    if (!match) continue;
    values[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return values;
}

/** Ersetzt einen vorhandenen Eintrag an Ort und Stelle, sonst wird angehaengt. */
export function upsertEnvValue(content, key, value, comment = null) {
  if (value.includes("'") || value.includes('\n')) {
    throw new Error(`Wert fuer ${key} enthaelt Zeichen, die .env.local zerlegen wuerden.`);
  }
  const line = `export ${key}='${value}'`;
  const existing = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}=.*$`, 'm');
  if (existing.test(content)) return content.replace(existing, line);
  const separator = content === '' || content.endsWith('\n') ? '' : '\n';
  const block = comment ? `\n${comment}\n${line}\n` : `\n${line}\n`;
  return `${content}${separator}${block}`;
}

export function assertShopDomain(shop) {
  const value = String(shop || '').trim().toLowerCase();
  if (!SHOP_DOMAIN.test(value)) {
    throw new Error(`Kein gueltiger Shop-Host: ${shop || '(leer)'} (erwartet <name>.myshopify.com)`);
  }
  return value;
}

export function assertUsableCredential(name, value) {
  const trimmed = String(value || '').trim();
  if (PLACEHOLDERS.has(trimmed)) {
    throw new Error(`${name} steht noch auf einem Platzhalter. Echten Wert in .env.local eintragen.`);
  }
  return trimmed;
}

/** Zeigt genug zum Wiedererkennen und zu wenig zum Benutzen. */
export function maskToken(token) {
  const value = String(token || '');
  if (!value) return '(leer)';
  const prefix = value.includes('_') ? `${value.slice(0, value.indexOf('_') + 1)}` : '';
  return `${prefix}…${value.slice(-4)} (${value.length} Zeichen)`;
}

export function buildAuthorizeUrl({ shop, clientId, scopes, redirectUri, state }) {
  const url = new URL(`https://${assertShopDomain(shop)}/admin/oauth/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
}

/**
 * Shopify signiert die Rueckleitung ueber die alphabetisch sortierten Parameter
 * ohne `hmac`. Ob dabei die rohen oder die dekodierten Werte gemeint sind, ist
 * in der Praxis uneinheitlich (`host` ist Base64 und enthaelt `=`), deshalb
 * werden beide Lesarten gebildet. Beide setzen Kenntnis des Secrets voraus.
 */
export function callbackHmacMessages(rawQuery) {
  const pairs = String(rawQuery || '')
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .filter((pair) => !/^(hmac|signature)=/.test(pair));
  const raw = [...pairs].sort().join('&');
  const decoded = pairs
    .map((pair) => {
      const index = pair.indexOf('=');
      const key = decodeURIComponent(index < 0 ? pair : pair.slice(0, index));
      const value = index < 0 ? '' : decodeURIComponent(pair.slice(index + 1));
      return [key, value];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return raw === decoded ? [raw] : [raw, decoded];
}

export function verifyCallbackHmac(rawQuery, clientSecret, providedHmac) {
  const provided = String(providedHmac || '');
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false;
  const expected = Buffer.from(provided, 'hex');
  return callbackHmacMessages(rawQuery).some((message) => {
    const digest = crypto.createHmac('sha256', clientSecret).update(message, 'utf8').digest();
    return crypto.timingSafeEqual(digest, expected);
  });
}

/** Vergleicht das state-Nonce ohne Laufzeitunterschied. */
export function statesMatch(expected, received) {
  const a = Buffer.from(String(expected || ''), 'utf8');
  const b = Buffer.from(String(received || ''), 'utf8');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function postToken(shop, body, fetchImpl) {
  const response = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Token-Endpunkt antwortete ${response.status}: ${text.slice(0, 300)}`);
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Token-Endpunkt lieferte kein JSON: ${text.slice(0, 200)}`);
  }
  if (!payload.access_token) {
    throw new Error(`Antwort enthaelt keinen access_token: ${Object.keys(payload).join(', ') || '(leer)'}`);
  }
  return payload;
}

export async function requestClientCredentialsToken(
  { shop, clientId, clientSecret },
  fetchImpl = globalThis.fetch,
) {
  return postToken(
    assertShopDomain(shop),
    { client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' },
    fetchImpl,
  );
}

export async function exchangeAuthorizationCode(
  { shop, clientId, clientSecret, code },
  fetchImpl = globalThis.fetch,
) {
  return postToken(
    assertShopDomain(shop),
    { client_id: clientId, client_secret: clientSecret, code },
    fetchImpl,
  );
}

/** Beleg statt Annahme: erst ein echter Admin-API-Aufruf beweist den Token. */
export async function verifyToken(
  { shop, token, apiVersion = DEFAULT_API_VERSION },
  fetchImpl = globalThis.fetch,
) {
  const host = assertShopDomain(shop);
  const response = await fetchImpl(`https://${host}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query: '{ shop { name myshopifyDomain } }' }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Admin API antwortete ${response.status}: ${text.slice(0, 300)}`);
  }
  const payload = JSON.parse(text);
  if (payload.errors?.length || !payload.data?.shop) {
    throw new Error(`Admin API meldet Fehler: ${JSON.stringify(payload.errors ?? payload).slice(0, 300)}`);
  }
  return payload.data.shop;
}

/**
 * Nimmt genau eine Rueckleitung entgegen und prueft sie, bevor der Code
 * weitergereicht wird: state, Shop-Host und HMAC. Der Server haengt an
 * 127.0.0.1, ist also von aussen nicht erreichbar.
 */
export function startCallbackServer({
  port = DEFAULT_PORT,
  callbackPath = '/callback',
  expectedState,
  expectedShop,
  clientSecret,
  timeoutMs = 300_000,
  onListening = null,
}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Ohne das wartet close() auf den Keep-Alive-Timeout der offenen Antwort.
      server.closeIdleConnections?.();
      server.close(() => (error ? reject(error) : resolve(value)));
    };

    const timer = setTimeout(
      () => finish(new Error(`Keine Rueckleitung innerhalb von ${Math.round(timeoutMs / 1000)} s.`)),
      timeoutMs,
    );

    const server = http.createServer((request, response) => {
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      if (url.pathname !== callbackPath) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
        response.end('Nicht gefunden');
        return;
      }
      // Erst die Antwort vollstaendig rausschreiben, dann den Server schliessen -
      // sonst sieht der Browser einen Verbindungsabbruch statt der Begruendung.
      const reject_ = (message) => {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
        response.end(`Rueckleitung abgelehnt: ${message}`, () =>
          finish(new Error(`Rueckleitung abgelehnt: ${message}`)));
      };

      if (!statesMatch(expectedState, url.searchParams.get('state'))) {
        return reject_('state stimmt nicht mit dem erzeugten Nonce ueberein');
      }
      let shop;
      try {
        shop = assertShopDomain(url.searchParams.get('shop'));
      } catch {
        // Den rohen Wert nicht in die Antwort spiegeln; er kommt von aussen.
        return reject_('shop-Parameter ist kein gueltiger myshopify-Host');
      }
      if (shop !== expectedShop) return reject_(`fremder Shop ${shop}`);
      if (!verifyCallbackHmac(url.search, clientSecret, url.searchParams.get('hmac'))) {
        return reject_('HMAC ungueltig');
      }
      const code = url.searchParams.get('code');
      if (!code) return reject_('kein code enthalten');

      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' });
      response.end(
        '<!doctype html><meta charset="utf-8"><title>Fertig</title><p>Zustimmung erhalten. Fenster kann geschlossen werden.</p>',
        () => finish(null, { code, shop }),
      );
    });

    server.on('error', (error) => finish(error));
    // Port 0 vergibt das Betriebssystem; der Test braucht die echte Nummer.
    server.listen(port, '127.0.0.1', () => onListening?.(server.address().port));
  });
}

function parseArgs(argv) {
  const options = {
    grant: 'client-credentials',
    shop: process.env.SHOPIFY_SHOP || DEFAULT_SHOP,
    scopes: DEFAULT_SCOPES,
    port: DEFAULT_PORT,
    writeEnv: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${arg} braucht einen Wert.`);
      index += 1;
      return value;
    };
    if (arg === '--grant') options.grant = next();
    else if (arg === '--shop') options.shop = next();
    else if (arg === '--scopes') options.scopes = next();
    else if (arg === '--port') options.port = Number.parseInt(next(), 10);
    else if (arg === '--redirect-uri') options.redirectUri = next();
    else if (arg === '--write-env') options.writeEnv = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unbekanntes Flag: ${arg}`);
  }
  if (!['client-credentials', 'authorization-code'].includes(options.grant)) {
    throw new Error(`--grant kennt nur client-credentials und authorization-code, nicht ${options.grant}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error(`--port muss zwischen 1024 und 65535 liegen, nicht ${options.port}`);
  }
  return options;
}

const USAGE = `Admin-API-Token (shpat_) ueber OAuth holen.

  node scripts/shopify-oauth.mjs --grant client-credentials [--write-env]
  node scripts/shopify-oauth.mjs --grant authorization-code [--write-env]

  --grant          client-credentials (Standard, ohne Browser, Token 24 h gueltig)
                   authorization-code (Browser-Zustimmung, Offline-Token)
  --shop           Standard ${DEFAULT_SHOP}
  --scopes         Standard ${DEFAULT_SCOPES} (nur bei authorization-code)
  --port           Standard ${DEFAULT_PORT} (nur bei authorization-code)
  --redirect-uri   Standard http://127.0.0.1:<port>/callback
  --write-env      ${TOKEN_ENV_KEY} in .env.local schreiben (chmod 600)

Voraussetzung: SHOPIFY_CLIENT_ID und SHOPIFY_CLIENT_SECRET stehen in .env.local.
Bei authorization-code muss die Redirect-URL in den App-Einstellungen stehen.`;

function loadCredentials() {
  const envPath = path.join(ROOT_DIR, '.env.local');
  const fromFile = fs.existsSync(envPath) ? parseEnvFile(fs.readFileSync(envPath, 'utf8')) : {};
  return {
    envPath,
    clientId: assertUsableCredential(
      'SHOPIFY_CLIENT_ID',
      process.env.SHOPIFY_CLIENT_ID || fromFile.SHOPIFY_CLIENT_ID,
    ),
    clientSecret: assertUsableCredential(
      'SHOPIFY_CLIENT_SECRET',
      process.env.SHOPIFY_CLIENT_SECRET || fromFile.SHOPIFY_CLIENT_SECRET,
    ),
  };
}

function writeToken(envPath, token) {
  const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const updated = upsertEnvValue(
    content,
    TOKEN_ENV_KEY,
    token,
    '## Shopify Admin API (nur lokal; niemals committen)',
  );
  fs.writeFileSync(envPath, updated, { mode: 0o600 });
  fs.chmodSync(envPath, 0o600);
}

async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`❌ ${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }

  const shop = assertShopDomain(options.shop);
  const { envPath, clientId, clientSecret } = loadCredentials();
  let payload;

  if (options.grant === 'client-credentials') {
    console.log(`🔑 client_credentials gegen ${shop} …`);
    payload = await requestClientCredentialsToken({ shop, clientId, clientSecret });
  } else {
    const redirectUri = options.redirectUri || `http://127.0.0.1:${options.port}/callback`;
    const state = crypto.randomBytes(32).toString('hex');
    const authorizeUrl = buildAuthorizeUrl({
      shop,
      clientId,
      scopes: options.scopes,
      redirectUri,
      state,
    });
    const callbackPath = new URL(redirectUri).pathname;
    const waiting = startCallbackServer({
      port: options.port,
      callbackPath,
      expectedState: state,
      expectedShop: shop,
      clientSecret,
    });
    console.log(`\n🔗 Diese Adresse im Browser oeffnen und die App installieren:\n\n${authorizeUrl}\n`);
    console.log(`⏳ Warte auf die Rueckleitung an ${redirectUri} (5 Minuten) …`);
    const { code } = await waiting;
    console.log('✅ Rueckleitung geprueft: state, Shop und HMAC stimmen.');
    payload = await exchangeAuthorizationCode({ shop, clientId, clientSecret, code });
  }

  const token = payload.access_token;
  console.log(`\n🎟️  Token: ${maskToken(token)}`);
  console.log(`   Scopes: ${payload.scope || '(keine gemeldet)'}`);
  if (payload.expires_in) {
    const until = new Date(Date.now() + payload.expires_in * 1000).toISOString();
    console.log(`   Laeuft ab: ${until} (${payload.expires_in} s)`);
  } else {
    console.log('   Laeuft ab: nicht (Offline-Token einer Custom App)');
  }
  if (!token.startsWith('shpat_')) {
    console.warn(`⚠️  Praefix ist nicht shpat_. Die Admin GraphQL API lehnt andere Typen ab (#34).`);
  }

  const shopData = await verifyToken({ shop, token });
  console.log(`✅ Admin API antwortet: ${shopData.name} (${shopData.myshopifyDomain})`);

  if (options.writeEnv) {
    writeToken(envPath, token);
    console.log(`💾 ${TOKEN_ENV_KEY} in .env.local geschrieben (chmod 600, gitignored).`);
  } else {
    console.log(`\nℹ️  Mit --write-env landet der Token in .env.local.`);
  }
  console.log(
    `\nNaechster Schritt fuer GitHub Actions: Token als Repository-Secret ${TOKEN_ENV_KEY} hinterlegen\n` +
      '(Settings > Secrets and variables > Actions), danach den Workflow "Grosshandel-Sync" manuell starten.',
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  });
}
