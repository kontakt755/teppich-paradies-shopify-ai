import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Die Navigation steht als festes Markup in index.html (Seitenleiste am Rechner, untere
// Leiste am Handy). Eine neue Ansicht, die dort keinen Link bekommt, waere nur noch ueber
// die Suche erreichbar - das faellt im Alltag erst auf, wenn jemand sie sucht.

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(WURZEL, 'app.js'), 'utf8');
const router = fs.readFileSync(path.join(WURZEL, 'kern/router.mjs'), 'utf8');

const routen = [...app.match(/const VIEWS = \{([^}]+)\}/)[1].matchAll(/([a-z]+):\s*view/g)].map(m => m[1]);
const teil = (start, ende) => html.slice(html.indexOf(start), html.indexOf(ende, html.indexOf(start)));
const seitenleiste = teil('<aside class="side"', '</aside>');
const untereLeiste = teil('<nav class="tabbar', '</nav>');
const links = text => [...text.matchAll(/<a href="#\/([a-z]+)" data-nav="([a-z]+)"([^>]*)>/g)].map(m => ({ ziel: m[1], nav: m[2], rest: m[3] }));

// Ansichten ohne eigenen Menuepunkt - mit dem Ort, von dem aus sie verlinkt sind. "Fotos" hatte
// nie einen Eintrag (Stand 2026-10-12: 0) und wird ueber Social Media und die Suche erreicht.
const OHNE_MENUEPUNKT = { fotos: 'ansichten/social.mjs' };

test('jede Ansicht hat einen Punkt in der Seitenleiste', () => {
  const vorhanden = links(seitenleiste).map(l => l.nav);
  for (const r of routen) {
    if (OHNE_MENUEPUNKT[r]) {
      const quelle = fs.readFileSync(path.join(WURZEL, OHNE_MENUEPUNKT[r]), 'utf8');
      assert.ok(quelle.includes(`href="#/${r}"`), `Ansicht "${r}" ohne Menuepunkt muss in ${OHNE_MENUEPUNKT[r]} verlinkt sein`);
      assert.ok(!vorhanden.includes(r), `"${r}" steht wieder in der Seitenleiste - dann aus OHNE_MENUEPUNKT nehmen`);
      continue;
    }
    assert.ok(vorhanden.includes(r), `Ansicht "${r}" fehlt in der Seitenleiste (index.html)`);
  }
  for (const l of links(seitenleiste)) {
    assert.equal(l.ziel, l.nav, `Link #/${l.ziel} traegt data-nav="${l.nav}"`);
    assert.ok(routen.includes(l.nav), `Seitenleiste verlinkt "${l.nav}", die Ansicht gibt es nicht`);
  }
});

test('Inhaber-Ansichten sind in der Navigation als solche markiert', () => {
  const inhaber = [...router.match(/const ANSICHT_ROLLEN = \{([\s\S]*?)\};/)[1].matchAll(/([a-z]+):\s*'inhaber'/g)].map(m => m[1]);
  assert.ok(inhaber.length >= 6, 'ANSICHT_ROLLEN nicht gefunden');
  for (const l of links(seitenleiste)) {
    assert.equal(l.rest.includes('data-nur-inhaber'), inhaber.includes(l.nav), `"${l.nav}": data-nur-inhaber und ANSICHT_ROLLEN widersprechen sich`);
  }
});

test('Kunden bleibt in der Seitenleiste; Bestellungen und Packstation haben eigene direkte Einstiege', () => {
  assert.match(seitenleiste, /href="#\/kunden" data-nav="kunden"/);
  for (const text of [seitenleiste, untereLeiste]) {
    assert.match(text, /href="#\/kunden\?tab=bestellungen"[^>]*data-nav-tab="bestellungen"/);
    assert.match(text, /href="#\/kunden\?tab=muster"[^>]*data-nav-tab="muster"/);
  }
});

test('Weitere Dashboards: keine Adresse im Markup - die Links kommen vom Server', () => {
  assert.match(seitenleiste, /<div class="nav-gruppe-menu nav-dashboards" id="navDashboards" hidden><\/div>/);
  assert.ok(!/claude\.ai\/artifact|script\.google\.com/.test(html), 'keine Adresse von Werkbank oder Auftrags-App im oeffentlichen Repository');
});

test('untere Leiste am Handy: dieselben vier Arbeitswege und Mehr', () => {
  const direkt = [...untereLeiste.matchAll(/<a href="([^"]+)" data-nav="([^"]+)"([^>]*)>/g)];
  assert.deepEqual(direkt.map(m => m[2]), ['heute', 'einkauf', 'kunden', 'kunden']);
  assert.ok(direkt.every(m => !m[3].includes('data-nur-inhaber')));
  assert.match(direkt[1][1], /tab=lieferant&amp;art=muster&amp;af=offen/);
  assert.match(untereLeiste, /Muster bestellen/);
  // Diese vier duerfen keinem vorenthalten sein - sonst stuende am Handy ein toter Punkt.
  for (const l of links(untereLeiste)) assert.ok(!l.rest.includes('data-nur-inhaber'), `"${l.nav}" in der unteren Leiste ist dem Inhaber vorbehalten`);
  assert.match(untereLeiste, /<button type="button" id="navToggle"[^>]*aria-controls="side"/, '"Mehr" muss die Seitenleiste als Blatt oeffnen');
});

test('Seite nutzt die Safe-Area und folgt ohne eigene Wahl dem Geraet', () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /prefers-color-scheme/);
  const css = fs.readFileSync(path.join(WURZEL, 'app.css'), 'utf8');
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});


test('vier Hauptwege und vier standardgeschlossene Bereichsgruppen ohne Linkverlust', () => {
  const nav = teil('<nav class="mainnav"', '</nav>');
  const haupt = [...nav.matchAll(/<a [^>]*class="nav-haupt"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g)].map(m => m[1]);
  assert.deepEqual(haupt, ['Heute', 'Muster bestellen', 'Bestellungen', 'Packstation']);
  const gruppen = [...nav.matchAll(/<details class="nav-gruppe"([^>]*)>/g)];
  assert.equal(gruppen.length, 4);
  assert.ok(gruppen.every(m => !/\bopen\b/.test(m[1])));
  for (const titel of ['Kunden &amp; Einkauf', 'Shop &amp; Inhalte', 'Verwaltung', 'Weitere Dashboards']) assert.ok(nav.includes(titel));
  assert.ok(!nav.includes('id="navMore"'));
});

test('alter Buero-Schalter oeffnet keine Gruppen; nur gewaehlter und aktiver Bereich bleiben offen', () => {
  const speicher = new Map([['tp-nav-buero', '1']]);
  const gruppen = ['kunden', 'shop', 'verwaltung', 'dashboards'].map(name => ({
    dataset: { navGruppe: name }, open: false, aktiv: false,
    querySelector(sel) { return sel === 'summary' ? { classList: { toggle() {} } } : this.aktiv ? {} : null; },
  }));
  const text = fs.readFileSync(path.join(WURZEL, 'kern/navigation.mjs'), 'utf8')
    .replace(/^import.*;\n/gm, '').replace(/^export /gm, '');
  const zeichne = vm.runInNewContext(text + '\naktualisiereGruppen', {
    localStorage: { getItem: k => speicher.get(k) || null },
    document: { querySelectorAll: () => gruppen },
  });
  zeichne();
  assert.ok(gruppen.every(g => !g.open));
  speicher.set('tp-nav-gruppe-v2', 'shop');
  gruppen[2].aktiv = true;
  zeichne();
  assert.deepEqual(gruppen.map(g => g.open), [false, true, true, false]);
});

test('Muster bestellen und allgemeiner Einkauf haben getrennte Aktivmarkierung; Mehr bleibt stabil', () => {
  const node = dataset => ({ dataset, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } });
  const muster = node({ nav: 'einkauf', navEinkauf: 'muster' });
  const einkauf = node({ nav: 'einkauf' });
  const mehr = node({});
  const state = { route: { view: 'einkauf', params: new URLSearchParams('tab=lieferant&art=muster&af=offen') }, tasks: [] };
  const text = fs.readFileSync(path.join(WURZEL, 'kern/navigation.mjs'), 'utf8').replace(/^import.*;\n/gm, '').replace(/^export /gm, '');
  const zeichne = vm.runInNewContext(text + '\naktualisiereNavigation', {
    state, URLSearchParams, darfAnsicht: () => false,
    $: sel => sel === '#navToggle' ? mehr : null,
    localStorage: { getItem: () => null },
    document: {
      body: { classList: { remove() {} } },
      querySelectorAll: sel => sel === '[data-nav]' ? [muster, einkauf] : [],
      querySelector: sel => sel === '#tabbar a[aria-current="page"]' && muster.attrs['aria-current'] ? muster : null,
    },
  });
  zeichne();
  assert.equal(muster.attrs['aria-current'], 'page');
  assert.equal(einkauf.attrs['aria-current'], undefined);
  assert.equal(mehr.attrs['aria-current'], undefined);
  state.route.params.set('art', 'ware');
  zeichne();
  assert.equal(muster.attrs['aria-current'], undefined);
  assert.equal(einkauf.attrs['aria-current'], 'page');
  assert.equal(mehr.attrs['aria-current'], 'page');
  zeichne();
  assert.equal(mehr.attrs['aria-current'], 'page', 'wiederholtes Zeichnen darf Mehr nicht umschalten');
});
