// #1283: Beispielgroesse je Farbe fuer Teppiche nach Mass (Google/Meta-Zusatzfeed,
// Product-JSON-LD, og:price). Der Preis steht damit zweimal im Repository - in Liquid
// (snippets/tp-mass-beispiel.liquid, fuer Suchmaschinen) und im Rechenkern
// (assets/tp-masstepich-rechnung.js, Konfigurator und Warenkorb). Dieser Test rendert
// das echte Snippet mit LiquidJS ueber ein Raster aus Preisen, Mindestpreisen,
// Einfassarten und Grenzen und vergleicht jede Ausgabe mit dem Rechenkern - inklusive
// der Groessenwahl. Weicht eines ab, stuende im Feed ein anderer Preis als auf der Seite.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ohneDoc = (datei) => readFileSync(path.join(root, datei), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const source = ohneDoc('snippets/tp-mass-beispiel.liquid');

createRequire(import.meta.url)('../../assets/tp-masstepich-rechnung.js');
const M = globalThis.TPMass;

const engine = new Liquid({ templates: {
  'tp-teppich-max-breite': ohneDoc('snippets/tp-teppich-max-breite.liquid'),
  'tp-aktion-aktiv': ohneDoc('snippets/tp-aktion-aktiv.liquid'),
  'tp-rabatt-sichtbar': ohneDoc('snippets/tp-rabatt-sichtbar.liquid'),
  'tp-ist-sonderposten': ohneDoc('snippets/tp-ist-sonderposten.liquid'),
  'tp-sonderposten-preisbeleg': ohneDoc('snippets/tp-sonderposten-preisbeleg.liquid'),
} });

const KANDIDATEN = [[80, 150], [120, 170], [160, 230], [200, 300]];

function produkt(o = {}) {
  const service = {
    einfassung: { value: o.art ?? 'Ketteln' },
    max_breite_cm: { value: o.maxB ?? 400 },
    max_laenge_cm: { value: o.maxL ?? 600 },
  };
  if (o.mindest != null) service.mindestpreis = { value: o.mindest };
  if (o.inkl) service.kante_inklusive = { value: true };
  if (o.kg) { service.kg_pro_qm = { value: o.kg }; service.max_gewicht_kg = { value: o.maxKg ?? 30 }; }
  const custom = { preis_pro_001_qm: { value: o.p001 ?? true } };
  if (o.basis) custom.teppich_basis_daten = { value: o.basis };
  if (o.zs) custom.zuschnitt_von_rolle = { value: { variants: [{}] } };
  return { type: 'Teppich nach Maß', tags: [], variants: [], metafields: { service, custom, aktion: o.preisanker ? { klasse: { value: 'preisanker' } } : {} } };
}
function variante(o = {}) {
  return {
    price: o.preis ?? 85,
    compare_at_price: o.alt ?? null,
    available: o.available ?? true,
    option1: o.farbe ?? 'Sand',
    metafields: { service: { einfassen: { value: o.einfassen ?? 'Verfügbar' } } },
  };
}
const shopProdukte = (o = {}) => ({
  kettelservice: { selected_or_first_available_variant: { available: o.kettelOk ?? true, price: 19 } },
  'wunschmass-pauschale': { selected_or_first_available_variant: { available: o.pauschaleOk ?? true, price: 1499 } },
});

async function beispiel(product, variant, { aktion, alle = shopProdukte() } = {}) {
  const ctx = { product, variant, all_products: alle };
  if (aktion !== undefined) ctx.aktion = aktion;
  return (await engine.parseAndRender(source, ctx)).trim();
}

/** Referenz aus dem Rechenkern: dieselbe Groessenwahl und Rechnung wie Konfigurator + Snippet. */
function erwartet({ preis, alt = 0, mindest = 0, kettel = 0, pauschale = 0, maxW = 400, maxL = 600, kg = 0, maxKg = 0 }) {
  for (const [w, l] of KANDIDATEN) {
    if (M.pruefeMasse({ form: 'rechteck', w, l, maxW, maxL, maxKg, kgProQm: kg }).length) continue;
    const flaeche = M.abrechnungsflaecheM2('rechteck', w, l);
    const einheiten = M.mengeHundertstelM2(flaeche);
    const kante = kettel ? M.kanteEinheiten(M.umfangM('rechteck', w, l)) * kettel : 0;
    const rest = Math.max(0, mindest - kante);
    if (M.mengeMitMindestpreis(flaeche, preis, rest) !== einheiten) continue;
    const summe = M.summeCent({ form: 'rechteck', w, l, preisCent: preis, mindestCent: mindest, kettelCent: kettel, pauschaleCent: pauschale });
    let altSumme = 0;
    if (alt > preis) {
      const mAlt = M.mengeMitMindestpreis(flaeche, alt, rest);
      const s = mAlt * alt + kante + pauschale;
      if (mAlt === einheiten && s > summe) altSumme = s;
    }
    return `${w}|${l}|${summe}|${altSumme}|${einheiten}`;
  }
  return '';
}

test('Rechenkern ist geladen', () => {
  assert.equal(typeof M.summeCent, 'function');
});

test('Einstiegsmass 80 x 150 mit Kettelung: Material plus Kante, kein Mindestpreis', async () => {
  const out = await beispiel(produkt({ mindest: 99 }), variante({ preis: 85 }), { aktion: 'nein' });
  // 120 Einheiten x 0,85 + 460 cm Kante x 0,19 = 102,00 + 87,40
  assert.equal(out, '80|150|18940|0|120');
});

test('Rechenraster: Liquid und Rechenkern waehlen dieselbe Groesse und denselben Preis', async () => {
  const arten = [
    { art: 'Ketteln', kettel: 19 },
    { art: 'Ketteln', inkl: true },
    { art: 'Paspelband' },
    { art: 'Cover' },
    { art: 'Fertig', pauschale: 1499, kg: 4.4, maxKg: 30 },
    { art: 'Fertig', pauschale: 1499, kg: 9, maxKg: 30 },
  ];
  let geprueft = 0;
  for (const a of arten) {
    for (const preis of [5, 25, 26, 34, 85, 120, 314, 434]) {
      for (const mindest of [0, 99, 387, 942]) {
        for (const [maxB, maxL] of [[400, 600], [200, 600], [100, 600], [70, 600], [400, 160]]) {
          for (const alt of [0, preis + 13]) {
            const p = produkt({ art: a.art, inkl: a.inkl, mindest, maxB, maxL, kg: a.kg, maxKg: a.maxKg, preisanker: alt > 0 });
            const out = await beispiel(p, variante({ preis, alt: alt || null }), { aktion: alt > 0 ? 'ja' : 'nein' });
            const soll = erwartet({ preis, alt, mindest: mindest * 100, kettel: a.kettel || 0, pauschale: a.pauschale || 0, maxW: maxB, maxL, kg: a.kg || 0, maxKg: a.maxKg || 0 });
            assert.equal(out, soll, `${a.art}${a.inkl ? ' inkl.' : ''} ${preis} ct, Mindestpreis ${mindest}, ${maxB} x ${maxL}, alt ${alt}`);
            geprueft += 1;
          }
        }
      }
    }
  }
  assert.ok(geprueft > 1000);
});

test('Marke mit Mindestflaeche 3 m2: naechste Groesse, deren Preis wirklich zum Mass gehoert', async () => {
  // 129 EUR/m2, Mindestpreis = 3 m2 -> 80 x 150 und 120 x 170 liegen darunter.
  const out = await beispiel(produkt({ art: 'Paspelband', mindest: 387 }), variante({ preis: 129 }), { aktion: 'nein' });
  assert.equal(out, '160|230|47472|0|368');
});

test('Breite je Farbe aus den gespeicherten Basisdaten zaehlt, nicht die groesste des Produkts', async () => {
  const basis = { v: 1, breite_max: 400, breite: { Sand: 100, Grau: 400 } };
  const p = produkt({ art: 'Paspelband', mindest: 387, basis });
  // Sand: nur 100 cm breit -> 160 x 230 passt nicht, kein Beispiel; Grau: 160 x 230.
  assert.equal(await beispiel(p, variante({ preis: 129, farbe: 'Sand' }), { aktion: 'nein' }), '');
  assert.equal(await beispiel(p, variante({ preis: 129, farbe: 'Grau' }), { aktion: 'nein' }), '160|230|47472|0|368');
});

test('Streichpreis nur bei sichtbarer Aktion', async () => {
  const p = produkt({ mindest: 99, preisanker: true });
  assert.equal(await beispiel(p, variante({ preis: 85, alt: 100 }), { aktion: 'ja' }), '80|150|18940|20740|120');
  assert.equal(await beispiel(p, variante({ preis: 85, alt: 100 }), { aktion: 'nein' }), '80|150|18940|0|120');
  // Ohne Uebergabe ermittelt das Snippet die Aktion selbst (Dauerrabatt preisanker).
  assert.equal(await beispiel(p, variante({ preis: 85, alt: 100 })), '80|150|18940|20740|120');
  assert.equal(await beispiel(produkt({ mindest: 99 }), variante({ preis: 85, alt: 100 })), '80|150|18940|0|120');
});

test('fail closed: kein Beispiel, wo der Konfigurator nicht verkauft', async () => {
  const p = produkt({ mindest: 99 });
  assert.equal(await beispiel(p, variante({ einfassen: 'Gesperrt' }), { aktion: 'nein' }), '', 'Farbe nicht freigegeben');
  assert.equal(await beispiel(p, variante({ preis: 0 }), { aktion: 'nein' }), '', 'ohne Preis');
  assert.equal(await beispiel(p, variante(), { aktion: 'nein', alle: shopProdukte({ kettelOk: false }) }), '', 'Kettelservice nicht kaufbar');
  assert.equal(await beispiel(produkt({ art: 'Fertig' }), variante(), { aktion: 'nein', alle: shopProdukte({ pauschaleOk: false }) }), '', 'Pauschale nicht kaufbar');
  assert.equal(await beispiel(produkt({ zs: true }), variante(), { aktion: 'nein' }), '', 'Sonderposten mit Rollenzuschnitt');
  assert.equal(await beispiel(produkt({ p001: false }), variante(), { aktion: 'nein' }), '', 'kein Preis je 0,01 m2');
  assert.equal(await beispiel(produkt({ art: '' }), variante(), { aktion: 'nein' }), '', 'Rollenware ohne Einfassung');
  assert.equal(await beispiel(produkt({ maxB: 70 }), variante(), { aktion: 'nein' }), '', 'kein Mass passt');
});

test('og:price nennt bei Teppich nach Mass den Endpreis der Beispielgroesse, sonst den Preis je m2', async () => {
  const meta = readFileSync(path.join(root, 'snippets/meta-tags.liquid'), 'utf8');
  const block = meta.slice(meta.indexOf("{%- if request.page_type == 'product' -%}"), meta.indexOf('{%- if settings.social_twitter_link'));
  assert.match(block, /og:price:amount/);
  const engine2 = new Liquid({ templates: { 'tp-mass-beispiel': source, 'tp-teppich-max-breite': ohneDoc('snippets/tp-teppich-max-breite.liquid'),
    'tp-rabatt-sichtbar': ohneDoc('snippets/tp-rabatt-sichtbar.liquid'), 'tp-aktion-aktiv': ohneDoc('snippets/tp-aktion-aktiv.liquid'),
    'tp-ist-sonderposten': ohneDoc('snippets/tp-ist-sonderposten.liquid') } });
  // Shopify teilt Integer/Integer ganzzahlig (Euro-Anteil im Block).
  engine2.registerFilter('divided_by', (a, b) => (Number.isInteger(a) && Number.isInteger(b) ? Math.floor(a / b) : a / b));
  const og = async (product) => (await engine2.parseAndRender(block, { request: { page_type: 'product' }, cart: { currency: { iso_code: 'EUR' } }, product },
    { globals: { all_products: shopProdukte() } })).match(/og:price:amount"\s*content="([^"]+)"/)[1];
  const mass = produkt({ mindest: 99 });
  mass.selected_or_first_available_variant = variante({ preis: 85 });
  assert.equal(await og(mass), '189.40');
  const rolle = produkt({ art: '' });
  rolle.selected_or_first_available_variant = variante({ preis: 85 });
  assert.equal(await og(rolle), '85.00', 'Rollenware mit 0,01-m2-Preis ohne Einfassung: Preis je m2');
});

test('Kettelservice- und Pauschalen-Handle sind dieselben wie in den Vorlagen', () => {
  const snippet = readFileSync(path.join(root, 'snippets/tp-mass-beispiel.liquid'), 'utf8');
  const einfassung = JSON.parse(readFileSync(path.join(root, 'templates/product.einfassung.json'), 'utf8').replace(/^\/\*[\s\S]*?\*\/\s*/, ''));
  const fertig = JSON.parse(readFileSync(path.join(root, 'templates/product.wunschmass-fertig.json'), 'utf8').replace(/^\/\*[\s\S]*?\*\/\s*/, ''));
  const einstellungen = (tpl, typ) => JSON.stringify(tpl).match(new RegExp(`"type":"${typ}"[^}]*"settings":\\{[^}]*\\}`, 'g')) || [];
  const kettel = einstellungen(einfassung, 'tp-einfass-konfigurator').map((s) => (s.match(/"kettelservice_produkt":"([^"]+)"/) || [])[1]).filter(Boolean);
  const pauschale = einstellungen(fertig, 'tp-einfass-konfigurator').map((s) => (s.match(/"pauschale_produkt":"([^"]+)"/) || [])[1]).filter(Boolean);
  assert.deepEqual(kettel, ['kettelservice']);
  assert.deepEqual(pauschale, ['wunschmass-pauschale']);
  assert.match(snippet, /all_products\['kettelservice'\]/);
  assert.match(snippet, /all_products\['wunschmass-pauschale'\]/);
});
