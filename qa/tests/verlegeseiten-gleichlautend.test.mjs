// Verlegeseiten gleichlautend (Werkbank w-173, Inhaber 28.10.2026): Vorlauf,
// Festpreisangebot und Hereintragen stehen auf jeder Verlegeseite im selben
// Wortlaut (sections/tp-verlege-ablauf.liquid); Versand- und Produktseite
// sagen zum Hereintragen dasselbe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lies = (pfad) => readFileSync(new URL(`../../${pfad}`, import.meta.url), 'utf8');
const vorlage = (name) => JSON.parse(lies(`templates/page.${name}.json`).replace(/^\/\*[\s\S]*?\*\/\s*/, ''));

const HEREINTRAGEN = 'ebenerdig bzw. in die Wohnung, obere Etagen gegen Aufpreis nach Absprache';
const SEITEN = {
  'teppichboden-verlegen': false,
  treppenverlegung: false,
  'vinylboden-verlegen': false,
  verlegeservice: false,
  wohnungsunternehmen: true,
  'boden-malerarbeiten': true,
};

test('Jede Verlegeseite zeigt den Baustein Termine und Angebot, Malerarbeiten nur wo vorgesehen', () => {
  for (const [name, maler] of Object.entries(SEITEN)) {
    const d = vorlage(name);
    const ids = d.order.filter((id) => d.sections[id].type === 'tp-verlege-ablauf' && !d.sections[id].disabled);
    assert.equal(ids.length, 1, `${name}: Baustein fehlt oder doppelt`);
    assert.equal(Boolean(d.sections[ids[0]].settings?.maler), maler, `${name}: Malerarbeiten`);
  }
});

test('Baustein nennt Vorlauf, Festpreisangebot und Hereintragen', () => {
  const s = lies('sections/tp-verlege-ablauf.liquid');
  assert.match(s, /Meist innerhalb einer Woche/);
  assert.match(s, /etwa 3 Wochen nach Auftrag/);
  assert.match(s, /verbindliches Festpreisangebot – auch als Privatkunde/);
  assert.match(s, /Maler- und Tapezierarbeiten/);
  assert.ok(s.toLowerCase().includes(HEREINTRAGEN.toLowerCase()));
});

test('Versandseite und Produktseite sagen zum Hereintragen dasselbe', () => {
  for (const pfad of ['sections/tp-shipping-delivery.liquid', 'blocks/tp-service-links.liquid']) {
    const s = lies(pfad);
    assert.ok(s.includes(HEREINTRAGEN), `${pfad}: Satz zum Hereintragen fehlt`);
    assert.doesNotMatch(s, /tragen die Ware in die Wohnung\.|inklusive Hereintragen in die Wohnung/, pfad);
  }
});

test('Vinyl-Verlegeseite fuehrt auch zu Laminat und Parkett', () => {
  const s = lies('sections/vinylboden-verlegen.liquid');
  assert.match(s, /collections\['laminat'\]/);
  assert.match(s, /collections\['parkett'\]/);
  const d = vorlage('vinylboden-verlegen');
  const hero = Object.values(d.sections).find((x) => x.type === 'vinylboden-verlegen');
  assert.match(hero.settings.hero_titel, /Laminat & Parkett/);
});
