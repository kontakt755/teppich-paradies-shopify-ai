// Fragen von Claude unter "Entscheidungen": Karte mit vorgewaehlter Empfehlung, Zaehler und Zeile auf Heute. Nur erfundene Daten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../kern/zustand.mjs';

globalThis.document ||= { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
const FRAGE = { id: 'q-w-901-1', werkbankId: 'w-901', titel: 'Beispielaufgabe', frage: 'Welche Farbe für den Knopf?',
  optionen: [{ label: 'Grau', beschreibung: 'ruhig' }, { label: 'Braun', beschreibung: '' }], empfehlung: 'Grau',
  freitextErlaubt: true, gestellt: '2026-11-18T08:00:00Z', antwort: null, uebernommen: null };
const abrufe = [];
globalThis.fetch = async (url) => { abrufe.push(String(url)); return { ok: true, json: async () => ({ verfuegbar: true, offen: [FRAGE],
  beantwortet: [{ ...FRAGE, id: 'q-w-902-1', werkbankId: 'w-902', antwort: { label: 'Braun', freitext: null, von: 'Ina', am: '2026-11-17T10:00:00Z' } }] }) }; };

test('Entscheidungen: Fragen von Claude als Karte, Empfehlung zuerst und vorgewaehlt; Zahl fuer Menue und Heute', async () => {
  const { viewFreigaben, werkbankFragenOffen, werkbankFragenZeile } = await import('../ansichten/freigaben.mjs');
  state.tasks = []; state.capabilities = {}; state.route = { view: 'test', params: new URLSearchParams() };
  assert.match(viewFreigaben(), /Fragen von Claude werden geladen/);
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(abrufe, ['/api/werkbank/fragen'], 'einmal geladen');
  const html = viewFreigaben();
  assert.match(html, /<h2>Fragen von Claude \(1\)<\/h2>/);
  assert.match(html, /data-werkbank-frage="q-w-901-1"/);
  assert.match(html, /<h3>w-901 · Beispielaufgabe<\/h3>/);
  assert.match(html, /value="Grau" checked>.*Empfehlung/, 'Empfehlung vorgewaehlt und markiert');
  assert.doesNotMatch(html, /value="Braun" checked/);
  assert.match(html, /<textarea name="freitext"/);
  assert.equal((html.match(/btn-primary" type="submit">Antwort senden/g) || []).length, 1, 'eine Hauptaktion je Karte');
  assert.match(html, /Beantwortet \(1\) – Claude macht beim nächsten Lauf weiter/);
  assert.equal(werkbankFragenOffen(), 1);
  assert.match(werkbankFragenZeile(), /1 Frage von Claude/);
  assert.equal(abrufe.length, 1, 'kein zweiter Abruf');
});
