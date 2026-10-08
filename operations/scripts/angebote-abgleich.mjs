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
 * Laeuft taeglich um 0:00 (launchagents/net.teppich-paradies.angebote.plist.vorlage) und
 * nach jeder Angebotswelle (npm run angebot).
 */

import fs from 'node:fs';
import { TAG, aktionAusMetaobjekt, angezeigteVariante, ausAdminKnoten, heuteBerlin, istAngebot, laufendeAktionen, plan } from '../lib/angebote-abgleich.mjs';
import { MAX_IMMEDIATE_SCRIPT_RETRIES } from '../../workflow/retry.mjs';

// Keine Kollektionen am Produkt (wuerde bei vielen Smart-Kollektionen abgeschnitten):
// die Mitgliedschaft in Aktionskollektionen wird unten je Kollektion abgefragt.
const PRODUKTE = `
query AngeboteAbgleich($first: Int!, $after: String, $q: String!) {
  products(first: $first, after: $after, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title productType tags
      aStart: metafield(namespace: "aktion", key: "start") { value }
      aEnde: metafield(namespace: "aktion", key: "ende") { value }
      aKlasse: metafield(namespace: "aktion", key: "klasse") { value }
      variants(first: 100) { pageInfo { hasNextPage endCursor } nodes { title price compareAtPrice availableForSale selectedOptions { value } } }
    }
  }
}`;

const WEITERE_VARIANTEN = `
query AngeboteVarianten($id: ID!, $after: String) {
  product(id: $id) { variants(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { title price compareAtPrice availableForSale selectedOptions { value } } } }
}`;

const NICHT_AKTIV_MIT_TAG = `
query AngeboteNichtAktiv($first: Int!, $after: String, $q: String!) {
  products(first: $first, after: $after, query: $q) { pageInfo { hasNextPage endCursor } nodes { id handle title tags } }
}`;

const KOLLEKTION_PRODUKTE = `
query AngeboteKollektion($id: ID!, $after: String) {
  collection(id: $id) { products(first: 250, after: $after) { pageInfo { hasNextPage endCursor } nodes { id } } }
}`;

const AKTIONEN = '{ metaobjects(type: "tp_aktion", first: 50) { nodes { fields { key value } } } }';

// --- Argumente ---------------------------------------------------------------
const argv = process.argv;
function wert(name) {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const w = argv[i + 1];
  if (!w || w.startsWith('--')) { console.error(`${name} braucht einen Wert.`); process.exit(2); }
  return w;
}
const schreiben = argv.includes('--schreiben');
const stichtag = wert('--stichtag');
const ausgabe = wert('--ausgabe');
if (stichtag && !/^\d{4}-\d{2}-\d{2}$/.test(stichtag)) { console.error('--stichtag im Format JJJJ-MM-TT.'); process.exit(2); }
if (schreiben && stichtag) { console.error('--stichtag nur im Trockenlauf: geschrieben wird immer fuer heute.'); process.exit(2); }
const heute = stichtag ?? heuteBerlin();

// --- Zugang und Abfragen -----------------------------------------------------
const { erzeugeProxy, hatZugangsdaten, KEIN_ZUGANG } = await import('../sync/zugang.mjs');
if (!hatZugangsdaten()) { console.error(KEIN_ZUGANG); process.exit(1); }
const { proxy } = await erzeugeProxy();

// Eine Produktseite kostet bis ~1.000 Punkte (10 Produkte x 100 Varianten). Vor jeder
// Anfrage auf genug Budget warten (aus throttleStatus). Meldet Shopify trotzdem
// "Throttled", gibt es genau einen Neuversuch nach dem Auffuellen
// (AGENTS.md: hoechstens ein unmittelbarer Retry, workflow/retry.mjs).
const SEITE = 10;
const BEDARF = 1000;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
async function anfrage(query, variablen) {
  for (let versuch = 0; ; versuch += 1) {
    const status = proxy.requestLog?.at(-1)?.throttleStatus;
    if (status?.restoreRate > 0) {
      const ziel = Math.min(BEDARF, status.maximumAvailable ?? BEDARF);
      if (status.currentlyAvailable < ziel) await warte(Math.ceil(((ziel - status.currentlyAvailable) / status.restoreRate) * 1000));
    }
    try {
      return await proxy.execute(query, variablen);
    } catch (err) {
      if (!/Throttled/i.test(String(err?.message)) || versuch >= MAX_IMMEDIATE_SCRIPT_RETRIES) throw err;
      await warte(15000);
    }
  }
}

async function blaettere(query, variablen, holeVerbindung) {
  const knoten = [];
  let after = null;
  for (;;) {
    const d = await anfrage(query, { ...variablen, after });
    const conn = holeVerbindung(d);
    if (!conn) throw new Error('Unerwartete Antwort von Shopify - Zugang pruefen: npm run operations:verbindung');
    knoten.push(...conn.nodes);
    if (!conn.pageInfo?.hasNextPage) return knoten;
    after = conn.pageInfo.endCursor;
  }
}

async function holeAktiveProdukte(aktionsKollektionen) {
  const roh = await blaettere(PRODUKTE, { first: SEITE, q: 'status:active' }, (d) => d?.products);
  // Mehr als 100 Varianten: Rest nachladen, sonst rechnet die Rollenware-Regel mit
  // einer anderen Variantenmenge als der Shop (Liquid sieht alle Varianten).
  for (const n of roh) {
    if (!n.variants?.pageInfo?.hasNextPage) continue;
    const rest = await blaettere(WEITERE_VARIANTEN, { id: n.id }, (d) => d?.product?.variants);
    n.variants.nodes.push(...rest);
  }
  return roh.map((n) => {
    const p = ausAdminKnoten(n);
    p.kollektionen = [...aktionsKollektionen].filter(([, ids]) => ids.has(p.id)).map(([k]) => k);
    return p;
  });
}

// --- Ablauf ------------------------------------------------------------------
let aktionen;
try {
  const d = await anfrage(AKTIONEN, {});
  if (!d?.metaobjects) throw new Error('Antwort ohne metaobjects');
  aktionen = d.metaobjects.nodes.map(aktionAusMetaobjekt);
} catch (err) {
  // Ohne die zentralen Aktionen wuerde ein Schreiblauf deren Produkte faelschlich
  // aus "Angebote" nehmen. Im Schreiblauf deshalb abbrechen, im Trockenlauf warnen.
  const meldung = `Zentrale Aktionen (tp_aktion) nicht lesbar: ${String(err?.message).slice(0, 160)}`;
  if (schreiben) { console.error(`${meldung} - Abbruch, nichts geschrieben.`); process.exit(1); }
  console.warn(`Hinweis: ${meldung}. Trockenlauf nur ueber Streichpreise.`);
  aktionen = [];
}

const aktionsKollektionen = new Map();
for (const a of laufendeAktionen(aktionen, heute)) {
  if (aktionsKollektionen.has(a.kollektion)) continue;
  const ids = await blaettere(KOLLEKTION_PRODUKTE, { id: a.kollektion }, (d) => d?.collection?.products);
  aktionsKollektionen.set(a.kollektion, new Set(ids.map((x) => x.id)));
}

async function rechne() {
  const produkte = await holeAktiveProdukte(aktionsKollektionen);
  const r = plan(produkte, { heute, aktionen });
  // Entwuerfe und archivierte Produkte sind nie ein sichtbares Angebot: ein stehen
  // gebliebener Tag kaeme sonst beim Reaktivieren ungeprueft wieder in "Angebote".
  const nichtAktiv = await blaettere(NICHT_AKTIV_MIT_TAG, { first: 100, q: `tag:${TAG} AND -status:active` }, (d) => d?.products);
  r.entfernen.push(...nichtAktiv.filter((n) => (n.tags ?? []).includes(TAG)).map(ausAdminKnoten));
  return { produkte, r };
}

const { produkte, r } = await rechne();
console.log(`Angebote-Abgleich fuer ${heute}: ${produkte.length} aktive Produkte, ${r.angebote} zeigen gerade einen Rabatt.`);
console.log(`  Tag "${TAG}" setzen:    ${r.setzen.length}`);
console.log(`  Tag "${TAG}" entfernen: ${r.entfernen.length}`);
for (const p of r.setzen.slice(0, 10)) console.log(`    + ${p.titel}`);
for (const p of r.entfernen.slice(0, 10)) console.log(`    - ${p.titel}`);

if (ausgabe) {
  const versteckt = produkte.filter((p) => {
    const v = angezeigteVariante(p);
    return !istAngebot(p, { heute, aktionen }) && v && Number(v.vergleichspreis) > Number(v.preis);
  });
  fs.writeFileSync(ausgabe, JSON.stringify({
    heute,
    angebote: produkte.filter((p) => istAngebot(p, { heute, aktionen })).map((p) => p.handle),
    vergleichspreisOhneAnzeige: versteckt.map((p) => p.handle),
  }, null, 2));
  console.log(`Ausgabe: ${ausgabe} (${versteckt.length} Produkte mit Vergleichspreis, die der Shop NICHT als Rabatt zeigt)`);
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
    try {
      const d = await anfrage(mutation, { id: p.id, tags: [TAG] });
      const errs = d?.[feld]?.userErrors ?? [];
      if (errs.length) { fehler += 1; console.error(`  Fehler bei ${p.titel}: ${errs.map((e) => e.message).join('; ')}`); }
    } catch (err) {
      // Einzelner Fehlschlag bricht nicht den ganzen Lauf ab - die Gegenprobe zeigt den Rest.
      fehler += 1;
      console.error(`  Fehler bei ${p.titel}: ${String(err?.message).slice(0, 160)}`);
    }
  }
}

// Gegenprobe: userErrors: [] ist kein Beleg (AGENTS.md) - den Plan neu rechnen.
const { r: rest } = await rechne();
console.log(`Gegenprobe: noch zu setzen ${rest.setzen.length}, noch zu entfernen ${rest.entfernen.length}, Fehler ${fehler}.`);
process.exit(rest.setzen.length || rest.entfernen.length || fehler ? 1 : 0);
