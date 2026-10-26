// Hilfe und Seitenleiste sprechen dieselbe Sprache (Rundgang 26.10.: die Hilfe nannte noch
// "Kunden" und "Bestellen" als Hauptpunkte und kannte die Packstation nicht).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MENUE_KURZ, viewHilfe } from '../ansichten/hilfe.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const seitenleiste = html.slice(html.indexOf('<aside class="side" id="side">'), html.indexOf('</aside>'));
const ent = s => s.replace(/&amp;/g, '&');
// Sichtbare Menuetexte: <span>…</span> in Links, Gruppenkoepfen und Knoepfen, dazu Links ohne Symbol.
const menueTexte = new Set([
  ...[...seitenleiste.matchAll(/<span>([^<]+)<\/span>/g)].map(m => ent(m[1].trim())),
  ...[...seitenleiste.matchAll(/data-nav="[^"]+"[^>]*>([^<]+)</g)].map(m => ent(m[1].trim())),
]);
const hauptpunkte = [...seitenleiste.matchAll(/class="nav-haupt">[\s\S]*?<span>([^<]+)<\/span>/g)].map(m => ent(m[1]));

test('Jeder Name in „In 1 Minute erklärt“ steht so in der Seitenleiste', () => {
  assert.ok(seitenleiste.length > 1000, 'Seitenleiste in index.html gefunden');
  for (const [name] of MENUE_KURZ) assert.ok(menueTexte.has(name), `„${name}“ fehlt in der Seitenleiste`);
});

test('Jeder Hauptpunkt der Seitenleiste und jede Gruppe kommt in der Hilfe vor', () => {
  assert.deepEqual(hauptpunkte, ['Heute', 'Bestellungen', 'Muster bestellen', 'Packstation', 'Lexikon']);
  const gruppen = [...seitenleiste.matchAll(/<summary class="nav-more-kopf"><span>([^<]+)<\/span>/g)].map(m => ent(m[1]))
    .filter(g => g !== 'Weitere Dashboards');
  const namen = MENUE_KURZ.map(([n]) => n);
  for (const p of [...hauptpunkte, ...gruppen, 'Fehler melden']) assert.ok(namen.includes(p), `Hilfe erklärt „${p}“ nicht`);
});

test('Hilfe nennt Packstation-Reiter und Lieferantenpost und widerspricht der Musterautomatik nicht', () => {
  const seite = viewHilfe();
  for (const wort of ['Bestellung packen', 'Muster kommt an', 'Lieferantenpost', 'Umschlag gepackt', 'Muster packen']) assert.match(seite, new RegExp(wort), wort);
  assert.doesNotMatch(seite, /nie etwas (automatisch )?(gesendet|bestellt)/);
  assert.doesNotMatch(seite, /unter „Mehr"|Partnerladen|Einkauf &amp; Wareneingang/);
  // Die Reiter heissen in den Ansichten genauso.
  const packstation = readFileSync(new URL('../ansichten/kunden/muster-packen.mjs', import.meta.url), 'utf8');
  assert.match(packstation, />Bestellung packen<\/a>/);
  assert.match(packstation, />Muster kommt an<\/a>/);
  const bestellen = readFileSync(new URL('../ansichten/einkauf.mjs', import.meta.url), 'utf8');
  assert.match(bestellen, /\['belege', 'Lieferantenpost'\]/);
});
