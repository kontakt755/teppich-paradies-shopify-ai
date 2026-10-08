#!/usr/bin/env node
/**
 * Angebote-Abgleich: haelt den Tag "angebot" an den Produkten deckungsgleich mit
 * dem, was der Shop gerade als Rabatt ANZEIGT. Die Smart-Kollektion "Angebote"
 * (Regel: Tag = angebot) und damit der Menuepunkt folgen dem Tag.
 *
 *   npm run angebote:abgleich                 # Trockenlauf: zeigt nur, was sich aendern wuerde
 *   npm run angebote:abgleich -- --schreiben  # setzt/entfernt den Tag (tagsAdd/tagsRemove)
 *   npm run angebote:abgleich -- --stichtag 2026-11-02   # Regel fuer einen anderen Tag pruefen (nur Trockenlauf)
 *   npm run angebote:abgleich -- --ausgabe <datei.json>  # Handles der Angebote/Nicht-Angebote fuer Stichproben
 *
 * Regel und Herleitung: operations/lib/angebote-abgleich.mjs, docs/weiterentwicklung/angebote.md.
 * Laeuft taeglich kurz nach Mitternacht und nach jeder Angebotswelle (npm run angebot).
 */

import { TAG, aktionAusMetaobjekt, ausAdminKnoten, heuteBerlin, plan } from '../lib/angebote-abgleich.mjs';

const PRODUKTE = `
query AngeboteAbgleich($first: Int!, $after: String) {
  products(first: $first, after: $after, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title productType tags
      collections(first: 30) { nodes { id } }
      aStart: metafield(namespace: "aktion", key: "start") { value }
      aEnde: metafield(namespace: "aktion", key: "ende") { value }
      aKlasse: metafield(namespace: "aktion", key: "klasse") { value }
      variants(first: 100) { nodes { title price compareAtPrice availableForSale selectedOptions { value } } }
    }
  }
}`;

const AKTIONEN = `{ metaobjects(type: "tp_aktion", first: 50) { nodes { fields { key value } } } }`;

const argv = process.argv;
const schreiben = argv.includes('--schreiben');
const stichtagIdx = argv.indexOf('--stichtag');
const heute = stichtagIdx > -1 ? argv[stichtagIdx + 1] : heuteBerlin();
if (schreiben && stichtagIdx > -1) {
  console.error('--stichtag nur im Trockenlauf: geschrieben wird immer fuer heute.');
  process.exit(2);
}

const { erzeugeProxy, hatZugangsdaten, KEIN_ZUGANG } = await import('../sync/zugang.mjs');
const { wartenBeiThrottle } = await import('../sync/orders.mjs');
if (!hatZugangsdaten()) { console.error(KEIN_ZUGANG); process.exit(1); }
const { proxy } = await erzeugeProxy();

// Eine Produktseite kostet bis ~1.300 Punkte (10 Produkte x 100 Varianten + Kollektionen),
// der Eimer fasst 2.000 und fuellt sich mit 100/s. Vor jeder Seite auf genug Budget
// warten; meldet Shopify trotzdem "Throttled", ist das die Bitte zu warten, kein Fehler.
const SEITE = 10;
const BEDARF = 1400;
async function seite(query, variablen) {
  for (let versuch = 0; ; versuch += 1) {
    const status = proxy.requestLog?.at(-1)?.throttleStatus;
    if (status?.restoreRate > 0 && status.currentlyAvailable < BEDARF) {
      await new Promise((r) => setTimeout(r, Math.ceil(((BEDARF - status.currentlyAvailable) / status.restoreRate) * 1000)));
    }
    try {
      return await proxy.execute(query, variablen);
    } catch (err) {
      if (!/Throttled/i.test(String(err?.message)) || versuch >= 3) throw err;
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
}

let aktionen = [];
try {
  const d = await proxy.execute(AKTIONEN, {});
  aktionen = (d?.metaobjects?.nodes ?? []).map(aktionAusMetaobjekt);
} catch (err) {
  // Ohne Lesezugriff auf Metaobjekte fehlen nur zentrale Aktionen - laut sagen statt still weglassen.
  console.warn(`Hinweis: zentrale Aktionen (tp_aktion) nicht lesbar (${String(err.message).slice(0, 120)}). Abgleich nur ueber Streichpreise.`);
}

const produkte = [];
let after = null;
for (;;) {
  const d = await seite(PRODUKTE, { first: SEITE, after });
  const conn = d?.products;
  if (!conn) throw new Error('Antwort ohne products - Zugang pruefen: npm run operations:verbindung');
  produkte.push(...conn.nodes.map(ausAdminKnoten));
  if (!conn.pageInfo?.hasNextPage) break;
  after = conn.pageInfo.endCursor;
}

const r = plan(produkte, { heute, aktionen });
console.log(`Angebote-Abgleich fuer ${heute}: ${produkte.length} aktive Produkte, ${r.angebote} zeigen gerade einen Rabatt.`);
console.log(`  Tag "${TAG}" setzen:    ${r.setzen.length}`);
console.log(`  Tag "${TAG}" entfernen: ${r.entfernen.length}`);
for (const p of r.setzen.slice(0, 10)) console.log(`    + ${p.titel}`);
for (const p of r.entfernen.slice(0, 10)) console.log(`    - ${p.titel}`);

const ausgabeIdx = argv.indexOf('--ausgabe');
if (ausgabeIdx > -1) {
  const { istAngebot, angezeigteVariante } = await import('../lib/angebote-abgleich.mjs');
  const fs = await import('node:fs');
  const versteckt = produkte.filter((p) => !istAngebot(p, { heute, aktionen }) && (() => { const v = angezeigteVariante(p); return v && Number(v.vergleichspreis) > Number(v.preis); })());
  fs.writeFileSync(argv[ausgabeIdx + 1], JSON.stringify({
    heute,
    angebote: produkte.filter((p) => istAngebot(p, { heute, aktionen })).map((p) => p.handle),
    vergleichspreisOhneAnzeige: versteckt.map((p) => p.handle),
  }, null, 2));
  console.log(`Ausgabe: ${argv[ausgabeIdx + 1]} (${versteckt.length} Produkte mit Vergleichspreis, die der Shop NICHT als Rabatt zeigt)`);
}

if (!schreiben) {
  console.log('Trockenlauf - nichts geschrieben. Mit --schreiben anwenden.');
  process.exit(0);
}

const TAGS_ADD = 'mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }';
const TAGS_REMOVE = 'mutation($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { message } } }';
let fehler = 0;
for (const [liste, mutation, feld] of [[r.setzen, TAGS_ADD, 'tagsAdd'], [r.entfernen, TAGS_REMOVE, 'tagsRemove']]) {
  for (const p of liste) {
    const d = await proxy.execute(mutation, { id: p.id, tags: [TAG] });
    const errs = d?.[feld]?.userErrors ?? [];
    if (errs.length) { fehler += 1; console.error(`  Fehler bei ${p.titel}: ${errs.map((e) => e.message).join('; ')}`); }
    await wartenBeiThrottle(proxy);
  }
}

// Gegenprobe: userErrors: [] ist kein Beleg (AGENTS.md) - den Plan neu rechnen.
const nachher = [];
after = null;
for (;;) {
  const d = await seite(PRODUKTE, { first: SEITE, after });
  nachher.push(...d.products.nodes.map(ausAdminKnoten));
  if (!d.products.pageInfo?.hasNextPage) break;
  after = d.products.pageInfo.endCursor;
}
const rest = plan(nachher, { heute, aktionen });
console.log(`Gegenprobe: noch zu setzen ${rest.setzen.length}, noch zu entfernen ${rest.entfernen.length}, Fehler ${fehler}.`);
process.exit(rest.setzen.length || rest.entfernen.length || fehler ? 1 : 0);
