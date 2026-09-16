import process from 'node:process';
import { pruefe } from './bewertung-guard.mjs';

const { geprueft, befunde } = pruefe(process.cwd());
for (const b of befunde) {
  console.log(`FEHLER ${b.datei} [${b.typ}] ${b.feld} = ${JSON.stringify(b.wert)} - gehoert in die Theme-Einstellung "TP Google-Bewertung", nicht ins Template.`);
}
console.log(`Bewertung-Guard: ${geprueft} Templates geprueft, ${befunde.length} Fehler.`);
process.exit(befunde.length ? 1 : 0);
