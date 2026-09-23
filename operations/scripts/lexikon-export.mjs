#!/usr/bin/env node
/**
 * Produktlexikon-Export: Shop-Produktname -> Original beim Lieferanten.
 *
 *   npm run lexikon:export -- --input <export.json> [--ziel <datei.json>]
 *   npm run lexikon:export -- --live [--ziel <datei.json>]
 *   npm run lexikon:export -- --jsonl <bulk.jsonl> [--metaobjekte <gid-zu-name.json>] [--ziel <datei.json>]
 *
 * --input: Export der Admin API, z. B. ueber den Shopify-MCP erzeugt
 * (siehe operations/README.md, Abschnitt "Produktlexikon"). Erwartete Form:
 * {produkte:[...]} oder {data:{products:{nodes:[...]}}}, Produkte mit
 * Varianten und (aufgeloesten) Metafeldern - siehe lib/lexikon.mjs.
 * --live: bulkOperationRunQuery ueber workflow/graphql-proxy.mjs, braucht
 * SHOPIFY_ADMIN_TOKEN (shpat_) in .env.local. Loest custom.*-Metaobjekt-
 * Referenzen (Nutzungsklasse, Brandverhalten, Fasermaterial, Zimmer, ...)
 * automatisch zu Anzeigenamen auf (sammleMetaobjectGids + nodes()-Abfrage).
 * --jsonl: auf einer Maschine ohne SHOPIFY_ADMIN_TOKEN - JSONL aus einer
 * manuell gestarteten bulkOperationRunQuery (z. B. ueber den Shopify-MCP-
 * Server einer Agentensitzung), optional mit --metaobjekte einer vorher per
 * nodes()-Abfrage erstellten {gid: anzeigename}-Datei fuer dieselbe
 * Aufloesung wie --live.
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
  const a = { input: null, ziel: STANDARD_ZIEL, live: false, jsonl: null, metaobjekte: null, hilfe: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--input') a.input = argv[++i];
    else if (k === '--ziel') a.ziel = argv[++i];
    else if (k === '--live') a.live = true;
    else if (k === '--jsonl') a.jsonl = argv[++i];
    else if (k === '--metaobjekte') a.metaobjekte = argv[++i];
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  if (!a.hilfe && !a.input && !a.live && !a.jsonl) throw new Error('--input <datei>, --live oder --jsonl <datei> angeben');
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

// custom.*-Metaobjekt-Referenzen (nutzungsklassen, brandverhalten,
// fasermaterial, zimmer, ...) kommen hier nur als rohe GID bzw. JSON-Array
// von GIDs (Feld "value") mit ihrem Typ ("metaobject_reference" bzw.
// "list.metaobject_reference") - list.*-Referenzen sind eine Connection und
// wuerden in der Bulk-Operation in eigene JSONL-Zeilen zerlegt, was die
// Zuordnung stark verkompliziert. Stattdessen loesen wir sie NACH dem
// JSONL-Import in einem eigenen Schritt auf (sammleMetaobjectGids +
// resolveMetaobjectReferenzen), ueber eine einzelne nodes()-Abfrage je
// Batch - siehe ladeLive(). Kein raten: bleibt eine GID unaufgeloest, wird
// nichts angezeigt statt der ID (CLAUDE.md "Produktdaten").
//
// einkauf.muster_variante ist dagegen eine einzelne (nicht Listen-)Referenz
// auf die Mustervariante - die kann inline aufgeloest werden wie
// einkauf.lieferant, keine Connection, keine Flattening-Problematik.
//
// Musterprodukte (Handle muster-<handle>) stehen im Shop auf UNLISTED, nicht
// auf ACTIVE - "status:active" allein liess sie komplett aus dem Export
// fallen, wodurch lib/lexikon.mjs::musterBlock nie einen passenden Handle
// fand (der Musterhinweis fehlte, obwohl ein Muster existierte). Deshalb
// zusaetzlich alle Handles mit dem Praefix muster- laden, unabhaengig vom
// Status.
const BULK_QUERY = `
{
  products(query: "status:active OR handle:muster-*") {
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
                edges { node { namespace key value type reference {
                  ... on Metaobject { kuerzel: field(key: "kuerzel") { value } }
                  ... on ProductVariant { id product { handle } }
                } } }
              }
            }
          }
        }
      }
    }
  }
}`;

const METAOBJEKT_NODES_QUERY = `
query LexikonMetaobjekte($ids: [ID!]!) {
  nodes(ids: $ids) { ... on Metaobject { id displayName } }
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
      const mf = { namespace: obj.namespace, key: obj.key, value: obj.value, type: obj.type };
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

/** Alle Roh-Varianten eines Produkts, egal ob als Array oder {nodes:[...]} gespeichert. */
function rohVariantenVon(p) {
  return Array.isArray(p.variants) ? p.variants : Array.isArray(p.variants?.nodes) ? p.variants.nodes : [];
}

/**
 * Sammelt alle GIDs aus custom.*-Metafeldern vom Typ metaobject_reference
 * bzw. list.metaobject_reference (roh, noch nicht aufgeloest - value ist
 * dort eine GID bzw. ein JSON-Array von GIDs als String).
 */
export function sammleMetaobjectGids(rohProdukte) {
  const gids = new Set();
  const ausListe = (metafields) => {
    for (const mf of Array.isArray(metafields) ? metafields : []) {
      if (mf?.namespace !== 'custom' || typeof mf.value !== 'string') continue;
      if (mf.type === 'metaobject_reference') gids.add(mf.value);
      else if (mf.type === 'list.metaobject_reference') {
        try { for (const g of JSON.parse(mf.value)) if (typeof g === 'string') gids.add(g); } catch { /* kein JSON - ignorieren */ }
      }
    }
  };
  for (const p of rohProdukte) {
    ausListe(p.metafields);
    for (const v of rohVariantenVon(p)) ausListe(v.metafields);
  }
  return [...gids];
}

/**
 * Ersetzt rohe GIDs in custom.*-Metaobjekt-Referenzen durch die aufgeloesten
 * Anzeigenamen aus `gidZuName` (Map gid -> displayName). Einzelreferenz ->
 * String, Listenreferenz -> Array von Strings (lib/lexikon.mjs::feldWert
 * fuegt Listen mit ", " zusammen - genau das Format aus dem Auftrag,
 * "Wohnzimmer, Schlafzimmer, Flur"). Nicht aufloesbare GIDs fallen aus der
 * Liste bzw. werden zu null - nie die rohe ID anzeigen. Mutiert rohProdukte.
 */
export function resolveMetaobjectReferenzen(rohProdukte, gidZuName) {
  const aufloesen = (metafields) => {
    for (const mf of Array.isArray(metafields) ? metafields : []) {
      if (mf?.namespace !== 'custom' || typeof mf.value !== 'string') continue;
      if (mf.type === 'metaobject_reference') {
        mf.value = gidZuName.get(mf.value) ?? null;
      } else if (mf.type === 'list.metaobject_reference') {
        let rohGids = [];
        try { rohGids = JSON.parse(mf.value); } catch { rohGids = []; }
        const namen = rohGids.filter((g) => typeof g === 'string').map((g) => gidZuName.get(g)).filter(Boolean);
        mf.value = namen.length ? namen : null;
      }
    }
  };
  for (const p of rohProdukte) {
    aufloesen(p.metafields);
    for (const v of rohVariantenVon(p)) aufloesen(v.metafields);
  }
  return rohProdukte;
}

/** Fragt Metaobjekt-Anzeigenamen batchweise ab (nodes() ist auf 250 IDs je Aufruf begrenzt). */
export async function loeseMetaobjekteAuf(execute, gids, { batchSize = 100 } = {}) {
  const map = new Map();
  for (let i = 0; i < gids.length; i += batchSize) {
    const batch = gids.slice(i, i + batchSize);
    const antwort = await execute(METAOBJEKT_NODES_QUERY, { ids: batch });
    for (const n of antwort?.nodes ?? []) if (n?.id && n?.displayName) map.set(n.id, n.displayName);
  }
  return map;
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
  const roh = jsonlZuProdukten(text);

  const gids = sammleMetaobjectGids(roh.produkte);
  if (gids.length) {
    const gidZuName = await loeseMetaobjekteAuf(proxy.execute.bind(proxy), gids);
    resolveMetaobjectReferenzen(roh.produkte, gidZuName);
  }
  return roh;
}

/** Standardort der GID->Name-Zuordnung: neben der Zieldatei. */
export function standardMetaobjektDatei(ziel) {
  return path.join(path.dirname(ziel), 'metaobjekte.json');
}

async function main() {
  const a = argumente(process.argv.slice(2));
  if (a.hilfe) {
    console.log('npm run lexikon:export -- --input <export.json> | --live | --jsonl <bulk.jsonl> [--metaobjekte <gid-zu-name.json>] [--ziel <datei.json>]');
    return;
  }
  const ziel = pruefeZiel(a.ziel);
  let daten;
  if (a.live) {
    daten = await ladeLive();
  } else if (a.jsonl) {
    // Fuer Maschinen ohne SHOPIFY_ADMIN_TOKEN (--live braucht shpat_): JSONL
    // aus einer manuell (z. B. ueber den Shopify-MCP) gestarteten
    // bulkOperationRunQuery, plus optional eine bereits aufgeloeste
    // GID->Anzeigename-Zuordnung fuer custom.*-Metaobjekt-Referenzen.
    daten = jsonlZuProdukten(fs.readFileSync(a.jsonl, 'utf8'));
  } else {
    daten = JSON.parse(fs.readFileSync(a.input, 'utf8'));
  }
  // Ohne aufgeloeste Namen stehen im Lexikon rohe Metaobjekt-IDs
  // ("gid://shopify/Metaobject/...") statt "Wohnzimmer, Schlafzimmer".
  // Die Zuordnung gilt fuer --jsonl und --input gleichermassen; fehlt die
  // Datei, wird neben dem Ziel nach lexikon/metaobjekte.json gesucht.
  const zuordnung = a.metaobjekte || standardMetaobjektDatei(ziel);
  if (!a.live && zuordnung && fs.existsSync(zuordnung)) {
    const gidZuName = new Map(Object.entries(JSON.parse(fs.readFileSync(zuordnung, 'utf8'))));
    resolveMetaobjectReferenzen(daten.produkte ?? daten, gidZuName);
  }
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
