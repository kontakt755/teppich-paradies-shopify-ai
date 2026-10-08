#!/usr/bin/env node
// Angebotswelle: befristete Preisaktionen planen und am Ende zurueckstellen.
// Schreibt nichts in Shopify - erzeugt Dateien zur Freigabe und als Variablen fuer
// bulkOperationRunMutation (productVariantsBulkUpdate bzw. metafieldsSet).
// Ablauf und Regeln: docs/angebotswelle.md
//
//   node operations/scripts/angebotswelle.mjs abfrage
//   node operations/scripts/angebotswelle.mjs plan <export.jsonl> <ziel> --prozent 15 --start 2026-11-03 --ende 2026-11-16 (--typ Teppichboden | --handles a,b)
//   node operations/scripts/angebotswelle.mjs ende <export.jsonl> <ziel> --stichtag 2026-11-02 [--klasse preisanker]
//   node operations/scripts/angebotswelle.mjs ende <varianten.json> <ziel> --produkte <produkte.json> --stichtag ...
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Bulk-Export, den plan und ende lesen (eine Zeile je Variante, product eingebettet).
export const ABFRAGE = `{ productVariants { edges { node { id sku title price compareAtPrice selectedOptions { name value }
  product { id handle title productType status
    start: metafield(namespace: "aktion", key: "start") { value }
    ende: metafield(namespace: "aktion", key: "ende") { value }
    klasse: metafield(namespace: "aktion", key: "klasse") { value } } } } } }`;

export const SPERRTAGE = 30; // PAngV § 11: Referenz ist der niedrigste Preis der letzten 30 Tage

const cent = (x) => Math.round(Number(x) * 100);
const euro = (c) => (c / 100).toFixed(2);
const tag = (d) => new Date(`${d}T00:00:00Z`).getTime();
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

// JSONL (Bulk-Export) oder JSON-Array (seitenweiser Export per CLI) -> Zeilen.
const zeilenAus = (text) => (/^\s*\[/.test(text) ? JSON.parse(text) : text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)));

/**
 * Export in Varianten mit eingebettetem Produkt umbauen. Akzeptiert Bulk-JSONL (mit __parentId
 * oder schon eingebettet) und JSON-Arrays; traegt eine Variante nur product.id, kommen die
 * Produktdaten aus produkteText (zweite Exportdatei, --produkte).
 */
export function ladeExport(text, produkteText) {
  const zeilen = zeilenAus(text);
  const extra = produkteText ? zeilenAus(produkteText) : [];
  const produkte = new Map([...zeilen, ...extra].filter((z) => z.id?.includes('/Product/') && !z.__parentId).map((p) => [p.id, p]));
  return zeilen.filter((z) => z.id?.includes('/ProductVariant/')).map((v) => {
    const id = v.product?.id || v.__parentId;
    const p = { ...produkte.get(id), ...v.product };
    if (!p.handle) throw new Error(`Produktdaten fehlen fuer ${v.id} (${id || 'ohne Produkt'}) - Produktexport mit --produkte angeben`);
    return { ...v, product: { ...p, start: p.start?.value ?? p.start ?? null, ende: p.ende?.value ?? p.ende ?? null, klasse: p.klasse?.value ?? p.klasse ?? null } };
  });
}

const istMuster = (v) => String(v.sku || '').startsWith('M-') || /^muster-/.test(v.product?.handle || '');

// Raummass-Variante: Optionswert "Wunschmaß" (Option "Breite" bei Teppichboden) bzw. "Raummaß".
// Ohne selectedOptions (alter Export) zaehlt der Variantentitel "Farbe / Wunschmaß".
const RAUMMASS = /^(wunschma(ß|ss)|raumma(ß|ss))$/i;
export function istRaummass(v) {
  const werte = v.selectedOptions?.length ? v.selectedOptions.map((o) => o.value) : String(v.title || '').split(' / ');
  return werte.some((w) => RAUMMASS.test(String(w).trim()));
}

/**
 * Inhaber 2026-10-05: Raummass-Preise enden auf ,90 - naechstgelegener ,90-Betrag,
 * round(x + 0,10) - 0,10. Volle Euro gehen 0,10 nach unten (104,00 -> 103,90),
 * Betraege auf ,90 bleiben. Rechnet in Cent.
 */
export const aufNeunzig = (c) => Math.round((c + 10) / 100) * 100 - 10;

/** Warum ein Produkt nicht in die Welle darf - oder null. */
export function sperrgrund(produkt, start) {
  if (produkt.status && produkt.status !== 'ACTIVE') return 'nicht aktiv';
  if (produkt.ende && DATUM.test(produkt.ende)) {
    const frei = tag(produkt.ende) + (SPERRTAGE + 1) * 86400000;
    if (tag(start) < frei) return `letzte Aktion bis ${produkt.ende}, frei ab ${new Date(frei).toISOString().slice(0, 10)}`;
  }
  return null;
}

/** Eine Variante -> { price, compareAtPrice, basis } oder { grund } zum Auslassen. */
export function planeVariante(v, prozent) {
  if (istMuster(v)) return { grund: 'Muster' };
  const preis = cent(v.price);
  if (preis <= 0) return { grund: 'Preis 0' };
  if (v.compareAtPrice && cent(v.compareAtPrice) > preis) return { grund: 'schon reduziert' };
  const neu = Math.round(preis * (100 - prozent) / 100);
  if (neu >= preis || neu <= 0) return { grund: 'kein Rabatt' };
  return { price: euro(neu), compareAtPrice: euro(preis) };
}

export function plane(varianten, opt) {
  const { prozent, start, ende } = opt;
  if (!(prozent > 0 && prozent < 100)) throw new Error('--prozent muss zwischen 1 und 99 liegen');
  if (!DATUM.test(start || '') || !DATUM.test(ende || '') || tag(ende) < tag(start)) throw new Error('--start/--ende als JJJJ-MM-TT, Ende nicht vor Start');
  const handles = opt.handles ? new Set(opt.handles) : null;
  const passt = (p) => (handles ? handles.has(p.handle) : p.productType === opt.typ);
  const setzen = new Map(); const zurueck = new Map(); const produkte = new Set();
  const csv = []; const ausgelassen = [];
  for (const v of varianten) {
    const p = v.product;
    if (!passt(p)) continue;
    const sperre = sperrgrund(p, start);
    const r = sperre ? { grund: sperre } : planeVariante(v, prozent);
    if (r.grund) { ausgelassen.push([p.handle, v.title, r.grund].join(';')); continue; }
    if (!setzen.has(p.id)) { setzen.set(p.id, []); zurueck.set(p.id, []); }
    setzen.get(p.id).push({ id: v.id, price: r.price, compareAtPrice: r.compareAtPrice });
    // vorab berechnete Rueckstellung nach derselben Regel wie ende() (Raummass auf ,90)
    zurueck.get(p.id).push({ id: v.id, price: istRaummass(v) ? euro(aufNeunzig(cent(r.compareAtPrice))) : r.compareAtPrice, compareAtPrice: null });
    produkte.add(p.id);
    csv.push([p.productType || '-', p.handle, v.title, v.sku || '', r.compareAtPrice, r.price, prozent].join(';'));
  }
  const metafelder = [...produkte].map((ownerId) => ({ metafields: [
    { ownerId, namespace: 'aktion', key: 'start', type: 'date', value: start },
    { ownerId, namespace: 'aktion', key: 'ende', type: 'date', value: ende },
    { ownerId, namespace: 'aktion', key: 'klasse', type: 'single_line_text_field', value: 'aktion' },
  ] }));
  return { setzen, zurueck, metafelder, csv, ausgelassen };
}

/**
 * Rueckstellung aus dem Live-Stand: Produkte, deren aktion.ende vor dem Stichtag liegt und
 * die noch reduziert sind, gehen auf den regulaeren Preis zurueck, der Vergleichspreis wird
 * geleert. Meterware: Zielpreis = Vergleichspreis. Raummass (Wunschmass-Variante): der
 * ,90-Betrag dazu (aufNeunzig, Inhaber 2026-10-05). Muster bleiben unberuehrt.
 */
export function ende(varianten, opt) {
  if (!DATUM.test(opt.stichtag || '')) throw new Error('--stichtag als JJJJ-MM-TT');
  const zurueck = new Map(); const csv = [];
  for (const v of varianten) {
    const p = v.product;
    if (!p.ende || !DATUM.test(p.ende) || tag(p.ende) >= tag(opt.stichtag)) continue;
    if (opt.klasse && p.klasse !== opt.klasse) continue;
    if (istMuster(v)) continue;
    if (!v.compareAtPrice || cent(v.compareAtPrice) <= cent(v.price)) continue;
    const raummass = istRaummass(v);
    const ziel = euro(raummass ? aufNeunzig(cent(v.compareAtPrice)) : cent(v.compareAtPrice));
    if (!zurueck.has(p.id)) zurueck.set(p.id, []);
    zurueck.get(p.id).push({ id: v.id, price: ziel, compareAtPrice: null });
    csv.push([p.handle, v.title, v.sku || '', raummass ? 'Raummaß' : 'Meterware', v.price, euro(cent(v.compareAtPrice)), ziel, p.ende].join(';'));
  }
  return { zurueck, csv };
}

const jsonl = (map) => [...map].map(([productId, variants]) => JSON.stringify({ productId, variants })).join('\n') + '\n';

function argumente(liste) {
  const o = {}; const rest = [];
  for (let i = 0; i < liste.length; i++) {
    if (liste[i].startsWith('--')) o[liste[i].slice(2)] = liste[++i]; else rest.push(liste[i]);
  }
  return { o, rest };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [befehl, ...weiter] = process.argv.slice(2);
  const { o, rest: [quelle, ziel] } = argumente(weiter);
  if (befehl === 'abfrage') { console.log(ABFRAGE); process.exit(0); }
  if (!['plan', 'ende'].includes(befehl) || !quelle || !ziel) {
    console.error('Aufruf: angebotswelle.mjs abfrage | plan <export.jsonl> <ziel> --prozent N --start D --ende D (--typ T | --handles a,b) | ende <export.jsonl> <ziel> --stichtag D [--klasse K] [--produkte produkte.json]');
    process.exit(2);
  }
  const varianten = ladeExport(fs.readFileSync(quelle, 'utf8'), o.produkte && fs.readFileSync(o.produkte, 'utf8'));
  fs.mkdirSync(ziel, { recursive: true });
  const schreib = (name, inhalt) => fs.writeFileSync(path.join(ziel, name), inhalt);
  if (befehl === 'plan') {
    const r = plane(varianten, { prozent: Number(o.prozent), start: o.start, ende: o.ende, typ: o.typ, handles: o.handles?.split(',') });
    schreib('plan.csv', ['typ;handle;variante;sku;preis_regulaer;preis_aktion;prozent', ...r.csv].join('\n') + '\n');
    schreib('ausgelassen.csv', ['handle;variante;grund', ...r.ausgelassen].join('\n') + '\n');
    schreib('varianten.jsonl', jsonl(r.setzen));
    schreib('metafelder.jsonl', r.metafelder.map((m) => JSON.stringify(m)).join('\n') + '\n');
    schreib('rueckstellen.jsonl', jsonl(r.zurueck));
    console.log(`Plan: ${r.csv.length} Varianten in ${r.setzen.size} Produkten, ${r.ausgelassen.length} ausgelassen -> ${ziel}`);
  } else {
    const r = ende(varianten, { stichtag: o.stichtag, klasse: o.klasse });
    schreib('rueckstellen.csv', ['handle;variante;sku;zuschnitt;preis_aktion;vergleichspreis;zielpreis;aktion_ende', ...r.csv].join('\n') + '\n');
    schreib('rueckstellen.jsonl', jsonl(r.zurueck));
    console.log(`Rueckstellung: ${r.csv.length} Varianten in ${r.zurueck.size} Produkten -> ${ziel}`);
  }
}
