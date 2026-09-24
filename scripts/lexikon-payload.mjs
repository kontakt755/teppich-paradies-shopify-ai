#!/usr/bin/env node
// Baut aus den Lexikon-Quelltexten (content/lexikon/<handle>.json) die
// Eingaben fuer die Admin-Mutation metaobjectCreate (Typ tp_lexikon) - und
// weigert sich, solange ein Eintrag nicht freigegeben ist oder "kurz" fehlt.
// Das Skript schreibt nichts in den Shop; angelegt wird - sobald das
// Metaobjekt tp_lexikon im Shop existiert - in einer eigenen Sitzung ueber
// den Shopify-MCP, genau wie bei scripts/ratgeber-payload.mjs.
//
//   node scripts/lexikon-payload.mjs [content/lexikon] [--handle <handle>]
//
// Anders als beim Ratgeber braucht ein Lexikoneintrag keine externen GIDs
// (keine Kollektions- oder Blog-Referenz im Datenmodell, siehe
// docs/bodenwissen/CONTENT_MODEL.md, Abschnitt 6) - deshalb kommt dieses
// Skript ohne Pflicht-Flags aus.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const FREIGABE_STATUS = 'freigegeben';
export const METAOBJECT_TYPE = 'tp_lexikon';
// Reihenfolge wie in docs/bodenwissen/CONTENT_MODEL.md, Abschnitt 6.
export const ERLAUBTE_GRUPPEN = ['Teppichboden', 'Vinyl', 'Untergrund', 'Allgemein'];

// Offene PRUEFEN-Marken sperren weiterhin (CONTENT_MODEL.md, Abschnitt 7,
// Punkt 7 - dieselbe Regel wie in scripts/ratgeber-payload.mjs).
function pruefenMarken(text) {
  return (text.match(/PRUEFEN/g) || []).length;
}

export function pruefeFreigabe(meta) {
  const gruende = [];
  if (meta.status !== FREIGABE_STATUS) gruende.push(`status ist "${meta.status}", nicht "${FREIGABE_STATUS}"`);
  if (!meta.kurz?.trim()) gruende.push('kurz fehlt');
  if (!meta.begriff?.trim()) gruende.push('begriff fehlt');
  if (!meta.handle?.trim()) gruende.push('handle fehlt');
  if (!ERLAUBTE_GRUPPEN.includes(meta.gruppe)) gruende.push(`gruppe "${meta.gruppe}" ist kein erlaubter Wert (${ERLAUBTE_GRUPPEN.join(', ')})`);
  const marken = pruefenMarken(`${meta.kurz || ''}\n${meta.lang || ''}`);
  if (marken > 0) gruende.push(`${marken} offene PRUEFEN-Marke(n)`);
  return gruende;
}

function feld(liste, key, value) {
  if (typeof value === 'string' && value.trim()) liste.push({ key, value: value.trim() });
}

export function baueEingabe(meta) {
  const gruende = pruefeFreigabe(meta);
  if (gruende.length) throw new Error(`${meta.handle}: nicht anlegbar - ${gruende.join('; ')}`);
  const fields = [];
  feld(fields, 'begriff', meta.begriff);
  feld(fields, 'kurz', meta.kurz);
  feld(fields, 'lang', meta.lang);
  feld(fields, 'gruppe', meta.gruppe);
  feld(fields, 'artikel', meta.artikel);
  // Textliste-Feld: Shopify erwartet fuer list.* Metaobjekt-Felder einen
  // JSON-kodierten String, nicht das Array selbst (gleiches Muster wie
  // 'material'/'cta' in scripts/ratgeber-payload.mjs).
  if (Array.isArray(meta.synonyme) && meta.synonyme.length) {
    fields.push({ key: 'synonyme', value: JSON.stringify(meta.synonyme) });
  }
  return {
    metaobject: {
      type: METAOBJECT_TYPE,
      handle: meta.handle,
      fields,
    },
  };
}

export function ladeEintraege(ordner) {
  return fs
    .readdirSync(ordner)
    .filter(datei => datei.endsWith('.json'))
    .sort()
    .map(datei => {
      const meta = JSON.parse(fs.readFileSync(path.join(ordner, datei), 'utf8'));
      return { datei, meta };
    });
}

function argumente(argv) {
  const erlaubt = ['--handle'];
  const args = { ordner: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (erlaubt.includes(argv[i])) { args[argv[i].slice(2)] = argv[i + 1]; i += 1; }
    else if (argv[i].startsWith('--')) throw new Error(`Unbekanntes Flag ${argv[i]}`);
    else args.ordner = argv[i];
  }
  if (!args.ordner) args.ordner = 'content/lexikon';
  return args;
}

function main() {
  const args = argumente(process.argv.slice(2));
  let eintraege = ladeEintraege(args.ordner);
  if (args.handle) eintraege = eintraege.filter(({ meta }) => meta.handle === args.handle);
  const bereit = [];
  const gesperrt = [];
  for (const { meta } of eintraege) {
    const gruende = pruefeFreigabe(meta);
    if (gruende.length) gesperrt.push({ handle: meta.handle, gruende });
    else bereit.push(baueEingabe(meta));
  }
  process.stdout.write(`${JSON.stringify({ bereit, gesperrt }, null, 2)}\n`);
  if (gesperrt.length) process.stderr.write(`${gesperrt.length} Eintrag/Eintraege gesperrt, ${bereit.length} bereit.\n`);
  process.exitCode = gesperrt.length && !bereit.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try { main(); } catch (fehler) { process.stderr.write(`${fehler.message}\n`); process.exitCode = 1; }
}
