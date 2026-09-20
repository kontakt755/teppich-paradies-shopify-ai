// Die groesste bestellbare Teppichbreite kommt vom Teppichboden, aus dem zugeschnitten
// wird (Inhaber, 2026-09-20): manche Qualitaeten gibt es in 500 cm, andere nur in 400,
// und nicht jede Farbe in jeder Breite. snippets/tp-teppich-max-breite.liquid ist die
// einzige Quelle fuer Karte und Konfigurator. Rendert das echte Snippet mit LiquidJS.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Liquid } from 'liquidjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = readFileSync(path.join(root, 'snippets/tp-teppich-max-breite.liquid'), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
const engine = new Liquid();

const v = (farbe, rb, available = true) => ({
  option1: farbe, available, metafields: { custom: { rollenbreite: { value: rb } } },
});
const teppich = ({ varianten, art = 'Ketteln', fest = 400 }) => ({
  metafields: { service: {
    einfassung: { value: art },
    max_breite_cm: { value: fest },
    einfass_basis: varianten ? { value: { variants: varianten } } : undefined,
  } },
});
const max = async (product, farbe) =>
  (await engine.parseAndRender(source, { product, farbe })).trim();

const zweiBreiten = [v('Sand', 4.0), v('Sand', 5.0), v('Creme', 4.0), v('Creme', 5.0, false), v('Sand', null)];

test('Teppichboden in 400 und 500 cm: groesste Breite ist 500', async () => {
  assert.equal(await max(teppich({ varianten: zweiBreiten })), '500');
});
test('je Farbe: nicht verfuegbare 500er Rolle zaehlt nicht', async () => {
  assert.equal(await max(teppich({ varianten: zweiBreiten }), 'Sand'), '500');
  assert.equal(await max(teppich({ varianten: zweiBreiten }), 'Creme'), '400');
});
test('nur 400er Rollen: 400, auch wenn das feste Feld mehr sagt', async () => {
  assert.equal(await max(teppich({ varianten: [v('Sand', 4.0)], fest: 500 })), '400');
});
test('Cover: 10 cm schmaler als die Rolle', async () => {
  assert.equal(await max(teppich({ varianten: zweiBreiten, art: 'Cover' })), '490');
});
test('Teppichboden ohne Rollenbreiten: Rueckfall auf service.max_breite_cm', async () => {
  assert.equal(await max(teppich({ varianten: [v('Sand', null)] })), '400');
  assert.equal(await max(teppich({ varianten: null })), '400');
});
test('unbekannte Farbe am Teppichboden: Rueckfall statt 0', async () => {
  assert.equal(await max(teppich({ varianten: zweiBreiten }), 'Lila'), '400');
});
