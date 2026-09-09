/**
 * Haelt die Ausnahme in .claude/hooks/git-gh-guard.mjs eng.
 *
 * Der Hook blockiert jedes Verwerfen im Working Tree. Genau ein Pfad ist
 * ausgenommen: docs/ai-dashboard/issues.json, die Bot-Datei, die der
 * Sync-Workflow ohnehin stuendlich neu schreibt.
 *
 * Eine Ausnahme in einer Sicherheitsregel wird beim naechsten Anfassen leicht
 * breiter, als sie gemeint war - "git checkout -- ." ist nur ein Zeichen
 * entfernt. Deshalb steht hier die Grenze, nicht nur der Gutfall.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const hook = path.join(import.meta.dirname, '..', '..', '.claude', 'hooks', 'git-gh-guard.mjs');

/** true = der Hook verweigert den Befehl. */
const blockiert = (command) => {
  const out = execFileSync('node', [hook], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  });
  return out.trim().length > 0;
};

const BOT = 'docs/ai-dashboard/issues.json';

for (const cmd of [
  `git checkout -- ${BOT}`,
  `git checkout -- ./${BOT}`,
  `git restore ${BOT}`,
  `git restore -- ${BOT}`,
]) test(`erlaubt: ${cmd}`, () => assert.equal(blockiert(cmd), false));

for (const cmd of [
  'git checkout -- .',
  'git checkout -- CLAUDE.md',
  'git restore .',
  'git restore CLAUDE.md',
  // Ein zweiter Pfad hinter der Bot-Datei wuerde fremde Arbeit mitverwerfen.
  `git checkout -- ${BOT} CLAUDE.md`,
  // Praefix-Treffer duerfen nicht durchrutschen.
  `git checkout -- ${BOT}X`,
  // Die Ausnahme darf nichts decken, was hinter ihr in derselben Zeile haengt.
  `git checkout -- ${BOT} && git reset --hard`,
  `git checkout -- ${BOT} && git checkout -- .`,
]) test(`blockiert: ${cmd}`, () => assert.equal(blockiert(cmd), true));

// Die uebrigen Regeln bleiben unberuehrt.
for (const cmd of [
  'git reset --hard',
  'git stash drop',
  'git push --force',
  'git clean -fd',
  'gh repo delete',
]) test(`weiterhin blockiert: ${cmd}`, () => assert.equal(blockiert(cmd), true));

for (const cmd of ['git status', 'npm run task -- list']) {
  test(`unberuehrt erlaubt: ${cmd}`, () => assert.equal(blockiert(cmd), false));
}

// --- Angehaengte Umleitungen -------------------------------------------
//
// Erlaubt sind nur Umleitungen nach /dev/null und 2>&1. Eine Umleitung in
// eine echte Datei bleibt blockiert: sie wuerde diese Datei ueberschreiben,
// und dann haette die Ausnahme fuer eine harmlose Bot-Datei ein Werkzeug
// freigegeben, das eine beliebige andere zerstoert.

for (const suffix of ['2>/dev/null', '>/dev/null', '>/dev/null 2>&1', '&>/dev/null']) {
  test(`erlaubt mit Umleitung: ${suffix}`, () => {
    assert.equal(blockiert(`git checkout -- ${BOT} ${suffix}`), false);
    assert.equal(blockiert(`git restore ${BOT} ${suffix}`), false);
  });
}

for (const suffix of ['> wichtig.txt', '>> CLAUDE.md', '2> qa/wichtig.json']) {
  test(`blockiert Umleitung in eine echte Datei: ${suffix}`, () => {
    assert.equal(blockiert(`git checkout -- ${BOT} ${suffix}`), true);
  });
}

test('eine Umleitung macht die uebrigen Grenzen nicht weicher', () => {
  for (const cmd of [
    'git checkout -- . 2>/dev/null',
    'git checkout -- CLAUDE.md 2>/dev/null',
    `git checkout -- ${BOT} CLAUDE.md 2>/dev/null`,
    `git checkout -- ${BOT}X 2>/dev/null`,
  ]) assert.equal(blockiert(cmd), true, cmd);
});

// --- git-Aufrufe hinter einem Vorspann ---------------------------------
//
// Eine Regel mit ^git greift nicht mehr, sobald der Aufruf nicht am
// Segmentanfang steht. Am 2026-09-09 war "git update-ref -d" blockiert,
// dieselbe Loeschung hinter "xargs" lief durch. Geprueft wird deshalb jede
// Stelle im Segment, an der ein git/gh-Aufruf beginnt - keine Liste
// erlaubter Vorspaenne, die bliebe immer unvollstaendig.

for (const cmd of [
  'xargs -n1 git update-ref -d',
  "git for-each-ref --format='%(refname)' refs/x/ | xargs -n1 git update-ref -d",
  'sudo git reset --hard',
  'env FOO=1 git push --force',
  'find . -exec git clean -fd {} +',
  'nohup git stash clear',
  'sh -c "git stash drop"',
  `xargs git checkout -- .`,
]) test(`blockiert hinter Vorspann: ${cmd}`, () => assert.equal(blockiert(cmd), true));

test('harmlose Befehle bleiben auch hinter einem Vorspann erlaubt', () => {
  for (const cmd of ['xargs -n1 git status', 'sudo git log --oneline', 'env FOO=1 git diff']) {
    assert.equal(blockiert(cmd), false, cmd);
  }
});

test('die Ausnahme gilt auch hinter einem Vorspann', () => {
  assert.equal(blockiert(`xargs -n1 git checkout -- ${BOT}`), false);
});
