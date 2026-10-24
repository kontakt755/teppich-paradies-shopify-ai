// Tests fuer scripts/pruefen.mjs - die gemeinsame Pruefung fuer lokal und CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHRITTE, auswahl, aufruf, bericht } from '../../scripts/pruefen.mjs';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scripts = JSON.parse(fs.readFileSync(path.join(wurzel, 'package.json'), 'utf8')).scripts;

test('jeder npm-Schritt existiert in package.json', () => {
  const fehlend = SCHRITTE.filter((s) => s.npm && !scripts[s.npm]).map((s) => s.npm);
  assert.deepEqual(fehlend, []);
});

test('jeder Guard aus package.json, den AGENTS.md vor dem Commit verlangt, ist ein Schritt', () => {
  const npm = new Set(SCHRITTE.map((s) => s.npm).filter(Boolean));
  for (const g of ['test', 'liquid:guard', 'schema:guard', 'template:guard', 'theme:guard', 'schrift:guard', 'themecheck:guard', 'secret:scan']) {
    assert.ok(npm.has(g), `${g} fehlt in pruefen`);
  }
});

test('die PR-Validierung ruft pruefen auf, statt eine eigene Liste zu fuehren', () => {
  const yml = fs.readFileSync(path.join(wurzel, '.github/workflows/pr-validation.yml'), 'utf8');
  assert.match(yml, /npm run -s pruefen/);
  assert.doesNotMatch(yml, /--ohne/, 'die CI darf keinen Schritt auslassen');
});

test('ohne Optionen laeuft jeder Schritt', () => {
  assert.ok(auswahl([]).every((s) => !s.ausgelassen));
});

test('--ohne und --nur waehlen Schritte, Unbekanntes bricht ab', () => {
  const ohne = auswahl(['--ohne', 'themecheck']);
  assert.deepEqual(ohne.filter((s) => s.ausgelassen).map((s) => s.name), ['themecheck']);
  const nur = auswahl(['--nur', 'tests,schrift']);
  assert.deepEqual(nur.filter((s) => !s.ausgelassen).map((s) => s.name), ['tests', 'schrift']);
  assert.throws(() => auswahl(['--ohne', 'gibtsnicht']), /Unbekannter Schritt/);
  assert.throws(() => auswahl(['--ohne']), /braucht eine Liste/);
  assert.throws(() => auswahl(['--static']), /Unbekannte Option/);
});

test('npm wird ueber npm_execpath gestartet, sonst ueber npm', () => {
  const s = { name: 'x', npm: 'schrift:guard' };
  assert.deepEqual(aufruf(s, { npm_execpath: '/pfad/npm-cli.js' }).args, ['/pfad/npm-cli.js', 'run', '-s', 'schrift:guard']);
  assert.deepEqual(aufruf(s, {}).args, ['run', '-s', 'schrift:guard']);
});

test('Bericht: alle Zeilen, Fehler mit Ausgabe, Exit 1', () => {
  const { text, exitCode } = bericht([
    { name: 'tests', ok: true, ms: 1200 },
    { name: 'schrift', ok: false, ms: 300, grund: 'Exit 1', ausgabe: 'a\nb\nFEHLER font-size 13px in blocks/x.liquid\n' },
    { name: 'themecheck', ausgelassen: true },
  ]);
  assert.equal(exitCode, 1);
  assert.match(text, /^OK +tests \(1 s\)/m);
  assert.match(text, /^FEHLER +schrift \(0 s\) - Exit 1/m);
  assert.match(text, /^AUSGELASSEN themecheck/m);
  assert.match(text, /--- schrift: letzte Zeilen ---\na\nb\nFEHLER font-size/);
  assert.match(text, /1 von 2 Schritten fehlgeschlagen/);
});

test('Bericht: Ausgelassenes steht auch beim Erfolg da', () => {
  const { text, exitCode } = bericht([{ name: 'tests', ok: true, ms: 0 }, { name: 'themecheck', ausgelassen: true }]);
  assert.equal(exitCode, 0);
  assert.match(text, /alle 1 Schritte bestanden\. Ausgelassen: themecheck\./);
});
