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
 * Aufruf: node operations/scripts/meta-bilder-auffrischen.mjs [--pause 3000] [--limit 50] [--trocken]
 * In GitHub Actions: .github/workflows/meta-bilder-auffrischen.yml (nur manuell).
 */
import { pathToFileURL } from 'node:url';
import { GraphQLProxy } from '../../workflow/graphql-proxy.mjs';

export const META_KANAL = '376821973326';
export const TAG = 'meta-sync';

const LISTE = `query($nach: String) {
  products(first: 250, after: $nach, query: "publication_ids:${META_KANAL} status:active") {
    pageInfo { hasNextPage endCursor }
    nodes { id }
  }
}`;
const SETZEN = `mutation($id: ID!) { tagsAdd(id: $id, tags: ["${TAG}"]) { userErrors { message } } }`;
const ENTFERNEN = `mutation($id: ID!) { tagsRemove(id: $id, tags: ["${TAG}"]) { userErrors { message } } }`;
const UEBRIG = `{ productsCount(query: "tag:${TAG}") { count } }`;

export async function produktIds(proxy) {
  const ids = [];
  let nach = null;
  do {
    const seite = (await proxy.execute(LISTE, { nach }))?.products;
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

async function main(argv) {
  const o = { pause: 3000, limit: Infinity, trocken: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pause') o.pause = Number(argv[++i]);
    else if (argv[i] === '--limit') o.limit = Number(argv[++i]);
    else if (argv[i] === '--trocken') o.trocken = true;
    else throw new Error(`unbekannte Option: ${argv[i]}`);
  }
  const proxy = new GraphQLProxy();
  if (!proxy.live) throw new Error('SHOPIFY_ADMIN_TOKEN fehlt.');
  const ids = (await produktIds(proxy)).slice(0, o.limit);
  console.log(`${ids.length} aktive Produkte im Kanal Facebook & Instagram, Pause ${o.pause} ms`);
  if (o.trocken) return;
  const fehlerZahl = await auffrischen(proxy, ids, { pause: o.pause });
  const uebrig = (await proxy.execute(UEBRIG))?.productsCount?.count;
  console.log(`fertig: ${ids.length - fehlerZahl} neu gespeichert, ${fehlerZahl} Fehler, Tag "${TAG}" noch an ${uebrig} Produkten`);
  if (fehlerZahl || uebrig) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(2); });
}
