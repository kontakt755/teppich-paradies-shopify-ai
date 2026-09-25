#!/usr/bin/env node
/**
 * Eine Aktualisierung fuer alle lokalen Control-Center-Datenquellen.
 *
 *   npm run daten:aktualisieren
 *   npm run daten:aktualisieren -- --nur lexikon
 *   npm run daten:aktualisieren -- --nur bestellungen,kennzahlen
 *
 * Erneuert nacheinander:
 *   1. Lexikon      - Produkte/Varianten/Metafelder (operations/lib/lexikon.mjs)
 *   2. Bestellungen - alle Bestellungen der letzten 90 Tage PLUS alle noch
 *                     nicht vollstaendig erfuellten unabhaengig vom Alter,
 *                     vollstaendig paginiert (kein festes Limit mehr), inkl.
 *                     Quellvarianten der Muster (ohne die Quellvariante
 *                     verliert ein Muster seine Artikelnummer, siehe
 *                     operations/lib/bestelluebersicht.mjs)
 *   3. Kennzahlen   - letzte 35 Tage (operations/lib/kennzahlen.mjs braucht
 *                     mindestens 30 Tage Fenster fuer den 30-Tage-Zeitraum)
 *
 * Jeder Teil laeuft unabhaengig: ein Fehler in einem Teil verhindert die
 * anderen nicht, und schlaegt ein Abruf fehl, bleibt die vorhandene
 * Ausgabedatei unveraendert stehen - lieber alte Daten mit erkennbarem Datum
 * als gar keine. Am Ende steht $TP_PRIVAT_DIR/aktualisierung.json mit je
 * Teil: Zeitpunkt, Dauer, Anzahl Datensaetze, Erfolg/Fehler samt Meldung.
 *
 * Zugang: SHOPIFY_ADMIN_TOKEN (shpat_) oder SHOPIFY_CLIENT_ID/SECRET in
 * .env.local (operations/sync/zugang.mjs, domains/shopify/admin-token-oauth.md).
 * Ohne Zugangsdaten bricht jeder Teil mit klarer Meldung ab - kein stiller
 * Fehlschlag, keine erfundenen Daten. Dieses Skript sucht nie selbst im
 * Shopify-MCP (der laeuft nur innerhalb einer Claude-Sitzung).
 *
 * MCP-Weg ohne Token: die Abfrage in der Sitzung ausfuehren, die Antwort als
 * Datei ablegen und hier hereingeben -
 *
 *   npm run daten:aktualisieren -- --input kunden=/pfad/kunden-roh.json
 *
 * Das geht fuer kunden, angebote, warenkoerbe und bestand (EINGABE_TEILE);
 * lexikon, bestellungen und kennzahlen haben dafuer ihre eigenen Exporte mit
 * --input, damit es fuer denselben Zweck nicht zwei Wege gibt. Ohne --nur
 * laeuft dann genau die Teilmenge, fuer die eine Datei vorliegt - alles andere
 * wuerde ohne Token ohnehin nur Fehlermeldungen erzeugen. Die Herkunft steht
 * hinterher in aktualisierung.json, damit eine Datei nie wie ein Live-Abruf
 * aussieht.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STANDARD_PRIVAT_DIR = path.join(os.homedir(), 'teppich-paradies-analyse');
const TEILE = ['lexikon', 'bestellungen', 'kennzahlen', 'kunden', 'angebote', 'warenkoerbe', 'bestand'];

/** Teile, die eine fertige Admin-API-Antwort per --input annehmen (MCP-Weg). */
export const EINGABE_TEILE = ['kunden', 'angebote', 'warenkoerbe', 'bestand'];

/** Die drei uebrigen Teile haben laengst ein eigenes Skript mit --input. */
const EIGENES_SKRIPT = {
  lexikon: 'npm run lexikon:export -- --input <datei>',
  bestellungen: 'npm run ops:bestelluebersicht -- --input <datei>',
  kennzahlen: 'npm run kennzahlen:export -- --input <datei>',
};

export function argumente(argv) {
  const a = { nur: null, privatDir: null, eingaben: {}, hilfe: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--nur') a.nur = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (k === '--privat-dir') a.privatDir = argv[++i];
    else if (k === '--input') {
      const wert = String(argv[++i] || '');
      const trenn = wert.indexOf('=');
      if (trenn < 1) throw new Error(`--input erwartet <teil>=<datei>, bekam: ${wert || '(nichts)'}`);
      const teil = wert.slice(0, trenn).trim();
      const datei = wert.slice(trenn + 1).trim();
      if (!datei) throw new Error(`--input ${teil}=: Dateiname fehlt`);
      if (!TEILE.includes(teil)) throw new Error(`Unbekannter Teil in --input: ${teil} (erlaubt: ${EINGABE_TEILE.join(', ')})`);
      if (!EINGABE_TEILE.includes(teil)) throw new Error(`--input ${teil} gibt es hier nicht - dieser Teil hat ein eigenes Skript: ${EIGENES_SKRIPT[teil]}`);
      a.eingaben[teil] = datei;
    }
    else if (k === '--help' || k === '-h') a.hilfe = true;
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  if (a.nur) {
    for (const t of a.nur) if (!TEILE.includes(t)) throw new Error(`Unbekannter Teil in --nur: ${t} (erlaubt: ${TEILE.join(', ')})`);
    // Eine Datei fuer einen Teil, der gar nicht laeuft, ist fast immer ein
    // Tippfehler - lieber sofort melden als stillschweigend ignorieren.
    for (const t of Object.keys(a.eingaben)) {
      if (!a.nur.includes(t)) throw new Error(`--input ${t}=... ist gesetzt, aber --nur ${a.nur.join(',')} laesst diesen Teil aus`);
    }
  }
  return a;
}

function privatDir(uebersteuerung) {
  return uebersteuerung || process.env.TP_PRIVAT_DIR || STANDARD_PRIVAT_DIR;
}

/**
 * Fehlertext ohne Zugang. Nennt gleich den zweiten Weg, damit niemand erst
 * suchen muss, wenn der Knopf "Jetzt aktualisieren" am fehlenden Token haengt.
 */
function ohneZugang(teil) {
  return `Kein Zugang in .env.local (SHOPIFY_ADMIN_TOKEN oder SHOPIFY_CLIENT_ID/SECRET) - oder --input ${teil}=<datei> mit einem MCP-Export nutzen`;
}

/**
 * Herkunftsvermerk fuer aktualisierung.json. Eine hereingegebene Datei ist
 * kein Live-Abruf: das muss im Dashboard erkennbar bleiben, sonst sieht ein
 * Stand von gestern aus wie eben abgerufen.
 */
function ausDatei(eingabe) {
  return `aus Datei ${eingabe.datei} (MCP-Export)`;
}

/** Fuehrt einen Teil aus und liefert immer ein Ergebnisobjekt - wirft nie. */
async function fuehreAus(name, fn) {
  const start = Date.now();
  const zeitpunkt = new Date().toISOString();
  try {
    const { anzahl, hinweis } = await fn();
    return { teil: name, zeitpunkt, dauerMs: Date.now() - start, erfolg: true, anzahl, meldung: hinweis || null };
  } catch (err) {
    return { teil: name, zeitpunkt, dauerMs: Date.now() - start, erfolg: false, anzahl: null, meldung: err.message };
  }
}

async function teilLexikon(dir) {
  const { ladeLive } = await import('./lexikon-export.mjs');
  const { aufbereiten } = await import('../lib/lexikon.mjs');
  const daten = await ladeLive();
  const modell = aufbereiten(daten);
  const ziel = path.join(dir, 'lexikon', 'produkte.json');
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, JSON.stringify(modell, null, 2));
  return { anzahl: modell.anzahl };
}

async function teilKennzahlen(dir) {
  const { ladeLive } = await import('./kennzahlen-export.mjs');
  const { schnappschuss } = await import('../lib/kennzahlen.mjs');
  const daten = await ladeLive(35);
  const schnapp = schnappschuss(daten);
  const ziel = path.join(dir, 'kennzahlen', 'shop-snapshot.json');
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, JSON.stringify(schnapp, null, 2));
  return { anzahl: daten.orders.length };
}

/** nodes(ids:) der Admin API nimmt bis zu 250 IDs je Aufruf - bei mehr Quellvarianten wird in Gruppen geblaettert. */
const QUELLVARIANTEN_JE_AUFRUF = 250;

/** Gleiche Variantenform wie sync/orders.mjs ORDERS_QUERY, fuer die Quellvarianten der Muster. */
const QUELLVARIANTEN_QUERY = `
query OpsQuellvarianten($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on ProductVariant {
      id sku title
      metafields(namespace: "einkauf", first: 20) { nodes { namespace key type value } }
      lieferant: metafields(namespace: "lieferant", first: 10) { nodes { namespace key type value } }
      custom: metafields(namespace: "custom", first: 20) { nodes { namespace key type value } }
      product {
        id handle title
        metafields(namespace: "custom", first: 20) { nodes { namespace key type value } }
        grosshandel: metafields(namespace: "grosshandel", first: 5) { nodes { namespace key type value } }
      }
    }
  }
}`;

function quellvarianteIdsAus(orders) {
  const ids = new Set();
  for (const o of orders) {
    for (const li of o.lineItems?.nodes ?? []) {
      const wert = (li.customAttributes ?? []).find(a => a.key === '_Quellvariante_ID')?.value;
      if (!wert) continue;
      const id = /^\d+$/.test(String(wert).trim()) ? `gid://shopify/ProductVariant/${String(wert).trim()}` : String(wert).trim();
      ids.add(id);
    }
  }
  return [...ids];
}

/** Teilt ids in Gruppen von hoechstens `groesse`, ohne die Reihenfolge zu aendern. */
function inGruppen(liste, groesse) {
  const gruppen = [];
  for (let i = 0; i < liste.length; i += groesse) gruppen.push(liste.slice(i, i + groesse));
  return gruppen;
}

async function teilBestellungen(dir) {
  const { erzeugeProxy } = await import('../sync/zugang.mjs');
  const { fetchOrdersRelevant, wartenBeiThrottle } = await import('../sync/orders.mjs');
  const { proxy, art } = await erzeugeProxy();
  if (art === 'sammeln') throw new Error('Kein Zugang in .env.local (SHOPIFY_ADMIN_TOKEN oder SHOPIFY_CLIENT_ID/SECRET) - --input mit MCP-Export nutzen');

  // Abgrenzung (D fuer Vollstaendigkeit): alle Bestellungen der letzten 90
  // Tage PLUS alle noch nicht vollstaendig erfuellten, unabhaengig vom Alter -
  // siehe baueRelevantQuery in sync/orders.mjs. Vollstaendig paginiert, kein
  // festes Limit mehr (vorher: letzte 50 Bestellungen, seit 2026-09 zu wenig
  // fuer den taeglichen Betrieb).
  const { orders, seiten, gesammelt } = await fetchOrdersRelevant(proxy);
  if (gesammelt) throw new Error('Kein Zugang (Sammelmodus) - Bestellungen konnten nicht geladen werden');

  // Quellvarianten der Muster ohne festes Limit: die Admin API nimmt bis zu
  // 250 IDs je nodes()-Aufruf, bei mehr wird in Gruppen nachgeladen.
  const ids = quellvarianteIdsAus(orders);
  let quellvarianten = [];
  for (const gruppe of inGruppen(ids, QUELLVARIANTEN_JE_AUFRUF)) {
    // eslint-disable-next-line no-await-in-loop -- Gruppen laufen bewusst nacheinander, damit die Throttle-Wartung greifen kann.
    const antwort = await proxy.execute(QUELLVARIANTEN_QUERY, { ids: gruppe });
    quellvarianten.push(...(antwort?.nodes ?? []).filter(Boolean));
    // eslint-disable-next-line no-await-in-loop
    await wartenBeiThrottle(proxy);
  }

  const ziel = path.join(dir, 'bestelluebersicht', 'orders.json');
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  const exportiertAm = new Date().toISOString();
  fs.writeFileSync(ziel, JSON.stringify({ exportiertAm, orders, quellvarianten }, null, 2));

  // Erfuellungen/Rueckerstattungen stecken schon in denselben Bestelldaten
  // (fulfillments/refunds in ORDERS_QUERY) - kein zweiter Abruf noetig.
  const { aufbereiten: erfuellungAufbereiten } = await import('../lib/erfuellung.mjs');
  const erfuellung = erfuellungAufbereiten({ orders });
  const erfuellungZiel = path.join(dir, 'erfuellung', 'erfuellung.json');
  fs.mkdirSync(path.dirname(erfuellungZiel), { recursive: true });
  fs.writeFileSync(erfuellungZiel, JSON.stringify(erfuellung, null, 2));

  return {
    anzahl: orders.length,
    hinweis: `${seiten} Seite(n) · ${quellvarianten.length}/${ids.length} Quellvarianten der Muster geladen · ${erfuellung.versendet} versendet · ${erfuellung.erstattet} erstattet`,
  };
}

async function teilKunden(dir, eingabe = null) {
  const { aufbereiten } = await import('../lib/kunden.mjs');
  let daten = eingabe?.daten ?? null;
  let hinweis = eingabe ? ausDatei(eingabe) : null;
  if (!daten) {
    const { erzeugeProxy } = await import('../sync/zugang.mjs');
    const { fetchCustomers } = await import('../sync/customers.mjs');
    const { proxy, art } = await erzeugeProxy();
    if (art === 'sammeln') throw new Error(ohneZugang('kunden'));
    const { customers, seiten, gesammelt } = await fetchCustomers(proxy);
    if (gesammelt) throw new Error('Kein Zugang (Sammelmodus) - Kunden konnten nicht geladen werden');
    daten = { customers };
    hinweis = `${seiten} Seite(n)`;
  }
  const modell = aufbereiten(daten);
  const ziel = path.join(dir, 'kunden', 'kunden.json');
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, JSON.stringify(modell, null, 2));
  return { anzahl: modell.anzahl, hinweis };
}

async function teilAngebote(dir, eingabe = null) {
  const { aufbereiten } = await import('../lib/angebote.mjs');
  let daten = eingabe?.daten ?? null;
  let quelle = eingabe ? ausDatei(eingabe) : null;
  if (!daten) {
    const { erzeugeProxy } = await import('../sync/zugang.mjs');
    const { fetchDraftOrders } = await import('../sync/draftOrders.mjs');
    const { proxy, art } = await erzeugeProxy();
    if (art === 'sammeln') throw new Error(ohneZugang('angebote'));
    const { draftOrders, seiten, gesammelt } = await fetchDraftOrders(proxy);
    if (gesammelt) throw new Error('Kein Zugang (Sammelmodus) - Angebote konnten nicht geladen werden');
    daten = { draftOrders };
    quelle = `${seiten} Seite(n)`;
  }
  const modell = aufbereiten(daten);
  const ziel = path.join(dir, 'angebote', 'angebote.json');
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, JSON.stringify(modell, null, 2));
  return { anzahl: modell.anzahl, hinweis: `${quelle} · ${modell.offen} offen` };
}

async function teilWarenkoerbe(dir, eingabe = null) {
  const { aufbereiten } = await import('../lib/warenkoerbe.mjs');
  let daten = eingabe?.daten ?? null;
  let quelle = eingabe ? ausDatei(eingabe) : null;
  if (!daten) {
    const { erzeugeProxy } = await import('../sync/zugang.mjs');
    const { fetchAbandonedCheckouts } = await import('../sync/abandonedCheckouts.mjs');
    const { proxy, art } = await erzeugeProxy();
    if (art === 'sammeln') throw new Error(ohneZugang('warenkoerbe'));
    const { checkouts, seiten, gesammelt } = await fetchAbandonedCheckouts(proxy);
    if (gesammelt) throw new Error('Kein Zugang (Sammelmodus) - Warenkoerbe konnten nicht geladen werden');
    daten = { checkouts };
    quelle = `${seiten} Seite(n)`;
  }
  const modell = aufbereiten(daten);
  const ziel = path.join(dir, 'warenkoerbe', 'warenkoerbe.json');
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, JSON.stringify(modell, null, 2));
  return { anzahl: modell.anzahl, hinweis: `${quelle} · ${modell.offenWert} € offener Wert` };
}

async function teilBestand(dir, eingabe = null) {
  const { aufbereiten } = await import('../lib/bestand.mjs');
  let daten = eingabe?.daten ?? null;
  if (!daten) {
    const { erzeugeProxy } = await import('../sync/zugang.mjs');
    const { fetchInventoryLevels } = await import('../sync/inventory.mjs');
    const { proxy, art } = await erzeugeProxy();
    if (art === 'sammeln') throw new Error(ohneZugang('bestand'));
    const { standorte, bestand, gesammelt } = await fetchInventoryLevels(proxy);
    if (gesammelt) throw new Error('Kein Zugang (Sammelmodus) - Lagerbestand konnte nicht geladen werden');
    daten = { standorte, bestand };
  }
  const modell = aufbereiten(daten);
  const ziel = path.join(dir, 'bestand', 'bestand.json');
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, JSON.stringify(modell, null, 2));
  const lage = modell.gefuehrt ? `${modell.standorte.length} Standort(e)` : modell.hinweis;
  return { anzahl: modell.anzahl, hinweis: eingabe ? `${ausDatei(eingabe)} · ${lage}` : lage };
}

export const TEIL_FN = {
  lexikon: teilLexikon, bestellungen: teilBestellungen, kennzahlen: teilKennzahlen,
  kunden: teilKunden, angebote: teilAngebote, warenkoerbe: teilWarenkoerbe, bestand: teilBestand,
};

/**
 * @param {object} opt
 * @param {string[]|null} opt.nur  Teilmenge aus TEILE, sonst alle.
 * @param {string} opt.dir  Zielverzeichnis ($TP_PRIVAT_DIR).
 * @param {object} opt.teilFn  Ueberschreibbare Teil-Implementierungen (Tests).
 */
/**
 * Neuer Stand eines Teils nach einem Lauf. Ein gescheiterter Lauf schreibt
 * keine Ausgabedatei - die Daten des letzten erfolgreichen Laufs gelten also
 * weiter. Deshalb bleibt dessen Stand (Zeitpunkt, Anzahl) erhalten und der
 * Fehlschlag steht daneben unter `letzterFehler`; sonst zeigte das Dashboard
 * nach einem Klick auf "Jetzt aktualisieren" ohne Zugang gueltige Daten als
 * gescheitert an und verloere die 24-Stunden-Warnung. Nur ohne frueheren
 * Erfolg wird der Teil selbst als gescheitert gefuehrt.
 */
export function standNachLauf(bisher, r) {
  if (r.erfolg) return { zeitpunkt: r.zeitpunkt, dauerMs: r.dauerMs, erfolg: true, anzahl: r.anzahl, meldung: r.meldung };
  const fehler = { zeitpunkt: r.zeitpunkt, meldung: r.meldung };
  if (bisher?.erfolg) return { ...bisher, letzterFehler: fehler };
  return { zeitpunkt: r.zeitpunkt, dauerMs: r.dauerMs, erfolg: false, anzahl: null, meldung: r.meldung };
}

/**
 * @param {object} opt
 * @param {string[]|null} opt.nur  Teilmenge aus TEILE.
 * @param {Record<string,{daten:object,datei:string}>} opt.eingaben  Bereits
 *   gelesene Admin-API-Antworten je Teil (MCP-Weg). Ohne `nur` bestimmt diese
 *   Menge, welche Teile laufen: die uebrigen haetten ohne Token nur Fehler.
 */
export async function aktualisiere({ nur = null, dir = privatDir(), teilFn = TEIL_FN, eingaben = {} } = {}) {
  const ausEingabe = Object.keys(eingaben);
  const auszufuehren = nur && nur.length ? nur : (ausEingabe.length ? ausEingabe : TEILE);
  const ergebnisse = [];
  for (const teil of auszufuehren) {
    // eslint-disable-next-line no-await-in-loop -- Teile laufen absichtlich nacheinander (ein Fehler darf die anderen nicht verhindern, aber parallele Bulk-Operationen gegen dieselbe Admin API sind nicht noetig).
    ergebnisse.push(await fuehreAus(teil, () => teilFn[teil](dir, eingaben[teil] ?? null)));
  }

  // Bestehenden Stand mit uebernehmen, damit Teile, die diesmal nicht liefen
  // (z. B. --nur lexikon), ihren letzten bekannten Stand behalten.
  const statusDatei = path.join(dir, 'aktualisierung.json');
  let bestehend = { teile: {} };
  try { bestehend = JSON.parse(fs.readFileSync(statusDatei, 'utf8')); } catch { /* erster Lauf oder defekt - neu anlegen */ }
  const teileStatus = { ...(bestehend.teile || {}) };
  for (const r of ergebnisse) {
    teileStatus[r.teil] = standNachLauf(teileStatus[r.teil], r);
  }
  const status = { aktualisiertAm: new Date().toISOString(), teile: teileStatus };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statusDatei, JSON.stringify(status, null, 2));
  return { statusDatei, status, ergebnisse };
}

async function main() {
  const a = argumente(process.argv.slice(2));
  if (a.hilfe) {
    console.log('npm run daten:aktualisieren -- [--nur lexikon|bestellungen|kennzahlen|kunden|angebote|warenkoerbe|bestand[,...]] [--input <teil>=<datei>] [--privat-dir <pfad>]');
    console.log(`  --input nimmt eine fertige Admin-API-Antwort statt eines eigenen Abrufs (fuer ${EINGABE_TEILE.join(', ')}).`);
    console.log('  Ohne --nur laufen dann genau die Teile, fuer die eine Datei vorliegt.');
    return;
  }
  const dir = privatDir(a.privatDir);
  const eingaben = {};
  for (const [teil, datei] of Object.entries(a.eingaben)) {
    // Frueh und mit Dateinamen scheitern: ein Tippfehler im Pfad soll nicht
    // erst als Teil-Fehlschlag in aktualisierung.json auftauchen.
    try {
      eingaben[teil] = { daten: JSON.parse(fs.readFileSync(datei, 'utf8')), datei: path.basename(datei) };
    } catch (err) {
      throw new Error(`--input ${teil}=${datei}: ${err.message}`);
    }
  }
  const { statusDatei, ergebnisse } = await aktualisiere({ nur: a.nur, dir, eingaben });
  console.log(`Aktualisierung: ${statusDatei}`);
  let fehlerAnzahl = 0;
  for (const r of ergebnisse) {
    if (r.erfolg) console.log(`  ${r.teil}: OK · ${r.anzahl ?? '?'} Datensaetze · ${r.dauerMs}ms${r.meldung ? ` · ${r.meldung}` : ''}`);
    else { fehlerAnzahl += 1; console.log(`  ${r.teil}: FEHLER · ${r.meldung}`); }
  }
  if (fehlerAnzahl) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(`Fehler: ${err.message}`); process.exit(1); });
}
