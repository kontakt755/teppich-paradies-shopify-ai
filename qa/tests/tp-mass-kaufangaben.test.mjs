// Kaufangaben der Teppiche nach Mass (Pruefung 05.11.2026): Preisbeispiele und Kauffragen
// stehen schon im HTML. Der Preis steht damit noch einmal sichtbar auf der Seite - dieser
// Test rendert die echten Snippets und vergleicht jede Zahl mit dem Rechenkern, den auch
// Konfigurator und Warenkorb benutzen.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ohneDoc = (datei) => readFileSync(path.join(root, datei), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');

createRequire(import.meta.url)('../../assets/tp-masstepich-rechnung.js');
const M = globalThis.TPMass;

const engine = new Liquid({ templates: Object.fromEntries([
  'tp-mass-faq', 'tp-mass-preisliste', 'tp-mass-beispiel', 'tp-mass-kante-wort', 'tp-musteroption',
  'tp-teppich-max-breite', 'tp-aktion-aktiv', 'tp-aktion-laufend', 'tp-rabatt-sichtbar', 'tp-ist-sonderposten',
  'tp-sonderposten-preisbeleg', 'tp-restrolle-freigegeben', 'tp-faq-beschreibung-structured-data',
].map((n) => [n, ohneDoc(`snippets/${n}.liquid`)])) });
const geld = (c) => {
  const [e, r] = (Number(c) / 100).toFixed(2).split('.');
  const t = e.replace(/\B(?=(\d{3})+$)/g, '.');
  return r === '00' ? `${t} €` : `${t},${r} €`;
};
engine.registerFilter('money_without_trailing_zeros', geld);
engine.registerFilter('url_encode', (v) => encodeURIComponent(v));

function produkt(o = {}) {
  const service = {
    einfassung: { value: o.art ?? 'Ketteln' },
    max_breite_cm: { value: o.maxB ?? 400 },
    max_laenge_cm: { value: o.maxL ?? 600 },
  };
  if (o.mindest != null) service.mindestpreis = { value: o.mindest };
  if (o.inkl) service.kante_inklusive = { value: true };
  if (o.lz) service.lieferzeit = { value: o.lz };
  if (o.gruppe) service.einfass_gruppe = { value: o.gruppe };
  if (o.label) service.einfass_label = { value: o.label };
  return {
    title: o.title ?? 'Solvana Teppich nach Maß', handle: 'solvana-teppich-nach-mass', type: 'Teppich nach Maß',
    tags: o.tags ?? [], variants: [], available: o.available ?? true, price_min: o.min ?? 27, price_max: o.max ?? 27,
    metafields: { service, custom: { preis_pro_001_qm: { value: o.p001 ?? true } }, aktion: {} },
  };
}
const variante = (o = {}) => ({
  price: o.preis ?? 27, compare_at_price: null, available: o.available ?? true, option1: o.farbe ?? 'Sand',
  metafields: { service: { einfassen: { value: o.einfassen ?? 'Verfügbar' } } },
});
const shop = {
  kettelservice: { selected_or_first_available_variant: { available: true, price: 19 } },
  'wunschmass-pauschale': { selected_or_first_available_variant: { available: true, price: 1499 } },
};
const render = (name, ctx) => engine.parseAndRender(`{% render '${name}', product: product, variant: variant, ausgabe: ausgabe %}`,
  { all_products: shop, settings: { tp_versand_frei_ab: 50 }, ...ctx }, { globals: { all_products: shop, settings: { tp_versand_frei_ab: 50 } } });

const liste = async (p, v) => (await render('tp-mass-preisliste', { product: p, variant: v })).trim();

test('Solvana-Daten: 200 x 300 cm kosten 352 EUR, wie selbst gerechnet in der Pruefung vom 05.11.', async () => {
  const out = await liste(produkt({ mindest: 99 }), variante());
  assert.equal(out, '160|230|24756|0|368;200|300|35200|0|600;300|400|59000|0|1200');
});

test('Rechenraster: jede ausgegebene Zahl stimmt mit summeCent ueberein', async () => {
  let geprueft = 0;
  for (const a of [{ art: 'Ketteln', kettel: 19 }, { art: 'Ketteln', inkl: true }, { art: 'Paspelband' }, { art: 'Cover' }, { art: 'Einfassband' }, { art: 'Fertig', pauschale: 1499 }]) {
    for (const preis of [21, 27, 65, 129, 296]) {
      for (const mindest of [0, 99, 387]) {
        for (const [maxB, maxL] of [[400, 600], [200, 600], [100, 600]]) {
          const p = produkt({ art: a.art, inkl: a.inkl, mindest, maxB, maxL });
          const out = await liste(p, variante({ preis }));
          for (const z of out ? out.split(';') : []) {
            const [w, l, cent] = z.split('|').map(Number);
            assert.ok(w <= maxB && l <= maxL, `${z} passt nicht in ${maxB} x ${maxL}`);
            assert.equal(cent, M.summeCent({ form: 'rechteck', w, l, preisCent: preis, mindestCent: mindest * 100, kettelCent: a.kettel || 0, pauschaleCent: a.pauschale || 0 }), `${a.art} ${preis} ${z}`);
            geprueft += 1;
          }
        }
      }
    }
  }
  assert.ok(geprueft > 300);
});

test('Hoechstens drei Masse, aufsteigend; passt 300 x 400 nicht, rueckt das naechstkleinere nach', async () => {
  const schmal = await liste(produkt({ maxB: 200 }), variante());
  assert.deepEqual(schmal.split(';').map((z) => z.split('|').slice(0, 2).join('x')), ['120x170', '160x230', '200x300']);
  const voll = await liste(produkt(), variante());
  assert.deepEqual(voll.split(';').map((z) => z.split('|').slice(0, 2).join('x')), ['160x230', '200x300', '300x400']);
});

test('Mindestpreis hebt die Menge an: dieses Mass ist kein Beispiel', async () => {
  const out = await liste(produkt({ inkl: true, mindest: 800 }), variante({ preis: 100 }));
  assert.ok(!out.includes('160|230'), out);
  assert.ok(out.includes('300|400'), out);
});

test('Fail closed: nicht lieferbar, nicht freigegeben, Raummass', async () => {
  assert.equal(await liste(produkt(), variante({ available: false })), '');
  assert.equal(await liste(produkt(), variante({ einfassen: 'Gesperrt' })), '');
  assert.equal(await liste(produkt({ art: 'Raummaß' }), variante()), '');
  assert.equal((await render('tp-mass-faq', { product: produkt({ art: 'Raummaß', lz: '2 Tage' }), variant: variante(), ausgabe: 'json' })).trim(), '');
});

const fragen = async (p, v = variante()) => JSON.parse(`[${(await render('tp-mass-faq', { product: p, variant: v, ausgabe: 'json' })).trim()}]`);
const roh = (t) => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

test('Kauffragen: Preis, Lieferzeit, Bestellweg, Muster nur als Zusatz', async () => {
  const q = await fragen(produkt({ mindest: 99, lz: 'ca. 5–8 Werktage inkl. Ketteln' }));
  assert.deepEqual(q.map((x) => x.name), ['Was kostet dieser Teppich nach Maß?', 'Wie lange dauert die Lieferung?', 'Wie bestelle ich diesen Teppich?']);
  const [preis, zeit, weg] = q.map((x) => x.acceptedAnswer.text);
  assert.match(preis, /^Solvana Teppich nach Maß, gekettelt: /);
  assert.match(preis, /200 × 300 cm kosten 352 €/);
  assert.match(preis, /Kettelung rundum und MwSt\./);
  assert.match(preis, /Mindestpreis je Teppich beträgt 99 €/);
  assert.match(preis, /ab 50 € Bestellwert kostenlos/);
  assert.equal(zeit, 'Die Lieferzeit beträgt ca. 5–8 Werktage inkl. Ketteln.');
  assert.match(weg, /Muster bestellen\.$/);
  assert.doesNotMatch(preis, /Muster|€\/m|Rückgabe|Widerruf/);
  assert.doesNotMatch(zeit, /Muster/);
});

test('Lieferzeit nur, wo sie am Produkt steht; nie erfunden', async () => {
  const ohne = await fragen(produkt());
  assert.deepEqual(ohne.map((x) => x.name), ['Was kostet dieser Teppich nach Maß?', 'Wie bestelle ich diesen Teppich?']);
  assert.doesNotMatch(JSON.stringify(ohne), /Werktage|Wochen|Lieferzeit/);
  const aus = await fragen(produkt({ lz: 'ca. 5–8 Werktage', available: false }), variante({ available: false }));
  assert.deepEqual(aus, []);
});

test('Ohne Musterweg kein Mustersatz; mehrere Kanten werden im Bestellweg genannt', async () => {
  const weg = (await fragen(produkt({ tags: ['ohne-muster'] }))).at(-1).acceptedAnswer.text;
  assert.doesNotMatch(weg, /Muster/);
  const mehrere = (await fragen(produkt({ gruppe: [{}, {}] }))).at(-1).acceptedAnswer.text;
  assert.match(mehrere, /^Farbe und Kante wählen/);
});

test('Fertig: Pauschale im Preis und im Text, abweichende Preise nennen die Ausführung', async () => {
  const q = await fragen(produkt({ art: 'Fertig', min: 96, max: 120 }), variante({ preis: 96, farbe: 'Natur' }));
  const preis = q[0].acceptedAnswer.text;
  assert.match(preis, /in der Ausführung Natur, vom Hersteller eingefasst/);
  assert.match(preis, /enthalten Einfassung sowie Fertigungs- und Versandpauschale und die MwSt/);
  assert.ok(preis.includes(`200 × 300 cm kosten ${geld(600 * 96 + 1499)}`), preis);
});

test('Eigener Kantenname aus service.einfass_label', async () => {
  const q = await fragen(produkt({ art: 'Paspelband', label: 'Paspel (Premium)', title: 'Testa' }));
  assert.match(q[0].acceptedAnswer.text, /^Testa, Kante Paspel \(Premium\): /);
  assert.match(q[0].acceptedAnswer.text, /enthalten Zuschnitt, Paspel rundum und MwSt/);
  const imTitel = await fragen(produkt({ art: 'Paspelband', label: 'Paspel', title: 'Testa – Paspel' }));
  assert.match(imTitel[0].acceptedAnswer.text, /^Testa – Paspel: /);
});

test('Sichtbarer Text und JSON-LD sind Wort fuer Wort gleich', async () => {
  const p = produkt({ mindest: 99, lz: 'ca. 2–3 Wochen (Fertigung beim Hersteller)', title: 'Testa & Co Teppich' });
  const json = await fragen(p);
  const html = await render('tp-mass-faq', { product: p, variant: variante() });
  for (const q of json) {
    assert.ok(roh(html).includes(`>${q.name}</h3>`), q.name);
    assert.ok(roh(html).includes(`>${q.acceptedAnswer.text}</p>`), q.acceptedAnswer.text);
  }
});

test('Genau ein FAQPage-Knoten: Kauffragen vorn, Fragen aus dem Produkttext dahinter', async () => {
  const q = await fragen(produkt());
  const vorab = JSON.stringify(q).slice(1, -1);
  const html = '<p>Text</p><h3>Häufige Fragen</h3><h4>Wie groß darf er sein?</h4><p>Bis 600 cm.</p>';
  const mit = await engine.parseAndRender(`{% render 'tp-faq-beschreibung-structured-data', html: html, seiten_url: 'https://x/p', vorab: vorab %}`, { html, vorab });
  assert.equal(mit.match(/application\/ld\+json/g).length, 1);
  const k = JSON.parse(mit.replace(/<\/?script[^>]*>/g, ''));
  assert.deepEqual(k.mainEntity.map((x) => x.name), [...q.map((x) => x.name), 'Wie groß darf er sein?']);
  const nurVorab = await engine.parseAndRender(`{% render 'tp-faq-beschreibung-structured-data', html: html, seiten_url: 'https://x/p', vorab: vorab %}`, { html: '<p>Text</p>', vorab });
  assert.equal(JSON.parse(nurVorab.replace(/<\/?script[^>]*>/g, '')).mainEntity.length, q.length);
  const nichts = await engine.parseAndRender(`{% render 'tp-faq-beschreibung-structured-data', html: html, seiten_url: 'https://x/p' %}`, { html: '<p>Text</p>' });
  assert.equal(nichts.trim(), '');
});

// Codex-Review PR #1945: Beim Farbwechsel darf der FAQPage-Knoten nicht beim Preis der vorigen
// Farbe stehen bleiben. Echte Liquid-Ausgabe verschieden teurer Varianten, echtes Skript, nur
// das DOM ist nachgebaut.
const asset = readFileSync(path.join(root, 'assets/tp-mass-kaufangaben.js'), 'utf8');
const JSONLD = 'script[type="application/ld+json"]';

async function serverStand(p, v, html = '') {
  const vorab = (await render('tp-mass-faq', { product: p, variant: v, ausgabe: 'json' })).trim();
  const skript = await engine.parseAndRender(`{% render 'tp-faq-beschreibung-structured-data', html: html, seiten_url: 'https://x/p', vorab: vorab %}`, { html, vorab });
  return { faq: (await render('tp-mass-faq', { product: p, variant: v })).trim(), knoten: skript.replace(/<\/?script[^>]*>/g, '').trim() };
}
function seite(stand) {
  const block = { dataset: { tpMassNeu: 'faq' }, hidden: false, innerHTML: stand.faq, closest: () => ({ id: 'shopify-section-main' }) };
  const skript = { textContent: stand.knoten, entfernt: false, remove() { this.entfernt = true; } };
  const hoerer = {};
  const document = {
    addEventListener: (typ, fn) => { hoerer[typ] = fn; },
    querySelector: () => block,
    querySelectorAll: (sel) => (sel === JSONLD ? [{ textContent: '{"@type":"ProductGroup"}' }, skript] : sel === '[data-tp-mass-neu]' ? [block] : []),
  };
  return { document, block, skript, hoerer };
}
const antwort = (stand, { mitBlock = true } = {}) => ({
  querySelector: () => (mitBlock ? { innerHTML: stand.faq, hidden: false } : null),
  querySelectorAll: () => (stand.knoten ? [{ textContent: stand.knoten }] : []),
});
const laden = (s, extra = {}) => vm.runInNewContext(asset, { window: { location: { href: 'https://x/p?preview_theme_id=1' } }, document: s.document, URL, console, ...extra });
const beschreibung = '<h3>Häufige Fragen</h3><h4>Wie groß darf er sein?</h4><p>Bis 600 cm.</p>';

test('Farbwechsel mit anderem Preis: FAQPage-Knoten und sichtbarer Text bleiben wortgleich', async () => {
  const p = produkt({ art: 'Fertig', min: 46, max: 66, title: 'Testa & Co', lz: 'ca. 3 Wochen' });
  const billig = await serverStand(p, variante({ preis: 46, farbe: 'Natur' }), beschreibung);
  const teuer = await serverStand(p, variante({ preis: 66, farbe: 'Rot' }), beschreibung);
  // Beim ersten Laden stimmen Text und Knoten schon, je Variante:
  for (const stand of [billig, teuer]) {
    for (const q of JSON.parse(stand.knoten).mainEntity.slice(0, 3)) assert.ok(roh(stand.faq).includes(q.acceptedAnswer.text), q.name);
  }
  assert.match(billig.knoten, /Ausführung Natur/);
  assert.match(teuer.knoten, /Ausführung Rot/);

  const s = seite(billig);
  laden(s);
  s.hoerer['variant:update']({ detail: { data: { html: antwort(teuer) } } });
  assert.equal(s.block.innerHTML, teuer.faq);
  assert.equal(s.skript.textContent, teuer.knoten);
  const knoten = JSON.parse(s.skript.textContent);
  assert.equal(knoten.mainEntity.at(-1).name, 'Wie groß darf er sein?');
  for (const q of knoten.mainEntity.slice(0, 3)) assert.ok(roh(s.block.innerHTML).includes(q.acceptedAnswer.text), q.name);
  assert.doesNotMatch(s.skript.textContent, /Ausführung Natur/);
});

test('Farbwechsel ueber die Farbkachel: Section laden, Knoten nachziehen, veraltete Antwort verwerfen', async () => {
  const p = produkt({ art: 'Fertig', min: 46, max: 66 });
  const [a, b, c] = await Promise.all([46, 66, 52].map((preis) => serverStand(p, variante({ preis, farbe: `F${preis}` }))));
  const s = seite(a);
  const offen = {};
  laden(s, {
    fetch: (url) => new Promise((res) => { offen[url.searchParams.get('variant')] = { url, res }; }),
    DOMParser: class { parseFromString(t) { return antwort(t === 'b' ? b : c); } },
  });
  const wechsel = (id) => s.hoerer['tp:farbe-wechsel']({ detail: { variantId: id } });
  const langsam = wechsel('b');
  const schnell = wechsel('c');
  assert.equal(offen.c.url.searchParams.get('preview_theme_id'), '1');
  assert.equal(offen.c.url.searchParams.get('section_id'), 'main');
  offen.c.res({ ok: true, text: async () => 'c' });
  await schnell;
  offen.b.res({ ok: true, text: async () => 'b' });
  await langsam;
  assert.equal(s.block.innerHTML, c.faq);
  assert.equal(s.skript.textContent, c.knoten);
});

test('Knoten: Antwort ohne unsere Bloecke aendert nichts, Section ohne Knoten entfernt ihn', async () => {
  const p = produkt({ art: 'Fertig' });
  const start = await serverStand(p, variante());
  const s = seite(start);
  laden(s);
  s.hoerer['variant:update']({ detail: { data: { html: antwort({ faq: '', knoten: '{"@type":"FAQPage","mainEntity":[]}' }, { mitBlock: false }) } } });
  assert.equal(s.skript.textContent, start.knoten);
  assert.equal(s.skript.entfernt, false);
  s.hoerer['variant:update']({ detail: { data: { html: antwort({ faq: '', knoten: '' }) } } });
  assert.equal(s.skript.entfernt, true);
});

const vorlage = (name) => JSON.parse(readFileSync(path.join(root, `templates/${name}.json`), 'utf8').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));

test('Beide Vorlagen: Preisbeispiele vor dem Konfigurator, Kauffragen vor dem Produkttext, Kaufknopf unveraendert danach', () => {
  for (const name of ['product.einfassung', 'product.wunschmass-fertig']) {
    const det = vorlage(name).sections.main.blocks['product-details'];
    const typ = det.block_order.map((id) => det.blocks[id].type);
    const i = (t) => typ.indexOf(t);
    assert.equal(typ.filter((t) => t === 'tp-mass-preisbeispiele').length, 1, name);
    assert.equal(typ.filter((t) => t === 'tp-mass-faq').length, 1, name);
    assert.equal(i('tp-mass-preisbeispiele') + 1, i('tp-einfass-konfigurator'), name);
    assert.ok(i('tp-einfass-konfigurator') < i('buy-buttons'), name);
    assert.ok(i('tp-mass-faq') > i('buy-buttons'), name);
    assert.equal(typ[i('tp-mass-faq') + 1], 'text', name);
  }
});

test('JSON-LD-Weiche und Bloecke gehoeren zusammen', () => {
  const sd = readFileSync(path.join(root, 'snippets/tp-product-structured-data.liquid'), 'utf8');
  assert.match(sd, /template_suffix == 'einfassung' or product_resource\.template_suffix == 'wunschmass-fertig'/);
  assert.match(sd, /render 'tp-mass-faq'[^%]*ausgabe: 'json'/);
});

test('Format-Seite: Beispielqualitaeten gesetzt, Preis aus tp-mass-beispiel, keine Kollektionsschleife', () => {
  const beispiele = vorlage('page.teppich-format').sections.main.settings.beispiele;
  assert.ok(beispiele.length >= 3);
  const s = readFileSync(path.join(root, 'sections/tp-format-seite.liquid'), 'utf8');
  assert.match(s, /render 'tp-mass-beispiel', product: tp_fs_p, variant: tp_fs_kand, groessen: tp_fs_groesse/);
  assert.doesNotMatch(s, /in collections\[|collection\.products/);
});
