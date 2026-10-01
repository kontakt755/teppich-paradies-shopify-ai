import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Die Navigation steht als festes Markup in index.html (Seitenleiste am Rechner, untere
// Leiste am Handy). Eine neue Ansicht, die dort keinen Link bekommt, waere nur noch ueber
// die Suche erreichbar - das faellt im Alltag erst auf, wenn jemand sie sucht.

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(WURZEL, 'app.js'), 'utf8');
const router = fs.readFileSync(path.join(WURZEL, 'kern/router.mjs'), 'utf8');

const routen = [...app.match(/const VIEWS = \{([^}]+)\}/)[1].matchAll(/([a-z]+):\s*view/g)].map(m => m[1]);
const teil = (start, ende) => html.slice(html.indexOf(start), html.indexOf(ende, html.indexOf(start)));
const seitenleiste = teil('<aside class="side"', '</aside>');
const untereLeiste = teil('<nav class="tabbar', '</nav>');
const links = text => [...text.matchAll(/<a href="#\/([a-z]+)" data-nav="([a-z]+)"([^>]*)>/g)].map(m => ({ ziel: m[1], nav: m[2], rest: m[3] }));

test('jede Ansicht hat einen Punkt in der Seitenleiste', () => {
  const vorhanden = links(seitenleiste).map(l => l.nav);
  for (const r of routen) assert.ok(vorhanden.includes(r), `Ansicht "${r}" fehlt in der Seitenleiste (index.html)`);
  for (const l of links(seitenleiste)) {
    assert.equal(l.ziel, l.nav, `Link #/${l.ziel} traegt data-nav="${l.nav}"`);
    assert.ok(routen.includes(l.nav), `Seitenleiste verlinkt "${l.nav}", die Ansicht gibt es nicht`);
  }
});

test('Inhaber-Ansichten sind in der Navigation als solche markiert', () => {
  const inhaber = [...router.match(/const ANSICHT_ROLLEN = \{([\s\S]*?)\};/)[1].matchAll(/([a-z]+):\s*'inhaber'/g)].map(m => m[1]);
  assert.ok(inhaber.length >= 6, 'ANSICHT_ROLLEN nicht gefunden');
  for (const l of links(seitenleiste)) {
    assert.equal(l.rest.includes('data-nur-inhaber'), inhaber.includes(l.nav), `"${l.nav}": data-nur-inhaber und ANSICHT_ROLLEN widersprechen sich`);
  }
});

test('untere Leiste am Handy: Heute, Auftraege, Lexikon, Einkauf und "Mehr"', () => {
  assert.deepEqual(links(untereLeiste).map(l => l.nav), ['heute', 'kunden', 'lexikon', 'einkauf']);
  // Diese vier duerfen keinem vorenthalten sein - sonst stuende am Handy ein toter Punkt.
  for (const l of links(untereLeiste)) assert.ok(!l.rest.includes('data-nur-inhaber'), `"${l.nav}" in der unteren Leiste ist dem Inhaber vorbehalten`);
  assert.match(untereLeiste, /<button type="button" id="navToggle"[^>]*aria-controls="side"/, '"Mehr" muss die Seitenleiste als Blatt oeffnen');
});

test('Seite nutzt die Safe-Area und folgt ohne eigene Wahl dem Geraet', () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /prefers-color-scheme/);
  const css = fs.readFileSync(path.join(WURZEL, 'app.css'), 'utf8');
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});
