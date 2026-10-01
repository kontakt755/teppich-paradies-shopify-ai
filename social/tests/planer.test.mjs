import assert from 'node:assert/strict';
import test from 'node:test';
import { plane, termine, woche } from '../lib/planer.mjs';
import { RASTER } from '../lib/konfig.mjs';

// Mittwoch, 30.09.2026, 14 Uhr Ortszeit
const JETZT = new Date(2026, 8, 30, 14, 0);
const b = (id, typ, extra = {}) => ({ id, typ, quelle: typ.startsWith('produkt') || typ === 'angebot' || typ === 'raumidee' ? 'shopify' : 'baustelle', format: 'feed', punkte: 50, erstellt: JETZT.toISOString(), ...extra });

test('Kalenderwoche nach ISO', () => {
  assert.equal(woche(new Date(2026, 8, 30)), '2026-W40');
  assert.equal(woche(new Date(2027, 0, 1)), '2026-W53');
});

test('Termine liegen auf dem Raster und nie in der Vergangenheit', () => {
  const t = termine(RASTER.beitrag, JETZT, { tage: 7 });
  assert.ok(t.every(x => x.zeit > JETZT));
  assert.equal(t[0].zeit.getDay(), 3, 'naechster Termin ist noch heute, Mittwoch (ein Beitrag je Werktag)');
  assert.equal(t[0].zeit.getHours(), 18);
});

test('Frisches von der Baustelle zuerst, nie zweimal dasselbe Thema hintereinander', () => {
  const plan = plane({ offen: [b(1, 'produkt_neu'), b(2, 'produkt_woche'), b(3, 'kundenprojekt'), b(4, 'vorher_nachher')], jetzt: JETZT });
  const reihe = [...plan].sort((x, y) => x[1] - y[1]).map(([id]) => id);
  assert.ok([3, 4].includes(reihe[0]), 'Baustelle fuehrt');
  const gruppe = id => ([3, 4].includes(id) ? 'handwerk' : 'produkt');
  for (let i = 1; i < reihe.length; i += 1) assert.notEqual(gruppe(reihe[i]), gruppe(reihe[i - 1]), `Platz ${i}`);
});

test('Ein Tag, ein Beitrag - belegte Tage und die Wochengrenze werden geachtet', () => {
  const mittwoch = new Date(2026, 8, 30, 18, 0).toISOString();
  const plan = plane({ offen: [b(1, 'kundenprojekt')], belegt: [{ geplantAm: mittwoch, typ: 'produkt_neu', format: 'feed' }], jetzt: JETZT });
  assert.equal(plan.get(1).getDay(), 4, 'Mittwoch ist belegt, also Donnerstag');
  const voll = plane({ offen: Array.from({ length: 12 }, (_, i) => b(i + 1, i % 2 ? 'kundenprojekt' : 'raumidee')), jetzt: JETZT });
  const jeWoche = {};
  for (const [, zeit] of voll) jeWoche[woche(zeit)] = (jeWoche[woche(zeit)] ?? 0) + 1;
  assert.ok(Object.values(jeWoche).every(z => z <= RASTER.maxBeitraegeJeWoche));
  assert.equal(new Set([...voll.values()].map(z => z.toDateString())).size, voll.size);
});

test('Hoechstens ein Angebot je Woche', () => {
  const plan = plane({ offen: [b(1, 'angebot'), b(2, 'angebot'), b(3, 'angebot')], jetzt: JETZT });
  const wochen = [...plan.values()].map(woche);
  assert.equal(new Set(wochen).size, wochen.length);
});

test('Storys bekommen eigene, haeufigere Termine', () => {
  const plan = plane({ offen: [b(1, 'kundenprojekt', { format: 'story' }), b(2, 'kundenprojekt', { format: 'story' }), b(3, 'kundenprojekt')], jetzt: JETZT });
  // Zwei Story-Termine am Tag: heute 17:30, morgen 12:00
  assert.equal(plan.get(1).getHours(), 17);
  assert.equal(plan.get(2).getHours(), 12);
  assert.equal(plan.get(3).getHours(), 18);
});

test('Der Lernstand verschiebt die Reihenfolge nur begrenzt', () => {
  const ohne = plane({ offen: [b(1, 'produkt_woche', { punkte: 60 }), b(2, 'raumidee', { punkte: 50 })], jetzt: JETZT });
  assert.ok(ohne.get(1) < ohne.get(2));
  const mit = plane({ offen: [b(1, 'produkt_woche', { punkte: 60 }), b(2, 'raumidee', { punkte: 50 })], jetzt: JETZT, lernstand: { typ: { raumidee: { faktor: 9 }, produkt_woche: { faktor: 0.1 } } } });
  assert.ok(mit.get(2) < mit.get(1), 'raumidee 50*1.25 schlaegt produkt_woche 60*0.8');
});
