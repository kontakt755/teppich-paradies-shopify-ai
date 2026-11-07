import test from 'node:test';
import assert from 'node:assert/strict';
import { DRUCK_LIMIT, neueKennung, druckVorschau, druckBloecke, motivSchluessel, setzeMotivAnzahl } from '../lib/druckliste.mjs';

const etikett = i => ({ serie: `Testserie ${i}`, farbe: 'Sand', sku: `TEST-${i}`, url: `https://www.teppich-paradies.net/products/test-${i}`, technik: [], fehlt: [] });

test('Vorschau begrenzt den Speicher und nennt trotzdem alle Motive und Kopien', () => {
  const alle = Array.from({ length: 5000 }, (_, i) => etikett(Math.floor(i / 400)));
  const v = druckVorschau(alle);
  assert.equal(v.motive, 13);
  assert.equal(v.eintraege.length, DRUCK_LIMIT.vorschau);
  assert.equal(v.eintraege[0].anzahl, 400);
  assert.equal(v.eintraege[1].index, 400);
  assert.equal(alle.length, 5000);
});

test('Transportbloecke drucken jedes Etikett samt Kopien in unveraenderter Reihenfolge', () => {
  for (const anzahl of [1, 99, 100, 101, 5000]) {
    const es = Array.from({ length: anzahl }, (_, i) => etikett(i));
    const bloecke = [...druckBloecke(es)];
    assert.equal(bloecke.length, Math.ceil(anzahl / 100));
    assert(bloecke.every(b => b.etiketten.length <= 100));
    assert.deepEqual(bloecke.flatMap(b => b.etiketten), es);
    assert(bloecke.every((b, i) => b.start === i * 100));
  }
});

test('HTTP-Netzmodus erzeugt sichere UUIDs auch ohne crypto.randomUUID', () => {
  const id = neueKennung({ getRandomValues: b => { b.fill(255); return b; } });
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(neueKennung({ randomUUID: () => 'bereit' }), 'bereit');
  assert.throws(() => neueKennung({}), /sichere Vorgangskennung/);
});

test('Stueckzahl: Kopien bleiben am Platz, andere Motive unveraendert', () => {
  const a = etikett(1), b = etikett(2);
  const mehr = setzeMotivAnzahl([a, b], motivSchluessel(a), 9);
  assert.equal(mehr.length, 10);
  assert.deepEqual(mehr.slice(0, 9).map(e => e.sku), Array(9).fill(a.sku));
  assert.equal(mehr[9].sku, b.sku);
  assert.equal(druckVorschau(mehr).eintraege[0].anzahl, 9);
  const weniger = setzeMotivAnzahl(mehr, motivSchluessel(a), 2);
  assert.deepEqual(weniger.map(e => e.sku), [a.sku, a.sku, b.sku]);
});

test('Stueckzahl: ungueltige Werte und fremde Motive aendern nichts, Obergrenze gilt', () => {
  const a = etikett(1), b = etikett(2), liste = [a, b];
  for (const wert of [0, -1, 1.5, NaN]) assert.equal(setzeMotivAnzahl(liste, motivSchluessel(a), wert), liste);
  assert.equal(setzeMotivAnzahl(liste, 'gibt es nicht', 3), liste);
  assert.equal(setzeMotivAnzahl(liste, motivSchluessel(a), DRUCK_LIMIT.etiketten + 5).length, DRUCK_LIMIT.etiketten);
});

test('Stueckzahl nur bei Einzeldrucken: Sammeldruck und Bestaetigung behalten ihre Menge', async () => {
  const { readFile } = await import('node:fs/promises');
  const lies = d => readFile(new URL(`../${d}`, import.meta.url), 'utf8');
  const baustein = await lies('bausteine/etiketten-druck.mjs');
  assert.match(baustein, /druck\.mehrfach = mehrfach && !freierText && !beiBestaetigen/);
  assert.match(await lies('ansichten/kunden/muster-packen.mjs'), /allowEditing: false, mehrfach: true,\n\s+hinweis: `Gehört in/);
  assert.doesNotMatch(await lies('ansichten/muster-druckliste.mjs'), /mehrfach/);
  assert.doesNotMatch(await lies('ansichten/kunden/musteretiketten.mjs'), /mehrfach/);
});
