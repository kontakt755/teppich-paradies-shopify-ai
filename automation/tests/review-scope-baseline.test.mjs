import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { describeReviewScope, detectReviewScope, parsePorcelainPaths, reviewRequired, selectTaskChanges, snapshotDirtyFiles, REVIEW_SCOPE_COMMITTED, REVIEW_SCOPE_NONE, REVIEW_SCOPE_UNCOMMITTED, REVIEW_SCOPE_UNKNOWN } from '../core/review-scope.mjs';

// 2026-09-11: Eine Sitzung, die nur eine Datei ausserhalb des Repositorys
// geaendert hatte, bekam zwei Runden CHANGES_REQUIRED. Der Pruefbereich
// enthielt docs/ai-dashboard/issues.json (Dashboard-Bot) und eine Datei, die
// eine andere Sitzung schon vor Task-Start uncommittet liegen hatte.

// Echtes git in einem Wegwerf-Repository: der Fehler lag im Zusammenspiel von
// git status und Dateiinhalt, das laesst sich mit Strings allein nicht belegen.
function tempRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-review-scope-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  git('init', '-q');
  write('domains/lieferanten/README.md', 'Stand\n');
  write('docs/ai-dashboard/issues.json', '{"v":1}\n');
  write('automation/core/tool.mjs', 'export const a = 1;\n');
  git('add', '.');
  git('commit', '-qm', 'init');
  return { root, git, write, head: git('rev-parse', 'HEAD').trim() };
}

test('parsePorcelainPaths liest das -z-Format: fuehrendes Leerzeichen, Leerzeichen im Namen, Umbenennung, neuer Ordner', () => {
  const porcelain = ' M a.js\0 M mit leer.md\0R  neu.txt\0alt.txt\0?? neu/dir/f.md\0';
  assert.deepEqual(parsePorcelainPaths(porcelain), ['a.js', 'mit leer.md', 'neu.txt', 'alt.txt', 'neu/dir/f.md']);
  assert.deepEqual(parsePorcelainPaths(' M a.js\n?? b.md'), ['a.js', 'b.md'], 'altes Zeilenformat');
  assert.deepEqual(parsePorcelainPaths(''), []);
});

test('selectTaskChanges: unveraendert Vorgefundenes ist fremd, Neues und weiter Veraendertes gehoert zum Task', () => {
  const baseline = { 'fremd.md': 'sha256:a', 'geteilt.mjs': 'sha256:a' };
  const current = { 'fremd.md': 'sha256:a', 'geteilt.mjs': 'sha256:b', 'neu.mjs': 'sha256:c', 'docs/ai-dashboard/issues.json': 'sha256:d' };
  const result = selectTaskChanges({ current, baseline });
  assert.deepEqual(result.taskFiles, ['geteilt.mjs', 'neu.mjs']);
  assert.deepEqual(result.preexisting, ['geteilt.mjs']);
  assert.deepEqual(result.foreign, ['fremd.md']);
  assert.deepEqual(result.botOwned, ['docs/ai-dashboard/issues.json']);
});

test('docs/ai-dashboard/issues.json ist nie im Pruefbereich, auch ohne Snapshot vom Task-Start', () => {
  const mixed = describeReviewScope({ porcelain: ' M a.js\0 M docs/ai-dashboard/issues.json\0' });
  assert.equal(mixed.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.deepEqual(mixed.files, ['a.js']);
  assert.match(mixed.text, /docs\/ai-dashboard\/issues\.json gehört dem Dashboard-Bot/);
  const onlyBot = describeReviewScope({ porcelain: ' M docs/ai-dashboard/issues.json\0' });
  assert.equal(onlyBot.kind, REVIEW_SCOPE_NONE);
  assert.match(onlyBot.text, /es gibt keine uncommitteten Änderungen dieses Tasks/);
  assert.doesNotMatch(onlyBot.text, /Working Tree ist sauber/);
});

test('Akzeptanz: vor Task-Start schmutzige fremde Datei ist nicht im Pruefbereich - ohne eigene Aenderung greift NONE', t => {
  const repo = tempRepo(t);
  repo.write('domains/lieferanten/README.md', 'Stand\nfremde Ergaenzung\n');
  repo.write('docs/ai-dashboard/issues.json', '{"v":2}\n');
  const baseline = snapshotDirtyFiles({ cwd: repo.root });
  assert.deepEqual(Object.keys(baseline).sort(), ['docs/ai-dashboard/issues.json', 'domains/lieferanten/README.md']);
  assert.match(baseline['domains/lieferanten/README.md'], /^sha256:[0-9a-f]{64}$/);
  // Der Bot schreibt weiter, die fremde Datei bleibt liegen, dieser Task
  // aendert nichts im Repository.
  repo.write('docs/ai-dashboard/issues.json', '{"v":3}\n');
  const scope = detectReviewScope({ cwd: repo.root, sinceRef: repo.head, baseline });
  assert.equal(scope.kind, REVIEW_SCOPE_NONE);
  assert.deepEqual(scope.files, []);
  assert.deepEqual([...scope.excluded].sort(), ['docs/ai-dashboard/issues.json', 'domains/lieferanten/README.md']);
  assert.match(scope.text, /Ausdrücklich NICHT Teil dieses Auftrags und kein Befund/);
  assert.match(scope.text, /domains\/lieferanten\/README\.md lag schon bei Task-Start mit identischem Inhalt/);
  assert.match(scope.text, /belegter No-op, dann PASS/);
});

test('Akzeptanz: eigene Aenderung an derselben Datei nach Task-Start ist im Pruefbereich', t => {
  const repo = tempRepo(t);
  // Dieselbe Zeile zweimal geaendert: die Zeilenbilanz (+1/-1) bleibt gleich,
  // nur der Inhalts-Hash bemerkt die zweite Aenderung.
  repo.write('domains/lieferanten/README.md', 'Stand fremd\n');
  const baseline = snapshotDirtyFiles({ cwd: repo.root });
  repo.write('domains/lieferanten/README.md', 'Stand eigen\n');
  const scope = detectReviewScope({ cwd: repo.root, sinceRef: repo.head, baseline });
  assert.equal(scope.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.deepEqual(scope.files, ['domains/lieferanten/README.md']);
  assert.match(scope.text, /seit Beginn dieses Tasks entstandenen uncommitteten Änderungen an dieser Datei: domains\/lieferanten\/README\.md/);
  assert.match(scope.text, /schon vor Task-Start uncommittet verändert/);
});

test('eigene neue Datei in einem schon vorhandenen fremden, ungetrackten Ordner zaehlt, eine eigene Loeschung auch', t => {
  const repo = tempRepo(t);
  repo.write('neu/fremd.md', 'fremd\n');
  const baseline = snapshotDirtyFiles({ cwd: repo.root });
  repo.write('neu/eigen.mjs', 'export const x = 1;\n');
  fs.rmSync(path.join(repo.root, 'automation/core/tool.mjs'));
  const scope = detectReviewScope({ cwd: repo.root, sinceRef: repo.head, baseline });
  assert.equal(scope.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.deepEqual([...scope.files].sort(), ['automation/core/tool.mjs', 'neu/eigen.mjs']);
  assert.deepEqual(scope.excluded, ['neu/fremd.md']);
});

test('eigener Commit bei fremder schmutziger Datei: COMMITTED, ohne die Behauptung eines leeren git diff', t => {
  const repo = tempRepo(t);
  repo.write('domains/lieferanten/README.md', 'Stand\nfremde Ergaenzung\n');
  const baseline = snapshotDirtyFiles({ cwd: repo.root });
  repo.write('automation/core/tool.mjs', 'export const a = 2;\n');
  repo.git('add', 'automation/core/tool.mjs');
  repo.git('commit', '-qm', 'eigener fix');
  const scope = detectReviewScope({ cwd: repo.root, sinceRef: repo.head, baseline });
  assert.equal(scope.kind, REVIEW_SCOPE_COMMITTED);
  assert.equal(scope.commits.length, 1);
  assert.match(scope.text, /eigener fix/);
  assert.doesNotMatch(scope.text, /leerer "git diff" ist hier erwartet/);
  assert.match(scope.text, /domains\/lieferanten\/README\.md lag schon bei Task-Start/);
});

test('snapshotDirtyFiles liefert null bei einem git-Fehler und {} bei sauberem Working Tree', t => {
  assert.equal(snapshotDirtyFiles({ cwd: '/nirgends', exec: () => { throw new Error('not a git repository'); } }), null);
  const repo = tempRepo(t);
  assert.deepEqual(snapshotDirtyFiles({ cwd: repo.root }), {});
});

test('ohne Snapshot (State von vor diesem Feld) bleibt jede schmutzige Datei ausser issues.json im Pruefbereich', t => {
  const repo = tempRepo(t);
  repo.write('domains/lieferanten/README.md', 'Stand\nfremde Ergaenzung\n');
  const scope = detectReviewScope({ cwd: repo.root, sinceRef: repo.head, baseline: null });
  assert.equal(scope.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.deepEqual(scope.files, ['domains/lieferanten/README.md']);
  assert.match(scope.text, /die aktuell uncommitteten Änderungen/);
});

test('reviewRequired: nur eine Frage oder Diagnose ohne jede Aenderung kommt ohne Review aus', () => {
  assert.equal(reviewRequired({ taskType: 'ANALYSIS', scope: { kind: REVIEW_SCOPE_NONE } }), false);
  for (const kind of [REVIEW_SCOPE_UNCOMMITTED, REVIEW_SCOPE_COMMITTED, REVIEW_SCOPE_UNKNOWN]) {
    assert.equal(reviewRequired({ taskType: 'ANALYSIS', scope: { kind } }), true, kind);
  }
  assert.equal(reviewRequired({ taskType: 'IMPLEMENTATION', scope: { kind: REVIEW_SCOPE_NONE } }), true);
  assert.equal(reviewRequired({ scope: { kind: REVIEW_SCOPE_NONE } }), true, 'State ohne taskType stammt von einer Umsetzung');
});
