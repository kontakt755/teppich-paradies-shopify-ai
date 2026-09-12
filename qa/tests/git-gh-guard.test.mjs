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

// --- Kombinierte Kurzflags ----------------------------------------------
//
// git fasst Kurzflags zusammen: "-fq" ist dasselbe wie "-f -q". Eine Regel,
// die ein einzelnes Kurzflag mit "\b" abschliesst, greift dann nicht mehr.
//
// Das war am 2026-09-12 zweimal offen: erst bei "git branch" ("-df" statt
// "-D"), dann bei "git push" ("-fq" statt "-f"). Der Push-Fall ist an einem
// Wegwerf-Repo belegt - der normale Push wurde als non-fast-forward
// abgewiesen, "git push -fq" hat den Remote-Commit ueberschrieben.
for (const cmd of [
  'git push -fq origin main',
  'git push -qf origin main',
  'git push -fu origin main',
  'git push -f origin main',
  'git update-ref -zd refs/heads/x',
  'git update-ref -d refs/heads/x',
  'git clean -xfd',
]) test(`kombiniertes Kurzflag blockiert: ${cmd}`, () => assert.equal(blockiert(cmd), true));

// Lange Optionen, die zufaellig ein "f" tragen, duerfen nicht mitgehen.
for (const cmd of [
  'git push --follow-tags origin main',
  'git push origin main',
  'git push -u origin feature/neu',
  'git update-ref --stdin',
  'git branch --list',
]) test(`kein Fehlalarm: ${cmd}`, () => assert.equal(blockiert(cmd), false));

for (const cmd of ['git status', 'npm run task -- list']) {
  test(`unberuehrt erlaubt: ${cmd}`, () => assert.equal(blockiert(cmd), false));
}

// --- Branch loeschen ----------------------------------------------------
//
// "git branch -d" darf durch: git selbst verweigert es, solange die Commits
// nirgends sonst haengen. Die Merge-Pruefung macht damit git und nicht diese
// Regex. Gesperrt bleibt alles, was genau diese Pruefung aushebelt.
for (const cmd of [
  'git branch -d feature/alt',
  'git branch --delete feature/alt',
  'git branch -d feature/alt fix/alt',
  // Branchnamen mit grossem D duerfen nicht als "-D" gelesen werden.
  'git branch -d fix/ABC-Dev',
  'git branch --list',
]) test(`erlaubt: ${cmd}`, () => assert.equal(blockiert(cmd), false));

// "-D" mit ausgeschriebenen Namen ist erlaubt: wer den Namen tippt, hat den
// Branch angesehen. Alles, was ueber eine Liste faehrt, bleibt gesperrt.
for (const cmd of [
  'git branch -D feature/alt',
  'git branch -D feature/alt fix/alt',
  'git branch --delete --force feature/alt',
  'git branch --force --delete feature/alt',
  `git checkout -- ${BOT} && git branch -D feature/alt`,
]) test(`erlaubt: ${cmd}`, () => assert.equal(blockiert(cmd), false));

for (const cmd of [
  // Ohne Namen: das ist kein gezieltes Loeschen.
  'git branch -D',
  // Befehlsersetzung und Platzhalter sind ein Sweep, kein Einzelfall.
  'git branch -D $(git branch | grep alt)',
  'git branch -D `git branch --merged`',
  'git branch -D feature/*',
  'git branch -D "$BRANCH"',
  'git for-each-ref --format="%(refname:short)" | xargs git branch -D',
  // Kombinierte Kurzflags sind nicht ausgeschrieben genug.
  'git branch -rD feature/alt',
  // -df und -fd fassen d und f in einem Flag zusammen. Bis 2026-09-12 passierten
  // sie den Guard, weil kein grosses D und keine zwei Token vorlagen - damit war
  // auch der Sweep offen, den die Ausnahme gerade verhindern soll.
  'git branch -df feature/alt',
  'git branch -fd feature/alt',
  'git branch -df $(git branch --format="%(refname:short)")',
  'git branch -fd $(git branch | grep alt)',
  'git branch -df "$BRANCH"',
  'git for-each-ref --format="%(refname:short)" | xargs git branch -df',
  'git for-each-ref --format="%(refname:short)" | xargs git branch -fd',
  'git branch -d --force feature/alt',
  // Die Ausnahme darf nichts decken, was hinter ihr haengt.
  'git branch -D feature/alt && git reset --hard',
  'git branch -D feature/alt > wichtig.txt',
]) test(`blockiert: ${cmd}`, () => assert.equal(blockiert(cmd), true));

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

// --- git-Aufrufe ueber einen Pfad --------------------------------------
//
// "/usr/bin/git push --force" ist derselbe Befehl, das Praefix steht aber vor
// dem Token: die Erkennung sah kein "git" nach Zeilenanfang oder Leerzeichen,
// und keine Regel mit ^git griff. Am 2026-09-12 aufgefallen (unabhaengige
// Pruefung) - damit war nicht nur die Sweep-Sperre offen, sondern jede Regel
// dieser Datei. Der Pfad wird jetzt abgeschnitten und der Rest wie ein nackter
// Aufruf geprueft.
for (const cmd of [
  '/usr/bin/git branch -df feature/alt',
  '/usr/bin/git branch -fd feature/alt',
  '/usr/bin/git branch -D $(git branch | grep alt)',
  '/usr/bin/git push --force origin main',
  '/usr/bin/git reset --hard',
  './git branch -df alt',
  'git for-each-ref --format="%(refname:short)" | xargs /usr/bin/git branch -fd',
]) test(`blockiert mit Pfadpraefix: ${cmd}`, () => assert.equal(blockiert(cmd), true));

// Der Pfad darf nichts zusaetzlich sperren: was nackt erlaubt ist, bleibt es.
for (const cmd of [
  '/usr/bin/git status',
  '/usr/bin/git branch -d feature/alt',
  '/usr/bin/git branch -D feature/alt',
  '/usr/bin/git branch --delete --force feature/alt',
]) test(`erlaubt mit Pfadpraefix: ${cmd}`, () => assert.equal(blockiert(cmd), false));

test('die Ausnahme gilt auch mit Pfadpraefix', () => {
  assert.equal(blockiert(`/usr/bin/git checkout -- ${BOT}`), false);
});

test('harmlose Befehle bleiben auch hinter einem Vorspann erlaubt', () => {
  for (const cmd of ['xargs -n1 git status', 'sudo git log --oneline', 'env FOO=1 git diff']) {
    assert.equal(blockiert(cmd), false, cmd);
  }
});

test('die Ausnahme gilt auch hinter einem Vorspann', () => {
  assert.equal(blockiert(`xargs -n1 git checkout -- ${BOT}`), false);
});
