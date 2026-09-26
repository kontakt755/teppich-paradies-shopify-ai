#!/usr/bin/env node
/**
 * Wandelt das JSONL einer Shopify-Massenabfrage (bulkOperationRunQuery) in die
 * Form um, die `npm run daten:aktualisieren -- --input <teil>=<datei>` erwartet.
 *
 *   npm run daten:bulk -- --teil kunden --jsonl <datei.jsonl> --ziel <roh.json>
 *
 * Wozu: Ohne Admin-Token laeuft der Abruf ueber den Shopify-MCP in einer
 * Claude-Sitzung. Seitenweise Abfragen schleusen dabei alle Kundendaten durch
 * den Gespraechsverlauf; eine Massenabfrage laedt sie direkt als Datei
 * herunter. Dieses Skript macht aus der flachen JSONL-Datei wieder die
 * verschachtelte Form - Shopify legt jede Unterliste als eigene Zeile mit
 * __parentId ab.
 *
 * Kein Netzzugriff: Abfrage und Download passieren ausserhalb (MCP bzw. curl),
 * hier wird nur umgeformt. Damit ist das Skript ohne Zugangsdaten testbar.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Welcher Teil erwartet welche Wurzel, und wie heissen die Unterlisten? */
export const TEILE = Object.freeze({
  kunden: { wurzel: 'customers', knoten: 'Customer', listen: { MailingAddress: 'addressesV2' }, standardFeld: 'addressesV2' },
  angebote: { wurzel: 'draftOrders', knoten: 'DraftOrder', listen: { DraftOrderLineItem: 'lineItems' }, standardFeld: 'lineItems' },
  warenkoerbe: { wurzel: 'checkouts', knoten: 'AbandonedCheckout', listen: {}, standardFeld: 'lineItems' },
  // Bestand faellt aus der Reihe: die Zieldatei hat zwei Wurzeln
  // ({standorte, bestand}), und der Standort haengt an jeder Bestandszeile,
  // nicht am Artikel. Deshalb ein eigener Zweig in umwandeln().
  bestand: { wurzel: 'bestand', knoten: 'InventoryItem', listen: { InventoryLevel: 'inventoryLevels' }, standardFeld: 'inventoryLevels' },
});

export function argumente(argv) {
  const a = { teil: null, jsonl: null, ziel: null, hilfe: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--teil') a.teil = argv[++i];
    else if (k === '--jsonl') a.jsonl = argv[++i];
    else if (k === '--ziel') a.ziel = argv[++i];
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  if (a.hilfe) return a;
  if (!a.teil || !TEILE[a.teil]) throw new Error(`--teil fehlt oder unbekannt (erlaubt: ${Object.keys(TEILE).join(', ')})`);
  if (!a.jsonl) throw new Error('--jsonl <datei> angeben');
  return a;
}

/** Typ eines Knotens aus seiner gid ableiten: gid://shopify/Customer/123 -> Customer */
export function typVon(id) {
  const m = /^gid:\/\/shopify\/([A-Za-z]+)\//.exec(String(id || ''));
  return m ? m[1] : null;
}

/**
 * Baut aus den JSONL-Zeilen die verschachtelte Form.
 *
 * Shopify schreibt Unterlisten als eigene Zeilen mit `__parentId`. Die
 * Reihenfolge ist garantiert: ein Kind steht immer hinter seinem Elternteil.
 * Gleiche Kindtypen unter demselben Elternteil landen in derselben Liste -
 * deshalb ist der Typ der Schluessel, nicht die Position.
 */
export function baue(zeilen, { hauptTyp, listen = {}, standardFeld = 'kinder' } = {}) {
  const eltern = new Map();
  const reihenfolge = [];
  for (const zeile of zeilen) {
    if (!zeile.trim()) continue;
    const o = JSON.parse(zeile);
    const typ = typVon(o.id);
    if (!o.__parentId) {
      if (typ !== hauptTyp) continue;          // fremde Knoten ignorieren
      eltern.set(o.id, o);
      reihenfolge.push(o.id);
      continue;
    }
    const ziel = eltern.get(o.__parentId);
    if (!ziel) continue;                        // Elternteil gehoert nicht zum Hauptknoten
    // Unterlisten aus Wertobjekten (Anschriften, Positionen) haben in der
    // Massenausgabe KEINE id - der Typ ist dort nicht ableitbar. Fuer diesen
    // Fall sagt der Aufrufer, wohin sie gehoeren; das ist je Teil eindeutig,
    // weil jede Abfrage nur eine solche Unterliste anfordert.
    const feld = (typ && listen[typ]) || (typ ? `${typ.toLowerCase()}s` : standardFeld);
    const { __parentId, ...rest } = o;
    (ziel[feld] ??= { nodes: [] }).nodes.push(rest);
  }
  return reihenfolge.map(id => eltern.get(id));
}

/**
 * Bestand: aus InventoryItem-Knoten mit ihren InventoryLevel-Kindern wird die
 * flache Liste, die operations/lib/bestand.mjs erwartet - je Zeile der
 * Standort als Objekt. Die Standorte ergeben sich aus den vorkommenden Levels;
 * ein Standort ohne einen einzigen Bestandssatz taucht nirgends auf und fehlt
 * dann auch in der Liste, was richtig ist: ueber ihn ist nichts bekannt.
 */
function bestandUmwandeln(knoten) {
  const standorte = new Map();
  const bestand = [];
  for (const item of knoten) {
    for (const level of item.inventoryLevels?.nodes ?? []) {
      const ort = level.location;
      if (ort?.id && !standorte.has(ort.id)) standorte.set(ort.id, { id: ort.id, name: ort.name });
      bestand.push({
        id: level.id,
        quantities: level.quantities ?? [],
        item: { id: item.id, sku: item.sku ?? null, tracked: item.tracked ?? false, variant: item.variant ?? null },
        standort: ort ? { id: ort.id, name: ort.name } : null,
      });
    }
  }
  return { standorte: [...standorte.values()], bestand };
}

export function umwandeln(teil, text) {
  const spec = TEILE[teil];
  const knoten = baue(text.split('\n'), {
    hauptTyp: spec.knoten,
    listen: spec.listen,
    standardFeld: spec.standardFeld,
  });
  if (teil === 'bestand') return bestandUmwandeln(knoten);
  return { [spec.wurzel]: knoten };
}

function main() {
  const a = argumente(process.argv.slice(2));
  if (a.hilfe) {
    console.log('npm run daten:bulk -- --teil kunden|angebote|warenkoerbe|bestand --jsonl <datei.jsonl> [--ziel <roh.json>]');
    return;
  }
  const text = fs.readFileSync(a.jsonl, 'utf8');
  const modell = umwandeln(a.teil, text);
  const wurzel = TEILE[a.teil].wurzel;
  const ziel = a.ziel || path.join(path.dirname(a.jsonl), `${a.teil}-roh.json`);
  fs.writeFileSync(ziel, JSON.stringify(modell, null, 2));
  const anzahl = a.teil === 'bestand' ? modell.bestand.length : modell[wurzel].length;
  console.log(`${a.teil}: ${anzahl} Datensaetze -> ${ziel}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error(`Fehler: ${e.message}`); process.exit(1); }
}
