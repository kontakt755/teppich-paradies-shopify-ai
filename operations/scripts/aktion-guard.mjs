#!/usr/bin/env node
/**
 * Aktions-Guard (Werkbank w-310): passen Anzeige (tp_aktion, aktion.*) und
 * Abrechnung (automatischer Rabatt) zusammen? Nur lesend.
 *
 *   npm run -s aktion:guard            # Exit 0 = passt, 1 = Abweichung, 2 = nicht lesbar
 *   npm run -s aktion:guard -- --hinweise   # zusaetzlich Produkte mit eigener Aktion ausserhalb des Rabatts
 *   npm run -s aktion:guard -- --rabatte <datei.json>   # Rabatte aus einer Datei statt aus der API
 *
 * Der Dienst-Token hat (Stand 07.11.2026) kein read_discounts. Dann die Abfrage
 * RABATTE unten ueber den Shopify-MCP (graphql_query) ausfuehren, die Antwort als
 * Datei ablegen und mit --rabatte uebergeben.
 *
 * Zugang: Token aus .env.local (operations/sync/zugang.mjs, im Dienst-Checkout oder per
 * TP_ENV_LOCAL). Die Shopify-CLI hat kein read_discounts.
 * Regeln: operations/lib/aktion-guard.mjs.
 */
import fs from 'node:fs';
import { aktionAusMetaobjekt, heuteBerlin } from '../lib/angebote-abgleich.mjs';
import { pruefeAktionen, rabattAusKnoten } from '../lib/aktion-guard.mjs';

const RABATTE = `{ discountNodes(first: 50, query: "status:active OR status:scheduled") { nodes { discount { __typename
  ... on DiscountAutomaticBasic { title status startsAt endsAt
    customerGets { value { __typename ... on DiscountPercentage { percentage } }
      items { __typename ... on DiscountCollections { collections(first: 20) { nodes { id } } } } } } } } } }`;
const AKTIONEN = '{ metaobjects(type: "tp_aktion", first: 50) { nodes { fields { key value } } } }';
const PRODUKTE = `query AktionGuard($after: String) { products(first: 250, after: $after, query: "status:active") {
  pageInfo { hasNextPage endCursor }
  nodes { id handle
    aStart: metafield(namespace: "aktion", key: "start") { value }
    aEnde: metafield(namespace: "aktion", key: "ende") { value }
    aKlasse: metafield(namespace: "aktion", key: "klasse") { value }
    compareAtPriceRange { maxVariantCompareAtPrice { amount } } } } }`;
const KOLLEKTION = `query AktionGuardKollektion($id: ID!, $after: String) { collection(id: $id) {
  products(first: 250, after: $after) { pageInfo { hasNextPage endCursor } nodes { id } } } }`;

const mitHinweisen = process.argv.includes('--hinweise');
const iRabatte = process.argv.indexOf('--rabatte');
const rabattDatei = iRabatte >= 0 ? process.argv[iRabatte + 1] : null;
if (iRabatte >= 0 && (!rabattDatei || rabattDatei.startsWith('--'))) { console.error('--rabatte braucht eine Datei.'); process.exit(2); }
const { erzeugeProxy, hatZugangsdaten, KEIN_ZUGANG } = await import('../sync/zugang.mjs');
if (!hatZugangsdaten()) { console.error(KEIN_ZUGANG); process.exit(2); }
const { proxy } = await erzeugeProxy();

async function blaettere(query, variablen, holen) {
  const knoten = [];
  let after = null;
  for (;;) {
    const conn = holen(await proxy.execute(query, { ...variablen, after }));
    if (!conn) throw new Error('Unerwartete Antwort von Shopify');
    knoten.push(...conn.nodes);
    if (!conn.pageInfo?.hasNextPage) return knoten;
    after = conn.pageInfo.endCursor;
  }
}

let ergebnis;
try {
  const heute = heuteBerlin();
  const roh = rabattDatei ? JSON.parse(fs.readFileSync(rabattDatei, 'utf8')) : await proxy.execute(RABATTE).catch((err) => {
    if (/read_discounts/.test(String(err?.message))) throw new Error('Token ohne read_discounts: Rabatte per MCP lesen und mit --rabatte <datei> uebergeben (Kopf dieser Datei).');
    throw err;
  });
  const r = roh?.data ?? roh;
  if (!r?.discountNodes) throw new Error('Rabatte nicht lesbar');
  const rabatte = r.discountNodes.nodes.map(rabattAusKnoten).filter(Boolean);
  const a = await proxy.execute(AKTIONEN);
  if (!a?.metaobjects) throw new Error('tp_aktion nicht lesbar');
  const aktionen = a.metaobjects.nodes.map(aktionAusMetaobjekt);

  const mitglieder = new Map();
  for (const k of new Set(rabatte.flatMap((x) => x.kollektionen))) {
    const ids = await blaettere(KOLLEKTION, { id: k }, (d) => d?.collection?.products);
    mitglieder.set(k, new Set(ids.map((x) => x.id)));
  }
  const knoten = await blaettere(PRODUKTE, {}, (d) => d?.products);
  const produkte = knoten.map((n) => ({
    handle: n.handle,
    mf: { aktion_start: n.aStart?.value ?? '', aktion_ende: n.aEnde?.value ?? '', aktion_klasse: n.aKlasse?.value ?? '' },
    vergleichspreis: Number(n.compareAtPriceRange?.maxVariantCompareAtPrice?.amount ?? 0) > 0,
    kollektionen: [...mitglieder].filter(([, ids]) => ids.has(n.id)).map(([k]) => k),
  }));
  ergebnis = { heute, rabatte, ...pruefeAktionen({ rabatte, aktionen, produkte, heute }) };
} catch (err) {
  console.error(`aktion:guard: ${String(err?.message ?? err).slice(0, 200)}`);
  process.exit(2);
}

const g = ergebnis.geprueft;
console.log(`Aktions-Guard ${ergebnis.heute}: ${g.rabatte} laufende Rabatte, ${g.aktionen} Anzeige-Aktionen, ${g.produkte} aktive Produkte, davon ${g.imRabatt} im Rabatt und ${g.mitEigenerAktion} mit eigener Aktion ausserhalb.`);
for (const r of ergebnis.rabatte) console.log(`  Rabatt "${r.titel}": ${r.prozent} %, ${r.start} bis ${r.ende ?? 'offen'}, ${r.kollektionen.length} Kollektion(en)`);
for (const f of ergebnis.fehler) console.log(`FEHLER ${f}`);
if (mitHinweisen) for (const h of ergebnis.hinweise) console.log(`hinweis ${h}`);
else if (ergebnis.hinweise.length) console.log(`${ergebnis.hinweise.length} Hinweise  - mit --hinweise zeigen.`);
console.log(ergebnis.fehler.length ? `aktion:guard: ${ergebnis.fehler.length} Abweichung(en).` : 'aktion:guard: Anzeige und Abrechnung passen zusammen.');
process.exit(ergebnis.fehler.length ? 1 : 0);
