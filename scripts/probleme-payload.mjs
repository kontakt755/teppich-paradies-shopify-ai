#!/usr/bin/env node
// Baut aus den Problem-Finder-Quelltexten (content/probleme/<handle>.json) die
// Eingaben fuer die Admin-Mutation metaobjectCreate (Typ tp_bodenproblem) -
// und weigert sich, solange ein Eintrag nicht freigegeben ist, kein Ziel-
// Artikel eingetragen ist oder der eingetragene Artikel nicht als echter,
// freigegebener Ratgeber-Artikel im Repo existiert. Das Skript schreibt
// nichts in den Shop; angelegt wird - wenn ueberhaupt - in einer eigenen
// Sitzung ueber den Shopify-MCP.
//
// Die entscheidende Regel (docs/bodenwissen/ARCHITECTURE.md, Abschnitt 4.3):
// Ein Problem ohne echtes Ziel darf nie als Eingabe entstehen, sonst waere
// der Finder eine Sackgasse. Diese Datei ist die eine Haelfte der doppelten
// Sperre; die zweite Haelfte steht in sections/tp-bodenprobleme.liquid, die
// jeden Eintrag ohne aufloesbares Ziel zusaetzlich beim Rendern ueberspringt.
//
//   node scripts/probleme-payload.mjs [content/probleme] [--handle <handle>]
//
// Ohne Ordnerangabe wird content/probleme neben diesem Skript verwendet.
// Zum Aufloesen der Ziel-Artikel wird content/ratgeber als Geschwisterordner
// von content/probleme erwartet (wie im Repository ueblich).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const FREIGABE_STATUS = 'freigegeben';
// Ein Ziel-Artikel zaehlt nur, wenn er selbst diesen Status traegt - siehe
// CONTENT_MODEL.md Abschnitt 3: freigegeben und veroeffentlicht oeffnen
// ratgeber-payload.mjs, alle anderen Status sperren dort ebenfalls.
const ERLAUBTE_STATUS_ARTIKEL = ['freigegeben', 'veroeffentlicht'];
const ERLAUBTE_BELAG = ['Teppichboden', 'Teppich', 'Vinyl', 'PVC'];

// Sammelt die Handles aller Ratgeber-Artikel, die selbst freigegeben oder
// veroeffentlicht sind - nur die zaehlen als echtes Ziel fuer ein Problem.
// ratgeberOrdner: z. B. content/ratgeber, darunter je Bereich ein Unterordner.
export function ladeFreigegebeneArtikelHandles(ratgeberOrdner) {
  const handles = new Set();
  if (!fs.existsSync(ratgeberOrdner)) return handles;
  for (const bereich of fs.readdirSync(ratgeberOrdner, { withFileTypes: true })) {
    if (!bereich.isDirectory()) continue;
    const bereichPfad = path.join(ratgeberOrdner, bereich.name);
    for (const datei of fs.readdirSync(bereichPfad)) {
      if (!datei.endsWith('.json')) continue;
      const meta = JSON.parse(fs.readFileSync(path.join(bereichPfad, datei), 'utf8'));
      if (meta.handle && ERLAUBTE_STATUS_ARTIKEL.includes(meta.status)) handles.add(meta.handle);
    }
  }
  return handles;
}

// freigegebeneArtikel: Set der Handles aus ladeFreigegebeneArtikelHandles.
// Ohne dieses Set (z. B. in einem isolierten Test) wird nur auf ein leeres
// artikel-Feld geprueft, nicht gegen echte Artikel abgeglichen.
export function pruefeFreigabe(meta, freigegebeneArtikel) {
  const gruende = [];
  if (meta.status !== FREIGABE_STATUS) gruende.push(`status ist "${meta.status}", nicht "${FREIGABE_STATUS}"`);
  if (!meta.symptom?.trim()) gruende.push('symptom fehlt');
  const artikel = meta.artikel?.trim();
  if (!artikel) {
    gruende.push('kein Ziel-Artikel eingetragen - ohne Ziel bleibt das Problem unsichtbar (Backlog)');
  } else if (freigegebeneArtikel && !freigegebeneArtikel.has(artikel)) {
    gruende.push(`Ziel-Artikel "${artikel}" existiert nicht als freigegebener oder veroeffentlichter Ratgeber-Artikel im Repo`);
  }
  if (!meta.belag?.trim()) gruende.push('belag fehlt');
  else if (!ERLAUBTE_BELAG.includes(meta.belag)) gruende.push(`belag "${meta.belag}" ist kein erlaubter Wert (${ERLAUBTE_BELAG.join(', ')})`);
  if (!Array.isArray(meta.ursachen) || meta.ursachen.length === 0) gruende.push('ursachen fehlen');
  if (typeof meta.profi_noetig !== 'boolean') gruende.push('profi_noetig ist kein Boolean');
  return gruende;
}

export function baueEingabe(meta, freigegebeneArtikel) {
  const gruende = pruefeFreigabe(meta, freigegebeneArtikel);
  if (gruende.length) throw new Error(`${meta.handle}: nicht anlegbar - ${gruende.join('; ')}`);
  return {
    metaobject: {
      handle: meta.handle,
      type: 'tp_bodenproblem',
      fields: [
        { key: 'symptom', value: meta.symptom.trim() },
        { key: 'belag', value: meta.belag.trim() },
        { key: 'ursachen', value: JSON.stringify(meta.ursachen) },
        { key: 'artikel', value: meta.artikel.trim() },
        { key: 'profi_noetig', value: meta.profi_noetig ? 'true' : 'false' },
      ],
    },
  };
}

export function ladeProbleme(ordner) {
  return fs.readdirSync(ordner).filter(datei => datei.endsWith('.json')).sort().map(datei => {
    const meta = JSON.parse(fs.readFileSync(path.join(ordner, datei), 'utf8'));
    if (meta.handle !== datei.replace(/\.json$/, '')) throw new Error(`${datei}: handle "${meta.handle}" weicht vom Dateinamen ab`);
    return meta;
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
  if (!args.ordner) args.ordner = path.join(import.meta.dirname, '..', 'content', 'probleme');
  return args;
}

function main() {
  const args = argumente(process.argv.slice(2));
  const ratgeberOrdner = path.join(args.ordner, '..', 'ratgeber');
  const freigegebeneArtikel = ladeFreigegebeneArtikelHandles(ratgeberOrdner);
  let probleme = ladeProbleme(args.ordner);
  if (args.handle) probleme = probleme.filter(meta => meta.handle === args.handle);
  const bereit = [];
  const gesperrt = [];
  for (const meta of probleme) {
    const gruende = pruefeFreigabe(meta, freigegebeneArtikel);
    if (gruende.length) gesperrt.push({ handle: meta.handle, gruende });
    else bereit.push(baueEingabe(meta, freigegebeneArtikel));
  }
  process.stdout.write(`${JSON.stringify({ bereit, gesperrt }, null, 2)}\n`);
  if (gesperrt.length) process.stderr.write(`${gesperrt.length} Probleme gesperrt, ${bereit.length} bereit.\n`);
  process.exitCode = gesperrt.length && !bereit.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try { main(); } catch (fehler) { process.stderr.write(`${fehler.message}\n`); process.exitCode = 1; }
}
