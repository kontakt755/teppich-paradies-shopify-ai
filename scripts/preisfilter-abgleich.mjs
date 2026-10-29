#!/usr/bin/env node
/**
 * Preisfilter Teppichboden: Metafeld custom.meterpreis_bereich abgleichen (Werkbank w-189).
 *
 *   npm run -s preisfilter:abgleich                        # lesen, Plan + Pakete ablegen; Exit 1 = etwas zu tun
 *   npm run -s preisfilter:abgleich -- --schreiben         # Plan ausfuehren (Metafelder setzen/loeschen), Gegenprobe
 *   npm run -s preisfilter:abgleich -- --export <datei>    # Plan aus einem vorhandenen Export (kein Live-Abruf, nie mit --schreiben)
 *   npm run -s preisfilter:abgleich -- --ziel <ordner>     # Ablage (Standard $TP_PRIVAT_DIR/preisfilter/<datum>/<uhrzeit>, je Lauf neu)
 *   npm run -s preisfilter:abgleich -- --zurueck <rueckweg.json>   # Altwerte eines Laufs wieder einspielen
 *   npm run -s preisfilter:abgleich -- --definition        # Metafeld-Definition pruefen, fehlt sie: anlegen
 *   npm run -s preisfilter:abgleich -- --still             # Dienst: nichts ausgeben, wenn nichts zu tun ist
 *   npm run -s preisfilter:abgleich -- --zugang cli|token  # Shopify-CLI oder Token aus .env.local (Standard: Token, wenn vorhanden)
 *   npm run -s preisfilter:abgleich -- --hoechstens <n>    # nur die ersten n Aenderungen schreiben (Probelauf)
 *
 * ─── Warum ───────────────────────────────────────────────────────────
 * Shopifys Preisfilter (filter.v.price) filtert ueber alle Variantenpreise. Bei
 * Teppichboden kostet die Wunschmass-Variante je m2 mehr als die Meterware, die
 * Karte zeigt aber den Meterpreis ("ab 33,00 EUR/m2"). Wer 40-60 EUR waehlte,
 * sah 16 von 82 Treffern mit ab-Preis unter 40 EUR (Rundgang 28.10.2026, w-189).
 * Ersatz ist der Search-&-Discovery-Filter "Preis je m2" auf diesem Metafeld;
 * das Theme blendet den Standard-Preisfilter in Teppichboden-Kollektionen aus
 * (snippets/tp-preisfilter-versteckt.liquid). Der Wert ist ein fester Bereich als
 * Text, damit Search & Discovery keine Wertgruppen braucht (Zahlen-Metafelder
 * zeigt es nur als Einzelwerte) und Filterlinks stabil bleiben.
 *
 * ─── Regel ───────────────────────────────────────────────────────────
 * Grundlage ist der Preis, den die Karte als "ab" zeigt (snippets/price.liquid):
 * bei Rollenware der niedrigste Variantenpreis der Meterware (ohne Wunschmass/
 * Raummass, ohne Muster, ohne OPC-Konfigurator), bei Paketware
 * (custom.qm_pro_paket) der niedrigste Paketpreis je m2. Massgeblich ist der
 * aktuelle Verkaufspreis inklusive laufender Aktion - der Kunde filtert nach dem
 * Preis, den er zahlt. Nur Produkte vom Typ "Teppichboden"; Muster, Entwuerfe und
 * Archiviertes bekommen keinen Wert (ein vorhandener wird entfernt).
 *
 * Nach jeder Preisaenderung (Rueckstellung, Angebotswelle, Einzelpreise) muss der
 * Abgleich nachziehen: Dienst net.teppich-paradies.preisfilter (stuendlich, aus
 * ~/tp-dashboard) und Pflichtschritt nach jedem Preislauf (docs/angebotswelle.md).
 *
 * Zugang: Token aus .env.local (operations/sync/zugang.mjs, im Dienst-Checkout) oder
 * Shopify-CLI (`shopify store execute`, Schreiben mit --allow-mutations). Die CLI
 * im Auto-Modus: Pakete liegen unter <ziel>/pakete/ und lassen sich auch einzeln
 * per `shopify store execute ... --allow-mutations --query-file` absetzen.
 * Ablage (Vorher-Stand, Plan, Rueckweg, Pakete, Protokoll) unter $TP_PRIVAT_DIR,
 * nie im Repository.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { istRaummass } from '../operations/scripts/angebotswelle.mjs';

export const STORE = 'sjjyq1-6w.myshopify.com';
export const NAMESPACE = 'custom';
export const KEY = 'meterpreis_bereich';
export const TYP = 'single_line_text_field';
export const PRODUKTTYP = 'Teppichboden';
/** metafieldsSet nimmt hoechstens 25 Metafelder je Aufruf; mehrere Aufrufe je Paket per Alias. */
export const JE_AUFRUF = 25;
export const AUFRUFE_JE_PAKET = 4;
/** metafieldsDelete nimmt bis zu 250 Kennungen je Aufruf. */
export const JE_LOESCHAUFRUF = 250;

export const DEFINITION = {
  name: 'Preis je m² (Bereich)',
  namespace: NAMESPACE,
  key: KEY,
  type: TYP,
  ownerType: 'PRODUCT',
  description: 'Preisbereich je m² zum aktuellen Verkaufspreis (Meterware bzw. Paketpreis je m²). Wird automatisch gesetzt (npm run preisfilter:abgleich) – nicht von Hand pflegen. Quelle des Filters „Preis je m²“ in Search & Discovery.',
  access: { storefront: 'PUBLIC_READ' },
  pin: false,
};

/**
 * Bereiche in Cent je m2: untere Grenze einschliesslich, obere ausschliesslich.
 * Die Labels sind zugleich die Filterwerte im Shop (Search & Discovery sortiert
 * sie dort manuell in dieser Reihenfolge). Verteilung 29.10.2026 ueber 347
 * Teppichboeden: 20 / 31 / 67 / 63 / 50 / 37 / 11 (+ Paketware), deshalb keine
 * Sammelklasse "ueber 60" - dort laegen sonst 161 der 279 Rollenwaren.
 */
export const BEREICHE = [
  { label: 'unter 30 €/m²', von: 0, bis: 3000 },
  { label: '30 bis 40 €/m²', von: 3000, bis: 4000 },
  { label: '40 bis 60 €/m²', von: 4000, bis: 6000 },
  { label: '60 bis 80 €/m²', von: 6000, bis: 8000 },
  { label: '80 bis 100 €/m²', von: 8000, bis: 10000 },
  { label: '100 bis 150 €/m²', von: 10000, bis: 15000 },
  { label: 'ab 150 €/m²', von: 15000, bis: null },
];
export const LABELS = BEREICHE.map((b) => b.label);

export const cent = (x) => Math.round(Number(x) * 100);
const wert = (m) => (m && typeof m === 'object' ? m.value ?? null : m ?? null);
const knoten = (x) => (Array.isArray(x) ? x : Array.isArray(x?.nodes) ? x.nodes : Array.isArray(x?.edges) ? x.edges.map((e) => e.node) : []);
const gql = (s) => JSON.stringify(String(s));

/** Bereichslabel fuer einen Preis in Cent je m2 - oder null. */
export function bereichFuer(c) {
  if (!(c > 0)) return null;
  const b = BEREICHE.find((x) => c >= x.von && (x.bis == null || c < x.bis));
  return b ? b.label : null;
}

const istMusterVariante = (v) => /^M-/.test(String(v.sku || ''));
const istOpc = (v) => /opc-/i.test(String(v.title || ''));

/**
 * Preis je m2 in Cent, wie die Karte ihn als "ab" zeigt - oder { grund }.
 * Erwartet ein Produkt aus leseAlle()/--export: id, handle, status, productType,
 * qm (custom.qm_pro_paket), p001 (custom.preis_pro_001_qm), variants.
 */
export function meterpreisCent(p) {
  if (p.status !== 'ACTIVE') return { grund: 'nicht aktiv' };
  if (p.productType !== PRODUKTTYP) return { grund: `Produkttyp ${p.productType || 'leer'}` };
  if (/^muster-/.test(String(p.handle || ''))) return { grund: 'Musterprodukt' };
  const varianten = knoten(p.variants).filter((v) => !istMusterVariante(v) && !istOpc(v) && cent(v.price) > 0);
  const qm = Number(wert(p.qm));
  if (qm > 0) {
    // Paketware: die Karte rechnet den Paketpreis auf den Quadratmeter um (price.liquid, round in Cent).
    const preise = varianten.map((v) => Math.round(cent(v.price) / qm));
    if (!preise.length) return { grund: 'keine Variante mit Preis' };
    return { cent: Math.min(...preise), quelle: 'paket' };
  }
  const meter = varianten.filter((v) => !istRaummass(v));
  if (!meter.length) return { grund: varianten.length ? 'keine Meterware-Variante' : 'keine Variante mit Preis' };
  let min = Math.min(...meter.map((v) => cent(v.price)));
  // Preis je 0,01 m2 (Teppich nach Mass mit diesem Produkttyp): sichtbar ist das Hundertfache.
  if (String(wert(p.p001)) === 'true') min *= 100;
  return { cent: min, quelle: 'meterware' };
}

/** Sollwert eines Produkts: { label, cent, quelle } oder { label: null, grund }. */
export function sollWert(p) {
  const m = meterpreisCent(p);
  if (m.grund) return { label: null, grund: m.grund };
  const label = bereichFuer(m.cent);
  return { label, cent: m.cent, quelle: m.quelle, grund: label ? null : 'kein Bereich' };
}

/**
 * Plan: welche Produkte bekommen einen (anderen) Wert, wo wird einer entfernt.
 * Idempotent - ein zweiter Lauf ueber denselben Stand plant nichts mehr.
 */
export function planeAbgleich(produkte) {
  const setzen = []; const loeschen = []; const offen = []; const zaehlung = {};
  let unveraendert = 0;
  for (const p of produkte) {
    const ist = wert(p.mpb);
    const s = sollWert(p);
    if (!s.label) {
      if (ist !== null && ist !== undefined) loeschen.push({ ownerId: p.id, handle: p.handle, alt: ist, grund: s.grund });
      if (p.status === 'ACTIVE' && p.productType === PRODUKTTYP && s.grund !== 'Musterprodukt') offen.push({ handle: p.handle, grund: s.grund });
      continue;
    }
    zaehlung[s.label] = (zaehlung[s.label] || 0) + 1;
    if (ist === s.label) { unveraendert += 1; continue; }
    setzen.push({ ownerId: p.id, handle: p.handle, alt: ist ?? null, neu: s.label, cent: s.cent, quelle: s.quelle });
  }
  return { setzen, loeschen, offen, unveraendert, zaehlung };
}

/** Rueckweg eines Plans: Altwerte wieder setzen, vorher leere Felder wieder loeschen. */
export function rueckwegFuer(plan) {
  return {
    setzen: [
      ...plan.setzen.filter((e) => e.alt !== null).map((e) => ({ ownerId: e.ownerId, handle: e.handle, neu: e.alt })),
      ...plan.loeschen.map((e) => ({ ownerId: e.ownerId, handle: e.handle, neu: e.alt })),
    ],
    loeschen: plan.setzen.filter((e) => e.alt === null).map((e) => ({ ownerId: e.ownerId, handle: e.handle })),
  };
}

export function setzenAufruf(eintraege) {
  if (eintraege.length > JE_AUFRUF) throw new Error(`metafieldsSet nimmt hoechstens ${JE_AUFRUF} Metafelder je Aufruf`);
  const liste = eintraege.map((e) => `{ownerId:${gql(e.ownerId)},namespace:${gql(NAMESPACE)},key:${gql(KEY)},type:${gql(TYP)},value:${gql(e.neu)}}`).join(',');
  return `metafieldsSet(metafields:[${liste}]){metafields{id value}userErrors{field message code}}`;
}

export function loeschenAufruf(eintraege) {
  if (eintraege.length > JE_LOESCHAUFRUF) throw new Error(`metafieldsDelete nimmt hoechstens ${JE_LOESCHAUFRUF} Kennungen je Aufruf`);
  const liste = eintraege.map((e) => `{ownerId:${gql(e.ownerId)},namespace:${gql(NAMESPACE)},key:${gql(KEY)}}`).join(',');
  return `metafieldsDelete(metafields:[${liste}]){deletedMetafields{ownerId key}userErrors{field message}}`;
}

/** Mutationstexte (je Datei bis zu AUFRUFE_JE_PAKET aliasierte Aufrufe). */
export function bauePakete({ setzen = [], loeschen = [] }) {
  const aufrufe = [];
  for (let i = 0; i < setzen.length; i += JE_AUFRUF) aufrufe.push(setzenAufruf(setzen.slice(i, i + JE_AUFRUF)));
  for (let i = 0; i < loeschen.length; i += JE_LOESCHAUFRUF) aufrufe.push(loeschenAufruf(loeschen.slice(i, i + JE_LOESCHAUFRUF)));
  const pakete = [];
  for (let i = 0; i < aufrufe.length; i += AUFRUFE_JE_PAKET) {
    pakete.push(`mutation{\n${aufrufe.slice(i, i + AUFRUFE_JE_PAKET).map((a, j) => `a${j}:${a}`).join('\n')}\n}\n`);
  }
  return pakete;
}

/** userErrors aller aliasierten Aufrufe einer Antwort - leer heisst nur "angenommen", nicht "steht im Shop". */
export function fehlerAus(antwort) {
  const daten = antwort?.data ?? antwort ?? {};
  const fehler = [];
  for (const [alias, teil] of Object.entries(daten)) {
    for (const u of teil?.userErrors || []) fehler.push(`${alias}: ${u.message}${u.field ? ` (${[].concat(u.field).join('.')})` : ''}`);
  }
  return fehler;
}

export function argumente(argv) {
  const a = { schreiben: false, still: false, export: null, ziel: null, zurueck: null, definition: false, zugang: null, hoechstens: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--schreiben') a.schreiben = true;
    else if (k === '--still') a.still = true;
    else if (k === '--definition') a.definition = true;
    else if (k === '--export') a.export = argv[++i];
    else if (k === '--ziel') a.ziel = argv[++i];
    else if (k === '--zurueck') a.zurueck = argv[++i];
    else if (k === '--zugang') a.zugang = argv[++i];
    else if (k === '--hoechstens') a.hoechstens = Number(argv[++i]);
    else throw new Error(`Unbekanntes Argument: ${k}`);
  }
  for (const f of ['export', 'ziel', 'zurueck', 'zugang']) if (a[f] === undefined) throw new Error(`--${f} braucht einen Wert`);
  if (a.zugang && !['cli', 'token'].includes(a.zugang)) throw new Error('--zugang kennt nur cli oder token');
  if (!(a.hoechstens > 0)) throw new Error('--hoechstens muss eine Zahl > 0 sein');
  // Ohne Live-Abruf gibt es keine Gegenprobe - und ein alter Export plant gegen einen alten Stand.
  if (a.export && a.schreiben) throw new Error('--export und --schreiben schliessen sich aus: geschrieben wird nur nach frischem Live-Abruf');
  if (a.export && a.zurueck) throw new Error('--export und --zurueck schliessen sich aus');
  return a;
}

/** Ablage je Lauf: <basis>/<JJJJ-MM-TT>/<HHMMSS> (Berlin) - ein zweiter Lauf am selben Tag ueberschreibt nie den Rueckweg des ersten. */
export function laufOrdner(basis, jetzt = new Date()) {
  const datum = jetzt.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const zeit = jetzt.toLocaleTimeString('sv-SE', { timeZone: 'Europe/Berlin', hour12: false }).replace(/:/g, '');
  let ziel = path.join(basis, datum, zeit);
  for (let n = 2; fs.existsSync(ziel); n++) ziel = path.join(basis, datum, `${zeit}-${n}`);
  return ziel;
}

/** Erwartete Werte nach dem Schreiben: { ownerId -> Wert | null }. */
export function erwartung({ setzen = [], loeschen = [] }) {
  const m = new Map();
  for (const e of setzen) m.set(e.ownerId, e.neu);
  for (const e of loeschen) m.set(e.ownerId, null);
  return m;
}

/** Vergleich frisch gelesener Werte mit der Erwartung -> { gleich, abweichend: [...] }. */
export function vergleiche(erwartet, gelesen) {
  let gleich = 0; const abweichend = [];
  for (const [id, soll] of erwartet) {
    const ist = gelesen.has(id) ? gelesen.get(id) : null;
    if (ist === soll) gleich += 1; else abweichend.push({ ownerId: id, soll, ist });
  }
  return { gleich, abweichend };
}

export const WERTE_ABFRAGE = `query($ids:[ID!]!){ nodes(ids:$ids){ ... on Product { id mpb:metafield(namespace:${gql(NAMESPACE)},key:${gql(KEY)}){value} } } }`;

/** Metafeldwerte genau dieser Produkte frisch lesen (je 100 IDs). */
export async function leseWerte(frage, ids) {
  const werte = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    // eslint-disable-next-line no-await-in-loop
    const d = await frage(WERTE_ABFRAGE, { ids: ids.slice(i, i + 100) });
    for (const n of d?.nodes || []) if (n?.id) werte.set(n.id, n.mpb?.value ?? null);
  }
  return werte;
}

export function privatDir(env = process.env) {
  return env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

/** Export-Datei (Array oder { produkte: [...] }) in die Produktliste wandeln. */
export function ladeExport(text) {
  const d = JSON.parse(text);
  const liste = Array.isArray(d) ? d : Array.isArray(d.produkte) ? d.produkte : null;
  if (!liste) throw new Error('Export: erwartet ein Array oder { produkte: [...] }');
  return liste;
}

export const ABFRAGE = `query($after:String){ products(first:50, after:$after, query:${gql(`product_type:${PRODUKTTYP}`)}){
  nodes{ id handle status productType
    qm:metafield(namespace:"custom",key:"qm_pro_paket"){value}
    p001:metafield(namespace:"custom",key:"preis_pro_001_qm"){value}
    mpb:metafield(namespace:${gql(NAMESPACE)},key:${gql(KEY)}){value}
    variants(first:250){nodes{id sku title price selectedOptions{name value}}} }
  pageInfo{hasNextPage endCursor} } }`;

export async function leseAlle(frage) {
  const alle = []; let after = null;
  do {
    const d = await frage(ABFRAGE, { after });
    alle.push(...d.products.nodes);
    after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);
  return alle;
}

// ---------- Zugang ----------

function cliAusfuehren(text, variables, mutation) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-preisfilter-'));
  const q = path.join(tmp, mutation ? 'm.graphql' : 'q.graphql'); const o = path.join(tmp, 'o.json');
  fs.writeFileSync(q, text);
  const args = ['store', 'execute', '-s', STORE, '-j', '--query-file', q, '--output-file', o];
  if (mutation) args.push('--allow-mutations');
  if (variables) args.push('-v', JSON.stringify(variables));
  try {
    execFileSync('shopify', args, { stdio: 'pipe' });
    const r = JSON.parse(fs.readFileSync(o, 'utf8'));
    if (Array.isArray(r.errors) && r.errors.length) throw new Error(`Shopify GraphQL: ${r.errors.map((e) => e.message).join('; ').slice(0, 300)}`);
    return r.data ?? r;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** { art, frage(query, variables), schreibe(mutation) } - Token aus .env.local, sonst Shopify-CLI. */
export async function zugang(gewuenscht = null, env = process.env) {
  const { hatZugangsdaten, erzeugeProxy, ladeEnvLocal } = await import('../operations/sync/zugang.mjs');
  const umgebung = { ...ladeEnvLocal(), ...env };
  const art = gewuenscht || (hatZugangsdaten(umgebung) ? 'token' : 'cli');
  if (art === 'token') {
    if (!hatZugangsdaten(umgebung)) throw new Error('--zugang token: kein SHOPIFY_ADMIN_TOKEN bzw. SHOPIFY_CLIENT_ID/SECRET in .env.local');
    const { proxy } = await erzeugeProxy({ env: umgebung });
    return { art, frage: (q, v) => proxy.execute(q, v), schreibe: (m) => proxy.execute(m) };
  }
  return { art, frage: (q, v) => cliAusfuehren(q, v, false), schreibe: (m) => cliAusfuehren(m, null, true) };
}

// ---------- Definition ----------

export const DEFINITION_ABFRAGE = `{ metafieldDefinitions(ownerType: PRODUCT, namespace: ${gql(NAMESPACE)}, key: ${gql(KEY)}, first: 1) { nodes { id name type { name } access { storefront } } } }`;

export function definitionMutation(def = DEFINITION) {
  return `mutation{ metafieldDefinitionCreate(definition:{ name:${gql(def.name)}, namespace:${gql(def.namespace)}, key:${gql(def.key)}, type:${gql(def.type)}, ownerType:${def.ownerType}, description:${gql(def.description)}, pin:${def.pin ? 'true' : 'false'}, access:{ storefront:${def.access.storefront} } }){ createdDefinition{ id name } userErrors{ field message code } } }`;
}

export async function sichereDefinition(z, aus = console.log) {
  const d = await z.frage(DEFINITION_ABFRAGE);
  const vorhanden = d?.metafieldDefinitions?.nodes?.[0];
  if (vorhanden) {
    const passt = vorhanden.type?.name === TYP && vorhanden.access?.storefront === 'PUBLIC_READ';
    aus(`Definition ${NAMESPACE}.${KEY} vorhanden: ${vorhanden.id} (${vorhanden.type?.name}, Storefront ${vorhanden.access?.storefront})${passt ? '' : ' - WARNUNG: Typ oder Storefront-Zugriff weichen ab'}`);
    return { angelegt: false, id: vorhanden.id, passt };
  }
  const r = await z.schreibe(definitionMutation());
  const fehler = fehlerAus(r);
  if (fehler.length) throw new Error(`metafieldDefinitionCreate: ${fehler.join('; ')}`);
  const id = r?.metafieldDefinitionCreate?.createdDefinition?.id;
  const probe = await z.frage(DEFINITION_ABFRAGE);
  const steht = probe?.metafieldDefinitions?.nodes?.[0];
  if (!steht) throw new Error('Definition angelegt, aber die Gegenprobe findet sie nicht');
  aus(`Definition ${NAMESPACE}.${KEY} angelegt: ${id} (Gegenprobe: ${steht.type?.name}, Storefront ${steht.access?.storefront})`);
  return { angelegt: true, id, passt: true };
}

// ---------- Lauf ----------

function schreibDatei(ordner, name, inhalt) {
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(path.join(ordner, name), typeof inhalt === 'string' ? inhalt : JSON.stringify(inhalt, null, 1));
}

function legePaketeAb(ordner, pakete, praefix) {
  const dir = path.join(ordner, praefix);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^paket-\d+\.graphql$/.test(f)) fs.unlinkSync(path.join(dir, f));
  return pakete.map((text, i) => {
    const datei = path.join(dir, `paket-${String(i).padStart(2, '0')}.graphql`);
    fs.writeFileSync(datei, text);
    return datei;
  });
}

async function fuehrePaketeAus(z, dateien, aus) {
  const ergebnisse = [];
  for (const datei of dateien) {
    const text = fs.readFileSync(datei, 'utf8');
    // eslint-disable-next-line no-await-in-loop -- Pakete laufen bewusst nacheinander (Ratenlimit).
    const antwort = await z.schreibe(text);
    const fehler = fehlerAus(antwort);
    ergebnisse.push({ datei: path.basename(datei), fehler });
    aus(`${fehler.length ? 'FEHL' : 'OK  '} ${path.basename(datei)}${fehler.length ? `: ${fehler.join('; ')}` : ''}`);
  }
  return ergebnisse;
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const a = argumente(argv);
  const aus = deps.aus || console.log;
  const jetzt = deps.jetzt || new Date();
  const basis = path.join(privatDir(deps.env || process.env), 'preisfilter');
  // Ordner erst anlegen, wenn etwas abgelegt wird (Leerlaeufe des Dienstes hinterlassen nichts).
  let zielCache = a.ziel || null;
  const zielOrdner = () => (zielCache ||= laufOrdner(basis, jetzt));
  const z = deps.zugang || await zugang(a.zugang, deps.env || process.env);

  if (a.definition) await sichereDefinition(z, aus);

  if (a.zurueck) {
    const rueckweg = JSON.parse(fs.readFileSync(a.zurueck, 'utf8'));
    const ziel = zielOrdner();
    const pakete = bauePakete(rueckweg);
    const dateien = legePaketeAb(ziel, pakete, 'rueckweg-pakete');
    aus(`Rueckweg: ${rueckweg.setzen.length} Werte setzen, ${rueckweg.loeschen.length} loeschen (${dateien.length} Pakete, Zugang ${z.art})`);
    const ergebnisse = await fuehrePaketeAus(z, dateien, aus);
    // Gegenprobe je Feld - userErrors:[] ist kein Beleg.
    const soll = erwartung(rueckweg);
    const probe = vergleiche(soll, await leseWerte(z.frage, [...soll.keys()]));
    const ok = ergebnisse.every((e) => !e.fehler.length) && probe.abweichend.length === 0;
    schreibDatei(ziel, 'rueckweg-log.json', { zeit: new Date().toISOString(), quelle: a.zurueck, ergebnisse, gegenprobe: { gleich: probe.gleich, abweichend: probe.abweichend.slice(0, 20) }, ok });
    aus(`Gegenprobe Rueckweg: ${probe.gleich} gleich, ${probe.abweichend.length} abweichend -> ${ok ? 'OK' : 'ABWEICHUNG'}`);
    return ok ? 0 : 1;
  }

  const produkte = a.export ? ladeExport(fs.readFileSync(a.export, 'utf8')) : await leseAlle(z.frage);
  const plan = planeAbgleich(produkte);
  const zuTun = plan.setzen.length + plan.loeschen.length;
  const stand = {
    zeit: jetzt.toISOString(), zugang: z.art, quelle: a.export || 'live', produkte: produkte.length,
    unveraendert: plan.unveraendert, setzen: plan.setzen.length, loeschen: plan.loeschen.length,
    offen: plan.offen.length, zaehlung: plan.zaehlung, geschrieben: false, ok: zuTun === 0,
  };

  if (zuTun === 0 && !a.definition) {
    schreibDatei(basis, 'stand.json', stand);
    if (!a.still) aus(`Preisfilter: alle ${plan.unveraendert} Werte aktuell (${produkte.length} Produkte gelesen, ${plan.offen.length} ohne Bereich).`);
    return 0;
  }

  const ziel = zielOrdner();
  const auswahl = { setzen: plan.setzen.slice(0, a.hoechstens), loeschen: plan.loeschen.slice(0, Math.max(0, a.hoechstens - plan.setzen.length)) };
  const rueckweg = rueckwegFuer(auswahl);
  schreibDatei(ziel, 'vorher.json', produkte.map((p) => ({ ownerId: p.id, handle: p.handle, status: p.status, wert: wert(p.mpb) })));
  schreibDatei(ziel, 'plan.json', { zeit: stand.zeit, ...auswahl, zaehlung: plan.zaehlung });
  schreibDatei(ziel, 'offen.json', plan.offen);
  schreibDatei(ziel, 'rueckweg.json', rueckweg);
  const dateien = legePaketeAb(ziel, bauePakete(auswahl), 'pakete');
  schreibDatei(ziel, 'zusammenfassung.json', stand);

  aus(`${stand.zeit} Preisfilter ${NAMESPACE}.${KEY}: ${produkte.length} Produkte gelesen (${z.art}), ${plan.unveraendert} aktuell, ${plan.setzen.length} zu setzen, ${plan.loeschen.length} zu loeschen, ${plan.offen.length} ohne Bereich.`);
  aus(`Bereiche: ${LABELS.map((l) => `${l}: ${plan.zaehlung[l] || 0}`).join(' | ')}`);
  for (const e of auswahl.setzen.slice(0, 8)) aus(`  ${e.handle}: ${e.alt ?? '(leer)'} -> ${e.neu} (${(e.cent / 100).toFixed(2)} EUR/m2, ${e.quelle})`);
  if (auswahl.setzen.length > 8) aus(`  ... ${auswahl.setzen.length - 8} weitere, siehe ${path.join(ziel, 'plan.json')}`);
  for (const e of auswahl.loeschen.slice(0, 5)) aus(`  ${e.handle}: ${e.alt} entfernen (${e.grund})`);
  if (a.hoechstens < zuTun) aus(`Probelauf: nur ${auswahl.setzen.length + auswahl.loeschen.length} von ${zuTun} Aenderungen (--hoechstens).`);
  aus(`Pakete: ${dateien.length} unter ${path.join(ziel, 'pakete')}, Rueckweg ${path.join(ziel, 'rueckweg.json')}`);

  if (!a.schreiben) {
    aus('Nichts geschrieben. Schreiben: npm run -s preisfilter:abgleich -- --schreiben');
    schreibDatei(basis, 'stand.json', stand);
    return 1;
  }

  const ergebnisse = await fuehrePaketeAus(z, dateien, aus);
  // Gegenprobe: frisch lesen und erneut planen - userErrors:[] ist kein Beleg.
  const nachher = await leseAlle(z.frage);
  const probe = planeAbgleich(nachher);
  const offenNachher = probe.setzen.length + probe.loeschen.length;
  const erwartetOffen = zuTun - (auswahl.setzen.length + auswahl.loeschen.length);
  const felder = vergleiche(erwartung(auswahl), new Map(nachher.map((p) => [p.id, wert(p.mpb)])));
  const ok = ergebnisse.every((e) => !e.fehler.length) && felder.abweichend.length === 0 && offenNachher === erwartetOffen;
  const log = {
    zeit: new Date().toISOString(), zugang: z.art, pakete: ergebnisse,
    gegenprobe: { produkte: nachher.length, aktuell: probe.unveraendert, nochZuSetzen: probe.setzen.length, nochZuLoeschen: probe.loeschen.length, erwartetOffen, felderGleich: felder.gleich, felderAbweichend: felder.abweichend.slice(0, 20) },
    ok,
  };
  schreibDatei(ziel, 'write-log.json', log);
  schreibDatei(basis, 'stand.json', { ...stand, geschrieben: true, ok, gegenprobe: log.gegenprobe });
  aus(`Gegenprobe: ${felder.gleich} Felder wie geplant, ${felder.abweichend.length} abweichend; ${probe.unveraendert} aktuell, ${offenNachher} noch offen (erwartet ${erwartetOffen}) -> ${ok ? 'OK' : 'ABWEICHUNG'}`);
  return ok ? 0 : 1;
}

if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((e) => {
    console.error(`Fehler: ${e.message}`);
    process.exitCode = 2;
  });
}
