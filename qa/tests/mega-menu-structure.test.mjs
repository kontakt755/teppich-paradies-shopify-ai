import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

test('header loads the dedicated mega-menu stylesheet non-blocking, exactly once', () => {
  // Seit 2026-09-14 (perf/render-blocking-css): tp-mega-menu.css stylt nur das
  // Menue-Panel, nicht die sichtbare Kopfzeile, deshalb nicht mehr blockierend
  // geladen. Erwartet werden genau ein preload-Link (aktive Quelle) und genau
  // ein noscript-Fallback mit dem regulaeren stylesheet_tag-Filter - keine
  // dritte, unguardete Einbindung, die die Datei erneut blockierend laden
  // wuerde (der urspruengliche Zweck dieses Tests).
  const header = read('sections/header.liquid');
  const preloadLinks = header.match(/<link\s+rel="preload"\s+href="\{\{ *'tp-mega-menu\.css' *\| *asset_url *\}\}"\s+as="style"/gs) ?? [];
  const noscriptFallbacks = header.match(/<noscript>\{\{ *'tp-mega-menu\.css' *\| *asset_url *\| *stylesheet_tag *\}\}<\/noscript>/g) ?? [];
  assert.equal(preloadLinks.length, 1);
  assert.equal(noscriptFallbacks.length, 1);
  // Ausserhalb des noscript-Blocks darf kein blockierender stylesheet_tag mehr stehen.
  const withoutNoscript = header.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  assert.doesNotMatch(withoutNoscript, /tp-mega-menu\.css' \| asset_url \| stylesheet_tag/);
});

test('mega menu exposes a factual heading derived from its parent link', () => {
  const markup = read('snippets/mega-menu-list.liquid');
  assert.match(markup, /class="mega-menu__intro"/);
  assert.match(markup, /parent_link\.title \| escape/);
});

test('structured menu styling preserves keyboard focus and reduced motion', () => {
  const css = read('assets/tp-mega-menu.css');
  assert.match(css, /:focus-within/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /@media screen and \(min-width: 750px\)/);
  assert.match(css, /:not\(:has\(ul\)\)/);
  assert.match(css, /repeat\(3, minmax\(0, 1fr\)\)/);
});
