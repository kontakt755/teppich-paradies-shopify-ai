#!/usr/bin/env node
/**
 * Eine Aktualisierung fuer alle lokalen Control-Center-Datenquellen.
 *
 *   npm run daten:aktualisieren
 *   npm run daten:aktualisieren -- --nur lexikon
 *   npm run daten:aktualisieren -- --nur bestellungen,kennzahlen
 *
 * Erneuert nacheinander:
 *   1. Lexikon      - Produkte/Varianten/Metafelder (operations/lib/lexikon.mjs)
 *   2. Bestellungen - letzte 50 Bestellungen inkl. Quellvarianten der Muster
 *                     (ohne die Quellvariante verliert ein Muster seine
 *                     Artikelnummer, siehe operations/lib/bestelluebersicht.mjs)
 *   3. Kennzahlen   - letzte 35 Tage (operations/lib/kennzahlen.mjs braucht
 *                     mindestens 30 Tage Fenster fuer den 30-Tage-Zeitraum)
 *
 * Jeder Teil laeuft unabhaengig: ein Fehler in einem Teil verhindert die
 * anderen nicht, und schlaegt ein Abruf fehl, bleibt die vorhandene
 * Ausgabedatei unveraendert stehen - lieber alte Daten mit erkennbarem Datum
 * als gar keine. Am Ende steht $TP_PRIVAT_DIR/aktualisierung.json mit je
 * Teil: Zeitpunkt, Dauer, Anzahl Datensaetze, Erfolg/Fehler samt Meldung.
 *
 * Zugang: SHOPIFY_ADMIN_TOKEN (shpat_) oder SHOPIFY_CLIENT_ID/SECRET in
 * .env.local (operations/sync/zugang.mjs, domains/shopify/admin-token-oauth.md).
 * Ohne Zugangsdaten bricht jeder Teil mit klarer Meldung ab - kein stiller
 * Fehlschlag, keine erfundenen Daten. Dieses Skript sucht nie im Shopify-MCP
 * (der ist nur innerhalb einer Claude-Sitzung verfuegbar); fuer den MCP-Weg
 * bleiben die einzelnen `--input`-Varianten der drei Exporte.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STANDARD_PRIVAT_DIR = path.join(os.homedir(), 'teppich-paradies-analyse');
const TEILE = ['lexikon', 'bestellungen', 'kennzahlen'];

export function argumente(argv) {
  const a = { nur: null, privatDir: null, hilfe: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--nur') a.nur = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (k === '--privat-dir') a.privatDir = argv[++i];
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  if (a.nur) {
    for (const t of a.nur) if (!TEILE.includes(t)) throw new Error(`Unbekannter Teil in --nur: ${t} (erlaubt: ${TEILE.join(', ')})`);
  }
  return a;
}

function privatDir(uebersteuerung) {
  return uebersteuerung || process.env.TP_PRIVAT_DIR || STANDARD_PRIVAT_DIR;
}

/** Fuehrt einen Teil aus und liefert immer ein Ergebnisobjekt - wirft nie. */
async function fuehreAus(name, fn) {
  const start = Date.now();
  const zeitpunkt = new Date().toISOString();
  try {
    const { anzahl, hinweis } = await fn();
    return { teil: name, zeitpunkt, dauerMs: Date.now() - start, erfolg: true, anzahl, meldung: hinweis || null };
  } catch (err) {
    return { teil: name, zeitpunkt, dauerMs: Date.now() - start, erfolg: false, anzahl: null, meldung: err.message };
  }
}

async function teilLexikon(dir) {
  const { ladeLive } = await import('./lexikon-export.mjs');
  const { aufbereiten } = await import('../lib/lexikon.mjs');
  const daten = await ladeLive();
  const modell = aufbereiten(daten);
  const ziel = path.join(dir, 'lexikon', 'produkte.json');
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, JSON.stringify(modell, null, 2));
  return { anzahl: modell.anzahl };
}

async function teilKennzahlen(dir) {
  const { ladeLive } = await import('./kennzahlen-export.mjs');
  const { schnappschuss } = await import('../lib/kennzahlen.mjs');
  const daten = await ladeLive(35);
  const schnapp = schnappschuss(daten);
  const ziel = path.join(dir, 'kennzahlen', 'shop-snapshot.json');
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, JSON.stringify(schnapp, null, 2));
  return { anzahl: daten.orders.length };
}

const LETZTE_BESTELLUNGEN = 50;

/** Gleiche Variantenform wie sync/orders.mjs ORDERS_QUERY, fuer die Quellvarianten der Muster. */
const QUELLVARIANTEN_QUERY = `
query OpsQuellvarianten($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on ProductVariant {
      id sku title
      metafields(namespace: "einkauf", first: 20) { nodes { namespace key type value } }
      lieferant: metafields(namespace: "lieferant", first: 10) { nodes { namespace key type value } }
      custom: metafields(namespace: "custom", first: 20) { nodes { namespace key type value } }
      product {
        id handle title
        metafields(namespace: "custom", first: 20) { nodes { namespace key type value } }
        grosshandel: metafields(namespace: "grosshandel", first: 5) { nodes { namespace key type value } }
      }
    }
  }
}`;

function quellvarianteIdsAus(orders) {
  const ids = new Set();
  for (const o of orders) {
    for (const li of o.lineItems?.nodes ?? []) {
      const wert = (li.customAttributes ?? []).find(a => a.key === '_Quellvariante_ID')?.value;
      if (!wert) continue;
      const id = /^\d+$/.test(String(wert).trim()) ? `gid://shopify/ProductVariant/${String(wert).trim()}` : String(wert).trim();
      ids.add(id);
    }
  }
  return [...ids];
}

async function teilBestellungen(dir) {
  const { erzeugeProxy } = await import('../sync/zugang.mjs');
  const { fetchOrdersSince } = await import('../sync/orders.mjs');
  const { proxy, art } = await erzeugeProxy();
  if (art === 'sammeln') throw new Error('Kein Zugang in .env.local (SHOPIFY_ADMIN_TOKEN oder SHOPIFY_CLIENT_ID/SECRET) - --input mit MCP-Export nutzen');

  // Fenster gross genug, um sicher auf LETZTE_BESTELLUNGEN Bestellungen zu
  // kommen, auch bei ruhigen Phasen; danach auf die zuletzt aktualisierten kuerzen.
  const seit = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
  const { orders: alle } = await fetchOrdersSince(proxy, seit);
  const orders = alle
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, LETZTE_BESTELLUNGEN);

  const ids = quellvarianteIdsAus(orders);
  let quellvarianten = [];
  if (ids.length) {
    const antwort = await proxy.execute(QUELLVARIANTEN_QUERY, { ids });
    quellvarianten = (antwort?.nodes ?? []).filter(Boolean);
  }

  const ziel = path.join(dir, 'bestelluebersicht', 'orders.json');
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, JSON.stringify({ exportiertAm: new Date().toISOString(), orders, quellvarianten }, null, 2));
  return { anzahl: orders.length, hinweis: `${quellvarianten.length}/${ids.length} Quellvarianten der Muster geladen` };
}

export const TEIL_FN = { lexikon: teilLexikon, bestellungen: teilBestellungen, kennzahlen: teilKennzahlen };

/**
 * @param {object} opt
 * @param {string[]|null} opt.nur  Teilmenge aus TEILE, sonst alle.
 * @param {string} opt.dir  Zielverzeichnis ($TP_PRIVAT_DIR).
 * @param {object} opt.teilFn  Ueberschreibbare Teil-Implementierungen (Tests).
 */
export async function aktualisiere({ nur = null, dir = privatDir(), teilFn = TEIL_FN } = {}) {
  const auszufuehren = nur && nur.length ? nur : TEILE;
  const ergebnisse = [];
  for (const teil of auszufuehren) {
    // eslint-disable-next-line no-await-in-loop -- Teile laufen absichtlich nacheinander (ein Fehler darf die anderen nicht verhindern, aber parallele Bulk-Operationen gegen dieselbe Admin API sind nicht noetig).
    ergebnisse.push(await fuehreAus(teil, () => teilFn[teil](dir)));
  }

  // Bestehenden Stand mit uebernehmen, damit Teile, die diesmal nicht liefen
  // (z. B. --nur lexikon), ihren letzten bekannten Stand behalten.
  const statusDatei = path.join(dir, 'aktualisierung.json');
  let bestehend = { teile: {} };
  try { bestehend = JSON.parse(fs.readFileSync(statusDatei, 'utf8')); } catch { /* erster Lauf oder defekt - neu anlegen */ }
  const teileStatus = { ...(bestehend.teile || {}) };
  for (const r of ergebnisse) {
    teileStatus[r.teil] = { zeitpunkt: r.zeitpunkt, dauerMs: r.dauerMs, erfolg: r.erfolg, anzahl: r.anzahl, meldung: r.meldung };
  }
  const status = { aktualisiertAm: new Date().toISOString(), teile: teileStatus };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statusDatei, JSON.stringify(status, null, 2));
  return { statusDatei, status, ergebnisse };
}

async function main() {
  const a = argumente(process.argv.slice(2));
  if (a.hilfe) {
    console.log('npm run daten:aktualisieren -- [--nur lexikon|bestellungen|kennzahlen[,...]] [--privat-dir <pfad>]');
    return;
  }
  const dir = privatDir(a.privatDir);
  const { statusDatei, ergebnisse } = await aktualisiere({ nur: a.nur, dir });
  console.log(`Aktualisierung: ${statusDatei}`);
  let fehlerAnzahl = 0;
  for (const r of ergebnisse) {
    if (r.erfolg) console.log(`  ${r.teil}: OK · ${r.anzahl ?? '?'} Datensaetze · ${r.dauerMs}ms${r.meldung ? ` · ${r.meldung}` : ''}`);
    else { fehlerAnzahl += 1; console.log(`  ${r.teil}: FEHLER · ${r.meldung}`); }
  }
  if (fehlerAnzahl) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(`Fehler: ${err.message}`); process.exit(1); });
}
