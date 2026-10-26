// Service-Seiten nach dem Rundgang vom 26.10.2026: Referenzfotos mit Alt-Text,
// kein KI-Bild mit Wasserzeichen auf den Firmenkunden-Seiten, Kontaktseite ohne
// leeren Abschnitt, Treppentabelle am Handy bedienbar.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const template = (name) => JSON.parse(read(join('templates', name)).replace(/^\/\*[\s\S]*?\*\//, ''));

test('Referenzfotos: jedes Bild hat einen Alt-Text oder eine Bildunterschrift als Rueckfall', () => {
  const section = read('sections/kundenbilder-grid.liquid');
  assert.match(section, /assign kb_alt = block\.settings\.alt \| default: block\.settings\.caption \| default: block\.settings\.image\.alt/);
  assert.match(section, /alt="\{\{ kb_alt \| strip_html \| escape \}\}"/);
  assert.match(section, /\{%- if block\.settings\.caption != blank %\}/, 'keine leere Bildunterschrift');
  let bilder = 0;
  for (const datei of readdirSync(join(root, 'templates')).filter((d) => d.endsWith('.json'))) {
    for (const s of Object.values(template(datei).sections || {})) {
      if (s.type !== 'kundenbilder-grid') continue;
      for (const [id, b] of Object.entries(s.blocks || {})) {
        bilder += 1;
        const text = (b.settings?.alt || b.settings?.caption || '').trim();
        assert.ok(text.length >= 10, `${datei} ${id}: Alt-Text fehlt`);
      }
    }
  }
  assert.ok(bilder >= 58, `Referenzfotos gezaehlt: ${bilder}`);
});

test('Firmenkunden: kein KI-Bild mit Wasserzeichen, Kopfbild mit Alt-Text', () => {
  for (const datei of readdirSync(join(root, 'templates')).filter((d) => d.endsWith('.json'))) {
    assert.doesNotMatch(read(join('templates', datei)), /Gemini_Generated_Image/, datei);
  }
  for (const datei of ['page.firmenkunden.json', 'page.fuer-geschaeftskunden.json']) {
    const hero = Object.values(template(datei).sections).find((s) => s.type === 'b2b-hero-bereich');
    assert.ok(hero.settings.image.startsWith('shopify://shop_images/'), datei);
    assert.ok((hero.settings.image_alt || '').length > 20, `${datei}: Alt-Text des Kopfbilds`);
  }
  const hero = read('sections/b2b-hero-bereich.liquid');
  assert.match(hero, /alt="\{\{ section\.settings\.image_alt \| default: section\.settings\.image\.alt \| escape \}\}"/);
  assert.match(hero, /"id": "image_alt"/);
});

test('Kontaktseite: Abstand unter der Ueberschrift, kein leerer Abschnitt', () => {
  const t = template('page.contact.json');
  assert.ok(t.sections.main.settings['padding-block-end'] > 0);
  for (const [id, s] of Object.entries(t.sections)) {
    if (s.type === 'section') assert.ok(Object.keys(s.blocks || {}).length > 0, `leerer Abschnitt ${id}`);
  }
  assert.deepEqual(t.order, ['main', 'tp_bewertung', 'contact_form_DKFg93']);
  // tp-startseite.css (.tp-s-wrap) laedt spaeter und setzte den Innenabstand auf 0
  assert.match(read('sections/tp-start-trust.liquid'), /\.tp-trust \.tp-trust__wrap \{[^}]*padding-top: 18px; padding-bottom: 18px;/);
});

test('Treppentabelle: Tastatur, Beschriftung, kurzer Spaltenkopf am Handy, Wisch-Hinweis', () => {
  const section = read('sections/tp-treppen-ausfuehrung.liquid');
  assert.match(section, /<div class="tp-treppen-ausf__matrix-scroll" data-tp-matrix-scroll tabindex="0" role="region" aria-label="/);
  assert.match(section, /data-tp-wisch hidden>/);
  assert.match(section, /"id": "spalte_teppich_kurz"/);
  const css = read('assets/tp-treppen-ausfuehrung.css');
  assert.match(css, /@media screen and \(max-width: 749px\)[\s\S]*\.tp-treppen-ausf__spalte-kurz \{\s*display: inline;/);
  const treppe = Object.values(template('page.treppenverlegung.json').sections).find((s) => s.type === 'tp-treppen-ausfuehrung');
  assert.equal(treppe.settings.spalte_teppich_kurz, 'Teppich');
});
