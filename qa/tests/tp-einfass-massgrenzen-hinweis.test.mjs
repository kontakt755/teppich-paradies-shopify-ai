// Der Hinweis unter den Masseingaben muss dieselbe Regel nennen, nach der
// tatsaechlich geprueft wird. pruefeMasse vergleicht nicht Breite gegen die
// Maximalbreite, sondern die KUERZERE Seite gegen maxW und die laengere gegen
// maxL - ein Stueck darf also gedreht werden. Der alte Text "Möglich: bis
// 390 × 500 cm" las sich wie eine feste Zuordnung Breite/Laenge und liess
// zulaessige Eingaben unmoeglich aussehen.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
createRequire(import.meta.url)('../../assets/tp-masstepich-rechnung.js');
const M = globalThis.TPMass;

const maxW = 390;
const maxL = 500;

test('Drehen ist erlaubt: 500 x 390 wird genauso akzeptiert wie 390 x 500', () => {
  assert.deepEqual(M.pruefeMasse({ form: 'rechteck', w: 390, l: 500, maxW, maxL }), []);
  assert.deepEqual(M.pruefeMasse({ form: 'rechteck', w: 500, l: 390, maxW, maxL }), []);
});

test('Zu gross bleibt zu gross - die kuerzere Seite entscheidet gegen maxW', () => {
  const f = M.pruefeMasse({ form: 'rechteck', w: 400, l: 450, maxW, maxL });
  assert.equal(f.length, 1);
  assert.match(f[0], /Eine Seite darf höchstens 390 cm messen/);
});

test('Die laengere Seite wird gegen maxL geprueft', () => {
  const f = M.pruefeMasse({ form: 'rechteck', w: 300, l: 600, maxW, maxL });
  assert.equal(f.length, 1);
  assert.match(f[0], /längere Seite darf höchstens 500 cm messen/);
});

test('Der angezeigte Hinweis behauptet keine feste Zuordnung Breite x Laenge', () => {
  const js = readFileSync(path.join(root, 'assets/tp-einfass-konfigurator.js'), 'utf8');
  const zeile = js.split('\n').find((l) => l.includes('grenzen.textContent') || l.includes("'Möglich: kürzere Seite bis '"));
  assert.ok(zeile, 'Zeile mit dem Grenzen-Hinweis nicht gefunden');
  const block = js.slice(js.indexOf('grenzen.textContent'), js.indexOf('grenzen.textContent') + 400);
  assert.ok(!/bis '\s*\+\s*maxW\s*\+\s*' × '/.test(block),
    'Der Hinweis nennt wieder "maxW × maxL" und widerspricht damit pruefeMasse.');
  assert.match(block, /kürzere Seite bis/);
  assert.match(block, /Reihenfolge egal/);
});
