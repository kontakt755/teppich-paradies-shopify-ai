#!/usr/bin/env node
/**
 * Findet Farbvarianten, deren Codes durchgezaehlt statt abgeschrieben wurden.
 *
 *   npm run farbcode:guard              # liest data/farbcode-guard-input.json
 *   node scripts/farbcode-guard.mjs --stdin < codes.json
 *
 * ─── Wonach gesucht wird ───────────────────────────────────────────────
 * Lieferantenfarblisten sind gewachsen und haben deshalb Luecken:
 *   Quadra   024, 039, 050, 070, 072, 085, 141, 181
 *   PVCJOKANEO 4153, 4200, 4215, 4217, 4222, 4226, 4276, 4289
 * Eine lange lueckenlose Folge (4290, 4291, 4292, …) entsteht dagegen nur,
 * wenn jemand weitergezaehlt hat, statt die Quelle abzuschreiben.
 *
 * ─── Warum ein Guard und keine Sichtpruefung ───────────────────────────
 * Der Fehler faellt beim Draufschauen nicht auf: Die Anzahl stimmt, das
 * Format stimmt, die Codes sehen plausibel aus. Am 2026-09-04 standen
 * 21 erfundene Farbcodes live in drei Verkaufskanaelen. Aufgefallen ist es
 * erst beim Bilderholen — fuer 21 Codes existierte beim Lieferanten nichts.
 *
 * Der Guard meldet einen Verdacht, keinen Beweis. Bestaetigt wird er nur
 * durch Abgleich mit der Lieferantenliste (siehe jordan-media-scrape.mjs).
 */

import { readFileSync } from 'node:fs';

/** Ab dieser Laenge gilt eine lueckenlose Folge als verdaechtig. */
const SCHWELLE = 6;

/**
 * Gegen die Lieferantenliste geprueft und in Ordnung. Ein Eintrag hier
 * braucht Datum und Quelle — sonst verdeckt er beim naechsten Mal einen
 * echten Fund.
 */
const GEPRUEFT_ECHT = {
  'Cortessa Sockelleiste':
    'Jordan PAR1902457, geprueft 2026-09-04: L600, L601, L603–L615 stimmen '
    + 'exakt, L602 fehlt auch beim Lieferanten. Fortlaufende Dekornummern '
    + 'sind bei Sockelleisten normal.',
};

/** Laengste Kette aufeinanderfolgender Ganzzahlen in einer Codeliste. */
function laengsteLueckenloseFolge(codes) {
  const zahlen = codes
    .map((c) => Number.parseInt(String(c).match(/\d+/)?.[0] ?? '', 10))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  let beste = { laenge: 0, von: null, bis: null };
  let start = 0;
  for (let i = 1; i <= zahlen.length; i += 1) {
    if (i < zahlen.length && zahlen[i] === zahlen[i - 1] + 1) continue;
    const laenge = i - start;
    if (laenge > beste.laenge) beste = { laenge, von: zahlen[start], bis: zahlen[i - 1] };
    start = i;
  }
  return beste;
}

function pruefe(produkte) {
  const befunde = [];
  const ausgenommen = [];
  for (const { titel, codes, status } of produkte) {
    const numerisch = codes.filter((c) => /\d/.test(String(c)));
    if (numerisch.length < SCHWELLE) continue;

    const folge = laengsteLueckenloseFolge(numerisch);
    if (folge.laenge < SCHWELLE) continue;

    if (GEPRUEFT_ECHT[titel]) {
      ausgenommen.push({ titel, grund: GEPRUEFT_ECHT[titel] });
      continue;
    }
    befunde.push({
      titel, status, folge, gesamt: numerisch.length,
      anteil: folge.laenge / numerisch.length,
    });
  }
  return { befunde, ausgenommen };
}

const nutzeStdin = process.argv.includes('--stdin');
const quelle = nutzeStdin ? 0 : 'data/farbcode-guard-input.json';

let produkte;
try {
  produkte = JSON.parse(readFileSync(quelle, 'utf8'));
} catch (error) {
  console.error(`Eingabe nicht lesbar (${nutzeStdin ? 'stdin' : quelle}): ${error.message}`);
  console.error('Erwartet: [{ "titel": "…", "status": "ACTIVE", "codes": ["Farbe 4290", …] }]');
  process.exit(2);
}

const { befunde, ausgenommen } = pruefe(produkte);

for (const { titel, grund } of ausgenommen) {
  console.log(`farbcode:guard — ${titel}: bekannter Treffer, ${grund}`);
}
if (ausgenommen.length) console.log('');

if (befunde.length === 0) {
  console.log(`farbcode:guard — ${produkte.length} Produkte geprueft, kein Zaehlmuster offen.`);
  process.exit(0);
}

console.log(`farbcode:guard — VERDACHT bei ${befunde.length} von ${produkte.length} Produkten:\n`);
for (const { titel, status, folge, gesamt, anteil } of befunde) {
  const prozent = Math.round(anteil * 100);
  console.log(`  ${titel}  [${status}]`);
  console.log(`    ${folge.laenge} lueckenlose Codes ${folge.von}–${folge.bis} von ${gesamt} (${prozent} %)`);
}
console.log('\nGegen die Lieferantenliste pruefen, bevor etwas geaendert wird:');
console.log('  node scripts/jordan-media-scrape.mjs snippet <Artikelnummer>');
process.exit(1);
