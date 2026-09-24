#!/usr/bin/env node
/**
 * Shop-Wache ausfuehren:
 *
 *   npm run shop:wache                 # prueft den Live-Shop, schreibt das Ergebnis
 *   npm run shop:wache -- --basis https://…   # anderer Shop (Vorschau/Test)
 *   npm run shop:wache -- --stichproben 5     # so viele Produktpreise vergleichen
 *
 * Ergebnis: $TP_PRIVAT_DIR/shopwache/status.json - das Control Center liest
 * genau diese Datei. Es werden nur oeffentliche Seiten abgerufen, keine
 * Anmeldung, kein Schreibzugriff.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruefe } from '../lib/shopwache.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STANDARD_BASIS = 'https://www.teppich-paradies.net';

export function privatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

export function argumente(argv) {
  const a = { basis: STANDARD_BASIS, stichproben: 3, ziel: null, hilfe: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--basis') a.basis = argv[++i];
    else if (k === '--stichproben') a.stichproben = Number(argv[++i]);
    else if (k === '--ziel') a.ziel = argv[++i];
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  if (!Number.isFinite(a.stichproben) || a.stichproben < 0) throw new Error('--stichproben muss eine Zahl >= 0 sein');
  return a;
}

/** Ziel darf nie im Repository liegen (gleiche Regel wie bei den anderen Exporten). */
export function pruefeZiel(datei, repo = REPO) {
  const abs = path.resolve(datei);
  const rel = path.relative(repo, abs);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) throw new Error(`Ziel liegt im Repository (${rel})`);
  return abs;
}

/**
 * Stichproben aus dem Lexikon-Export: aktive Produkte mit hinterlegtem Preis.
 * Genommen wird der Shopify-Listenpreis der ersten Variante - genau der Wert,
 * den die Produktseite ausweist. Ohne Export bleibt die Liste leer statt zu raten.
 */
export function stichprobenAus(lexikon, anzahl) {
  const produkte = (lexikon?.produkte ?? []).filter(p => p.status === 'ACTIVE' && !p.handle?.startsWith('muster-'));
  const mitPreis = produkte
    .map(p => ({ handle: p.handle, preis: p.varianten?.find(v => typeof v.preis === 'number')?.preis ?? null }))
    .filter(p => p.handle && p.preis !== null);
  // Gleichmaessig ueber die Liste verteilt statt immer dieselben ersten drei.
  const schritt = Math.max(1, Math.floor(mitPreis.length / Math.max(1, anzahl)));
  const raus = [];
  for (let i = 0; i < mitPreis.length && raus.length < anzahl; i += schritt) raus.push(mitPreis[i]);
  return raus;
}

/** fetch mit Zeitgrenze - ein haengender Shop darf den Lauf nicht blockieren. */
async function holen(url, { zeitgrenzeMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), zeitgrenzeMs);
  try {
    return await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'teppich-paradies-shopwache' } });
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const a = argumente(process.argv.slice(2));
  if (a.hilfe) {
    console.log('npm run shop:wache -- [--basis <url>] [--stichproben <n>] [--ziel <datei>]');
    return;
  }
  const dir = privatDir();
  const ziel = pruefeZiel(a.ziel || path.join(dir, 'shopwache', 'status.json'));
  let lexikon = null;
  try { lexikon = JSON.parse(fs.readFileSync(path.join(dir, 'lexikon', 'produkte.json'), 'utf8')); } catch { lexikon = null; }
  const stichproben = stichprobenAus(lexikon, a.stichproben);

  const ergebnis = await pruefe(holen, { basis: a.basis, stichproben });
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, JSON.stringify(ergebnis, null, 2));

  console.log(`Shop-Wache: ${ergebnis.ampel.toUpperCase()} · ${ergebnis.kritisch} kritisch, ${ergebnis.warnungen} Warnungen · ${ziel}`);
  for (const b of ergebnis.befunde) console.log(`  [${b.art}] ${b.titel}: ${b.text}`);
  if (!stichproben.length) console.log('  (keine Preisstichprobe - Lexikon-Export fehlt)');
  process.exitCode = ergebnis.kritisch ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(`Fehler: ${err.message}`); process.exit(1); });
}
