// S-04: Der Einstiegspreis "ab XX EUR" auf Karte und Produktseite muss exakt der
// Preis sein, den der Konfigurator fuer das Einstiegsmass (80 x 150 cm) berechnet.
// Die Regel steht zweimal im Repository - in Liquid (Anzeige) und im Rechenkern
// assets/tp-masstepich-rechnung.js (Warenkorb). Dieser Test rendert das echte
// Snippet mit LiquidJS und vergleicht es mit dem Rechenkern, damit beide nicht
// auseinanderlaufen. divided_by-Shim wie in tp-cart-paketzeile-praezision.test.mjs:
// Shopify teilt Integer/Integer ganzzahlig, LiquidJS nicht.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
let source = readFileSync(path.join(root, 'snippets/tp-teppich-ab-preis.liquid'), 'utf8');
source = source.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');

createRequire(import.meta.url)('../../assets/tp-masstepich-rechnung.js');
const M = globalThis.TPMass;

const ohneDoc = (datei) => readFileSync(path.join(root, datei), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
// Das Snippet bindet die Qualitaetszeile ein - die Engine bekommt das echte Snippet mit.
const engine = new Liquid({ templates: {
  'tp-teppich-qualitaet': ohneDoc('snippets/tp-teppich-qualitaet.liquid'),
  'tp-teppich-max-breite': ohneDoc('snippets/tp-teppich-max-breite.liquid'),
  'tp-aktion-aktiv': ohneDoc('snippets/tp-aktion-aktiv.liquid'),
  'tp-rabatt-sichtbar': ohneDoc('snippets/tp-rabatt-sichtbar.liquid'),
  'tp-ist-sonderposten': ohneDoc('snippets/tp-ist-sonderposten.liquid'),
  'tp-restrolle-freigegeben': ohneDoc('snippets/tp-restrolle-freigegeben.liquid'),
} });
engine.registerFilter('divided_by', (a, b) => Math.floor(Number(a) / Number(b)));
engine.registerFilter('money', (c) => (Number(c) / 100).toFixed(2).replace('.', ',') + ' €');
engine.registerFilter('money_without_currency', (c) => (Number(c) / 100).toFixed(2).replace('.', ','));
engine.registerFilter('money_without_trailing_zeros', (c) =>
  ((Number(c) / 100).toFixed(2).replace('.', ',') + ' €').replace(',00 €', ' €'));

const W = 80;
const L = 150;

function produkt({ einheitCent, mindest = 99, art = 'Ketteln', p001 = true, maxB = 400, maxL = 1000, varianten = null }) {
  const variants = varianten || [{ price: einheitCent, available: true, metafields: { service: { einfassen: { value: 'Verfügbar' } } } }];
  return {
    price_min: Math.min(...variants.map((v) => v.price)),
    price_max: Math.max(...variants.map((v) => v.price)),
    variants,
    metafields: {
      custom: { preis_pro_001_qm: { value: p001 } },
      service: { einfassung: { value: art }, mindestpreis: { value: mindest }, max_breite_cm: { value: maxB }, max_laenge_cm: { value: maxL } },
    },
  };
}
const kettelOk = { kettelservice: { selected_or_first_available_variant: { available: true, price: 19 } } };

async function render(product, all_products = kettelOk, variant = null, kopf = false) {
  return engine.parseAndRender(source, { product, all_products, variant, kopf });
}
function abCent(html) {
  const m = html.match(/data-tp-ab-cent="(\d+)"/);
  return m ? Number(m[1]) : null;
}
function erwartet(einheitCent, kettelCentJeEinheit, mindestCent) {
  const flaeche = M.abrechnungsflaecheM2('rechteck', W, L);
  const kante = kettelCentJeEinheit ? M.kanteEinheiten(M.umfangM('rechteck', W, L)) * kettelCentJeEinheit : 0;
  const menge = M.mengeMitMindestpreis(flaeche, einheitCent, Math.max(0, mindestCent - kante));
  return menge * einheitCent + kante;
}

test('Rechenkern ist geladen', () => {
  assert.equal(typeof M.mengeMitMindestpreis, 'function');
});

for (const einheitCent of [26, 27, 34, 89, 147, 296]) {
  test(`ab-Preis bei ${einheitCent} ct je 0,01 m2 entspricht dem Rechenkern`, async () => {
    const html = await render(produkt({ einheitCent }));
    assert.equal(abCent(html), erwartet(einheitCent, 19, 9900));
  });
}

test('Einstiegsmass 80 x 150: Material plus Kettelung, Mass und Grundpreis stehen dabei', async () => {
  const html = await render(produkt({ einheitCent: 92 }));
  assert.equal(abCent(html), 120 * 92 + 460 * 19);
  assert.match(html, /tp-ab-preis__betrag">197,80 €/);
  assert.match(html, /inkl\. Kettelung/);
  assert.match(html, /80&nbsp;×&nbsp;150&nbsp;cm/);
  assert.doesNotMatch(html, /m²/, 'Bei belegtem ab-Preis steht kein m2-Preis dabei.');
});

test('Mindestpreis greift weiter, wenn das Einstiegsmass darunter liegt', async () => {
  const html = await render(produkt({ einheitCent: 5, mindest: 150 }));
  assert.equal(abCent(html), erwartet(5, 19, 15000));
  assert.ok(abCent(html) >= 15000);
});

test('Einstiegsmass passt nicht in die Rolle: kein ab-Preis', async () => {
  const html = await render(produkt({ einheitCent: 92, maxB: 70 }));
  assert.equal(abCent(html), null);
});

test('andere Einfassart: keine Kettelzeile eingerechnet', async () => {
  // Karte und Kopf zeigen hier den Preis je m2 (Tests unten); der ab-Preis rechnet nur
  // noch im Produktseiten-Pfad ohne Kopf - die Formel bleibt dieselbe.
  const html = await render(produkt({ einheitCent: 129, art: 'Einfassband', mindest: null }), kettelOk, { price: 129 });
  assert.equal(abCent(html), erwartet(129, 0, 0));
});

test('Kettelservice nicht kaufbar: kein ab-Preis, nur Preis je m2', async () => {
  const html = await render(produkt({ einheitCent: 26 }), {
    kettelservice: { selected_or_first_available_variant: { available: false, price: 19 } },
  });
  assert.equal(abCent(html), null);
  assert.match(html, /ab 26,00 €<span[^>]*>\/m²/);
});

test('Rollenware mit 0,01-m2-Preis, aber ohne Einfassung: kein ab-Preis', async () => {
  const html = await render(produkt({ einheitCent: 29, art: '' }));
  assert.equal(abCent(html), null);
  assert.match(html, /29,00 €/);
});

test('Produktseite: gewaehlte Farbe bestimmt den ab-Preis, nicht die guenstigste', async () => {
  const html = await render(produkt({ einheitCent: 92 }), kettelOk, { price: 117 });
  assert.equal(abCent(html), 120 * 117 + 460 * 19);
  assert.doesNotMatch(html, /m²/);
});

test('Karte: Qualitaetszeile kommt vom Teppichboden, nichts wird ergaenzt', async () => {
  const p = produkt({ einheitCent: 117 });
  p.metafields.service.einfass_basis = { value: { metafields: { custom: {
    fasermaterial: { type: 'list.metaobject_reference', value: [{ fasermaterial: { value: 'Schurwolle' } }] },
    arten: { type: 'list.metaobject_reference', value: [{ name: { value: 'Schlinge' } }, { name: { value: 'Natur' } }] },
    florhohe: { value: '6 mm' },
  } } } };
  const html = await render(p);
  assert.match(html, /tp-ab-preis__qualitaet">Schurwolle · Schlinge · 6 mm Flor</);
});

test('Karte ohne Daten am Teppichboden: keine Qualitaetszeile, Preis bleibt', async () => {
  const html = await render(produkt({ einheitCent: 117 }));
  assert.doesNotMatch(html, /tp-ab-preis__qualitaet/);
  assert.equal(abCent(html), 120 * 117 + 460 * 19);
});

test('Produktseite (mit Variante): keine Qualitaetszeile', async () => {
  const p = produkt({ einheitCent: 117 });
  p.metafields.service.einfass_basis = { value: { metafields: { custom: { florhohe: { value: '6 mm' } } } } };
  const html = await render(p, kettelOk, { price: 117 });
  assert.doesNotMatch(html, /tp-ab-preis__qualitaet/);
});

const v = (price, available = true, einfassen = 'Verfügbar') => ({ price, available, metafields: { service: { einfassen: { value: einfassen } } } });

test('Karte: nicht verfuegbare oder nicht freigegebene Farben zaehlen nicht fuer den ab-Preis', async () => {
  const html = await render(produkt({ varianten: [v(20, false), v(30, true, 'Nicht verfügbar'), v(92)] }));
  assert.equal(abCent(html), 120 * 92 + 460 * 19, 'die guenstigste KAUFBARE Farbe (92) zaehlt, nicht price_min (20)');
});

test('keine einzige kaufbare Farbe: kein ab-Preis', async () => {
  const html = await render(produkt({ varianten: [v(20, false)] }));
  assert.equal(abCent(html), null);
});

test('fehlende Grenzen (leer oder 0): kein ab-Preis - der Konfigurator faellt dann auch aus', async () => {
  assert.equal(abCent(await render(produkt({ einheitCent: 92, maxL: null }))), null);
  assert.equal(abCent(await render(produkt({ einheitCent: 92, maxB: 0 }))), null);
});

test('Text nennt Kettelung nur bei Ketteln, sonst Einfassung', async () => {
  assert.match(await render(produkt({ einheitCent: 92 })), /inkl\. Kettelung/);
  const band = await render(produkt({ einheitCent: 129, art: 'Einfassband', mindest: null }));
  assert.match(band, /inkl\. Einfassband rundum/);
  assert.doesNotMatch(band, /Kettelung/);
});

function rollenRaummass() {
  const p = produkt({ einheitCent: 27, art: 'Raummaß', mindest: null });
  p.metafields.custom.zuschnitt_von_rolle = { value: { id: 60, variants: [{ id: 601, price: 27, available: true }] } };
  p.metafields.custom.rollenzuschnitt_richtung = { value: 'laengs' };
  p.metafields.service.einfass_basis = { value: {
    id: 50, metafields: { custom: { max_roll_laenge_cm: { value: 1000 } } },
    variants: [{ id: 500, available: true, inventory_management: 'shopify', inventory_policy: 'deny', inventory_quantity: 40,
      metafields: { custom: { rollenbreite: { value: 4 } } } }],
  } };
  p.variants[0].metafields.service.basisvariante = { value: { id: 500 } };
  return p;
}

test('Raummaß aus Laengs-Bundle: m2-Preis nennt Zuschnitt ohne Kettelung und braucht keinen Kettelservice', async () => {
  const p = rollenRaummass();
  for (const kopf of [false, true]) {
    const html = await render(p, {}, null, kopf);
    assert.match(html, /data-tp-ab-m2-cent="2700"/);
    assert.match(html, /27&nbsp;€<span[^>]*>\/m²/);
    assert.match(html, /inkl\. Zuschnitt, ohne Kettelung/);
    assert.doesNotMatch(html, /inkl\. (?:Einfassung|Kettelung)/);
  }
  const ab = await render(p, {}, p.variants[0]);
  assert.equal(abCent(ab), erwartet(27, 0, 0));
  assert.match(ab, /inkl\. Zuschnitt, ohne Kettelung/);
});

test('Raummaß ohne Bundle oder Laengs-Freigabe bewirbt keinen belegten Zuschnittpreis', async () => {
  for (const aendern of [
    (p) => { delete p.metafields.custom.zuschnitt_von_rolle; },
    (p) => { p.metafields.custom.rollenzuschnitt_richtung = { value: 'quer' }; },
    (p) => { delete p.metafields.service.einfass_basis; },
    (p) => { p.metafields.service.max_laenge_cm = { value: 0 }; },
    (p) => { delete p.variants[0].metafields.service.einfassen; },
    (p) => { p.metafields.service.einfass_basis.value.variants[0].inventory_quantity = 0; },
    (p) => { p.metafields.service.einfass_basis.value.variants[0].inventory_policy = 'continue'; },
  ]) {
    const p = rollenRaummass();
    aendern(p);
    const html = await render(p, {}, null, true);
    assert.equal(abCent(html), null);
    assert.doesNotMatch(html, /data-tp-ab-m2-cent|inkl\. Zuschnitt/);
  }
});

test('Freigegebenes Raummaß unterhalb des Beispielmasses zeigt weiter seinen belegten m2-Preis', async () => {
  const p = rollenRaummass();
  p.metafields.service.max_breite_cm = { value: 70 };
  p.metafields.service.max_laenge_cm = { value: 100 };
  p.metafields.service.einfass_basis.value.variants[0].metafields.custom.rollenbreite = { value: 0.7 };
  const html = await render(p, {}, null, true);
  assert.match(html, /data-tp-ab-m2-cent="2700"/);
  assert.match(html, /inkl\. Zuschnitt, ohne Kettelung/);
  assert.doesNotMatch(html, /80&nbsp;×&nbsp;150/);
});

test('Kettelservice-Handle im Snippet = Einstellung im Produkt-Template', () => {
  const tpl = readFileSync(path.join(root, 'templates/product.einfassung.json'), 'utf8');
  const handle = tpl.match(/"kettelservice_produkt":\s*"([^"]+)"/)[1];
  assert.match(source, new RegExp(`all_products\\['${handle}'\\]`), 'Anzeige und Warenkorb wuerden mit verschiedenen Kettelpreisen rechnen.');
});

test('Qualitaetszeile ohne Fasermaterial: zwei gepflegte Arten statt einer, nichts erfunden', async () => {
  const p = produkt({ einheitCent: 92 });
  p.metafields.service.einfass_basis = { value: { metafields: { custom: {
    arten: { type: 'list.metaobject_reference', value: [{ name: { value: 'Schlinge' } }, { name: { value: 'Wolle' } }, { name: { value: 'Natur' } }] },
    florhohe: { value: '3,2 mm' },
  } } } };
  assert.match(await render(p), /tp-ab-preis__qualitaet">Schlinge · Wolle · 3,2 mm Flor</);
});

// S-30: Streichpreis im ab-Preis - nur bei aktiver Aktion, nach derselben Formel.
const altCent = (html) => { const m = html.match(/data-tp-ab-alt-cent="(\d+)"/); return m ? Number(m[1]) : null; };
const heuteIso = new Date().toISOString().slice(0, 10);
const gesternIso = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const mitAktion = (p, aktion) => { p.metafields.aktion = aktion; return p; };
const rabattiert = () => produkt({ varianten: [{ price: 78, compare_at_price: 92, available: true, metafields: { service: { einfassen: { value: 'Verfügbar' } } } }] });

test('Aktion aktiv: Streichpreis = ab-Preis zum alten Variantenpreis, Kettelung in beiden Summen', async () => {
  const html = await render(mitAktion(rabattiert(), { start: { value: heuteIso } }));
  assert.equal(abCent(html), 120 * 78 + 460 * 19);
  assert.equal(altCent(html), 120 * 92 + 460 * 19);
  assert.equal(altCent(html), erwartet(92, 19, 9900));
  assert.match(html, /<s class="tp-ab-preis__alt"/);
});

test('Vergleichspreis ohne aktive Aktion: kein Streichpreis', async () => {
  assert.equal(altCent(await render(rabattiert())), null);
  assert.equal(altCent(await render(mitAktion(rabattiert(), { start: { value: '2026-01-01' }, ende: { value: gesternIso } }))), null);
});

test('Aktion aktiv, aber kein Vergleichspreis: kein Streichpreis', async () => {
  assert.equal(altCent(await render(mitAktion(produkt({ einheitCent: 78 }), { start: { value: heuteIso } }))), null);
});

test('Mindestpreis frisst den Rabatt: alt und neu gleich -> kein Streichpreis', async () => {
  const p = produkt({ mindest: 500, varianten: [{ price: 20, compare_at_price: 26, available: true, metafields: { service: { einfassen: { value: 'Verfügbar' } } } }] });
  const html = await render(mitAktion(p, { start: { value: heuteIso } }));
  assert.ok(abCent(html) >= 50000);
  assert.equal(altCent(html), null, 'ein Streichpreis ohne echten Preisunterschied waere irrefuehrend');
});

test('Produktseite: Streichpreis folgt der gewaehlten Variante', async () => {
  const html = await render(mitAktion(rabattiert(), { start: { value: heuteIso } }), kettelOk, { price: 100, compare_at_price: 117 });
  assert.equal(abCent(html), 120 * 100 + 460 * 19);
  assert.equal(altCent(html), 120 * 117 + 460 * 19);
});

// service.kante_inklusive: Kettelung steckt im m2-Preis - keine Kantenkosten im ab-Preis,
// der Kettelservice wird nicht gebraucht. Ohne Feld oder bei false: wie bisher.
const mitKanteInklusive = (p, wert) => { p.metafields.service.kante_inklusive = { value: wert }; return p; };

test('Kante inklusive: ab-Preis nur aus der Fläche, Text bleibt "inkl. Kettelung"', async () => {
  const html = await render(mitKanteInklusive(produkt({ einheitCent: 92 }), true), kettelOk, { price: 92 });
  assert.equal(abCent(html), 120 * 92);
  assert.equal(abCent(html), erwartet(92, 0, 9900));
  assert.match(html, /inkl\. Kettelung/);
});

test('Kante inklusive: Mindestpreis allein über die Fläche', async () => {
  const html = await render(mitKanteInklusive(produkt({ einheitCent: 5, mindest: 150 }), true), kettelOk, { price: 5 });
  assert.equal(abCent(html), erwartet(5, 0, 15000));
  assert.equal(abCent(html), Math.ceil(15000 / 5) * 5);
});

test('Kante inklusive: nicht kaufbarer Kettelservice verhindert den ab-Preis nicht', async () => {
  const html = await render(mitKanteInklusive(produkt({ einheitCent: 92 }), true), {
    kettelservice: { selected_or_first_available_variant: { available: false, price: 19 } },
  }, { price: 92 });
  assert.equal(abCent(html), 120 * 92);
});

test('Kante inklusive: Streichpreis ohne Kante in beiden Summen', async () => {
  const html = await render(mitKanteInklusive(mitAktion(rabattiert(), { start: { value: heuteIso } }), true), kettelOk, { price: 78, compare_at_price: 92 });
  // 120 x 0,78 EUR liegt unter dem Mindestpreis 99 EUR - ohne Kante hebt er die Menge an.
  assert.equal(abCent(html), erwartet(78, 0, 9900));
  assert.equal(abCent(html), 127 * 78);
  assert.equal(altCent(html), 120 * 92);
});

test('Regression: kante_inklusive = false rechnet die Kettelung wie bisher ein', async () => {
  const html = await render(mitKanteInklusive(produkt({ einheitCent: 92 }), false));
  assert.equal(abCent(html), 120 * 92 + 460 * 19);
  const aus = await render(mitKanteInklusive(produkt({ einheitCent: 26 }), false), {
    kettelservice: { selected_or_first_available_variant: { available: false, price: 19 } },
  });
  assert.equal(abCent(aus), null, 'ohne Inklusiv-Kante bleibt der fehlende Kettelservice ein Abbruch');
});

test('kante_inklusive bei anderer Einfassart: keine Wirkung', async () => {
  const html = await render(mitKanteInklusive(produkt({ einheitCent: 129, art: 'Einfassband', mindest: null }), true), kettelOk, { price: 129 });
  assert.equal(abCent(html), erwartet(129, 0, 0));
});

// Seit 2026-10-12: Steckt die Kante im m2-Preis (Paspel, Band, Cover, Ketteln mit
// kante_inklusive), zeigen Karte und Kopf der Produktseite den Preis je m2 - wie im
// Fachhandel und in der Herstellerliste. Eigene Kettelung je lfm behaelt den ab-Preis.
const m2Cent = (html) => { const m = html.match(/data-tp-ab-m2-cent="(\d+)"/); return m ? Number(m[1]) : null; };

test('Karte, Kante im m2-Preis: Preis je m2 statt ab-Preis, ohne "ab" bei einem Preis', async () => {
  const html = await render(mitKanteInklusive(produkt({ einheitCent: 79 }), true));
  assert.equal(abCent(html), null);
  assert.equal(m2Cent(html), 7900);
  assert.match(html, /79&nbsp;€<span class="tp-ab-preis__einheit">\/m²<\/span>/);
  assert.match(html, /inkl\. Kettelung rundum</);
  assert.doesNotMatch(html, /tp-ab-preis__ab/);
  assert.doesNotMatch(html, /Lieferzeit/, 'Lieferzeit nur im Kopf');
});

test('Karte, Farben verschieden teuer: "ab" vor dem guenstigsten Preis je m2', async () => {
  const html = await render(produkt({ art: 'Paspelband', varianten: [v(106), v(120)] }));
  assert.equal(m2Cent(html), 10600);
  assert.match(html, /tp-ab-preis__ab">ab</);
  assert.match(html, /inkl\. Paspel rundum/);
});

test('Kopf der Produktseite: Preis je m2 der gewaehlten Farbe, Hinweis auf den Konfigurator, Lieferzeit', async () => {
  const p = produkt({ einheitCent: 271, art: 'Cover', mindest: 271 });
  p.metafields.service.lieferzeit = { value: 'ca. 2–3 Wochen (Fertigung beim Hersteller)' };
  const html = await render(p, kettelOk, { price: 271 }, true);
  assert.equal(m2Cent(html), 27100);
  assert.match(html, /inkl\. Einfassung rundum · Endpreis nach Ihrem Maß im Konfigurator/);
  assert.match(html, /Lieferzeit ca\. 2–3 Wochen \(Fertigung beim Hersteller\)/);
  assert.doesNotMatch(html, /tp-ab-preis__qualitaet/);
});

test('Kopf bei eigener Kettelung je lfm: ab-Preis bleibt (m2-Preis waere nur ein Teil)', async () => {
  const html = await render(produkt({ einheitCent: 92 }), kettelOk, { price: 92 }, true);
  assert.equal(m2Cent(html), null);
  assert.equal(abCent(html), 120 * 92 + 460 * 19);
});

test('Wunschmass vom Hersteller (Art Fertig) bleibt beim ab-Preis', async () => {
  const pauschale = { 'wunschmass-pauschale': { selected_or_first_available_variant: { available: true, price: 1499 } } };
  const html = await render(produkt({ einheitCent: 92, art: 'Fertig' }), pauschale);
  assert.equal(m2Cent(html), null);
});
