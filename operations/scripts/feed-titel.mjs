#!/usr/bin/env node
/**
 * Feed-Titel fuer Google Shopping (ergaenzende Quelle im Merchant Center).
 *
 * Die Google-&-YouTube-App schickt den SEO-Titel plus Variantentitel, z. B.
 * "Vallora Teppichboden 400cm 500cm | Teppich Paradies Salbeigruen (081) / 400 cm".
 * Fuer die Shopify-Quelle bietet das Merchant Center keine Titel-Regel an; die
 * ergaenzende Quelle "tp-feedtitel.txt" (Datei, Zuordnung ueber id) ueberschreibt
 * nur den Titel. Shopify selbst bleibt unveraendert.
 *
 * Grundpreis: Die App uebertraegt den in Shopify gepflegten Grundpreis
 * (unitPriceMeasurement, z. B. 2,21 m² je Paket) nicht - Google meldet bei allen
 * Produkten "Missing unit pricing measure" (Werkbank w-076). Dieselbe Datei
 * liefert deshalb unit_pricing_measure und unit_pricing_base_measure mit, wenn
 * die Variante ihren Grundpreis zeigt (showUnitPrice). Leere Zelle = nichts
 * ueberschreiben.
 *
 * Gratisversand: Die App schickt je Artikel "Standard 4,99 EUR" ohne Grenze und
 * uebersteuert damit die Versandrichtlinie im Merchant Center. Shopify liefert in
 * Deutschland ab 50 EUR Bestellwert kostenlos (Versandprofil, Inhaber w-086,
 * 13.10.2026); die Spalte free_shipping_threshold traegt diese Grenze je Artikel
 * nach. Aendert sich die Grenze in Shopify, hier GRATIS_AB anpassen.
 *
 * Teppiche nach Mass (Produktart "Teppich nach Maß") fehlen hier bewusst: ihr
 * Variantenpreis gilt je 0,01 m2, Titel, Preis, Link und Grundpreis kommen aus dem
 * eigenen Zusatzfeed (scripts/teppich-nach-mass-feed.mjs, #1283). Hier stuende sonst
 * ein Grundpreis "0.01 sqm" neben dem Endpreis einer Beispielgroesse.
 *
 * Ablauf (nach groesseren Importen wiederholen, sonst behalten neue Produkte den Rohtitel):
 *   1. npm run -s feed:titel -- --bulk-query   -> Abfrage per bulkOperationRunQuery (Shopify-MCP) laufen lassen, JSONL laden
 *   2. npm run -s feed:titel -- --jsonl katalog.jsonl --aus tp-feedtitel.txt
 *   3. Merchant Center -> Datenquellen -> Zusaetzliche Quellen -> tp-feedtitel.txt -> Aktualisieren -> Datei hochladen
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const BULK_QUERY = `
{
  products(query: "status:active") {
    edges {
      node {
        id title productType
        variants { edges { node {
          id selectedOptions { name value }
          showUnitPrice
          unitPriceMeasurement { quantityUnit quantityValue referenceUnit referenceValue }
        } } }
      }
    }
  }
}`;

const FARB_OPTIONEN = ['farbe', 'color', 'dekor'];

/** Produktart mit eigenem Zusatzfeed (scripts/teppich-nach-mass-feed.mjs). */
export const EIGENER_FEED = 'Teppich nach Maß';

export const GRATIS_AB = 'DE:50.00 EUR';

export function basisTitel(titel) {
  return titel
    .replace(/\s*\|\s*Teppich Paradies\s*$/i, '')
    // "..., 200/400 cm" und angehaengte Breiten "400cm 500cm"
    .replace(/,?\s*\d{3}(?:\s*\/\s*\d{3})+\s*cm\b/g, '')
    .replace(/(?:\s+\d{3}\s?cm)+\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function option(variante, namen) {
  return variante.selectedOptions?.find((o) => namen.includes(o.name.toLowerCase()))?.value ?? null;
}

/** Farbe nur anhaengen, wenn das Produkt mehrere Farben hat und sie nicht schon im Namen steht. */
export function feedTitel(produktTitel, variante, farbAnzahl) {
  let t = basisTitel(produktTitel);
  const farbe = option(variante, FARB_OPTIONEN);
  const kern = farbe?.toLowerCase().replace(/\s*\(.*\)$/, '');
  if (farbe && farbAnzahl > 1 && !t.toLowerCase().includes(kern)) t += ` ${farbe}`;
  const breite = option(variante, ['breite']);
  if (breite && /^\d{3}\s?cm$/.test(breite)) t += `, ${breite.replace(/\s?cm/, ' cm')} breit`;
  return t.length > 150 ? t.slice(0, 150).trim() : t;
}

const nummer = (gid) => gid.split('/').pop();

// Shopify-Einheit -> Einheit im Merchant Center. Was Google nicht kennt (z. B. MM),
// bleibt leer statt geraten.
const EINHEIT = { M2: 'sqm', M: 'm', CM: 'cm', M3: 'cbm', L: 'l', CL: 'cl', ML: 'ml', KG: 'kg', G: 'g', MG: 'mg', ITEM: 'ct' };

const zahl = (x) => String(Math.round(Number(x) * 1000) / 1000);

/** Grundpreis-Spalten [unit_pricing_measure, unit_pricing_base_measure] oder ['', '']. */
export function grundpreis(variante) {
  const m = variante?.unitPriceMeasurement;
  if (!variante?.showUnitPrice || !m) return ['', ''];
  const menge = EINHEIT[m.quantityUnit];
  const basis = EINHEIT[m.referenceUnit];
  if (!menge || !basis || !(Number(m.quantityValue) > 0) || !(Number(m.referenceValue) > 0)) return ['', ''];
  return [`${zahl(m.quantityValue)} ${menge}`, `${zahl(m.referenceValue)} ${basis}`];
}

/** JSONL der Bulk-Abfrage -> Zeilen [offerId, Titel, Grundpreis-Menge, Grundpreis-Basis, Gratisversand ab]; offerId wie von der Shopify-App vergeben. */
export function feedZeilen(jsonl) {
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
    if (!f) continue;
    if (!farben.has(v.__parentId)) farben.set(v.__parentId, new Set());
    farben.get(v.__parentId).add(f);
  }
  const zeilen = [];
  for (const v of varianten) {
    const p = produkte.get(v.__parentId);
    if (!p || p.productType === EIGENER_FEED) continue;
    zeilen.push([`shopify_ZZ_${nummer(p.id)}_${nummer(v.id)}`, feedTitel(p.title, v, farben.get(p.id)?.size ?? 0), ...grundpreis(v), GRATIS_AB]);
  }
  return zeilen;
}

function main(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--bulk-query') o.bulk = true;
    else if (argv[i] === '--jsonl' || argv[i] === '--aus') o[argv[i].slice(2)] = argv[++i];
    else throw new Error(`unbekannte Option: ${argv[i]}`);
  }
  if (o.bulk) { console.log(BULK_QUERY.trim()); return; }
  if (!o.jsonl || !o.aus) throw new Error('Aufruf: feed:titel -- --jsonl katalog.jsonl --aus tp-feedtitel.txt | --bulk-query');
  const zeilen = feedZeilen(fs.readFileSync(o.jsonl, 'utf8'));
  fs.writeFileSync(o.aus, ['id\ttitle\tunit_pricing_measure\tunit_pricing_base_measure\tfree_shipping_threshold', ...zeilen.map((z) => z.join('\t'))].join('\n') + '\n');
  console.log(`${zeilen.length} Titel nach ${o.aus}, davon ${zeilen.filter((z) => z[2]).length} mit Grundpreis`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
}
