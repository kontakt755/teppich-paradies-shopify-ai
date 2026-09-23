#!/usr/bin/env node
/**
 * Shop-Kennzahlen fuer den Startbereich "Heute" des Control Centers.
 *
 *   npm run kennzahlen:export -- --input <bestellungen.json> [--ziel <datei.json>]
 *   npm run kennzahlen:export -- --live [--tage 30] [--ziel <datei.json>]
 *
 * --input: Export aus der Admin API ({data:{orders:{nodes}}} oder {orders:[...]}),
 * z. B. ueber den Shopify-MCP erzeugt. --live braucht einen Token mit
 * read_orders (siehe domains/shopify/admin-token-oauth.md).
 * Die Ausgabe enthaelt Bestelldaten und darf nie im Repository landen.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schnappschuss } from '../lib/kennzahlen.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STANDARD_ZIEL = path.join(os.homedir(), 'teppich-paradies-analyse', 'kennzahlen', 'shop-snapshot.json');

export function argumente(argv) {
  const a = { input: null, ziel: STANDARD_ZIEL, live: false, tage: 30, hilfe: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--input') a.input = argv[++i];
    else if (k === '--ziel') a.ziel = argv[++i];
    else if (k === '--live') a.live = true;
    else if (k === '--tage') a.tage = Number(argv[++i]);
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  if (!a.hilfe && !a.input && !a.live) throw new Error('--input <datei> oder --live angeben');
  if (!(a.tage > 0)) throw new Error('--tage muss > 0 sein');
  return a;
}

/** Bestelldaten gehoeren nicht ins Repository. */
export function pruefeZiel(datei, repo = REPO) {
  const abs = path.resolve(datei);
  const rel = path.relative(repo, abs);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    throw new Error(`Ziel liegt im Repository (${rel}) - Bestelldaten gehoeren nicht ins Repo`);
  }
  return abs;
}

export async function ladeLive(tage) {
  const { erzeugeProxy } = await import('../sync/zugang.mjs');
  const { fetchOrdersSince } = await import('../sync/orders.mjs');
  const { proxy, art } = await erzeugeProxy();
  if (art === 'sammeln') throw new Error('Kein Zugang in .env.local (SHOPIFY_ADMIN_TOKEN oder SHOPIFY_CLIENT_ID/SECRET) - --input mit MCP-Export nutzen');
  const seit = new Date(Date.now() - tage * 24 * 60 * 60 * 1000).toISOString();
  const r = await fetchOrdersSince(proxy, seit);
  return { orders: r.orders };
}

async function main() {
  const a = argumente(process.argv.slice(2));
  if (a.hilfe) {
    console.log('npm run kennzahlen:export -- --input <bestellungen.json> | --live [--tage 30] [--ziel <datei.json>]');
    return;
  }
  const ziel = pruefeZiel(a.ziel);
  const daten = a.live ? await ladeLive(a.tage) : JSON.parse(fs.readFileSync(a.input, 'utf8'));
  const schnapp = schnappschuss(daten);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, JSON.stringify(schnapp, null, 2));
  const z = schnapp.zeitraeume;
  console.log(`Kennzahlen: ${ziel}`);
  for (const [tage, w] of Object.entries(z)) {
    console.log(`${tage} Tage: ${w.bestellungen} Bestellungen · ${w.umsatz} ${w.waehrung} · Schnitt ${w.durchschnitt} ${w.waehrung}` +
      (w.storniert ? ` · ${w.storniert} storniert/unbezahlt nicht gezaehlt` : ''));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(`Fehler: ${err.message}`); process.exit(1); });
}
