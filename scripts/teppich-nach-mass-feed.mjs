#!/usr/bin/env node
/**
 * Zusatzfeed Teppich nach Mass fuer Google Merchant Center und Meta (#1283) - nur lesend.
 *
 *   npm run -s feed:teppich-nach-mass                        # Seiten aus dem Live-Theme
 *   npm run -s feed:teppich-nach-mass -- --theme <id>        # Seiten aus einem Dev-/Vorschau-Theme
 *   npm run -s feed:teppich-nach-mass -- --handles a,b       # nur diese Produkte
 *   npm run -s feed:teppich-nach-mass -- --aus <ordner>      # Standard: ~/teppich-paradies-analyse/teppich-nach-mass-feed
 *   npm run -s feed:teppich-nach-mass -- --katalog <json>    # expliziter, aktueller MCP-Vollkatalog statt CLI
 *
 * ─── Warum ────────────────────────────────────────────────────────────
 * Der Variantenpreis eines Teppichs nach Mass gilt je 0,01 m2 (z. B. 0,85 EUR). Die
 * Kanaele (Google & YouTube, Facebook & Instagram) zeigen nur diesen Preis - deshalb
 * koennen diese Rohpreise nicht als Teppich-Endpreise verwenden. Der Feed nennt je
 * Farbe Titel, Preis und Link mit einer Beispielgroesse: "… Teppich nach Maß Sand,
 * 80 x 150 cm" zum Endpreis genau dieses Masses, Link mit ?variant=&breite=&laenge=
 * (der Konfigurator belegt die Felder vor und zeigt denselben Endpreis). Shopify-Preise
 * und Varianten bleiben unveraendert.
 *
 * ─── Woher die Werte kommen ───────────────────────────────────────────
 * - Admin API (lokal CLI/MCP-Export, Tagesjob vorhandener GraphQLProxy/OAuth): alle aktiven Produkte der
 *   Produktart "Teppich nach Maß" mit Varianten - IDs fuer die Feed-id, Variantenpreis
 *   und Vergleichspreis als Gegenprobe.
 * - Produktseite: Beispielgroesse und Preis aus dem Product-JSON-LD
 *   (snippets/tp-mass-beispiel.liquid - dieselbe Quelle, die Google auf der Seite liest)
 *   und als Gegenprobe die Daten des Konfigurators (data-tp-ek-daten), nachgerechnet mit
 *   dem Rechenkern assets/tp-masstepich-rechnung.js genau wie im Konfigurator.
 *   Weichen JSON-LD, Konfigurator oder Admin-Preis ab, faellt die Zeile heraus und steht
 *   mit Grund in pruefung.json - nie ein geschaetzter Preis.
 *
 * ─── Ausgabe (nicht ins Repository) ───────────────────────────────────
 *   google-teppich-nach-mass.csv / .txt  id (shopify_ZZ_<Produkt>_<Variante>, wie die
 *       Google-&-YouTube-App), title, price, sale_price, link, unit_pricing_measure,
 *       unit_pricing_base_measure, free_shipping_threshold, availability
 *   meta-teppich-nach-mass.csv           bisheriger Meta-Vollkatalog mit zwoelf Feldern;
 *       id = Varianten-ID, item_group_id = Produkt-ID, Bilder/Zustand/Verfuegbarkeit bleiben
 *   pruefung.json                        Zaehler, ausgelassene Zeilen mit Grund, Stichproben
 *
 * Preis/sale_price: Bei sichtbarer Aktion (Streichpreis auf der Seite) ist price der alte
 * und sale_price der aktuelle Endpreis - wie die Apps es aus compare_at_price machen.
 * Ohne Aktion bleibt sale_price leer; dann darf die Variante auch keinen hoeheren
 * Vergleichspreis tragen (die App schickte sonst sale_price = 0,01-m2-Preis) - solche
 * Zeilen fallen heraus.
 *
 * Tagesjob: operations/scripts/feed-tnm-abruf.mjs nutzt denselben Builder und
 * veroeffentlicht beide bisherigen Dateien gemeinsam. Nach jeder Preis-, Aktions-
 * oder Sortimentsaenderung denselben Job ausloesen und Quellen verarbeiten lassen.
 * Kanal-Freigabe erst nach verifiziertem Ingest, nicht schon nach einem Feed-Commit.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Keks, holen, SHOP, MYSHOPIFY } from './teppich-basis-daten.mjs';
import { feedTitel, GRATIS_AB } from '../operations/scripts/feed-titel.mjs';

createRequire(import.meta.url)('../assets/tp-masstepich-rechnung.js');
const M = globalThis.TPMass;

export const STORE = 'sjjyq1-6w.myshopify.com';
export const PRODUKTART = 'Teppich nach Maß';
export const AUS_STANDARD = path.join(os.homedir(), 'teppich-paradies-analyse', 'teppich-nach-mass-feed');
const PARALLEL = 4;

/* ─── Aufruf ─────────────────────────────────────────────────────────── */

const MIT_WERT = ['theme', 'handles', 'aus', 'katalog'];

export function argumente(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) throw new Error(`unerwartetes Argument: ${k}`);
    const name = k.slice(2);
    if (!MIT_WERT.includes(name)) throw new Error(`unbekannte Option: ${k}`);
    const wert = argv[i + 1];
    if (wert == null || wert.startsWith('--')) throw new Error(`${k} ohne Wert`);
    o[name] = wert;
    i += 1;
  }
  if (o.theme != null && !/^\d+$/.test(o.theme)) throw new Error('--theme als Theme-ID (Zahl)');
  if (o.handles != null) o.handles = o.handles.split(',').map((h) => h.trim()).filter(Boolean);
  o.aus = o.aus ? path.resolve(o.aus) : AUS_STANDARD;
  return o;
}

/* ─── Admin API (nur lesen) ──────────────────────────────────────────── */

export const PRODUKTE_QUERY = `query TnmProdukte($after: String, $q: String!) {
  products(first: 100, after: $after, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { id handle title productType status onlineStoreUrl updatedAt vendor description featuredMedia { preview { image { url } } } }
  }
}`;

export const VARIANTEN_QUERY = `query TnmVarianten($after: String, $q: String!) {
  productVariants(first: 250, after: $after, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { id title price compareAtPrice availableForSale selectedOptions { name value } image { url } product { id } }
  }
}`;

/** Fuehrt eine Abfrage per Shopify CLI aus (ohne --allow-mutations, also nur lesend). */
export function cliAbfrage(store = STORE) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-tnm-feed-'));
  return (query, variables) => {
    const qf = path.join(dir, 'abfrage.graphql');
    const vf = path.join(dir, 'variablen.json');
    fs.writeFileSync(qf, query);
    fs.writeFileSync(vf, JSON.stringify(variables ?? {}));
    let out;
    try {
      out = execFileSync('shopify', ['store', 'execute', '-s', store, '-j', '--query-file', qf, '--variable-file', vf],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
      const meldung = String(e.stderr || e.message).split('\n').filter((z) => /error|fehler|denied|auth/i.test(z)).slice(0, 3).join(' ');
      throw new Error(`shopify store execute fehlgeschlagen: ${meldung || e.message}`);
    }
    return JSON.parse(out);
  };
}

async function alleSeiten(abfrage, query, feld, q) {
  const liste = [];
  let after = null;
  for (let i = 0; i < 200; i++) {
    const r = await abfrage(query, { after, q });
    const verbindung = r?.[feld];
    if (!verbindung) throw new Error(`Admin API: Feld ${feld} fehlt in der Antwort`);
    liste.push(...verbindung.nodes);
    if (!verbindung.pageInfo.hasNextPage) return liste;
    after = verbindung.pageInfo.endCursor;
  }
  throw new Error(`Admin API: zu viele Seiten fuer ${feld}`);
}

const nummer = (gid) => String(gid).split('/').pop();

/** Alle aktiven Teppiche nach Mass mit ihren Varianten. */
export async function adminLaden(abfrage) {
  const art = `product_type:'${PRODUKTART}'`;
  const produkte = (await alleSeiten(abfrage, PRODUKTE_QUERY, 'products', `${art} status:active`))
    .filter((p) => p.productType === PRODUKTART && p.status === 'ACTIVE');
  const varianten = await alleSeiten(abfrage, VARIANTEN_QUERY, 'productVariants', `${art} product_status:active`);
  const je = new Map(produkte.map((p) => [p.id, { ...p, variants: [] }]));
  for (const v of varianten) je.get(v.product.id)?.variants.push(v);
  return [...je.values()].sort((a, b) => a.handle.localeCompare(b.handle));
}

/** Expliziter, vollstaendiger MCP-Export; kein stiller Ersatz durch alte lokale Daten. */
export function katalogAusJson(text, jetzt = Date.now()) {
  const k = JSON.parse(text);
  const zeit = Date.parse(k.capturedAt);
  if (k.format !== 'tp-tnm-katalog-v1' || k.complete !== true || !Array.isArray(k.products)) {
    throw new Error('Katalog braucht format=tp-tnm-katalog-v1, complete=true, capturedAt und products.');
  }
  if (!Number.isFinite(zeit) || zeit > jetzt + 60_000 || jetzt - zeit > 30 * 60_000) {
    throw new Error('Katalog-Export fehlt ein aktueller Zeitstempel (hoechstens 30 Minuten alt).');
  }
  if (!k.products.length) throw new Error('Katalog-Export ist leer.');
  return k.products;
}

/* ─── Produktseite auswerten ─────────────────────────────────────────── */

/** ProductGroup aus dem JSON-LD und die Konfigurator-Daten der Seite. */
export function seiteAuswerten(html) {
  let gruppe = null;
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const k = JSON.parse(m[1]);
      if (k && k['@type'] === 'ProductGroup') { gruppe = k; break; }
    } catch { /* fremdes oder kaputtes JSON-LD: weiter suchen */ }
  }
  let ek = null;
  const m = html.match(/<script type="application\/json" data-tp-ek-daten>([\s\S]*?)<\/script>/);
  if (m) {
    try { ek = JSON.parse(m[1]); } catch { ek = null; }
  }
  return { gruppe, ek };
}

const cent = (euro) => Math.round(Number(euro) * 100);

/** Beispielangebote aus dem JSON-LD: Varianten-ID -> { w, l, cent, altCent, pfad }. */
export function beispielAngebote(gruppe) {
  const je = new Map();
  for (const v of gruppe?.hasVariant ?? []) {
    let url;
    try { url = new URL(v?.offers?.url ?? v?.url); } catch { continue; }
    const id = url.searchParams.get('variant');
    const w = Number(url.searchParams.get('breite'));
    const l = Number(url.searchParams.get('laenge'));
    if (!id || !(w > 0) || !(l > 0)) continue;
    const specs = [].concat(v.offers.priceSpecification ?? []);
    const streich = specs.find((s) => s?.priceType === 'https://schema.org/StrikethroughPrice');
    if (je.has(id)) throw new Error(`Doppelte Beispiel-Variante im JSON-LD: ${id}`);
    je.set(id, { w, l, cent: cent(v.offers.price), altCent: streich ? cent(streich.price) : 0, currency: v.offers.priceCurrency, availability: v.offers.availability, pfad: `${url.pathname}${url.search}` });
  }
  return je;
}

/**
 * Endpreis wie im Konfigurator (assets/tp-einfass-konfigurator.js, rechnen()), Rechteck.
 * Liefert { summe, alt, einheiten, mindest, preis, fehler[] }.
 */
export function konfiguratorPreis(ek, variantId, w, l) {
  const fehler = [];
  const t = (ek?.varianten ?? []).filter(Boolean).find((v) => String(v.id) === String(variantId));
  if (!t) return { fehler: ['Farbe im Konfigurator nicht angeboten'] };
  if (!(ek.max_breite_cm > 0) || !(ek.max_laenge_cm > 0)) fehler.push('Konfigurator ohne Massgrenzen');
  const kanteInklusive = ek.art === 'ketteln' && ek.kante_inklusive === true;
  const kettel = (!kanteInklusive && ek.kettel && ek.kettel.id && parseInt(ek.kettel.price, 10) > 0) ? ek.kettel : null;
  if (!kanteInklusive && ek.kettel_service_failed) fehler.push('Kettelservice nicht kaufbar');
  const pauschale = (ek.pauschale && ek.pauschale.id && parseInt(ek.pauschale.price, 10) > 0) ? ek.pauschale : null;
  if (ek.pauschale_failed) fehler.push('Pauschale nicht kaufbar');
  if (ek.zuschnitt) fehler.push('Sonderposten mit Rollenzuschnitt');
  const ersteForm = Array.isArray(ek.formen) ? ek.formen.find(Boolean) : null;
  if (ersteForm && ersteForm !== 'rechteck') fehler.push(`Konfigurator waehlt zuerst ${ersteForm}, nicht Rechteck`);
  const minCm = Number(ek.min_seite_cm) > 0 ? Math.round(Number(ek.min_seite_cm)) : 50;
  if (typeof t.available !== 'boolean') fehler.push('Verfuegbarkeit fehlt im Konfigurator');
  const preis = parseInt(t.price, 10);
  if (!(preis > 0)) fehler.push('Variante ohne Preis');
  const maxW = Number(t.max_breite_cm) > 0 ? Number(t.max_breite_cm) : ek.max_breite_cm;
  const kgProQm = Number(ek.kg_pro_qm) > 0 ? Number(ek.kg_pro_qm) : 0;
  const maxKg = Number(ek.max_gewicht_kg) > 0 ? Number(ek.max_gewicht_kg) : 0;
  fehler.push(...M.pruefeMasse({ form: 'rechteck', w, l, maxW, maxL: ek.max_laenge_cm, minW: minCm, minL: minCm, maxKg, kgProQm }));

  const mindestCent = parseInt(ek.mindestpreis_cent, 10) || 0;
  const flaeche = M.abrechnungsflaecheM2('rechteck', w, l);
  const einheiten = M.mengeHundertstelM2(flaeche);
  const kantenEinheiten = kettel ? M.kanteEinheiten(M.umfangM('rechteck', w, l)) : 0;
  const kettelCent = kantenEinheiten * (kettel ? parseInt(kettel.price, 10) : 0);
  const pauschaleCent = pauschale ? parseInt(pauschale.price, 10) : 0;
  const rest = Math.max(0, mindestCent - kettelCent);
  const menge = M.mengeMitMindestpreis(flaeche, preis, rest);
  const summe = menge * preis + kettelCent + pauschaleCent;
  let alt = 0;
  const preisAlt = parseInt(t.compare_at_price, 10);
  if (preisAlt > preis) {
    const mengeAlt = M.mengeMitMindestpreis(flaeche, preisAlt, rest);
    const altSumme = mengeAlt * preisAlt + kettelCent + pauschaleCent;
    if (mengeAlt === einheiten && altSumme > summe) alt = altSumme;
  }
  return { summe, alt, einheiten, mindest: menge > einheiten, preis, preisAlt: Number.isFinite(preisAlt) ? preisAlt : 0, available: t.available, fehler };
}

/* ─── Zeilen ─────────────────────────────────────────────────────────── */

const FARB_OPTIONEN = ['farbe', 'color', 'dekor'];
const farbeVon = (v) => v.selectedOptions?.find((o) => FARB_OPTIONEN.includes(String(o.name).toLowerCase()))?.value ?? null;
export const geld = (c) => `${(c / 100).toFixed(2)} EUR`;
const zahl = (x) => String(Math.round(Number(x) * 1000) / 1000);

/**
 * Zeilen fuer ein Produkt. produkt: Admin-Daten mit variants, seite: seiteAuswerten().
 * Liefert { zeilen, fehler } - jede Abweichung ist ein Fehler, keine Zeile wird geschaetzt.
 */
export function zeilenFuerProdukt(produkt, seite, { shop = SHOP } = {}) {
  const zeilen = [];
  const fehler = [];
  const pid = nummer(produkt.id);
  const melde = (variante, grund) => fehler.push({ handle: produkt.handle, variante: variante ? nummer(variante.id) : null, farbe: variante ? farbeVon(variante) : null, grund });
  if (!produkt.onlineStoreUrl) { melde(null, 'nicht im Onlineshop veroeffentlicht'); return { zeilen, fehler }; }
  if (!seite?.gruppe) { melde(null, 'kein Product-JSON-LD auf der Seite'); return { zeilen, fehler }; }
  if (!seite?.ek) { melde(null, 'kein Konfigurator auf der Seite'); return { zeilen, fehler }; }
  const angebote = beispielAngebote(seite.gruppe);
  const farben = new Set(produkt.variants.map(farbeVon).filter(Boolean)).size;

  for (const v of produkt.variants) {
    const vid = nummer(v.id);
    const a = angebote.get(vid);
    if (!a) { melde(v, 'keine Beispielgroesse im JSON-LD (Theme ohne #1283 oder Farbe nicht bestellbar)'); continue; }
    if (a.currency !== 'EUR') { melde(v, 'JSON-LD-Waehrung fehlt oder ist nicht EUR'); continue; }
    const k = konfiguratorPreis(seite.ek, vid, a.w, a.l);
    if (k.fehler.length) { melde(v, `Konfigurator: ${k.fehler.join(' ')}`); continue; }
    if (k.mindest) { melde(v, `Mindestpreis greift bei ${a.w} x ${a.l} cm`); continue; }
    if (k.summe !== a.cent) { melde(v, `JSON-LD ${geld(a.cent)} != Konfigurator ${geld(k.summe)}`); continue; }
    if (k.alt !== a.altCent) { melde(v, `Streichpreis JSON-LD ${geld(a.altCent)} != Konfigurator ${geld(k.alt)}`); continue; }
    if (cent(v.price) !== k.preis) { melde(v, `Variantenpreis Admin ${v.price} != Seite ${(k.preis / 100).toFixed(2)} (Seiten-Cache?)`); continue; }
    if (k.alt && cent(v.compareAtPrice) !== k.preisAlt) {
      melde(v, 'Vergleichspreis Admin != aktiver Vergleichspreis der Seite (Seiten-Cache?)');
      continue;
    }
    if (cent(v.compareAtPrice) > cent(v.price) && !k.alt) {
      melde(v, 'Vergleichspreis ohne sichtbare Aktion: die Apps schicken sonst sale_price = 0,01-m2-Preis');
      continue;
    }
    const verfuegbar = v.availableForSale;
    const schemaVerfuegbar = verfuegbar ? ['https://schema.org/InStock', 'https://schema.org/LimitedAvailability'] : ['https://schema.org/OutOfStock'];
    if (typeof verfuegbar !== 'boolean' || verfuegbar !== k.available || !schemaVerfuegbar.includes(a.availability)) {
      melde(v, 'Verfuegbarkeit Admin, Konfigurator und JSON-LD fehlt oder weicht ab');
      continue;
    }
    const bild = v.image?.url ?? produkt.featuredMedia?.preview?.image?.url ?? produkt.bild;
    if (!bild || !/^https:\/\//.test(bild)) { melde(v, 'Meta-Vollkatalog: gueltiges Bild fehlt'); continue; }
    const pfad = `/products/${produkt.handle}?variant=${vid}&breite=${a.w}&laenge=${a.l}`;
    if (a.pfad !== pfad) { melde(v, `Link im JSON-LD weicht ab: ${a.pfad}`); continue; }
    zeilen.push({
      googleId: `shopify_ZZ_${pid}_${vid}`,
      metaId: vid,
      itemGroupId: pid,
      handle: produkt.handle,
      farbe: farbeVon(v),
      groesse: `${a.w} x ${a.l} cm`,
      title: `${feedTitel(produkt.title, v, farben)}, ${a.w} x ${a.l} cm`,
      price: geld(k.alt || k.summe),
      salePrice: k.alt ? geld(k.summe) : '',
      link: `${shop}${pfad}`,
      flaeche: `${zahl(k.einheiten / 100)} sqm`,
      endpreisCent: k.summe,
      availability: verfuegbar ? 'in_stock' : 'out_of_stock',
      description: `${String(produkt.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 4850) || produkt.title} Beispielgroesse ${a.w} x ${a.l} cm; Preis fuer den vollstaendig eingefassten Teppich.`,
      imageLink: bild,
      brand: produkt.vendor || 'Teppich Paradies',
    });
  }
  return { zeilen, fehler };
}

export const GOOGLE_SPALTEN = ['id', 'title', 'price', 'sale_price', 'link', 'unit_pricing_measure', 'unit_pricing_base_measure', 'free_shipping_threshold', 'availability'];
export const META_SPALTEN = ['id', 'item_group_id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'link', 'image_link', 'brand', 'color'];

export const googleZeile = (z) => [z.googleId, z.title, z.price, z.salePrice, z.link, z.flaeche, '1 sqm', GRATIS_AB, z.availability];
export const metaZeile = (z) => [z.metaId, z.itemGroupId, z.title, z.description, z.availability === 'in_stock' ? 'in stock' : 'out of stock', 'new', z.price, z.salePrice, z.link, z.imageLink, z.brand, z.farbe ?? ''];

/** CSV nach RFC 4180: Felder mit Komma, Anfuehrungszeichen oder Umbruch in Anfuehrungszeichen. */
export function csv(kopf, zeilen) {
  const feld = (x) => {
    const s = String(x ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [kopf, ...zeilen].map((z) => z.map(feld).join(',')).join('\n') + '\n';
}

/** Tabulatorgetrennt wie tp-feedtitel.txt; Tabs/Umbrueche in Werten werden zu Leerzeichen. */
export function tsv(kopf, zeilen) {
  return [kopf, ...zeilen].map((z) => z.map((x) => String(x ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n') + '\n';
}

/* ─── Ablauf ─────────────────────────────────────────────────────────── */

export async function seiteLaden(handle, keks, theme) {
  const r = await holen(`${SHOP}/products/${encodeURIComponent(handle)}?_tnm=${Date.now()}`, keks);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  if (theme && r.theme && r.theme !== theme) throw new Error(`Antwort kam von Theme ${r.theme} statt ${theme} (Vorschau verloren)`);
  return seiteAuswerten(r.text);
}

/** Gemeinsamer Builder fuer lokalen CLI/MCP-Lauf und vorhandenen OAuth-Tagesjob. */
export async function feedErzeugen(produkte, { theme, laden = seiteLaden } = {}) {
  if (!Array.isArray(produkte) || !produkte.length) throw new Error('Keine Teppiche nach Mass gefunden.');
  const ids = new Set();
  for (const p of produkte) {
    if (p.productType !== PRODUKTART || p.status !== 'ACTIVE' || !Number.isFinite(Date.parse(p.updatedAt)) || !Array.isArray(p.variants) || !p.variants.length) {
      throw new Error('Katalog: Produktart, Aktivstatus, updatedAt oder vollstaendige Varianten fehlen.');
    }
    for (const id of [p.id, ...p.variants.map((v) => v.id)]) {
      if (!/^gid:\/\/shopify\/(Product|ProductVariant)\/\d+$/.test(id) || ids.has(id)) throw new Error(`Katalog-ID fehlt oder doppelt: ${id}`);
      ids.add(id);
    }
  }
  const keks = new Keks();
  if (theme) await holen(`${MYSHOPIFY}/?preview_theme_id=${theme}`, keks);
  const varianten = produkte.reduce((n, p) => n + p.variants.length, 0);

  const zeilen = [];
  const fehler = [];
  let naechster = 0;
  async function arbeiter() {
    while (naechster < produkte.length) {
      const p = produkte[naechster++];
      try {
        const r = zeilenFuerProdukt(p, await laden(p.handle, keks, theme));
        zeilen.push(...r.zeilen);
        fehler.push(...r.fehler);
      } catch (e) {
        fehler.push({ handle: p.handle, variante: null, farbe: null, grund: `Seite: ${e.message}` });
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, arbeiter));
  zeilen.sort((a, b) => a.handle.localeCompare(b.handle) || a.metaId.localeCompare(b.metaId));
  const groessen = {};
  for (const z of zeilen) groessen[z.groesse] = (groessen[z.groesse] || 0) + 1;
  return { zeilen, pruefung: {
    format: 'tp-tnm-endpreis-v1',
    ok: fehler.length === 0 && zeilen.length === varianten,
    erstellt: new Date().toISOString(),
    theme: theme ?? 'live',
    produkte: produkte.length,
    varianten,
    zeilen: zeilen.length,
    groessen,
    ausgelassen: fehler,
    validierteProdukte: produkte.filter((p) => p.variants.every((v) => zeilen.some((z) => z.metaId === nummer(v.id)))).map((p) => ({ id: p.id, updatedAt: p.updatedAt, variantIds: zeilen.filter((z) => z.itemGroupId === nummer(p.id)).map((z) => z.metaId) })),
    kanalFreigabe: false,
    hinweis: 'Das Manifest veroeffentlicht keine Produkte. Freigabe erst nach verarbeiteter Endpreisquelle.',
  } };
}

async function main(argv) {
  const o = argumente(argv);
  let produkte = o.katalog ? katalogAusJson(fs.readFileSync(o.katalog, 'utf8')) : await adminLaden(cliAbfrage());
  if (o.handles) produkte = produkte.filter((p) => o.handles.includes(p.handle));
  const { zeilen, pruefung } = await feedErzeugen(produkte, { theme: o.theme });
  fs.mkdirSync(o.aus, { recursive: true });
  fs.writeFileSync(path.join(o.aus, 'pruefung.json'), `${JSON.stringify(pruefung, null, 2)}\n`);
  if (pruefung.ausgelassen.length || zeilen.length !== pruefung.varianten) {
    throw new Error(`${pruefung.ausgelassen.length} Fehler: keine Feeddatei ersetzt (Gruende in pruefung.json).`);
  }
  const g = zeilen.map(googleZeile);
  fs.writeFileSync(path.join(o.aus, 'google-teppich-nach-mass.csv'), csv(GOOGLE_SPALTEN, g));
  fs.writeFileSync(path.join(o.aus, 'google-teppich-nach-mass.txt'), tsv(GOOGLE_SPALTEN, g));
  fs.writeFileSync(path.join(o.aus, 'meta-teppich-nach-mass.csv'), csv(META_SPALTEN, zeilen.map(metaZeile)));

  console.log(`${zeilen.length} Zeilen nach ${o.aus} (google-teppich-nach-mass.csv/.txt, meta-teppich-nach-mass.csv)`);
  console.log(`Groessen: ${Object.entries(pruefung.groessen).map(([k, n]) => `${k} ${n}`).join(', ') || '-'}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(2); });
}
