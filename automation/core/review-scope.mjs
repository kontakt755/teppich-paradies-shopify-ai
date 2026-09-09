// Was soll der unabhaengige Reviewer pruefen?
// Bis 2026-09-09 sagte der Prompt immer "die aktuell uncommitteten Aenderungen".
// War die Arbeit schon committet, sah der Reviewer einen leeren Diff und meldete
// als P1 "nichts zu pruefen" - die Aenderung selbst blieb ungeprueft.
import { execFileSync } from 'node:child_process';

export const REVIEW_SCOPE_UNCOMMITTED = 'UNCOMMITTED';
export const REVIEW_SCOPE_COMMITTED = 'COMMITTED';
export const REVIEW_SCOPE_NONE = 'NONE';
// git konnte den Bereich nicht belegen (kein Repo, kein origin/main, merge-base
// fehlgeschlagen). Das ist bewusst KEIN NONE: der Hook prueft dann fail-closed
// mit einem expliziten Fallback-Bereich weiter, statt still zu beenden.
export const REVIEW_SCOPE_UNKNOWN = 'UNKNOWN';

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

// Ermittelt den Scope aus dem Repository. NONE gibt es nur, wenn Status,
// Base-Ref und Commit-Range alle erfolgreich gelesen wurden; jeder git-Fehler
// liefert UNKNOWN mit Fehlertext - nie eine Exception, der Hook darf nicht sterben.
export function detectReviewScope({ cwd = process.cwd(), baseRef = 'origin/main', exec = execFileSync } = {}) {
  const errors = [];
  const git = (...args) => {
    try {
      return { ok: true, out: String(exec('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim() };
    } catch (error) {
      errors.push(`git ${args.join(' ')}: ${error?.message ?? error}`);
      return { ok: false, out: '' };
    }
  };
  const status = git('status', '--porcelain');
  if (!status.ok) return unknownScope(errors, baseRef);
  const base = git('rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`);
  if (!base.ok || !base.out) return unknownScope(errors.length ? errors : [`${baseRef} nicht vorhanden`], baseRef);
  const mergeBase = git('merge-base', baseRef, 'HEAD');
  if (!mergeBase.ok || !mergeBase.out) return unknownScope(errors.length ? errors : ['merge-base leer'], baseRef);
  const ahead = git('log', '--format=%h %s', `${mergeBase.out}..HEAD`);
  if (!ahead.ok) return unknownScope(errors, baseRef);
  return describeReviewScope({ porcelain: status.out, aheadCommits: ahead.out, baseRef, mergeBase: mergeBase.out.slice(0, 12) });
}

function unknownScope(errors, baseRef) {
  return {
    kind: REVIEW_SCOPE_UNKNOWN,
    commits: [],
    errors,
    text: `alle Änderungen dieser Sitzung: die uncommitteten Änderungen (git diff, git diff --cached) und zusätzlich die letzten Commits (git log -10, git show HEAD). Der Vergleich gegen ${baseRef} war nicht möglich (${errors.join(' | ').slice(0, 300)}); prüfe deshalb konservativ und werte fehlende Belege als Befund`,
  };
}
