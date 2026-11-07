// Das Anfrageformular der Verlegeseiten darf die Seite nicht breiter machen.
// Ein <select> ist so breit wie seine laengste Option. In einer Spalte mit nacktem
// 1fr setzt das die Mindestbreite der Karte: Beim Oeffnen des Formulars ragte sie am
// Telefon 7-8 px ueber den Rand, und die Seite liess sich seitlich schieben.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const quelle = readFileSync(new URL('../../sections/tp-start-kontakt.liquid', import.meta.url), 'utf8');

test('Raster der Kontakt-Section haben keine Spalte mit nacktem 1fr', () => {
  const nackt = [...quelle.matchAll(/\.tp-kon__(grid|form|fh-wrap)\s*\{[^}]*grid-template-columns:([^;}]*)/g)]
    .filter(([, , spalten]) => /(^|\s)[\d.]*fr\b/.test(spalten.replace(/minmax\([^)]*\)/g, '')));
  assert.deepEqual(nackt.map(([treffer]) => treffer), []);
});

test('Formularfelder duerfen schmaler werden als ihr Inhalt', () => {
  const regel = quelle.match(/\.tp-kon__form input, \.tp-kon__form select, \.tp-kon__form textarea \{([^}]*)\}/);
  assert.ok(regel, 'gemeinsame Regel fuer die Formularfelder fehlt');
  assert.match(regel[1], /width: 100%/);
  assert.match(regel[1], /min-width: 0/);
});
