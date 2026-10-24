// Tests fuer scripts/pruefen.mjs - die gemeinsame Pruefung fuer lokal und CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHRITTE, auswahl, aufruf, bericht, fehlerzeilen } from '../../scripts/pruefen.mjs';

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

// Codex-Review #1667: `import.meta.url === file://argv[1]` war bei Leerzeichen im
// Pfad und unter Windows nie wahr - main() lief nicht, Exit 0 ohne Pruefung.
test('der Programmeinstieg laeuft auch aus einem Pfad mit Leerzeichen (falsche Option -> Exit 2)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp pruefen '));
  const kopie = path.join(dir, 'pruefen.mjs');
  fs.copyFileSync(path.join(wurzel, 'scripts/pruefen.mjs'), kopie);
  const r = spawnSync(process.execPath, [kopie, '--nur', 'gibtsnicht'], { encoding: 'utf8' });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /Unbekannter Schritt/);
});

test('Fehlerzeilen: Testnamen und Abbruchgrund stehen vor dem Stacktrace', () => {
  const ausgabe = [
    '✔ alles gut (1ms)',
    '✖ Browser-Uebergabe zeigt das Formular (120ms)',
    '[1234:5678:1024/082756.123:FATAL:zygote_host_impl_linux.cc(128)] No usable sandbox!',
    'Error: Failed to launch the browser process!',
    ...Array.from({ length: 40 }, (_, i) => `  #${i} 0x55ec8f799db3 (/home/runner/chrome+0x6ec4db2)`),
    '✖ Browser-Uebergabe zeigt das Formular (120ms)',
  ].join('\n');
  assert.deepEqual(fehlerzeilen(ausgabe), [
    '✖ Browser-Uebergabe zeigt das Formular (120ms)',
    '[1234:5678:1024/082756.123:FATAL:zygote_host_impl_linux.cc(128)] No usable sandbox!',
    'Error: Failed to launch the browser process!',
  ]);
  const { text } = bericht([{ name: 'tests', ok: false, ms: 0, grund: 'Exit 1', ausgabe }]);
  assert.ok(text.indexOf('Fehlerzeilen') < text.indexOf('letzte Zeilen'));
  assert.match(text, /No usable sandbox/);
});
