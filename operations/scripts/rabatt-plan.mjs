#!/usr/bin/env node
// Dauerrabatt-Plan aus einem Varianten-Bulk-Export (JSONL: id price compareAtPrice sku
// product{id handle productType status}). Schreibt nichts in Shopify - erzeugt nur
// plan.csv (zur Freigabe) und varianten.jsonl / produkte.jsonl als Variablen fuer
// bulkOperationRunMutation (productVariantsBulkUpdate bzw. metafieldsSet).
//   node operations/scripts/rabatt-plan.mjs <export.jsonl> <ausgabeordner>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function stufeFuer(produkt, cfg) {
  if (produkt.status !== 'ACTIVE') return null;
  const typ = produkt.productType || '';
  if (typ in cfg.stufen) return cfg.stufen[typ];
  if (!typ) {
    for (const [teil, p] of Object.entries(cfg.ohneTypNachHandle || {})) {
      if (produkt.handle.includes(teil)) return p;
    }
  }
  return null;
}

const cent = (x) => Math.round(Number(x) * 100);

// Eine Variante -> null (auslassen) oder { price, compareAtPrice, grund }
export function planeVariante(v, prozent, cfg) {
  if (prozent == null) return null;
  if (String(v.sku || '').startsWith('M-')) return null; // Muster
  const preis = cent(v.price);
  if (preis <= 0) return null;
  const alt = v.compareAtPrice ? cent(v.compareAtPrice) : 0;
  if (alt > preis && cfg.bestehendeRabatteBehalten) return null; // bestehender Rabatt bleibt
  const basis = alt > preis ? alt : preis; // regulaerer Preis
  const neu = Math.round(basis * (100 - prozent) / 100);
  if (neu >= basis || neu <= 0) return null;
  return { price: (neu / 100).toFixed(2), compareAtPrice: (basis / 100).toFixed(2) };
}

export function plane(zeilen, cfg) {
  const varianten = new Map(); const produkte = new Map(); const csv = [];
  for (const v of zeilen) {
    const p = v.product;
    const prozent = stufeFuer(p, cfg);
    const r = planeVariante(v, prozent, cfg);
    // Bestehender Rabatt (compare_at > price) bleibt, wird aber sichtbar markiert.
    if (!r && prozent != null && cent(v.compareAtPrice || 0) > cent(v.price)) produkte.set(p.id, p);
    if (!r) continue;
    if (!varianten.has(p.id)) varianten.set(p.id, []);
    varianten.get(p.id).push({ id: v.id, price: r.price, compareAtPrice: r.compareAtPrice });
    produkte.set(p.id, p);
    csv.push([p.productType || '-', p.handle, v.title, v.price, r.compareAtPrice, r.price, prozent].join(';'));
  }
  return { varianten, produkte, csv };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [quelle, ziel] = process.argv.slice(2);
  if (!quelle || !ziel) { console.error('Aufruf: rabatt-plan.mjs <export.jsonl> <ausgabeordner>'); process.exit(2); }
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'domains/shopify/rabatt-stufen.json'), 'utf8'));
  const zeilen = fs.readFileSync(quelle, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const { varianten, produkte, csv } = plane(zeilen, cfg);
  fs.mkdirSync(ziel, { recursive: true });
  fs.writeFileSync(path.join(ziel, 'plan.csv'), ['typ;handle;variante;preis_alt;vergleichspreis;preis_neu;prozent', ...csv].join('\n') + '\n');
  fs.writeFileSync(path.join(ziel, 'varianten.jsonl'), [...varianten].map(([productId, variants]) => JSON.stringify({ productId, variants })).join('\n') + '\n');
  fs.writeFileSync(path.join(ziel, 'produkte.jsonl'), [...produkte.keys()].map((ownerId) => JSON.stringify({ metafields: [{ ownerId, namespace: 'aktion', key: 'klasse', type: 'single_line_text_field', value: 'preisanker' }] })).join('\n') + '\n');
  console.log(`Plan: ${csv.length} Varianten in ${produkte.size} Produkten -> ${ziel}`);
}
