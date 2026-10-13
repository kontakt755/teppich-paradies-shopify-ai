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
        id title
        variants { edges { node { id selectedOptions { name value } } } }
      }
    }
  }
}`;

const FARB_OPTIONEN = ['farbe', 'color', 'dekor'];

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

/** JSONL der Bulk-Abfrage -> Zeilen [offerId, Titel]; offerId wie von der Shopify-App vergeben. */
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
    if (!p) continue;
    zeilen.push([`shopify_ZZ_${nummer(p.id)}_${nummer(v.id)}`, feedTitel(p.title, v, farben.get(p.id)?.size ?? 0)]);
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
  fs.writeFileSync(o.aus, ['id\ttitle', ...zeilen.map((z) => z.join('\t'))].join('\n') + '\n');
  console.log(`${zeilen.length} Titel nach ${o.aus}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
}
