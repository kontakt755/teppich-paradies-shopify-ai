// Musteranfrage ohne Produkt (Audit 13.10.2026, technische Pruefung Nr. 1):
// Der allgemeine Einstieg /pages/kontakt?thema=muster lieferte Anfragen ohne
// Belag. Jetzt Pflichtfeld "Produkt und Dekor" mit Vorschlagsliste; der Text
// landet in contact[Produkt], eine Auswahl belegt auch Handle und Link.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const formular = read('sections/contact-form.liquid');
const skript = read('assets/tp-sample-request.js');
const musterseite = read('sections/tp-sample-checkout.liquid');

function funktion(quelle, name) {
  const start = quelle.indexOf('function ' + name + '(');
  assert.ok(start !== -1, name + ' nicht gefunden');
  let tiefe = 0;
  for (let i = quelle.indexOf('{', start); i < quelle.length; i++) {
    if (quelle[i] === '{') tiefe++;
    if (quelle[i] === '}' && --tiefe === 0) return quelle.slice(start, i + 1);
  }
  throw new Error('Ende von ' + name + ' nicht gefunden');
}

test('Musterweg-Regel im Kontaktformular gleich canSample des Konfigurators', () => {
  const kontakt = vm.runInNewContext(funktion(skript, 'hatMusterweg') + '; hatMusterweg');
  const window = {};
  vm.runInNewContext(read('assets/tp-sample-checkout-core.js'), { window });
  const canSample = window.TPSampleCheckoutCore.canSample;
  const faelle = [
    { type: 'Klickvinyl', tags: [] },
    { type: 'Klickvinyl', tags: ['muster-klebevariante'] },
    { type: 'Klebevinyl', tags: ['ohne-muster'] },
    { type: 'Vinyl von der Rolle', tags: 'a, ohne-muster' },
    { type: 'Teppichboden', tags: ['zubehoer'] },
    { type: 'Parkett', tags: [] },
    { type: ' Laminat ', tags: [] },
    { type: 'Kork', tags: [] },
    { type: 'Linoleumboden', tags: [] },
  ];
  for (const p of faelle) assert.equal(kontakt(p), canSample(p), JSON.stringify(p));
});

test('Formular: sichtbares Produktfeld ohne name, nur im Mustermodus sichtbar', () => {
  const feld = formular.match(/<input[^>]*data-tp-produktwahl-feld[^>]*>/);
  assert.ok(feld, 'Produktfeld fehlt');
  assert.doesNotMatch(feld[0], /\sname=/, 'Feld darf nicht selbst gesendet werden');
  assert.doesNotMatch(feld[0], /\srequired/, 'Pflicht nur per JS im Mustermodus');
  assert.match(formular, /<div data-sample-field class="tp-produktwahl" data-tp-produktwahl>/);
  assert.match(formular, /<label for="ContactFormProdukt">Produkt und Dekor<\/label>/);
  // Feldnamen, die in der Shopify-Kontaktmail ankommen
  for (const name of ['Produkt', 'Produkt-Handle', 'Produkt-Link']) {
    assert.match(formular, new RegExp('name="contact\\[' + name + '\\]" value="" data-tp-hidden-field="' + name + '"'));
  }
  // Produktfeld steht vor Name/E-Mail
  assert.ok(formular.indexOf('data-tp-produktwahl-feld') < formular.indexOf('id="ContactFormName"'));
});

test('Skript: Pflichtfeld nur im Mustermodus, Text und Auswahl belegen die versteckten Felder', () => {
  const vorRueckkehr = skript.slice(0, skript.indexOf('if (!isSample) return;'));
  assert.doesNotMatch(vorRueckkehr, /produktwahlEinrichten\(\)/);
  const einrichten = funktion(skript, 'produktwahlEinrichten');
  assert.match(einrichten, /feld\.required = true;/);
  assert.match(einrichten, /setHiddenField\('Produkt', text\)/);
  assert.match(einrichten, /setHiddenField\('Produkt-Handle', product\.handle\)/);
  assert.match(einrichten, /setHiddenField\('Produkt-Link', window\.location\.origin \+ '\/products\/' \+ product\.handle\)/);
  // Freitext nach einer Auswahl: Handle und Link wieder leeren
  assert.match(einrichten, /setHiddenField\('Produkt-Handle', ''\)/);
  assert.match(einrichten, /'\/pages\/muster\?produkt=' \+ encodeURIComponent\(product\.handle\)/);
  assert.match(einrichten, /\/search\/suggest\.json/);
  assert.match(einrichten, /filter\(hatMusterweg\)/);
});

test('Musterseite: Gruppe ohne gelistete Dekore verweist bedingt auf Muster und sonst auf Beratung', () => {
  assert.match(musterseite, /Öffnen Sie das Dekor\. Wenn dafür ein Muster verfügbar ist,/);
  assert.match(musterseite, /<a href="\/pages\/kontakt\?thema=beratung">beraten wir Sie gern<\/a>/);
  assert.doesNotMatch(musterseite, /wir schicken das Muster zu/);
});

test('Kategorie-Einstiege versprechen keinen Musterservice fuer alle Produkte', () => {
  const dateien = [
    'templates/collection.vinylboden-klickvinyl.json',
    'templates/collection.vinylboden-klebevinyl.json',
    'templates/collection.vinylboden-rollenvinyl.json',
    'templates/collection.teppichboden-nadelvlies.json',
    'templates/collection.teppichboden-kurzflor.json',
    'sections/hero_split.liquid',
  ];
  for (const datei of dateien) {
    const inhalt = read(datei);
    assert.doesNotMatch(inhalt, /f(ü|ue)r alle (Produkte|Farben)/, datei);
  }
});
