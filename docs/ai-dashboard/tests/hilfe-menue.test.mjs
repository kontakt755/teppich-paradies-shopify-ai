// Hilfe und Seitenleiste sprechen dieselbe Sprache (Rundgang 26.10.: die Hilfe nannte noch
// "Kunden" und "Bestellen" als Hauptpunkte und kannte die Packstation nicht).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MENUE_KURZ, HEUTE_BLOECKE, HEUTE_BEI_BEDARF, viewHilfe } from '../ansichten/hilfe.mjs';

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

// ---------------------------------------------------------------------------
// Hilfe zu "Heute" (#1996): jeder Blockname steht so als Ueberschrift auf der Shop-Uebersicht. Bis 06.11.2026
// beschrieb die Hilfe einen Block, den es seit dem 12.10. nicht mehr gab.
// ---------------------------------------------------------------------------

const lies = pfad => readFileSync(new URL(pfad, import.meta.url), 'utf8');
const heuteQuelle = lies('../ansichten/heute.mjs');
// Nur die Shop-Uebersicht (viewShop), nicht die Alltagssichten - dazu jeder Baustein, den heute.mjs laedt.
const viewShop = heuteQuelle.slice(heuteQuelle.indexOf('function viewShop()'), heuteQuelle.indexOf('\n}\n', heuteQuelle.indexOf('function viewShop()')));
const bausteine = [...heuteQuelle.matchAll(/from '(\.\/heute\/[^']+|\.\.\/bausteine\/[^']+)'/g)].map(m => lies(`../ansichten/${m[1]}`));
// Sichtbarer Anfang jeder Ueberschrift und jedes Aufklappkopfs - bis zum ersten Platzhalter oder Tag.
const ueberschriften = [viewShop, ...bausteine].flatMap(q => [...q.matchAll(/<(?:h2|summary)\b[^>]*>([^<$]+)/g)].map(m => ent(m[1]).trim()));
const kommtVor = name => ueberschriften.some(u => u === name || u.startsWith(`${name} `) || u.startsWith(`${name}:`));

test('Jeder Block, den die Hilfe für Heute nennt, steht so auf der Shop-Übersicht', () => {
  assert.ok(bausteine.length >= 5, 'Bausteine der Shop-Übersicht gefunden');
  assert.equal(kommtVor('Nicht liegen lassen'), false, 'Gegenprobe: ein entfernter Block wird nicht gefunden');
  for (const name of [...HEUTE_BLOECKE.map(([n]) => n), ...HEUTE_BEI_BEDARF]) assert.ok(kommtVor(name), `„${name}“ steht nicht auf der Shop-Übersicht`);
  // Reihenfolge wie auf der Seite: Waren zuerst, Weitere Bereiche zuletzt.
  const namen = HEUTE_BLOECKE.map(([n]) => n);
  assert.equal(namen[0], 'Warenbestellungen');
  assert.equal(namen.at(-1), 'Weitere Bereiche');
  const seite = viewHilfe();
  assert.doesNotMatch(seite, /Nicht liegen lassen|Ganz oben steht das Kundengeschäft/);
  assert.match(seite, /Kunden nach Produkt fragen/);
  assert.ok(lies('../ansichten/heute/bestellarbeit.mjs').includes('Kunden nach Produkt fragen'), 'die Zeile im Musterblock heißt so');
});

test('Hilfe spricht die Wörter aus BEGRIFFE.md: keine Großhändler-ID, keine grüne Ampel, eine Anleitung', () => {
  const seite = viewHilfe();
  assert.match(seite, /<b>Position:<\/b>/);
  assert.match(seite, /<b>Artikelnummer beim Lieferanten:<\/b>/);
  assert.match(seite, /Grün gibt es nicht/);
  assert.doesNotMatch(seite, /Großhändler-ID|grün = bereit|GitHub Pages/);
  // Die fruehere "Anleitung" unter Bestellen ist in die Hilfe gewandert - es gibt nur noch einen Ort.
  const bestellen = lies('../ansichten/einkauf.mjs');
  assert.doesNotMatch(bestellen, /\['hilfe', 'Anleitung'\]|Dein Tag beim Bestellen/);
  for (const wort of ['Einlagern?', 'Ist leer', 'aus dem Musterlager']) assert.ok(seite.includes(wort), wort);
});
