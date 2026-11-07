// Feste Suchthemen (Rundgang 2026-11-05): Kundenwoerter, die Shopifys Suche nicht dem
// Sortiment zuordnet. Synonyme gibt es in Search & Discovery nicht mehr, die Regeln
// stehen in snippets/tp-suche-thema.liquid. Dazu die Handysuche: "Meinten Sie" im
// Suchfenster, Filtergruppen im Filterfenster der Suche zugeklappt.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const lies = (datei) => readFileSync(path.join(root, datei), 'utf8');
const ohneDoc = (code) => code.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');

const engine = new Liquid({
  templates: {
    'tp-suche-thema': ohneDoc(lies('snippets/tp-suche-thema.liquid')),
    // Farbwort "grau": nur die graue Karte meldet eine Variante.
    'tp-suchfarbe-variante': "{% if product.grau %}0|0{% endif %}",
  },
});

const produkt = (handle, extra = {}) => ({ handle, available: true, ...extra });
const kategorie = (handles) => ({ all_products_count: handles.length, products: handles.map((h) => (typeof h === 'string' ? produkt(h) : h)) });
const globals = {
  collections: {
    teppichboden: kategorie(['boden-a', 'boden-b']),
    'laeufer-nach-mass': kategorie(['kokos', produkt('sisal-grau', { grau: true }), produkt('weg', { available: false })]),
    'teppich-nach-mass': kategorie(['nach-mass']),
    restposten: kategorie(['rest-a']),
    'reste-sonderposten': kategorie(['rest-a']),
    'zubehoer-verlegeunterlagen': kategorie(['egal']),
  },
  all_products: {
    'antirutsch-unterlage-fuer-teppiche-rollenware': produkt('antirutsch-unterlage-fuer-teppiche-rollenware'),
    'teppichbremse-fuer-teppiche-rollenware': produkt('teppichbremse-fuer-teppiche-rollenware', { available: false }),
    'teppichunterlage-elastisch-rollenware': produkt('teppichunterlage-elastisch-rollenware'),
  },
};

const thema = async (begriff, g = globals) =>
  (await engine.parseAndRender("{% render 'tp-suche-thema', begriff: b %}", { b: begriff }, { globals: g })).trim();

test('Kundenwoerter fuehren zu Kategorie und Produkten, Schreibweise egal', async () => {
  for (const b of ['auslegware', 'Auslegeware', 'AUSLEGWARE']) assert.equal(await thema(b), 'teppichboden,|boden-a,boden-b,', b);
  for (const b of ['teppichreste', 'Teppichrest', 'teppich reste', 'restrolle', 'restposten', 'Reststück']) {
    assert.equal(await thema(b), 'restposten,reste-sonderposten,|rest-a,', b);
  }
  for (const b of ['teppichläufer', 'Teppichlaeufer', 'flurläufer', 'FLURLÄUFER', 'teppichläufer nach maß']) {
    assert.ok((await thema(b)).startsWith('laeufer-nach-mass,teppich-nach-mass,|'), b);
  }
});

test('teppichunterlage rutschfest: Antirutsch-Unterlage zuerst, nur Lieferbares', async () => {
  assert.equal(
    await thema('Teppichunterlage rutschfest'),
    'zubehoer-verlegeunterlagen,|antirutsch-unterlage-fuer-teppiche-rollenware,teppichunterlage-elastisch-rollenware,'
  );
});

test('Farbwort: Produkte in dieser Farbe zuerst, nicht lieferbare entfallen', async () => {
  const produkte = (await thema('flurläufer grau')).split('|')[1];
  assert.equal(produkte, 'sisal-grau,kokos,');
});

test('andere Suchen bleiben Shopifys Suche ueberlassen', async () => {
  for (const b of ['teppich', 'teppichboden', 'läufer', 'läuferstange', 'unterlage', 'rest', 'restaurant', 'antirutsch', 'rutschfest', 'vinyl eiche']) {
    assert.equal(await thema(b), '', b);
  }
});

test('leere oder fehlende Kategorie: kein toter Link', async () => {
  const ohne = { ...globals, collections: { ...globals.collections, teppichboden: { all_products_count: 0, products: [] } } };
  assert.equal(await thema('auslegware', ohne), '');
  assert.equal(await thema('auslegware', { all_products: {}, collections: {} }), '');
});

test('jede Regel zeigt auf Kategorien, die Theme-Code schon kennt, ohne Lieferantennamen', () => {
  const regeln = lies('snippets/tp-suche-thema.liquid');
  assert.doesNotMatch(regeln, /lieferant-[a-z]\b/i);
  assert.match(regeln, /'restposten,reste-sonderposten'/);
});

test('Ergebnisseite: Themenprodukte nur ohne Filter und eigene Sortierung, keine Doppelten', () => {
  const seite = lies('sections/search-results.liquid');
  assert.match(seite, /tp_sr_filter_aktiv or search\.sort_by != search\.default_sort_by/);
  assert.match(seite, /tp_sr_thema_kette contains tp_sr_pkey/);
  assert.match(seite, /{% if tp_sr_unsicher and tp_sr_thema_k\.size == 0 %}/);
});

test('Schnellsuche nutzt das Thema, Kategorie steht nicht doppelt', () => {
  const code = lies('snippets/tp-suche-ergebnisse.liquid');
  assert.match(code, /render 'tp-suche-thema'/);
  assert.match(code, /data-tp-typ="thema"/);
  assert.match(code, /tp_se_k_aus = tp_se_k_aus \| append: tp_se_th/);
});

test('Handy-Suchfenster: Treffer melden sich, "Meinten Sie" kommt aus demselben Code', () => {
  const fenster = lies('assets/predictive-search.js');
  const suche = lies('assets/tp-suche.js');
  assert.match(fenster, /'tp:suchfenster:treffer'/);
  assert.match(suche, /addEventListener\('tp:suchfenster:treffer'/);
  assert.equal(suche.match(/function meintenTeile/g).length, 1);
  assert.match(fenster, /import \{[^}]*requestIdleCallback[^}]*\} from '@theme\/utilities'/);
});

test('Filterfenster der Suche beginnt zugeklappt, Kollektionen bleiben wie sie sind', async () => {
  const code = lies('snippets/list-filter.liquid');
  const stelle = code.match(/assign tp_lf_offen = is_vertical[\s\S]*?endif\n/)[0];
  const offen = async (in_drawer, page_type, aktiv) =>
    (await engine.parseAndRender(`{% liquid\n${stelle}\necho tp_lf_offen\n%}`, {
      is_vertical: true, in_drawer, request: { page_type }, filter: { active_values: Array(aktiv) },
    })).trim();
  assert.equal(await offen(true, 'search', 0), 'false');
  assert.equal(await offen(true, 'search', 1), 'true', 'Gruppe mit aktivem Wert bleibt offen');
  assert.equal(await offen(true, 'collection', 0), 'true');
  assert.equal(await offen(false, 'search', 0), 'true');
});
