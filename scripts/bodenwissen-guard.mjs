#!/usr/bin/env node
// Prueft die Redaktionsebene des Bodenwissen-Portals: content/ratgeber/<bereich>/<handle>.json
// samt zugehoeriger .html, dazu (falls vorhanden) content/lexikon und content/probleme.
//
//   npm run bodenwissen:guard            # alles unter content/
//   npm run bodenwissen:guard -- --json  # Maschinenform fuer das Dashboard
//
// Zwei Schweregrade: FEHLER bricht ab (exit 1), HINWEIS meldet nur. Was hier geprueft wird
// und warum, steht in docs/bodenwissen/CONTENT_MODEL.md, Abschnitt 7.
//
// Das Gate ergaenzt scripts/ratgeber-payload.mjs, es ersetzt es nicht: payload entscheidet
// ueber EINEN Artikel beim Anlegen, dieses Skript sieht das ganze Portal - nur so faellt
// eine Dublette oder ein toter Verweis ueberhaupt auf.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const STATUS = [
  'idee', 'recherche', 'fachinput_noetig', 'entwurf', 'seo_pruefung',
  'fachpruefung', 'freigegeben', 'veroeffentlicht', 'ueberarbeiten',
  'zusammenlegen', 'weiterleiten', 'archiv',
];
// Status, in denen ein Artikel im Shop stehen darf - identisch mit ratgeber-payload.mjs.
export const STATUS_OFFEN = ['freigegeben', 'veroeffentlicht'];
export const INTENT = ['kaufberatung', 'anleitung', 'planung', 'problem', 'begriff'];
const PFLICHT = ['id', 'handle', 'title', 'blog', 'cluster', 'intent', 'frage', 'begriff', 'status'];
// Ankertexte, die nicht sagen, was dahinter steckt (Auftrag: beschreibende Ankertexte).
const LEERE_ANKER = ['hier', 'hier klicken', 'klicken', 'mehr', 'mehr erfahren', 'weiterlesen', 'link', 'diesen link'];

const norm = wert => String(wert || '').toLowerCase().replace(/\s+/g, ' ').trim();

export function ladeOrdner(wurzel) {
  const artikel = [];
  if (!fs.existsSync(wurzel)) return artikel;
  for (const bereich of fs.readdirSync(wurzel).sort()) {
    const ordner = path.join(wurzel, bereich);
    if (!fs.statSync(ordner).isDirectory()) continue;
    for (const datei of fs.readdirSync(ordner).sort()) {
      if (!datei.endsWith('.json')) continue;
      const meta = JSON.parse(fs.readFileSync(path.join(ordner, datei), 'utf8'));
      const htmlPfad = path.join(ordner, datei.replace(/\.json$/, '.html'));
      const html = fs.existsSync(htmlPfad) ? fs.readFileSync(htmlPfad, 'utf8') : null;
      artikel.push({ bereich, datei: path.join(ordner, datei), meta, html });
    }
  }
  return artikel;
}

function ladeEinfach(wurzel) {
  if (!fs.existsSync(wurzel)) return [];
  return fs.readdirSync(wurzel).filter(d => d.endsWith('.json')).sort()
    .map(d => ({ datei: path.join(wurzel, d), meta: JSON.parse(fs.readFileSync(path.join(wurzel, d), 'utf8')) }));
}

// Interne Links aus dem Artikeltext. Geprueft wird nur, was dieses Repo kennen kann:
// Blog-Artikel. Kollektions- und Seitenlinks liegen im Shop und werden vom
// Live-Gate (npm run menu:guard, qa/run-seo-check.mjs) erfasst, nicht hier.
export function ratgeberLinks(html) {
  const treffer = [];
  const muster = /<a\b[^>]*href="(\/blogs\/[^"#?]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = muster.exec(html || '')) !== null) {
    treffer.push({ href: m[1], text: m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() });
  }
  return treffer;
}

export function pruefe({ artikel, lexikon = [], probleme = [], heute = new Date() }) {
  const fehler = [];
  const hinweise = [];
  const melde = (liste, datei, text) => liste.push({ datei, text });

  const handles = new Set(artikel.map(a => a.meta.handle));
  const lexHandles = new Set(lexikon.map(e => e.meta.handle || e.meta.begriff));
  const ids = new Map();
  const begriffe = new Map();
  const eingehend = new Map(artikel.map(a => [a.meta.handle, 0]));

  for (const { datei, meta, html } of artikel) {
    const ort = datei;

    for (const feld of PFLICHT) {
      if (!meta[feld] || String(meta[feld]).trim() === '') melde(fehler, ort, `Pflichtfeld "${feld}" fehlt`);
    }
    if (html === null) melde(fehler, ort, 'zugehoerige .html fehlt');
    if (meta.status && !STATUS.includes(meta.status)) melde(fehler, ort, `status "${meta.status}" ist kein erlaubter Wert`);
    if (meta.intent && !INTENT.includes(meta.intent)) melde(fehler, ort, `intent "${meta.intent}" ist kein erlaubter Wert`);

    if (meta.id) {
      if (ids.has(meta.id)) melde(fehler, ort, `id "${meta.id}" ist schon in ${ids.get(meta.id)} vergeben`);
      else ids.set(meta.id, ort);
    }

    // Kannibalisierung: derselbe Hauptbegriff mit derselben Suchintention zweimal.
    // Das ist der Kern des Gates - alles andere ist Hygiene.
    if (meta.begriff && meta.intent) {
      const schluessel = `${norm(meta.begriff)}::${meta.intent}`;
      if (begriffe.has(schluessel)) {
        melde(fehler, ort, `Kannibalisierung: "${meta.begriff}" (${meta.intent}) behandelt schon ${begriffe.get(schluessel)}. Bestehenden Artikel ausbauen statt einen zweiten anlegen.`);
      } else {
        begriffe.set(schluessel, ort);
      }
    }

    // Verweise muessen aufloesen.
    for (const ziel of meta.verwandte || []) {
      if (!handles.has(ziel)) melde(fehler, ort, `verwandte: "${ziel}" gibt es nicht`);
      else if (ziel === meta.handle) melde(fehler, ort, 'verwandte: verweist auf sich selbst');
      else eingehend.set(ziel, (eingehend.get(ziel) || 0) + 1);
    }
    if (meta.naechster_schritt) {
      if (!handles.has(meta.naechster_schritt)) melde(fehler, ort, `naechster_schritt: "${meta.naechster_schritt}" gibt es nicht`);
      else if (meta.naechster_schritt === meta.handle) melde(fehler, ort, 'naechster_schritt: verweist auf sich selbst');
      else eingehend.set(meta.naechster_schritt, (eingehend.get(meta.naechster_schritt) || 0) + 1);
    }
    for (const begriff of meta.lexikon || []) {
      if (lexikon.length && !lexHandles.has(begriff)) melde(fehler, ort, `lexikon: Begriff "${begriff}" gibt es nicht`);
    }

    // Links im Artikeltext: Ziel vorhanden, Ankertext beschreibend.
    for (const { href, text } of ratgeberLinks(html)) {
      const teile = href.replace(/\/+$/, '').split('/').filter(Boolean); // blogs/<blog>[/<handle>]
      const ziel = teile.length >= 3 && teile[2] !== 'tagged' ? teile[2] : null;
      if (ziel && !handles.has(ziel)) melde(fehler, ort, `toter Link im Text: ${href}`);
      if (ziel && handles.has(ziel) && ziel !== meta.handle) eingehend.set(ziel, (eingehend.get(ziel) || 0) + 1);
      if (LEERE_ANKER.includes(norm(text))) melde(fehler, ort, `Ankertext "${text}" sagt nicht, was dahinter steckt`);
    }

    if (html && /PRUEFEN/.test(html)) {
      const zahl = (html.match(/PRUEFEN/g) || []).length;
      melde(fehler, ort, `${zahl} offene PRUEFEN-Marke(n) im Text`);
    }
    if (html && /<h1[\s>]/i.test(html)) melde(fehler, ort, 'h1 im Text (die H1 ist der Artikeltitel)');

    const naechste = meta.pruefung?.naechste;
    if (naechste && new Date(naechste) < heute && meta.status === 'veroeffentlicht') {
      melde(hinweise, ort, `Pruefdatum ${naechste} liegt zurueck - Status auf "ueberarbeiten" setzen`);
    }
    if (STATUS_OFFEN.includes(meta.status) && !(meta.metafields?.kurzantwort || '').trim()) {
      melde(fehler, ort, 'kurzantwort fehlt, obwohl der Artikel freigegeben ist');
    }
  }

  // Ein Artikel, auf den kein anderer zeigt, findet nur ueber den Hub statt.
  for (const { datei, meta } of artikel) {
    if (!STATUS_OFFEN.includes(meta.status)) continue;
    if ((eingehend.get(meta.handle) || 0) === 0) {
      melde(hinweise, datei, 'kein eingehender Link aus einem anderen Artikel - nur ueber den Hub erreichbar');
    }
  }

  // Problem-Finder: ein sichtbares Problem braucht ein Ziel, das es wirklich gibt.
  for (const { datei, meta } of probleme) {
    if (!STATUS_OFFEN.includes(meta.status)) continue;
    if (!meta.artikel) melde(fehler, datei, 'freigegebenes Problem ohne Ziel-Artikel');
    else if (!handles.has(meta.artikel)) melde(fehler, datei, `Ziel-Artikel "${meta.artikel}" gibt es nicht`);
  }

  // Lexikon: verweist ein Eintrag auf einen ausfuehrlichen Artikel, muss der existieren.
  for (const { datei, meta } of lexikon) {
    if (meta.artikel && !handles.has(meta.artikel)) melde(fehler, datei, `Artikel-Verweis "${meta.artikel}" gibt es nicht`);
    if (STATUS_OFFEN.includes(meta.status) && !(meta.kurz || '').trim()) melde(fehler, datei, 'freigegebener Eintrag ohne kurz');
  }

  return { fehler, hinweise, zahlen: { artikel: artikel.length, lexikon: lexikon.length, probleme: probleme.length } };
}

function main() {
  const alsJson = process.argv.includes('--json');
  const wurzel = process.cwd();
  const ergebnis = pruefe({
    artikel: ladeOrdner(path.join(wurzel, 'content/ratgeber')),
    lexikon: ladeEinfach(path.join(wurzel, 'content/lexikon')),
    probleme: ladeEinfach(path.join(wurzel, 'content/probleme')),
  });

  if (alsJson) {
    process.stdout.write(`${JSON.stringify(ergebnis, null, 2)}\n`);
  } else {
    const { artikel, lexikon, probleme } = ergebnis.zahlen;
    process.stdout.write(`Bodenwissen: ${artikel} Artikel, ${lexikon} Lexikoneintraege, ${probleme} Probleme geprueft.\n`);
    for (const { datei, text } of ergebnis.hinweise) process.stdout.write(`HINWEIS  ${path.relative(wurzel, datei)}: ${text}\n`);
    for (const { datei, text } of ergebnis.fehler) process.stderr.write(`FEHLER   ${path.relative(wurzel, datei)}: ${text}\n`);
    process.stdout.write(ergebnis.fehler.length ? `\n${ergebnis.fehler.length} Fehler.\n` : '\nKeine Fehler.\n');
  }
  process.exitCode = ergebnis.fehler.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try { main(); } catch (fehler) { process.stderr.write(`${fehler.message}\n`); process.exitCode = 1; }
}
