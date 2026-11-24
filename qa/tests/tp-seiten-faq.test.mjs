// FAQPage-JSON-LD aus sichtbarem Text (SEO Phase 3): Produkt h3/h4 wie bisher,
// Seite/Kategorie h2/h3. Rendert das echte Snippet und parst das Ergebnis als JSON.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ohneDoc = (datei) => readFileSync(path.join(root, datei), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const engine = new Liquid({ templates: {
  'tp-faq-beschreibung-structured-data': ohneDoc('snippets/tp-faq-beschreibung-structured-data.liquid'),
} });

const faq = async (html, ebene) => {
  const aus = await engine.parseAndRender(
    "{% render 'tp-faq-beschreibung-structured-data', html: html, seiten_url: 'https://x.test/a', ebene: ebene %}",
    { html, ebene },
  );
  const m = aus.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
};

const produkt = '<h3>Pflege</h3><p>Saugen.</p><h3>Häufige Fragen</h3>'
  + '<h4>Wie breit?</h4><p>400 und 500 cm.</p><h4>Muster?</h4><p>Ja, <a href="/pages/muster">bis zu zwei</a>.</p>';
const seite = '<h2>Versand</h2><p>Deutschlandweit.</p><h2>Häufige Fragen</h2>'
  + '<h3>Was bedeutet Ketteln?</h3><p>Die Kante wird umstochen.</p>'
  + '<h3>Abholung?</h3><p>Ja, in Oranienburg.</p><h2>Danach</h2><h3>Keine Frage</h3><p>x</p>';

test('Produkt: h3/h4 wie bisher, ohne Angabe der Ebene', async () => {
  const j = await faq(produkt);
  assert.equal(j['@type'], 'FAQPage');
  assert.deepEqual(j.mainEntity.map((q) => q.name), ['Wie breit?', 'Muster?']);
  assert.equal(j.mainEntity[1].acceptedAnswer.text, 'Ja, bis zu zwei.');
});

test('Seite: h2/h3, Gruppe endet an der naechsten h2', async () => {
  const j = await faq(seite, 'h2');
  assert.deepEqual(j.mainEntity.map((q) => q.name), ['Was bedeutet Ketteln?', 'Abholung?']);
  assert.equal(j['@id'], 'https://x.test/a#faq');
});

test('fail closed: falsche Ebene oder abweichende Ueberschrift gibt nichts aus', async () => {
  assert.equal(await faq(seite), null);
  assert.equal(await faq(produkt, 'h2'), null);
  assert.equal(await faq('<h2>Häufige Fragen zum Ketteln</h2><h3>F?</h3><p>A</p>', 'h2'), null);
});
