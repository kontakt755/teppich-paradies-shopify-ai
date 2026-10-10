import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { erzeugeProxy, tauscheClientCredentials, ladeEnvLocal, hatZugangsdaten, fehlendeBereiche, wasTun, mitHinweis, pruefeQuellen, LESE_BEREICHE_ZEILE, KEIN_ZUGANG } from '../sync/zugang.mjs';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

test('ohne Zugangsdaten bleibt es beim Sammelmodus', async () => {
  const { proxy, art } = await erzeugeProxy({ env: {}, fetch: () => { throw new Error('kein Aufruf'); } });
  assert.equal(art, 'sammeln');
  assert.equal(proxy.live, false);
});

test('Admin-Token hat Vorrang und wird nicht getauscht', async () => {
  const { art, proxy } = await erzeugeProxy({ env: { SHOPIFY_ADMIN_TOKEN: 'shpat_x', SHOPIFY_CLIENT_ID: 'id' }, fetch: () => { throw new Error('kein Tausch'); } });
  assert.equal(art, 'admin-token');
  assert.equal(proxy.token, 'shpat_x');
});

test('Client-Credentials: Tausch per Formular-POST, Token landet im Header', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/admin/oauth/access_token')) return json({ access_token: 'tok_1', scope: 'read_orders,write_orders', expires_in: 86399 });
    return json({ data: { shop: { name: 'X' } } });
  };
  const { art, scope, proxy } = await erzeugeProxy({ env: { SHOPIFY_CLIENT_ID: 'cid', SHOPIFY_CLIENT_SECRET: 'geheim' }, fetch });
  assert.equal(art, 'client-credentials');
  assert.equal(scope, 'read_orders,write_orders');
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get('grant_type'), 'client_credentials');
  assert.equal(body.get('client_id'), 'cid');
  await proxy.execute('query { shop { name } }');
  assert.equal(calls[1].init.headers['X-Shopify-Access-Token'], 'tok_1');
  assert.ok(!JSON.stringify(proxy.requestLog).includes('geheim'));
});

test('abgelaufener Token wird vor dem naechsten Aufruf erneuert', async () => {
  let t = 0; let n = 0;
  const fetch = async (url) => url.endsWith('/access_token') ? json({ access_token: `tok_${++n}`, expires_in: 600 }) : json({ data: {} });
  const { proxy } = await erzeugeProxy({ env: { SHOPIFY_CLIENT_ID: 'a', SHOPIFY_CLIENT_SECRET: 'b' }, fetch, jetzt: () => t });
  assert.equal(proxy.token, 'tok_1');
  t = 10 * 60 * 1000;
  await proxy.execute('query { shop { name } }');
  assert.equal(proxy.token, 'tok_2');
});

test('fehlgeschlagener Tausch wirft klaren Fehler', async () => {
  await assert.rejects(() => tauscheClientCredentials({ clientId: 'a', clientSecret: 'b', fetch: async () => json({ error: 'invalid_client' }, 401) }), /HTTP 401/);
});

test('.env.local wird gelesen, Kommentare ignoriert', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tp-')), '.env.local');
  fs.writeFileSync(f, '# x\nSHOPIFY_CLIENT_ID=abc\nSHOPIFY_CLIENT_SECRET="def"\n');
  assert.deepEqual(ladeEnvLocal(f), { SHOPIFY_CLIENT_ID: 'abc', SHOPIFY_CLIENT_SECRET: 'def' });
});

test('.env.local: export-Schreibweise wird verstanden, Platzhalter zaehlen nicht', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tp-')), '.env.local');
  fs.writeFileSync(f, "export SHOPIFY_CLIENT_ID='abc'\n  export SHOPIFY_CLIENT_SECRET=\"def\"\nSHOPIFY_ADMIN_TOKEN=<your-shopify-admin-token-here>\n# export ALT='x'\n");
  const werte = ladeEnvLocal(f);
  assert.deepEqual(werte, { SHOPIFY_CLIENT_ID: 'abc', SHOPIFY_CLIENT_SECRET: 'def' });
  assert.equal(hatZugangsdaten(werte), true);
  fs.writeFileSync(f, "export SHOPIFY_CLIENT_ID='HIER_CLIENT_ID'\nexport SHOPIFY_CLIENT_SECRET='HIER_SECRET'\n");
  assert.equal(hatZugangsdaten(ladeEnvLocal(f)), false);
});

test('abgelaufener fester Token: bei HTTP 401 Wechsel auf Client-Credentials und ein neuer Versuch', async () => {
  const tokens = [];
  const fetch = async (url, init) => {
    if (url.endsWith('/admin/oauth/access_token')) return json({ access_token: 'tok_neu', scope: 'read_orders', expires_in: 86399 });
    tokens.push(init.headers['X-Shopify-Access-Token']);
    if (init.headers['X-Shopify-Access-Token'] === 'shpat_alt') return json({ errors: 'Invalid API key or access token' }, 401);
    return json({ data: { shop: { name: 'X' } } });
  };
  const { proxy, art } = await erzeugeProxy({ env: { SHOPIFY_ADMIN_TOKEN: 'shpat_alt', SHOPIFY_CLIENT_ID: 'cid', SHOPIFY_CLIENT_SECRET: 'geheim' }, fetch });
  assert.equal(art, 'admin-token');
  const data = await proxy.execute('query { shop { name } }');
  assert.equal(data.shop.name, 'X');
  assert.deepEqual(tokens, ['shpat_alt', 'tok_neu']);
  await proxy.execute('query { shop { name } }');
  assert.deepEqual(tokens, ['shpat_alt', 'tok_neu', 'tok_neu'], 'der neue Token bleibt, kein weiterer Tausch');
});

test('fester Token ohne Client-Credentials: 401 bleibt ein Fehler', async () => {
  const { proxy } = await erzeugeProxy({ env: { SHOPIFY_ADMIN_TOKEN: 'shpat_alt' }, fetch: async () => json({ errors: 'x' }, 401) });
  await assert.rejects(() => proxy.execute('query { shop { name } }'), /HTTP 401/);
});

test('fehlendeBereiche: write_x zaehlt als read_x, die Zeile nennt alle Lese-Bereiche', () => {
  assert.deepEqual(fehlendeBereiche(LESE_BEREICHE_ZEILE), []);
  assert.deepEqual(
    fehlendeBereiche('write_orders,read_all_orders,read_customers,write_products,read_metaobjects'),
    ['read_draft_orders', 'read_inventory', 'read_locations'],
  );
  assert.equal(fehlendeBereiche('').length, LESE_BEREICHE_ZEILE.split(',').length);
});

test('wasTun: bekannte Fehler bekommen eine Handlung, unbekannte bleiben unveraendert', () => {
  assert.match(wasTun('Shopify GraphQL: Access denied for draftOrders field. Required access: `read_draft_orders` access scope.'), /read_draft_orders/);
  assert.match(wasTun('Token-Tausch fehlgeschlagen: HTTP 400 {"error":"shop_not_permitted"}'), /nicht installiert/);
  assert.match(wasTun('Token-Tausch fehlgeschlagen: HTTP 401 {"error":"invalid_client"}'), /Client-ID oder Schluessel/);
  assert.match(wasTun('Shopify Admin API HTTP 503: '), /Nichts zu tun/);
  assert.equal(wasTun('Antwort ohne customers'), null);
  assert.equal(mitHinweis('Antwort ohne customers'), 'Antwort ohne customers');
  assert.equal(wasTun(KEIN_ZUGANG), null);
  assert.match(KEIN_ZUGANG, /^Kein Zugang/, 'die Oberflaeche erkennt den Fall an diesem Anfang');
});

test('pruefeQuellen: je Quelle ok oder Meldung mit Handlung, wirft nie', async () => {
  const proxy = { execute: async (q) => {
    if (/draftOrders/.test(q)) throw new Error('Shopify GraphQL: Access denied for draftOrders field. Required access: `read_draft_orders` access scope.');
    return {};
  } };
  const r = await pruefeQuellen(proxy);
  assert.deepEqual(r.map(x => x.quelle), ['lexikon', 'bestellungen', 'kunden', 'angebote', 'warenkoerbe', 'bestand']);
  assert.equal(r.filter(x => x.ok).length, 5);
  assert.match(r.find(x => x.quelle === 'angebote').meldung, /Was tun: .*read_draft_orders/);
  const leer = await pruefeQuellen({ execute: async () => null });
  assert.ok(leer.every(x => !x.ok && /^Kein Zugang/.test(x.meldung)));
});

test('Schreibrechte fuer Sonderposten: fehlendeSchreibBereiche und wasTun nennen write_inventory', async () => {
  const { fehlendeSchreibBereiche, SCHREIB_BEREICHE } = await import('../sync/zugang.mjs');
  assert.deepEqual(fehlendeSchreibBereiche('read_inventory,read_locations,write_products'), ['write_inventory']);
  assert.deepEqual(fehlendeSchreibBereiche(Object.keys(SCHREIB_BEREICHE).join(',')), []);
  const tun = wasTun('Shopify GraphQL: Access denied for inventorySetQuantities field. Required access: `write_inventory` access scope.');
  assert.match(tun, /Schreibrecht write_inventory/);
  assert.match(tun, /Inhaber/);
});
