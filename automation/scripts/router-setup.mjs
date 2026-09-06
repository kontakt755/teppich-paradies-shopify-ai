#!/usr/bin/env node
// Richtet .env.local auf einem neuen Rechner ein. Alle Einstellungen kommen aus der
// versionierten .env.example; nur die beiden Provider-Keys fehlen dort bewusst und
// werden vom Menschen eingetragen. Dieses Script nimmt selbst nie einen Key entgegen -
// ein ueber die Kommandozeile uebergebenes Geheimnis landet sonst in der Shell-History.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const beispiel = path.join(root, '.env.example');
const lokal = path.join(root, '.env.local');

const GEHEIM = [
  { name: 'GEMINI_API_KEY', woher: 'https://aistudio.google.com/apikey (kostenloses Kontingent)' },
  { name: 'OPENROUTER_API_KEY', woher: 'https://openrouter.ai/keys (Fallback, ebenfalls kostenlos)' },
];

if (!fs.existsSync(beispiel)) {
  console.error('.env.example fehlt — stimmt das Repository-Verzeichnis?');
  process.exit(1);
}

if (!fs.existsSync(lokal)) {
  fs.copyFileSync(beispiel, lokal);
  console.log('.env.local aus .env.example angelegt.');
} else {
  console.log('.env.local existiert bereits — Inhalt bleibt unveraendert.');
}

// Ein Key gilt als gesetzt, wenn hinter dem = etwas anderes als leere Anfuehrungszeichen steht.
const inhalt = fs.readFileSync(lokal, 'utf8');
const fehlend = GEHEIM.filter(({ name }) => {
  const treffer = inhalt.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`, 'm'));
  return !treffer || !treffer[1].replace(/['"]/g, '').trim();
});

if (!fehlend.length) {
  console.log('\nBeide Provider-Keys sind eingetragen.');
  console.log('Pruefen mit: npm run router:status');
  process.exit(0);
}

console.log(`\nNoch einzutragen in .env.local (${fehlend.length}):\n`);
for (const { name, woher } of fehlend) {
  console.log(`  ${name}`);
  console.log(`    Quelle: ${woher}`);
  console.log(`    Format: export ${name}='dein-key'\n`);
}
console.log('Die Keys gehoeren in einen Passwortmanager, nicht ins Repository —');
console.log('.env.local ist absichtlich gitignored und wird nie synchronisiert.');
console.log('\nDanach pruefen mit: npm run router:status');
