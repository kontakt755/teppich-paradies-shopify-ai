#!/usr/bin/env node
/**
 * Meta-Katalog: Bilder neu abrufen lassen ("Fehlende oder ungueltige Bilder").
 *
 * Beim Massenabgleich am 13.10.2026 hat Meta bei vielen Varianten die Bilder nicht
 * laden koennen, obwohl sie in Shopify korrekt sind (750x750 JPEG; dieselbe Datei
 * ist bei der Nachbarvariante "Berechtigt"). Meta versucht es von selbst nicht
 * erneut. Sobald Shopify das Produkt neu an Meta schickt, laedt Meta die Bilder
 * wieder (Test Vorwerk Rustica, 14.10.).
 *
 * Das Skript speichert jedes aktive Produkt im Kanal Facebook & Instagram einmal
 * neu: Tag "meta-sync" setzen und sofort wieder entfernen, danach Pause. Der
 * Endzustand ist unveraendert; am Ende wird geprueft, dass kein Produkt den Tag
 * behalten hat. Die Pause verhindert, dass Meta wieder zu viele Bilder auf einmal
 * holt (vermutliche Ursache am 13.10.).
 *
 * Nachtrag 14.10. abends: Weder Neuspeichern noch --medien (Variantenbilder ab- und
 * wieder anhaengen, auch mit 3 Minuten Abstand) behebt es verlaesslich. Meta bekommt
 * fuer viele Varianten der Vorwerk-/JAB-Produkte aus dem Import vom 12./13.10. keinen
 * Bildlink ("Bilder: Nicht vorhanden"), obwohl Shopify dieselbe Mediendatei zuordnet
 * wie bei der "berechtigten" Nachbarvariante. Ein Einzelerfolg (Lyrica Anthrazit 500 cm)
 * liess sich nicht wiederholen. Beide Modi bleiben als Werkzeug, die Ursache liegt in
 * der Shopify-Meta-Synchronisierung (offen, siehe Gedaechtnis meta_katalog_bilder_neu_abrufen).
 *
 * Aufruf: node operations/scripts/meta-bilder-auffrischen.mjs [--pause 3000] [--limit 50] [--trocken]
 *           [--medien] [--abfrage "(vendor:Vorwerk OR vendor:JAB*)"]
 * In GitHub Actions: .github/workflows/meta-bilder-auffrischen.yml (nur manuell).
 */
import { pathToFileURL } from 'node:url';
import { GraphQLProxy } from '../../workflow/graphql-proxy.mjs';

export const META_KANAL = '376821973326';
export const TAG = 'meta-sync';

const LISTE = `query($nach: String, $q: String!) {
  products(first: 250, after: $nach, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { id }
  }
}`;
const SETZEN = `mutation($id: ID!) { tagsAdd(id: $id, tags: ["${TAG}"]) { userErrors { message } } }`;
const ENTFERNEN = `mutation($id: ID!) { tagsRemove(id: $id, tags: ["${TAG}"]) { userErrors { message } } }`;
const UEBRIG = `{ productsCount(query: "tag:${TAG}") { count } }`;

export const abfrage = (zusatz = '') => `publication_ids:${META_KANAL} status:active${zusatz ? ` ${zusatz}` : ''}`;

export async function produktIds(proxy, zusatz = '') {
  const ids = [];
  let nach = null;
  do {
    const seite = (await proxy.execute(LISTE, { nach, q: abfrage(zusatz) }))?.products;
    if (!seite) throw new Error('Admin API lieferte keine products - Token/Scope pruefen.');
    ids.push(...seite.nodes.map((n) => n.id));
    nach = seite.pageInfo.hasNextPage ? seite.pageInfo.endCursor : null;
  } while (nach);
  return ids;
}

const fehler = (antwort, feld) => antwort?.[feld]?.userErrors?.map((e) => e.message).join('; ') || '';

/** Speichert jedes Produkt einmal neu; gibt die Zahl der Fehler zurueck. */
export async function auffrischen(proxy, ids, { pause = 3000, warte = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log } = {}) {
  let fehlerZahl = 0;
  for (const [i, id] of ids.entries()) {
    const a = fehler(await proxy.execute(SETZEN, { id }), 'tagsAdd');
    // Entfernen auch dann versuchen, wenn das Setzen gemeldet hat - der Tag darf nie haengen bleiben.
    const b = fehler(await proxy.execute(ENTFERNEN, { id }), 'tagsRemove');
    if (a || b) { fehlerZahl++; log(`${id}: ${a || b}`); }
    if ((i + 1) % 100 === 0) log(`${i + 1}/${ids.length} neu gespeichert`);
    if (i < ids.length - 1) await warte(pause);
  }
  return fehlerZahl;
}

const VARIANTEN = `query($id: ID!) { product(id: $id) { variants(first: 250) {
  pageInfo { hasNextPage } nodes { id media(first: 1) { nodes { id } } } } } }`;
const ABHAENGEN = `mutation($p: ID!, $m: [ProductVariantDetachMediaInput!]!) {
  productVariantDetachMedia(productId: $p, variantMedia: $m) { userErrors { message } } }`;
const ANHAENGEN = `mutation($p: ID!, $m: [ProductVariantAppendMediaInput!]!) {
  productVariantAppendMedia(productId: $p, variantMedia: $m) { userErrors { message } } }`;

/** Variante -> Medien-ID, nur Varianten mit Bild. */
async function variantenMedien(proxy, id) {
  const v = (await proxy.execute(VARIANTEN, { id }))?.product?.variants;
  if (!v) throw new Error(`${id}: Produkt nicht lesbar`);
  if (v.pageInfo.hasNextPage) throw new Error(`${id}: mehr als 250 Varianten`);
  return v.nodes.filter((n) => n.media.nodes[0]).map((n) => ({ variantId: n.id, mediaIds: [n.media.nodes[0].id] }));
}

// Shopify erlaubt hoechstens 100 Varianten-Medien-Paare je Aufruf.
export const JE_AUFRUF = 100;

async function stapelweise(proxy, query, feld, id, paare) {
  const meldungen = [];
  for (let i = 0; i < paare.length; i += JE_AUFRUF) {
    const f = fehler(await proxy.execute(query, { p: id, m: paare.slice(i, i + JE_AUFRUF) }), feld);
    if (f) meldungen.push(f);
  }
  return meldungen.join('; ');
}

/** Haengt die Variantenbilder eines Produkts ab und wieder an; gibt eine Fehlermeldung oder '' zurueck. */
export async function medienNeuAnhaengen(proxy, id) {
  const vorher = await variantenMedien(proxy, id);
  if (!vorher.length) return '';
  const ab = await stapelweise(proxy, ABHAENGEN, 'productVariantDetachMedia', id, vorher);
  // Immer wieder anhaengen, auch nach einem Fehler beim Abhaengen - keine Variante darf ohne Bild bleiben.
  let an = await stapelweise(proxy, ANHAENGEN, 'productVariantAppendMedia', id, vorher);
  const nachher = new Set((await variantenMedien(proxy, id)).map((v) => v.variantId));
  const fehlt = vorher.filter((v) => !nachher.has(v.variantId));
  if (fehlt.length) {
    an = (await stapelweise(proxy, ANHAENGEN, 'productVariantAppendMedia', id, fehlt)) || an;
    const zweit = new Set((await variantenMedien(proxy, id)).map((v) => v.variantId));
    const immerNoch = fehlt.filter((v) => !zweit.has(v.variantId)).length;
    if (immerNoch) return `${immerNoch} Varianten ohne Bild: ${an || 'unbekannt'}`;
  }
  return ab || an;
}

async function main(argv) {
  const o = { pause: 3000, limit: Infinity, trocken: false, medien: false, abfrage: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pause') o.pause = Number(argv[++i]);
    else if (argv[i] === '--limit') o.limit = Number(argv[++i]);
    else if (argv[i] === '--trocken') o.trocken = true;
    else if (argv[i] === '--medien') o.medien = true;
    else if (argv[i] === '--abfrage') o.abfrage = argv[++i];
    else throw new Error(`unbekannte Option: ${argv[i]}`);
  }
  const proxy = new GraphQLProxy();
  if (!proxy.live) throw new Error('SHOPIFY_ADMIN_TOKEN fehlt.');
  const ids = (await produktIds(proxy, o.abfrage)).slice(0, o.limit);
  console.log(`${ids.length} aktive Produkte im Kanal Facebook & Instagram (${abfrage(o.abfrage)}), Pause ${o.pause} ms${o.medien ? ', Variantenbilder neu anhaengen' : ''}`);
  if (o.trocken) return;
  if (o.medien) {
    let fehlerZahl = 0;
    for (const [i, id] of ids.entries()) {
      const f = await medienNeuAnhaengen(proxy, id);
      if (f) { fehlerZahl++; console.log(`${id}: ${f}`); }
      if ((i + 1) % 25 === 0) console.log(`${i + 1}/${ids.length} Produkte`);
      if (i < ids.length - 1) await new Promise((r) => setTimeout(r, o.pause));
    }
    console.log(`fertig: ${ids.length - fehlerZahl} Produkte mit neu angehaengten Variantenbildern, ${fehlerZahl} Fehler`);
    if (fehlerZahl) process.exit(1);
    return;
  }
  const fehlerZahl = await auffrischen(proxy, ids, { pause: o.pause });
  const uebrig = (await proxy.execute(UEBRIG))?.productsCount?.count;
  console.log(`fertig: ${ids.length - fehlerZahl} neu gespeichert, ${fehlerZahl} Fehler, Tag "${TAG}" noch an ${uebrig} Produkten`);
  if (fehlerZahl || uebrig) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(2); });
}
