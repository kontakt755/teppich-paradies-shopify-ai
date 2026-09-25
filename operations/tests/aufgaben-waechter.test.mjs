import test from 'node:test';
import assert from 'node:assert/strict';
import { pruefeAufgabe, pruefbar } from '../lib/aufgaben-waechter.mjs';
import { baueEintrag, haltePruefungFest } from '../lib/organisation-speicher.mjs';

const holerMit = (antworten) => async (url) => {
  const eintrag = Object.entries(antworten).find(([teil]) => url.includes(teil))?.[1];
  if (!eintrag) return { status: 404, text: async () => '' };
  if (eintrag.wirft) throw new Error(eintrag.wirft);
  return { status: eintrag.status ?? 200, text: async () => eintrag.text ?? '' };
};

test('Testfall 5: Preis stimmt - erfüllt; Preis weicht ab - nicht erfüllt', async () => {
  const aufgabe = { typ: 'TASK', pruefTyp: 'AUTO', pruefung: { art: 'shop-preis', handle: 'nevada', soll: '23,95' } };
  const stimmt = await pruefeAufgabe(aufgabe, { holen: holerMit({ '/products/nevada.js': { text: JSON.stringify({ variants: [{ id: 1, price: 2395 }] }) } }) });
  assert.equal(stimmt.erfuellt, true);
  assert.equal(stimmt.ist, '23.95');

  const falsch = await pruefeAufgabe(aufgabe, { holen: holerMit({ '/products/nevada.js': { text: JSON.stringify({ variants: [{ id: 1, price: 1995 }] }) } }) });
  assert.equal(falsch.erfuellt, false);
  assert.match(falsch.begruendung, /19\.95/);
});

test('Testfall 6: unlesbare Seite ergibt "weiß nicht", nicht "nicht erfüllt"', async () => {
  const aufgabe = { typ: 'TASK', pruefTyp: 'AUTO', pruefung: { art: 'shop-preis', handle: 'weg', soll: '10' } };
  const r = await pruefeAufgabe(aufgabe, { holen: holerMit({ '/products/weg.js': { status: 404 } }) });
  assert.equal(r.erfuellt, null);
});

test('Netzfehler ist "weiß nicht" - nie ein negatives Ergebnis', async () => {
  const aufgabe = { typ: 'TASK', pruefTyp: 'AUTO', pruefung: { art: 'shop-preis', handle: 'x', soll: '5' } };
  const r = await pruefeAufgabe(aufgabe, { holen: holerMit({ '/products/x.js': { wirft: 'ECONNREFUSED' } }) });
  assert.equal(r.erfuellt, null);
  assert.match(r.begruendung, /nicht möglich/);
});

test('ohne Prüfvorschrift wird nichts behauptet', async () => {
  const r = await pruefeAufgabe({ typ: 'TASK', pruefTyp: 'AUTO' }, { holen: holerMit({}) });
  assert.equal(r.erfuellt, null);
  assert.match(r.begruendung, /keine maschinell prüfbare/);
});

test('Text auf einer Seite prüfen', async () => {
  const aufgabe = { typ: 'TASK', pruefTyp: 'AUTO', pruefung: { art: 'shop-text', pfad: '/pages/ueber-uns', erwartet: 'Oranienburg' } };
  const da = await pruefeAufgabe(aufgabe, { holen: holerMit({ '/pages/ueber-uns': { text: '<p>Wir sind in Oranienburg</p>' } }) });
  assert.equal(da.erfuellt, true);
  const weg = await pruefeAufgabe(aufgabe, { holen: holerMit({ '/pages/ueber-uns': { text: '<p>Berlin</p>' } }) });
  assert.equal(weg.erfuellt, false);
});

test('nur Aufgaben mit Vorschrift und passender Prüfart kommen in den Lauf', () => {
  const liste = [
    { typ: 'TASK', pruefTyp: 'AUTO', status: 'PLANNED', pruefung: { art: 'shop-preis' } },
    { typ: 'TASK', pruefTyp: 'MANUAL', status: 'PLANNED', pruefung: { art: 'shop-preis' } },
    { typ: 'TASK', pruefTyp: 'AUTO', status: 'PLANNED' },
    { typ: 'NOTE', pruefTyp: 'AUTO', status: 'PLANNED', pruefung: { art: 'shop-preis' } },
  ];
  assert.equal(pruefbar(liste).length, 1);
});

test('Zusammenspiel: geprüfter Erfolg erledigt, unklares Ergebnis legt zur Prüfung', async () => {
  const e = baueEintrag({ titel: 'Nevada 23,95', pruefTyp: 'AUTO', pruefung: { art: 'shop-preis', handle: 'nevada', soll: '23,95' } });
  const gut = await pruefeAufgabe(e, { holen: holerMit({ '/products/nevada.js': { text: JSON.stringify({ variants: [{ id: 1, price: 2395 }] }) } }) });
  haltePruefungFest(e, gut);
  assert.equal(e.status, 'DONE');

  const unklar = await pruefeAufgabe(e, { holen: holerMit({ '/products/nevada.js': { status: 500 } }) });
  haltePruefungFest(e, unklar);
  assert.equal(e.status, 'REVIEW', 'unklar darf eine erledigte Aufgabe nicht still lassen');
});
