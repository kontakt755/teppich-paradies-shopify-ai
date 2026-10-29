// Datenstand je Quelle ("Stand: vor 3 Min.", Hinweis bei veralteten Daten) und die einfache
// Mitarbeiter-Oberflaeche (Wunsch 2026-10-21).
import './_testumgebung.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  veralteteQuellen, hinweisSatz, datenstandTodo, vorText, seitText, grenzeFuer, istVeraltet, quelleFuerSeite,
} from '../lib/datenstand.mjs';

const hier = path.dirname(fileURLToPath(import.meta.url));
const jetzt = new Date('2026-10-21T12:00:00.000Z');
const vor = min => new Date(jetzt.getTime() - min * 60_000).toISOString();

test('Grenzen je Quelle: Bestellungen nach 30 Minuten, Lexikon nach einem Tag', () => {
  assert.equal(grenzeFuer('bestellungen'), 30 * 60_000);
  assert.equal(grenzeFuer('lexikon'), 24 * 60 * 60_000);
  assert.equal(istVeraltet('bestellungen', vor(29), jetzt), false);
  assert.equal(istVeraltet('bestellungen', vor(31), jetzt), true);
  assert.equal(istVeraltet('lexikon', vor(23 * 60), jetzt), false);
  assert.equal(istVeraltet('lexikon', vor(25 * 60), jetzt), true);
  assert.equal(istVeraltet('bestellungen', null, jetzt), null);
});

test('vorText und seitText sprechen Alltagsdeutsch', () => {
  assert.equal(vorText(vor(0), jetzt), 'gerade eben');
  assert.equal(vorText(vor(3), jetzt), 'vor 3 Min.');
  assert.equal(vorText(vor(120), jetzt), 'vor 2 Stunden');
  assert.equal(vorText(vor(60 * 24 * 3), jetzt), 'vor 3 Tagen');
  assert.equal(seitText(vor(60), jetzt), 'seit einer Stunde');
  assert.equal(seitText(vor(125), jetzt), 'seit 2 Stunden');
});

test('veralteteQuellen meldet nur zu alte Quellen und den Satz fuer Mitarbeiter', () => {
  const a = { verfuegbar: true, teile: {
    bestellungen: { erfolg: true, zeitpunkt: vor(125) },
    lexikon: { erfolg: true, zeitpunkt: vor(120) },
    kunden: { erfolg: true, zeitpunkt: vor(5) },
  } };
  const v = veralteteQuellen(a, jetzt);
  assert.deepEqual(v.map(q => q.teil), ['bestellungen']);
  assert.equal(hinweisSatz(v), 'Bestellungen sind seit 2 Stunden nicht aktualisiert – bitte dem Inhaber Bescheid geben.');
  assert.match(hinweisSatz(v, { inhaber: true }), /Sync-Dienst prüfen/);
  const zwei = veralteteQuellen({ verfuegbar: true, teile: { bestellungen: { erfolg: true, zeitpunkt: vor(45) }, kunden: { erfolg: true, zeitpunkt: vor(180) } } }, jetzt);
  assert.equal(hinweisSatz(zwei), 'Bestellungen, Kunden sind seit 3 Stunden nicht aktualisiert – bitte dem Inhaber Bescheid geben.');
  assert.deepEqual(veralteteQuellen({ verfuegbar: false }, jetzt), []);
  assert.deepEqual(veralteteQuellen(null, jetzt), []);
});

test('To-do fuer den Inhaber nur bei veralteten Daten; Bestellungen machen es rot', () => {
  assert.deepEqual(datenstandTodo([]), []);
  const [t] = datenstandTodo(veralteteQuellen({ verfuegbar: true, teile: { bestellungen: { erfolg: true, zeitpunkt: vor(90) } } }, jetzt));
  assert.equal(t.ton, 'crit');
  assert.match(t.titel, /^Daten-Abgleich prüfen: Bestellungen/);
  const [l] = datenstandTodo(veralteteQuellen({ verfuegbar: true, teile: { lexikon: { erfolg: true, zeitpunkt: vor(60 * 30) } } }, jetzt));
  assert.equal(l.ton, 'warn');
});

test('Seiten mit Betriebsdaten haben eine Quelle fuer "Stand"', () => {
  assert.equal(quelleFuerSeite('heute'), 'bestellungen');
  assert.equal(quelleFuerSeite('lexikon'), 'lexikon');
  assert.equal(quelleFuerSeite('hilfe'), null);
});

test('Menue fuer Mitarbeiter: nur Heute, Kunden, Bestellen, Genossenschaften, Hausverwaltungen, Lexikon, Hilfe', () => {
  const html = fs.readFileSync(path.join(hier, '..', 'index.html'), 'utf8');
  const side = html.slice(html.indexOf('id="mainnav"'), html.indexOf('id="navDashboards"'));
  const links = [...side.matchAll(/<a href="#\/([a-z]+)" data-nav="\1"([^>]*)>/g)];
  const sichtbar = links.filter(([, , attr]) => !/data-nur-inhaber|data-nicht-mitarbeiter/.test(attr)).map(([, n]) => n);
  assert.deepEqual(sichtbar.sort(), ['akquise', 'einkauf', 'hausverwaltungen', 'heute', 'hilfe', 'kunden', 'lexikon']);
  assert.match(html, /data-nav-gruppe="verwaltung"/);
  assert.ok(!html.includes('id="navMore"'), 'keine pauschale Mehr-Gruppe mehr');
  assert.match(html, /id="datenstandLeiste"/);
  const css = fs.readFileSync(path.join(hier, '..', 'app.css'), 'utf8');
  assert.match(css, /body\.rolle-mitarbeiter \[data-nicht-mitarbeiter\] \{ display: none !important; \}/);
});

test('Hilfe beginnt mit "In 1 Minute erklärt" und den drei Ablaeufen', async () => {
  const { viewHilfe } = await import('../ansichten/hilfe.mjs');
  const h = viewHilfe();
  assert.ok(h.indexOf('In 1 Minute erklärt') < h.indexOf('Morgens'));
  // "Muster rausgeben" heisst seit der Packstation "Muster packen" (Rundgang 26.10.).
  for (const s of ['Kunde bestellt', 'Muster packen', 'Packstation', 'Genossenschaft anschreiben', 'Genossenschaften', 'Hausverwaltungen', 'Lexikon', 'Bestellen']) assert.ok(h.includes(s), s);
});
