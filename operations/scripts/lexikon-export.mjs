#!/usr/bin/env node
/**
 * Produktlexikon-Export: Shop-Produktname -> Original beim Lieferanten.
 *
 *   npm run lexikon:export -- --input <export.json> [--ziel <datei.json>]
 *   npm run lexikon:export -- --live [--ziel <datei.json>]
 *
 * --input: Export der Admin API, z. B. ueber den Shopify-MCP erzeugt
 * (siehe operations/README.md, Abschnitt "Produktlexikon"). Erwartete Form:
 * {produkte:[...]} oder {data:{products:{nodes:[...]}}}, Produkte mit
 * Varianten und (aufgeloesten) Metafeldern - siehe lib/lexikon.mjs.
 * --live: bulkOperationRunQuery ueber workflow/graphql-proxy.mjs, braucht
 * SHOPIFY_ADMIN_TOKEN (shpat_) in .env.local.
 *
 * Ziel ist standardmaessig ~/teppich-paradies-analyse/lexikon/produkte.json
 * und darf nie im Repository liegen - die Datei enthaelt echte
 * Lieferantendaten (Artikelnummern, URLs, Kollektionen, Preise).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aufbereiten } from '../lib/lexikon.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STANDARD_ZIEL = path.join(os.homedir(), 'teppich-paradies-analyse', 'lexikon', 'produkte.json');

export function argumente(argv) {
  const a = { input: null, ziel: STANDARD_ZIEL, live: false, hilfe: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--input') a.input = argv[++i];
    else if (k === '--ziel') a.ziel = argv[++i];
    else if (k === '--live') a.live = true;
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  if (!a.hilfe && !a.input && !a.live) throw new Error('--input <datei> oder --live angeben');
  return a;
}

/** Lieferantendaten gehoeren nicht ins Repository (gleiche Pruefung wie kennzahlen-export.mjs). */
export function pruefeZiel(datei, repo = REPO) {
  const abs = path.resolve(datei);
  const rel = path.relative(repo, abs);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    throw new Error(`Ziel liegt im Repository (${rel}) - Lieferantendaten gehoeren nicht ins Repo`);
  }
  return abs;
}

const BULK_QUERY = `
{
  products(query: "status:active") {
    edges {
      node {
        id handle title status templateSuffix productType
        featuredImage { url }
        metafields(namespace: "custom", first: 30) { edges { node { namespace key value type } } }
        variants {
          edges {
            node {
              id title sku availableForSale
              price
              selectedOptions { name value }
              einkauf: metafields(namespace: "einkauf", first: 15) {
                edges { node { namespace key value type reference { ... on Metaobject { kuerzel: field(key: "kuerzel") { value } } } } }
              }
            }
          }
        }
      }
    }
  }
}`;

const BULK_START = `
mutation LexikonBulk($q: String!) {
  bulkOperationRunQuery(query: $q) {
    bulkOperation { id status }
    userErrors { field message }
  }
}`;

const BULK_STATUS = `
{
  currentBulkOperation {
    id status errorCode objectCount url partialDataUrl
  }
}`;

async function warte(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/** JSONL (bulkOperationRunQuery-Format, __parentId verknuepft Zeilen) zu {produkte:[...]}. */
export function jsonlZuProdukten(jsonlText) {
  const zeilen = jsonlText.split('\n').map(z => z.trim()).filter(Boolean);
  const produkteById = new Map();
  const produktReihenfolge = [];
  const variantenByParent = new Map();

  for (const zeile of zeilen) {
    const obj = JSON.parse(zeile);
    if (typeof obj.id === 'string' && obj.id.includes('/Product/') && !obj.__parentId) {
      const p = { ...obj, metafields: [], variants: [] };
      produkteById.set(obj.id, p);
      produktReihenfolge.push(obj.id);
    } else if (typeof obj.id === 'string' && obj.id.includes('/ProductVariant/')) {
      const liste = variantenByParent.get(obj.__parentId) ?? [];
      liste.push({ ...obj, metafields: [] });
      variantenByParent.set(obj.__parentId, liste);
    } else if (typeof obj.namespace === 'string' && typeof obj.key === 'string') {
      // Metafeld-Zeile: __parentId zeigt auf Produkt oder Variante. Eine
      // aufgeloeste Metaobjekt-Referenz (z. B. einkauf.lieferant -> kuerzel)
      // kommt inline unter `reference`, nicht als eigene JSONL-Zeile - hier
      // zu einem einfachen Objekt {feld: wert} verdichten, das
      // lib/lexikon.mjs::feldWert versteht.
      const mf = { namespace: obj.namespace, key: obj.key, value: obj.value };
      if (obj.reference && typeof obj.reference === 'object') {
        mf.value = Object.fromEntries(
          Object.entries(obj.reference).map(([k, v]) => [k, (v && typeof v === 'object' && 'value' in v) ? v.value : v]),
        );
      }
      const zielProdukt = produkteById.get(obj.__parentId);
      if (zielProdukt) { zielProdukt.metafields.push(mf); continue; }
      for (const liste of variantenByParent.values()) {
        const v = liste.find(x => x.id === obj.__parentId);
        if (v) { v.metafields.push(mf); break; }
      }
    }
  }

  for (const id of produktReihenfolge) {
    const p = produkteById.get(id);
    p.variants = variantenByParent.get(id) ?? [];
  }
  return { produkte: produktReihenfolge.map(id => produkteById.get(id)) };
}

export async function ladeLive() {
  const { erzeugeProxy } = await import('../sync/zugang.mjs');
  const { proxy, art } = await erzeugeProxy();
  if (art === 'sammeln') throw new Error('Kein Zugang in .env.local (SHOPIFY_ADMIN_TOKEN oder SHOPIFY_CLIENT_ID/SECRET) - --input mit MCP-Export nutzen');

  const start = await proxy.execute(BULK_START, { q: BULK_QUERY });
  const fehler = start?.bulkOperationRunQuery?.userErrors ?? [];
  if (fehler.length) throw new Error(`bulkOperationRunQuery: ${fehler.map(e => e.message).join('; ')}`);

  let status;
  for (let i = 0; i < 120; i++) {
    await warte(5000);
    const antwort = await proxy.execute(BULK_STATUS, {});
    status = antwort?.currentBulkOperation;
    if (!status) throw new Error('currentBulkOperation ohne Antwort');
    if (status.status === 'COMPLETED') break;
    if (status.status === 'FAILED' || status.status === 'CANCELED') {
      throw new Error(`Bulk-Operation ${status.status}: ${status.errorCode ?? 'unbekannt'}`);
    }
  }
  if (status?.status !== 'COMPLETED') throw new Error('Bulk-Operation nicht abgeschlossen (Timeout)');
  if (!status.url) return { produkte: [] }; // keine Produkte

  const res = await fetch(status.url);
  if (!res.ok) throw new Error(`JSONL-Download fehlgeschlagen: HTTP ${res.status}`);
  const text = await res.text();
  return jsonlZuProdukten(text);
}

async function main() {
  const a = argumente(process.argv.slice(2));
  if (a.hilfe) {
    console.log('npm run lexikon:export -- --input <export.json> | --live [--ziel <datei.json>]');
    return;
  }
  const ziel = pruefeZiel(a.ziel);
  const daten = a.live ? await ladeLive() : JSON.parse(fs.readFileSync(a.input, 'utf8'));
  const modell = aufbereiten(daten);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, JSON.stringify(modell, null, 2));

  const varianten = modell.produkte.reduce((s, p) => s + p.varianten.length, 0);
  const mitArtikelnummer = modell.produkte.reduce((s, p) => s + p.varianten.filter(v => v.einkauf.artikelnummer).length, 0);
  const mitUrl = modell.produkte.reduce((s, p) => s + p.varianten.filter(v => v.einkauf.url).length, 0);
  console.log(`Lexikon: ${ziel}`);
  console.log(`${modell.anzahl} Produkte, ${varianten} Varianten`);
  console.log(`${mitArtikelnummer}/${varianten} Varianten mit Lieferanten-Artikelnummer, ${mitUrl}/${varianten} mit Lieferanten-URL`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(`Fehler: ${err.message}`); process.exit(1); });
}
