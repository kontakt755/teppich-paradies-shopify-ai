// Fehlerklassifikation und begrenzter Wiederholungsversuch fuer die
// Pruefskripte der Deploy-Kette (validate/preview/live). Frueher Teil von
// workflow/router.mjs; der Router ist entfernt, diese Hilfen braucht core.mjs.

export const EXTERNAL_BLOCKS = Object.freeze({
  RATE_LIMIT: 'BLOCKED_EXTERNAL_RATE_LIMIT',
  UPSTREAM: 'BLOCKED_EXTERNAL_UPSTREAM',
  LOCAL_RUNNER: 'NEEDS_LOCAL_RUNNER',
  CODE_DEFECT: 'CODE_DEFECT',
  UNKNOWN: 'UNKNOWN_BLOCKER',
});
export const MAX_IMMEDIATE_SCRIPT_RETRIES = 1;

export function classifyFailure(result = {}) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.message ?? ''}`;
  if (/\b403\b.{0,120}(?:claude (?:cloud agent )?proxy|cloud agent proxy)|(?:claude (?:cloud agent )?proxy|cloud agent proxy).{0,120}\b403\b|cloud (?:environment|agent).{0,120}(?:cannot|can't|darf nicht|forbidden).{0,120}storefront/i.test(output)) return EXTERNAL_BLOCKS.LOCAL_RUNNER;
  if (/\b429\b|too many requests|rate limit|cloudflare.{0,80}(?:limit|block)|temporar(?:y|ily|e).{0,40}waf/is.test(output)) return EXTERNAL_BLOCKS.RATE_LIMIT;
  if (/shopifysvc\.com\/(?:observeonly|error).{0,240}(?:cors|blocked)|(?:cors|blocked).{0,240}shopifysvc\.com\/(?:observeonly|error)/is.test(output)) return EXTERNAL_BLOCKS.UPSTREAM;
  if (result.timedOut || /\b503\b|service unavailable|upstream.{0,40}(?:unavailable|error)|network timeout|timed?\s*out|ETIMEDOUT|ECONNRESET|EAI_AGAIN/is.test(output)) return EXTERNAL_BLOCKS.UPSTREAM;
  if (/AssertionError|assertion failed|expected .+ (?:to|but)|\btest(?:s)? failed\b|SyntaxError|TypeError:\s(?!fetch|network)/is.test(output)) return EXTERNAL_BLOCKS.CODE_DEFECT;
  return EXTERNAL_BLOCKS.UNKNOWN;
}

export function runWithExternalRetry(run, { maxImmediateRetries = MAX_IMMEDIATE_SCRIPT_RETRIES } = {}) {
  const boundedRetries = Math.min(MAX_IMMEDIATE_SCRIPT_RETRIES, Math.max(0, Number(maxImmediateRetries) || 0));
  let attempts = 0;
  while (attempts <= boundedRetries) {
    attempts += 1;
    const result = run();
    if (result.exitCode === 0 && !result.spawnError && !result.timedOut) return { result, attempts, blocker: null };
    const blocker = classifyFailure(result);
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.message ?? ''}`;
    const retryable = blocker === EXTERNAL_BLOCKS.RATE_LIMIT || (blocker === EXTERNAL_BLOCKS.UPSTREAM
      && (result.timedOut || /\b503\b|service unavailable|network timeout|timed?\s*out|ETIMEDOUT|ECONNRESET|EAI_AGAIN/is.test(output)));
    if (!retryable || attempts > boundedRetries) return { result, attempts, blocker };
  }
  throw new Error('Unreachable bounded retry state');
}
