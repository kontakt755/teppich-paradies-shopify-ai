// Rote To-dos oben auf der Shop-Übersicht (w-206, Fehlersuche 28.10.2026). Nur erfundene Daten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { problemeBlock, nurProbleme, PROBLEME_SICHTBAR, NEBENBEREICH_ARTEN } from '../ansichten/heute/probleme.mjs';

const todo = (id, ton, titel = `Test ${id}`) => ({ id, art: 'test', bereich: 'laden', ton, titel, kontext: 'Kontext' });
const zeile = t => `<div class="heute-todo ${t.ton}" data-todo="${t.id}">${t.titel}</div>`;
const zeilen = html => [...html.matchAll(/data-todo="([^"]+)"/g)].map(m => m[1]);

test('nur Rotes zaehlt: gelbe und normale To-dos bleiben in den Alltagssichten', () => {
  const liste = [todo('rot-1', 'crit'), todo('gelb', 'warn'), todo('normal', ''), todo('rot-2', 'crit'), null];
  assert.deepEqual(nurProbleme(liste).map(t => t.id), ['rot-1', 'rot-2'], 'Reihenfolge der (sortierten) Liste bleibt');
  assert.deepEqual(nurProbleme(undefined), []);
});

test('Laden-Anfragen, Angebote und Team-Aufgaben bleiben im Nebenbereich, auch wenn sie rot sind (Inhaber 22.10.)', () => {
  assert.deepEqual([...NEBENBEREICH_ARTEN], ['service', 'angebot', 'aufgabe']);
  const liste = [
    { ...todo('anfrage', 'crit'), art: 'service' }, { ...todo('angebot', 'crit'), art: 'angebot' }, { ...todo('aufgabe', 'crit'), art: 'aufgabe' },
    { ...todo('rueckruf', 'crit'), art: 'rueckruf' }, { ...todo('entfernt', 'crit'), art: 'entfernt' }, { ...todo('routinen', 'crit'), art: 'routinen' },
  ];
  assert.deepEqual(nurProbleme(liste).map(t => t.id), ['rueckruf', 'entfernt', 'routinen']);
  assert.equal(problemeBlock(liste.slice(0, 3), { zeile }), '', 'nur Nebenbereich: kein Block');
});

test('ohne rotes To-do kein Block - ein leerer Kasten waere Rauschen', () => {
  assert.equal(problemeBlock([], { zeile }), '');
  assert.equal(problemeBlock([todo('gelb', 'warn'), todo('normal', '')], { zeile }), '');
});

test('Block: Zahl im Titel, ein Satz, die Zeilen kommen vom Zeichner der Liste', () => {
  const html = problemeBlock([todo('gelb', 'warn'), todo('a', 'crit', 'Mac-Dienst gestört: Postfach'), todo('b', 'crit', 'Aus Bestellung entfernt: #T1')], { zeile });
  assert.match(html, /<section class="heute-probleme" aria-labelledby="heuteProbleme">/);
  assert.match(html, /<h2 id="heuteProbleme">Probleme · 2<\/h2>/);
  assert.match(html, /Rot heißt: das muss heute jemand lösen\./);
  assert.deepEqual(zeilen(html), ['a', 'b']);
  assert.match(html, /class="heute-todos"/, 'derselbe Kasten wie die Arbeitsliste');
  assert.doesNotMatch(html, /heute-rest/, 'bis drei Zeilen nichts zum Aufklappen');
});

test('ab der vierten roten Zeile klappt der Rest auf - die Warenkunden darunter bleiben im Blick', () => {
  const rot = ['a', 'b', 'c', 'd', 'e'].map(id => todo(id, 'crit'));
  const html = problemeBlock(rot, { zeile });
  assert.equal(PROBLEME_SICHTBAR, 3);
  assert.match(html, /Probleme · 5</);
  assert.match(html, /<details class="heute-rest"><summary>3 von 5 – alle anzeigen<\/summary>/);
  const [vorher, nachher] = html.split('<details');
  assert.deepEqual(zeilen(vorher), ['a', 'b', 'c']);
  assert.deepEqual(zeilen(nachher), ['d', 'e']);
});
