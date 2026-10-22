#!/usr/bin/env node
/**
 * Bestandsabgleich Lieferant I (Dropshipping-Teppiche): laedt die taegliche
 * Bestandsdatei des Lieferanten und setzt den Shopify-Bestand jeder Variante
 * (SKU = Artikelnummer, Barcode = EAN) am eigenen Standort.
 *
 *   npm run -s bestand:abgleich               # nur planen, nichts schreiben
 *   npm run -s bestand:abgleich -- --schreiben
 *   npm run -s bestand:abgleich -- --datei <csv> [--schreiben]
 *
 * Konfiguration in .env.local (Klarname und URL nie im Repository):
 *   TP_LIEFERANT_I_BESTAND_URL   feste URL der Bestandsdatei (CSV, Semikolon)
 *   TP_LIEFERANT_I_VENDOR        Shopify-Vendor der Produkte
 * Zugang wie alle Dienste: operations/sync/zugang.mjs (write_inventory).
 *
 * Schutz: zu kurze Datei, viele fehlende Varianten oder mehr als die Haelfte
 * auf 0 -> Abbruch ohne Schreiben (Exit 2). Geschrieben wird mit
 * changeFromQuantity; hat sich ein Wert seit dem Lesen geaendert (Bestellung),
 * lehnt Shopify ab und der naechste Lauf gleicht nach.
 * Status: ~/teppich-paradies-analyse/lieferant-i/bestand-status.json
 * Doku: domains/lieferanten/lieferant-i.md
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ladeEnvLocal, hatZugangsdaten, KEIN_ZUGANG, erzeugeProxy } from '../sync/zugang.mjs';
import { wartenBeiThrottle } from '../sync/orders.mjs';
import { leseBestandCsv, planeAbgleich, bauePakete } from '../lib/lieferanten-bestand.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STATUS_DATEI = path.join(os.homedir(), 'teppich-paradies-analyse', 'lieferant-i', 'bestand-status.json');

const VARIANTEN_QUERY = `query($q: String!, $after: String) {
  productVariants(first: 250, after: $after, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { sku barcode inventoryItem { id tracked inventoryLevels(first: 3) { nodes { location { id } quantities(names: ["available"]) { quantity } } } } }
  }
}`;

const STANDORT_QUERY = `{ locations(first: 5) { nodes { id isActive } } }`;

const SETZEN = `mutation($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) { userErrors { code field message } }
}`;

export function argumente(argv) {
  const a = { schreiben: false, datei: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--schreiben') a.schreiben = true;
    else if (argv[i] === '--datei') a.datei = argv[++i];
    else throw new Error(`Unbekanntes Argument: ${argv[i]}`);
  }
  return a;
}

async function ladeVarianten(proxy, vendor, locationId) {
  const varianten = [];
  let after = null;
  for (;;) {
    const data = await proxy.execute(VARIANTEN_QUERY, { q: `vendor:'${vendor}'`, after });
    const conn = data.productVariants;
    for (const n of conn.nodes) {
      if (!n.sku || !n.inventoryItem?.tracked) continue;
      const level = n.inventoryItem.inventoryLevels.nodes.find((l) => l.location.id === locationId);
      varianten.push({ sku: n.sku, barcode: n.barcode || '', inventoryItemId: n.inventoryItem.id, verfuegbar: level?.quantities?.[0]?.quantity ?? 0 });
    }
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
    await wartenBeiThrottle(proxy);
  }
  return varianten;
}

function schreibeStatus(status) {
  fs.mkdirSync(path.dirname(STATUS_DATEI), { recursive: true });
  fs.writeFileSync(STATUS_DATEI, JSON.stringify(status, null, 2));
}

async function main() {
  const a = argumente(process.argv.slice(2));
  const env = { ...ladeEnvLocal(process.env.TP_ENV_LOCAL || path.join(REPO, '.env.local')), ...process.env };
  const vendor = env.TP_LIEFERANT_I_VENDOR;
  const url = env.TP_LIEFERANT_I_BESTAND_URL;
  if (!vendor || (!url && !a.datei)) throw new Error('TP_LIEFERANT_I_VENDOR und TP_LIEFERANT_I_BESTAND_URL in .env.local setzen (oder --datei)');
  if (!hatZugangsdaten(env)) throw new Error(KEIN_ZUGANG);

  let text;
  if (a.datei) text = fs.readFileSync(a.datei, 'latin1');
  else {
    const antwort = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!antwort.ok) throw new Error(`Bestandsdatei HTTP ${antwort.status}`);
    text = new TextDecoder('latin1').decode(await antwort.arrayBuffer());
  }
  const bestand = leseBestandCsv(text);

  const { proxy } = await erzeugeProxy({ env });
  const standort = (await proxy.execute(STANDORT_QUERY)).locations.nodes.find((l) => l.isActive);
  const varianten = await ladeVarianten(proxy, vendor, standort.id);
  const plan = planeAbgleich(bestand, varianten);

  const status = {
    zeit: new Date().toISOString(), modus: a.schreiben ? 'schreiben' : 'planen',
    dateiArtikel: bestand.zeilen, varianten: plan.varianten, aenderungen: plan.aenderungen.length,
    ausverkauft: plan.aufNull, fehlendInDatei: plan.fehlend.length, sperre: plan.sperre, fehler: [],
  };
  console.log(`Datei ${bestand.zeilen} Artikel, Shop ${plan.varianten} Varianten, ${plan.aenderungen.length} Aenderungen, ${plan.aufNull} ausverkauft, ${plan.fehlend.length} nicht in der Datei`);
  if (plan.sperre) {
    status.fehler.push(plan.sperre);
    schreibeStatus(status);
    console.error(`ABBRUCH ohne Schreiben: ${plan.sperre}`);
    process.exit(2);
  }
  if (a.schreiben) {
    for (const input of bauePakete(plan.aenderungen, standort.id)) {
      const data = await proxy.execute(SETZEN, { input });
      for (const f of data.inventorySetQuantities.userErrors) status.fehler.push(`${f.code || ''} ${f.message}`.trim());
      await wartenBeiThrottle(proxy);
    }
  } else {
    for (const x of plan.aenderungen.slice(0, 10)) console.log(`  ${x.sku}: ${x.von} -> ${x.auf}`);
  }
  schreibeStatus(status);
  if (status.fehler.length) {
    console.error(`${status.fehler.length} Fehler beim Schreiben, z. B. ${status.fehler[0]}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
