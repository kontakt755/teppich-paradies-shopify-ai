/**
 * Zwei Shell-Hooks mit Git-Fixture (Wegwerf-Repositorys im Temp-Ordner):
 *
 * - .claude/hooks/hauptcheckout-nachziehen.sh (SessionStart): zieht nur einen
 *   losgeloesten, sauberen Hauptcheckout auf origin/main - nie einen Branch,
 *   nie einen Worktree, nie geaenderte Dateien; still und ohne Fehler.
 * - .claude/hooks/pre-commit-unmerged-branch.sh: vergleicht mit origin/main,
 *   nicht mit dem lokalen main, das im Deploy-Worktree oft hinterherhinkt.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const HOOKS = path.resolve(import.meta.dirname, '../../.claude/hooks');
const NACHZIEHEN = path.join(HOOKS, 'hauptcheckout-nachziehen.sh');
const PRECOMMIT = path.join(HOOKS, 'pre-commit-unmerged-branch.sh');

// Fremde Git-Umgebung (z. B. wenn npm test aus einem Git-Hook laeuft) und die
// globale Konfiguration des Rechners duerfen die Fixture nicht beeinflussen.
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid', CLAUDE_CODE_REMOTE: '' };
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete env[k];

const git = (cwd, args, extraEnv = {}) =>
  execFileSync('git', args, { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8' }).trim();

const TAG = 86400;
function commit(cwd, datei, alterTage = 0) {
  writeFileSync(path.join(cwd, datei), `${datei}\n`);
  git(cwd, ['add', datei]);
  const datum = `${Math.floor(Date.now() / 1000) - alterTage * TAG} +0000`;
  git(cwd, ['commit', '-q', '-m', datei], { GIT_AUTHOR_DATE: datum, GIT_COMMITTER_DATE: datum });
  return git(cwd, ['rev-parse', 'HEAD']);
}

/** origin (bare) + seed (schreibt nach origin) + haupt (Klon, losgeloest auf dem ersten Commit). */
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'tp-git-hooks-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = path.join(root, 'origin.git');
  const seed = path.join(root, 'seed');
  const haupt = path.join(root, 'haupt');
  git(root, ['init', '-q', '--bare', '-b', 'main', origin]);
  git(root, ['init', '-q', '-b', 'main', seed]);
  const a = commit(seed, 'a.txt');
  git(seed, ['remote', 'add', 'origin', origin]);
  git(seed, ['push', '-q', 'origin', 'main']);
  git(root, ['clone', '-q', origin, haupt]);
  git(haupt, ['checkout', '-q', '--detach']);
  const b = commit(seed, 'b.txt');
  git(seed, ['push', '-q', 'origin', 'main']);
  return { root, origin, seed, haupt, a, b };
}

function nachziehen(cwd, extraEnv = {}) {
  const res = spawnSync('bash', [NACHZIEHEN], { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout + res.stderr, '', 'Hook muss still bleiben');
  return git(cwd, ['rev-parse', 'HEAD']);
}

test('nachziehen: losgeloester, sauberer Hauptcheckout springt auf origin/main', (t) => {
  const f = fixture(t);
  assert.equal(nachziehen(f.haupt), f.b);
  const ref = spawnSync('git', ['symbolic-ref', '-q', 'HEAD'], { cwd: f.haupt, env });
  assert.notEqual(ref.status, 0, 'bleibt losgeloest');
});

test('nachziehen: unversionierte Dateien stoeren nicht', (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.haupt, 'notiz.log'), 'x');
  assert.equal(nachziehen(f.haupt), f.b);
});

test('nachziehen: auf einem Branch passiert nichts', (t) => {
  const f = fixture(t);
  git(f.haupt, ['checkout', '-q', '-b', 'arbeit']);
  assert.equal(nachziehen(f.haupt), f.a);
});

test('nachziehen: geaenderte Dateien bleiben unberuehrt', (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.haupt, 'a.txt'), 'geaendert\n');
  assert.equal(nachziehen(f.haupt), f.a);
  git(f.haupt, ['add', 'a.txt']);
  assert.equal(nachziehen(f.haupt), f.a);
});

test('nachziehen: ein Worktree wird nie angefasst', (t) => {
  const f = fixture(t);
  const wt = path.join(f.root, 'wt');
  git(f.haupt, ['worktree', 'add', '-q', '--detach', wt]);
  assert.equal(nachziehen(wt), f.a);
});

test('nachziehen: ohne erreichbares origin kein Fehler', (t) => {
  const f = fixture(t);
  git(f.haupt, ['remote', 'set-url', 'origin', path.join(f.root, 'gibt-es-nicht.git')]);
  assert.equal(nachziehen(f.haupt), f.a);
});

test('nachziehen: in Remote-Sessions nichts tun', (t) => {
  const f = fixture(t);
  assert.equal(nachziehen(f.haupt, { CLAUDE_CODE_REMOTE: 'true' }), f.a);
});

function precommit(cwd) {
  return spawnSync('bash', [PRECOMMIT], { cwd, env, encoding: 'utf8' });
}

test('pre-commit: in origin/main gemergt zaehlt, auch wenn lokales main hinterherhinkt', (t) => {
  const f = fixture(t);
  // Ein 40 Tage alter Commit landet in origin/main; das lokale main des
  // Klons bleibt auf dem ersten Commit stehen.
  commit(f.seed, 'alt.txt', 40);
  git(f.seed, ['push', '-q', 'origin', 'main']);
  git(f.haupt, ['branch', '-q', '-f', 'main', f.a]);
  git(f.haupt, ['fetch', '-q', 'origin']);
  git(f.haupt, ['checkout', '-q', '-b', 'gemergt', 'origin/main']);
  const res = precommit(f.haupt);
  assert.equal(res.status, 0, res.stdout);
  assert.equal(res.stdout.trim(), '');
});

test('pre-commit: alter, ungemergter Branch wird blockiert', (t) => {
  const f = fixture(t);
  git(f.haupt, ['checkout', '-q', '-b', 'vergessen']);
  commit(f.haupt, 'vergessen.txt', 40);
  const res = precommit(f.haupt);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /PRE-COMMIT BLOCK/);
  assert.match(res.stdout, /origin\/main/);
});

test('pre-commit: 10 Tage alt warnt nur', (t) => {
  const f = fixture(t);
  git(f.haupt, ['checkout', '-q', '-b', 'zehn']);
  commit(f.haupt, 'zehn.txt', 10);
  const res = precommit(f.haupt);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /WARNUNG/);
});

test('pre-commit: frischer Branch und losgeloester HEAD sind still', (t) => {
  const f = fixture(t);
  assert.equal(precommit(f.haupt).stdout.trim(), '', 'losgeloest');
  git(f.haupt, ['checkout', '-q', '-b', 'frisch']);
  commit(f.haupt, 'frisch.txt', 0);
  const res = precommit(f.haupt);
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), '');
});
