// Teppich nach Mass: Querverweis auf JAB, Vorwerk und Sisal mit Bordüre
// (Rundgang 2026-10-26). Die Markenware bleibt wegen des Renderlimits in eigenen
// Kollektionen; der Link nimmt das Mass mit, die Zielkollektion gibt es an die
// Produktseite weiter (Konfigurator liest ?breite=&laenge=).
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lies = (datei) => readFileSync(path.join(root, datei), 'utf8');
const ohneDoc = (code) => code.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const ohneStylesheet = (code) => code.replace(/{%-?\s*stylesheet\s*-?%}[\s\S]*?{%-?\s*endstylesheet\s*-?%}/g, '');

const engine = new Liquid();
const snippet = ohneStylesheet(ohneDoc(lies('snippets/tp-mass-querverweise.liquid')));
const coll = (handle, count = 5) => ({ handle, url: `/collections/${handle}`, products_count: count });

test('Querverweis zeigt JAB, Vorwerk und Sisal mit Bordüre mit Grundadresse fuer den Rechner', async () => {
  const collections = {
    'jab-anstoetz-teppiche-nach-mass': coll('jab-anstoetz-teppiche-nach-mass'),
    'vorwerk-teppiche-nach-mass': coll('vorwerk-teppiche-nach-mass'),
    'sisal-kokos-teppiche-nach-mass': coll('sisal-kokos-teppiche-nach-mass'),
  };
  const html = await engine.parseAndRender(snippet, { collections });
  assert.match(html, /Auch in Ihrem Maß:/);
  for (const [handle, text] of [['jab-anstoetz-teppiche-nach-mass', 'JAB'], ['vorwerk-teppiche-nach-mass', 'Vorwerk'], ['sisal-kokos-teppiche-nach-mass', 'Sisal mit Bordüre']]) {
    assert.ok(html.includes(`<a href="/collections/${handle}" data-tp-mass-link="/collections/${handle}">${text}</a>`), handle);
  }
});

test('Querverweis laesst leere oder fehlende Kollektionen aus und entfaellt ganz ohne Ziel', async () => {
  const teil = await engine.parseAndRender(snippet, { collections: { 'vorwerk-teppiche-nach-mass': coll('vorwerk-teppiche-nach-mass'), 'jab-anstoetz-teppiche-nach-mass': coll('jab-anstoetz-teppiche-nach-mass', 0) } });
  assert.match(teil, /Vorwerk/);
  assert.doesNotMatch(teil, /JAB|Sisal|·/);
  assert.equal((await engine.parseAndRender(snippet, { collections: {} })).trim(), '');
});

test('Querverweis steht unter dem Rechnerergebnis und in der Gruppe Natur', () => {
  const hero = lies('sections/tp-teppiche-hero.liquid');
  const ergebnis = hero.slice(hero.indexOf('data-tp-rechner-ergebnis'));
  assert.match(ergebnis.slice(0, ergebnis.indexOf('</div>\n    {%- comment -%} Daten')), /render 'tp-mass-querverweise'/);
  assert.match(lies('sections/tp-zubehoer-produkte.liquid'), /if tp_tg_filter == 'natur' -%}\s*{%- render 'tp-mass-querverweise'/);
  assert.match(lies('sections/main-collection.liquid'), /collection\.handle contains 'nach-mass'[^%]*-%}\s*{%- render 'tp-mass-weitergabe'/);
});

function weitergabe(search) {
  const code = lies('snippets/tp-mass-weitergabe.liquid').split('{% javascript %}')[1].split('{% endjavascript %}')[0];
  let klick = null;
  class Element {
    constructor(attrs = {}) { this.attrs = attrs; this.href = attrs.href; this.kinder = []; }
    closest(sel) { return this.nah?.[sel] ?? null; }
    querySelectorAll() { return this.kinder; }
  }
  const document = {
    readyState: 'complete',
    querySelector: (sel) => (sel === '[data-tp-mass-weitergabe]' ? {} : null),
    addEventListener: (typ, fn, capture) => { if (typ === 'click') { assert.equal(capture, true); klick = fn; } },
  };
  const location = new URL('https://shop.example/collections/jab-anstoetz-teppiche-nach-mass' + search);
  vm.runInNewContext(code, { document, window: { location }, URL, URLSearchParams, Element, Array });
  return { klick: () => klick, Element };
}

test('Weitergabe: Produktlinks der Zielkollektion bekommen das Mass, auch neben dem Link geklickt', () => {
  const w = weitergabe('?breite=200&laenge=300');
  const titel = new w.Element({ href: 'https://shop.example/products/alpaca?variant=7' });
  const bild = new w.Element({ href: 'https://shop.example/products/alpaca' });
  const karte = new w.Element(); karte.kinder = [titel, bild];
  const ziel = new w.Element(); ziel.nah = { 'a[href*="/products/"]': null, 'product-card': karte };
  w.klick()({ target: ziel });
  assert.equal(titel.href, 'https://shop.example/products/alpaca?variant=7&breite=200&laenge=300');
  assert.equal(bild.href, 'https://shop.example/products/alpaca?breite=200&laenge=300');
  const fremd = new w.Element({ href: 'https://andere.example/products/x' });
  const t2 = new w.Element(); t2.nah = { 'a[href*="/products/"]': fremd };
  w.klick()({ target: t2 });
  assert.equal(fremd.href, 'https://andere.example/products/x');
});

test('Weitergabe: ohne gueltiges Mass in der Adresse kein Eingriff', () => {
  for (const search of ['', '?breite=200', '?breite=abc&laenge=300', '?breite=200&laenge=30000']) {
    assert.equal(weitergabe(search).klick(), null, search);
  }
});
