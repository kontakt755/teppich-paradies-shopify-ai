// Was soll der unabhaengige Reviewer pruefen?
// Bis 2026-09-09 sagte der Prompt immer "die aktuell uncommitteten Aenderungen".
// War die Arbeit schon committet, sah der Reviewer einen leeren Diff und meldete
// als P1 "nichts zu pruefen" - die Aenderung selbst blieb ungeprueft.
import { execFileSync } from 'node:child_process';

export const REVIEW_SCOPE_UNCOMMITTED = 'UNCOMMITTED';
export const REVIEW_SCOPE_COMMITTED = 'COMMITTED';
export const REVIEW_SCOPE_NONE = 'NONE';

// Reine Entscheidung ohne git - testbar mit Strings.
export function describeReviewScope({ porcelain = '', aheadCommits = '', baseRef = 'origin/main', mergeBase = '' } = {}) {
  const dirty = String(porcelain ?? '').trim().length > 0;
  const commits = String(aheadCommits ?? '').split('\n').map(line => line.trim()).filter(Boolean);
  if (dirty) {
    return {
      kind: REVIEW_SCOPE_UNCOMMITTED,
      commits,
      text: commits.length
        ? `die aktuell uncommitteten Änderungen (git diff, git diff --cached) sowie die ${commits.length} noch nicht in ${baseRef} enthaltenen Commits (git diff ${mergeBase || baseRef}..HEAD)`
        : 'die aktuell uncommitteten Änderungen (git diff, git diff --cached)',
    };
  }
  if (commits.length) {
    return {
      kind: REVIEW_SCOPE_COMMITTED,
      commits,
      text: `die ${commits.length} bereits committeten, aber noch nicht in ${baseRef} enthaltenen Commits: ${commits.join('; ')}. Der Working Tree ist sauber; der zu prüfende Diff ist "git diff ${mergeBase || baseRef}..HEAD". Ein leerer "git diff" ist hier erwartet und kein Befund`,
    };
  }
  return { kind: REVIEW_SCOPE_NONE, commits: [], text: '' };
}

// Ermittelt den Scope aus dem Repository. Fehler in git (kein Remote, kein Repo)
// fuehren zu NONE, nie zu einer Exception - der Hook darf daran nicht scheitern.
export function detectReviewScope({ cwd = process.cwd(), baseRef = 'origin/main', exec = execFileSync } = {}) {
  const git = (...args) => {
    try {
      return String(exec('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim();
    } catch {
      return '';
    }
  };
  const porcelain = git('status', '--porcelain');
  const mergeBase = git('merge-base', baseRef, 'HEAD');
  const aheadCommits = mergeBase ? git('log', '--format=%h %s', `${mergeBase}..HEAD`) : '';
  return describeReviewScope({ porcelain, aheadCommits, baseRef, mergeBase: mergeBase.slice(0, 12) });
}
