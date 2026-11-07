import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { suchVerweis, suchwert, verbergeSuchbegriffe } from '../lib/suchverweis.mjs';
import { parseRoute, navigate, setParam, openTask } from '../kern/router.mjs';
import { state } from '../kern/zustand.mjs';
import { kundenKlickAkte } from '../ansichten/kunden.mjs';

const MAIL = 'test.kunde@example.invalid';
const TELEFON = '+49 000 0000000';

/** Browser-Adresse als Attrappe: zeichnet jede Adresse auf, die je im Verlauf landen koennte. */
function browser(hash) {
  const adressen = [];
  globalThis.location = { get hash() { return hash; }, set hash(neu) { hash = neu; adressen.push(neu); } };
  globalThis.history = { state: null, replaceState(_s, _t, neu) { hash = neu; adressen.push(neu); } };
  return { adressen, hash: () => hash };
}
const klartext = (adressen, ...begriffe) => adressen.filter(a => begriffe.some(b => decodeURIComponent(a.replaceAll('+', ' ')).includes(b)));

test('alter Link: Suchbegriff wird uebernommen und verschwindet aus der Adresse', () => {
  const b = browser(`#/kunden?tab=suche&kq=${encodeURIComponent(MAIL)}&kf=offen`);
  parseRoute();
  assert.equal(suchwert(state.route.params, 'kq'), MAIL);
  assert.equal(state.route.view, 'kunden');
  assert.deepEqual(klartext([b.hash()], MAIL), []);
  assert.match(b.hash(), /^#\/kunden\?tab=suche&kq=sv-[a-z0-9]+-\d+&kf=offen$/, 'andere Parameter bleiben stehen');
});

test('alter Packstation-Link: mpq und mpfertig tragen denselben Text, beide werden bereinigt', () => {
  const b = browser(`#/kunden?tab=muster&mpq=${encodeURIComponent(TELEFON)}&mpfertig=${encodeURIComponent(TELEFON)}`);
  parseRoute();
  assert.equal(suchwert(state.route.params, 'mpq'), TELEFON);
  assert.equal(suchwert(state.route.params, 'mpfertig'), TELEFON);
  assert.deepEqual(klartext([b.hash()], TELEFON), []);
});

test('saubere Adresse wird nicht angefasst, andere Suchparameter bleiben wie sie sind', () => {
  const b = browser('#/kunden?tab=bestellungen&bq=TEST1');
  parseRoute();
  assert.deepEqual(b.adressen, []);
  assert.equal(state.route.params.get('bq'), 'TEST1');
});

test('leerer Suchparameter faellt weg', () => {
  const b = browser('#/kunden?kq=');
  parseRoute();
  assert.equal(b.hash(), '#/kunden');
});

test('Zurueck: jeder Verlaufseintrag findet seinen eigenen Begriff wieder', () => {
  browser(`#/kunden?tab=suche&kq=${suchVerweis('Erster Begriff')}`);
  parseRoute();
  const erster = location.hash;
  browser(`#/kunden?tab=suche&kq=${suchVerweis('Zweiter Begriff')}`);
  parseRoute();
  assert.equal(suchwert(state.route.params, 'kq'), 'Zweiter Begriff');
  browser(erster);
  parseRoute();
  assert.equal(suchwert(state.route.params, 'kq'), 'Erster Begriff');
});

test('nach dem Neuladen ist ein alter Verweis leer und faellt aus der Adresse', () => {
  const b = browser('#/kunden?tab=suche&kq=sv-alterlauf-1');
  parseRoute();
  assert.equal(suchwert(state.route.params, 'kq'), '');
  assert.equal(b.hash(), '#/kunden?tab=suche');
});

test('Filter, Aufgabe und Sprung behalten die Suche, ohne den Begriff zu schreiben', () => {
  const b = browser(`#/kunden?tab=suche&kq=${encodeURIComponent(MAIL)}`);
  parseRoute();
  setParam('kf', 'offen');
  parseRoute();
  assert.equal(suchwert(state.route.params, 'kq'), MAIL);
  openTask(7);
  parseRoute();
  assert.equal(suchwert(state.route.params, 'kq'), MAIL);
  setParam('mpq', TELEFON);
  parseRoute();
  assert.equal(suchwert(state.route.params, 'mpq'), TELEFON);
  assert.deepEqual(klartext(b.adressen, MAIL, TELEFON), []);
});

test('Sprung aus der Schnellsuche schreibt nur den Verweis', () => {
  const b = browser('#/heute');
  navigate('kunden', { tab: 'muster', mpq: TELEFON, mpfertig: TELEFON });
  assert.deepEqual(klartext(b.adressen, TELEFON), []);
  parseRoute();
  assert.equal(suchwert(state.route.params, 'mpq'), TELEFON);
  assert.equal(suchwert(state.route.params, 'mpfertig'), TELEFON);
});

test('gleicher Begriff, gleicher Verweis: Vergleich und Datenkontext bleiben stabil', () => {
  assert.equal(suchVerweis('Gleich'), suchVerweis('Gleich'));
  assert.notEqual(suchVerweis('Gleich'), suchVerweis('Anders'));
  const p = new URLSearchParams({ kq: suchVerweis('Gleich') });
  assert.equal(verbergeSuchbegriffe(p), false);
});

test('Akte aus der Suche: der Verweis geht mit, "Zurueck zur Kundensuche" fuehrt in die Suche', () => {
  const klick = treffer => ({ preventDefault() {}, target: { closest: sel => (sel === treffer.sel ? { dataset: treffer.dataset || {} } : null) } });
  const b = browser(`#/kunden?tab=suche&kq=${encodeURIComponent(MAIL)}`);
  parseRoute();
  const verweis = state.route.params.get('kq');
  assert.equal(kundenKlickAkte(klick({ sel: '[data-kunden-open]', dataset: { kundenOpen: 'email:test.kunde@example.invalid' } })), true);
  assert.equal(new URLSearchParams(location.hash.split('?')[1]).get('kq'), verweis);
  parseRoute();
  assert.equal(kundenKlickAkte(klick({ sel: '[data-kunden-zurueck]' })), true);
  assert.equal(location.hash, `#/kunden?tab=suche&kq=${verweis}`);
  assert.deepEqual(klartext(b.adressen, MAIL), []);
  // Aus einem anderen Reiter geoeffnet, bleibt der Zurueck-Link wie bisher bei der Kundenuebersicht.
  browser(`#/kunden?tab=bestellungen&kq=${verweis}`);
  parseRoute();
  kundenKlickAkte(klick({ sel: '[data-kunden-open]', dataset: { kundenOpen: 'email:test.kunde@example.invalid' } }));
  assert.equal(new URLSearchParams(location.hash.split('?')[1]).get('kq'), null);
});

test('Tippen im Suchfeld geht vor dem Schreiben in die Adresse durch die Bereinigung', () => {
  const quelle = fs.readFileSync(new URL('../ereignisse.mjs', import.meta.url), 'utf8');
  assert.match(quelle, /if \(el\.value\) p\.set\(key, el\.value\)[\s\S]{0,200}verbergeSuchbegriffe\(p\);\s*history\.replaceState/);
});
