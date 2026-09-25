import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aktualisiere, argumente, standNachLauf, TEIL_FN } from '../scripts/aktualisieren.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tp-aktualisieren-'));
}

const ok = (data, extensions) => ({ ok: true, status: 200, json: async () => ({ data, extensions }), text: async () => '' });

function bestellungMitMuster(n, cursor, quellvarianteId) {
  return {
    cursor,
    id: `gid://shopify/Order/${n}`,
    name: `#T${n}`,
    updatedAt: '2026-09-22T08:00:00Z',
    lineItems: { nodes: [{
      id: `gid://shopify/LineItem/${n}`, sku: `M-${n}`, quantity: 1,
      customAttributes: quellvarianteId != null ? [{ key: '_Quellvariante_ID', value: String(quellvarianteId) }] : [],
      variant: { id: `gid://shopify/ProductVariant/${n}`, sku: `M-${n}`, title: 'Muster', metafields: { nodes: [] }, lieferant: { nodes: [] }, custom: { nodes: [] }, product: { id: `gid://shopify/Product/${n}`, handle: 'x', title: 'X', metafields: { nodes: [] }, grosshandel: { nodes: [] } } },
    }] },
  };
}

test('argumente: --nur akzeptiert nur bekannte Teile', () => {
  assert.deepEqual(argumente(['--nur', 'lexikon,kennzahlen']).nur, ['lexikon', 'kennzahlen']);
  assert.throws(() => argumente(['--nur', 'unbekannt']), /Unbekannter Teil/);
});

test('alle sieben Teile erfolgreich: Status enthaelt Zeitpunkt, Dauer, Anzahl je Teil', async () => {
  const dir = tmpDir();
  const teilFn = {
    lexikon: async () => ({ anzahl: 12 }),
    bestellungen: async () => ({ anzahl: 5, hinweis: '2/2 Quellvarianten geladen' }),
    kennzahlen: async () => ({ anzahl: 40 }),
    kunden: async () => ({ anzahl: 7 }),
    angebote: async () => ({ anzahl: 2 }),
    warenkoerbe: async () => ({ anzahl: 3 }),
    bestand: async () => ({ anzahl: 9 }),
  };
  const { statusDatei, status, ergebnisse } = await aktualisiere({ dir, teilFn });
  assert.equal(statusDatei, path.join(dir, 'aktualisierung.json'));
  assert.equal(ergebnisse.length, 7);
  for (const teil of ['lexikon', 'bestellungen', 'kennzahlen', 'kunden', 'angebote', 'warenkoerbe', 'bestand']) {
    assert.equal(status.teile[teil].erfolg, true);
    assert.ok(status.teile[teil].zeitpunkt);
    assert.equal(typeof status.teile[teil].dauerMs, 'number');
  }
  assert.equal(status.teile.lexikon.anzahl, 12);
  assert.equal(status.teile.bestellungen.meldung, '2/2 Quellvarianten geladen');
  assert.equal(status.teile.kunden.anzahl, 7);

  const aufDisk = JSON.parse(fs.readFileSync(statusDatei, 'utf8'));
  assert.deepEqual(aufDisk, status);
});

test('Fehler in einem Teil verhindert die anderen nicht', async () => {
  const dir = tmpDir();
  const teilFn = {
    lexikon: async () => { throw new Error('Kein Zugang in .env.local'); },
    bestellungen: async () => ({ anzahl: 3 }),
    kennzahlen: async () => ({ anzahl: 9 }),
  };
  const { status, ergebnisse } = await aktualisiere({ dir, teilFn });
  assert.equal(ergebnisse.find(r => r.teil === 'lexikon').erfolg, false);
  assert.equal(status.teile.lexikon.meldung, 'Kein Zugang in .env.local');
  assert.equal(status.teile.bestellungen.erfolg, true);
  assert.equal(status.teile.kennzahlen.erfolg, true);
});

test('--nur fuehrt nur die angegebenen Teile aus und behaelt den alten Stand der anderen', async () => {
  const dir = tmpDir();
  const ersteRunde = {
    lexikon: async () => ({ anzahl: 1 }),
    bestellungen: async () => ({ anzahl: 2 }),
    kennzahlen: async () => ({ anzahl: 3 }),
  };
  const erste = await aktualisiere({ dir, teilFn: ersteRunde });
  const altesLexikon = erste.status.teile.lexikon;

  const zweiteRunde = {
    lexikon: async () => { throw new Error('sollte nicht laufen'); },
    bestellungen: async () => ({ anzahl: 99 }),
    kennzahlen: async () => { throw new Error('sollte nicht laufen'); },
  };
  const { status, ergebnisse } = await aktualisiere({ dir, nur: ['bestellungen'], teilFn: zweiteRunde });
  assert.equal(ergebnisse.length, 1);
  assert.deepEqual(status.teile.lexikon, altesLexikon);
  assert.equal(status.teile.bestellungen.anzahl, 99);
});

test('teilBestellungen: laedt vollstaendig ueber mehrere Seiten und mehrere Quellvarianten-Gruppen (>250)', async () => {
  const dir = tmpDir();
  const alterToken = process.env.SHOPIFY_ADMIN_TOKEN;
  const altesFetch = globalThis.fetch;
  process.env.SHOPIFY_ADMIN_TOKEN = 'shpat_test';
  const anzahlBestellungen = 260;
  const seite1 = Array.from({ length: 130 }, (_, i) => bestellungMitMuster(i, 'c1', i));
  const seite2 = Array.from({ length: 130 }, (_, i) => bestellungMitMuster(130 + i, 'c2', 130 + i));
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const { query, variables } = JSON.parse(init.body);
    calls.push({ query, variables });
    if (query.includes('OpsOrders')) {
      const seite = variables.after === null ? seite1 : seite2;
      return ok({ orders: { pageInfo: { hasNextPage: variables.after === null, endCursor: variables.after === null ? 'c2' : null }, nodes: seite } });
    }
    if (query.includes('OpsQuellvarianten')) {
      return ok({ nodes: variables.ids.map((id) => ({ id, sku: `Q-${id}`, title: 'Q', metafields: { nodes: [] }, lieferant: { nodes: [] }, custom: { nodes: [] }, product: null })) });
    }
    throw new Error(`unerwartete Query: ${query.slice(0, 30)}`);
  };
  try {
    const r = await TEIL_FN.bestellungen(dir);
    assert.equal(r.anzahl, anzahlBestellungen);
    assert.match(r.hinweis, /2 Seite\(n\)/);
    assert.match(r.hinweis, /260\/260 Quellvarianten/);
    const quellvariantenAufrufe = calls.filter((c) => c.query.includes('OpsQuellvarianten'));
    assert.equal(quellvariantenAufrufe.length, 2, 'ueber 250 IDs -> zwei Gruppenaufrufe');
    assert.equal(quellvariantenAufrufe[0].variables.ids.length, 250);
    assert.equal(quellvariantenAufrufe[1].variables.ids.length, 10);
    const orderCalls = calls.filter((c) => c.query.includes('OpsOrders'));
    for (const c of orderCalls) assert.match(c.variables.query, /created_at:>=.*fulfillment_status:unfulfilled.*fulfillment_status:partial/);

    const datei = JSON.parse(fs.readFileSync(path.join(dir, 'bestelluebersicht', 'orders.json'), 'utf8'));
    assert.equal(datei.orders.length, anzahlBestellungen);
    assert.equal(datei.quellvarianten.length, anzahlBestellungen);
  } finally {
    globalThis.fetch = altesFetch;
    if (alterToken === undefined) delete process.env.SHOPIFY_ADMIN_TOKEN; else process.env.SHOPIFY_ADMIN_TOKEN = alterToken;
  }
});

test('teilBestellungen bricht sauber ab, wenn kein Zugang eingerichtet ist', async () => {
  const dir = tmpDir();
  const alterToken = process.env.SHOPIFY_ADMIN_TOKEN;
  delete process.env.SHOPIFY_ADMIN_TOKEN;
  try {
    await assert.rejects(() => TEIL_FN.bestellungen(dir), /Kein Zugang/);
  } finally {
    if (alterToken !== undefined) process.env.SHOPIFY_ADMIN_TOKEN = alterToken;
  }
});

test('fehlende Zieldatei ist kein Fehler: erster Lauf legt sie neu an', async () => {
  const dir = tmpDir();
  const teilFn = { lexikon: async () => ({ anzahl: 0 }), bestellungen: async () => ({ anzahl: 0 }), kennzahlen: async () => ({ anzahl: 0 }) };
  assert.equal(fs.existsSync(path.join(dir, 'aktualisierung.json')), false);
  const { status } = await aktualisiere({ dir, teilFn });
  assert.equal(status.teile.lexikon.erfolg, true);
});

test('gescheiterter Lauf behaelt den letzten erfolgreichen Stand und vermerkt den Fehler daneben', async () => {
  const dir = tmpDir();
  const erste = await aktualisiere({ dir, teilFn: {
    lexikon: async () => ({ anzahl: 635 }),
    bestellungen: async () => ({ anzahl: 10 }),
    kennzahlen: async () => ({ anzahl: 8 }),
  } });
  const kaputt = async () => { throw new Error('Kein Zugang in .env.local'); };
  const { status } = await aktualisiere({ dir, teilFn: { lexikon: kaputt, bestellungen: kaputt, kennzahlen: async () => ({ anzahl: 9 }) } });
  const lex = status.teile.lexikon;
  assert.equal(lex.erfolg, true);
  assert.equal(lex.anzahl, 635);
  assert.equal(lex.zeitpunkt, erste.status.teile.lexikon.zeitpunkt);
  assert.equal(lex.letzterFehler.meldung, 'Kein Zugang in .env.local');
  assert.ok(lex.letzterFehler.zeitpunkt);
  assert.equal(status.teile.kennzahlen.anzahl, 9);
  assert.equal(status.teile.kennzahlen.letzterFehler, undefined);

  // Der naechste erfolgreiche Lauf raeumt den Fehlervermerk wieder ab.
  const { status: danach } = await aktualisiere({ dir, nur: ['lexikon'], teilFn: { lexikon: async () => ({ anzahl: 636 }) } });
  assert.equal(danach.teile.lexikon.anzahl, 636);
  assert.equal(danach.teile.lexikon.letzterFehler, undefined);
});

test('standNachLauf: ohne frueheren Erfolg bleibt der Teil gescheitert', () => {
  const r = { teil: 'lexikon', zeitpunkt: '2026-09-24T10:00:00Z', dauerMs: 5, erfolg: false, anzahl: null, meldung: 'Kein Zugang' };
  assert.deepEqual(standNachLauf(undefined, r), { zeitpunkt: r.zeitpunkt, dauerMs: 5, erfolg: false, anzahl: null, meldung: 'Kein Zugang' });
  const alterFehler = { zeitpunkt: '2026-09-23T10:00:00Z', dauerMs: 3, erfolg: false, anzahl: null, meldung: 'alt' };
  assert.equal(standNachLauf(alterFehler, r).meldung, 'Kein Zugang');
  assert.equal(standNachLauf(alterFehler, r).letzterFehler, undefined);
});

// --- MCP-Weg: fertige Admin-API-Antwort statt eigenem Abruf ----------------
// Ohne Token kam bisher nur eine Fehlermeldung. Der Weg ueber eine Datei ist
// der einzige, den eine Claude-Sitzung mit Shopify-MCP gehen kann.

test('argumente: --input nimmt <teil>=<datei> und meldet Unsinn sofort', () => {
  assert.deepEqual(argumente(['--input', 'kunden=/tmp/k.json']).eingaben, { kunden: '/tmp/k.json' });
  assert.deepEqual(
    argumente(['--input', 'kunden=/tmp/k.json', '--input', 'bestand=/tmp/b.json']).eingaben,
    { kunden: '/tmp/k.json', bestand: '/tmp/b.json' },
  );
  assert.throws(() => argumente(['--input', 'kunden']), /erwartet <teil>=<datei>/);
  assert.throws(() => argumente(['--input', 'kunden=']), /Dateiname fehlt/);
  assert.throws(() => argumente(['--input', 'quatsch=/tmp/x.json']), /Unbekannter Teil in --input/);
});

test('argumente: --input fuer einen Teil mit eigenem Skript nennt dieses Skript', () => {
  assert.throws(() => argumente(['--input', 'lexikon=/tmp/l.json']), /npm run lexikon:export/);
  assert.throws(() => argumente(['--input', 'kennzahlen=/tmp/k.json']), /npm run kennzahlen:export/);
  assert.throws(() => argumente(['--input', 'bestellungen=/tmp/b.json']), /npm run ops:bestelluebersicht/);
});

test('argumente: --input fuer einen von --nur ausgelassenen Teil ist ein Fehler', () => {
  // Sonst liegt eine Datei bereit und der Lauf ignoriert sie stillschweigend.
  assert.throws(
    () => argumente(['--nur', 'kunden', '--input', 'bestand=/tmp/b.json']),
    /laesst diesen Teil aus/,
  );
});

test('ohne --nur laufen genau die Teile, fuer die eine Datei vorliegt', async () => {
  const dir = tmpDir();
  const gelaufen = [];
  const teilFn = {};
  for (const t of ['lexikon', 'bestellungen', 'kennzahlen', 'kunden', 'angebote', 'warenkoerbe', 'bestand']) {
    teilFn[t] = async () => { gelaufen.push(t); return { anzahl: 1 }; };
  }
  const eingaben = { kunden: { daten: { customers: [] }, datei: 'k.json' } };
  const { ergebnisse } = await aktualisiere({ dir, teilFn, eingaben });
  assert.deepEqual(gelaufen, ['kunden']);
  assert.equal(ergebnisse.length, 1);
});

test('teilKunden schreibt aus der Datei und vermerkt die Herkunft', async () => {
  const dir = tmpDir();
  const eingabe = {
    datei: 'kunden-roh.json',
    daten: { data: { customers: { nodes: [
      { id: 'gid://shopify/Customer/1', displayName: 'A B', numberOfOrders: '2', amountSpent: { amount: '10.0', currencyCode: 'EUR' } },
    ] } } },
  };
  const r = await TEIL_FN.kunden(dir, eingabe);
  assert.equal(r.anzahl, 1);
  // Der Vermerk muss die Datei nennen: ein Stand aus einer Datei darf im
  // Dashboard nicht wie ein Live-Abruf aussehen.
  assert.match(r.hinweis, /aus Datei kunden-roh\.json \(MCP-Export\)/);
  const geschrieben = JSON.parse(fs.readFileSync(path.join(dir, 'kunden', 'kunden.json'), 'utf8'));
  assert.equal(geschrieben.anzahl, 1);
  assert.equal(geschrieben.kunden[0].name, 'A B');
});

test('teilWarenkoerbe und teilAngebote nehmen ebenfalls eine Datei', async () => {
  const dir = tmpDir();
  const wk = await TEIL_FN.warenkoerbe(dir, {
    datei: 'wk.json',
    daten: { checkouts: [{ id: 'gid://shopify/AbandonedCheckout/1', createdAt: '2026-09-20T10:00:00Z', completedAt: null, totalPriceSet: { shopMoney: { amount: '99.5', currencyCode: 'EUR' } }, lineItems: { nodes: [] } }] },
  });
  assert.equal(wk.anzahl, 1);
  assert.match(wk.hinweis, /aus Datei wk\.json .* · 99\.5 € offener Wert/);

  const ang = await TEIL_FN.angebote(dir, {
    datei: 'ang.json',
    daten: { draftOrders: [{ id: 'gid://shopify/DraftOrder/1', name: '#D1', status: 'OPEN', createdAt: '2026-09-20T10:00:00Z', totalPriceSet: { shopMoney: { amount: '50.0', currencyCode: 'EUR' } }, lineItems: { nodes: [] } }] },
  });
  assert.equal(ang.anzahl, 1);
  assert.match(ang.hinweis, /aus Datei ang\.json .* · 1 offen/);
});

test('teilBestand aus Datei: Lage und Herkunft stehen beide im Vermerk', async () => {
  const dir = tmpDir();
  const r = await TEIL_FN.bestand(dir, {
    datei: 'bestand-roh.json',
    daten: {
      standorte: [{ id: 'gid://shopify/Location/1', name: 'Lager' }],
      // Gleiche Form wie sync/inventory.mjs fetchInventoryLevels sie baut:
      // der Standort haengt als Objekt am Level, nicht als flacher Name.
      bestand: [{
        quantities: [{ name: 'available', quantity: 5 }, { name: 'on_hand', quantity: 5 }],
        item: { id: 'gid://shopify/InventoryItem/1', sku: 'X-1', tracked: true, variant: { title: 'Default Title', product: { handle: 'x', title: 'X' } } },
        standort: { id: 'gid://shopify/Location/1', name: 'Lager' },
      }],
    },
  });
  assert.match(r.hinweis, /aus Datei bestand-roh\.json \(MCP-Export\) · 1 Standort\(e\)/);
  const geschrieben = JSON.parse(fs.readFileSync(path.join(dir, 'bestand', 'bestand.json'), 'utf8'));
  assert.equal(geschrieben.gefuehrt, true);
  assert.equal(geschrieben.eintraege[0].standort, 'Lager');
  assert.equal(geschrieben.eintraege[0].verfuegbar, 5);
});

test('ohne Zugang nennt die Fehlermeldung den --input-Weg', async () => {
  const dir = tmpDir();
  // Ohne Token und ohne Datei: der Text muss den zweiten Weg zeigen, sonst
  // sucht der naechste Leser wieder nach einem Token, den es nicht gibt.
  await assert.rejects(() => TEIL_FN.kunden(dir, null), /--input kunden=<datei>/);
});
