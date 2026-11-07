/*
  Barrierefreiheit aus dem Pruefrundgang 06.11. (P09): Infoblase der
  Aktionsbedingung, Autovervollstaendigung im Kontaktformular und
  Fehlerverknuepfung im Raummass-Rechner.
*/
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const lesen = (...teile) => readFileSync(new URL(`../../${teile.join('/')}`, import.meta.url), 'utf8');

test('Aktionsbedingung: Infoblase ohne role=button, unter dem Symbol, Escape blendet aus', () => {
  const snippet = lesen('snippets', 'tp-aktion-bedingung.liquid');
  const tip = snippet.match(/<span class="tp-tip"[^>]*>/)?.[0];
  assert.ok(tip, 'Das Info-Symbol fehlt.');
  assert.doesNotMatch(tip, /role=/, 'Das Info-Symbol ist kein Button.');
  assert.match(tip, /tabindex="0"/);
  assert.match(tip, /aria-describedby="tp-tip-\{\{ id \}\}"/);
  assert.match(snippet, /e\.key !== 'Escape'/, 'Escape schliesst die Blase nicht.');
  assert.match(snippet, /tp-tip--zu/);

  const css = lesen('blocks', 'price_custom.liquid');
  const regel = css.match(/\.tp-tip__text \{[^}]*\}/)?.[0] || '';
  assert.match(regel, /top: calc\(100% \+ 6px\)/, 'Die Blase steht nicht unter dem Symbol.');
  assert.doesNotMatch(regel, /bottom:/);
  assert.match(css, /\.tp-tip\.tp-tip--zu \.tp-tip__text \{[^}]*visibility: hidden/);
});

test('Kontaktformular: Name und E-Mail mit autocomplete', () => {
  const form = lesen('sections', 'contact-form.liquid');
  assert.match(form, /<input[^>]*id="ContactFormName"[^>]*autocomplete="name"/);
  assert.match(form, /<input[^>]*id="ContactFormEmail"[^>]*autocomplete="email"/);
});

test('Raummass: Felder verweisen auf die Fehlermeldung, aria-invalid je Feld', () => {
  const snippet = lesen('snippets', 'tp-raummass.liquid');
  assert.match(snippet, /<p class="tp-rm__fehler" id="tp-rm-fehler-\{\{ id \}\}" data-rm-fehler/);
  for (const feld of ['data-rm-breite', 'data-rm-laenge']) {
    assert.match(snippet, new RegExp(`<input[^>]*aria-describedby="tp-rm-fehler-\\{\\{ id \\}\\}"[^>]*${feld}`), `${feld} ohne Verweis auf die Meldung.`);
  }
  const js = lesen('assets', 'tp-raummass.js');
  const start = js.indexOf('function rechnenInhalt()');
  const rumpf = js.slice(start, js.indexOf('var r = rollen();', start));
  assert.match(rumpf, /feldStatus\(bIn, b\.fehler\)/);
  assert.match(rumpf, /feldStatus\(lIn, l\.fehler\)/);
  assert.ok(rumpf.indexOf('feldStatus(bIn') < rumpf.indexOf('if (b.leer || l.leer) return;'), 'aria-invalid wird bei leeren Feldern nicht zurueckgesetzt.');
  assert.match(js, /removeAttribute\('aria-invalid'\)/);
});
