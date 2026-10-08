#!/usr/bin/env node
/**
 * Pruefroutine nach Importen (Werkbank w-012) - nur lesend.
 *
 *   npm run -s import:pruefen                         # Produkte der letzten 7 Tage
 *   npm run -s import:pruefen -- --tage 14
 *   npm run -s import:pruefen -- --seit 2026-10-01
 *   npm run -s import:pruefen -- --handles a,b        # genau diese Produkte
 *   npm run -s import:pruefen -- --json <datei>       # Befunde zusaetzlich als JSON
 *   npm run -s import:pruefen -- --jsonl <bulk.jsonl> # ohne Zugang: Export ueber den Shopify-MCP
 *   npm run -s import:pruefen -- --bulk-query         # gibt die Abfrage dafuer aus
 *   npm run -s import:pruefen -- --speichern <datei>  # geladenes JSONL ablegen (spaeter per --jsonl)
 *
 * Laedt den ganzen Katalog per bulkOperationRunQuery (die neuen Produkte
 * werden mit ihrer Produktart verglichen) ueber den Zugang aus .env.local
 * (operations/sync/zugang.mjs; TP_ENV_LOCAL zeigt auf eine andere Datei).
 * Regeln: operations/lib/import-pruefung.mjs. Exit 1, wenn Fehler gefunden
 * wurden, Exit 2 bei falschem Aufruf.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { pruefeImporte, jsonlZuProdukten, bericht } from '../lib/import-pruefung.mjs';

export const BULK_QUERY = `
{
  products {
    edges {
      node {
        id handle title status productType tags createdAt onlineStoreUrl
        category { fullName }
        mediaCount { count }
        options { name values }
        collections { edges { node { id handle } } }
        metafields(namespace: "custom") { edges { node { key value } } }
        variants {
          edges {
            node {
              id sku title price
              image { url }
              selectedOptions { name value }
              metafields(namespace: "custom") { edges { node { key value } } }
            }
          }
        }
      }
    }
  }
}`;

const BULK_START = `
mutation ImportPruefung($q: String!) {
  bulkOperationRunQuery(query: $q) { bulkOperation { id status } userErrors { field message } }
}`;

const BULK_STATUS = `
query ImportPruefungStatus($id: ID!) {
  node(id: $id) { ... on BulkOperation { id status errorCode url } }
}`;

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const MIT_WERT = ['tage', 'seit', 'handles', 'json', 'jsonl', 'speichern'];
const SCHALTER = ['bulk-query', 'hilfe'];

export function argumente(argv, heute = new Date()) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) throw new Error(`unerwartetes Argument: ${k}`);
    const name = k.slice(2);
    if (SCHALTER.includes(name)) { o[name] = true; continue; }
    if (!MIT_WERT.includes(name)) throw new Error(`unbekannte Option: ${k}`);
    const wert = argv[i + 1];
    if (wert == null || wert.startsWith('--')) throw new Error(`${k} ohne Wert`);
    o[name] = wert;
    i += 1;
  }
  if (o.tage != null && o.seit != null) throw new Error('--tage und --seit schliessen sich aus');
  if (o.seit != null && !DATUM.test(o.seit)) throw new Error('--seit als JJJJ-MM-TT');
  if (o.tage != null && !/^\d+$/.test(o.tage)) throw new Error('--tage als ganze Zahl');
  if (o.seit == null) {
    const d = new Date(heute);
    d.setUTCDate(d.getUTCDate() - Number(o.tage ?? 7));
    o.seit = d.toISOString().slice(0, 10);
  }
  if (o.handles != null) o.handles = o.handles.split(',').map((h) => h.trim()).filter(Boolean);
  return o;
}

async function ladeLive({ pollMs = 3000 } = {}) {
  const { erzeugeProxy, KEIN_ZUGANG } = await import('../sync/zugang.mjs');
  const { proxy, art } = await erzeugeProxy();
  if (art === 'sammeln') throw new Error(`${KEIN_ZUGANG} (Ausweichweg: --bulk-query ueber den Shopify-MCP, dann --jsonl)`);
  const start = await proxy.execute(BULK_START, { q: BULK_QUERY });
  const fehler = start?.bulkOperationRunQuery?.userErrors ?? [];
  if (fehler.length) throw new Error(`bulkOperationRunQuery: ${fehler.map((e) => e.message).join('; ')}`);
  const id = start?.bulkOperationRunQuery?.bulkOperation?.id;
  if (!id) throw new Error('bulkOperationRunQuery: keine Operation gestartet');
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, pollMs));
    const s = (await proxy.execute(BULK_STATUS, { id }))?.node;
    if (s?.status === 'COMPLETED') {
      if (!s.url) return '';
      const res = await fetch(s.url);
      if (!res.ok) throw new Error(`JSONL-Download: HTTP ${res.status}`);
      return res.text();
    }
    if (s?.status === 'FAILED' || s?.status === 'CANCELED') throw new Error(`Bulk-Operation ${s.status}: ${s.errorCode ?? 'unbekannt'}`);
  }
  throw new Error('Bulk-Operation nicht abgeschlossen (Timeout)');
}

async function main() {
  let o;
  try { o = argumente(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  if (o.hilfe) { console.log('npm run -s import:pruefen -- [--tage N | --seit JJJJ-MM-TT | --handles a,b] [--json datei] [--jsonl bulk.jsonl | --speichern datei] [--bulk-query]'); return; }
  if (o['bulk-query']) { console.log(BULK_QUERY.trim()); return; }

  const text = o.jsonl ? fs.readFileSync(o.jsonl, 'utf8') : await ladeLive();
  if (o.speichern) fs.writeFileSync(o.speichern, text);
  const produkte = jsonlZuProdukten(text);
  if (!produkte.length) throw new Error('keine Produkte geladen');
  const ergebnis = pruefeImporte({ produkte, seit: o.seit, handles: o.handles ?? null });
  console.log(bericht(ergebnis, { seit: o.handles ? null : o.seit }));
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ seit: o.seit, ...ergebnis }, null, 2));
  if (ergebnis.befunde.some((b) => b.stufe === 'fehler')) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(2); });
}
