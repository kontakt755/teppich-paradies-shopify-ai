// Hauptmenue-Umbau (w-094): menuUpdate ersetzt den ganzen Baum. Das Skript muss
// jede bestehende MenuItem-ID wieder einsetzen und bei Luecken abbrechen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { umbauen, alsEingabe, idMenge, menueAus, pruefen } from '../../scripts/menue-umbau.mjs';

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

// Nr. 27 (03.11.2026): nur das Ziel von "Angebote & Reste" wechselt, ID und Unterpunkte bleiben.
for (const [datei, ziel] of [['menue-reste-bis-black-week-2026-11', 'gid://shopify/Collection/705477607758'], ['menue-black-week-2026-11', 'gid://shopify/Collection/705490485582']]) {
  test(`Plan ${datei}: nur der Hauptlink wechselt, keine ID geht verloren`, () => {
    const stand = lesen('docs/weiterentwicklung/sicherung/2026-10-19-hauptmenue.json');
    const neu = umbauen(stand, lesen(`domains/shopify/${datei}.json`));
    assert.deepEqual(new Set(flach(neu.items).map((i) => i.id)), idMenge(menueAus(stand)));
    const punkt = neu.items.find((i) => i.id === 'gid://shopify/MenuItem/887189668174');
    assert.equal(punkt.resourceId, ziel);
    assert.equal(punkt.type, 'COLLECTION');
    assert.equal(punkt.url, undefined);
    assert.ok(punkt.items.length >= 2, 'Unterpunkte bleiben');
    const andere = (m) => JSON.stringify(menueAus(m).items.filter((i) => i.id !== punkt.id).map((i) => [i.id, i.resourceId ?? i.url]));
    assert.equal(andere({ items: neu.items }), andere(stand));
  });
}

// Teppichboden-Menue 2026-11-04: vier klare Fragen (Art, Preisklasse, Raum, Marken),
// Farbe/Rollenbreite/Kurz- und Mittelflor fallen ausdruecklich weg.
const stand1104 = lesen('docs/weiterentwicklung/sicherung/2026-11-04-hauptmenue.json');
const plan1104 = lesen('domains/shopify/menue-teppichboden-2026-11.json');

test('Plan 2026-11-04: nur die ausdruecklich entfernten IDs fehlen, alle anderen bleiben genau einmal', () => {
  const neu = umbauen(stand1104, plan1104);
  const ids = flach(neu.items).map((i) => i.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  const entfernt = new Set(plan1104.entfernen.map((e) => e.id));
  assert.equal(entfernt.size, 19);
  assert.deepEqual(new Set(ids), new Set([...idMenge(menueAus(stand1104))].filter((id) => !entfernt.has(id))));
  assert.deepEqual(new Set(neu.entfernt), entfernt);
});

test('Plan 2026-11-04: Teppichboden zeigt Arten, dann Preisklasse, Raum, Marken', () => {
  const tb = umbauen(stand1104, plan1104).items[0];
  assert.deepEqual(tb.items.map((i) => i.title), [
    'Alle Teppichböden', 'Hochflor', 'Velours', 'Schlinge', 'Wolle', 'Sisal', 'Nadelfilz', 'Büro & Gewerbe', 'Kunstrasen',
    'Preisklasse', 'Raum', 'Marken',
  ]);
  const klickbar = flach(tb.items).filter((i) => i.url !== '#');
  assert.equal(klickbar.length, 20, 'vorher 33 Links');
  const marken = tb.items.find((i) => i.title === 'Marken');
  assert.deepEqual(marken.items.map((i) => [i.title, i.resourceId]), [
    ['Vorwerk', 'gid://shopify/Collection/705754497358'], ['JAB Anstoetz', 'gid://shopify/Collection/705754530126'],
  ]);
});

test('Plan 2026-11-04: Preisklassen-Links buendeln dieselben Filterbereiche wie die Kacheln', async () => {
  const { Liquid } = await import('liquidjs');
  const def = readFileSync(root + 'snippets/tp-preisklassen-def.liquid', 'utf8').replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/, '');
  const klassen = (await new Liquid().parseAndRender(def)).trim().split(';').map((k) => k.split('|'));
  const spalte = umbauen(stand1104, plan1104).items[0].items.find((i) => i.title === 'Preisklasse');
  assert.equal(spalte.url, '#');
  assert.equal(spalte.items.length, klassen.length);
  spalte.items.forEach((link, i) => {
    const [name, , werte] = klassen[i];
    assert.ok(link.title.startsWith(name), `${link.title} passt nicht zu ${name}`);
    const u = new URL(link.url, 'https://x.test');
    assert.equal(u.pathname, '/collections/teppichboden');
    assert.deepEqual(u.searchParams.getAll('filter.p.m.custom.meterpreis_bereich'), werte.split(','));
  });
});

test('Plan 2026-11-04: Auslauf Teppichboden zieht unter Angebote & Reste um', () => {
  const neu = umbauen(stand1104, plan1104);
  const reste = neu.items.find((i) => i.id === 'gid://shopify/MenuItem/887189668174');
  const auslauf = reste.items.find((i) => i.id === 'gid://shopify/MenuItem/884473921870');
  assert.equal(auslauf.title, 'Auslauf Teppichboden');
  assert.equal(auslauf.resourceId, 'gid://shopify/Collection/705205076302');
});

test('Entfernen ohne die Unterpunkte bricht ab', () => {
  const kaputt = structuredClone(plan1104);
  kaputt.entfernen = kaputt.entfernen.filter((e) => !e._titel.startsWith('Farbe ›'));
  assert.throws(() => umbauen(stand1104, kaputt), /Unterpunkt eines entfernten Punkts/);
});

test('Gegenprobe 2026-11-04: entfernte muessen fehlen, alle anderen bleiben', () => {
  const neu = umbauen(stand1104, plan1104);
  const anzahlNeu = flach(neu.items).length - (idMenge(menueAus(stand1104)).size - neu.entfernt.length);
  assert.equal(anzahlNeu, 7);
  assert.equal(pruefen(stand1104, neu, anzahlNeu, neu.entfernt).ok, true);
  const nochDa = structuredClone(neu);
  nochDa.items[0].items.push({ id: neu.entfernt[0], title: 'x', items: [] });
  const r = pruefen(stand1104, nochDa, anzahlNeu, neu.entfernt);
  assert.equal(r.ok, false);
  assert.equal(r.nochDa.length, 1);
});

test('Rueckweg 2026-11-04 legt entfernte Punkte ohne ID an', () => {
  const neu = umbauen(stand1104, plan1104);
  const zurueck = flach(alsEingabe(menueAus(stand1104).items, { mitIds: true, ohneIds: new Set(neu.entfernt) }));
  assert.equal(zurueck.length, 103);
  assert.equal(zurueck.filter((i) => !i.id).length, 19);
});
