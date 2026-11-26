#!/usr/bin/env node
/**
 * Zusatzquelle tp-grundpreis.txt fuer das Merchant Center - nur lesend.
 *
 *   node operations/scripts/feed-grundpreis-abruf.mjs --aus tp-grundpreis.txt --ohne tp-tnm-preise.txt --ohne tp-nachmass-preise.txt [--vorher alt.txt]
 *
 * Die Google-&-YouTube-App sendet unit_pricing_measure nur bei showUnitPrice=true
 * (belegt 25.11.2026). Der Inhaber will den Grundpreis im Shop nicht einschalten,
 * deshalb nennt diese Datei das Mass aller Varianten mit unitPriceMeasurement in m²,
 * aber showUnitPrice=false - fuer Teppichboden, Vinyl von der Rolle und Sauberlauf
 * im Google-Kanal. IDs aus den TnM-/Nach-Mass-Quellen bleiben draussen, die tragen
 * ihr Mass selbst.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { GraphQLProxy } from '../../workflow/graphql-proxy.mjs';

export const GOOGLE_KANAL = '367654764878';
export const WARENARTEN = ['Teppichboden', 'Vinyl von der Rolle', 'Sauberlauf'];
export const KOPF = ['id', 'unit_pricing_measure', 'unit_pricing_base_measure'];

const filter = `status:active publication_ids:${GOOGLE_KANAL} (${WARENARTEN.map((t) => `product_type:'${t}'`).join(' OR ')})`;
export const ABFRAGE = `query($nach: String) {
  products(first: 25, after: $nach, query: "${filter}") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id productType
      variants(first: 250) {
        pageInfo { hasNextPage }
        nodes { id showUnitPrice unitPriceMeasurement { quantityUnit quantityValue referenceUnit referenceValue } }
      }
    }
  }
}`;

const nummer = (gid) => String(gid).split('/').pop();

export async function katalog(proxy) {
  const produkte = [];
  let nach = null;
  for (let i = 0; i < 400; i++) {
    const seite = (await proxy.execute(ABFRAGE, { nach }))?.products;
    if (!seite?.nodes || !seite.pageInfo) throw new Error('Admin API lieferte keine products - Zugriff pruefen.');
    for (const p of seite.nodes) {
      if (p.variants?.pageInfo?.hasNextPage !== false) throw new Error(`${p.id}: Varianten unvollstaendig oder mehr als 250.`);
      produkte.push(p);
    }
    if (!seite.pageInfo.hasNextPage) return produkte;
    nach = seite.pageInfo.endCursor;
    if (!nach) throw new Error('Admin API: Seiten-Cursor fehlt.');
  }
  throw new Error('Admin API: zu viele Seiten.');
}

/** Merchant-Center-IDs der ersten Spalte einer TSV-Quelle (ohne Kopfzeile). */
export const idsAus = (text) => new Set(String(text).split('\n').slice(1).map((z) => z.split('\t')[0].trim()).filter(Boolean));

export function zeilen(produkte, ohne = new Set()) {
  const out = [];
  for (const p of produkte) {
    if (!WARENARTEN.includes(p.productType)) continue;
    for (const v of p.variants.nodes) {
      const m = v.unitPriceMeasurement;
      if (v.showUnitPrice !== false || m?.quantityUnit !== 'M2' || m.referenceUnit !== 'M2') continue;
      if (!(m.quantityValue > 0) || !(m.referenceValue > 0)) continue;
      const id = `shopify_ZZ_${nummer(p.id)}_${nummer(v.id)}`;
      if (!ohne.has(id)) out.push([id, `${m.quantityValue} sqm`, `${m.referenceValue} sqm`]);
    }
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

export const datei = (rows) => `${[KOPF, ...rows].map((r) => r.join('\t')).join('\n')}\n`;

/** Wie beim TnM-Feed: lieber die alte Datei stehen lassen als ploetzlich viele Zeilen verlieren. */
export function pruefeUmfang(neu, vorher) {
  if (!neu) throw new Error('Keine Grundpreis-Zeilen erzeugt.');
  if (vorher && neu < vorher * 0.8) throw new Error(`Nur ${neu} statt bisher ${vorher} Zeilen (unter 80 %): Datei nicht ersetzt.`);
}

async function main(argv) {
  const o = { ohne: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]?.slice(2);
    if (!['aus', 'ohne', 'vorher'].includes(k) || !argv[i + 1]) throw new Error(`unbekannte Option oder Wert fehlt: ${argv[i]}`);
    if (k === 'ohne') o.ohne.push(argv[i + 1]); else o[k] = argv[i + 1];
  }
  if (!o.aus || o.ohne.length !== 2) throw new Error('--aus und zweimal --ohne (TnM- und Nach-Mass-Datei) sind erforderlich.');
  const ohne = new Set(o.ohne.flatMap((f) => [...idsAus(fs.readFileSync(f, 'utf8'))]));
  if (!ohne.size) throw new Error('--ohne-Dateien sind leer.');
  const proxy = new GraphQLProxy();
  if (!proxy.live) throw new Error('Vorhandener SHOPIFY_ADMIN_TOKEN fehlt.');
  const rows = zeilen(await katalog(proxy), ohne);
  const vorher = o.vorher && fs.existsSync(o.vorher) ? idsAus(fs.readFileSync(o.vorher, 'utf8')).size : 0;
  pruefeUmfang(rows.length, vorher);
  fs.writeFileSync(`${o.aus}.tmp`, datei(rows));
  fs.renameSync(`${o.aus}.tmp`, o.aus);
  console.log(`${rows.length} Grundpreis-Zeilen (bisher ${vorher || 'keine Datei'}).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(2); });
}
