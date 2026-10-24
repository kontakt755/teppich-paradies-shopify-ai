// Programmeinstieg der Skripte ("laeuft das als Kommando oder wird es importiert?").
//
// Zwei Fehlerbilder aus PR #1667, beide still:
//   - `import.meta.url === \`file://${process.argv[1]}\`` passt bei Leerzeichen im
//     Pfad, Symlinks und unter Windows nie - das Skript endet mit Exit 0, ohne
//     etwas zu tun (Codex-Review Runde 1).
//   - `fs.realpathSync(process.argv[1])` ohne vorheriges existsSync wirft beim
//     blossen Import, wenn argv[1] kein Pfad ist (`node --input-type=module -`
//     liefert '-') (Codex-Review Runde 2).
// Richtig ist das Muster aus scripts/test-temp.mjs:
//   process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// --others: auch noch nicht committete Dateien, sonst sieht der lokale Lauf eine
// neue Datei nicht, die CI dann bemaengelt (so geschehen mit dieser Datei).
const dateien = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', '*.mjs'], { cwd: WURZEL, encoding: 'utf8' })
  .split('\n').filter((d) => d && fs.existsSync(path.join(WURZEL, d)));
const KOMMENTAR = /^\s*(\/\/|\*|\/\*)/;

function fundstellen(pruefe) {
  const treffer = [];
  for (const datei of dateien) {
    const text = fs.readFileSync(path.join(WURZEL, datei), 'utf8');
    text.split('\n').forEach((zeile, i) => { if (!KOMMENTAR.test(zeile) && pruefe(zeile)) treffer.push(`${datei}:${i + 1}`); });
  }
  return treffer;
}

test('kein Einstieg vergleicht import.meta.url mit file://argv[1]', () => {
  const muster = /import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`|`file:\/\/\$\{process\.argv\[1\]\}`\s*===\s*import\.meta\.url/;
  assert.deepEqual(fundstellen((z) => muster.test(z) && !z.includes('assert')), []);
});

test('realpathSync(argv[1]) nur nach existsSync(argv[1])', () => {
  assert.deepEqual(fundstellen((z) => z.includes('realpathSync(process.argv[1])') && !z.includes('existsSync(process.argv[1])')), []);
});

test('ein Skript mit diesem Einstieg laesst sich aus stdin importieren', () => {
  const ziel = pathToFileURL(path.join(WURZEL, 'scripts/pruefen.mjs')).href;
  const r = spawnSync(process.execPath, ['--input-type=module', '-'], { input: `import ${JSON.stringify(ziel)}; console.log('ok');`, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'ok', 'beim Import darf main() nicht laufen');
});
