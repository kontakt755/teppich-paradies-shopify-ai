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
