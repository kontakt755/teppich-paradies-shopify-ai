#!/usr/bin/env node
/**
 * Pflegt custom.teppich_basis_daten (JSON) an den Teppichen nach Mass.
 *
 *   npm run -s teppich:basis-daten                         # nur pruefen, Exit 1 bei Abweichung
 *   npm run -s teppich:basis-daten -- --pakete <ordner>    # zusaetzlich Schreibpakete + Rollback
 *   npm run -s teppich:basis-daten -- --theme <id>         # Vorlage aus einem Dev-/Vorschau-Theme lesen
 *   npm run -s teppich:basis-daten -- --kollektionen a,b   # andere Kollektionen (Standard unten)
 *   npm run -s teppich:basis-daten -- --handles a,b        # genau diese Produkte
 *
 * ─── Warum das Feld ───────────────────────────────────────────────────
 * Gruppe, Qualitaetszeile und groesste Breite eines Teppichs kommen vom
 * Teppichboden, aus dem zugeschnitten wird (service.einfass_basis). Das Aufloesen
 * dieser Produktreferenz kostet in Liquid rund 12 ms je Teppich; die Seite
 * Teppich nach Mass lief damit ab ~200 Teppichen in Shopifys Render-Timeout
 * (2026-10-10). Die Snippets lesen deshalb zuerst das gespeicherte Ergebnis.
 *
 * ─── Woher die Werte kommen ───────────────────────────────────────────
 * Nicht aus diesem Skript: die Vorlage product.teppich-basis-daten wertet die
 * echten Snippets (tp-teppich-gruppe, -qualitaet, -max-breite) mit live: true aus
 * und gibt "soll" und das gespeicherte "ist" als JSON aus. Die Regeln stehen damit
 * weiter nur im Theme; hier wird nur verglichen und geschrieben.
 *
 * Gelesen wird ueber den oeffentlichen Shop (kein Token noetig). Geschrieben wird
 * nicht von hier: --pakete legt metafieldsSet-Dateien (je 25) und eine
 * Rollback-Datei ab, die einzeln mit `shopify store execute` laufen
 * (siehe Ausgabe). Danach dieses Skript erneut starten - die Gegenprobe ist
 * "0 Abweichungen", nicht `userErrors: []`.
 *
 * Grenze: Die Vorlage laeuft durch Shopifys Seiten-Cache. Aendert sich nur der
 * Teppichboden (nicht der Teppich selbst), kann der Shop kurz noch den alten
 * "soll"-Stand liefern - dann nach einigen Minuten erneut pruefen. Eine sichere
 * Cache-Umgehung fuer Produktseiten ist nicht belegt (2026-10-10).
 *
 * Wann laufen lassen: nach jedem Import oder jeder Aenderung an einem
 * Teppichboden, der als Basis dient (Faser, Konstruktion, Flor, Rollenbreiten,
 * Verfuegbarkeit der Rollen). Bis dahin zeigt die Seite den alten Stand; neue
 * Teppiche ohne Feld werden live gerechnet und fehlen nie.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SHOP = 'https://www.teppich-paradies.net';
export const MYSHOPIFY = 'https://sjjyq1-6w.myshopify.com';
export const KOLLEKTIONEN = ['teppich-nach-mass', 'marken-teppiche-nach-mass', 'auslauf-teppich-nach-mass'];
export const NAMESPACE = 'custom';
export const KEY = 'teppich_basis_daten';
const JE_PAKET = 25;
const PARALLEL = 4;

const MIT_WERT = ['pakete', 'theme', 'kollektionen', 'handles'];

export function argumente(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) throw new Error(`unerwartetes Argument: ${k}`);
    const name = k.slice(2);
    if (!MIT_WERT.includes(name)) throw new Error(`unbekannte Option: ${k}`);
    const wert = argv[i + 1];
    if (wert == null || wert.startsWith('--')) throw new Error(`${k} ohne Wert`);
    o[name] = wert;
    i += 1;
  }
  if (o.theme != null && !/^\d+$/.test(o.theme)) throw new Error('--theme als Theme-ID (Zahl)');
  o.kollektionen = o.kollektionen ? liste(o.kollektionen) : KOLLEKTIONEN;
  if (o.handles != null) o.handles = liste(o.handles);
  return o;
}

const liste = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

/** Schluessel sortiert, damit gleiche Inhalte unabhaengig von der Reihenfolge gleich sind. */
export function kanonisch(wert) {
  if (Array.isArray(wert)) return `[${wert.map(kanonisch).join(',')}]`;
  if (wert && typeof wert === 'object') {
    return `{${Object.keys(wert).sort().map((k) => `${JSON.stringify(k)}:${kanonisch(wert[k])}`).join(',')}}`;
  }
  return JSON.stringify(wert ?? null);
}

/** Eintraege der Vorlage -> was zu schreiben ist (nur Abweichungen). */
export function abweichungen(eintraege) {
  return eintraege
    .filter((e) => e && e.soll && kanonisch(e.soll) !== kanonisch(e.ist))
    .map((e) => ({ id: e.id, handle: e.handle, soll: e.soll, ist: e.ist ?? null }));
}

const gid = (id) => `gid://shopify/Product/${id}`;

/** metafieldsSet-Pakete (je 25) und Rollback (alte Werte bzw. Loeschen). */
export function pakete(diff) {
  const setzen = [];
  for (let i = 0; i < diff.length; i += JE_PAKET) {
    setzen.push({
      metafields: diff.slice(i, i + JE_PAKET).map((d) => ({
        ownerId: gid(d.id), namespace: NAMESPACE, key: KEY, type: 'json', value: JSON.stringify(d.soll),
      })),
    });
  }
  const zurueck = diff.filter((d) => d.ist != null);
  const rollbackSetzen = [];
  for (let i = 0; i < zurueck.length; i += JE_PAKET) {
    rollbackSetzen.push({
      metafields: zurueck.slice(i, i + JE_PAKET).map((d) => ({
        ownerId: gid(d.id), namespace: NAMESPACE, key: KEY, type: 'json', value: JSON.stringify(d.ist),
      })),
    });
  }
  const rollbackLoeschen = diff.filter((d) => d.ist == null)
    .map((d) => ({ ownerId: gid(d.id), namespace: NAMESPACE, key: KEY }));
  return { setzen, rollbackSetzen, rollbackLoeschen };
}

export const MUTATION_SETZEN = `mutation Setzen($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message code } }
}
`;
export const MUTATION_LOESCHEN = `mutation Loeschen($metafields: [MetafieldIdentifierInput!]!) {
  metafieldsDelete(metafields: $metafields) { deletedMetafields { key ownerId } userErrors { field message } }
}
`;

/* ─── Shop lesen ─────────────────────────────────────────────────────── */

/** Minimaler Cookie-Speicher: haelt die Vorschau eines Themes ueber die Weiterleitung hinweg. */
class Keks {
  constructor() { this.werte = new Map(); }
  aufnehmen(antwort) {
    const liste = typeof antwort.headers.getSetCookie === 'function' ? antwort.headers.getSetCookie() : [];
    for (const zeile of liste) {
      const [paar] = zeile.split(';');
      const i = paar.indexOf('=');
      if (i > 0) this.werte.set(paar.slice(0, i).trim(), paar.slice(i + 1).trim());
    }
  }
  kopf() { return [...this.werte].map(([k, v]) => `${k}=${v}`).join('; '); }
}

async function holen(url, keks, { versuche = 2 } = {}) {
  let ziel = url;
  for (let schritt = 0; schritt < 8; schritt++) {
    let antwort;
    try {
      antwort = await fetch(ziel, { redirect: 'manual', headers: { cookie: keks.kopf(), 'user-agent': 'tp-teppich-basis-daten' } });
    } catch (e) {
      if (versuche > 1) return holen(url, keks, { versuche: versuche - 1 });
      throw e;
    }
    keks.aufnehmen(antwort);
    if (antwort.status >= 300 && antwort.status < 400 && antwort.headers.get('location')) {
      ziel = new URL(antwort.headers.get('location'), ziel).toString();
      continue;
    }
    if ((antwort.status === 429 || antwort.status >= 500) && versuche > 1) {
      await new Promise((r) => setTimeout(r, 1500));
      return holen(url, keks, { versuche: versuche - 1 });
    }
    return { status: antwort.status, text: await antwort.text(), theme: themeAus(antwort.headers.get('server-timing')) };
  }
  throw new Error(`zu viele Weiterleitungen: ${url}`);
}

const themeAus = (st) => (String(st || '').match(/theme;desc="(\d+)"/) || [])[1] || null;

async function handlesDerKollektionen(kollektionen, keks) {
  const handles = new Set();
  for (const k of kollektionen) {
    for (let seite = 1; seite < 20; seite++) {
      const r = await holen(`${SHOP}/collections/${k}/products.json?limit=250&page=${seite}`, keks);
      if (r.status === 404) { console.warn(`Kollektion ${k}: nicht gefunden`); break; }
      if (r.status !== 200) throw new Error(`Kollektion ${k}: HTTP ${r.status}`);
      const produkte = JSON.parse(r.text).products || [];
      for (const p of produkte) handles.add(p.handle);
      if (produkte.length < 250) break;
    }
  }
  return [...handles].sort();
}

async function eintragLesen(handle, keks, theme) {
  const r = await holen(`${SHOP}/products/${encodeURIComponent(handle)}?view=teppich-basis-daten&_tbd=${Date.now()}`, keks);
  if (r.status !== 200) throw new Error(`${handle}: HTTP ${r.status}`);
  if (theme && r.theme && r.theme !== theme) throw new Error(`${handle}: Antwort kam von Theme ${r.theme} statt ${theme} (Vorschau verloren)`);
  try {
    return JSON.parse(r.text);
  } catch {
    throw new Error(`${handle}: keine JSON-Antwort - ist die Vorlage product.teppich-basis-daten im Theme?`);
  }
}

async function main(argv) {
  const o = argumente(argv);
  const keks = new Keks();
  if (o.theme) await holen(`${MYSHOPIFY}/?preview_theme_id=${o.theme}`, keks);
  const handles = o.handles ?? await handlesDerKollektionen(o.kollektionen, keks);
  console.log(`${handles.length} Teppiche${o.theme ? ` (Vorlage aus Theme ${o.theme})` : ''}`);

  const eintraege = [];
  const fehler = [];
  let i = 0;
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (i < handles.length) {
      const h = handles[i++];
      try { eintraege.push(await eintragLesen(h, keks, o.theme)); } catch (e) { fehler.push(e.message); }
    }
  }));
  eintraege.sort((a, b) => a.handle.localeCompare(b.handle));

  const diff = abweichungen(eintraege);
  const ohne = diff.filter((d) => d.ist == null).length;
  console.log(`${eintraege.length} gelesen, ${diff.length} Abweichungen (${ohne} ohne Feld, ${diff.length - ohne} veraltet)`);
  for (const d of diff.slice(0, 15)) console.log(`  ${d.handle}: ${d.ist == null ? 'fehlt' : 'veraltet'} -> Gruppe ${d.soll.gruppe || '(keine)'}`);
  if (diff.length > 15) console.log(`  ... und ${diff.length - 15} weitere`);
  for (const f of fehler) console.error(`FEHLER ${f}`);

  if (o.pakete && diff.length) {
    const ordner = path.resolve(o.pakete);
    fs.mkdirSync(ordner, { recursive: true });
    const p = pakete(diff);
    fs.writeFileSync(path.join(ordner, 'setzen.graphql'), MUTATION_SETZEN);
    fs.writeFileSync(path.join(ordner, 'loeschen.graphql'), MUTATION_LOESCHEN);
    fs.writeFileSync(path.join(ordner, 'diff.json'), `${JSON.stringify(diff, null, 2)}\n`);
    p.setzen.forEach((v, n) => fs.writeFileSync(path.join(ordner, `setzen-${n + 1}.json`), JSON.stringify(v)));
    p.rollbackSetzen.forEach((v, n) => fs.writeFileSync(path.join(ordner, `rollback-setzen-${n + 1}.json`), JSON.stringify(v)));
    if (p.rollbackLoeschen.length) fs.writeFileSync(path.join(ordner, 'rollback-loeschen.json'), JSON.stringify({ metafields: p.rollbackLoeschen }));
    console.log(`\n${p.setzen.length} Schreibpaket(e) in ${ordner}. Je Paket einzeln:`);
    console.log(`  shopify store execute -s sjjyq1-6w.myshopify.com -j --allow-mutations --query-file ${path.join(ordner, 'setzen.graphql')} --variable-file ${path.join(ordner, 'setzen-1.json')} --output-file ${path.join(ordner, 'ergebnis-1.json')}`);
    console.log('Rollback: rollback-setzen-*.json mit setzen.graphql, rollback-loeschen.json mit loeschen.graphql.');
  }
  return diff.length || fehler.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(2); });
}
