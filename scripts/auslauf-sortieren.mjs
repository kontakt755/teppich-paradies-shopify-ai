#!/usr/bin/env node
/**
 * Auslaufartikel (Tag "auslauf") ans Ende der manuell sortierten Kategorien.
 *
 *   npm run -s auslauf:sortieren                        # nur pruefen, Exit 1 wenn etwas zu tun ist
 *   npm run -s auslauf:sortieren -- --schreiben         # umsortieren, Rollback-Datei, Gegenprobe
 *   npm run -s auslauf:sortieren -- --kollektionen a,b  # nur diese Kollektionen
 *   npm run -s auslauf:sortieren -- --zurueck <datei>   # Reihenfolge aus einer Rollback-Datei wiederherstellen
 *
 * ─── Warum Daten und nicht Theme ─────────────────────────────────────
 * Shopvergleich 2026-10-15: In Teppichboden standen Auslaufartikel auf den
 * Plaetzen 1 und 3. Das Theme kann nur innerhalb einer Seite umsortieren
 * (24 Karten, Teppichboden hat 11 Seiten); ans Ende der ganzen Kategorie
 * kommt ein Artikel nur ueber die Reihenfolge in Shopify selbst. Die
 * betroffenen Kategorien (Teppichboden mit Unterkategorien, Teppiche,
 * Teppich nach Mass) sind ohnehin MANUAL sortiert; dort verschiebt
 * collectionReorderProducts nur die Auslaufartikel ans Ende und laesst die
 * Reihenfolge aller anderen unveraendert. Paginierung und Filter bleiben
 * Shopifys eigene.
 *
 * Bestseller-sortierte Kollektionen (Vinylboden, Angebote, Teppichfliesen)
 * bleiben bewusst, wie sie sind: Umstellen auf MANUAL wuerde die
 * Bestseller-Reihenfolge einfrieren. Dort stehen Auslaufartikel ohnehin nicht
 * vorn (Ausnahme Angebote - Abverkauf ist dort ein Angebot).
 *
 * ─── Wann laufen lassen ──────────────────────────────────────────────
 * Nach jedem neuen Tag "auslauf" und nach jedem Import in eine der
 * Kategorien: Shopify haengt neue Produkte einer MANUAL-Kollektion hinten an,
 * also hinter die Auslaufartikel. Der Trockenlauf meldet das (Exit 1).
 *
 * Zugang: Shopify-CLI (`shopify store execute`), wie fuer das Theme - kein
 * Token. Die Rollback-Datei liegt unter $TP_PRIVAT_DIR/auslauf/ (nicht im Repo).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const STORE = 'sjjyq1-6w.myshopify.com';
export const TAG = 'auslauf';
/** collectionReorderProducts nimmt hoechstens 250 Verschiebungen je Aufruf. */
export const MAX_ZUEGE = 250;

export function argumente(argv) {
  const a = { schreiben: false, kollektionen: null, zurueck: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--schreiben') a.schreiben = true;
    else if (k === '--kollektionen') a.kollektionen = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (k === '--zurueck') a.zurueck = argv[++i];
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  if (a.kollektionen && a.kollektionen.length === 0) throw new Error('--kollektionen braucht mindestens einen Handle');
  if (a.zurueck === undefined) throw new Error('--zurueck braucht eine Datei');
  return a;
}

/**
 * Zielreihenfolge: alle regulaeren Produkte in ihrer bisherigen Reihenfolge,
 * dahinter alle Auslaufartikel, ebenfalls in ihrer bisherigen Reihenfolge.
 * @param {string[]} reihenfolge Produkt-IDs in der aktuellen Reihenfolge
 * @param {Set<string>} auslauf IDs mit Tag "auslauf"
 */
export function zielReihenfolge(reihenfolge, auslauf) {
  return [...reihenfolge.filter(id => !auslauf.has(id)), ...reihenfolge.filter(id => auslauf.has(id))];
}

export function istGleich(a, b) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Verschiebungen fuer collectionReorderProducts: jeder Auslaufartikel der Reihe
 * nach ans Ende. Weil die Zuege nacheinander gelten, stehen die Auslaufartikel
 * danach in ihrer bisherigen Reihenfolge hinten. Leer, wenn schon sortiert.
 */
export function planeZuege(reihenfolge, auslauf) {
  if (istGleich(reihenfolge, zielReihenfolge(reihenfolge, auslauf))) return [];
  const ende = String(reihenfolge.length);
  return reihenfolge.filter(id => auslauf.has(id)).map(id => ({ id, newPosition: ende }));
}

/** Zuege, die eine gespeicherte Reihenfolge wiederherstellen (Rollback). */
export function planeRueckweg(gespeichert) {
  return gespeichert.map((id, i) => ({ id, newPosition: String(i) }));
}

/** Simuliert die Zuege (wie Shopify sie anwendet) - fuer Tests und Gegenprobe vor dem Schreiben. */
export function wendeAn(reihenfolge, zuege) {
  const r = [...reihenfolge];
  for (const { id, newPosition } of zuege) {
    const von = r.indexOf(id);
    if (von === -1) continue;
    r.splice(von, 1);
    r.splice(Math.min(Number(newPosition), r.length), 0, id);
  }
  return r;
}

/**
 * Sortiert, liest gegen und plant bei Abweichung neu - hoechstens `versuche`-mal.
 * Vorfall 2026-10-22: Waehrend ein Import noch Produkte an "Teppiche" anhaengte
 * (490 statt 234), kamen die Zuege in Shopify nicht an; die Reihenfolge blieb
 * die alte, die Gegenprobe meldete FEHL. Ein neuer Plan auf der frisch gelesenen
 * Reihenfolge (mit den inzwischen angehaengten Produkten) ging durch.
 * @returns {{ ok: boolean, versuche: number, reihenfolge: string[] }}
 */
export function sortiereBisFertig({ lies, schiebe, warte = () => {}, auslauf, versuche = 3 }) {
  let reihenfolge = lies();
  for (let n = 1; n <= versuche; n++) {
    const zuege = planeZuege(reihenfolge, auslauf);
    if (zuege.length === 0) return { ok: true, versuche: n - 1, reihenfolge };
    schiebe(zuege);
    reihenfolge = lies();
    if (planeZuege(reihenfolge, auslauf).length === 0) return { ok: true, versuche: n, reihenfolge };
    if (n < versuche) warte(n);
  }
  return { ok: false, versuche, reihenfolge };
}

export function inStuecken(liste, groesse = MAX_ZUEGE) {
  const stuecke = [];
  for (let i = 0; i < liste.length; i += groesse) stuecke.push(liste.slice(i, i + groesse));
  return stuecke;
}

// ─── Shopify ────────────────────────────────────────────────────────────

function admin(query, variables = {}, { mutation = false } = {}) {
  const args = ['store', 'execute', '-s', STORE, '-j', '--no-input', '-q', query];
  if (Object.keys(variables).length) args.push('-v', JSON.stringify(variables));
  if (mutation) args.push('--allow-mutations');
  const roh = execFileSync('shopify', args, { encoding: 'utf8', maxBuffer: 50e6, stdio: ['ignore', 'pipe', 'pipe'] });
  // Die CLI gibt mit -j vorab Fortschrittszeilen aus; die Antwort ist das letzte JSON-Objekt.
  const start = roh.lastIndexOf('\n{\n') >= 0 ? roh.lastIndexOf('\n{\n') + 1 : roh.indexOf('{');
  return JSON.parse(roh.slice(start));
}

function auslaufIds() {
  const ids = new Set();
  let nach = null;
  do {
    const d = admin(`query($nach: String) { products(first: 250, after: $nach, query: "tag:${TAG}") { nodes { id tags } pageInfo { hasNextPage endCursor } } }`, nach ? { nach } : {});
    for (const p of d.products.nodes) if (p.tags.includes(TAG)) ids.add(p.id);
    nach = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (nach);
  return ids;
}

function manuelleKollektionen(nur) {
  const liste = [];
  let nach = null;
  do {
    const d = admin(`query($nach: String) { collections(first: 250, after: $nach) { nodes { id handle sortOrder } pageInfo { hasNextPage endCursor } } }`, nach ? { nach } : {});
    liste.push(...d.collections.nodes);
    nach = d.collections.pageInfo.hasNextPage ? d.collections.pageInfo.endCursor : null;
  } while (nach);
  return liste.filter(c => c.sortOrder === 'MANUAL' && (!nur || nur.includes(c.handle)));
}

function reihenfolgeVon(kollektionId) {
  const ids = [];
  let nach = null;
  do {
    const d = admin(`query($id: ID!, $nach: String) { collection(id: $id) { products(first: 250, after: $nach, sortKey: COLLECTION_DEFAULT) { nodes { id } pageInfo { hasNextPage endCursor } } } }`, nach ? { id: kollektionId, nach } : { id: kollektionId });
    ids.push(...d.collection.products.nodes.map(n => n.id));
    nach = d.collection.products.pageInfo.hasNextPage ? d.collection.products.pageInfo.endCursor : null;
  } while (nach);
  return ids;
}

function warteAufJob(jobId) {
  for (let i = 0; i < 60; i++) {
    const d = admin('query($id: ID!) { job(id: $id) { done } }', { id: jobId });
    if (d.job?.done) return;
    execFileSync('sleep', ['2']);
  }
  throw new Error(`Job ${jobId} nach 120 s nicht fertig`);
}

function schiebe(kollektionId, zuege) {
  for (const stueck of inStuecken(zuege)) {
    const d = admin(
      'mutation($id: ID!, $moves: [MoveInput!]!) { collectionReorderProducts(id: $id, moves: $moves) { job { id done } userErrors { field message } } }',
      { id: kollektionId, moves: stueck },
      { mutation: true },
    );
    const r = d.collectionReorderProducts;
    if (r.userErrors.length) throw new Error(`collectionReorderProducts: ${JSON.stringify(r.userErrors)}`);
    if (r.job && !r.job.done) warteAufJob(r.job.id);
  }
}

function privatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

// ─── Ablauf ─────────────────────────────────────────────────────────────

function zurueck(datei) {
  const rollback = JSON.parse(fs.readFileSync(datei, 'utf8'));
  for (const k of rollback.kollektionen) {
    const zuege = planeRueckweg(k.vorher);
    schiebe(k.id, zuege);
    const jetzt = reihenfolgeVon(k.id);
    const ok = istGleich(jetzt.filter(id => k.vorher.includes(id)), k.vorher);
    console.log(`${ok ? 'OK  ' : 'FEHL'} ${k.handle}: Reihenfolge von ${rollback.zeit} ${ok ? 'wiederhergestellt' : 'NICHT wiederhergestellt'}`);
    if (!ok) process.exitCode = 1;
  }
}

function main() {
  const a = argumente(process.argv.slice(2));
  if (a.zurueck) return zurueck(a.zurueck);

  const auslauf = auslaufIds();
  const kollektionen = manuelleKollektionen(a.kollektionen);
  console.log(`${auslauf.size} Produkte mit Tag "${TAG}", ${kollektionen.length} manuell sortierte Kollektionen.`);

  const offen = [];
  for (const k of kollektionen) {
    const reihenfolge = reihenfolgeVon(k.id);
    const anzahl = reihenfolge.filter(id => auslauf.has(id)).length;
    if (anzahl === 0 || anzahl === reihenfolge.length) continue;
    const zuege = planeZuege(reihenfolge, auslauf);
    const erster = reihenfolge.findIndex(id => auslauf.has(id));
    if (zuege.length === 0) {
      console.log(`ok   ${k.handle}: ${anzahl} Auslaufartikel stehen hinten (${reihenfolge.length} Produkte)`);
      continue;
    }
    console.log(`TUN  ${k.handle}: ${anzahl} Auslaufartikel, der erste auf Platz ${erster + 1} von ${reihenfolge.length}`);
    offen.push({ ...k, reihenfolge, zuege });
  }

  if (offen.length === 0) {
    console.log('Nichts zu tun.');
    return;
  }
  if (!a.schreiben) {
    console.log(`\n${offen.length} Kollektion(en) umzusortieren. Schreiben mit: npm run -s auslauf:sortieren -- --schreiben`);
    process.exitCode = 1;
    return;
  }

  const zeit = new Date().toISOString();
  const ordner = path.join(privatDir(), 'auslauf');
  fs.mkdirSync(ordner, { recursive: true });
  const datei = path.join(ordner, `sortierung-${zeit.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(datei, JSON.stringify({ zeit, kollektionen: offen.map(k => ({ id: k.id, handle: k.handle, vorher: k.reihenfolge })) }, null, 1));
  console.log(`\nRollback: ${datei}`);

  for (const k of offen) {
    // Gegenprobe gegen die gelesene Reihenfolge, nicht gegen userErrors; bei Abweichung neu planen.
    const r = sortiereBisFertig({
      lies: () => reihenfolgeVon(k.id),
      schiebe: zuege => schiebe(k.id, zuege),
      warte: n => execFileSync('sleep', [String(5 * n)]),
      auslauf,
    });
    const nachtrag = r.versuche > 1 ? ` (${r.versuche} Versuche)` : '';
    console.log(`${r.ok ? 'OK  ' : 'FEHL'} ${k.handle}: ${r.ok ? `Auslaufartikel stehen hinten${nachtrag}` : `Auslaufartikel stehen nach ${r.versuche} Versuchen nicht hinten - Rollback-Datei pruefen`}`);
    if (!r.ok) process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error(`Fehler: ${e.message}`);
    process.exitCode = 2;
  }
}
