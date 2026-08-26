// Opt-in standing approval for unattended runs. Ahmet sets this explicitly in
// his local, gitignored .env (never committed, off by default) so scheduled
// or overnight batch runs don't need a human to retype the approval flags
// every time. It only ever stands in for the human-typed approval itself -
// every other check in the gates that use it (clean tree, zero P0/P1,
// matching preview evidence, commit-bound approval for the highest-severity
// action categories) still applies unchanged.
//
// Kept in its own module (no imports) so both core.mjs and router.mjs can
// depend on it without creating a circular import between them.

export const APPROVAL_TEXT = 'PUBLISH LIVE';

export function hasStandingLiveApproval() {
  return process.env.TP_STANDING_LIVE_APPROVAL === APPROVAL_TEXT;
}
