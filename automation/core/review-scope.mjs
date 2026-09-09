// Was soll der unabhaengige Reviewer pruefen?
// Bis 2026-09-09 sagte der Prompt immer "die aktuell uncommitteten Aenderungen".
// War die Arbeit schon committet, sah der Reviewer einen leeren Diff und meldete
// als P1 "nichts zu pruefen" - die Aenderung selbst blieb ungeprueft.
//
// Zweite Luecke, gefunden am 2026-09-09: In einem geteilten Arbeitsverzeichnis
// mit mehreren parallelen Claude-Code-Sitzungen ist "gegenueber origin/main"
// die falsche Basis - sie zieht jeden fremden, zwischenzeitlich auf demselben
// Checkout committeten Commit einer anderen Sitzung in den Pruefbereich. Mit
// `sinceRef` (dem HEAD-Commit bei Task-Start, siehe openrouter-user-prompt.mjs)
// prueft detectReviewScope nur noch, was seit Beginn DIESES Tasks entstand.
// Ohne sinceRef (z. B. bei `npm run agents:review` ohne Sitzung) bleibt das
// alte Verhalten unveraendert.
import { execFileSync } from 'node:child_process';

export const REVIEW_SCOPE_UNCOMMITTED = 'UNCOMMITTED';
export const REVIEW_SCOPE_COMMITTED = 'COMMITTED';
export const REVIEW_SCOPE_NONE = 'NONE';
// git konnte den Bereich nicht belegen (kein Repo, kein origin/main, merge-base
// fehlgeschlagen). Das ist bewusst KEIN NONE: der Hook prueft dann fail-closed
// mit einem expliziten Fallback-Bereich weiter, statt still zu beenden.
export const REVIEW_SCOPE_UNKNOWN = 'UNKNOWN';

// Reine Entscheidung ohne git - testbar mit Strings.
// taskScoped=true bedeutet: baseRef/mergeBase beschreiben nicht origin/main,
// sondern den HEAD-Commit bei Task-Start (sinceRef). Der Wortlaut sagt dann
// "seit Beginn dieses Tasks" statt "gegenueber origin/main", damit der
// Reviewer fremde, in einem geteilten Checkout danebenliegende Commits nicht
// als Teil des zu pruefenden Auftrags missversteht.
export function describeReviewScope({ porcelain = '', aheadCommits = '', baseRef = 'origin/main', mergeBase = '', taskScoped = false } = {}) {
  const dirty = String(porcelain ?? '').trim().length > 0;
  const commits = String(aheadCommits ?? '').split('\n').map(line => line.trim()).filter(Boolean);
  const commitLabel = taskScoped ? `seit Beginn dieses Tasks (Commit ${mergeBase || baseRef}) entstandenen` : `noch nicht in ${baseRef} enthaltenen`;
  if (dirty) {
    return {
      kind: REVIEW_SCOPE_UNCOMMITTED,
      commits,
      text: commits.length
        ? `die aktuell uncommitteten Änderungen (git diff, git diff --cached) sowie die ${commits.length} ${commitLabel} Commits (git diff ${mergeBase || baseRef}..HEAD)`
        : 'die aktuell uncommitteten Änderungen (git diff, git diff --cached)',
    };
  }
  if (commits.length) {
    return {
      kind: REVIEW_SCOPE_COMMITTED,
      commits,
      text: taskScoped
        ? `die ${commits.length} Commits seit Beginn dieses Tasks (Commit ${mergeBase || baseRef}): ${commits.join('; ')}. Andere Commits in diesem Checkout, die vor Task-Start entstanden oder von einer anderen, parallel laufenden Sitzung stammen, gehören NICHT zu diesem Auftrag und sind kein Befund. Der Working Tree ist sauber; der zu prüfende Diff ist "git diff ${mergeBase || baseRef}..HEAD". Ein leerer "git diff" ist hier erwartet und kein Befund`
        : `die ${commits.length} bereits committeten, aber noch nicht in ${baseRef} enthaltenen Commits: ${commits.join('; ')}. Der Working Tree ist sauber; der zu prüfende Diff ist "git diff ${mergeBase || baseRef}..HEAD". Ein leerer "git diff" ist hier erwartet und kein Befund`,
    };
  }
  // Kein Diff beweist nur, dass nichts geaendert wurde - nicht, dass der Auftrag
  // erfuellt ist. Der Reviewer entscheidet, ob der No-op den Auftrag erfuellt.
  return {
    kind: REVIEW_SCOPE_NONE,
    commits: [],
    text: taskScoped
      ? `den unveränderten Stand: der Working Tree ist sauber und es gibt seit Beginn dieses Tasks (Commit ${mergeBase || baseRef}) keine neuen Commits, es existiert also kein Diff. Andere Commits in diesem Checkout koennen von einer anderen, parallel laufenden Sitzung stammen und gehoeren nicht zu diesem Auftrag. Entscheide, ob der Auftrag ohne Änderung erfüllt ist (belegter No-op, dann PASS) oder ob eine Implementierung fehlt (dann Befund)`
      : `den unveränderten Stand: der Working Tree ist sauber und es gibt keine Commits gegenüber ${baseRef}, es existiert also kein Diff. Entscheide, ob der Auftrag ohne Änderung erfüllt ist (belegter No-op, dann PASS) oder ob eine Implementierung fehlt (dann Befund)`,
  };
}

// Ermittelt den Scope aus dem Repository. NONE gibt es nur, wenn Status,
// Base-Ref und Commit-Range alle erfolgreich gelesen wurden; jeder git-Fehler
// liefert UNKNOWN mit Fehlertext - nie eine Exception, der Hook darf nicht sterben.
//
// sinceRef: der HEAD-Commit bei Task-Start (aus dem Session-State). Loest er
// sich auf, ersetzt er origin/main vollstaendig als Basis - das ist der Fix
// fuer den geteilten Checkout: Commits einer anderen, parallel laufenden
// Sitzung liegen vor oder nach sinceRef auf demselben Branch und werden nicht
// faelschlich diesem Task zugerechnet. Loest sinceRef sich nicht auf (z. B.
// veralteter Session-State nach einem Reset), faellt die Funktion auf das
// bisherige Verhalten gegenueber baseRef zurueck - kein Fehlerfall.
export function detectReviewScope({ cwd = process.cwd(), baseRef = 'origin/main', sinceRef = null, exec = execFileSync } = {}) {
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
  if (sinceRef) {
    const since = git('rev-parse', '--verify', '--quiet', `${sinceRef}^{commit}`);
    if (since.ok && since.out) {
      const ahead = git('log', '--format=%h %s', `${since.out}..HEAD`);
      if (ahead.ok) {
        return describeReviewScope({ porcelain: status.out, aheadCommits: ahead.out, baseRef: since.out.slice(0, 12), mergeBase: since.out.slice(0, 12), taskScoped: true });
      }
    }
    // sinceRef nicht nutzbar (Commit weg, git-Fehler): bewusst kein Abbruch,
    // stattdessen unten mit baseRef weiterpruefen statt UNKNOWN zu melden.
  }
  const base = git('rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`);
  if (!base.ok || !base.out) return unknownScope(errors.length ? errors : [`${baseRef} nicht vorhanden`], baseRef);
  const mergeBase = git('merge-base', baseRef, 'HEAD');
  if (!mergeBase.ok || !mergeBase.out) return unknownScope(errors.length ? errors : ['merge-base leer'], baseRef);
  const ahead = git('log', '--format=%h %s', `${mergeBase.out}..HEAD`);
  if (!ahead.ok) return unknownScope(errors, baseRef);
  return describeReviewScope({ porcelain: status.out, aheadCommits: ahead.out, baseRef, mergeBase: mergeBase.out.slice(0, 12) });
}

// Fuer openrouter-user-prompt.mjs: der HEAD-Commit bei Task-Start, der spaeter
// als sinceRef in den Session-State geschrieben wird. null statt Exception,
// wenn git (noch) keinen Commit hat oder kein Repository ist.
export function currentCommit({ cwd = process.cwd(), exec = execFileSync } = {}) {
  try {
    const out = String(exec('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim();
    return out || null;
  } catch {
    return null;
  }
}

function unknownScope(errors, baseRef) {
  return {
    kind: REVIEW_SCOPE_UNKNOWN,
    commits: [],
    errors,
    text: `alle Änderungen dieser Sitzung: die uncommitteten Änderungen (git diff, git diff --cached) und zusätzlich die letzten Commits (git log -10, git show HEAD). Der Vergleich gegen ${baseRef} war nicht möglich (${errors.join(' | ').slice(0, 300)}); prüfe deshalb konservativ und werte fehlende Belege als Befund`,
  };
}
