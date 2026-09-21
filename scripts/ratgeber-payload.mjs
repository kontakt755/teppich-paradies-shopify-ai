#!/usr/bin/env node
// Baut aus den Ratgeber-Quelltexten (content/ratgeber/<bereich>/<handle>.json + .html)
// die Eingaben fuer die Admin-Mutation articleCreate - und weigert sich, solange ein
// Artikel nicht freigegeben ist. Das Skript schreibt nichts in den Shop; angelegt wird
// in einer Sitzung ueber den Shopify-MCP (siehe docs/ratgeber/README.md, Abschnitt 9).
//
//   node scripts/ratgeber-payload.mjs content/ratgeber/teppichboden \
//     --blog-id gid://shopify/Blog/123 --kollektionen kollektionen.json [--handle <handle>]
//
// kollektionen.json: { "<kollektions-handle>": "gid://shopify/Collection/…" } - Referenz-
// Metafelder brauchen die GID, und die kennt nur der Shop. Fehlt eine, bricht der Lauf ab
// statt den Verweis still wegzulassen.
// Die Datei gehoert NICHT in den Artikelordner: dort gilt jede .json als Artikel.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const FREIGABE_STATUS = 'freigegeben';
const ERLAUBTE_CTA = ['rechner', 'muster', 'verlegeservice', 'zubehoer'];
const ERLAUBTE_ART = ['Kaufberatung', 'Anleitung', 'Planung', 'Pflege'];

export function pruefeFreigabe(meta, html) {
  const gruende = [];
  if (meta.status !== FREIGABE_STATUS) gruende.push(`status ist "${meta.status}", nicht "${FREIGABE_STATUS}"`);
  const marken = (html.match(/PRUEFEN/g) || []).length;
  if (marken > 0) gruende.push(`${marken} offene PRUEFEN-Marke(n)`);
  if (!meta.metafields?.kurzantwort?.trim()) gruende.push('kurzantwort fehlt');
  if (/<h1[\s>]/i.test(html)) gruende.push('h1 im Text (die H1 ist der Artikeltitel)');
  if (meta.metafields?.art && !ERLAUBTE_ART.includes(meta.metafields.art)) gruende.push(`art "${meta.metafields.art}" ist kein erlaubter Wert`);
  const fremd = (meta.metafields?.cta || []).filter(wert => !ERLAUBTE_CTA.includes(wert));
  if (fremd.length) gruende.push(`cta enthaelt unbekannte Werte: ${fremd.join(', ')}`);
  return gruende;
}

// HTML-Kommentare gehoeren nicht in den Shop - auch keine beantworteten Pruefnotizen.
export const ohneKommentare = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/[ \t]+\n/g, '\n').trim();

function textfeld(liste, key, value, type = 'single_line_text_field') {
  if (typeof value === 'string' && value.trim()) liste.push({ namespace: 'ratgeber', key, type, value: value.trim() });
}

export function baueEingabe(meta, html, { blogId, kollektionen = {} }) {
  const gruende = pruefeFreigabe(meta, html);
  if (gruende.length) throw new Error(`${meta.handle}: nicht anlegbar - ${gruende.join('; ')}`);
  if (!blogId) throw new Error('--blog-id fehlt');
  const m = meta.metafields;
  const metafields = [];
  textfeld(metafields, 'kurzantwort', m.kurzantwort, 'multi_line_text_field');
  textfeld(metafields, 'art', m.art);
  textfeld(metafields, 'dauer', m.dauer);
  textfeld(metafields, 'schwierigkeit', m.schwierigkeit);
  textfeld(metafields, 'personen', m.personen);
  textfeld(metafields, 'geprueft_von', m.geprueft_von);
  textfeld(metafields, 'stand', m.stand, 'date');
  for (const key of ['material', 'cta']) {
    if (Array.isArray(m[key]) && m[key].length) metafields.push({ namespace: 'ratgeber', key, type: 'list.single_line_text_field', value: JSON.stringify(m[key]) });
  }
  for (const key of ['kollektion', 'zubehoer_kollektion']) {
    if (!m[key]) continue;
    const gid = kollektionen[m[key]];
    if (!gid) throw new Error(`${meta.handle}: Kollektion "${m[key]}" (${key}) fehlt in --kollektionen`);
    metafields.push({ namespace: 'ratgeber', key, type: 'collection_reference', value: gid });
  }
  // Suchmaschinen-Titel und -Beschreibung eines Artikels liegen in den global-Metafeldern.
  if (meta.seo?.title) metafields.push({ namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: meta.seo.title });
  if (meta.seo?.description) metafields.push({ namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: meta.seo.description });
  return {
    article: {
      blogId,
      title: meta.title,
      handle: meta.handle,
      body: ohneKommentare(html),
      summary: meta.excerpt || '',
      tags: meta.tags || [],
      templateSuffix: 'ratgeber',
      // Bewusst unveroeffentlicht: sichtbar schaltet ein eigener, freigegebener Schritt.
      isPublished: false,
      author: { name: meta.autor || 'Teppich Paradies' },
      metafields,
    },
  };
}

export function ladeArtikel(ordner) {
  return fs.readdirSync(ordner).filter(datei => datei.endsWith('.json')).sort().map(datei => {
    const meta = JSON.parse(fs.readFileSync(path.join(ordner, datei), 'utf8'));
    const htmlPfad = path.join(ordner, datei.replace(/\.json$/, '.html'));
    if (!fs.existsSync(htmlPfad)) throw new Error(`${datei}: zugehoerige .html fehlt`);
    return { meta, html: fs.readFileSync(htmlPfad, 'utf8') };
  });
}

function argumente(argv) {
  const erlaubt = ['--blog-id', '--kollektionen', '--handle'];
  const args = { ordner: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (erlaubt.includes(argv[i])) { args[argv[i].slice(2)] = argv[i + 1]; i += 1; }
    else if (argv[i].startsWith('--')) throw new Error(`Unbekanntes Flag ${argv[i]}`);
    else args.ordner = argv[i];
  }
  if (!args.ordner) throw new Error('Ordner mit Artikeln fehlt, z. B. content/ratgeber/teppichboden');
  return args;
}

function main() {
  const args = argumente(process.argv.slice(2));
  const kollektionen = args.kollektionen ? JSON.parse(fs.readFileSync(args.kollektionen, 'utf8')) : {};
  let artikel = ladeArtikel(args.ordner);
  if (args.handle) artikel = artikel.filter(eintrag => eintrag.meta.handle === args.handle);
  const bereit = [];
  const gesperrt = [];
  for (const { meta, html } of artikel) {
    const gruende = pruefeFreigabe(meta, html);
    if (gruende.length) gesperrt.push({ handle: meta.handle, gruende });
    else bereit.push(baueEingabe(meta, html, { blogId: args['blog-id'], kollektionen }));
  }
  process.stdout.write(`${JSON.stringify({ bereit, gesperrt }, null, 2)}\n`);
  if (gesperrt.length) process.stderr.write(`${gesperrt.length} Artikel gesperrt, ${bereit.length} bereit.\n`);
  process.exitCode = gesperrt.length && !bereit.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try { main(); } catch (fehler) { process.stderr.write(`${fehler.message}\n`); process.exitCode = 1; }
}
