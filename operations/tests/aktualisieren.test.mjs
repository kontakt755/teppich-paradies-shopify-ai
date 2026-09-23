import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aktualisiere, argumente, TEIL_FN } from '../scripts/aktualisieren.mjs';

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

test('alle drei Teile erfolgreich: Status enthaelt Zeitpunkt, Dauer, Anzahl je Teil', async () => {
  const dir = tmpDir();
  const teilFn = {
    lexikon: async () => ({ anzahl: 12 }),
    bestellungen: async () => ({ anzahl: 5, hinweis: '2/2 Quellvarianten geladen' }),
    kennzahlen: async () => ({ anzahl: 40 }),
  };
  const { statusDatei, status, ergebnisse } = await aktualisiere({ dir, teilFn });
  assert.equal(statusDatei, path.join(dir, 'aktualisierung.json'));
  assert.equal(ergebnisse.length, 3);
  for (const teil of ['lexikon', 'bestellungen', 'kennzahlen']) {
    assert.equal(status.teile[teil].erfolg, true);
    assert.ok(status.teile[teil].zeitpunkt);
    assert.equal(typeof status.teile[teil].dauerMs, 'number');
  }
  assert.equal(status.teile.lexikon.anzahl, 12);
  assert.equal(status.teile.bestellungen.meldung, '2/2 Quellvarianten geladen');

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
