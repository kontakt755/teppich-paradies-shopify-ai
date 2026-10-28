#!/usr/bin/env node
/**
 * Muster -> Kauf: Wie viele Musterkunden kaufen binnen 30 Tagen Ware?
 * (Fehlersuche 2026-10-28, Idee 17) - nur lesend.
 *
 *   npm run -s muster:kauf                          # Muster der letzten 90 Tage, Kauffenster 30 Tage
 *   npm run -s muster:kauf -- --tage 60 --nach 14
 *   npm run -s muster:kauf -- --input <bestellungen.json>   # Export ueber den Shopify-MCP
 *   npm run -s muster:kauf -- --json <datei>        # Ergebnis zusaetzlich als JSON (ausserhalb des Repos)
 *
 * Regeln: operations/lib/muster-kauf.mjs. Gibt nur Zahlen aus, keine Namen
 * oder Adressen. Live braucht einen Zugang mit read_orders
 * (operations/sync/zugang.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { musterKauf } from '../lib/muster-kauf.mjs';
import { pruefeZiel } from './kennzahlen-export.mjs';

const TAG_MS = 24 * 60 * 60 * 1000;

export function argumente(argv) {
  const a = { tage: 90, nach: 30, input: null, json: null, hilfe: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--tage') a.tage = Number(argv[++i]);
    else if (k === '--nach') a.nach = Number(argv[++i]);
    else if (k === '--input') a.input = argv[++i];
    else if (k === '--json') a.json = argv[++i];
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  if (!(a.tage > 0) || !(a.nach > 0)) throw new Error('--tage und --nach muessen > 0 sein');
  return a;
}

async function ladeLive(tage) {
  const { erzeugeProxy, KEIN_ZUGANG } = await import('../sync/zugang.mjs');
  const { fetchOrdersSince } = await import('../sync/orders.mjs');
  const { proxy, art } = await erzeugeProxy();
  if (art === 'sammeln') throw new Error(`${KEIN_ZUGANG} (Ausweichweg: --input mit einem MCP-Export)`);
  // updated_at >= created_at: alles, was im Zeitraum angelegt wurde, ist dabei.
  const r = await fetchOrdersSince(proxy, new Date(Date.now() - tage * TAG_MS).toISOString());
  return r.orders;
}

export function bericht(e) {
  const zeile = (name, z) => {
    const quote = z.quote === null ? '–' : `${z.quote} %`;
    const offen = z.fensterOffen ? ` · Fenster offen: ${z.fensterOffen} (davon ${z.kaufOffen} schon gekauft)` : '';
    const dauer = z.medianTage === null ? '' : ` · Median ${z.medianTage} Tage bis zum Kauf`;
    return `${name.padEnd(18)} ${String(z.musterkunden).padStart(4)} Musterkunden · reif ${z.reif}, davon gekauft ${z.kaufReif} = ${quote}${offen}${dauer}`;
  };
  const kopf = `Muster -> Kauf: Musterbestellungen ${e.zeitraum.von.slice(0, 10)} bis ${e.zeitraum.bis.slice(0, 10)}, Kauf binnen ${e.zeitraum.nachTagen} Tagen`;
  return [
    kopf,
    zeile('Gesamt', e.gesamt),
    ...Object.entries(e.gruppen).map(([k, z]) => zeile(k, z)),
    `Gekaufte Warengruppen: ${Object.entries(e.gesamt.gekauft).map(([k, n]) => `${k} ${n}`).join(', ') || 'keine'}`,
    `Bestellungen: ${e.bestellungen.geprueft} gelesen, ${e.bestellungen.gezaehlt} ohne Storno/Test; ${e.bestellungen.musterOhneKunde} Musterbestellungen ohne Kunde/E-Mail nicht zuordenbar`,
  ].join('\n');
}

async function main() {
  const a = argumente(process.argv.slice(2));
  if (a.hilfe) { console.log('npm run -s muster:kauf -- [--tage 90] [--nach 30] [--input datei] [--json datei]'); return; }
  let orders;
  if (a.input) {
    const d = JSON.parse(fs.readFileSync(a.input, 'utf8'));
    orders = d.orders ?? d.data?.orders?.nodes ?? d;
  } else {
    // Muster der letzten `tage` Tage plus deren Kauffenster bis heute.
    orders = await ladeLive(a.tage);
  }
  const e = musterKauf(orders, { tage: a.tage, nachTagen: a.nach });
  console.log(bericht(e));
  if (a.json) {
    const ziel = pruefeZiel(a.json);
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, JSON.stringify(e, null, 2));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`Fehler: ${err.message}`); process.exit(1); });
}
