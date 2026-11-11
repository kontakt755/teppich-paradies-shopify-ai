#!/usr/bin/env node
/**
 * Zusatzfeed "nach Mass" ausserhalb von Teppich nach Mass (Werkbank w-331) - nur lesend.
 *
 *   node operations/scripts/feed-nachmass-abruf.mjs --aus tp-nachmass-preise.txt --pruefung tp-nachmass-pruefung.json
 *
 * Laeufer, Treppenkanten (Variantenpreis je cm) und Sauberlaufmatten (je 0,01 m2)
 * standen mit 0,18 bis 1,76 EUR in Google Shopping. Der Feed nennt je Variante den
 * Endpreis einer Beispielgroesse (Inhaber 2026-11-11: Laeufer 200 cm, Matte 60 x 90 cm,
 * Treppenkante 3 x 100 cm) und den Link, der genau diese Groesse oeffnet.
 *
 * Wie beim Vorbild (scripts/teppich-nach-mass-feed.mjs): Der Preis kommt aus dem
 * Product-JSON-LD der Seite - das liest auch Google - und wird mit den Daten des
 * Rechners auf der Seite und dem Admin-Preis nachgerechnet. Jede Abweichung laesst
 * die Zeile aus; bei einer einzigen Auslassung wird keine Datei ersetzt.
 *
 * Auswahl wie die Ausschlussregel im Merchant Center: Adresse enthaelt "nach-mass",
 * Produktart nicht "Teppich nach Maß".
 *
 * shortcut: kein Vorher-Abgleich wie beim TNM-Feed. Im Merchant Center bleibt die
 * Ausschlussregel bestehen und gilt nur noch fuer Angebote ohne Zeile in dieser
 * Quelle (domains/shopify/google-feed-flaechenware.md) - was hier fehlt, ist also
 * nicht in Shopping. Nachruesten, falls die Regel je entfaellt.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { GraphQLProxy } from '../../workflow/graphql-proxy.mjs';
import { TNM_TYP, GRATIS_AB } from './feed-titel.mjs';
import { seiteLaden, zeilenFuerProdukt, abrufTaktung, tsv, geld, GOOGLE_SPALTEN } from '../../scripts/teppich-nach-mass-feed.mjs';
import { Keks, SHOP } from '../../scripts/teppich-basis-daten.mjs';

createRequire(import.meta.url)('../../assets/tp-laengen-zuschnitt.js');
const L = globalThis.TPLaengenZuschnitt;

// title:nach* statt der Wortgruppe 'nach Maß': die liefert ueber die Admin API nichts (Fehllauf 2026-11-11).
// Zu breite Treffer ("Nachtgrau") faengt gehoertDazu ueber die Adresse ab.
export const ABFRAGE = `query($nach: String) {
  products(first: 25, after: $nach, query: "status:active title:nach* -product_type:'${TNM_TYP}'") {
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

export const gehoertDazu = (p) => p?.status === 'ACTIVE' && p.productType !== TNM_TYP
  && typeof p.handle === 'string' && p.handle.includes('nach-mass') && Boolean(p.onlineStoreUrl);

export async function katalog(proxy) {
  const produkte = [];
  let nach = null;
  for (let i = 0; i < 100; i++) {
    const seite = (await proxy.execute(ABFRAGE, { nach }))?.products;
    if (!seite?.nodes || !seite.pageInfo) throw new Error('Admin API lieferte keine products - Zugriff pruefen.');
    for (const p of seite.nodes) {
      if (!gehoertDazu(p)) continue;
      if (!p.variants?.nodes?.length || p.variants.pageInfo?.hasNextPage !== false) throw new Error(`${p.handle}: Varianten fehlen oder mehr als 250.`);
      produkte.push({ ...p, bild: p.featuredMedia?.preview?.image?.url ?? null, variants: p.variants.nodes });
    }
    if (!seite.pageInfo.hasNextPage) return produkte.sort((a, b) => a.handle.localeCompare(b.handle));
    nach = seite.pageInfo.endCursor;
    if (!nach) throw new Error('Admin API: Seiten-Cursor fehlt.');
  }
  throw new Error('Admin API: zu viele Seiten.');
}

const nummer = (gid) => String(gid).split('/').pop();
const cent = (euro) => Math.round(Number(euro) * 100);

/** Beispielangebote aus dem JSON-LD: Varianten-ID -> { laenge, anzahl, cent, altCent, pfad }. */
export function laengenAngebote(gruppe) {
  const je = new Map();
  for (const v of gruppe?.hasVariant ?? []) {
    let url;
    try { url = new URL(v?.offers?.url ?? v?.url); } catch { continue; }
    const id = url.searchParams.get('variant');
    const laenge = Number(url.searchParams.get('laenge'));
    const anzahl = Number(url.searchParams.get('anzahl'));
    if (!id || !(laenge > 0) || !(anzahl > 0)) continue;
    const streich = [].concat(v.offers.priceSpecification ?? []).find((s) => s?.priceType === 'https://schema.org/StrikethroughPrice');
    if (je.has(id)) throw new Error(`Doppelte Beispiel-Variante im JSON-LD: ${id}`);
    je.set(id, { laenge, anzahl, cent: cent(v.offers.price), altCent: streich ? cent(streich.price) : 0, currency: v.offers.priceCurrency, availability: v.offers.availability, pfad: `${url.pathname}${url.search}` });
  }
  return je;
}

/** Endpreis wie im Block tp-laengen-zuschnitt, wenn der Link ?laenge=&anzahl= traegt. */
export function rechnerPreis(d, variantId, laenge, anzahl) {
  const t = (d?.varianten ?? []).filter(Boolean).find((v) => String(v.id) === String(variantId));
  if (!t) return { fehler: 'Variante im Rechner nicht angeboten' };
  const laeufer = d.modus === 'laeufer';
  let zusatz = 0;
  if (laeufer) {
    // Der Link waehlt die erste Einfassung zur Breite vor (assets/tp-laengen-zuschnitt.js, ausLink).
    const ef = L.einfassungenFuer((d.einfassungen ?? []).filter(Boolean), t.breite)[0];
    if (!ef || !(d.pauschale?.price > 0)) return { fehler: 'Einfassung zur Breite oder Pauschale fehlt' };
    zusatz = ef.price + d.pauschale.price;
  }
  const lg = L.laengeFuer('zuschnitt', String(laenge), !laeufer && d.stangen ? t.stange_cm : 0, d.max_cm);
  const erg = L.rechnen({
    laenge: lg.laenge, anzahl: String(anzahl), preisCent: t.price, vergleichCent: t.compare_at_price, zusatzCent: zusatz,
    sperrgut: !laeufer && d.sperrgut ? { preisCent: d.sperrgut.price, abCm: d.sperrgut.ab_cm, schonDa: false } : null,
    minCm: d.min_cm, maxCm: lg.maxCm, maxStueck: d.max_stueck, art: 'zuschnitt', minGesamtCm: laeufer ? 0 : d.min_gesamt_cm,
  });
  if (!erg.ok) return { fehler: erg.fehler || 'Beispielgroesse nicht bestellbar' };
  return { summe: erg.summeCent, alt: erg.altSummeCent, menge: erg.menge, preis: t.price, preisAlt: Number(t.compare_at_price) || 0, available: t.available, laeufer };
}

/** Zeilen fuer Laeufer und Treppenkanten; jede Abweichung ist ein Fehler, nichts wird geschaetzt. */
export function zeilenFuerLaengenware(produkt, seite, { shop = SHOP } = {}) {
  const zeilen = [];
  const fehler = [];
  const pid = nummer(produkt.id);
  const melde = (v, grund) => fehler.push({ handle: produkt.handle, variante: v ? nummer(v.id) : null, grund });
  if (!seite?.gruppe) { melde(null, 'kein Product-JSON-LD auf der Seite'); return { zeilen, fehler }; }
  const angebote = laengenAngebote(seite.gruppe);
  for (const v of produkt.variants) {
    const vid = nummer(v.id);
    const a = angebote.get(vid);
    if (!a) { melde(v, 'keine Beispielgroesse im JSON-LD'); continue; }
    if (a.currency !== 'EUR') { melde(v, 'JSON-LD-Waehrung fehlt oder ist nicht EUR'); continue; }
    const k = rechnerPreis(seite.lz, vid, a.laenge, a.anzahl);
    if (k.fehler) { melde(v, `Rechner: ${k.fehler}`); continue; }
    if (k.summe !== a.cent) { melde(v, `JSON-LD ${geld(a.cent)} != Rechner ${geld(k.summe)}`); continue; }
    if (k.alt !== a.altCent) { melde(v, `Streichpreis JSON-LD ${geld(a.altCent)} != Rechner ${geld(k.alt)}`); continue; }
    if (cent(v.price) !== k.preis) { melde(v, `Variantenpreis Admin ${v.price} != Seite ${(k.preis / 100).toFixed(2)} (Seiten-Cache?)`); continue; }
    if (cent(v.compareAtPrice) > cent(v.price) && !k.alt) { melde(v, 'Vergleichspreis ohne sichtbare Aktion'); continue; }
    if (k.alt && cent(v.compareAtPrice) !== k.preisAlt) { melde(v, 'Vergleichspreis Admin != Seite (Seiten-Cache?)'); continue; }
    const schema = v.availableForSale ? ['https://schema.org/InStock', 'https://schema.org/LimitedAvailability'] : ['https://schema.org/OutOfStock'];
    if (typeof v.availableForSale !== 'boolean' || v.availableForSale !== k.available || !schema.includes(a.availability)) {
      melde(v, 'Verfuegbarkeit Admin, Rechner und JSON-LD fehlt oder weicht ab');
      continue;
    }
    const pfad = `/products/${produkt.handle}?variant=${vid}&laenge=${a.laenge}&anzahl=${a.anzahl}`;
    if (a.pfad !== pfad) { melde(v, `Link im JSON-LD weicht ab: ${a.pfad}`); continue; }
    const optionen = (v.selectedOptions ?? []).map((o) => o.value).filter((w) => w && w !== 'Default Title').join(', ');
    const groesse = k.laeufer ? `${a.laenge} cm lang, eingefasst` : `${a.anzahl} x ${a.laenge} cm`;
    zeilen.push({
      googleId: `shopify_ZZ_${pid}_${vid}`,
      handle: produkt.handle,
      groesse: `${a.anzahl} x ${a.laenge} cm`,
      title: `${produkt.title}${optionen ? ` ${optionen}` : ''}, ${groesse}`.slice(0, 150),
      price: geld(k.alt || k.summe),
      salePrice: k.alt ? geld(k.summe) : '',
      link: `${shop}${pfad}`,
      mass: `${k.menge / 100} m`,
      basis: '1 m',
      availability: v.availableForSale ? 'in_stock' : 'out_of_stock',
    });
  }
  return { zeilen, fehler };
}

export const googleZeile = (z) => [z.googleId, z.title, z.price, z.salePrice, z.link, z.mass ?? z.flaeche, z.basis ?? '1 sqm', GRATIS_AB, z.availability];

/** Alle Produkte seriell abrufen (ein 429 beendet den Lauf) und Zeilen samt Pruefprotokoll liefern. */
export async function feedErzeugen(produkte, { laden = seiteLaden, jetzt, pause } = {}) {
  if (!Array.isArray(produkte) || !produkte.length) throw new Error('Keine Produkte nach Mass gefunden.');
  const keks = new Keks();
  const vorAbruf = abrufTaktung({ jetzt, pause });
  const zeilen = [];
  const fehler = [];
  for (const p of produkte) {
    try {
      const seite = await laden(p.handle, keks, null, { vorAbruf });
      // Matten laufen ueber den Einfass-Konfigurator wie Teppich nach Mass.
      const r = seite.lz ? zeilenFuerLaengenware(p, seite) : zeilenFuerProdukt(p, seite);
      zeilen.push(...r.zeilen);
      fehler.push(...r.fehler);
    } catch (e) {
      fehler.push({ handle: p.handle, variante: null, grund: `Seite: ${e.message}` });
      if (e.status === 429) break;
    }
  }
  const varianten = produkte.reduce((n, p) => n + p.variants.length, 0);
  const groessen = {};
  for (const z of zeilen) groessen[z.groesse] = (groessen[z.groesse] || 0) + 1;
  zeilen.sort((a, b) => a.googleId.localeCompare(b.googleId));
  return { zeilen, pruefung: { format: 'tp-nachmass-endpreis-v1', ok: !fehler.length && zeilen.length === varianten, erstellt: new Date().toISOString(), produkte: produkte.length, varianten, zeilen: zeilen.length, groessen, ausgelassen: fehler } };
}

async function main(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--aus', '--pruefung'].includes(argv[i]) || !argv[i + 1]) throw new Error(`unbekannte Option oder Wert fehlt: ${argv[i]}`);
    o[argv[i].slice(2)] = argv[i + 1];
  }
  if (!o.aus || !o.pruefung) throw new Error('--aus und --pruefung sind erforderlich.');
  const proxy = new GraphQLProxy();
  if (!proxy.live) throw new Error('Vorhandener SHOPIFY_ADMIN_TOKEN fehlt.');
  const { zeilen, pruefung } = await feedErzeugen(await katalog(proxy));
  fs.writeFileSync(o.pruefung, `${JSON.stringify(pruefung, null, 2)}\n`);
  if (!pruefung.ok) {
    for (const f of pruefung.ausgelassen.slice(0, 10)) console.error(`Nachmass-Pruefung: ${JSON.stringify(f)}`);
    throw new Error(`${pruefung.ausgelassen.length} Auslassungen: keine Feeddatei ersetzt.`);
  }
  fs.writeFileSync(`${o.aus}.tmp`, tsv(GOOGLE_SPALTEN, zeilen.map(googleZeile)));
  fs.renameSync(`${o.aus}.tmp`, o.aus);
  console.log(`${zeilen.length} validierte Beispiel-Endpreise (${Object.entries(pruefung.groessen).map(([k, n]) => `${k}: ${n}`).join(', ')}).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(2); });
}
