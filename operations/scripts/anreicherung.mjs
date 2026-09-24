#!/usr/bin/env node
/**
 * Anreicherung der Produktdaten aus den Lieferant-A-Produktseiten: Plan,
 * Rollback, offen-Liste und Batchdateien - Nachbau von
 * `~/teppich-paradies-analyse/einkauf-kollektion/plan_aus_cache.py` und
 * `build_technik_plan.py` als getesteter Teil des Repositorys
 * (operations/lib/lieferantenseiten.mjs).
 *
 *   npm run daten:anreichern                 # nur planen (Standard)
 *   npm run daten:anreichern -- --schreiben  # planen und nach Shopify schreiben
 *
 * Eingaben (alle lokal unter $TP_PRIVAT_DIR, nie im Repository):
 *   $TP_PRIVAT_DIR/lieferantendaten/lieferant-a-produktseiten-*.json  (Cache, s. lieferantenseiten-holen.mjs)
 *   $TP_PRIVAT_DIR/lieferantendaten/lieferant-a-katalog-*.json        (SKU -> Lieferant-A-Treffer, lieferant-a-recherche-Skill)
 *   $TP_PRIVAT_DIR/lexikon/produkte.json                              (npm run daten:aktualisieren / lexikon:export)
 *
 * Ausgabe unter $TP_PRIVAT_DIR/anreicherung/:
 *   plan.json        alle geplanten Werte (technik + einkauf)
 *   rollback.json     Altwert je geplantem Feld (meist null)
 *   offen.json        was nicht geschrieben wird, mit Grund
 *   konflikte.json     Produkte mit widerspruechlichen Lieferantenwerten je Variante
 *   neue-metaobjekte.json  Rohwerte ohne Metaobjekt-Entsprechung (Inhaberentscheidung)
 *   batches/*.gql      fertige metafieldsSet-Mutationen (8 Aufrufe je Datei, 25 Metafelder je Aufruf)
 *   write-log.json     nur mit --schreiben: Zeitpunkt, Anzahl, Gegenprobe
 *
 * Standardmaessig wird NICHT geschrieben. --schreiben schreibt ueber den
 * Token aus .env.local (operations/sync/zugang.mjs) und prueft danach per
 * frischem Export gegen (SKILL.md "Gegenprobe" - userErrors:[] ist kein Beleg).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planeAlles, baueBatches } from '../lib/lieferantenseiten.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STANDARD_PRIVAT_DIR = path.join(os.homedir(), 'teppich-paradies-analyse');

export function argumente(argv) {
  const a = {
    privatDir: null,
    cache: null,
    katalog: null,
    lexikon: null,
    ziel: null,
    schreiben: false,
    hilfe: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--privat-dir') a.privatDir = argv[++i];
    else if (k === '--cache') a.cache = argv[++i];
    else if (k === '--katalog') a.katalog = argv[++i];
    else if (k === '--lexikon') a.lexikon = argv[++i];
    else if (k === '--ziel') a.ziel = argv[++i];
    else if (k === '--schreiben') a.schreiben = true;
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  return a;
}

function neuesteDatei(verzeichnis, muster) {
  if (!fs.existsSync(verzeichnis)) return null;
  const treffer = fs.readdirSync(verzeichnis).filter((n) => muster.test(n)).sort();
  return treffer.length ? path.join(verzeichnis, treffer[treffer.length - 1]) : null;
}

function ladeJson(pfad, bezeichnung) {
  if (!pfad || !fs.existsSync(pfad)) throw new Error(`${bezeichnung} fehlt: ${pfad ?? '(kein Pfad gefunden)'}`);
  return JSON.parse(fs.readFileSync(pfad, 'utf8'));
}

function produktListeAusLexikon(daten) {
  if (Array.isArray(daten?.produkte)) return daten.produkte;
  if (Array.isArray(daten)) return daten;
  throw new Error('Lexikon-Datei ohne produkte[] - npm run daten:aktualisieren bzw. lexikon:export erneut laufen lassen');
}

/** Baut den Plan aus den drei lokalen Quellen. Wirft nichts nach Shopify. */
export function erzeugePlan({ privatDir = STANDARD_PRIVAT_DIR, cachePfad, katalogPfad, lexikonPfad } = {}) {
  const cp = cachePfad || neuesteDatei(path.join(privatDir, 'lieferantendaten'), /^lieferant-a-produktseiten-.*\.json$/);
  const kp = katalogPfad || neuesteDatei(path.join(privatDir, 'lieferantendaten'), /^lieferant-a-katalog-.*\.json$/);
  const lp = lexikonPfad || path.join(privatDir, 'lexikon', 'produkte.json');

  const cache = ladeJson(cp, 'Seiten-Cache');
  const katalog = ladeJson(kp, 'Katalog-Abgleich');
  const lexikon = ladeJson(lp, 'Lexikon');
  const produkte = produktListeAusLexikon(lexikon);

  const plan = planeAlles({ cache, katalog, produkte });
  return { ...plan, quellen: { cachePfad: cp, katalogPfad: kp, lexikonPfad: lp } };
}

export function schreibePlanDateien(zielDir, plan) {
  fs.mkdirSync(path.join(zielDir, 'batches'), { recursive: true });
  fs.writeFileSync(path.join(zielDir, 'plan.json'), JSON.stringify(plan.werte, null, 2));
  fs.writeFileSync(path.join(zielDir, 'offen.json'), JSON.stringify(plan.offen, null, 2));
  fs.writeFileSync(path.join(zielDir, 'konflikte.json'), JSON.stringify(plan.konflikte, null, 2));
  fs.writeFileSync(path.join(zielDir, 'neue-metaobjekte.json'), JSON.stringify(plan.neueMetaobjekte, null, 2));
  const rollback = plan.werte.map((m) => ({ ownerId: m.ownerId, namespace: m.namespace, key: m.key, type: m.type, vorher: null }));
  fs.writeFileSync(path.join(zielDir, 'rollback.json'), JSON.stringify(rollback, null, 2));

  const batches = baueBatches(plan.werte);
  // Alte Batchdateien eines vorherigen Laufs entfernen, damit keine
  // veralteten Dateien mit hoeherer Nummer liegen bleiben.
  const batchDir = path.join(zielDir, 'batches');
  for (const datei of fs.readdirSync(batchDir)) if (/^x\d+\.gql$/.test(datei)) fs.unlinkSync(path.join(batchDir, datei));
  batches.forEach((inhalt, i) => fs.writeFileSync(path.join(batchDir, `x${String(i).padStart(3, '0')}.gql`), inhalt));
  return { batchDateien: batches.length };
}

/** Schreibt alle Batches ueber den Admin-Zugang und prueft per frischem Export gegen. */
export async function schreibeNachShopify({ zielDir, plan, proxy }) {
  const batchDir = path.join(zielDir, 'batches');
  const dateien = fs.readdirSync(batchDir).filter((n) => /^x\d+\.gql$/.test(n)).sort();
  const ergebnisse = [];
  for (const datei of dateien) {
    const inhalt = fs.readFileSync(path.join(batchDir, datei), 'utf8');
    // eslint-disable-next-line no-await-in-loop -- Batches laufen bewusst nacheinander (ein Aufruf schreibt bis zu 25*8 Metafelder).
    const antwort = await proxy.execute(inhalt);
    ergebnisse.push({ datei, antwort });
  }

  // Gegenprobe: je geplanten Wert (ownerId, namespace, key) den aktuellen
  // Stand einzeln lesen und mit dem geplanten Wert vergleichen -
  // userErrors:[] aus dem Schreiben ist kein Beleg (SKILL.md).
  let gleich = 0;
  let abweichend = 0;
  let fehlend = 0;
  const beispiele = [];
  for (const m of plan.werte) {
    // eslint-disable-next-line no-await-in-loop
    const antwort = await proxy.execute(
      `query($id:ID!,$ns:String!,$key:String!){ node(id:$id){ ... on HasMetafields { metafield(namespace:$ns,key:$key){ value } } } }`,
      { id: m.ownerId, ns: m.namespace, key: m.key },
    );
    const istWert = antwort?.node?.metafield?.value ?? null;
    if (istWert === null) { fehlend += 1; if (beispiele.length < 10) beispiele.push({ ...m, gegenprobe: 'fehlend' }); }
    else if (istWert === m.value) gleich += 1;
    else { abweichend += 1; if (beispiele.length < 10) beispiele.push({ ...m, gegenprobe: 'abweichend', istWert }); }
  }

  const log = {
    geschriebenAm: new Date().toISOString(),
    batchDateien: dateien.length,
    geplanteWerte: plan.werte.length,
    gegenprobe: { gleich, abweichend, fehlend, beispiele },
    ergebnisse,
  };
  fs.writeFileSync(path.join(zielDir, 'write-log.json'), JSON.stringify(log, null, 2));
  return log;
}

async function main() {
  const a = argumente(process.argv.slice(2));
  if (a.hilfe) {
    console.log('npm run daten:anreichern -- [--schreiben] [--privat-dir <pfad>] [--cache <datei>] [--katalog <datei>] [--lexikon <datei>] [--ziel <verzeichnis>]');
    return;
  }
  const privatDir = a.privatDir || process.env.TP_PRIVAT_DIR || STANDARD_PRIVAT_DIR;
  const zielDir = a.ziel || path.join(privatDir, 'anreicherung');

  const plan = erzeugePlan({ privatDir, cachePfad: a.cache, katalogPfad: a.katalog, lexikonPfad: a.lexikon });
  const { batchDateien } = schreibePlanDateien(zielDir, plan);

  console.log(`Plan: ${plan.werte.length} Werte (technik ${plan.technikAnzahl} · einkauf ${plan.einkaufAnzahl}), ${plan.offen.length} offen, ${plan.konflikte.length} Konflikte`);
  console.log(`  Quellen: ${plan.quellen.cachePfad}`);
  console.log(`           ${plan.quellen.katalogPfad}`);
  console.log(`           ${plan.quellen.lexikonPfad}`);
  console.log(`  Abgelegt unter ${zielDir} (${batchDateien} Batchdatei(en))`);

  if (!a.schreiben) {
    console.log('Nur geplant - zum Schreiben: npm run daten:anreichern -- --schreiben');
    return;
  }
  if (!plan.werte.length) {
    console.log('Nichts zu schreiben.');
    return;
  }
  const { erzeugeProxy } = await import('../sync/zugang.mjs');
  const { proxy, art } = await erzeugeProxy();
  if (art === 'sammeln') throw new Error('Kein Zugang in .env.local (SHOPIFY_ADMIN_TOKEN oder SHOPIFY_CLIENT_ID/SECRET) - Plan steht, Schreiben nicht moeglich');
  const log = await schreibeNachShopify({ zielDir, plan, proxy });
  console.log(`Geschrieben: ${log.batchDateien} Batchdatei(en). Gegenprobe: ${log.gegenprobe.gleich} gleich, ${log.gegenprobe.abweichend} abweichend, ${log.gegenprobe.fehlend} fehlend.`);
  if (log.gegenprobe.abweichend || log.gegenprobe.fehlend) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`Fehler: ${err.message}`); process.exit(1); });
}
