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

test('Schwelle, Zonen und Preise stehen zentral in den Theme-Einstellungen', () => {
  // Stand: Vorgabe des Inhabers vom 2026-09-11 - kostenlos nur ab 649 EUR bis
  // 15 km; sonst Lieferung/Anfahrt 39/49/69 EUR und lose Verlegung 4,95 EUR/m2.
  assert.ok(GRUPPE, 'Gruppe "TP Verlegeservice" fehlt in config/settings_schema.json.');
  assert.equal(standard('tp_vs_schwelle'), 649);
  assert.equal(standard('tp_vs_radius_basis'), 15);
  assert.equal(standard('tp_vs_radius_mitte'), 30);
  assert.equal(standard('tp_vs_radius_premium'), 50);
  assert.equal(standard('tp_vs_anfahrt_nah'), '39 €');
  assert.equal(standard('tp_vs_anfahrt_mitte'), '49 €');
  assert.equal(standard('tp_vs_anfahrt_fern'), '69 €');
  assert.equal(standard('tp_vs_lose'), '4,95 €/m²');
  assert.equal(standard('tp_vs_lose_mindest'), '49 €');
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
    assert.doesNotMatch(code, /\b\d+(,\d{2})?\s*(€|&nbsp;€)/, `${datei} nennt einen Preis im Code.`);
    assert.doesNotMatch(code, /\b649\b/, `${datei} nennt die Schwelle im Code.`);
    assert.doesNotMatch(code, /\b(15|30|50)\s*(km|&nbsp;km)\b/, `${datei} nennt einen Radius im Code.`);
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

test('kostenlos steht nur zusammen mit Schwelle und erster Zone', () => {
  // "Lieferung und lose Verlegung kostenlos" ohne Bedingung waere die falsche
  // Zusage an Kunden unter 649 EUR oder aus 30 km Entfernung.
  for (const teile of SERVICE_DATEIEN) {
    const code = ohneSchema(ohneKommentare(lesen(...teile)));
    for (const zeile of code.split('\n').filter((z) => /kostenlos/.test(z) && !/tp-vs-gratis/.test(z))) {
      assert.match(zeile, /tp_vs_radius_basis|vs_nah|vss_nah|vsh_nah|kostenlose Zone/,
        `${teile.join('/')}: "kostenlos" ohne die erste Zone: ${zeile.trim()}`);
    }
  }
});

test('der Produkthinweis erscheint nur bei Rollenware der freigegebenen Typen', () => {
  const pruefung = lesen('snippets', 'tp-vs-berechtigt.liquid');
  assert.match(pruefung, /product\.template_suffix == 'rolle'/, 'Die Pruefung auf Rollenware fehlt.');
  assert.match(pruefung, /settings\.tp_vs_produkttypen/, 'Die Freigabe nach Produkttyp fehlt.');
  assert.match(pruefung, /product\.type/);
  const block = lesen('blocks', 'tp-verlegeservice-hinweis.liquid');
  assert.match(block, /render 'tp-vs-berechtigt'/, 'Der Hinweis prueft nicht ueber das gemeinsame Snippet.');
  assert.match(block, /{%-?\s*if vsh_gilt == 'ja'\s*-?%}/, 'Der Hinweis rendert ohne Bedingung.');
  // Freigegeben (Inhaber, 2026-09-11): Teppichboden und Vinyl von der Rolle.
  // Linoleum teilt sich das Template "rolle" und bleibt draussen, bis es
  // bewusst in die Liste kommt.
  const typen = standard('tp_vs_produkttypen').split(',').map((t) => t.trim());
  assert.deepEqual(typen, ['Teppichboden', 'Vinyl von der Rolle']);
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

test('der Link "Verlegeservice" fuehrt je nach Produktart auf die passende Seite', () => {
  // Vorher ging er bei jedem Produkt auf die Gewerbeseite "Boden &
  // Malerarbeiten". Die Rollenware-Seite darf aber nur bei Rollenware mit
  // Service verlinkt sein - sonst bekommt Klickvinyl & Co. den Service ueber
  // den Link doch zugesagt.
  const code = ohneKommentare(lesen('blocks', 'tp-service-links.liquid'));
  assert.match(code, /render 'tp-vs-berechtigt', product: product/);
  const zweige = code.match(/if tp_sl_vs contains 'ja'([\s\S]*?)elsif product\.template_suffix == 'planken'([\s\S]*?)else([\s\S]*?)endif/);
  assert.ok(zweige, 'Die Unterscheidung nach Produktart fehlt.');
  assert.match(zweige[1], /liefer-verlegeservice/);
  assert.match(zweige[2], /vinylboden-verlegen/);
  assert.doesNotMatch(zweige[3], /liefer-verlegeservice/, 'Andere Produkte duerfen nicht auf die Rollenware-Seite.');
  assert.match(code, /<a href="{{ tp_sl_verlegen_url }}">Verlegeservice<\/a>/);
});

test('Vinyl von der Rolle: Einstieg und Vinylseite nennen den Service, Klick- und Klebevinyl nicht', () => {
  const einstieg = vorlage('page.verlegeservice').sections.tp_verlegeservice.settings;
  assert.match(einstieg.heading, /Vinyl von der Rolle/);
  assert.equal(einstieg.produkte_link_2, 'shopify://collections/vinylboden-vinyl-von-der-rolle');
  assert.match(ohneKommentare(lesen('sections', 'tp-verlegeservice.liquid')), /section\.settings\.knopf_2/);

  // Auf der Vinylseite nur in der Karte "Vinyl-Rollenware", mit den Zahlen
  // aus den Einstellungen.
  const vinyl = ohneKommentare(lesen('sections', 'vinylboden-verlegen.liquid'));
  const karten = vinyl.split('<div class="vinylart-card">').slice(1);
  const rolle = karten.find((k) => /<h3>Vinyl-Rollenware<\/h3>/.test(k));
  assert.ok(rolle, 'Karte Vinyl-Rollenware fehlt.');
  assert.match(rolle, /settings\.tp_vs_schwelle/);
  assert.match(rolle, /settings\.tp_vs_radius_basis/);
  assert.match(rolle, /liefer-verlegeservice/);
  for (const karte of karten.filter((k) => k !== rolle)) {
    assert.doesNotMatch(karte, /liefer-verlegeservice|kostenlos|tp_vs_/, 'Klick-/Klebevinyl mit dem Rollenware-Service verbunden.');
  }
  assert.doesNotMatch(vinyl, /\b649\b|\b15\s*(km|&nbsp;km)/, 'Zahl von Hand statt aus den Einstellungen.');
});

test('die lose Verlegung steht ueberall mit Preis, wo die Anfahrt steht', () => {
  // Review 2026-09-11: "darunter 39 EUR fuer Lieferung und Anfahrt" allein liest
  // sich, als waere die lose Verlegung unter der Schwelle inklusive.
  assert.match(lesen('assets', 'tp-verlegegebiet.js'), /zoneNah[\s\S]*?losePreis\(s\)/);
  const zonen = ohneKommentare(lesen('sections', 'tp-verlegegebiet.liquid'))
    .match(/<ul class="tp-vg__stufen tp-vg__stufen--zonen"[\s\S]*?<\/ul>/)[0];
  assert.match(zonen.split('<li')[1], /tp_vs_anfahrt_nah[\s\S]*tp_vs_lose/, 'Erste Zone ohne Preis der losen Verlegung.');
  const karte = ohneKommentare(lesen('snippets', 'tp-verlegeservice-stufen.liquid'));
  assert.match(karte.slice(karte.indexOf('Weiter als'), karte.indexOf('Weiter als') + 400), /tp_vs_lose/,
    'Karte ab der Schwelle: jenseits der ersten Zone fehlt die lose Verlegung.');
});

test('der Radius steht in keiner Stufe als Zahl von Hand', () => {
  // Vorlagen und Voreinstellung schreiben [km]; die Sektion setzt die Grenze
  // ein, mit der auch die Pruefung rechnet.
  for (const name of ['page.vinylboden-verlegen', 'page.treppenverlegung']) {
    const sektion = Object.values(vorlage(name).sections).find((s) => s.type === 'tp-verlegegebiet');
    assert.doesNotMatch(JSON.stringify(sektion?.blocks ?? {}), /\b\d+\s*km\b/, `${name}: Radius von Hand statt [km].`);
  }
  const code = lesen('sections', 'tp-verlegegebiet.liquid');
  assert.doesNotMatch(code.slice(code.indexOf('"presets"')), /\b\d+\s*km\b/, 'Voreinstellung nennt den Radius von Hand.');
  assert.match(code, /replace: '\[km\]', vg_km/);
});

test('das am Telefon ausgeblendete Einstiegsbild wird dort nicht geladen', () => {
  assert.match(lesen('sections', 'tp-verlegeservice.liquid'),
    /<source media="\(max-width: 749px\)" srcset="data:image\/gif;base64,/);
});
