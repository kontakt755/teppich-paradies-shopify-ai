import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Zuletzt angesehen (Werkbank w-025): Section in einer eigenen Section-Gruppe,
// Skript liest nur die vorhandene Verlaufsliste des Themes. Geprueft wird die
// Verdrahtung (Gruppe, Layout, Schema, Kartenblock) und die reine Logik des
// Skripts; das Rendern selbst prueft Puppeteer gegen ein Development-Theme.

const root = path.resolve(import.meta.dirname, '../..');
const lies = (datei) => fs.readFileSync(path.join(root, datei), 'utf8');
const ohneKopf = (json) => JSON.parse(json.replace(/\/\*[\s\S]*?\*\//g, ''));

const sectionQuelle = lies('sections/tp-zuletzt-angesehen.liquid');
const jsQuelle = lies('assets/tp-zuletzt-angesehen.js');
const gruppe = ohneKopf(lies('sections/tp-zuletzt-group.json'));
const schema = JSON.parse(sectionQuelle.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/)[1]);

// Das Skript ist ein Theme-Modul: Die Importmap-Adresse und die Browser-Klassen
// gibt es in Node nicht. Der Import wird gegen den Verlauf des Themes getauscht,
// die Browser-Klassen sind Attrappen - getestet werden nur die reinen Funktionen.
globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { get: () => undefined, define: () => undefined };
const js = await import(
  `data:text/javascript;base64,${Buffer.from(
    jsQuelle.replace(
      "import { RecentlyViewed } from '@theme/recently-viewed-products';",
      'const RecentlyViewed = { getProducts: () => [] };'
    )
  ).toString('base64')}`
);

test('A: Verlauf ohne das aktuelle Produkt, neueste zuerst, hoechstens vier', () => {
  assert.deepEqual(js.verlaufsIds(['4', '3', '2', '1'], '4', 4), ['3', '2', '1']);
  assert.deepEqual(js.verlaufsIds(['4', '3', '2', '1'], '', 4), ['4', '3', '2', '1']);
  assert.deepEqual(js.verlaufsIds(['4', '3', '2', '1'], '', 2), ['4', '3']);
});

test('B: Obergrenze ist die des Theme-Speichers, auch bei groesserer Einstellung', () => {
  assert.equal(js.MAX_GESPEICHERT, 4);
  assert.equal(js.verlaufsIds(['1', '2', '3', '4', '5', '6'], '', 9).length, 4);
  assert.equal(js.verlaufsIds(['1', '2', '3'], '', 0).length, 3, 'ohne gueltige Einstellung gilt die Grenze des Speichers');
});

test('C: Unbrauchbares im Speicher fuehrt zu keiner Anzeige statt zu einem Fehler', () => {
  assert.deepEqual(js.verlaufsIds(null, '', 4), []);
  assert.deepEqual(js.verlaufsIds('{kaputt', '', 4), []);
  assert.deepEqual(js.verlaufsIds({}, '', 4), []);
  assert.deepEqual(js.verlaufsIds([], '', 4), []);
  assert.deepEqual(js.verlaufsIds(['abc', '', '12a', null, '7', '7', 8], '', 4), ['7', '8'], 'nur reine Ziffern, ohne Doppelte; Zahlen werden angenommen');
});

test('D: Suchparameter fliegen aus Links, der Rest bleibt', () => {
  const herkunft = 'https://www.teppich-paradies.net';
  assert.equal(
    js.linkOhneSuchParameter('/products/x?variant=1&_pos=2&_sid=abc&_ss=r', herkunft),
    '/products/x?variant=1'
  );
  assert.equal(js.linkOhneSuchParameter('/products/x?_pos=1&_sid=a&_ss=r', herkunft), '/products/x');
  assert.equal(js.linkOhneSuchParameter('/products/x#bewertungen', herkunft), '/products/x#bewertungen');
  assert.equal(js.linkOhneSuchParameter('https://www.teppich-paradies.net/products/x?a=1', herkunft), '/products/x?a=1');
});

test('E: Das Skript liest den Speicher nur - keine zweite Ablage, kein Schreiben', () => {
  const code = jsQuelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(code, /from '@theme\/recently-viewed-products'/);
  assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|document\.cookie/, 'kein eigener Speicher');
  assert.doesNotMatch(code, /addProduct|clearProducts/, 'der Verlauf wird nur gelesen');
  assert.match(code, /RecentlyViewed\.getProducts\(\)/);
});

test('F: Keine eigene Karten- oder Preislogik im Skript', () => {
  const code = jsQuelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /price|preis|money|toFixed|Intl\.NumberFormat/i);
});

test('G: Section bringt ein Schema mit presets und nur bekannte Schluessel', () => {
  assert.ok(Array.isArray(schema.presets) && schema.presets.length > 0, 'presets fehlen');
  assert.ok(schema.presets[0].name);
  const bekannt = new Set(['name', 'tag', 'class', 'settings', 'blocks', 'max_blocks', 'presets', 'enabled_on', 'disabled_on', 'limit', 'default', 'locales', 'templates']);
  for (const schluessel of Object.keys(schema)) assert.ok(bekannt.has(schluessel), `unbekannter Schema-Schluessel ${schluessel}`);
});

test('H: Gruppe verweist auf die Section und definiert den statischen Kartenblock', () => {
  assert.match(gruppe.type, /^custom\.[a-z_]+$/, 'Gruppentyp: custom. plus Kleinbuchstaben und Unterstriche');
  assert.deepEqual(gruppe.order, Object.keys(gruppe.sections));
  const [eintrag] = Object.values(gruppe.sections);
  assert.equal(eintrag.type, 'tp-zuletzt-angesehen');
  assert.ok(fs.existsSync(path.join(root, `sections/${eintrag.type}.liquid`)));

  const id = sectionQuelle.match(/content_for 'block', type: '_product-card', id: '([^']+)'/)?.[1];
  assert.ok(id, 'die Section rendert die Karte ueber einen statischen _product-card-Block');
  const karte = eintrag.blocks[id];
  assert.ok(karte, `Block "${id}" fehlt in der Gruppe - ohne ihn rendert die Karte leer`);
  assert.equal(karte.type, '_product-card');
  assert.equal(karte.static, true);
  assert.deepEqual(karte.block_order, Object.keys(karte.blocks));
});

test('I: Jeder Block der Karte hat eine Datei (Shopify lehnt sonst den ganzen Push ab)', () => {
  const [eintrag] = Object.values(gruppe.sections);
  const karte = Object.values(eintrag.blocks)[0];
  for (const block of Object.values(karte.blocks)) {
    if (block.type.startsWith('_') && !fs.existsSync(path.join(root, `blocks/${block.type}.liquid`))) continue; // Horizon-eigener Baustein
    assert.ok(fs.existsSync(path.join(root, `blocks/${block.type}.liquid`)), `blocks/${block.type}.liquid fehlt`);
  }
  const typen = Object.values(karte.blocks).map((b) => b.type);
  assert.ok(typen.includes('tp-card-title'), 'Titelkuerzung: tp-card-title');
  assert.ok(typen.includes('price'), 'Preis ueber den price-Block');
  assert.ok(!typen.includes('swatches'), 'swatches duerfen in keiner Karte stecken (template:guard)');
});

test('J: Layout bindet die Gruppe zwischen Inhalt und Footer ein, nicht in main', () => {
  const layout = lies('layout/theme.liquid');
  const ende = layout.indexOf('</main>');
  const gruppeStelle = layout.indexOf("{% sections 'tp-zuletzt-group' %}");
  const footer = layout.indexOf('<footer>');
  assert.ok(ende > 0 && gruppeStelle > ende && gruppeStelle < footer, 'Reihenfolge: </main>, Gruppe, <footer>');
});

test('K: Huelle nur auf Produkt- und Kollektionsseiten, versteckt bis Karten da sind', () => {
  assert.match(sectionQuelle, /tp_za_seite == 'product' or tp_za_seite == 'collection'/);
  const huelle = sectionQuelle.match(/<tp-zuletzt-angesehen[\s\S]*?>/)[0];
  assert.match(huelle, /\shidden\s/, 'ohne Verlauf bleibt der Abschnitt unsichtbar: kein Leerraum');
  assert.match(sectionQuelle, /tp-zuletzt-angesehen\[hidden\]\s*\{\s*display:\s*none/, 'hidden verliert sonst gegen display: block');
  assert.match(sectionQuelle, /<h2[\s\S]*?<ul class="tp-za__liste">/, 'Ueberschrift und Liste als <ul>');
});

test('L: Die Karten-Betriebsart bleibt auf der Suchseite versteckt', () => {
  const karten = sectionQuelle.match(/<ul\s+data-tp-za-karten[\s\S]*?>/)[0];
  assert.match(karten, /\shidden\s*>/, 'echte Suchseite: Liste nie sichtbar');
  assert.match(sectionQuelle, /search\.terms contains 'id:'/);
});

test('M: Skript wird nur dort geladen, wo die Huelle steht', () => {
  const huelle = sectionQuelle.slice(0, sectionQuelle.indexOf("{%- elsif tp_za_karten_modus -%}"));
  assert.match(huelle, /tp-zuletzt-angesehen\.js/);
  const rest = sectionQuelle.slice(sectionQuelle.indexOf("{%- elsif tp_za_karten_modus -%}"));
  assert.doesNotMatch(rest.split('{% stylesheet %}')[0], /tp-zuletzt-angesehen\.js/);
});

test('N: Sektions-CSS haengt am eigenen Element, nicht an allgemeinen Selektoren', () => {
  const css = sectionQuelle.match(/\{% stylesheet %\}([\s\S]*?)\{% endstylesheet %\}/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
  for (const regel of css.split('{').slice(0, -1).map((teil) => teil.split('}').pop().trim()).filter(Boolean)) {
    for (const selektor of regel.split(',').map((s) => s.trim())) {
      if (selektor.startsWith('@')) continue;
      assert.match(selektor, /tp-zuletzt-angesehen|\.tp-za/, `Selektor "${selektor}" gilt seitenweit`);
    }
  }
});
