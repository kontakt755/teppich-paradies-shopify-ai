#!/usr/bin/env node
/**
 * Teppich-nach-Mass-Preise fuer das Merchant Center, automatisch (#1283).
 *
 * Holt alle aktiven Teppiche nach Mass ueber die Admin API (SHOPIFY_ADMIN_TOKEN,
 * in GitHub Actions per client_credentials) und schreibt tp-tnm-preise.txt mit
 * derselben Regel wie `feed:titel -- --tnm-aus` (tnmPreisZeilen): Preis je m2,
 * Vergleichspreis als price/sale_price, Grundpreis 1 sqm.
 *
 * Der Workflow .github/workflows/feed-tnm-preise.yml legt die Datei taeglich auf
 * den Zweig `feed-daten`; das Merchant Center ruft sie von dort ab (ergaenzende
 * Quelle "tp-tnm-preise", Abruf per Link). `main` bleibt unberuehrt.
 *
 * Schutz: Fehlt einer Variante die Zeile, faellt Google auf den Shopify-Preis je
 * 0,01 m2 zurueck (z. B. 0,85 EUR). Deshalb bricht das Skript ab, statt eine
 * Datei mit deutlich weniger Zeilen als die vorige zu schreiben (--vorher).
 *
 * Aufruf: node operations/scripts/feed-tnm-abruf.mjs --aus tp-tnm-preise.txt [--vorher alte.txt]
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { GraphQLProxy } from '../../workflow/graphql-proxy.mjs';
import { TNM_TYP, tnmPreisZeilen } from './feed-titel.mjs';

export const MINDEST_ANTEIL = 0.8;

const ABFRAGE = `query($nach: String) {
  products(first: 50, after: $nach, query: "product_type:'${TNM_TYP}' status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title productType
      variants(first: 250) { pageInfo { hasNextPage } nodes { id price compareAtPrice } }
    }
  }
}`;

/** Alle Seiten abholen und als JSONL im Format der Bulk-Abfrage zurueckgeben. */
export async function katalogJsonl(proxy) {
  const zeilen = [];
  let nach = null;
  do {
    const data = await proxy.execute(ABFRAGE, { nach });
    const seite = data?.products;
    if (!seite) throw new Error('Admin API lieferte keine products - Token/Scope pruefen.');
    for (const p of seite.nodes) {
      if (p.variants.pageInfo.hasNextPage) throw new Error(`${p.title}: mehr als 250 Varianten, Abfrage erweitern.`);
      zeilen.push(JSON.stringify({ id: p.id, title: p.title, productType: p.productType }));
      for (const v of p.variants.nodes) zeilen.push(JSON.stringify({ ...v, __parentId: p.id }));
    }
    nach = seite.pageInfo.hasNextPage ? seite.pageInfo.endCursor : null;
  } while (nach);
  return zeilen.join('\n');
}

export const datei = (zeilen) =>
  ['id\tprice\tsale_price\tunit_pricing_measure\tunit_pricing_base_measure', ...zeilen.map((z) => z.join('\t'))].join('\n') + '\n';

/** Wirft, wenn die neue Datei leer ist oder deutlich weniger Zeilen hat als die vorige. */
export function pruefeUmfang(neu, vorherText) {
  if (neu === 0) throw new Error('Keine Teppich-nach-Mass-Preise gefunden - Datei bleibt unveraendert.');
  if (!vorherText) return;
  const alt = vorherText.split('\n').filter((z) => z.startsWith('shopify_')).length;
  if (alt > 0 && neu < alt * MINDEST_ANTEIL) {
    throw new Error(`Nur ${neu} statt bisher ${alt} Zeilen (< ${MINDEST_ANTEIL * 100} %) - Datei bleibt unveraendert, bitte pruefen.`);
  }
}

async function main(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--aus' || argv[i] === '--vorher') o[argv[i].slice(2)] = argv[++i];
    else throw new Error(`unbekannte Option: ${argv[i]}`);
  }
  if (!o.aus) throw new Error('Aufruf: feed-tnm-abruf.mjs --aus tp-tnm-preise.txt [--vorher alte.txt]');
  const proxy = new GraphQLProxy();
  if (!proxy.live) throw new Error('SHOPIFY_ADMIN_TOKEN fehlt.');
  const zeilen = tnmPreisZeilen(await katalogJsonl(proxy));
  pruefeUmfang(zeilen.length, o.vorher && fs.existsSync(o.vorher) ? fs.readFileSync(o.vorher, 'utf8') : '');
  fs.writeFileSync(o.aus, datei(zeilen));
  console.log(`${zeilen.length} Teppich-nach-Mass-Preise je m2 nach ${o.aus}, davon ${zeilen.filter((z) => z[2]).length} mit Vergleichspreis`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(2); });
}
