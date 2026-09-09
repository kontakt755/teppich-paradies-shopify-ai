import assert from 'node:assert/strict';
import test from 'node:test';
import { currentCommit, describeReviewScope, detectReviewScope, REVIEW_SCOPE_COMMITTED, REVIEW_SCOPE_NONE, REVIEW_SCOPE_UNCOMMITTED, REVIEW_SCOPE_UNKNOWN } from '../core/review-scope.mjs';

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
