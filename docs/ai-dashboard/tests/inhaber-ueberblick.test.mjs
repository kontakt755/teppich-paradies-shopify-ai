// Rundgang 26.10.: Inhaberzeile auf der Shop-Übersicht (#44) und Entscheidungen, deren Zaehler
// dieselben Eintraege zaehlt wie die Liste (#43). Nur erfundene Daten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inhaberZeile, nebenbereichZusatz } from '../ansichten/heute/inhaber-zeile.mjs';
import { offeneEntscheidungen } from '../lib/model.mjs';
import { viewFreigaben } from '../ansichten/freigaben.mjs';
import { state } from '../kern/zustand.mjs';

globalThis.document ||= { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };

const JETZT = new Date('2026-10-26T09:00:00Z');
const aufgabe = (number, felder = {}) => ({ number, title: `Testaufgabe ${number}`, open: true, status: 'bereit', isDecision: false,
  labels: [], triage: [], priorityRank: 2, updatedAt: '2026-10-25T08:00:00Z', url: `https://example.invalid/${number}`, ...felder });
const AUFGABEN = [
  aufgabe(1, { status: 'freigabe' }),
  aufgabe(2, { isDecision: true, decision: { question: 'Testfrage?', options: ['Ja', 'Nein'] } }),
  aufgabe(3, { isDecision: true, open: false }),
  aufgabe(4, { status: 'review' }),
  aufgabe(5, { due: '2026-10-28' }),
  aufgabe(6, { due: '2026-11-15' }),
];
const KENNZAHLEN = { verfuegbar: true, zeitraeume: { 7: { umsatz: 1234.5, waehrung: 'EUR' } } };
// toLocaleString setzt ein geschuetztes Leerzeichen vor das Eurozeichen.
const teile = html => [...html.matchAll(/class="inhaber-teil[^"]*"[^>]*>([^<]+)</g)].map(m => m[1].replace(/\u00a0/g, ' '));

test('offeneEntscheidungen: offen und Freigabe oder Entscheidungsvorlage - nichts anderes', () => {
  assert.deepEqual(offeneEntscheidungen(AUFGABEN).map(t => t.number), [1, 2]);
  assert.deepEqual(offeneEntscheidungen([]), []);
});

test('Entscheidungen: die Liste zeigt genau so viele Eintraege, wie der Zaehler meldet; Werkbank nur als Link', () => {
  state.tasks = AUFGABEN;
  state.capabilities = { dashboards: { werkbank: 'https://werkbank.example.invalid/' } };
  const html = viewFreigaben();
  const n = offeneEntscheidungen(state.tasks).length;
  assert.match(html, new RegExp(`<h2>Offen \\(${n}\\)</h2>`));
  assert.equal((html.match(/data-decide="question"/g) || []).length, n, 'je Eintrag eine Karte');
  assert.match(html, /„Ideen &amp; Fragen“\. <a href="https:\/\/werkbank\.example\.invalid\/" target="_blank" rel="noopener">Ideen &amp; Fragen öffnen ↗<\/a>/);
  state.capabilities = { dashboards: { werkbank: 'http://unsicher.example.invalid/' } };
  assert.doesNotMatch(viewFreigaben(), /Ideen &amp; Fragen öffnen/, 'nur https-Ziele');
  state.capabilities = {};
  state.tasks = [];
});

test('Inhaberzeile: Shop, 7-Tage-Umsatz, Entscheidungen und naechste Frist, jeweils verlinkt', () => {
  const html = inhaberZeile({ shop: { verfuegbar: true, ampel: 'gruen', geprueftAm: '2026-10-26T08:30:00Z' }, kennzahlen: KENNZAHLEN,
    tasks: AUFGABEN, aufgabenGeladen: true, jetzt: JETZT });
  assert.deepEqual(teile(html), ['Shop in Ordnung', '7 Tage 1.235 € Umsatz', '2 Entscheidungen offen', 'nächste Frist 28.10.']);
  assert.match(html, /<nav class="inhaber-zeile" aria-label="Überblick für den Inhaber">/);
  assert.match(html, /href="#\/shopwache"/);
  assert.match(html, /<button type="button" class="inhaber-teil" data-param="kz" data-value="1" aria-expanded="false">/);
  assert.match(html, /class="inhaber-teil warn" href="#\/freigaben"/);
  assert.match(html, /class="inhaber-teil warn" href="#\/heute\?task=5" title="Testaufgabe 5"/, 'Frist in drei Tagen ist gelb');
});

test('Inhaberzeile: ehrliche Zustaende statt geratener Zahlen', () => {
  const t = p => teile(inhaberZeile({ jetzt: JETZT, ...p }));
  assert.deepEqual(t({ shop: null, kennzahlen: null }), ['Shop-Kontrolle lädt …', 'Umsatz lädt …']);
  assert.deepEqual(t({ shop: { verfuegbar: false }, kennzahlen: { verfuegbar: false } }), ['Shop-Kontrolle noch nie gelaufen', 'Umsatz nicht verfügbar']);
  assert.equal(t({ shop: { verfuegbar: true, ampel: 'gruen', geprueftAm: '2026-10-26T04:00:00Z' } })[0], 'Shop-Kontrolle meldet sich nicht');
  assert.equal(t({ shop: { verfuegbar: true, ampel: 'rot', geprueftAm: '2026-10-26T08:30:00Z' } })[0], 'Shop hat ein Problem');
  assert.equal(t({ shop: { verfuegbar: true, ampel: 'gelb', geprueftAm: '2026-10-26T08:30:00Z' } })[0], 'Shop: Auffälligkeiten');
  assert.deepEqual(t({ shop: undefined, kennzahlen: KENNZAHLEN }), ['7 Tage 1.235 € Umsatz'], 'ohne Shop-Kontrolle fuer die Rolle kein Shopteil');
  // Aufgaben noch nicht geladen: keine "0 Entscheidungen" behaupten.
  assert.ok(!t({ kennzahlen: KENNZAHLEN, tasks: [] }).some(x => /Entscheidung/.test(x)));
  assert.ok(t({ kennzahlen: KENNZAHLEN, tasks: [], aufgabenGeladen: true }).includes('keine Entscheidung offen'));
  assert.ok(t({ kennzahlen: KENNZAHLEN, tasks: [aufgabe(9, { due: '2026-10-20' })], aufgabenGeladen: true }).includes('Frist überschritten 20.10.'));
  // Aufgeklappt: derselbe Knopf klappt zu.
  assert.match(inhaberZeile({ kennzahlen: KENNZAHLEN, kzOffen: true, jetzt: JETZT }), /data-param="kz" data-value="" aria-expanded="true">Kennzahlen zuklappen</);
});

test('nebenbereichZusatz: Zahl der offenen Anfragen und Alter der aeltesten, sonst nichts', () => {
  assert.equal(nebenbereichZusatz(null, JETZT), '');
  assert.equal(nebenbereichZusatz({ eintraege: [{ id: 's0', status: 'gewonnen', erstelltAm: '2026-10-01T08:00:00Z' }] }, JETZT), '');
  const d = { eintraege: [
    { id: 's1', status: 'neu', erstelltAm: '2026-10-16T08:00:00Z' },
    { id: 's2', status: 'kontaktiert', datum: '2026-10-24' },
    { id: 's3', status: 'verloren', erstelltAm: '2026-09-01T08:00:00Z' },
  ] };
  assert.equal(nebenbereichZusatz(d, JETZT), ' · 2 offene Anfragen, älteste seit 10 Tagen');
  assert.equal(nebenbereichZusatz({ eintraege: [{ id: 's4', status: 'neu', erstelltAm: '2026-10-26T08:00:00Z' }] }, JETZT), ' · 1 offene Anfrage');
});
