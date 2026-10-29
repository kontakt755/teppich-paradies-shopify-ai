// Datenschutz-Hinweis mit Link in den Anfrageformularen (Werkbank w-172,
// Inhaber 28.10.2026): Kontaktseite und Anfrageformular der Verlegeseiten wie
// der Boden-Finder. Der Hinweis steht innerhalb des Formulars, vor dem Absenden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lies = (pfad) => readFileSync(new URL(`../../${pfad}`, import.meta.url), 'utf8');

const FORMULARE = [
  'sections/contact-form.liquid',
  'sections/tp-start-kontakt.liquid',
  'sections/tp-boden-finder.liquid',
];

for (const pfad of FORMULARE) {
  test(`${pfad}: Hinweis zur Datenverarbeitung mit Link zur Datenschutzerklaerung im Formular`, () => {
    const quelle = lies(pfad);
    const formular = quelle.match(/\{%-?\s*form 'contact'[\s\S]*?\{%-?\s*endform\s*-?%\}/)?.[0];
    assert.ok(formular, 'Kontaktformular nicht gefunden');
    assert.match(formular, /Mit dem Absenden stimmen Sie der Verarbeitung Ihrer Angaben zur Bearbeitung der Anfrage zu\./);
    const link = formular.match(/<a href="([^"]+)"[^>]*>Datenschutzerklärung/);
    assert.ok(link, 'Link zur Datenschutzerklaerung fehlt');
    assert.match(link[1], /privacy_policy|privacy-policy|bf_datenschutz/);
    // Hinweis vor dem Absendeknopf
    assert.ok(formular.indexOf('Datenschutzerklärung') < formular.lastIndexOf('type="submit"'), 'Hinweis steht nach dem Absendeknopf');
  });
}
