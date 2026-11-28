#!/usr/bin/env node
/**
 * Prueft die Zugaenge (operations/lib/zugaenge.mjs), schreibt $TP_PRIVAT_DIR/zugaenge/status.json
 * und zeigt eine Mac-Mitteilung, wenn ein Zugang neu abgelaufen ist.
 *
 *   node operations/scripts/zugaenge-pruefen.mjs [--trocken]
 *
 * --trocken: nichts schreiben, keine Mitteilung.
 */
import os from 'node:os';
import path from 'node:path';
import { pruefeZugaenge, leseStatus, schreibeStatus, statusPfad } from '../lib/zugaenge.mjs';
import { mitteilung } from '../lib/mac-mitteilung.mjs';

const args = process.argv.slice(2);
const unbekannt = args.filter(a => a !== '--trocken');
if (unbekannt.length) {
  console.error(`Unbekannt: ${unbekannt.join(' ')}`);
  process.exit(2);
}
const trocken = args.includes('--trocken');
const privat = process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
const datei = statusPfad(privat);

const { status, neuRot } = pruefeZugaenge({ privat, vorher: leseStatus(datei) });
for (const z of Object.values(status.zugaenge)) {
  console.log(`${status.stand} ${z.zustand.padEnd(6)} ${z.name}${z.zustand === 'rot' ? ` – ${z.handgriff}` : ''}`);
}
if (!trocken) {
  schreibeStatus(datei, status);
  for (const z of neuRot) mitteilung(`Anmeldung nötig: ${z.name}`, z.handgriff);
}
