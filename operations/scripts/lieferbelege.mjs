#!/usr/bin/env node
/**
 * Lieferantenbelege aus dem Firmenpostfach uebernehmen (Inhaber 2026-10-19: ABs, Lieferscheine,
 * Storno - wo kommen sie, wurde es abgehakt, ist es mit Shopify synchron).
 *
 *   npm run -s belege -- bekannt                                     # JSON: Mail-IDs, Absenderdomains, letzter Lauf
 *   npm run -s belege -- uebernehmen --datei <json> [--bereiche label,lieferant,stichwort] [--unvollstaendig]
 *
 * Der Dashboard-Dienst liest kein Postfach. Das tut der geplante Claude-Lauf
 * "lieferbelege-postfach" (nur lesend ueber Gmail): `bekannt` liefert, was schon da ist und
 * nach welchen Absendern er suchen soll; der Lauf legt neue Mails als JSON in sein Scratchpad -
 * [{ id, threadId, von, datum, betreff, text, anhaenge, quelle, viewUrl }] - und ruft
 * `uebernehmen`. Erkannt und gespeichert wird nur hier (docs/ai-dashboard/lib/lieferbelege.mjs);
 * in auftragsstatus.json wird nie geschrieben. Die Ausgabe nennt nur Zahlen und Belegarten,
 * keine Namen.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bekannt, uebernehmen, LieferbelegFehler } from '../lib/lieferbelege.mjs';
import { leseStammdaten, stammdatenPfad } from '../lib/lieferanten.mjs';
import { domainVon, FREEMAIL } from '../../docs/ai-dashboard/lib/lieferbelege.mjs';

/** Absenderdomains der hinterlegten Lieferanten (Stammdaten), ohne allgemeine Mailanbieter. */
export function lieferantenDomains(privatDir) {
  const st = leseStammdaten(stammdatenPfad(privatDir));
  const domains = new Set();
  for (const l of Object.values(st.lieferanten || {})) {
    for (const d of [...(l.postfachDomains || []), domainVon(l.ware?.mail), domainVon(l.muster?.mail)]) {
      if (d && !FREEMAIL.includes(d)) domains.add(d);
    }
  }
  return [...domains].sort();
}

function argWert(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? '' : null;
}

async function main(argv) {
  const [befehl, ...rest] = argv;
  const privatDir = process.env.TP_PRIVAT_DIR || undefined;
  if (befehl === 'bekannt') {
    console.log(JSON.stringify(bekannt({ privatDir, domains: lieferantenDomains(privatDir) })));
    return 0;
  }
  if (befehl === 'uebernehmen') {
    const datei = argWert(rest, '--datei');
    if (!datei) { console.error('--datei <json> fehlt'); return 2; }
    let mails;
    try { mails = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch (e) { console.error(`Datei nicht lesbar: ${e.message}`); return 2; }
    if (!Array.isArray(mails)) { console.error('Die Datei muss eine JSON-Liste sein'); return 2; }
    const bereiche = (argWert(rest, '--bereiche') || '').split(',').map(s => s.trim()).filter(Boolean);
    const e = uebernehmen(mails, { privatDir, lieferantenDomains: lieferantenDomains(privatDir), lauf: { bereiche, vollstaendig: !rest.includes('--unvollstaendig') } });
    const arten = {};
    for (const n of e.neu) arten[n.art] = (arten[n.art] || 0) + 1;
    const gruende = {};
    for (const u of e.uebersprungen) gruende[u.grund] = (gruende[u.grund] || 0) + 1;
    console.log(JSON.stringify({ neu: e.neu.length, arten, uebersprungen: e.uebersprungen.length, gruende }));
    return 0;
  }
  console.error('Befehle: bekannt | uebernehmen --datei <json> [--bereiche a,b] [--unvollstaendig]');
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => process.exit(code)).catch((e) => {
    console.error(e instanceof LieferbelegFehler ? e.message : (e?.stack || e?.message || String(e)));
    process.exit(1);
  });
}
