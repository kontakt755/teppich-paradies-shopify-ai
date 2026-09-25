import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// app.js laeuft im Browser und laesst sich hier nicht importieren (DOM, fetch).
// Diese Pruefungen lesen deshalb den Quelltext. Anlass: beim Umbenennen des
// Routenparameters von "key" auf "kunde" (secret:scan zaehlt "key" zu den
// sensiblen URL-Parametern) blieb eine Stelle stehen - navigate('kunden',
// { key: ... }) in der Schnellsuche. Ergebnis: Cmd+K fand den Kunden, aber die
// Akte blieb leer. Ein Name, der an mehreren Stellen gleich lauten muss, ohne
// dass etwas ihn zusammenhaelt, bricht genau so.

const HIER = path.dirname(fileURLToPath(import.meta.url));
const APP = fs.readFileSync(path.join(HIER, '..', 'app.js'), 'utf8');

test('die Kundenakte wird ueberall mit demselben Parameternamen geoeffnet', () => {
  const liest = [...APP.matchAll(/params\.get\('([a-z]+)'\)/g)].map(m => m[1]);
  assert.ok(liest.includes('kunde'), 'viewKunden muss den Parameter "kunde" lesen');

  // Schreibende Stellen: Hash-Links, URLSearchParams und navigate().
  // "tab" ist ein eigener, harmloser Parameter derselben Ansicht (#/kunden?tab=…)
  // und gehoert nicht zu denen, die eine einzelne Akte oeffnen.
  const hashLinks = [...APP.matchAll(/#\/kunden\?([a-z]+)=/g)].map(m => m[1]).filter(n => n !== 'tab');
  const gesetzt = [...APP.matchAll(/p\.set\('([a-z]+)',\s*kundenOpen/g)].map(m => m[1]);
  const navigiert = [...APP.matchAll(/navigate\('kunden',\s*\{\s*([a-z]+):/g)].map(m => m[1]);

  const schreibend = [...hashLinks, ...gesetzt, ...navigiert];
  assert.ok(schreibend.length >= 3, `zu wenige schreibende Stellen gefunden (${schreibend.length}) - Muster veraltet?`);
  for (const name of schreibend) {
    assert.equal(name, 'kunde', `Die Kundenakte wird mit "${name}" geoeffnet, gelesen wird aber "kunde"`);
  }
});

test('"key" taucht in keiner Kunden-Route mehr auf', () => {
  // Doppelte Sicherung: secret:scan wuerde "key=" in einer URL wieder als
  // sensiblen Parameter melden und jeden PR blockieren.
  assert.ok(!/#\/kunden\?key=/.test(APP), 'Kunden-Route darf nicht "key=" verwenden');
  assert.ok(!/navigate\('kunden',\s*\{\s*key:/.test(APP), 'navigate zur Kundenakte darf nicht "key" uebergeben');
});

test('jede Route aus dem Menue hat eine Ansicht und umgekehrt', () => {
  const bekannt = APP.match(/const bekannt = \[([^\]]+)\]/);
  assert.ok(bekannt, 'Whitelist in parseRoute nicht gefunden');
  const routen = [...bekannt[1].matchAll(/'([a-z]+)'/g)].map(m => m[1]);

  const views = APP.match(/const VIEWS = \{([^}]+)\}/);
  assert.ok(views, 'VIEWS-Tabelle nicht gefunden');
  const angelegt = [...views[1].matchAll(/([a-z]+):\s*view/g)].map(m => m[1]);

  for (const r of routen) {
    assert.ok(angelegt.includes(r), `Route "${r}" ist erlaubt, aber es gibt keine Ansicht dafuer`);
  }
  for (const v of angelegt) {
    assert.ok(routen.includes(v), `Ansicht "${v}" existiert, ist aber ueber keine Route erreichbar`);
  }
});
