#!/usr/bin/env node
/**
 * Bildrechte-Inventur: liest alle Produktbilder aus Shopify (nur lesend) und
 * fuehrt sie mit dem lokalen Bildrechte-Verzeichnis zusammen.
 *
 *   npm run bildrechte:inventur                  # Abruf ueber den Shopify-Zugang (.env.local)
 *   npm run bildrechte:inventur -- --input <produkte.json>   # Abruf aus einer Exportdatei
 *   npm run bildrechte:inventur -- --nur-auswerten           # nichts abrufen, nur zaehlen
 *
 * Ziel: $TP_PRIVAT_DIR/bildrechte/bildrechte.csv (Standard ~/teppich-paradies-analyse).
 * Die vorige Fassung wird daneben als bildrechte.<zeitstempel>.csv gesichert.
 * Von Hand gepflegte Spalten (quelle, lizenz, status, ...) bleiben erhalten;
 * neue Bilder kommen immer als "ungeklaert" hinzu. Konzept:
 * docs/weiterentwicklung/bilder.md.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { alsCsv, ausCsv, auswerten, zeilenAusProdukten, zusammenfuehren } from '../lib/bildrechte.mjs';

const ABFRAGE = `
query BildInventur($first: Int!, $after: String) {
  products(first: $first, after: $after, query: "status:active OR status:draft") {
    pageInfo { hasNextPage endCursor }
    nodes {
      handle title productType
      media(first: 50) { nodes { id ... on MediaImage { alt image { url width height } } } }
    }
  }
}`;

function argument(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const privat = process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
const ziel = argument('--ziel') || path.join(privat, 'bildrechte', 'bildrechte.csv');

async function holeProdukte() {
  const input = argument('--input');
  if (input) {
    const j = JSON.parse(fs.readFileSync(input, 'utf8'));
    return j.produkte ?? j.data?.products?.nodes ?? j.products?.nodes ?? j;
  }
  const { erzeugeProxy, hatZugangsdaten, KEIN_ZUGANG } = await import('../sync/zugang.mjs');
  if (!hatZugangsdaten()) throw new Error(KEIN_ZUGANG);
  const { proxy } = await erzeugeProxy();
  const { wartenBeiThrottle } = await import('../sync/orders.mjs');
  const produkte = [];
  let after = null;
  for (;;) {
    const data = await proxy.execute(ABFRAGE, { first: 50, after });
    const conn = data?.products;
    if (!conn) throw new Error('Antwort ohne products - Zugang pruefen: npm run operations:verbindung');
    produkte.push(...conn.nodes);
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
    await wartenBeiThrottle(proxy);
  }
  return produkte;
}

const vorher = fs.existsSync(ziel) ? ausCsv(fs.readFileSync(ziel, 'utf8')) : [];
let zeilen = vorher;
if (!process.argv.includes('--nur-auswerten')) {
  const produkte = await holeProdukte();
  zeilen = zusammenfuehren(vorher, zeilenAusProdukten(produkte));
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  if (fs.existsSync(ziel)) {
    const stempel = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(ziel, ziel.replace(/\.csv$/, `.${stempel}.csv`));
  }
  fs.writeFileSync(ziel, '﻿' + alsCsv(zeilen));
}

const a = auswerten(zeilen);
console.log(`Bildrechte-Verzeichnis: ${ziel}`);
console.log(`  ${a.bilder} Bilder an ${a.produkte} Produkten`);
console.log(`  ungeklaert:              ${a.ungeklaert}`);
console.log(`  gesperrt:                ${a.gesperrt}`);
console.log(`  schmaler als 1200 px:    ${a.zuKlein}`);
console.log(`  ohne ALT-Text:           ${a.ohneAlt}`);
console.log(`  ohne erkennbaren Bildtyp: ${a.ohneBildtyp}`);
console.log(`  Name nicht nach Schema:  ${a.nameNichtNachSchema}`);
if (a.nichtMehrInShopify) console.log(`  nicht mehr in Shopify:   ${a.nichtMehrInShopify} (Zeilen bleiben mit Notiz erhalten)`);
