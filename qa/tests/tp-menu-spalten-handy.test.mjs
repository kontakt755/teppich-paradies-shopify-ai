import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// w-039 (2026-10-26): Teppichboden-Menue auf dem Handy. Vorher 14 Kacheln und
// 18 Chips untereinander, das Panel war bei 390 x 844 1,46 Bildschirme hoch.
const root = path.resolve(import.meta.dirname, '..', '..');
const spalten = readFileSync(path.join(root, 'snippets/tp-menu-spalten.liquid'), 'utf8');
const css = readFileSync(path.join(root, 'assets/tp-nav.css'), 'utf8');
const [, drawer = '', desktop = ''] = spalten.match(/\{%- if variant == 'drawer' -%\}([\s\S]*)\{%- else -%\}([\s\S]*)\{%- endif -%\}\s*$/) ?? [];

test('Handy: hoechstens sechs Kacheln, der Rest als Chips unter "Weitere"', () => {
  assert.match(drawer, /assign tp_ms_kacheln_max = 6/);
  assert.match(drawer, /if tp_ms_kacheln_n >= tp_ms_kacheln_max/);
  assert.match(drawer, /id="tp-ms-drawer-weitere">Weitere</);
  assert.match(drawer, /tp-nav-chips--weitere/);
});

test('Handy: Gruppen sind Chip-Zeilen zum Wischen, Sprungmarken entfallen', () => {
  assert.match(spalten, /tp-nav-chips tp-nav-chips--wisch/);
  assert.doesNotMatch(spalten, /tp-dn-sprung/);
  assert.doesNotMatch(css, /tp-dn-sprung/);
  assert.match(css, /\.menu-drawer \.tp-nav-chips--wisch \{[^}]*flex-wrap: nowrap/);
});

test('Desktop-Megamenue bleibt unberuehrt', () => {
  assert.ok(desktop.includes('data-testid="tp-menu-spalten"'), 'Desktop-Zweig gefunden');
  assert.doesNotMatch(desktop, /tp_ms_kacheln_max|tp-nav-chips--wisch|tp-nav-chips--weitere/);
  // Die Wisch-Regeln gelten nur im Schubladenmenue
  for (const regel of css.match(/[^}]*tp-nav-chips--(?:wisch|weitere)[^{]*\{/g) ?? []) {
    assert.match(regel, /\.menu-drawer /, `nur im Drawer: ${regel.trim()}`);
  }
});
