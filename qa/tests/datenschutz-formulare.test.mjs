// Datenschutz-Hinweis mit Link in den Anfrageformularen (Werkbank w-172).
// Wortlaut und Linkziel hat der Inhaber am 28.10.2026 fuer die Kontaktseite und
// das Anfrageformular der Verlegeseiten freigegeben (PR #1771, wie im
// Boden-Finder). Der Satz steht einmal in snippets/tp-datenschutz-hinweis.liquid;
// die Formulare binden ihn ein - auch Verfuegbarkeitsanfrage, Einfass-Konfigurator
// und Muster-Beratungsanfrage. Der Hinweis steht innerhalb des Formulars, vor dem
// Absenden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = path.resolve(import.meta.dirname, '../..');
const lies = (pfad) => readFileSync(path.join(root, pfad), 'utf8');

const SATZ = 'Mit dem Absenden stimmen Sie der Verarbeitung Ihrer Angaben zur Bearbeitung der Anfrage zu.';
// Freigegebener Wortlaut samt Link - Zeichen fuer Zeichen wie in PR #1771.
const hinweis = (adresse) =>
  `${SATZ} Mehr dazu in unserer <a href="${adresse}" target="_blank" rel="noopener">Datenschutzerklärung<span class="visually-hidden"> (öffnet in neuem Tab)</span></a>.`;

const formularAus = (pfad) => {
  const formular = lies(pfad).match(/\{%-?\s*form 'contact'[\s\S]*?\{%-?\s*endform\s*-?%\}/)?.[0];
  assert.ok(formular, 'Kontaktformular nicht gefunden');
  return formular;
};

const engine = new Liquid({ root: path.join(root, 'snippets'), extname: '.liquid' });
engine.registerTag('doc', {
  parse(token, tokens) { while (tokens.length && tokens.shift().name !== 'enddoc') {} },
  render() { return ''; },
});
const ausgabe = (shop) => engine.parseAndRender("{% render 'tp-datenschutz-hinweis' %}", {}, { globals: { shop } });

test('Snippet tp-datenschutz-hinweis: freigegebener Wortlaut mit Link, ohne Leerraum davor oder danach', async () => {
  assert.equal(await ausgabe({ privacy_policy: { url: '/policies/privacy-policy' } }), hinweis('/policies/privacy-policy'));
  // Linkziel ist die in Shopify hinterlegte Richtlinie ...
  assert.equal(await ausgabe({ privacy_policy: { url: '/policies/andere-adresse' } }), hinweis('/policies/andere-adresse'));
  // ... und ohne sie der feste Pfad.
  assert.equal(await ausgabe({}), hinweis('/policies/privacy-policy'));
});

// Formulare, die den Hinweis aus dem gemeinsamen Snippet holen.
const MIT_SNIPPET = [
  'sections/contact-form.liquid',
  'sections/tp-start-kontakt.liquid',
  'blocks/tp-anfrage-formular.liquid',
  'blocks/tp-einfass-konfigurator.liquid',
  'snippets/tp-muster-beratungsanfrage.liquid',
];

for (const pfad of MIT_SNIPPET) {
  test(`${pfad}: Datenschutz-Hinweis aus dem Snippet im Formular, vor dem Absendeknopf`, () => {
    const formular = formularAus(pfad);
    const aufrufe = [...formular.matchAll(/\{%-?\s*render 'tp-datenschutz-hinweis'\s*-?%\}/g)];
    assert.equal(aufrufe.length, 1, 'genau ein Aufruf von tp-datenschutz-hinweis im Formular');
    assert.ok(aufrufe[0].index < formular.lastIndexOf('type="submit"'), 'Hinweis steht nach dem Absendeknopf');
    // Der Wortlaut steht nur im Snippet: kein zweiter, abweichender Satz im Formular.
    assert.ok(!formular.includes('Mit dem Absenden'), 'Satz steht zusaetzlich fest im Formular');
  });
}

test('sections/tp-boden-finder.liquid: Hinweis zur Datenverarbeitung mit Link zur Datenschutzerklaerung im Formular', () => {
  const formular = formularAus('sections/tp-boden-finder.liquid');
  assert.ok(formular.includes(SATZ), 'Satz zur Datenverarbeitung fehlt');
  const link = formular.match(/<a href="([^"]+)"[^>]*>Datenschutzerklärung/);
  assert.ok(link, 'Link zur Datenschutzerklaerung fehlt');
  assert.match(link[1], /privacy_policy|privacy-policy|bf_datenschutz/);
  // Hinweis vor dem Absendeknopf
  assert.ok(formular.indexOf('Datenschutzerklärung') < formular.lastIndexOf('type="submit"'), 'Hinweis steht nach dem Absendeknopf');
});
