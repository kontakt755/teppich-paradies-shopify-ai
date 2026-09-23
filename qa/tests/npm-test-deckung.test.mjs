import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scripts = JSON.parse(fs.readFileSync(path.join(wurzel, 'package.json'), 'utf8')).scripts;

// OPS-015: `npm test` startete drei der sechs Suiten nicht. Wer eine neue
// Suite anlegt und das Skript vergisst, merkt es nie - die Tests laufen
// gruen, weil sie gar nicht laufen. Dieser Test findet genau das.

/** Verzeichnisse, die `npm test` ueber seine Kette tatsaechlich startet. */
function abgedeckteVerzeichnisse() {
  const gesehen = new Set();
  const offen = ['test'];
  const dirs = new Set();

  while (offen.length > 0) {
    const name = offen.pop();
    if (gesehen.has(name)) continue;
    gesehen.add(name);
    const befehl = scripts[name];
    if (!befehl) continue;

    for (const [, weiter] of befehl.matchAll(/npm run ([\w:.-]+)/g)) offen.push(weiter);
    for (const [, dir] of befehl.matchAll(/node --test ([^\s*]+)\/\*\.test\.mjs/g)) dirs.add(dir);
  }
  return dirs;
}

/**
 * Verzeichnisse mit Tests, die `npm test` bewusst nicht startet.
 * Jeder Eintrag braucht einen Grund - sonst ist das hier eine Ausrede.
 */
const BEWUSST_AUSSEN = {
  // Leer, und das soll so bleiben. `.claude/hooks` stand hier bis 2026-09-23,
  // solange offen war, wie der Guard mit dem Loeschen benannter Zweige umgeht.
  // Seit das entschieden ist, laeuft es in der Kette mit.
};

function testverzeichnisse() {
  const gefunden = execFileSync('git', ['ls-files', '*.test.mjs'], { cwd: wurzel, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((datei) => path.dirname(datei));
  return new Set(gefunden);
}

test('npm test startet jede Testsuite im Repository', () => {
  const abgedeckt = abgedeckteVerzeichnisse();
  const vorhanden = testverzeichnisse();

  const fehlend = [...vorhanden].filter((d) => !abgedeckt.has(d) && !(d in BEWUSST_AUSSEN));

  assert.deepEqual(
    fehlend,
    [],
    `Diese Verzeichnisse enthalten Tests, die "npm test" nicht startet: ${fehlend.join(', ')}. `
    + 'Entweder in die Kette von "test" in package.json aufnehmen oder mit Begruendung '
    + 'in BEWUSST_AUSSEN eintragen.'
  );
});

test('jede Ausnahme nennt ein Verzeichnis, das es noch gibt', () => {
  const vorhanden = testverzeichnisse();
  for (const dir of Object.keys(BEWUSST_AUSSEN)) {
    assert.ok(vorhanden.has(dir), `Ausnahme "${dir}" hat keine Tests mehr - Eintrag entfernen.`);
  }
});

test('npm test deckt die sieben bekannten Suiten ab', () => {
  const abgedeckt = abgedeckteVerzeichnisse();
  for (const dir of ['qa/tests', 'docs/ai-dashboard/tests', 'operations/tests',
    'automation/tests', 'workflow/tests', 'control-center/tests', '.claude/hooks']) {
    assert.ok(abgedeckt.has(dir), `${dir} fehlt in der Kette von "npm test"`);
  }
});
