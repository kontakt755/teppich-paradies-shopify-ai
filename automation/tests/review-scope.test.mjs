import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { captureWorkingTreeSnapshot, compareWithBaseline, currentCommit, describeReviewScope, detectReviewScope, isUsableBaseline, parsePorcelainZ, resolveReviewDir, shouldSkipReview, REVIEW_SCOPE_COMMITTED, REVIEW_SCOPE_NONE, REVIEW_SCOPE_UNCOMMITTED, REVIEW_SCOPE_UNKNOWN } from '../core/review-scope.mjs';

// --- Baseline vorbestehender Dateien (2026-09-11) --------------------------
// Realer Vorfall: domains/shopify/bild-qualitaetstest.py lag schon VOR
// Sitzungsbeginn unversioniert im Working Tree, .claude/launch.json war
// vorbestehend geaendert. Beide landeten im Review, Codex verlangte das
// Loeschen der fremden Datei. Die Tests laufen gegen echte Wegwerf-Repositories.

function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function vorbestehenderStand() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-review-baseline-'));
  git(dir, '-c', 'init.defaultBranch=main', 'init', '-q');
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.mkdirSync(path.join(dir, 'domains/shopify'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude/launch.json'), '{"version":"0.0.1"}\n');
  fs.writeFileSync(path.join(dir, 'README.md'), 'Readme\n');
  git(dir, 'add', '.claude/launch.json', 'README.md');
  git(dir, 'commit', '-qm', 'init');
  // Zustand bei Sitzungsbeginn: eine vorbestehend geaenderte, eine unversionierte Datei.
  fs.writeFileSync(path.join(dir, '.claude/launch.json'), '{"version":"0.0.2"}\n');
  fs.writeFileSync(path.join(dir, 'domains/shopify/bild-qualitaetstest.py'), 'print("fremd")\n');
  const baseline = captureWorkingTreeSnapshot({ cwd: dir });
  const startCommit = currentCommit({ cwd: dir });
  return { dir, baseline, startCommit };
}

test('Baseline: vorbestehende Dateien, unveraendert, werden ausgeklammert und im Text genannt', () => {
  const { dir, baseline, startCommit } = vorbestehenderStand();
  assert.equal(baseline.ok, true);
  assert.ok(isUsableBaseline(baseline));
  const scope = detectReviewScope({ cwd: dir, sinceRef: startCommit, baseline });
  assert.equal(scope.kind, REVIEW_SCOPE_NONE);
  assert.equal(scope.baselineStatus, 'APPLIED');
  assert.deepEqual(scope.excluded, ['.claude/launch.json', 'domains/shopify/bild-qualitaetstest.py']);
  assert.match(scope.text, /Vorbestehend, unverändert seit Sitzungsbeginn: \.claude\/launch\.json, domains\/shopify\/bild-qualitaetstest\.py/);
  assert.match(scope.text, /verlange weder ihre Änderung noch ihre Entfernung/);
});

test('Baseline: eine vorbestehende Datei, die die Sitzung veraendert, bleibt im Scope', () => {
  const { dir, baseline, startCommit } = vorbestehenderStand();
  fs.appendFileSync(path.join(dir, 'domains/shopify/bild-qualitaetstest.py'), 'print("geaendert")\n');
  const scope = detectReviewScope({ cwd: dir, sinceRef: startCommit, baseline });
  assert.equal(scope.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.deepEqual(scope.excluded, ['.claude/launch.json']);
});

test('Baseline: eine neue Datei der Sitzung bleibt im Scope', () => {
  const { dir, baseline, startCommit } = vorbestehenderStand();
  fs.writeFileSync(path.join(dir, 'neu.mjs'), 'export {};\n');
  const scope = detectReviewScope({ cwd: dir, sinceRef: startCommit, baseline });
  assert.equal(scope.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.ok(!scope.excluded.includes('neu.mjs'));
});

test('Baseline: vorbestehend geaendert und per Checkout zurueckgesetzt bleibt im Scope', () => {
  const { dir, baseline, startCommit } = vorbestehenderStand();
  git(dir, 'checkout', '--', '.claude/launch.json');
  const scope = detectReviewScope({ cwd: dir, sinceRef: startCommit, baseline });
  assert.equal(scope.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.deepEqual(scope.reverted, ['.claude/launch.json']);
  assert.match(scope.text, /zurückgesetzt oder entfernt.*\.claude\/launch\.json/);
});

test('Baseline: eine vorbestehende unversionierte Datei, die die Sitzung loescht, bleibt im Scope', () => {
  const { dir, baseline, startCommit } = vorbestehenderStand();
  fs.rmSync(path.join(dir, 'domains/shopify/bild-qualitaetstest.py'));
  const scope = detectReviewScope({ cwd: dir, sinceRef: startCommit, baseline });
  assert.equal(scope.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.deepEqual(scope.reverted, ['domains/shopify/bild-qualitaetstest.py']);
});

test('Baseline: nur gestagt statt geaendert ist ein anderer Zustand und bleibt im Scope', () => {
  const { dir, baseline, startCommit } = vorbestehenderStand();
  git(dir, 'add', '.claude/launch.json');
  const scope = detectReviewScope({ cwd: dir, sinceRef: startCommit, baseline });
  assert.equal(scope.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.deepEqual(scope.excluded, ['domains/shopify/bild-qualitaetstest.py']);
});

test('Baseline: ein Commit der Sitzung bleibt im Scope, vorbestehende Dateien werden trotzdem genannt', () => {
  const { dir, baseline, startCommit } = vorbestehenderStand();
  fs.writeFileSync(path.join(dir, 'README.md'), 'Readme 2\n');
  git(dir, 'add', 'README.md');
  git(dir, 'commit', '-qm', 'fix: readme');
  const scope = detectReviewScope({ cwd: dir, sinceRef: startCommit, baseline });
  assert.equal(scope.kind, REVIEW_SCOPE_COMMITTED);
  assert.equal(scope.commits.length, 1);
  assert.match(scope.text, /Vorbestehend, unverändert seit Sitzungsbeginn/);
});

test('Baseline: ein unveraenderter vorbestehender Symlink (wie node_modules im Worktree) wird ausgeklammert', () => {
  const { dir, startCommit } = vorbestehenderStand();
  fs.symlinkSync('/nirgendwo/node_modules', path.join(dir, 'node_modules'));
  const baseline = captureWorkingTreeSnapshot({ cwd: dir });
  assert.equal(baseline.entries.node_modules.link, '/nirgendwo/node_modules');
  const scope = detectReviewScope({ cwd: dir, sinceRef: startCommit, baseline });
  assert.equal(scope.kind, REVIEW_SCOPE_NONE);
  assert.ok(scope.excluded.includes('node_modules'));
});

test('Baseline: aus einem Unterverzeichnis erfasst ergibt dieselben Pfade wie aus der Wurzel', () => {
  const { dir, baseline } = vorbestehenderStand();
  const ausUnterordner = captureWorkingTreeSnapshot({ cwd: path.join(dir, 'domains') });
  assert.equal(ausUnterordner.root, baseline.root);
  assert.deepEqual(Object.keys(ausUnterordner.entries).sort(), Object.keys(baseline.entries).sort());
});

test('Baseline fehlt, ist kaputt, gescheitert oder aus einem anderen Repository: nichts wird ausgeklammert', () => {
  const { dir, baseline, startCommit } = vorbestehenderStand();
  const ohne = detectReviewScope({ cwd: dir, sinceRef: startCommit });
  assert.equal(ohne.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.equal(ohne.excluded, undefined);
  assert.equal(ohne.baselineStatus, undefined);

  const kaputt = [
    { ok: true, version: 1, root: baseline.root, entries: 'kaputt' },
    { ok: true, version: 99, root: baseline.root, entries: baseline.entries },
    { ok: false, version: 1, error: 'git status scheiterte' },
    'kein Objekt',
  ];
  for (const broken of kaputt) {
    const scope = detectReviewScope({ cwd: dir, sinceRef: startCommit, baseline: broken });
    assert.equal(scope.kind, REVIEW_SCOPE_UNCOMMITTED, JSON.stringify(broken));
    assert.equal(scope.baselineStatus, 'UNUSABLE');
    assert.equal(scope.excluded, undefined);
  }

  // Eintraege ohne Statuscodes oder Hash werden nie ausgeklammert.
  const ohneHash = { ...baseline, entries: { '.claude/launch.json': { codes: [' M'] }, 'domains/shopify/bild-qualitaetstest.py': {} } };
  assert.equal(detectReviewScope({ cwd: dir, sinceRef: startCommit, baseline: ohneHash }).kind, REVIEW_SCOPE_UNCOMMITTED);

  const anderes = vorbestehenderStand();
  const fremd = detectReviewScope({ cwd: dir, sinceRef: startCommit, baseline: anderes.baseline });
  assert.equal(fremd.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.equal(fremd.baselineStatus, 'ROOT_MISMATCH');

  const gitKaputt = (cmd, args) => {
    if (args[0] === 'status') return ' M a.js';
    throw new Error('git weg');
  };
  const scheitert = detectReviewScope({ cwd: dir, baseline, exec: gitKaputt });
  assert.equal(scheitert.baselineStatus, 'CAPTURE_FAILED');
  assert.equal(scheitert.excluded, undefined);
});

// Pruefung 2026-09-11: git hash-object --stdin-paths entquotet Zeilen, die mit
// " beginnen, und schneidet \r ab - die Baseline trug den Hash der Nachbardatei.
test('Baseline: Pfade mit fuehrendem Anfuehrungszeichen oder CR sind nicht hashbar und werden nie ausgeklammert', () => {
  const { dir, startCommit } = vorbestehenderStand();
  fs.writeFileSync(path.join(dir, '"q"'), 'original\n');
  fs.writeFileSync(path.join(dir, 'q'), 'nachbar\n');
  fs.writeFileSync(path.join(dir, 'a\r'), 'original\n');
  fs.writeFileSync(path.join(dir, 'a'), 'nachbar\n');
  const baseline = captureWorkingTreeSnapshot({ cwd: dir });
  assert.equal(baseline.ok, true);
  assert.equal(baseline.entries['"q"'].unhashable, true);
  assert.equal(baseline.entries['a\r'].unhashable, true);
  assert.equal(baseline.entries['"q"'].hash, undefined);
  assert.ok(baseline.entries.q.hash);
  fs.writeFileSync(path.join(dir, '"q"'), 'von der Sitzung geaendert\n');
  const scope = detectReviewScope({ cwd: dir, sinceRef: startCommit, baseline });
  assert.equal(scope.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.ok(!scope.excluded.includes('"q"'));
  assert.ok(!scope.excluded.includes('a\r'));
  assert.deepEqual(scope.excluded, ['.claude/launch.json', 'a', 'domains/shopify/bild-qualitaetstest.py', 'q']);
});

// Pruefung 2026-09-11: Statuscode und Working-Tree-Hash wie bei Sitzungsbeginn,
// aber die Sitzung hat dazwischen einen neuen Stand committet.
test('Baseline: Commit einer vorbestehend geaenderten Datei mit wiederhergestelltem Working Tree bleibt im Scope', () => {
  const { dir, baseline, startCommit } = vorbestehenderStand();
  assert.ok(baseline.entries['.claude/launch.json'].index, 'versionierte Pfade tragen den Index-Hash');
  assert.equal(baseline.entries['domains/shopify/bild-qualitaetstest.py'].index, undefined);
  fs.writeFileSync(path.join(dir, '.claude/launch.json'), '{"version":"0.0.3"}\n');
  git(dir, 'commit', '-qam', 'launch v3');
  fs.writeFileSync(path.join(dir, '.claude/launch.json'), '{"version":"0.0.2"}\n');
  const scope = detectReviewScope({ cwd: dir, sinceRef: startCommit, baseline });
  assert.equal(scope.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.deepEqual(scope.excluded, ['domains/shopify/bild-qualitaetstest.py']);
  assert.doesNotMatch(scope.text, /Working Tree ist sauber/);
});

// Pruefung 2026-09-11: UNKNOWN verlangt konservative Pruefung von allem;
// eine "kein Befund"-Notiz zu ausgeklammerten Dateien widerspraeche dem.
test('Baseline: bei UNKNOWN (git-Fehler) wird nichts ausgeklammert und nichts als "kein Befund" genannt', () => {
  const { dir, baseline } = vorbestehenderStand();
  const scope = detectReviewScope({ cwd: dir, baseRef: 'refs/remotes/origin/nicht-da', baseline });
  assert.equal(scope.kind, REVIEW_SCOPE_UNKNOWN);
  assert.equal(scope.baselineStatus, 'NOT_APPLIED_UNKNOWN_SCOPE');
  assert.equal(scope.excluded, undefined);
  assert.doesNotMatch(scope.text, /kein Befund/);
  assert.doesNotMatch(scope.text, /Vorbestehend/);
});

test('captureWorkingTreeSnapshot wirft nie, sondern meldet ok:false', () => {
  const snapshot = captureWorkingTreeSnapshot({ cwd: '/nowhere', exec: () => { throw new Error('not a git repository'); } });
  assert.equal(snapshot.ok, false);
  assert.match(snapshot.error, /not a git repository/);
  assert.equal(isUsableBaseline(snapshot), false);
});

test('parsePorcelainZ liest Umbenennungen, Leerzeichen-Statuscodes und doppelte Pfade', () => {
  const parsed = parsePorcelainZ(' D b.txt\0R  c.txt\0a.txt\0D  x\0?? x\0?? d/neu.txt\0');
  assert.deepEqual(parsed.get('b.txt'), [' D']);
  assert.deepEqual(parsed.get('c.txt'), ['R  <- a.txt']);
  assert.ok(!parsed.has('a.txt'));
  assert.deepEqual(parsed.get('x'), ['D ', '??']);
  assert.deepEqual(parsed.get('d/neu.txt'), ['??']);
});

test('compareWithBaseline trennt ausgeklammert, verbleibend und zurueckgesetzt', () => {
  const baseline = { entries: { a: { codes: ['??'], hash: 'h1' }, b: { codes: [' M'], hash: 'h2' }, c: { codes: [' D'], deleted: true }, weg: { codes: ['??'], hash: 'h3' } } };
  const current = { entries: { a: { codes: ['??'], hash: 'h1' }, b: { codes: [' M'], hash: 'h9' }, c: { codes: [' D'], deleted: true }, neu: { codes: ['??'], hash: 'h4' } } };
  assert.deepEqual(compareWithBaseline({ baseline, current }), { excluded: ['a', 'c'], remaining: ['b', 'neu'], reverted: ['weg'] });
});

test('describeReviewScope nennt ausgeklammerte Pfade auch im No-op-Fall', () => {
  const scope = describeReviewScope({ porcelain: '', aheadCommits: '', mergeBase: 'deadbee', taskScoped: true, excluded: ['domains/shopify/bild-qualitaetstest.py'] });
  assert.equal(scope.kind, REVIEW_SCOPE_NONE);
  assert.match(scope.text, /Entscheide, ob der Auftrag ohne Änderung erfüllt ist/);
  assert.match(scope.text, /Vorbestehend, unverändert seit Sitzungsbeginn: domains\/shopify\/bild-qualitaetstest\.py/);
});

// --- Fragen nur pruefen, wenn sich etwas geaendert hat (2026-09-11) ---------

test('shouldSkipReview: Frage ohne Aenderung wird nicht geprueft', () => {
  const state = { taskType: 'ANALYSIS', taskTypeSource: 'QUESTION', reviewOnlyIfChanged: true };
  assert.equal(shouldSkipReview({ state, scope: { kind: REVIEW_SCOPE_NONE } }), true);
});

test('shouldSkipReview: Frage mit Aenderung wird wie bisher geprueft', () => {
  const state = { taskType: 'ANALYSIS', taskTypeSource: 'QUESTION', reviewOnlyIfChanged: true };
  assert.equal(shouldSkipReview({ state, scope: { kind: REVIEW_SCOPE_UNCOMMITTED } }), false);
  assert.equal(shouldSkipReview({ state, scope: { kind: REVIEW_SCOPE_COMMITTED } }), false);
  // git-Fehler ist nie "leer"
  assert.equal(shouldSkipReview({ state, scope: { kind: REVIEW_SCOPE_UNKNOWN } }), false);
});

test('shouldSkipReview: Implementierung wird auch bei leerem Scope geprueft', () => {
  const scope = { kind: REVIEW_SCOPE_NONE };
  assert.equal(shouldSkipReview({ state: { taskType: 'IMPLEMENTATION', taskTypeSource: 'HEURISTIC', startCommit: 'abc' }, scope }), false);
  // auch ein widerspruechlicher Zustand darf eine Implementierung nie auslassen
  assert.equal(shouldSkipReview({ state: { taskType: 'IMPLEMENTATION', reviewOnlyIfChanged: true }, scope }), false);
  // aelterer Session-State ohne die neuen Felder: unveraendert pruefen
  assert.equal(shouldSkipReview({ state: { status: 'PENDING_REVIEW' }, scope }), false);
  assert.equal(shouldSkipReview({}), false);
});

test('dirty working tree reviews the uncommitted changes', () => {
  const scope = describeReviewScope({ porcelain: ' M a.js', aheadCommits: '' });
  assert.equal(scope.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.match(scope.text, /uncommitteten Änderungen/);
});

test('dirty tree with unmerged commits reviews both', () => {
  const scope = describeReviewScope({ porcelain: ' M a.js', aheadCommits: 'abc fix\ndef feat', mergeBase: '1234567' });
  assert.equal(scope.kind, REVIEW_SCOPE_UNCOMMITTED);
  assert.match(scope.text, /2 noch nicht in origin\/main/);
  assert.match(scope.text, /git diff 1234567\.\.HEAD/);
});

test('clean tree with unmerged commits reviews the commit range and declares the empty diff expected', () => {
  const scope = describeReviewScope({ porcelain: '', aheadCommits: '9d9caa4 fix(router): timeout', mergeBase: '846ae7c0' });
  assert.equal(scope.kind, REVIEW_SCOPE_COMMITTED);
  assert.deepEqual(scope.commits, ['9d9caa4 fix(router): timeout']);
  assert.match(scope.text, /git diff 846ae7c0\.\.HEAD/);
  assert.match(scope.text, /leerer "git diff" ist hier erwartet/);
});

test('clean tree on main has nothing to review', () => {
  const scope = describeReviewScope({ porcelain: '', aheadCommits: '' });
  assert.equal(scope.kind, REVIEW_SCOPE_NONE);
  assert.match(scope.text, /kein Diff/);
  assert.match(scope.text, /Implementierung fehlt/);
});

test('detectReviewScope never fails open: a git failure is UNKNOWN with a fallback scope, not NONE', () => {
  const failing = () => { throw new Error('not a git repository'); };
  const scope = detectReviewScope({ cwd: '/nowhere', exec: failing });
  assert.equal(scope.kind, REVIEW_SCOPE_UNKNOWN);
  assert.match(scope.text, /git log -10/);
  assert.match(scope.text, /not a git repository/);
});

test('clean tree with a commit but no origin/main is UNKNOWN, not "nothing to review"', () => {
  const exec = (cmd, args) => {
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse') throw new Error('fatal: Needed a single revision');
    throw new Error('must not be reached');
  };
  const scope = detectReviewScope({ cwd: '/repo', exec });
  assert.equal(scope.kind, REVIEW_SCOPE_UNKNOWN);
  assert.match(scope.text, /Vergleich gegen origin\/main war nicht möglich/);
});

test('a failing merge-base or log is UNKNOWN as well', () => {
  const exec = (cmd, args) => {
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse') return 'abc\n';
    if (args[0] === 'merge-base') return '';
    return '';
  };
  assert.equal(detectReviewScope({ cwd: '/repo', exec }).kind, REVIEW_SCOPE_UNKNOWN);
  const logFails = (cmd, args) => {
    if (args[0] === 'log') throw new Error('bad revision');
    return args[0] === 'status' ? '' : 'abc\n';
  };
  assert.equal(detectReviewScope({ cwd: '/repo', exec: logFails }).kind, REVIEW_SCOPE_UNKNOWN);
});

test('NONE only when status, base ref and range were all read successfully', () => {
  const exec = (cmd, args) => (args[0] === 'status' || args[0] === 'log' ? '' : 'abc\n');
  assert.equal(detectReviewScope({ cwd: '/repo', exec }).kind, REVIEW_SCOPE_NONE);
});

test('detectReviewScope asks git for status, merge-base and the commit range', () => {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push(args.join(' '));
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse') return 'deadbeef\n';
    if (args[0] === 'merge-base') return 'abcdef0123456789\n';
    if (args[0] === 'log') return 'abc1 fix\n';
    return '';
  };
  const scope = detectReviewScope({ cwd: '/repo', exec });
  assert.equal(scope.kind, REVIEW_SCOPE_COMMITTED);
  assert.ok(calls.includes('log --format=%h %s abcdef0123456789..HEAD'));
  assert.match(scope.text, /abcdef012345\.\.HEAD/);
});

// Geteilter Checkout mit mehreren parallelen Sitzungen (gefunden 2026-09-09):
// origin/main als Basis zieht jeden fremden, zwischenzeitlich committeten
// Commit einer anderen Sitzung in den Pruefbereich. sinceRef (HEAD bei
// Task-Start) ersetzt origin/main vollstaendig, sobald es sich aufloest.

test('describeReviewScope: taskScoped nennt den Task-Start statt origin/main und schliesst fremde Commits explizit aus', () => {
  const scope = describeReviewScope({ porcelain: '', aheadCommits: 'abc1 mein fix', mergeBase: 'deadbee', taskScoped: true });
  assert.equal(scope.kind, REVIEW_SCOPE_COMMITTED);
  assert.match(scope.text, /seit Beginn dieses Tasks \(Commit deadbee\)/);
  assert.match(scope.text, /NICHT zu diesem Auftrag/);
  assert.doesNotMatch(scope.text, /origin\/main/);
});

test('describeReviewScope: taskScoped ohne Commits erklaert No-op explizit gegen Task-Start, nicht origin/main', () => {
  const scope = describeReviewScope({ porcelain: '', aheadCommits: '', mergeBase: 'deadbee', taskScoped: true });
  assert.equal(scope.kind, REVIEW_SCOPE_NONE);
  assert.match(scope.text, /seit Beginn dieses Tasks \(Commit deadbee\)/);
  assert.match(scope.text, /parallel laufenden Sitzung/);
});

test('detectReviewScope: sinceRef loest sich auf und ersetzt origin\\/main vollstaendig - fremde Commits vor sinceRef zaehlen nicht', () => {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push(args.join(' '));
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse') return 'task-start-sha\n';
    if (args[0] === 'log') return 'abc1 mein fix\n';
    throw new Error('merge-base/origin darf bei aufgeloestem sinceRef nicht mehr abgefragt werden');
  };
  const scope = detectReviewScope({ cwd: '/repo', sinceRef: 'HEAD-bei-task-start', exec });
  assert.equal(scope.kind, REVIEW_SCOPE_COMMITTED);
  assert.deepEqual(scope.commits, ['abc1 mein fix']);
  assert.ok(calls.some(c => c.includes('rev-parse --verify --quiet HEAD-bei-task-start^{commit}')));
  assert.ok(!calls.some(c => c.startsWith('merge-base')), 'origin/main-Pfad wurde nicht mehr betreten');
});

test('detectReviewScope: unloesbares sinceRef faellt auf origin/main zurueck statt UNKNOWN zu melden', () => {
  const exec = (cmd, args) => {
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse' && args.includes('unbekannter-commit^{commit}')) throw new Error('unknown revision');
    if (args[0] === 'rev-parse') return 'origin-main-sha\n';
    if (args[0] === 'merge-base') return 'origin-main-sha\n';
    if (args[0] === 'log') return 'abc1 fix\n';
    return '';
  };
  const scope = detectReviewScope({ cwd: '/repo', sinceRef: 'unbekannter-commit', exec });
  assert.equal(scope.kind, REVIEW_SCOPE_COMMITTED);
  assert.match(scope.text, /origin-main-\.\.HEAD/);
  assert.match(scope.text, /noch nicht in origin\/main/);
});

test('detectReviewScope: kein sinceRef verhaelt sich unveraendert wie vor dem Fix', () => {
  const exec = (cmd, args) => {
    if (args[0] === 'status') return '';
    if (args[0] === 'rev-parse') return 'abc\n';
    if (args[0] === 'merge-base') return 'abc\n';
    if (args[0] === 'log') return '';
    return '';
  };
  assert.equal(detectReviewScope({ cwd: '/repo', exec }).kind, REVIEW_SCOPE_NONE);
});

test('currentCommit liefert den HEAD-Commit oder null bei einem git-Fehler, nie eine Exception', () => {
  assert.equal(currentCommit({ cwd: '/repo', exec: () => 'deadbeefcafe\n' }), 'deadbeefcafe');
  assert.equal(currentCommit({ cwd: '/repo', exec: () => { throw new Error('not a git repository'); } }), null);
});

// 2026-09-10: Ein Worktree-Lauf bekam zweimal hintereinander den Diff einer
// fremden, parallel laufenden Sitzung vorgelegt und meldete daraufhin, das
// Ergebnis des Auftrags fehle. Ursache war CLAUDE_PROJECT_DIR, das immer auf
// den Hauptcheckout zeigt - dort liegen die Commits des Worktrees nicht.
const gemeinsamesRepo = (cmd, args, options) => {
  if (args[0] !== 'rev-parse' || args[1] !== '--git-common-dir') throw new Error(`unerwartet: ${args.join(' ')}`);
  if (options.cwd === '/repo') return '.git\n';
  if (options.cwd === '/repo/.claude/worktrees/a') return '/repo/.git\n';
  throw new Error('not a git repository');
};

test('resolveReviewDir nimmt den Worktree der Sitzung, wenn er zum selben Repository gehoert', () => {
  assert.equal(
    resolveReviewDir({ projectDir: '/repo', sessionCwd: '/repo/.claude/worktrees/a', exec: gemeinsamesRepo }),
    '/repo/.claude/worktrees/a',
  );
});

test('resolveReviewDir bleibt beim projectDir: gleiches Verzeichnis, fremdes Repository, kein git', () => {
  assert.equal(resolveReviewDir({ projectDir: '/repo', sessionCwd: '/repo', exec: gemeinsamesRepo }), '/repo');
  assert.equal(resolveReviewDir({ projectDir: '/repo', sessionCwd: undefined, exec: gemeinsamesRepo }), '/repo');

  const fremdesRepo = (cmd, args, options) => (options.cwd === '/repo' ? '.git\n' : '/woanders/.git\n');
  assert.equal(resolveReviewDir({ projectDir: '/repo', sessionCwd: '/woanders/wt', exec: fremdesRepo }), '/repo');

  const keinGit = () => { throw new Error('not a git repository'); };
  assert.equal(resolveReviewDir({ projectDir: '/repo', sessionCwd: '/irgendwo', exec: keinGit }), '/repo');
});

test('resolveReviewDir loest eine relative --git-common-dir-Ausgabe gegen das jeweilige cwd auf', () => {
  // Beide Verzeichnisse melden ".git" relativ - das sind zwei verschiedene
  // Repositories, nicht dasselbe. Ohne path.resolve waere das ein Fehltreffer.
  const beideRelativ = () => '.git\n';
  assert.equal(resolveReviewDir({ projectDir: '/repo', sessionCwd: '/anderes-repo', exec: beideRelativ }), '/repo');
});
