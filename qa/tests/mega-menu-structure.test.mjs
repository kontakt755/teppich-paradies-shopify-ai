import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

test('header loads the dedicated mega-menu stylesheet once at section level', () => {
  const header = read('sections/header.liquid');
  assert.equal((header.match(/tp-mega-menu\.css/g) ?? []).length, 1);
  assert.match(header, /tp-mega-menu\.css' \| asset_url \| stylesheet_tag/);
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
