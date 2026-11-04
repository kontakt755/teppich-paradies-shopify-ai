import process from 'node:process';
import { pruefe } from './bewertung-guard.mjs';

const { geprueft, befunde } = pruefe(process.cwd());
for (const b of befunde) {
  if (b.typ === 'hinweis') {
    console.log(`FEHLER ${b.datei}: zeigt Note oder Bewertungen ohne den Hinweis nach § 5b Abs. 3 UWG (snippets/tp-bewertungshinweis.liquid)`);
    continue;
  }
  if (b.typ === 'code') {
    console.log(`FEHLER ${b.datei}: liest ${b.feld} ${b.wert} - zeigt sonst nicht den Monatsstand`);
    continue;
  }
  console.log(`FEHLER ${b.datei} [${b.typ}] ${b.feld} = ${JSON.stringify(b.wert)} - gehoert in die Theme-Einstellung "TP Google-Bewertung", nicht ins Template.`);
}
console.log(`Bewertung-Guard: ${geprueft} Templates geprueft, ${befunde.length} Fehler.`);
process.exit(befunde.length ? 1 : 0);
