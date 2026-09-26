import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  assertShopDomain,
  assertUsableCredential,
  buildAuthorizeUrl,
  callbackHmacMessages,
  exchangeAuthorizationCode,
  maskToken,
  parseEnvFile,
  requestClientCredentialsToken,
  startCallbackServer,
  statesMatch,
  upsertEnvValue,
  verifyCallbackHmac,
  verifyToken,
} from '../../scripts/shopify-oauth.mjs';

const SECRET = 'test-client-secret';

/** Baut eine Rueckleitung so, wie Shopify sie signiert. */
function signedQuery(params, secret = SECRET) {
  const message = Object.entries(params)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const search = new URLSearchParams(params);
  search.set('hmac', crypto.createHmac('sha256', secret).update(message).digest('hex'));
  return `?${search.toString()}`;
}

const callbackParams = (overrides = {}) => ({
  code: 'abc123',
  shop: 'sjjyq1-6w.myshopify.com',
  state: 'nonce-value',
  timestamp: '1758000000',
  ...overrides,
});

test('parseEnvFile liest beide Schreibweisen und fuehrt nichts aus', () => {
  const values = parseEnvFile(
    "export SHOPIFY_CLIENT_ID='abc'\nSHOPIFY_CLIENT_SECRET=\"geheim\"\n# SHOPIFY_SHOP=kommentar\n$(rm -rf /)\nLEER=\n",
  );
  assert.equal(values.SHOPIFY_CLIENT_ID, 'abc');
  assert.equal(values.SHOPIFY_CLIENT_SECRET, 'geheim');
  assert.equal(values.SHOPIFY_SHOP, undefined);
  assert.equal(values.LEER, '');
});

test('upsertEnvValue ersetzt vorhandene Zeilen und haengt sonst an', () => {
  const vorhanden = "export A='1'\nexport SHOPIFY_ADMIN_TOKEN='alt'\nexport B='2'\n";
  const ersetzt = upsertEnvValue(vorhanden, 'SHOPIFY_ADMIN_TOKEN', 'shpat_neu');
  assert.equal(ersetzt, "export A='1'\nexport SHOPIFY_ADMIN_TOKEN='shpat_neu'\nexport B='2'\n");
  assert.equal((ersetzt.match(/SHOPIFY_ADMIN_TOKEN/g) || []).length, 1);

  const angehaengt = upsertEnvValue("export A='1'\n", 'SHOPIFY_ADMIN_TOKEN', 'shpat_neu', '## Kommentar');
  assert.equal(angehaengt, "export A='1'\n\n## Kommentar\nexport SHOPIFY_ADMIN_TOKEN='shpat_neu'\n");

  assert.throws(() => upsertEnvValue('', 'X', "wert'mit'quote"), /zerlegen/);
});

test('assertShopDomain laesst nur myshopify-Hosts durch', () => {
  assert.equal(assertShopDomain('SJJYQ1-6W.myshopify.com'), 'sjjyq1-6w.myshopify.com');
  for (const boese of ['', 'teppich-paradies.net', 'evil.com/sjjyq1-6w.myshopify.com', 'a.myshopify.com.evil.com']) {
    assert.throws(() => assertShopDomain(boese), /Shop-Host/);
  }
});

test('assertUsableCredential weist die Platzhalter aus .env.local ab', () => {
  assert.throws(() => assertUsableCredential('SHOPIFY_CLIENT_ID', 'HIER_CLIENT_ID'), /Platzhalter/);
  assert.throws(() => assertUsableCredential('SHOPIFY_CLIENT_SECRET', 'HIER_SECRET'), /Platzhalter/);
  assert.throws(() => assertUsableCredential('SHOPIFY_CLIENT_ID', '  '), /Platzhalter/);
  assert.equal(assertUsableCredential('SHOPIFY_CLIENT_ID', ' echt '), 'echt');
});

test('maskToken zeigt nur Praefix und Endstueck', () => {
  const ausgabe = maskToken('shpat_0123456789abcdef');
  assert.match(ausgabe, /^shpat_…cdef \(22 Zeichen\)$/);
  assert.ok(!ausgabe.includes('0123456789'));
});

test('buildAuthorizeUrl setzt alle Pflichtparameter auf den Shop-Host', () => {
  const url = new URL(
    buildAuthorizeUrl({
      shop: 'sjjyq1-6w.myshopify.com',
      clientId: 'client-id',
      scopes: 'read_products,write_products',
      redirectUri: 'http://127.0.0.1:3456/callback',
      state: 'nonce',
    }),
  );
  assert.equal(url.origin, 'https://sjjyq1-6w.myshopify.com');
  assert.equal(url.pathname, '/admin/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'client-id');
  assert.equal(url.searchParams.get('scope'), 'read_products,write_products');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:3456/callback');
  assert.equal(url.searchParams.get('state'), 'nonce');
});

test('verifyCallbackHmac nimmt die echte Signatur an und lehnt Manipulation ab', () => {
  const query = signedQuery(callbackParams());
  assert.equal(verifyCallbackHmac(query, SECRET, new URLSearchParams(query).get('hmac')), true);
  assert.equal(verifyCallbackHmac(query, 'falsches-secret', new URLSearchParams(query).get('hmac')), false);

  const manipuliert = query.replace('code=abc123', 'code=angreifer');
  assert.equal(
    verifyCallbackHmac(manipuliert, SECRET, new URLSearchParams(manipuliert).get('hmac')),
    false,
  );
});

test('verifyCallbackHmac verlangt einen vollstaendigen Hex-Digest', () => {
  const query = signedQuery(callbackParams());
  const echt = new URLSearchParams(query).get('hmac');
  for (const kaputt of ['', 'nicht-hex', echt.slice(0, 63), `${echt}00`]) {
    assert.equal(verifyCallbackHmac(query, SECRET, kaputt), false);
  }
});

test('callbackHmacMessages bietet beide Lesarten, wenn Werte kodiert sind', () => {
  const einfach = callbackHmacMessages('?code=abc&shop=x.myshopify.com');
  assert.equal(einfach.length, 1);
  const kodiert = callbackHmacMessages('?host=YWJj%3D%3D&code=abc');
  assert.equal(kodiert.length, 2);
  assert.ok(kodiert.some((m) => m.includes('host=YWJj%3D%3D')));
  assert.ok(kodiert.some((m) => m.includes('host=YWJj==')));
});

test('statesMatch vergleicht nur bei gleicher Laenge und nie leer', () => {
  assert.equal(statesMatch('nonce', 'nonce'), true);
  assert.equal(statesMatch('nonce', 'nonc3'), false);
  assert.equal(statesMatch('nonce', 'nonce-lang'), false);
  assert.equal(statesMatch('', ''), false);
  assert.equal(statesMatch('nonce', null), false);
});

test('requestClientCredentialsToken sendet grant_type an den Token-Endpunkt', async () => {
  const aufrufe = [];
  const fetchImpl = async (url, init) => {
    aufrufe.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'shpat_x', scope: 'read_products', expires_in: 86399 }) };
  };
  const payload = await requestClientCredentialsToken(
    { shop: 'sjjyq1-6w.myshopify.com', clientId: 'id', clientSecret: 'secret' },
    fetchImpl,
  );
  assert.equal(payload.access_token, 'shpat_x');
  assert.equal(aufrufe[0].url, 'https://sjjyq1-6w.myshopify.com/admin/oauth/access_token');
  assert.deepEqual(aufrufe[0].body, { client_id: 'id', client_secret: 'secret', grant_type: 'client_credentials' });
});

test('exchangeAuthorizationCode schickt den Code und meldet HTTP-Fehler klar', async () => {
  const fetchOk = async (url, init) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ access_token: 'shpat_y', scope: 'read_products', _gesendet: JSON.parse(init.body) }),
  });
  const payload = await exchangeAuthorizationCode(
    { shop: 'sjjyq1-6w.myshopify.com', clientId: 'id', clientSecret: 'secret', code: 'abc' },
    fetchOk,
  );
  assert.deepEqual(payload._gesendet, { client_id: 'id', client_secret: 'secret', code: 'abc' });

  const fetchFehler = async () => ({ ok: false, status: 401, text: async () => 'Invalid client' });
  await assert.rejects(
    () => exchangeAuthorizationCode({ shop: 'sjjyq1-6w.myshopify.com', clientId: 'id', clientSecret: 'x', code: 'abc' }, fetchFehler),
    /401.*Invalid client/s,
  );

  const fetchOhneToken = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ errors: 'nope' }) });
  await assert.rejects(
    () => exchangeAuthorizationCode({ shop: 'sjjyq1-6w.myshopify.com', clientId: 'id', clientSecret: 'x', code: 'abc' }, fetchOhneToken),
    /keinen access_token/,
  );
});

test('verifyToken belegt den Token mit einem echten Admin-API-Aufruf', async () => {
  let gesehen;
  const fetchOk = async (url, init) => {
    gesehen = { url, headers: init.headers };
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: { shop: { name: 'TeppichParadies', myshopifyDomain: 'sjjyq1-6w.myshopify.com' } } }) };
  };
  const shop = await verifyToken({ shop: 'sjjyq1-6w.myshopify.com', token: 'shpat_x', apiVersion: '2026-07' }, fetchOk);
  assert.equal(shop.name, 'TeppichParadies');
  assert.equal(gesehen.url, 'https://sjjyq1-6w.myshopify.com/admin/api/2026-07/graphql.json');
  assert.equal(gesehen.headers['X-Shopify-Access-Token'], 'shpat_x');

  const fetchErrors = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ errors: [{ message: 'Invalid API key or access token' }] }) });
  await assert.rejects(
    () => verifyToken({ shop: 'sjjyq1-6w.myshopify.com', token: 'atkn_x' }, fetchErrors),
    /Invalid API key/,
  );
});

/** Holt die Rueckleitung ab, wie der Browser es taete. */
async function rueckleitung(port, query) {
  const response = await fetch(`http://127.0.0.1:${port}/callback${query}`);
  return { status: response.status, body: await response.text() };
}

test('startCallbackServer nimmt eine korrekt signierte Rueckleitung an', async () => {
  let port;
  const warten = startCallbackServer({
    port: 0,
    expectedState: 'nonce-value',
    expectedShop: 'sjjyq1-6w.myshopify.com',
    clientSecret: SECRET,
    timeoutMs: 5000,
    onListening: (vergeben) => {
      port = vergeben;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  const antwort = await rueckleitung(port, signedQuery(callbackParams()));
  assert.equal(antwort.status, 200);
  assert.deepEqual(await warten, { code: 'abc123', shop: 'sjjyq1-6w.myshopify.com' });
});

test('startCallbackServer lehnt fremdes state ab', async () => {
  let port;
  const warten = startCallbackServer({
    port: 0,
    expectedState: 'echtes-nonce',
    expectedShop: 'sjjyq1-6w.myshopify.com',
    clientSecret: SECRET,
    timeoutMs: 5000,
    onListening: (vergeben) => {
      port = vergeben;
    },
  });
  const fehler = warten.then(() => null, (error) => error);
  await new Promise((resolve) => setImmediate(resolve));
  const antwort = await rueckleitung(port, signedQuery(callbackParams({ state: 'fremdes-nonce' })));
  assert.equal(antwort.status, 400);
  assert.match((await fehler).message, /state stimmt nicht/);
});

test('startCallbackServer lehnt einen fremden Shop trotz gueltiger Signatur ab', async () => {
  let port;
  const warten = startCallbackServer({
    port: 0,
    expectedState: 'nonce-value',
    expectedShop: 'sjjyq1-6w.myshopify.com',
    clientSecret: SECRET,
    timeoutMs: 5000,
    onListening: (vergeben) => {
      port = vergeben;
    },
  });
  const fehler = warten.then(() => null, (error) => error);
  await new Promise((resolve) => setImmediate(resolve));
  const antwort = await rueckleitung(port, signedQuery(callbackParams({ shop: 'fremd.myshopify.com' })));
  assert.equal(antwort.status, 400);
  assert.match((await fehler).message, /fremder Shop/);
});

test('startCallbackServer lehnt eine unsignierte Rueckleitung ab', async () => {
  let port;
  const warten = startCallbackServer({
    port: 0,
    expectedState: 'nonce-value',
    expectedShop: 'sjjyq1-6w.myshopify.com',
    clientSecret: SECRET,
    timeoutMs: 5000,
    onListening: (vergeben) => {
      port = vergeben;
    },
  });
  const fehler = warten.then(() => null, (error) => error);
  await new Promise((resolve) => setImmediate(resolve));
  const antwort = await rueckleitung(port, '?code=abc123&shop=sjjyq1-6w.myshopify.com&state=nonce-value&hmac=00');
  assert.equal(antwort.status, 400);
  assert.match((await fehler).message, /HMAC ungueltig/);
});
