/*
 * Verlegeservice fuer Rollenware: eine Quelle fuer die Zahlen, klare Grenzen
 * fuer die Aussagen.
 *
 * Anlass (2026-09-11):
 * - Dieselben Preise und Schwellen standen an mehreren Stellen von Hand und
 *   widersprachen sich: "ab 649 EUR ... im Umkreis von 15 km", "diese Kosten
 *   gelten unabhaengig vom Warenwert", "ab 649 EUR: alles inklusive - feste
 *   Verlegung". Richtig ist: lose Verlegung inklusive, Fixierung und
 *   Verklebung immer als Zusatz.
 * - /pages/liefer-verlegeservice zeigte live die B2B-Gewerbeseite, weil ihr
 *   Template fehlte und Shopify still auf page.json zurueckfiel.
 * - Der kostenlose Service gilt nur fuer Rollenware. Klickvinyl & Co. duerfen
 *   ihn weder auf der Produktseite noch auf ihren Verlegeseiten zugesagt
 *   bekommen.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const WURZEL = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const lesen = (...teile) => readFileSync(path.join(WURZEL, ...teile), 'utf8');
const vorlage = (name) => {
  const roh = lesen('templates', `${name}.json`);
  return JSON.parse(roh.slice(roh.indexOf('{')));
};

const GRUPPE = JSON.parse(lesen('config', 'settings_schema.json')).find((g) => g.name === 'TP Verlegeservice');
const standard = (id) => GRUPPE?.settings.find((s) => s.id === id)?.default;

/** Liquid ohne Kommentare, doc-Bloecke und CSS-Kommentare. */
const ohneKommentare = (code) => code
  .replace(/{%-?\s*(comment|doc)\s*-?%}[\s\S]*?{%-?\s*end\1\s*-?%}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*#.*$/gm, '');

const ohneSchema = (code) => code.replace(/{%-?\s*schema\s*-?%}[\s\S]*?{%-?\s*endschema\s*-?%}/g, '');

const SERVICE_DATEIEN = [
  ['sections', 'tp-verlegeservice.liquid'],
  ['sections', 'tp-verlegeservice-kontakt.liquid'],
  ['sections', 'teppichboden-verlegen.liquid'],
  ['snippets', 'tp-verlegeservice-stufen.liquid'],
  ['blocks', 'tp-verlegeservice-hinweis.liquid'],
];

test('Schwelle, Radien und Preise stehen zentral in den Theme-Einstellungen', () => {
  assert.ok(GRUPPE, 'Gruppe "TP Verlegeservice" fehlt in config/settings_schema.json.');
  assert.equal(standard('tp_vs_schwelle'), 649);
  assert.equal(standard('tp_vs_radius_basis'), 15);
  assert.equal(standard('tp_vs_radius_premium'), 50);
  assert.equal(standard('tp_vs_band_basis'), '8,95 €/m²');
  assert.equal(standard('tp_vs_fluessig_basis'), '9,95 €/m²');
  assert.equal(standard('tp_vs_kleber_basis'), '10,95 €/m²');
  assert.equal(standard('tp_vs_band_premium'), 'ca. 25 € pro Raum');
  assert.equal(standard('tp_vs_fluessig_premium'), '3,95 €/m²');
  assert.equal(standard('tp_vs_kleber_premium'), '4,95 €/m²');
});

test('keine Datei des Service schreibt eine Zahl selbst hin', () => {
  // Sonst aendert jemand den Preis in den Einstellungen, und eine Kopie im
  // Code bleibt stehen - genau so sind die Widersprueche entstanden.
  for (const teile of SERVICE_DATEIEN) {
    const code = ohneSchema(ohneKommentare(lesen(...teile)));
    const datei = teile.join('/');
    assert.doesNotMatch(code, /\b\d{1,2},\d{2}\s*€/, `${datei} nennt einen Preis im Code.`);
    assert.doesNotMatch(code, /\b649\b/, `${datei} nennt die Schwelle im Code.`);
    assert.doesNotMatch(code, /\b(15|50)\s*km\b/, `${datei} nennt einen Radius im Code.`);
  }
});

/** Alle Texte des Themes, in Saetze zerlegt, samt Herkunft. */
function alleSaetze() {
  const saetze = [];
  const zerlegen = (text, herkunft) => {
    for (const satz of text.replace(/<[^>]+>/g, ' ').split(/[.;!?](?=\s|$)|\n/)) {
      if (satz.trim()) saetze.push({ satz: satz.trim(), herkunft });
    }
  };
  const werte = (wert, herkunft) => {
    if (typeof wert === 'string') zerlegen(wert, herkunft);
    else if (wert && typeof wert === 'object') for (const kind of Object.values(wert)) werte(kind, herkunft);
  };
  for (const datei of readdirSync(path.join(WURZEL, 'templates')).filter((d) => d.endsWith('.json'))) {
    werte(vorlage(datei.replace(/\.json$/, '')), `templates/${datei}`);
  }
  for (const ordner of ['sections', 'snippets', 'blocks']) {
    for (const datei of readdirSync(path.join(WURZEL, ordner)).filter((d) => d.endsWith('.liquid'))) {
      zerlegen(ohneKommentare(lesen(ordner, datei)), `${ordner}/${datei}`);
    }
  }
  return saetze;
}

test('nirgends "kostenlose Verlegung", "alles inklusive" oder feste Verlegung ohne Aufpreis', () => {
  const funde = alleSaetze().filter(({ satz }) =>
    /kostenlose Verlegung/i.test(satz)
    || /alles inklusive/i.test(satz)
    || (/feste Verlegung/i.test(satz) && !/Aufpreis/i.test(satz)));
  assert.deepEqual(
    funde.map(({ satz, herkunft }) => `${herkunft}: ${satz}`),
    [],
    'Diese Saetze versprechen eine Verklebung oder einen Service, der nicht inklusive ist.',
  );
});

test('der Produkthinweis erscheint nur bei Rollenware der freigegebenen Typen', () => {
  const block = lesen('blocks', 'tp-verlegeservice-hinweis.liquid');
  assert.match(block, /product\.template_suffix == 'rolle'/, 'Die Pruefung auf Rollenware fehlt.');
  assert.match(block, /settings\.tp_vs_produkttypen/, 'Die Freigabe nach Produkttyp fehlt.');
  assert.match(block, /product\.type/);
  assert.match(block, /{%-?\s*if vsh_gilt\s*-?%}/, 'Der Hinweis rendert ohne Bedingung.');
  // Standard: nur Teppichboden. Vinyl von der Rolle teilt sich das Template
  // "rolle" und darf erst nach bewusster Freigabe dazukommen.
  assert.equal(standard('tp_vs_produkttypen'), 'Teppichboden');
});

test('den Produkthinweis setzt nur das Rollenware-Template ein', () => {
  for (const datei of readdirSync(path.join(WURZEL, 'templates')).filter((d) => d.endsWith('.json'))) {
    const setzt = lesen('templates', datei).includes('"tp-verlegeservice-hinweis"');
    assert.equal(setzt, datei === 'product.rolle.json',
      `${datei}: der Hinweis gehoert nur auf die Rollenware-Produktseite.`);
  }
  const details = vorlage('product.rolle').sections.main.blocks['product-details'];
  assert.ok(details.block_order.includes('tp_verlegeservice_hinweis'),
    'Der Block steht in blocks, aber nicht in block_order - Shopify zeigt ihn dann nicht.');
});

test('/pages/liefer-verlegeservice hat ein eigenes Template statt der B2B-Rueckfallseite', () => {
  assert.ok(existsSync(path.join(WURZEL, 'templates', 'page.verlegeservice.json')),
    'Ohne page.verlegeservice.json rendert Shopify still page.json - die B2B-Seite.');
  const seite = vorlage('page.verlegeservice');
  const sichtbar = seite.order.filter((schluessel) => !seite.sections[schluessel].disabled);
  assert.equal(seite.sections[sichtbar[0]].type, 'tp-verlegeservice', 'Der Service muss oben stehen.');
  assert.equal(seite.sections.main.disabled, true,
    'Der Seitentitel waere eine zweite H1 - die steht schon im Einstieg.');
  assert.doesNotMatch(JSON.stringify(seite), /b2b/i);
  const h1 = ohneKommentare(lesen('sections', 'tp-verlegeservice.liquid')).match(/<h1\b/g) || [];
  assert.equal(h1.length, 1, 'Die Seite braucht genau eine H1.');
});

test('weiter als das Liefergebiet: Kontaktwege statt Absage, und zwar hinter der Karte', () => {
  const seite = vorlage('page.verlegeservice');
  assert.ok(seite.order.indexOf('tp_verlegeservice_kontakt') > seite.order.indexOf('tp_verlegegebiet'),
    'Der Kontakt fuer weitere Entfernungen gehoert hinter die Karte.');
  const code = lesen('sections', 'tp-verlegeservice-kontakt.liquid');
  for (const weg of ['tel:', 'mailto:', 'https://wa.me/', 'kontakt_link', 'maps/dir/?api=1']) {
    assert.ok(code.includes(weg), `Kontaktweg fehlt: ${weg}`);
  }
  assert.equal(seite.sections.tp_verlegeservice_kontakt.settings.kontakt_link, '/pages/kontakt');
});

test('Kontaktdaten kommen aus dem Shop, nicht erfunden', () => {
  // Dieselben Nummern wie in Service-Links, Final-CTA und Kontaktseite.
  assert.equal(standard('tp_vs_telefon').replace(/\D/g, ''), '033015733720');
  assert.equal(standard('tp_vs_whatsapp'), '4917657931322');
  assert.equal(standard('tp_vs_email'), 'kontakt@teppich-paradies.net');
  assert.match(lesen('blocks', 'tp-service-links.liquid'), /tel:\+4933015733720/);
  assert.match(lesen('blocks', 'tp-service-links.liquid'), /wa\.me\/4917657931322/);
});
