import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Bezugsweg im Bestelldialog (Inhaber 2026-11-04). Nur synthetische Werte; die Ansicht wird wie in
// kettelpuffer-hinweis.test.mjs ohne Importe geladen.
const quelle = fs.readFileSync(new URL('../ansichten/einkauf/lieferanten.mjs', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s/gm, '');
const { bezugswegHinweis } = vm.runInNewContext(`${quelle}\n({ bezugswegHinweis })`, {
  state: {}, einkauf: {}, esc: v => String(v ?? '').replace(/</g, '&lt;'), anzeigeWert: v => v,
});

test('Bezugsweg: Kunde in der Naehe bekommt den Hinweis auf die Rolle beim Hersteller', () => {
  const html = bezugswegHinweis({ bezugsweg: { nah: [{ orderName: '#T1', ort: '16515 Teststadt' }], weit: [] } });
  assert.match(html, /Kunde in der Nähe/);
  assert.match(html, /#T1 · 16515 Teststadt/);
  assert.match(html, /Hersteller/);
  assert.doesNotMatch(html, /Speditionskosten/);
});

test('Bezugsweg: Kunde weiter weg bekommt nur die ruhige Zeile zum Grosshandel', () => {
  const html = bezugswegHinweis({ bezugsweg: { nah: [], weit: [{ orderName: '#T2', ort: '80331 Teststadt' }] } });
  assert.match(html, /Großhandel/);
  assert.match(html, /Speditionskosten/);
  assert.doesNotMatch(html, /class="notice/);
});

test('Bezugsweg: ohne Daten kein Hinweis, Werte werden maskiert', () => {
  assert.equal(bezugswegHinweis({}), '');
  assert.equal(bezugswegHinweis({ bezugsweg: { nah: [], weit: [] } }), '');
  assert.doesNotMatch(bezugswegHinweis({ bezugsweg: { nah: [{ orderName: '<b>x</b>', ort: '' }], weit: [] } }), /<b>x/);
});
