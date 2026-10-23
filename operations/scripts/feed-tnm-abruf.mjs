#!/usr/bin/env node
/**
 * Bestehender OAuth-Tagesjob fuer TNM: validierte Beispiel-Endpreise fuer beide
 * Kanaele. Keine CLI-Anmeldung, keine Shopify-Schreiboperation.
 *
 * Produktive Dateinamen bleiben tp-tnm-preise.txt / tp-tnm-meta.tsv. Meta bleibt
 * ein eigener Vollkatalog mit denselben Varianten- und Produktgruppen-IDs.
 * Bei jeder ungeklaerten Auslassung bleibt der bisherige Feed unveraendert.
 * Vorher-IDs duerfen nur nach einem autoritativen Statusabgleich entfallen.
 *
 * MC muss price/sale_price/Titel/Link/Einheiten aus diesem Endpreisvertrag lesen;
 * alte x100-Regeln und die blinde Flow-Publikation gehoeren zum koordinierten
 * Cutover. Dieser Job aendert weder MC-Regeln noch die Kanalpublikation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { GraphQLProxy } from '../../workflow/graphql-proxy.mjs';
import { TNM_TYP, istTnm } from './feed-titel.mjs';
import { feedErzeugen, googleZeile, metaZeile, GOOGLE_SPALTEN, META_SPALTEN, tsv } from '../../scripts/teppich-nach-mass-feed.mjs';

export const ABFRAGE = `query($nach: String) {
  products(first: 25, after: $nach, query: "product_type:'${TNM_TYP}' status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title productType status onlineStoreUrl updatedAt handle vendor description
      featuredMedia { preview { image { url } } }
      variants(first: 250) {
        pageInfo { hasNextPage }
        nodes { id price compareAtPrice availableForSale selectedOptions { name value } image { url } }
      }
    }
  }
}`;

/** Derselbe Katalogabruf wie bisher, mit den benoetigten Endpreis-/Meta-Feldern. */
export async function katalogJsonl(proxy) {
  const zeilen = [];
  const cursors = new Set();
  let nach = null;
  do {
    const data = await proxy.execute(ABFRAGE, { nach });
    const seite = data?.products;
    if (!seite?.nodes || !seite.pageInfo) throw new Error('Admin API lieferte keine products - Zugriff pruefen.');
    for (const p of seite.nodes) {
      if (!p.variants?.nodes || p.variants.pageInfo?.hasNextPage !== false) throw new Error(`${p.id}: Varianten unvollstaendig oder mehr als 250.`);
      const { variants, featuredMedia, ...rest } = p;
      zeilen.push(JSON.stringify({ ...rest, bild: featuredMedia?.preview?.image?.url ?? null }));
      for (const v of variants.nodes) zeilen.push(JSON.stringify({ ...v, __parentId: p.id }));
    }
    nach = seite.pageInfo.hasNextPage ? seite.pageInfo.endCursor : null;
    if (seite.pageInfo.hasNextPage && (!nach || cursors.has(nach))) throw new Error('Admin API: Seiten-Cursor fehlt oder wiederholt sich.');
    cursors.add(nach);
  } while (nach);
  return zeilen.join('\n');
}

export function katalogProdukte(jsonl) {
  const produkte = new Map();
  const varianten = [];
  for (const zeile of jsonl.split('\n').filter((z) => z.trim())) {
    const o = JSON.parse(zeile);
    if (o.__parentId) varianten.push(o);
    else {
      if (produkte.has(o.id)) throw new Error(`Doppelte Produkt-ID: ${o.id}`);
      produkte.set(o.id, { ...o, variants: [] });
    }
  }
  for (const v of varianten) {
    const p = produkte.get(v.__parentId);
    if (!p) throw new Error(`Variante ohne Produkt: ${v.id}`);
    p.variants.push(v);
  }
  return [...produkte.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Alle gelesenen Inhalte, auch Aktualitaet und Verfuegbarkeit, kanonisch hashen. */
export function katalogHash(jsonl) {
  const produkte = katalogProdukte(jsonl).map((p) => ({ ...p, variants: p.variants.sort((a, b) => a.id.localeCompare(b.id)) }));
  return createHash('sha256').update(JSON.stringify(produkte)).digest('hex');
}

export const META_KOPF = META_SPALTEN;
export const datei = (zeilen) => tsv(GOOGLE_SPALTEN, zeilen);
export const metaZeilen = (angebote) => angebote.map(metaZeile);
export const metaDatei = (zeilen) => tsv(META_KOPF, zeilen);

/** Begrenzte CI-Diagnose: nur oeffentliche Zuordnung und Fehlergrund, keine Rohdaten. */
export function diagnoseZeilen(pruefung) {
  return (pruefung?.ausgelassen ?? []).slice(0, 10).map(({ handle, variante, grund }) =>
    `TNM-Pruefung: ${JSON.stringify({ handle, variante, grund })}`);
}

export function vorherIds(text) {
  if (!text?.trim()) return [];
  const [kopf, ...rows] = text.trimEnd().split(/\r?\n/).map((z) => z.split('\t'));
  const i = kopf.indexOf('id');
  if (i < 0) throw new Error('Vorherdatei ohne id-Spalte.');
  const ids = rows.filter((z) => z.some(Boolean)).map((z) => z[i]);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error('Vorherdatei: leere oder doppelte ID.');
  return ids;
}

const variantGid = (id) => {
  const nummer = /^shopify_ZZ_\d+_(\d+)$/.exec(id)?.[1] ?? (/^\d+$/.test(id) ? id : null);
  if (!nummer) throw new Error(`Unbekannte Feed-ID: ${id}`);
  return `gid://shopify/ProductVariant/${nummer}`;
};

export function fehlendeVarianten(zeilen, vorherText) {
  const neu = new Set(zeilen.map((z) => z[0]));
  return vorherIds(vorherText).filter((id) => !neu.has(id)).map(variantGid);
}

/** Kein Prozent-Schwellenwert: jede fehlende ID braucht einen bestaetigten Grund. */
export function pruefeUmfang(zeilen, vorherText, entnahmen = []) {
  const ids = zeilen.map((z) => z[0]);
  if (!ids.length) throw new Error('Keine Teppich-nach-Mass-Angebote gefunden - Datei bleibt unveraendert.');
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error('Neue Datei: leere oder doppelte ID.');
  const erlaubt = new Set(entnahmen.map((e) => e.variantId));
  const fehlt = fehlendeVarianten(zeilen, vorherText).filter((id) => !erlaubt.has(id));
  if (fehlt.length) throw new Error(`${fehlt.length} bisherige Varianten fehlen ohne bestaetigte Entnahme - Datei bleibt unveraendert.`);
}

const ENTNAHMEN_QUERY = `query TnmEntnahmen($ids: [ID!]!) {
  nodes(ids: $ids) { ... on ProductVariant { id product { id status productType } } }
}`;

/** Sortimentsentnahmen zulassen, aber nie einen unvollstaendigen Aktivkatalog. */
export async function verifizierteEntnahmen(proxy, ids) {
  const alle = [...new Set(ids)];
  const result = [];
  for (let i = 0; i < alle.length; i += 100) {
    const paket = alle.slice(i, i + 100);
    const r = await proxy.execute(ENTNAHMEN_QUERY, { ids: paket });
    if (!Array.isArray(r?.nodes) || r.nodes.length !== paket.length) throw new Error('Entnahmepruefung: unvollstaendige Admin-Antwort.');
    for (const [j, n] of r.nodes.entries()) {
      if (n === null) { result.push({ variantId: paket[j], status: 'DELETED' }); continue; }
      if (n?.id !== paket[j] || !n.product?.status || typeof n.product?.productType !== 'string') throw new Error('Entnahmepruefung: Variantenstatus fehlt.');
      const p = n.product;
      if (['ARCHIVED', 'DRAFT'].includes(p.status) || !istTnm(p)) {
        result.push({ variantId: n.id, productId: p.id, status: p.status === 'ACTIVE' ? 'NOT_TNM' : p.status });
      } else throw new Error(`${n.id}: aktiver Teppich nach Mass fehlt im neuen Feed.`);
    }
  }
  return result;
}

/** Erst komplett validieren; dann beide Dateien fuer denselben Feed-Commit bereitstellen. */
export async function vorbereiten({ proxy, vorher, metaVorher, erzeugen = feedErzeugen }) {
  const jsonl = await katalogJsonl(proxy);
  const katalog = katalogProdukte(jsonl);
  const { zeilen, pruefung } = await erzeugen(katalog);
  if (pruefung.ausgelassen.length || zeilen.length !== pruefung.varianten) {
    const e = new Error(`${pruefung.ausgelassen.length} ungueltige/unvollstaendige Zeilen: keine Feeddatei ersetzt.`);
    e.pruefung = pruefung;
    throw e;
  }
  const google = zeilen.map(googleZeile);
  const meta = metaZeilen(zeilen);
  const entnahmen = await verifizierteEntnahmen(proxy, [...fehlendeVarianten(google, vorher), ...fehlendeVarianten(meta, metaVorher)]);
  pruefeUmfang(google, vorher, entnahmen);
  pruefeUmfang(meta, metaVorher, entnahmen);
  // Aenderungen waehrend des Seitenabrufs duerfen nicht als aktueller Snapshot erscheinen.
  const hash = katalogHash(jsonl);
  if (hash !== katalogHash(await katalogJsonl(proxy))) throw new Error('Katalog waehrend der Erzeugung geaendert - keine Feeddatei ersetzt.');
  return { google: datei(google), meta: metaDatei(meta), pruefung: { ...pruefung, katalogHash: hash, entnahmen, vorherGoogle: vorherIds(vorher).length, vorherMeta: vorherIds(metaVorher).length } };
}

async function main(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!['--aus', '--vorher', '--meta-aus', '--meta-vorher', '--pruefung'].includes(argv[i])) throw new Error(`unbekannte Option: ${argv[i]}`);
    const key = argv[i].slice(2);
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`--${key} ohne Wert`);
    o[key] = argv[++i];
  }
  for (const k of ['aus', 'vorher', 'meta-aus', 'meta-vorher', 'pruefung']) if (!o[k]) throw new Error(`--${k} ist erforderlich (beide bestehenden Kanaele gemeinsam).`);
  const pfade = Object.values(o).map((p) => path.resolve(p));
  if (new Set(pfade).size !== pfade.length) throw new Error('Ausgaben und Vorherdateien muessen verschiedene Pfade haben.');
  const vorher = fs.readFileSync(o.vorher, 'utf8');
  const metaVorher = fs.readFileSync(o['meta-vorher'], 'utf8');
  if (!vorherIds(vorher).length || !vorherIds(metaVorher).length) throw new Error('Bestehende Vorherdateien fehlen oder sind leer.');
  const proxy = new GraphQLProxy();
  if (!proxy.live) throw new Error('Vorhandener SHOPIFY_ADMIN_TOKEN fehlt.');
  let r;
  try { r = await vorbereiten({ proxy, vorher, metaVorher }); }
  catch (e) {
    if (e.pruefung) {
      fs.writeFileSync(o.pruefung, `${JSON.stringify(e.pruefung, null, 2)}\n`);
      for (const zeile of diagnoseZeilen(e.pruefung)) console.error(zeile);
    }
    throw e;
  }
  const ausgaben = [[o.aus, r.google], [o['meta-aus'], r.meta], [o.pruefung, `${JSON.stringify(r.pruefung, null, 2)}\n`]];
  const temps = ausgaben.map(([p]) => `${p}.tmp-${process.pid}`);
  try {
    for (const [i, [, inhalt]] of ausgaben.entries()) fs.writeFileSync(temps[i], inhalt);
    for (const [i, [p]] of ausgaben.entries()) fs.renameSync(temps[i], p);
  } finally {
    for (const p of temps) fs.rmSync(p, { force: true });
  }
  console.log(`${r.pruefung.zeilen} validierte Beispiel-Endpreise; Google und Meta vollstaendig, ${r.pruefung.entnahmen.length} bestaetigte Entnahmen.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(2); });
}
