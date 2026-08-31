export const DEFAULT_MAX_REVIEW_ROUNDS = 3;
export const DEFAULT_PROVIDER_TIMEOUT_MS = 15 * 60_000;
export const FINDING_PRIORITIES = Object.freeze(['P0', 'P1', 'P2', 'P3']);
export const REQUIRED_FINDING_FIELDS = Object.freeze(['priority', 'file', 'problem', 'reason', 'recommendedFix']);

export function validateReviewFindings(findings) {
  if (!Array.isArray(findings)) throw new Error('Reviewer findings must be an array');
  return findings.map((finding, index) => {
    if (!finding || typeof finding !== 'object') throw new Error(`Finding ${index + 1} must be an object`);
    for (const field of REQUIRED_FINDING_FIELDS) {
      if (typeof finding[field] !== 'string' || !finding[field].trim()) throw new Error(`Finding ${index + 1} requires ${field}`);
    }
    if (!FINDING_PRIORITIES.includes(finding.priority)) throw new Error(`Finding ${index + 1} has invalid priority`);
    return Object.fromEntries(REQUIRED_FINDING_FIELDS.map(field => [field, finding[field].trim()]));
  });
}

export class ProviderTimeoutError extends Error {
  constructor(phase, timeoutMs) {
    super(`Provider call ${phase} exceeded ${timeoutMs} ms`);
    this.name = 'ProviderTimeoutError';
    this.phase = phase;
    this.timeoutMs = timeoutMs;
  }
}

async function callProvider({ phase, timeoutMs, invoke }) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      invoke(controller.signal),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ProviderTimeoutError(phase, timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function parkedOnProviderTimeout(error, reviewRound, maxReviewRounds) {
  if (!(error instanceof ProviderTimeoutError)) throw error;
  return { status: 'PARKED', reason: 'PROVIDER_TIMEOUT', timeout: { phase: error.phase, timeoutMs: error.timeoutMs }, reviewRound, maxReviewRounds };
}

function emit(onState, status, detail = {}) {
  onState?.({ status, ...detail });
}

function mergeCorrectionCandidate(candidate, correction) {
  if (!correction || typeof correction !== 'object') return correction;
  // A correction can change files, resources and operations. Those values must
  // describe the correction's final state, never the pre-correction candidate.
  const { diffEntries, changedFiles, resources, actualOperations, ...safeCandidate } = candidate;
  return Object.fromEntries(Object.entries({ ...safeCandidate, ...correction }).filter(([, value]) => value !== undefined));
}

export async function runReviewCorrectionCycle({
  task,
  implement,
  review = null,
  correct = null,
  validateCandidate = null,
  maxReviewRounds = DEFAULT_MAX_REVIEW_ROUNDS,
  providerTimeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  phaseRouting = {},
  onState = null,
}) {
  if (!Number.isInteger(maxReviewRounds) || maxReviewRounds < 1) throw new Error('maxReviewRounds must be a positive integer');
  if (!Number.isInteger(providerTimeoutMs) || providerTimeoutMs < 1) throw new Error('providerTimeoutMs must be a positive integer');
  emit(onState, 'IMPLEMENT', { reviewRound: 0, maxReviewRounds, route: phaseRouting.implement ?? null });
  let candidate;
  try {
    candidate = await callProvider({ phase: 'IMPLEMENT', timeoutMs: providerTimeoutMs, invoke: signal => implement(task, { signal, routing: phaseRouting.implement ?? null }) });
  } catch (error) {
    return parkedOnProviderTimeout(error, 0, maxReviewRounds);
  }
  if (candidate?.status !== 'PASS') {
    const status = ['PARKED', 'BLOCKED', 'SECURITY_STOP'].includes(candidate?.status) ? candidate.status : 'HARD_FAIL';
    return { ...candidate, status, reviewRound: 0, maxReviewRounds };
  }
  if (validateCandidate) await validateCandidate(task, candidate, { phase: 'IMPLEMENT', reviewRound: 0, maxReviewRounds });
  if (!review) return { ...candidate, reviewRound: 0, maxReviewRounds };

  for (let reviewRound = 1; reviewRound <= maxReviewRounds; reviewRound += 1) {
    emit(onState, 'REVIEW', { reviewRound, maxReviewRounds, route: phaseRouting.review ?? null });
    let reviewResult;
    try {
      reviewResult = await callProvider({ phase: 'REVIEW', timeoutMs: providerTimeoutMs, invoke: signal => review(task, candidate, { reviewRound, maxReviewRounds, signal, routing: phaseRouting.review ?? null }) });
    } catch (error) {
      return { ...candidate, ...parkedOnProviderTimeout(error, reviewRound, maxReviewRounds) };
    }
    if (reviewResult?.status === 'SECURITY_STOP') return { ...candidate, status: 'SECURITY_STOP', reviewRound, maxReviewRounds, review: reviewResult };
    const findings = validateReviewFindings(reviewResult?.findings ?? []);
    if (reviewResult?.status === 'FAIL' && !findings.length) return { ...candidate, status: 'HARD_FAIL', reviewRound, maxReviewRounds, review: reviewResult };
    if (findings.some(finding => finding.priority === 'P0')) {
      emit(onState, 'HARD_FAIL', { reviewRound, maxReviewRounds, findings });
      return { ...candidate, status: 'HARD_FAIL', reviewRound, maxReviewRounds, findings };
    }
    const actionable = findings.filter(finding => finding.priority === 'P1' || finding.priority === 'P2');
    if (!actionable.length) return { ...candidate, status: 'PASS', reviewRound, maxReviewRounds, findings };

    emit(onState, 'REVIEW_FINDINGS', { reviewRound, maxReviewRounds, findings });
    emit(onState, 'CORRECTION_REQUIRED', { reviewRound, maxReviewRounds, findings: actionable });
    if (reviewRound >= maxReviewRounds) {
      emit(onState, 'REVIEW_LIMIT_REACHED', { reviewRound, maxReviewRounds, findings: actionable });
      return { ...candidate, status: 'REVIEW_LIMIT_REACHED', reviewRound, maxReviewRounds, findings };
    }
    if (!correct) return { ...candidate, status: 'CORRECTION_REQUIRED', reviewRound, maxReviewRounds, findings: actionable };

    emit(onState, 'CORRECT', { reviewRound, maxReviewRounds, findings: actionable, route: phaseRouting.correct ?? phaseRouting.implement ?? null });
    let correction;
    try {
      correction = await callProvider({ phase: 'CORRECT', timeoutMs: providerTimeoutMs, invoke: signal => correct(task, candidate, actionable, { reviewRound, maxReviewRounds, signal, routing: phaseRouting.correct ?? phaseRouting.implement ?? null }) });
    } catch (error) {
      return { ...candidate, ...parkedOnProviderTimeout(error, reviewRound, maxReviewRounds), findings: actionable };
    }
    candidate = mergeCorrectionCandidate(candidate, correction);
    if (candidate?.status !== 'PASS') {
      const status = ['PARKED', 'BLOCKED', 'SECURITY_STOP'].includes(candidate?.status) ? candidate.status : 'HARD_FAIL';
      return { ...candidate, status, reviewRound, maxReviewRounds, findings: actionable };
    }
    if (validateCandidate) await validateCandidate(task, candidate, { phase: 'CORRECT', reviewRound, maxReviewRounds });
  }
  throw new Error('Unreachable review-cycle state');
}
