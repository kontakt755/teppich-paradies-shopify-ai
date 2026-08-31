import assert from 'node:assert/strict';
import test from 'node:test';
import { runReviewCorrectionCycle, validateReviewFindings } from '../core/review-cycle.mjs';

const finding = (priority = 'P1') => ({
  priority,
  file: 'qa/example.mjs',
  problem: 'Ein belastbares Problem',
  reason: 'Die Prüfung ist sonst nicht reproduzierbar',
  recommendedFix: 'Gezielt korrigieren und erneut prüfen',
});

test('IMPLEMENT REVIEW CORRECT REVIEW reaches PASS', async () => {
  const states = [];
  let reviews = 0;
  let corrections = 0;
  const result = await runReviewCorrectionCycle({
    task: { id: 'T-1' },
    implement: async () => ({ status: 'PASS', result: 'implemented' }),
    review: async () => ({ status: ++reviews === 1 ? 'REVIEW_FINDINGS' : 'PASS', findings: reviews === 1 ? [finding()] : [] }),
    correct: async () => { corrections += 1; return { status: 'PASS', result: 'corrected' }; },
    onState: state => states.push(state.status),
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.reviewRound, 2);
  assert.equal(corrections, 1);
  assert.deepEqual(states, ['IMPLEMENT', 'REVIEW', 'REVIEW_FINDINGS', 'CORRECTION_REQUIRED', 'CORRECT', 'REVIEW']);
});

test('review limit stops before another correction or review call', async () => {
  let reviews = 0;
  let corrections = 0;
  const result = await runReviewCorrectionCycle({
    task: { id: 'T-2' },
    implement: async () => ({ status: 'PASS' }),
    review: async () => { reviews += 1; return { findings: [finding('P2')] }; },
    correct: async () => { corrections += 1; return { status: 'PASS' }; },
    maxReviewRounds: 3,
  });
  assert.equal(result.status, 'REVIEW_LIMIT_REACHED');
  assert.equal(reviews, 3);
  assert.equal(corrections, 2);
});

test('P0 reviewer finding hard-stops without correction', async () => {
  let corrections = 0;
  const result = await runReviewCorrectionCycle({
    task: { id: 'T-3' }, implement: async () => ({ status: 'PASS' }),
    review: async () => ({ findings: [finding('P0')] }),
    correct: async () => { corrections += 1; return { status: 'PASS' }; },
  });
  assert.equal(result.status, 'HARD_FAIL');
  assert.equal(corrections, 0);
});

test('structured findings require all five fields', () => {
  assert.throws(() => validateReviewFindings([{ priority: 'P1', file: 'x' }]), /requires problem/);
});

test('explicit security result remains SECURITY_STOP', async () => {
  const result = await runReviewCorrectionCycle({
    task: { id: 'T-4' }, implement: async () => ({ status: 'PASS' }),
    review: async () => ({ status: 'SECURITY_STOP' }),
  });
  assert.equal(result.status, 'SECURITY_STOP');
});

test('status-only correction removes pre-correction postflight evidence', async () => {
  let reviews = 0;
  const result = await runReviewCorrectionCycle({
    task: { id: 'T-5' },
    implement: async () => ({ status: 'PASS', diffEntries: [{ file: 'qa/a.mjs', added: 1, deleted: 0 }], resources: ['storefront'] }),
    review: async () => ({ findings: ++reviews === 1 ? [finding()] : [] }),
    correct: async () => ({ status: 'PASS' }),
  });
  assert.equal(result.diffEntries, undefined);
  assert.equal(result.resources, undefined);
});

test('correction replacement postflight evidence wins over prior evidence', async () => {
  let reviews = 0;
  const result = await runReviewCorrectionCycle({
    task: { id: 'T-6' },
    implement: async () => ({ status: 'PASS', diffEntries: [{ file: 'qa/old.mjs', added: 1, deleted: 0 }], resources: ['old'], actualOperations: ['report_write'] }),
    review: async () => ({ findings: ++reviews === 1 ? [finding()] : [] }),
    correct: async () => ({ status: 'PASS', diffEntries: [{ file: 'qa/new.mjs', added: 2, deleted: 1 }], resources: ['new'], actualOperations: ['report_write'] }),
  });
  assert.deepEqual(result.diffEntries, [{ file: 'qa/new.mjs', added: 2, deleted: 1 }]);
  assert.deepEqual(result.resources, ['new']);
  assert.deepEqual(result.actualOperations, ['report_write']);
});

test('candidate validation runs before every paid review', async () => {
  const calls = [];
  let reviews = 0;
  await runReviewCorrectionCycle({
    task: { id: 'T-7' },
    implement: async () => ({ status: 'PASS', version: 'implement' }),
    validateCandidate: async (_task, candidate, metadata) => calls.push(`validate:${metadata.phase}:${candidate.version}`),
    review: async () => { calls.push('review'); return { findings: ++reviews === 1 ? [finding()] : [] }; },
    correct: async () => ({ status: 'PASS', version: 'correct' }),
  });
  assert.deepEqual(calls, ['validate:IMPLEMENT:implement', 'review', 'validate:CORRECT:correct', 'review']);
});

test('provider timeout aborts the call and parks only the task', async () => {
  let aborted = false;
  const result = await runReviewCorrectionCycle({
    task: { id: 'TIMEOUT' },
    providerTimeoutMs: 10,
    implement: async (task, { signal }) => new Promise(() => signal.addEventListener('abort', () => { aborted = true; })),
  });
  assert.equal(result.status, 'PARKED');
  assert.equal(result.reason, 'PROVIDER_TIMEOUT');
  assert.equal(result.timeout.phase, 'IMPLEMENT');
  assert.equal(aborted, true);
});
