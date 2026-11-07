import test from 'node:test';
import assert from 'node:assert/strict';
import { endePasst, pruefeAktionen, rabattAusKnoten, tagBerlin } from '../lib/aktion-guard.mjs';

const HEUTE = '2026-11-07';
const BW = 'gid://shopify/Collection/709852594510';
const rabatt = (extra = {}) => ({ titel: 'Black Week 2026', status: 'ACTIVE', start: '2026-11-05T23:00:00Z', ende: '2026-12-01T05:00:00Z', prozent: 15, kollektionen: [BW], ...extra });
const aktion = (extra = {}) => ({ aktiv: true, start: '2026-11-06', ende: '2026-11-30', kollektion: BW, prozent: 15, ...extra });
const produkt = (extra = {}) => ({ handle: 'zirkon', mf: { aktion_start: '2026-11-06', aktion_ende: '2026-11-30', aktion_klasse: 'aktion' }, kollektionen: [BW], vergleichspreis: false, ...extra });

test('Black Week 2026 wie live am 07.11.: passt', () => {
  const r = pruefeAktionen({ rabatte: [rabatt()], aktionen: [aktion()], produkte: [produkt()], heute: HEUTE });
  assert.deepEqual(r.fehler, []);
  assert.equal(r.geprueft.imRabatt, 1);
});

test('Rabatt-Ende am Morgen nach dem letzten Aktionstag zaehlt als passend, am Nachmittag nicht', () => {
  assert.equal(endePasst('2026-12-01T05:00:00Z', '2026-11-30'), true);
  assert.equal(endePasst('2026-11-30T22:59:00Z', '2026-11-30'), true);
  assert.equal(endePasst('2026-12-01T14:00:00Z', '2026-11-30'), false);
  assert.equal(endePasst(null, '2026-11-30'), false);
  assert.equal(tagBerlin('2026-11-05T23:00:00Z'), '2026-11-06');
});

test('Anzeige ohne Abrechnung: tp_aktion laeuft, kein Rabatt', () => {
  const r = pruefeAktionen({ rabatte: [], aktionen: [aktion()], produkte: [], heute: HEUTE });
  assert.match(r.fehler[0], /Anzeige ohne Abrechnung/);
});

test('Abrechnung ohne Anzeige: Rabatt laeuft, tp_aktion fehlt oder ist aus', () => {
  const r = pruefeAktionen({ rabatte: [rabatt()], aktionen: [aktion({ aktiv: false })], produkte: [], heute: HEUTE });
  assert.match(r.fehler.join('\n'), /Abrechnung ohne Anzeige/);
});

test('Prozent und Ende abweichend werden gemeldet', () => {
  const r = pruefeAktionen({ rabatte: [rabatt({ prozent: 10, ende: null })], aktionen: [aktion()], produkte: [], heute: HEUTE });
  assert.match(r.fehler.join('\n'), /Prozent weicht ab/);
  assert.match(r.fehler.join('\n'), /bis unbegrenzt/);
});

test('Doppelrabatt: Produkt im Rabatt mit reduziertem Variantenpreis', () => {
  const r = pruefeAktionen({ rabatte: [rabatt()], aktionen: [aktion()], produkte: [produkt({ vergleichspreis: true })], heute: HEUTE });
  assert.match(r.fehler.join('\n'), /Doppelrabatt moeglich: zirkon/);
});

test('Zeitraum am Produkt weicht vom Rabatt ab', () => {
  const p = produkt({ mf: { aktion_start: '2026-11-06', aktion_ende: '2026-11-23', aktion_klasse: 'aktion' } });
  const r = pruefeAktionen({ rabatte: [rabatt()], aktionen: [aktion()], produkte: [p], heute: HEUTE });
  assert.match(r.fehler.join('\n'), /Zeitraum am Produkt weicht ab: zirkon/);
});

test('Produkt-Aktion ausserhalb des Rabatts: mit Vergleichspreis Hinweis, ohne Fehler; Dauerrabatt zaehlt nicht', () => {
  const mf = { aktion_start: '2026-11-01', aktion_ende: '2026-11-20', aktion_klasse: 'aktion' };
  const mit = pruefeAktionen({ produkte: [produkt({ kollektionen: [], vergleichspreis: true, mf })], heute: HEUTE });
  assert.deepEqual(mit.fehler, []);
  assert.equal(mit.hinweise.length, 1);
  const ohne = pruefeAktionen({ produkte: [produkt({ kollektionen: [], mf })], heute: HEUTE });
  assert.match(ohne.fehler[0], /Anzeige ohne Abrechnung: zirkon/);
  const anker = pruefeAktionen({ produkte: [produkt({ kollektionen: [], mf: { ...mf, aktion_klasse: 'preisanker' } })], heute: HEUTE });
  assert.deepEqual(anker.fehler, []);
});

test('Abgelaufene Rabatte und Aktionen zaehlen nicht', () => {
  const r = pruefeAktionen({ rabatte: [rabatt({ ende: '2026-11-01T05:00:00Z' })], aktionen: [aktion({ ende: '2026-10-31' })], produkte: [], heute: HEUTE });
  assert.deepEqual(r.fehler, []);
});

test('rabattAusKnoten liest nur prozentuale automatische Rabatte', () => {
  const knoten = { discount: { __typename: 'DiscountAutomaticBasic', title: 'BW', status: 'ACTIVE', startsAt: 'a', endsAt: 'b', customerGets: { value: { __typename: 'DiscountPercentage', percentage: 0.15 }, items: { __typename: 'DiscountCollections', collections: { nodes: [{ id: BW }] } } } } };
  assert.deepEqual(rabattAusKnoten(knoten), { titel: 'BW', status: 'ACTIVE', start: 'a', ende: 'b', prozent: 15, kollektionen: [BW] });
  assert.equal(rabattAusKnoten({ discount: { __typename: 'DiscountCodeBasic' } }), null);
});
