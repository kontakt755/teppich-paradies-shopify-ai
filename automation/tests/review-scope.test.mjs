import assert from 'node:assert/strict';
import test from 'node:test';
import { describeReviewScope, detectReviewScope, REVIEW_SCOPE_COMMITTED, REVIEW_SCOPE_NONE, REVIEW_SCOPE_UNCOMMITTED } from '../core/review-scope.mjs';

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
  assert.equal(scope.text, '');
});

test('detectReviewScope survives git failures and falls back to NONE', () => {
  const failing = () => { throw new Error('not a git repository'); };
  assert.equal(detectReviewScope({ cwd: '/nowhere', exec: failing }).kind, REVIEW_SCOPE_NONE);
});

test('detectReviewScope asks git for status, merge-base and the commit range', () => {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push(args.join(' '));
    if (args[0] === 'status') return '';
    if (args[0] === 'merge-base') return 'abcdef0123456789\n';
    if (args[0] === 'log') return 'abc1 fix\n';
    return '';
  };
  const scope = detectReviewScope({ cwd: '/repo', exec });
  assert.equal(scope.kind, REVIEW_SCOPE_COMMITTED);
  assert.ok(calls.includes('log --format=%h %s abcdef0123456789..HEAD'));
  assert.match(scope.text, /abcdef012345\.\.HEAD/);
});
