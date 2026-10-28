// Ausverkaufte Produkte (keine Variante kaufbar) zeigen keine Lieferzeit und
// kein voraussichtliches Lieferdatum (Fehlersuche 2026-10-28: zwei Wohnteppiche
// mit allen Groessen "ausverkauft" versprachen "Lieferung voraussichtlich ...").
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = path.resolve(import.meta.dirname, '../..');
const engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });
for (const tag of ['doc', 'stylesheet']) engine.registerTag(tag, {
  parse(token, tokens) { while (tokens.length && tokens.shift().name !== `end${tag}`) {} },
  render() { return ''; },
});
engine.registerFilter('asset_url', name => `/cdn/${name}`);

const produkt = (available, tags = []) => ({ available, tags, metafields: { service: { lieferzeit: { value: '' } } } });
const lieferzeit = (p, kontext) => engine.parseAndRender(
  "{% render 'tp-lieferzeit', text: '2–5 Werktage', product: p, kontext: k %}",
  { p, k: kontext },
  { globals: { settings: { tp_lieferdatum_annahmeschluss: '14:00', tp_lieferzeit_sonderposten: '5–7 Werktage' } } },
);

for (const kontext of ['produkt', 'rechner', 'mass']) {
  test(`kaufbar (${kontext}): Lieferzeit mit Datum`, async () => {
    const html = await lieferzeit(produkt(true), kontext);
    assert.match(html, /data-tp-lieferdatum/);
    assert.match(html, /tp-lieferdatum\.js/);
  });

  test(`ausverkauft (${kontext}): keine Zeile, kein Datum`, async () => {
    const html = (await lieferzeit(produkt(false), kontext)).trim();
    assert.equal(html, '');
  });
}

test('ausverkauft schlaegt auch eine produktspezifische Lieferzeit', async () => {
  const p = produkt(false);
  p.metafields.service.lieferzeit.value = 'ca. 5–8 Werktage inkl. Ketteln';
  assert.equal((await lieferzeit(p, 'produkt')).trim(), '');
});
