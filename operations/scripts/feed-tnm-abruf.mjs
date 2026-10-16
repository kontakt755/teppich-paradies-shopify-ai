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
 * Neue Teppiche nach Mass (seit 14.10.): Die Datei ist nur noch die zweite
 * Absicherung. Die Hauptquelle "Shopify App API" hat im Merchant Center
 * Attributregeln fuer price und sale_price: bei product type "Teppich nach Mass"
 * Wert aus der Shopify-Quelle x 100. Das greift sofort fuer neue Angebote und
 * Preisaenderungen, ohne auf den taeglichen Abruf zu warten. In den Kanal
 * Google & YouTube kommen neue aktive Teppiche nach Mass stuendlich per
 * Shopify-Flow-Workflow "Teppich nach Mass automatisch in Google & YouTube"
 * (Abfrage `product_type:'Teppich nach Mass' status:active
 * -publication_ids:<Google-Kanal>`, dann Publish product). Der Token dieser
 * Action hat kein write_publications, deshalb Flow statt Skript. Die Shopify-
 * Kanaele Shop und Facebook & Instagram bleiben bewusst ohne Teppiche nach Mass
 * (Preis dort nicht ueberschreibbar); Meta bekommt sie ueber den eigenen Katalog.
 *
 * Meta (Facebook & Instagram): Der Shopify-Katalog bei Meta nimmt nur den
 * Shopify-Preis je 0,01 m2 und kennt keine Regeln oder Zusatzfeeds. Deshalb
 * schreibt --meta-aus einen vollstaendigen Feed fuer einen eigenen Meta-Katalog
 * ("Teppich nach Mass (Feed)"): id = Varianten-ID, item_group_id = Produkt-ID
 * wie im Shopify-Katalog, damit Pixel-Ereignisse zugeordnet werden.
 *
 * Aufruf: node operations/scripts/feed-tnm-abruf.mjs --aus tp-tnm-preise.txt [--vorher alte.txt]
 *           [--meta-aus tp-tnm-meta.tsv] [--meta-vorher alte-meta.tsv]
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { GraphQLProxy } from '../../workflow/graphql-proxy.mjs';
import { FARB_OPTIONEN, TNM_TYP, euro, feedTitel, istTnm, nummer, option, tnmPreisZeilen } from './feed-titel.mjs';

export const MINDEST_ANTEIL = 0.8;
export const SHOP_URL = 'https://www.teppich-paradies.net';

const ABFRAGE = `query($nach: String) {
  products(first: 25, after: $nach, query: "product_type:'${TNM_TYP}' status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title productType handle vendor description
      featuredMedia { preview { image { url } } }
      variants(first: 250) {
        pageInfo { hasNextPage }
        nodes { id price compareAtPrice availableForSale selectedOptions { name value } image { url } }
      }
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
      const { variants: _v, featuredMedia, ...rest } = p;
      zeilen.push(JSON.stringify({ ...rest, bild: featuredMedia?.preview?.image?.url ?? null }));
      for (const v of p.variants.nodes) zeilen.push(JSON.stringify({ ...v, __parentId: p.id }));
    }
    nach = seite.pageInfo.hasNextPage ? seite.pageInfo.endCursor : null;
  } while (nach);
  return zeilen.join('\n');
}

export const datei = (zeilen) =>
  ['id\tprice\tsale_price\tunit_pricing_measure\tunit_pricing_base_measure', ...zeilen.map((z) => z.join('\t'))].join('\n') + '\n';

export const META_KOPF = ['id', 'item_group_id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'link', 'image_link', 'brand', 'color'];

// Tabs und Zeilenumbrueche zerstoeren die TSV-Zeile.
const flach = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/** Teppich nach Mass als vollstaendige Meta-Katalogzeilen, Preis je m2 wie im Google-Feed. */
export function metaZeilen(jsonl) {
  const produkte = new Map();
  const varianten = [];
  for (const zeile of jsonl.split('\n')) {
    if (!zeile.trim()) continue;
    const o = JSON.parse(zeile);
    if (o.__parentId) varianten.push(o); else produkte.set(o.id, o);
  }
  const farben = new Map();
  for (const v of varianten) {
    const f = option(v, FARB_OPTIONEN);
    if (f) (farben.get(v.__parentId) ?? farben.set(v.__parentId, new Set()).get(v.__parentId)).add(f);
  }
  const zeilen = [];
  for (const v of varianten) {
    const p = produkte.get(v.__parentId);
    if (!istTnm(p) || !(Number(v.price) > 0)) continue;
    const bild = v.image?.url ?? p.bild;
    if (!bild || !p.handle) continue;
    const alt = Number(v.compareAtPrice) > Number(v.price);
    const titel = feedTitel(p.title, v, farben.get(p.id)?.size ?? 0);
    const text = flach(p.description) || titel;
    zeilen.push([
      nummer(v.id), nummer(p.id), titel,
      `${text.slice(0, 4900)} Preis je m².`,
      v.availableForSale === false ? 'out of stock' : 'in stock', 'new',
      euro(alt ? v.compareAtPrice : v.price), alt ? euro(v.price) : '',
      `${SHOP_URL}/products/${p.handle}?variant=${nummer(v.id)}`, bild,
      flach(p.vendor) || 'Teppich Paradies', flach(option(v, FARB_OPTIONEN) ?? ''),
    ].map(flach));
  }
  return zeilen;
}

export const metaDatei = (zeilen) => [META_KOPF, ...zeilen].map((z) => z.join('\t')).join('\n') + '\n';

/** Wirft, wenn die neue Datei leer ist oder deutlich weniger Zeilen hat als die vorige. */
export function pruefeUmfang(neu, vorherText) {
  if (neu === 0) throw new Error('Keine Teppich-nach-Mass-Preise gefunden - Datei bleibt unveraendert.');
  if (!vorherText) return;
  const alt = vorherText.split('\n').slice(1).filter((z) => z.trim()).length;
  if (alt > 0 && neu < alt * MINDEST_ANTEIL) {
    throw new Error(`Nur ${neu} statt bisher ${alt} Zeilen (< ${MINDEST_ANTEIL * 100} %) - Datei bleibt unveraendert, bitte pruefen.`);
  }
}

async function main(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (['--aus', '--vorher', '--meta-aus', '--meta-vorher'].includes(argv[i])) o[argv[i].slice(2)] = argv[++i];
    else throw new Error(`unbekannte Option: ${argv[i]}`);
  }
  if (!o.aus) throw new Error('Aufruf: feed-tnm-abruf.mjs --aus tp-tnm-preise.txt [--vorher alte.txt]');
  const proxy = new GraphQLProxy();
  if (!proxy.live) throw new Error('SHOPIFY_ADMIN_TOKEN fehlt.');
  const lies = (pfad) => (pfad && fs.existsSync(pfad) ? fs.readFileSync(pfad, 'utf8') : '');
  const jsonl = await katalogJsonl(proxy);
  const zeilen = tnmPreisZeilen(jsonl);
  pruefeUmfang(zeilen.length, lies(o.vorher));
  const meta = o['meta-aus'] ? metaZeilen(jsonl) : null;
  if (meta) pruefeUmfang(meta.length, lies(o['meta-vorher']));
  fs.writeFileSync(o.aus, datei(zeilen));
  if (meta) {
    fs.writeFileSync(o['meta-aus'], metaDatei(meta));
    console.log(`${meta.length} Meta-Katalogzeilen nach ${o['meta-aus']} (${zeilen.length - meta.length} ohne Bild oder Handle ausgelassen)`);
  }
  console.log(`${zeilen.length} Teppich-nach-Mass-Preise je m2 nach ${o.aus}, davon ${zeilen.filter((z) => z[2]).length} mit Vergleichspreis`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(2); });
}
