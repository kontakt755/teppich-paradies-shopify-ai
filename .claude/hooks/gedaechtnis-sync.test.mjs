// Test fuer gedaechtnis-sync.sh.  Aufruf: node --test .claude/hooks/gedaechtnis-sync.test.mjs
// Arbeitet nur mit lokalen Wegwerf-Repos (bare "origin" + zwei Checkouts), kein Netz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'gedaechtnis-sync.sh');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const sync = (modus, ordner, ...vorne) => spawnSync('bash', [HOOK, ...vorne, modus, ordner], { encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });

function aufbau() {
  const basis = mkdtempSync(join(tmpdir(), 'gs-'));
  const origin = join(basis, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  const klon = (name) => {
    const p = join(basis, name);
    execFileSync('git', ['clone', '-q', origin, p], { stdio: 'ignore' });
    git(p, 'config', 'user.name', 't'); git(p, 'config', 'user.email', 't@t');
    return p;
  };
  const a = klon('a');
  writeFileSync(join(a, 'MEMORY.md'), '# Index\n');
  git(a, 'add', '-A'); git(a, 'commit', '-q', '-m', 'start'); git(a, 'push', '-q', '-u', 'origin', 'main');
  const b = klon('b');
  return { a, b };
}

test('Ordner ohne .git: still, Exit 0', () => {
  const leer = mkdtempSync(join(tmpdir(), 'gs-leer-'));
  const r = sync('push', leer);
  assert.equal(r.status, 0);
  assert.equal(r.stdout + r.stderr, '');
});

test('push bringt neue Notiz zum origin, pull holt sie auf den anderen Mac', () => {
  const { a, b } = aufbau();
  writeFileSync(join(a, 'neu.md'), 'gelernt auf a\n');
  assert.equal(sync('push', a).status, 0);
  assert.equal(sync('pull', b).status, 0);
  assert.equal(readFileSync(join(b, 'neu.md'), 'utf8'), 'gelernt auf a\n');
  assert.match(git(b, 'log', '-1', '--format=%s'), /^Gedaechtnis /);
});

test('Konflikt in derselben Datei: eigene Arbeit gewinnt, kein haengender Rebase', () => {
  const { a, b } = aufbau();
  writeFileSync(join(a, 'MEMORY.md'), '# Index\n- a\n');
  sync('push', a);
  writeFileSync(join(b, 'MEMORY.md'), '# Index\n- b\n');
  assert.equal(sync('push', b).status, 0);
  assert.ok(!existsSync(join(b, '.git', 'rebase-merge')));
  assert.equal(readFileSync(join(b, 'MEMORY.md'), 'utf8'), '# Index\n- b\n');
  sync('pull', a);
  assert.equal(readFileSync(join(a, 'MEMORY.md'), 'utf8'), '# Index\n- b\n');
});

test('kein erreichbarer origin: still, Exit 0, Arbeit bleibt lokal', () => {
  const { a } = aufbau();
  git(a, 'remote', 'set-url', 'origin', join(tmpdir(), 'gibt-es-nicht.git'));
  writeFileSync(join(a, 'x.md'), 'x\n');
  const r = sync('push', a);
  assert.equal(r.status, 0);
  assert.equal(readFileSync(join(a, 'x.md'), 'utf8'), 'x\n');
});

test('unbekannter Modus: Exit 2', () => {
  const d = mkdtempSync(join(tmpdir(), 'gs-m-')); mkdirSync(join(d, '.git'));
  assert.equal(sync('irgendwas', d).status, 2);
});

test('kein erreichbarer origin: Hook bleibt bei Exit 0, meldet es aber; --streng liefert Exit 1', () => {
  const { a } = aufbau();
  git(a, 'remote', 'set-url', 'origin', join(tmpdir(), 'gibt-es-nicht.git'));
  writeFileSync(join(a, 'y.md'), 'y\n');
  const hook = sync('push', a);
  assert.equal(hook.status, 0);
  assert.match(hook.stderr, /push fehlgeschlagen/);
  const pull = sync('pull', a);
  assert.match(pull.stdout, /Hinweis: Gedaechtnis-Sync \(pull\)/, 'beim Sitzungsstart sieht die Sitzung den Fehler');
  const streng = sync('push', a, '--streng');
  assert.equal(streng.status, 1);
  assert.match(streng.stderr, /push fehlgeschlagen/);
});

test('--streng: fehlender Ordner ist ein Fehler, als Hook nicht', () => {
  const weg = join(tmpdir(), `gs-weg-${process.pid}`);
  assert.equal(sync('pull', weg).status, 0);
  const r = sync('pull', weg, '--streng');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Ordner fehlt/);
});

test('aus einem Worktree: Ordner des Hauptcheckouts, nicht des Worktrees', () => {
  const { a } = aufbau();
  writeFileSync(join(a, 'aus-a.md'), 'neu\n');
  git(a, 'add', '-A'); git(a, 'commit', '-q', '-m', 'neu'); git(a, 'push', '-q');
  // Projekt-Repository mit Worktree, eigenes HOME mit dem Gedaechtnis des Hauptcheckouts
  const basis = mkdtempSync(join(tmpdir(), 'gs-wt-'));
  const haupt = join(basis, 'projekt');
  mkdirSync(haupt);
  git(haupt, 'init', '-q', '-b', 'main');
  writeFileSync(join(haupt, 'x'), 'x\n');
  git(haupt, 'add', '-A');
  execFileSync('git', ['commit', '-q', '-m', 'start'], { cwd: haupt, env: { ...process.env, ...GIT_ENV } });
  const wt = join(basis, 'wt');
  git(haupt, 'worktree', 'add', '-q', '-b', 'thema', wt);
  const hauptEcht = dirname(git(wt, 'rev-parse', '--path-format=absolute', '--git-common-dir'));
  const home = join(basis, 'home');
  const vault = join(home, '.claude', 'projects', hauptEcht.replace(/\//g, '-'), 'memory');
  mkdirSync(dirname(vault), { recursive: true });
  execFileSync('git', ['clone', '-q', git(a, 'remote', 'get-url', 'origin'), vault], { stdio: 'ignore' });
  writeFileSync(join(a, 'spaeter.md'), 'spaeter\n');
  git(a, 'add', '-A'); git(a, 'commit', '-q', '-m', 'spaeter'); git(a, 'push', '-q');
  const r = spawnSync('bash', [HOOK, '--streng', 'pull'], { encoding: 'utf8', env: { ...process.env, ...GIT_ENV, HOME: home, CLAUDE_PROJECT_DIR: wt } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(vault, 'spaeter.md'), 'utf8'), 'spaeter\n');
});

test('push: scheitert git add, meldet der Sync das - als Hook Exit 0, mit --streng Exit 1', () => {
  // Codex-Review #1669: vorher schob push den alten Stand erfolgreich hoch und
  // endete auch mit --streng mit Exit 0, obwohl die neue Notiz ungesichert blieb.
  const { a } = aufbau();
  writeFileSync(join(a, 'z.md'), 'z\n');
  writeFileSync(join(a, '.git', 'index.lock'), '');
  const hook = sync('push', a);
  assert.equal(hook.status, 0);
  assert.match(hook.stderr, /git add fehlgeschlagen/);
  const streng = sync('push', a, '--streng');
  assert.equal(streng.status, 1);
  assert.match(streng.stderr, /git add fehlgeschlagen/);
});
