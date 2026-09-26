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
const sync = (modus, ordner) => spawnSync('bash', [HOOK, modus, ordner], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });

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
