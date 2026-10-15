import process from 'node:process';
import { pruefe } from './schriftskala-guard.mjs';

const { geprueft, befunde } = pruefe(process.cwd());
for (const b of befunde) {
  console.log(`FEHLER ${b.datei}:${b.zeile} font-size: ${b.wert} - feste Groesse; Stufe aus der Skala nehmen: var(--tp-fs-xs|sm|md|lg|xl|2xl) (snippets/tp-gestaltung.liquid).`);
}
console.log(`Schriftskala-Guard: ${geprueft} Dateien geprueft, ${befunde.length} Fehler.`);
process.exit(befunde.length ? 1 : 0);
