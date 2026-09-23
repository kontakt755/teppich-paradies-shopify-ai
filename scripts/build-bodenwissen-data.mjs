#!/usr/bin/env node
/**
 * Erzeugt docs/ai-dashboard/bodenwissen.json - den Datenstand fuer den Bereich
 * "Ratgeber" im Control Center (docs/ai-dashboard/).
 *
 *   node scripts/build-bodenwissen-data.mjs
 *
 * Quelle ist ausschliesslich das Repository selbst (content/ratgeber,
 * content/lexikon, content/probleme) und die Pruef-Logik aus
 * scripts/bodenwissen-guard.mjs - importiert (`pruefe`), nicht als eigener
 * Prozess gestartet. Keine Netzwerkaufrufe, kein GitHub- und kein
 * Google-Zugriff: das Frontend liest nachher nur diese erzeugte Datei, genau
 * wie bei issues.json (docs/control-center/ARCHITEKTUR.md, Abschnitt 1).
 * Siehe docs/bodenwissen/ANALYTICS.md, Abschnitt 6, fuer den Auftrag.
 *
 * Suchleistung (Klicks, Impressionen, CTR, Position) ist bewusst nicht Teil
 * dieser Datei - GA4 und Search Console sind nicht angebunden. Das Feld
 * `suchleistung` bleibt deshalb `null`, mit der Begruendung in
 * `suchleistungHinweis` (ANALYTICS.md Abschnitt 6b). Keine Null, die wie eine
 * Messung aussieht - deshalb hier auch keine Platzhalter-Zahlen fuer Klicks
 * o. ae.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATUS, ladeOrdner, pruefe } from './bodenwissen-guard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.resolve(HERE, '..', 'docs/ai-dashboard/bodenwissen.json');

export const SUCHLEISTUNG_HINWEIS =
  'GA4 und Search Console sind nicht angebunden. Klicks, Impressionen, CTR und ' +
  'Position koennen hier nicht gezeigt werden - siehe docs/bodenwissen/ANALYTICS.md, Abschnitt 6b.';

/**
 * Lexikon und Probleme laden - dieselbe Form wie `ladeEinfach()` in
 * bodenwissen-guard.mjs (dort nicht exportiert, deshalb hier nachgebaut).
 * Die eigentliche Pruef-Logik bleibt importiert, nicht dieser Lader.
 */
function ladeEinfach(wurzel) {
  if (!fs.existsSync(wurzel)) return [];
  return fs.readdirSync(wurzel).filter(d => d.endsWith('.json')).sort()
    .map(d => ({ datei: path.join(wurzel, d), meta: JSON.parse(fs.readFileSync(path.join(wurzel, d), 'utf8')) }));
}

export function ladeAlle(wurzel) {
  return {
    artikel: ladeOrdner(path.join(wurzel, 'content/ratgeber')),
    lexikon: ladeEinfach(path.join(wurzel, 'content/lexikon')),
    probleme: ladeEinfach(path.join(wurzel, 'content/probleme')),
  };
}

/** Artikelzahl je Status, inklusive Status ohne Artikel (0) - Reihenfolge/Werte aus bodenwissen-guard.mjs. */
export function pipelineZaehlen(artikel) {
  const zaehler = Object.fromEntries(STATUS.map(s => [s, 0]));
  for (const { meta } of artikel) {
    if (meta.status && zaehler[meta.status] !== undefined) zaehler[meta.status] += 1;
  }
  return zaehler;
}

/** Artikel, deren naechste Pruefung in der Vergangenheit liegt - unabhaengig vom Status. */
export function ueberarbeitungsbedarf(artikel, heute = new Date()) {
  const eintraege = [];
  for (const { bereich, meta } of artikel) {
    const naechste = meta.pruefung?.naechste;
    if (!naechste) continue;
    const datum = new Date(naechste);
    if (Number.isNaN(datum.getTime()) || datum >= heute) continue;
    const tage = Math.floor((heute - datum) / 86_400_000);
    eintraege.push({ handle: meta.handle, titel: meta.title, bereich, status: meta.status, naechste, tageUeberfaellig: tage });
  }
  return eintraege.sort((a, b) => b.tageUeberfaellig - a.tageUeberfaellig);
}

/** Offene Bildbedarfe (bilder[].status === "offen") ueber alle Artikel. */
export function bildbedarfe(artikel) {
  const items = [];
  for (const { bereich, meta } of artikel) {
    for (const bild of meta.bilder || []) {
      if (bild.status === 'offen') items.push({ handle: meta.handle, titel: meta.title, bereich, zweck: bild.zweck || '' });
    }
  }
  return { offen: items.length, items };
}

/** Offene expert_input-Eintraege aus Ratgeber-Artikeln und (auch) dem Lexikon. */
export function expertInputZaehlen(artikel, lexikon) {
  const items = [];
  for (const { bereich, meta } of artikel) {
    for (const frage of meta.expert_input || []) {
      items.push({ quelle: 'ratgeber', handle: meta.handle, titel: meta.title, bereich, frage });
    }
  }
  for (const { meta } of lexikon) {
    for (const frage of meta.expert_input || []) {
      items.push({ quelle: 'lexikon', handle: meta.handle, titel: meta.begriff || meta.handle, frage });
    }
  }
  return {
    gesamt: items.length,
    ratgeber: items.filter(i => i.quelle === 'ratgeber').length,
    lexikon: items.filter(i => i.quelle === 'lexikon').length,
    items,
  };
}

/** Probleme aus dem Problem-Finder mit und ohne Ziel-Artikel (Feld `artikel`). */
export function problemFinderZaehlen(probleme) {
  const mitZiel = probleme.filter(({ meta }) => String(meta.artikel || '').trim() !== '').length;
  return { gesamt: probleme.length, mitZiel, ohneZiel: probleme.length - mitZiel };
}

/** Absolute Dateipfade sind nicht Mac-uebergreifend sinnvoll - relativ zum Repo-Root ablegen. */
function relativieren(liste, wurzel) {
  return liste.map(({ datei, text }) => ({ ort: path.relative(wurzel, datei), text }));
}

export function buildPayload({ artikel, lexikon, probleme, wurzel = process.cwd(), heute = new Date() }) {
  const gate = pruefe({ artikel, lexikon, probleme, heute });
  return {
    erzeugtAm: heute.toISOString(),
    statusReihenfolge: STATUS,
    contentPipeline: pipelineZaehlen(artikel),
    gesamt: { artikel: artikel.length, lexikon: lexikon.length, probleme: probleme.length },
    ueberarbeitungsbedarf: ueberarbeitungsbedarf(artikel, heute),
    bilder: bildbedarfe(artikel),
    expertInput: expertInputZaehlen(artikel, lexikon),
    problemFinder: problemFinderZaehlen(probleme),
    gate: {
      fehler: relativieren(gate.fehler, wurzel),
      hinweise: relativieren(gate.hinweise, wurzel),
      zahlen: gate.zahlen,
    },
    // Bewusst getrennt von den Zahlen oben: keine Null, die wie eine Messung aussieht.
    suchleistung: null,
    suchleistungHinweis: SUCHLEISTUNG_HINWEIS,
  };
}

function main() {
  const wurzel = process.cwd();
  const { artikel, lexikon, probleme } = ladeAlle(wurzel);
  const payload = buildPayload({ artikel, lexikon, probleme, wurzel });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const tmp = `${OUT}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmp, OUT);

  console.log(`Bodenwissen: ${payload.gesamt.artikel} Artikel, ${payload.gesamt.lexikon} Lexikoneintraege, ${payload.gesamt.probleme} Probleme -> ${OUT}`);
  const pipelineText = Object.entries(payload.contentPipeline).filter(([, n]) => n).map(([k, n]) => `${k}=${n}`).join(', ');
  console.log(`  Pipeline: ${pipelineText || 'keine Artikel'}`);
  console.log(`  Ueberarbeitungsbedarf: ${payload.ueberarbeitungsbedarf.length} · Bildbedarfe offen: ${payload.bilder.offen} · Expert Input offen: ${payload.expertInput.gesamt} (Ratgeber ${payload.expertInput.ratgeber}, Lexikon ${payload.expertInput.lexikon})`);
  console.log(`  Problem-Finder: ${payload.problemFinder.gesamt} (mit Ziel ${payload.problemFinder.mitZiel}, ohne Ziel ${payload.problemFinder.ohneZiel}) · Gate: ${payload.gate.fehler.length} Fehler, ${payload.gate.hinweise.length} Hinweise`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
