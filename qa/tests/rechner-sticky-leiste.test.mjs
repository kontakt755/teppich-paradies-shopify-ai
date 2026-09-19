import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Auf Rechner-Seiten (Rollenware, Teppich nach Mass) gibt es genau eine
// klebende Kaufleiste: die des Themes (Inhaberentscheidung 2026-09-19). Der
// Konflikt-Merge von PR #371 hatte zwei Entwuerfe nebeneinander hinterlassen -
// die Theme-Leiste war per Liquid abgeschaltet, die eingebaute des Rechners
// verloren; live gab es dadurch gar keine. Liquid laesst sich hier nicht
// ausfuehren, geprueft wird die Verdrahtung.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lies = (...p) => readFileSync(join(root, ...p), 'utf8');
const rechner = lies('blocks', 'tp-rollware-rechner.liquid');
const section = lies('sections', 'product-information.liquid');
const sticky = lies('assets', 'sticky-add-to-cart.js');

test('der Rollenrechner ist als Kaufweg mit Zielknopf markiert', () => {
  assert.match(rechner, /class="tp-rwc-\{\{ tp_rc_id \}\} tp-kaufweg"/);
  assert.match(rechner, /<button[^>]*\bdata-cta\b[^>]*\bdata-add-to-cart\b/);
  assert.match(rechner, /data-total/);
});

test('der Rollenrechner bringt keine eigene Kaufleiste mehr mit', () => {
  assert.doesNotMatch(rechner, /data-kaufleiste|tp-rwc-kaufleiste|aktualisiereKaufleiste/);
});

test('die Theme-Leiste wird auf Rechner-Seiten nicht mehr abgeschaltet', () => {
  assert.doesNotMatch(section, /tp_sticky_konfigurator/);
  assert.match(section, /\{% if section\.settings\.enable_sticky_add_to_cart %\}/);
});

test('die Theme-Leiste findet den Kaufweg und bleibt ohne Ziel aus', () => {
  assert.match(sticky, /querySelector\('\.tp-kaufweg'\)/);
  assert.match(sticky, /querySelector\('\[data-add-to-cart\]'\)/);
  assert.match(sticky, /if \(!buyButtonsBlock\) return;/);
});

// Der Kaufknopf bleibt sichtbar und meldet beim Klick, was fehlt (#301) -
// echtes disabled gibt es nur waehrend des laufenden Warenkorb-Aufrufs.
test('der Kaufknopf bleibt sichtbar; disabled nur waehrend /cart/add.js', () => {
  // Nur echte Zuweisungen zaehlen - der Liquid-Kommentar nennt das alte Verhalten.
  assert.doesNotMatch(rechner, /^\s*cta\.hidden\s*=/m);
  assert.match(rechner, /if \(inFlight \|\| cta\.disabled\) return;/);
  assert.match(rechner, /inFlight = true;\s*\n\s*cta\.disabled = true;/);
});
