#!/usr/bin/env node
/**
 * Waechter gegen fremde Spiegelseiten des Shops (Befund 24.11.2026: die Domain .live
 * spiegelt den Shop ueber einen Proxy, Gegenmassnahme ist snippets/tp-host-sperre.liquid).
 * Taeglich, ohne KI (launchd net.teppich-paradies.spiegel-waechter). Nur lesende GET-Abrufe.
 *
 *   node operations/scripts/spiegel-waechter.mjs            # pruefen, Status + To-do bei neuem Befund
 *   node operations/scripts/spiegel-waechter.mjs --trocken  # nur anzeigen
 *
 * Befunde: "sperre-weg"   bekannte Spiegelseite zeigt den Shop, aber ohne Host-Sperre (dringend)
 *          "neue-spiegel" ein unbekannter Host liefert unseren Shop
 * Eine bekannte Spiegelseite MIT Sperre ist ruhig (die Sperre wirkt, Meldung ist Sache des Inhabers).
 */
import fs from 'node:fs';
import { promises as dns } from 'node:dns';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { privatDir, schreibStatus } from '../lib/routinen.mjs';
import { mitteilung } from '../lib/mac-mitteilung.mjs';

export const TITEL = 'Fremde Spiegelseite des Shops';
export const SHOP = 'sjjyq1-6w.myshopify.com';
const NAME = 'teppich-paradies';
// Bekannte Spiegelseite (Befund 24.11.): hier ist nur das Fehlen der Sperre ein Alarm.
export const BEKANNT = ['www.teppich-paradies.live', 'teppich-paradies.live'];
const KANDIDATEN = ['shop', 'store', 'online', 'de', 'com', 'live'];
// Erkennungsmerkmal aus snippets/tp-host-sperre.liquid (Domain steht dort nur zerlegt).
export const SPERRE_MERKMAL = "split('').reverse";

export function kandidatenHosts() {
  const h = [];
  for (const t of KANDIDATEN) h.push(`www.${NAME}.${t}`, `${NAME}.${t}`);
  return [...new Set([...BEKANNT, ...h])];
}

/** Reine Auswertung einer Antwort: zeigt der Host unseren Shop, und steht die Sperre im HTML? */
export function bewerte({ header, html }) {
  const gespiegelt = /shopify/i.test(header || '')
    && new RegExp(`Shopify\\.shop\\s*=\\s*["']${SHOP.replace(/\./g, '\\.')}["']`).test(html || '');
  return { gespiegelt, sperre: (html || '').includes(SPERRE_MERKMAL) };
}

/** Befunde aus {host, gespiegelt, sperre}-Zeilen. */
export function befunde(zeilen) {
  const r = [];
  for (const z of zeilen) {
    if (!z.gespiegelt) continue;
    if (!BEKANNT.includes(z.host)) r.push({ art: `neue-spiegel:${z.host}`, text: `${z.host} liefert unseren Shop (${z.sperre ? 'mit' : 'OHNE'} Host-Sperre)` });
    else if (!z.sperre) r.push({ art: `sperre-weg:${z.host}`, text: `DRINGEND: ${z.host} spiegelt den Shop und die Host-Sperre fehlt im HTML` });
  }
  return r;
}

async function holen(host) {
  try { await dns.resolve4(host); } catch { return null; } // keine DNS-Adresse = nichts zu spiegeln
  try {
    const res = await fetch(`https://${host}/`, { redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'Mozilla/5.0 (tp-spiegel-waechter)' } });
    return { host, ...bewerte({ header: res.headers.get('powered-by'), html: await res.text() }) };
  } catch { return { host, gespiegelt: false, sperre: false, fehler: true }; }
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const env = deps.env || process.env;
  const aus = deps.aus || console.log;
  const jetzt = deps.jetzt || new Date();
  const abruf = deps.abruf || holen;
  const unbekannt = argv.filter(a => a !== '--trocken');
  if (unbekannt.length) { (deps.fehler || console.error)(`Unbekanntes Argument: ${unbekannt.join(' ')}`); return 2; }
  const zeilen = (await Promise.all(kandidatenHosts().map(abruf))).filter(Boolean);
  const b = befunde(zeilen);
  const art = b.map(x => x.art).sort().join(',') || 'ruhig';
  const meldung = b.length ? b.map(x => x.text).join('; ') : `ruhig (${zeilen.filter(z => z.gespiegelt).length} bekannte Spiegelseite(n) mit Sperre)`;
  aus(`${jetzt.toISOString()} Spiegel-Waechter: ${b.length ? 'BEFUND' : 'ok'} – ${meldung}`);
  if (!argv.includes('--trocken')) {
    const { mitteilen } = schreibStatus(privatDir(env), 'spiegel-waechter', { ok: !b.length, art: b.length ? art : undefined, meldung }, jetzt);
    if (mitteilen) {
      (deps.melde || mitteilung)(TITEL, meldung);
      (deps.todo || todoAnlegen)(meldung, b.some(x => x.art.startsWith('sperre-weg')));
    }
  }
  return b.length ? 1 : 0;
}

function todoAnlegen(meldung, dringend) {
  const wurzel = fileURLToPath(new URL('../..', import.meta.url));
  execFileSync(process.execPath, ['scripts/task.mjs', 'create', `Spiegelseite: ${meldung}`.slice(0, 200),
    '--area', 'sonstiges', '--type', 'technik', '--prio', dringend ? 'p0' : 'p1',
    '--body', 'Gefunden vom taeglichen Spiegel-Waechter (operations/scripts/spiegel-waechter.mjs). Gegenmassnahme: snippets/tp-host-sperre.liquid; Meldungen an Cloudflare, Dynadot, Shopify, Google: Werkbank w-422.'],
  { cwd: wurzel, stdio: 'inherit' });
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  main().then(c => { process.exitCode = c; });
}
