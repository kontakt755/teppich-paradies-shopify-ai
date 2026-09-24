// S-20: Ein Streichpreis oder Sale-Badge darf nur erscheinen, wenn fuer das Produkt eine
// Preisaktion laeuft (snippets/tp-aktion-aktiv.liquid). Hintergrund: am 2026-09-20 standen
// vier Produkte seit ueber 30 Tagen mit einem unbelegten Streichpreis im Shop. Ein
// compare_at_price, der im Admin stehen bleibt, darf allein nichts mehr anzeigen.
//
// Der Test ist bewusst strukturell: jede Theme-Datei, die compare_at_price liest, muss
// auch das gemeinsame Snippet fragen. Wer eine neue Preisanzeige baut, faellt hier auf.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Reine Formatierer ohne eigene Entscheidung, ob ein Streichpreis erscheint.
const AUSNAHMEN = new Set(['snippets/tp-aktion-aktiv.liquid', 'snippets/tp-rabatt-sichtbar.liquid', 'snippets/format-price.liquid']);

const dateien = ['blocks', 'snippets', 'sections'].flatMap((ordner) =>
  readdirSync(path.join(root, ordner))
    .filter((name) => name.endsWith('.liquid'))
    .map((name) => `${ordner}/${name}`));

const mitStreichpreis = dateien.filter((datei) =>
  !AUSNAHMEN.has(datei) && /compare_at_price/.test(readFileSync(path.join(root, datei), 'utf8')));

test('es gibt Dateien mit compare_at_price - sonst prueft dieser Test nichts', () => {
  assert.ok(mitStreichpreis.length >= 5, `nur ${mitStreichpreis.length} gefunden`);
});

for (const datei of mitStreichpreis) {
  test(`${datei}: Streichpreis haengt an tp-rabatt-sichtbar`, () => {
    const code = readFileSync(path.join(root, datei), 'utf8');
    assert.match(code, /render 'tp-rabatt-sichtbar'/, 'Die Datei liest compare_at_price, fragt aber nicht das gemeinsame Aktions-Snippet.');
    // Jede Vergleichsbedingung "compare... > ..." muss in derselben Zeile ein Aktions-Flag tragen.
    const offen = code.split('\n').filter((zeile) =>
      /\bif\b.*compare_at_price[^\n]*>/.test(zeile) && !/aktion\s*==\s*'ja'/.test(zeile));
    assert.deepEqual(offen.map((z) => z.trim()), [], 'Bedingung zeigt einen Streichpreis ohne aktive Aktion.');
  });
}

// Funktionsprobe an einem echten Preis-Snippet: derselbe Streichpreis erscheint mit
// laufender Aktion und bleibt ohne Aktion weg.
const { Liquid } = await import('liquidjs');
const ohneDoc = (datei) => readFileSync(path.join(root, datei), 'utf8')
  .replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g, '');
let sqm = ohneDoc('snippets/tp-price-per-sqm.liquid');
sqm = sqm.slice(0, sqm.indexOf('{% stylesheet %}'));
const engine = new Liquid({ templates: {
  'tp-aktion-aktiv': ohneDoc('snippets/tp-aktion-aktiv.liquid'),
  'tp-rabatt-sichtbar': ohneDoc('snippets/tp-rabatt-sichtbar.liquid'),
  'tp-paketinhalt': '',
} });
engine.registerFilter('money_without_currency', (c) => (Number(c) / 100).toFixed(2).replace('.', ','));
const heute = new Date().toISOString().slice(0, 10);
const gestern = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const paket = (aktion) => ({
  selected_variant: { price: 2495, compare_at_price: 2995 },
  sqm_per_package: 1,
  product: { metafields: { aktion } },
});

test('Paketpreis: Streichpreis 29,95 erscheint nur mit laufender Aktion', async () => {
  const ohne = await engine.parseAndRender(sqm, paket({}));
  assert.doesNotMatch(ohne, /tp-price-per-sqm__compare/);
  assert.match(ohne, /24,95/);

  const mit = await engine.parseAndRender(sqm, paket({ start: { value: heute } }));
  assert.match(mit, /tp-price-per-sqm__compare[\s\S]*29,95/);

  const vorbei = await engine.parseAndRender(sqm, paket({ start: { value: '2026-01-01' }, ende: { value: gestern } }));
  assert.doesNotMatch(vorbei, /tp-price-per-sqm__compare/);
});

test('Dauerrabatt (aktion.klasse = preisanker) zeigt den Streichpreis ohne Aktionsdatum', async () => {
  const mit = await engine.parseAndRender(sqm, paket({ klasse: { value: 'preisanker' } }));
  assert.match(mit, /tp-price-per-sqm__compare[\s\S]*29,95/);
  const andere = await engine.parseAndRender(sqm, paket({ klasse: { value: 'premium' } }));
  assert.doesNotMatch(andere, /tp-price-per-sqm__compare/);
});

test('Verlegeservice-Hinweis fragt weiter nur die befristete Aktion', () => {
  const code = readFileSync(path.join(root, 'blocks/tp-verlegeservice-hinweis.liquid'), 'utf8');
  assert.match(code, /render 'tp-aktion-aktiv'/);
  assert.doesNotMatch(code, /tp-rabatt-sichtbar/);
});
