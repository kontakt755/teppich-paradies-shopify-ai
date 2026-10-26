import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Rundgang 2026-10-26, #46: Nach einem Farbwechsel uebernahm die Kaufleiste das
// src-Attribut des neuen Galeriebilds (width=3840) fuer ihr 52-px-Vorschaubild.
// Jetzt immer dieselbe URL mit width=160. Echte Methode aus dem Asset.

const quelle = readFileSync(new URL('../../assets/sticky-add-to-cart.js', import.meta.url), 'utf8');
const anfang = quelle.indexOf('  #syncGalleryImage() {');
const ende = quelle.indexOf('\n  /**', anfang);
assert.ok(anfang > 0 && ende > anfang, 'Methode #syncGalleryImage nicht gefunden');
const methode = quelle.slice(anfang, ende).replace('#syncGalleryImage()', 'function sync()');

function lauf(galerie) {
  const sticky = { src: 'alt', alt: '', removeAttribute() {} };
  const self = {
    closest: () => ({ querySelector: () => galerie }),
    querySelector: () => sticky,
  };
  const context = vm.createContext({ URL, window: { location: { href: 'https://www.teppich-paradies.net/products/vivera' } } });
  vm.runInContext(methode, context);
  context.sync.call(self);
  return sticky;
}

test('frisch eingesetztes Galeriebild (currentSrc leer): 160 statt 3840 px', () => {
  const s = lauf({ currentSrc: '', src: 'https://www.teppich-paradies.net/cdn/shop/files/raumbeispiel-1-farbnr-810.jpg?v=1&width=3840', alt: 'Vivera' });
  assert.equal(s.src, 'https://www.teppich-paradies.net/cdn/shop/files/raumbeispiel-1-farbnr-810.jpg?v=1&width=160');
  assert.equal(s.alt, 'Vivera');
});

test('geladenes Bild und Adresse ohne Breite bekommen ebenfalls 160 px', () => {
  assert.match(lauf({ currentSrc: '//www.teppich-paradies.net/cdn/shop/files/a.jpg?v=2&width=1200', src: 'x' }).src, /a\.jpg\?v=2&width=160$/);
  assert.match(lauf({ currentSrc: '', src: 'https://www.teppich-paradies.net/cdn/shop/files/b.jpg' }).src, /b\.jpg\?width=160$/);
});

test('ohne Bildadresse bleibt das Vorschaubild stehen', () => {
  assert.equal(lauf({ currentSrc: '', src: '' }).src, 'alt');
});
