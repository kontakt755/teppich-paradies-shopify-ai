#!/usr/bin/env node
/**
 * Muster nachfassen - automatischer Versand (Inhaberentscheidung w-119 vom 2026-10-16, Option A).
 *
 *   npm run -s muster:nachfassen            # faellige Nachfragen verschicken (taeglich, LaunchAgent)
 *   npm run -s muster:nachfassen -- --probe # Trockenlauf: nur zeigen, was verschickt wuerde
 *
 * Wer dran ist, rechnet docs/ai-dashboard/lib/muster-nachfassen.mjs aus den Bestelldaten
 * (erste Nachfrage 4 Tage nach Versand, eine Erinnerung 10 Tage spaeter, Stopp nach 30 Tagen
 * oder nach Kauf). Den Lauf selbst macht scripts/dashboard-api.mjs (kundenNachfassenSenden):
 * Text aus $TP_PRIVAT_DIR/muster-nachfassen-texte.md, Versand ueber das Firmenpostfach aus
 * $TP_PRIVAT_DIR/nachfassen/postfach.json, danach der Zeitleisten-Schritt "nachgefasst"
 * (von: automatisch). Fehlt das Postfach, wird nichts verschickt (Exit 2).
 *
 * In der ersten Woche nach dem ersten echten Versand geht jede Mail als Blindkopie ans Buero.
 * Kunden auf der Stoppliste ($TP_PRIVAT_DIR/nachfassen/stoppliste.json) werden uebersprungen.
 *
 * Ausgabe: eine Zeile je Kunde - nur Bestellnummer, Stufe und Adresse. Das Protokoll landet
 * im Privatordner (LaunchAgent), nie im Repository.
 */

import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createApi } from './dashboard-api.mjs';

function argumente(argv) {
  const a = { probe: false, hilfe: false };
  for (const k of argv) {
    if (k === '--probe') a.probe = true;
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  return a;
}

const zeit = iso => new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

export function bericht(r) {
  const zeilen = [];
  const kopf = r.probe ? 'Trockenlauf – es wird nichts verschickt' : 'Versandlauf';
  zeilen.push(`${kopf} (${zeit(new Date().toISOString())})`);
  // Echter Lauf ohne Vorlage/Postfach/lesbare Stoppliste: ein Satz, der sagt, was fehlt.
  if (r.status !== 'ok' && !r.probe) { zeilen.push(`Nichts verschickt: ${r.hinweis || r.status}`); return zeilen; }
  if (r.kopie) zeilen.push(`Blindkopie an: ${r.kopie}`);
  for (const e of r.geplant) zeilen.push(`  würde senden   ${e.orderName}  ${e.stufe === 'erinnerung' ? 'Erinnerung' : 'Erste Nachfrage'}  an ${e.an}  „${e.betreff}“`);
  for (const e of r.verschickt) zeilen.push(`  verschickt     ${e.orderName}  ${e.stufe === 'erinnerung' ? 'Erinnerung' : 'Erste Nachfrage'}  an ${e.an}`);
  for (const e of r.nachgetragen) zeilen.push(`  nachgetragen   ${e.orderName}  (Mail war schon raus am ${zeit(e.am)}, nur Zeitleiste)`);
  for (const e of r.uebersprungen) zeilen.push(`  übersprungen   ${e.orderName}  ${e.grund}`);
  for (const e of r.fehler) zeilen.push(`  FEHLER         ${e.orderName}  ${e.fehler}`);
  const n = r.probe ? r.geplant.length : r.verschickt.length;
  zeilen.push(r.status === 'ok' || r.probe
    ? `${r.probe ? 'Anstehend' : 'Verschickt'}: ${n} · übersprungen: ${r.uebersprungen.length} · Fehler: ${r.fehler.length}${r.status !== 'ok' ? ` · ${r.hinweis}` : ''}`
    : `Nichts verschickt: ${r.hinweis}`);
  return zeilen;
}

async function main() {
  let a;
  try { a = argumente(process.argv.slice(2)); } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (a.hilfe) {
    console.log('npm run -s muster:nachfassen [-- --probe]\n  --probe  nur zeigen, was verschickt würde');
    return;
  }
  const api = createApi({ gh: async () => '' });
  const r = await api.kundenNachfassenSenden({ probe: a.probe });
  for (const z of bericht(r)) console.log(z);
  if (r.status !== 'ok') process.exitCode = 2;
  else if (r.fehler.length) process.exitCode = 1;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`Versandlauf abgebrochen: ${e?.message || e}`); process.exit(1); });
}
