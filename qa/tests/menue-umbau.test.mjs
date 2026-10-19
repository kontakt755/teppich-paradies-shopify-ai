// Hauptmenue-Umbau (w-094): menuUpdate ersetzt den ganzen Baum. Das Skript muss
// jede bestehende MenuItem-ID wieder einsetzen und bei Luecken abbrechen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { umbauen, alsEingabe, idMenge, pruefen } from '../../scripts/menue-umbau.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lesen = (p) => JSON.parse(readFileSync(root + p, 'utf8'));
const alt = lesen('docs/weiterentwicklung/sicherung/2026-10-15-hauptmenue.json');
const plan = lesen('domains/shopify/menue-umbau-2026-10.json');

const flach = (items, out = []) => {
  for (const i of items) {
    out.push(i);
    flach(i.items ?? [], out);
  }
  return out;
};

test('Plan 2026-10 behaelt alle bestehenden IDs genau einmal', () => {
  const neu = umbauen(alt, plan);
  const ids = flach(neu.items).map((i) => i.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, 'keine ID doppelt');
  assert.deepEqual(new Set(ids), idMenge(alt));
});

test('Plan 2026-10: neun Hauptpunkte in der freigegebenen Reihenfolge', () => {
  const neu = umbauen(alt, plan);
  assert.deepEqual(neu.items.map((i) => i.title), [
    'Teppichboden', 'Teppiche', 'Teppichfliesen', 'Vinylboden', 'Laminat & Parkett',
    'Linoleum & Kautschuk', 'Zubehör & Leisten', 'Angebote & Reste', 'Service & Verlegung',
  ]);
});

test('Teppichboden: alle Arten bleiben, Spalten Farbe/Raum/Rollenbreite kommen dazu', () => {
  const tb = umbauen(alt, plan).items[0];
  const titel = tb.items.map((i) => i.title);
  const altTitel = alt.items[0].items.map((i) => i.title);
  assert.deepEqual(titel.slice(0, altTitel.length), altTitel);
  assert.deepEqual(titel.slice(altTitel.length), ['Farbe', 'Raum', 'Rollenbreite']);
  for (const gruppe of tb.items.slice(altTitel.length)) {
    assert.equal(gruppe.url, '#');
    assert.ok(gruppe.items.length > 0);
    for (const l of gruppe.items) assert.match(l.url, /^\/collections\/teppichboden\?filter\./);
  }
});

test('Kein Sortiment verschwindet: jede bisherige Ziel-URL ist erreichbar', () => {
  const neu = umbauen(alt, plan);
  const ziele = new Set(flach(neu.items).map((i) => i.url));
  for (const i of flach(alt.items)) assert.ok(ziele.has(i.url), `fehlt: ${i.title} ${i.url}`);
});

test('Eingabe fuer menuUpdate traegt IDs, fuer menuCreate keine', () => {
  const neu = umbauen(alt, plan);
  const update = flach(alsEingabe(neu.items, { mitIds: true }));
  const create = flach(alsEingabe(neu.items, { mitIds: false }));
  assert.equal(update.filter((i) => i.id).length, idMenge(alt).size);
  assert.equal(create.filter((i) => i.id).length, 0);
  assert.ok(create.every((i) => i.title && i.type));
});

test('Fehlt ein bestehender Hauptpunkt im Plan, bricht der Umbau ab', () => {
  const kaputt = structuredClone(plan);
  kaputt.oben = kaputt.oben.filter((e) => e.id !== 'gid://shopify/MenuItem/871684145486');
  assert.throws(() => umbauen(alt, kaputt), /fehlen 7 bestehende Punkte/);
});

test('Doppelt genannte ID bricht ab', () => {
  const kaputt = structuredClone(plan);
  kaputt.oben.push({ id: 'gid://shopify/MenuItem/871684145486' });
  assert.throws(() => umbauen(alt, kaputt), /Doppelt/);
});

test('Gegenprobe erkennt verlorene Punkte', () => {
  const neu = umbauen(alt, plan);
  const anzahlNeu = flach(neu.items).length - idMenge(alt).size;
  assert.equal(pruefen(alt, neu, anzahlNeu).ok, true);
  const verloren = structuredClone(neu);
  verloren.items[1].items.pop();
  const r = pruefen(alt, verloren, anzahlNeu);
  assert.equal(r.ok, false);
  assert.equal(r.verloren.length, 1);
});

test('Plan 2026-10-19: "Vorwerk & JAB nach Maß" wird zu zwei Punkten, alle IDs bleiben', () => {
  const alt19 = lesen('docs/weiterentwicklung/sicherung/2026-10-19-hauptmenue.json').menu;
  const plan19 = lesen('domains/shopify/menue-marken-nach-mass-2026-10-19.json');
  const neu = umbauen(alt19, plan19);
  assert.deepEqual(new Set(flach(neu.items).map((i) => i.id).filter(Boolean)), idMenge(alt19));
  const teppiche = neu.items[1].items;
  const vorwerk = teppiche.find((i) => i.id === 'gid://shopify/MenuItem/887163814222');
  assert.equal(vorwerk.title, 'Vorwerk nach Maß');
  assert.equal(vorwerk.resourceId, 'gid://shopify/Collection/707349152078');
  const jab = teppiche.find((i) => i.title === 'JAB Anstoetz nach Maß');
  assert.ok(jab && !jab.id);
  assert.equal(teppiche.indexOf(jab), teppiche.indexOf(vorwerk) + 1);
  const eingabe = alsEingabe(neu.items, { mitIds: true })[1].items.find((i) => i.id === vorwerk.id);
  assert.equal(eingabe.url, undefined, 'altes Ziel darf nicht mitgeschickt werden');
});
