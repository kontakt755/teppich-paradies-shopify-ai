#!/usr/bin/env node
/**
 * Bestelluebersicht als eigenstaendige HTML-Datei ausserhalb des Repositorys.
 *
 *   npm run ops:bestelluebersicht -- --input <orders.json> [--output <datei.html>]
 *   npm run ops:bestelluebersicht -- --live [--tage 60] [--output <datei.html>]
 *
 * --input: Export aus der Admin API ({orders:[...], quellvarianten?:[...]}
 * oder die rohe Antwort {data:{orders:{nodes}}}).
 * --live: liest ueber operations/sync/orders.mjs (Token aus .env.local,
 * siehe domains/shopify/admin-token-oauth.md, Scope read_orders).
 * Schreibt nie nach Shopify und nie ins Repository.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aufbereiten, renderHtml } from '../lib/bestelluebersicht.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STANDARD_AUSGABE = path.join(os.homedir(), 'teppich-paradies-analyse', 'bestelluebersicht', 'bestelluebersicht.html');

export function argumente(argv) {
  const a = { input: null, output: STANDARD_AUSGABE, live: false, tage: 60 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--input') a.input = argv[++i];
    else if (k === '--output') a.output = argv[++i];
    else if (k === '--live') a.live = true;
    else if (k === '--tage') a.tage = Number(argv[++i]);
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  if (!a.hilfe && !a.input && !a.live) throw new Error('--input <datei> oder --live angeben');
  if (!(a.tage > 0)) throw new Error('--tage muss > 0 sein');
  return a;
}

/** Die Ausgabe enthaelt Bestelldaten: nie innerhalb des Repositorys. */
export function pruefeAusgabe(datei, repo = REPO) {
  const abs = path.resolve(datei);
  const rel = path.relative(repo, abs);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    throw new Error(`Ausgabe liegt im Repository (${rel}) - Bestelldaten gehoeren nicht ins Repo`);
  }
  return abs;
}

export function ladeExport(text) {
  const j = JSON.parse(text);
  if (Array.isArray(j)) return { orders: j };
  if (j?.data?.orders) return { orders: j.data.orders.nodes ?? [], quellvarianten: j.quellvarianten ?? [] };
  if (Array.isArray(j?.orders)) return j;
  if (Array.isArray(j?.orders?.nodes)) return { ...j, orders: j.orders.nodes };
  throw new Error('Eingabe hat kein orders-Feld');
}

async function ladeLive(tage) {
  const { erzeugeProxy } = await import('../sync/zugang.mjs');
  const { fetchOrdersSince } = await import('../sync/orders.mjs');
  const { proxy, art } = await erzeugeProxy();
  if (art === 'sammeln') throw new Error('Kein Zugang in .env.local (SHOPIFY_ADMIN_TOKEN oder SHOPIFY_CLIENT_ID/SECRET) - --input mit MCP-Export nutzen');
  const seit = new Date(Date.now() - tage * 86400000).toISOString();
  const r = await fetchOrdersSince(proxy, seit);
  return { orders: r.orders };
}

async function main() {
  const a = argumente(process.argv.slice(2));
  if (a.hilfe) {
    console.log('npm run ops:bestelluebersicht -- --input <orders.json> | --live [--tage 60] [--output <datei.html>]');
    return;
  }
  const ausgabe = pruefeAusgabe(a.output);
  const daten = a.live ? await ladeLive(a.tage) : ladeExport(fs.readFileSync(a.input, 'utf8'));
  const modell = aufbereiten(daten);
  fs.mkdirSync(path.dirname(ausgabe), { recursive: true });
  fs.writeFileSync(ausgabe, renderHtml(modell));
  const z = modell.zahlen;
  console.log(`Bestelluebersicht: ${ausgabe}`);
  console.log(`Auftraege ${z.auftraege} (offen ${z.offeneAuftraege}) · Positionen ${z.positionen} · zu bestellen ${z.zuBestellen} · Muster ${z.muster} · ohne Grosshaendler-ID ${z.ohneId} · Menge UNGEKLAERT ${z.mengeUngeklaert}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(`Fehler: ${err.message}`); process.exit(1); });
}
