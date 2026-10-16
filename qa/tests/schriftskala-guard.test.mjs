import test from 'node:test';
import assert from 'node:assert/strict';
import { istFest, befundeIn, KOPF_UND_MENUE } from '../schriftskala-guard.mjs';

test('feste Groessen werden erkannt', () => {
  assert.equal(istFest('13px'), true);
  assert.equal(istFest('0.9375rem'), true);
  assert.equal(istFest('clamp(28px, 4.2vw, 42px)'), true);
});

test('Skala, Einstellungen und relative Werte sind erlaubt', () => {
  assert.equal(istFest('var(--tp-fs-sm)'), false);
  assert.equal(istFest('var(--font-size--sm)'), false);
  assert.equal(istFest('{{ block.settings.title_size }}px'), false);
  assert.equal(istFest('0.82em'), false);
  assert.equal(istFest('inherit'), false);
  assert.equal(istFest('max(16px, 1em)'), false);
});

test('Befunde tragen Datei und Zeile', () => {
  const css = '.a { color: red; }\n.b { font-size: 15px; }\n.c { font-size: var(--tp-fs-md); }\n.d{font-size:12.5px}';
  const b = befundeIn(css, 'x.css');
  assert.deepEqual(b.map((x) => [x.zeile, x.wert]), [[2, '15px'], [4, '12.5px']]);
});

test('Kopf und Menue sind ausgenommen, Kategorie-Navigation nicht', () => {
  assert.ok(KOPF_UND_MENUE.test('assets/tp-nav.css'));
  assert.ok(KOPF_UND_MENUE.test('snippets/tp-menu-spalten.liquid'));
  assert.ok(KOPF_UND_MENUE.test('sections/header.liquid'));
  assert.ok(!KOPF_UND_MENUE.test('snippets/tp-vinyl-nav.liquid'));
  assert.ok(!KOPF_UND_MENUE.test('snippets/tp-unterkategorien-leiste.liquid'));
});
