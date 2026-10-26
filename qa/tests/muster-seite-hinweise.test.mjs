// Musterseite: Groesse und Versand unter der Ueberschrift, bei JAB und Vorwerk
// der Hinweis, dass der Hersteller selbst verschickt (Rundgang 26.10.2026,
// Inhaber 15.10.2026). Eine Ankunftszeit steht dort bewusst noch nicht.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

function ladeCore() {
  const window = {};
  vm.runInNewContext(read('assets/tp-sample-checkout-core.js'), { window });
  return window.TPSampleCheckoutCore;
}

test('Herstellermuster: nur JAB Anstoetz und Vorwerk, egal wie geschrieben', () => {
  const core = ladeCore();
  for (const vendor of ['Vorwerk', 'JAB Anstoetz', ' jab anstoetz ']) {
    assert.equal(core.isHerstellerMuster({ vendor }), true, vendor);
  }
  for (const vendor of ['TeppichParadies', 'JAB', 'Vorwerk Kobold', '', undefined]) {
    assert.equal(core.isHerstellerMuster({ vendor }), false, String(vendor));
  }
  assert.equal(core.isHerstellerMuster(null), false);
});

test('Musterseite nennt Groesse und Versand, ohne Ankunftszeit', () => {
  const section = read('sections/tp-sample-checkout.liquid');
  const info = /<p class="tp-sample__info" data-sample-info>([^<]+)<\/p>/.exec(section);
  assert.ok(info, 'Zeile unter der Ueberschrift');
  assert.equal(info[1], 'Muster ca. A5 · kostenloser Versand');
  const hersteller = /<p class="tp-sample__info" data-sample-hersteller hidden>([^<]+)<\/p>/.exec(section);
  assert.ok(hersteller, 'Herstellerzeile, anfangs versteckt');
  assert.match(hersteller[1], /direkt vom Hersteller/);
  assert.doesNotMatch(info[1] + hersteller[1], /Werktag|Tage/, 'keine Lieferzeit ohne Festlegung des Inhabers');
  // Reihenfolge: direkt unter der Ueberschrift
  assert.ok(section.indexOf('data-sample-info') > section.indexOf('</h1>'));
  assert.ok(section.indexOf('data-sample-info') < section.indexOf('data-sample-intro'));
});

test('Konfigurator tauscht die Zeile bei Herstellermustern', () => {
  const js = read('assets/tp-sample-checkout.js');
  assert.match(js, /function showHerstellerHinweis\(\)/);
  assert.match(js, /showVinylLimit\(\);\s*showHerstellerHinweis\(\);/);
  assert.match(js, /core\.isHerstellerMuster\(product\)/);
  // Ohne Musterweg (Laminat, Parkett, Kork, ohne-muster) keine Zeile zu Groesse und Versand
  assert.match(js, /if \(!core\.canSample\(product\)\) \{\s*loadingEl\.hidden = true;[\s\S]{0,200}?querySelector\('\[data-sample-info\]'\);\s*if \(infoEl\) infoEl\.hidden = true;/);
});
