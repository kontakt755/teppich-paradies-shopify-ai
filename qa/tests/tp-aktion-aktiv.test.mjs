// S-08/S-09: snippets/tp-aktion-aktiv.liquid ist die einzige Quelle der Frage
// "laeuft eine Preisaktion?". Daran haengt eine Geschaeftsregel (Aktionspreis ist
// nicht mit dem kostenlosen Vor-Ort-Service kombinierbar) - die Tagesgrenzen muessen
// deshalb stimmen. Rendert das echte Snippet mit LiquidJS, kein Netzwerk.
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
let source = readFileSync(path.join(root, 'snippets/tp-aktion-aktiv.liquid'), 'utf8');
source = source.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');

// ISO-Fixtures und LiquidJS verwenden denselben UTC-Kalendertag.
beforeEach((t) => t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-09T22:30:00Z') }));
const engine = new Liquid({ timezoneOffset: 0 });
const tag = (offset) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
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

test('UTC-Fixtures bleiben an Berliner Mitternacht gleich und wechseln erst an UTC-Mitternacht', async (t) => {
  for (const zeit of ['2026-10-09T21:59:59Z', '2026-10-09T22:00:00Z', '2026-10-09T23:59:59.999Z']) {
    t.mock.timers.setTime(Date.parse(zeit));
    assert.equal(await aktiv('2026-10-01', '2026-10-09'), 'ja', zeit);
    assert.equal(await aktiv('2026-10-10', null), '', zeit);
  }
  t.mock.timers.setTime(Date.parse('2026-10-10T00:00:00Z'));
  assert.equal(await aktiv('2026-10-01', '2026-10-09'), '');
  assert.equal(await aktiv('2026-10-10', null), 'ja');
});

test('UTC-Tagesoffset bleibt beim Berliner Winterzeitwechsel ein Kalendertag', (t) => {
  t.mock.timers.setTime(Date.parse('2026-10-24T23:30:00Z'));
  assert.equal(tag(0), '2026-10-24');
  assert.equal(tag(1), '2026-10-25');
  assert.equal(tag(-1), '2026-10-23');
});
