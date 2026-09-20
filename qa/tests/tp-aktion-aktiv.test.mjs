// S-08/S-09: snippets/tp-aktion-aktiv.liquid ist die einzige Quelle der Frage
// "laeuft eine Preisaktion?". Daran haengt eine Geschaeftsregel (Aktionspreis ist
// nicht mit dem kostenlosen Vor-Ort-Service kombinierbar) - die Tagesgrenzen muessen
// deshalb stimmen. Rendert das echte Snippet mit LiquidJS, kein Netzwerk.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
let source = readFileSync(path.join(root, 'snippets/tp-aktion-aktiv.liquid'), 'utf8');
source = source.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');

const engine = new Liquid();
const tag = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const produkt = (start, ende) => ({
  metafields: { aktion: { start: { value: start }, ende: { value: ende } } },
});
const aktiv = async (start, ende) =>
  (await engine.parseAndRender(source, { product: produkt(start, ende) })).trim();

test('ohne Startdatum gibt es keine Aktion', async () => {
  assert.equal(await aktiv(null, null), '');
  assert.equal(await aktiv(null, tag(5)), '');
});
test('Start heute, kein Ende: aktiv', async () => assert.equal(await aktiv(tag(0), null), 'ja'));
test('Start gestern, Ende morgen: aktiv', async () => assert.equal(await aktiv(tag(-1), tag(1)), 'ja'));
test('Ende heute zaehlt noch mit', async () => assert.equal(await aktiv(tag(-7), tag(0)), 'ja'));
test('Start morgen: noch nicht aktiv', async () => assert.equal(await aktiv(tag(1), tag(9)), ''));
test('Ende gestern: nicht mehr aktiv', async () => assert.equal(await aktiv(tag(-9), tag(-1)), ''));
test('Produkt ganz ohne aktion-Metafelder', async () => {
  assert.equal((await engine.parseAndRender(source, { product: { metafields: {} } })).trim(), '');
});
