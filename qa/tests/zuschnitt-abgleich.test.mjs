import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Zuschnittangaben (Codex-Befund 2026-09-16, P1): Die Warenkorbattribute
// "Zuschnitt ..." wurden nur angehaengt - entfernte oder neu konfigurierte
// Teppiche hinterliessen ihre Angabe auf dem Lieferschein. Jetzt ist die
// Zeile die Quelle (_Zuschnitt + _Gruppe), die Attribute sind ihr Abbild.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { sollAttribute } = require(join(root, 'assets', 'tp-zuschnitt-abgleich.js'));
const lies = (...p) => readFileSync(join(root, ...p), 'utf8');

const zeile = (gruppe, text, extra = {}) => ({ properties: { _Gruppe: gruppe, _Zuschnitt: text, ...extra } });
const kante = (gruppe) => ({ properties: { _Gruppe: gruppe, 'Zu Teppich': 'X', 'Kante umlaufend': '8 m' } });

test('Hinzufuegen: neue Zeile bekommt ihr Attribut', () => {
  const plan = sollAttribute({ items: [zeile('Ka', 'Teppich A · 200 × 300 cm'), kante('Ka')], attributes: {} });
  assert.equal(plan.noetig, true);
  assert.deepEqual(plan.aenderung, { 'Zuschnitt Ka': 'Teppich A · 200 × 300 cm' });
});

test('Entfernen: Attribut der fehlenden Zeile wird geloescht', () => {
  const plan = sollAttribute({
    items: [zeile('Kb', 'B')],
    attributes: { 'Zuschnitt Ka': 'A', 'Zuschnitt Kb': 'B', Sonstiges: 'bleibt' },
  });
  assert.deepEqual(plan.aenderung, { 'Zuschnitt Ka': '' });
});

test('Warenkorb leer: alle Zuschnitt-Attribute weg, auch alte "Zuschnitt N"', () => {
  const plan = sollAttribute({ items: [], attributes: { 'Zuschnitt 1': 'alt', 'Zuschnitt 2': 'alt' } });
  assert.deepEqual(plan.aenderung, { 'Zuschnitt 1': '', 'Zuschnitt 2': '' });
});

test('Neukonfiguration: alte Gruppe raus, neue rein', () => {
  const plan = sollAttribute({ items: [zeile('Kneu', '250 × 350 cm')], attributes: { 'Zuschnitt Kalt': '200 × 300 cm' } });
  assert.deepEqual(plan.aenderung, { 'Zuschnitt Kneu': '250 × 350 cm', 'Zuschnitt Kalt': '' });
});

test('Geaenderter Text derselben Gruppe wird ueberschrieben', () => {
  const plan = sollAttribute({ items: [zeile('Ka', 'neu')], attributes: { 'Zuschnitt Ka': 'alt' } });
  assert.deepEqual(plan.aenderung, { 'Zuschnitt Ka': 'neu' });
});

test('Stimmt alles, wird nichts geschrieben', () => {
  const plan = sollAttribute({ items: [zeile('Ka', 'A'), kante('Ka')], attributes: { 'Zuschnitt Ka': 'A', 'Zuschnitt Kx': '' } });
  assert.equal(plan.noetig, false);
});

test('Konfigurator schreibt Gruppe und Zuschnitt an jede Zeile und wartet den Abgleich ab', () => {
  const js = lies('assets', 'tp-einfass-konfigurator.js');
  assert.doesNotMatch(js, /zuschnittNotieren|\.catch\(function \(\) \{\}\)/, 'kein stilles Verwerfen mehr');
  assert.match(js, /p\['_Gruppe'\] = gruppe;\s*\n\s*p\['_Zuschnitt'\] = zuschnittText\(p\);/);
  // Der Warenkorb (cart:update, Drawer) geht erst nach dem Abgleich auf.
  const nachAdd = js.slice(js.indexOf("fetch('/cart/add.js'"));
  assert.ok(nachAdd.indexOf('zuschnittAbgleichen()') < nachAdd.indexOf("new CustomEvent('cart:update'"));
  assert.ok(nachAdd.indexOf('zuschnittAbgleichen()') < nachAdd.indexOf('drawer.open()'));
});

test('Abgleich prueft den zurueckgegebenen Warenkorb gegen', () => {
  const js = lies('assets', 'tp-zuschnitt-abgleich.js');
  assert.match(js, /if \(sollAttribute\(neu\)\.noetig\) throw/);
  assert.match(js, /if \(!r\.ok\) throw/);
});

test('Sofortiger Checkout: Liquid sperrt bei fehlendem, abweichendem oder veraltetem Attribut', () => {
  const s = lies('snippets', 'tp-cart-gruppe.liquid');
  assert.match(s, /cart\.attributes\[tp_gz_zs_key\] != tp_gz_zs_text/);
  assert.match(s, /unless tp_gz_zs_soll contains tp_gz_attr_such\s*\n\s*assign tp_gz_zs_offen = true/);
  assert.match(s, /elsif tp_gz_zs_offen\s*\n\s*assign tp_gz_gesperrt = true/);
  assert.match(s, /data-tp-zuschnitt-abgleich/);
});

test('Abgleich-Skript ist in Warenkorb und Konfigurator eingebunden', () => {
  assert.match(lies('snippets', 'cart-products.liquid'), /'tp-zuschnitt-abgleich\.js' \| asset_url/);
  assert.match(lies('blocks', 'tp-einfass-konfigurator.liquid'), /'tp-zuschnitt-abgleich\.js' \| asset_url/);
});
