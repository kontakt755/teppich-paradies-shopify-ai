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
//
// Vierte Luecke, gefunden am 2026-09-11: sinceRef filtert nur Commits. Was
// eine andere Sitzung im geteilten Checkout uncommittet liegen hatte, landete
// weiter vollstaendig im Pruefbereich. Eine Sitzung, die nur eine Datei
// ausserhalb des Repositorys geaendert hatte, bekam so zwei Runden
// CHANGES_REQUIRED fuer fremde Dateien. Deshalb haelt openrouter-user-prompt.mjs
// bei Task-Start fest, welche Dateien schon schmutzig waren und mit welchem
// Inhalt (snapshotDirtyFiles). Der Stop-Hook prueft danach nur, was seitdem neu
// schmutzig wurde oder sich inhaltlich veraendert hat (selectTaskChanges).
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const REVIEW_SCOPE_UNCOMMITTED = 'UNCOMMITTED';
export const REVIEW_SCOPE_COMMITTED = 'COMMITTED';
export const REVIEW_SCOPE_NONE = 'NONE';
// git konnte den Bereich nicht belegen (kein Repo, kein origin/main, merge-base
// fehlgeschlagen). Das ist bewusst KEIN NONE: der Hook prueft dann fail-closed
// mit einem expliziten Fallback-Bereich weiter, statt still zu beenden.
export const REVIEW_SCOPE_UNKNOWN = 'UNKNOWN';

// Gehoert dem Dashboard-Bot (CLAUDE.md, Abschnitt Dashboard): stuendlich nach
// main committet, lokal von `npm run task` und `npm run dashboard` neu
// geschrieben und nie Teil einer Arbeit. Deshalb nie im Pruefbereich - auch
// ohne Snapshot vom Task-Start.
export const BOT_OWNED_PATHS = Object.freeze(['docs/ai-dashboard/issues.json']);

// -z: Pfade ungequotet und NUL-getrennt. --untracked-files=all: sonst fasst git
// einen neuen Ordner zu "neu/" zusammen, und eine eigene Datei in einem schon
// vorhandenen fremden Ordner waere von den fremden nicht zu unterscheiden.
const STATUS_ARGS = ['status', '--porcelain=v1', '-z', '--untracked-files=all'];
// Groessere Dateien (Bilder, Exporte) werden nicht gelesen; Groesse und
// Zeitstempel reichen, um eine Aenderung zu bemerken. Ein falscher Treffer
// macht den Pruefbereich nur groesser, nie kleiner.
const HASH_LIMIT_BYTES = 16 * 1024 * 1024;
const LISTED_EXCLUSIONS = 20;

function gitOptions(cwd) {
  return { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 };
}

// `git status --porcelain=v1 -z`: je Eintrag "XY pfad\0"; bei Umbenennung und
// Kopie folgt der alte Pfad als eigenes Feld ("R  neu\0alt\0"). Beide Pfade
// zaehlen, der alte ist aus Sicht des Working Trees geloescht. Ohne NUL
// (Aufrufer mit dem alten zeilenweisen Format) wird zeilenweise gelesen.
export function parsePorcelainPaths(porcelain = '') {
  const text = String(porcelain ?? '');
  const nul = text.includes('\0');
  const fields = nul ? text.split('\0') : text.split('\n');
  const paths = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field.length < 4) continue;
    paths.push(field.slice(3));
    if (nul && /[RC]/.test(field.slice(0, 2))) {
      if (fields[index + 1]) paths.push(fields[index + 1]);
      index += 1;
    }
  }
  return [...new Set(paths)];
}

// Inhalt statt Zeilenbilanz: snapshotWorkingTree in dashboard-guards.mjs
// vergleicht numstat-Zahlen und uebersieht deshalb eine zweite Aenderung in
// einer Zeile, die schon vorher fremd geaendert war (+1/-1 bleibt +1/-1).
export function fingerprintFile(filePath, io = fs) {
  try {
    const stats = io.statSync(filePath);
    if (!stats.isFile()) return 'KEINE_DATEI';
    if (stats.size > HASH_LIMIT_BYTES) return `GROSS:${stats.size}:${stats.mtimeMs}`;
    return `sha256:${crypto.createHash('sha256').update(io.readFileSync(filePath)).digest('hex')}`;
  } catch (error) {
    return error?.code === 'ENOENT' ? 'GELOESCHT' : `UNLESBAR:${error?.code ?? 'FEHLER'}`;
  }
}

// Pfade aus git status sind relativ zur Repository-Wurzel, nicht zum cwd.
function fingerprintPaths({ cwd, exec, io, paths }) {
  if (!paths.length) return {};
  let root = cwd;
  try {
    root = String(exec('git', ['rev-parse', '--show-toplevel'], gitOptions(cwd))).trim() || cwd;
  } catch { /* status lief im selben cwd - dann ist cwd die beste Naeherung */ }
  return Object.fromEntries(paths.map(file => [file, fingerprintFile(path.join(root, file), io)]));
}

function withoutFingerprints(paths) {
  return Object.fromEntries(paths.map(file => [file, null]));
}

// Fuer openrouter-user-prompt.mjs: welche Dateien sind bei Task-Start schon
// uncommittet veraendert, und mit welchem Inhalt? Ergebnis { pfad: fingerprint },
// {} bei sauberem Working Tree. null bei einem git-Fehler - der Stop-Hook prueft
// dann wie vorher alle uncommitteten Dateien.
export function snapshotDirtyFiles({ cwd = process.cwd(), exec = execFileSync, io = fs } = {}) {
  let porcelain;
  try {
    porcelain = String(exec('git', STATUS_ARGS, gitOptions(cwd)));
  } catch {
    return null;
  }
  return fingerprintPaths({ cwd, exec, io, paths: parsePorcelainPaths(porcelain) });
}

// Welche uncommitteten Dateien gehoeren zu DIESEM Task?
//   - Dateien des Dashboard-Bots nie (botOwned)
//   - ohne Baseline (kein Snapshot bei Task-Start) alle uebrigen, wie bisher
//   - mit Baseline nur, was seit Task-Start neu schmutzig wurde oder dessen
//     Inhalt sich seitdem geaendert hat; unveraendert Vorgefundenes ist fremd
// Eine Datei, die schon vorher schmutzig war und seitdem erneut geaendert
// wurde, bleibt im Pruefbereich (preexisting): ihr Diff kann fremde Anteile
// enthalten, der Reviewer wird darauf hingewiesen. Arbeitet die fremde Sitzung
// an ihr weiter, landet sie ebenfalls hier - im Zweifel wird mehr geprueft,
// nie weniger.
export function selectTaskChanges({ current = {}, baseline = null } = {}) {
  const result = { taskFiles: [], preexisting: [], foreign: [], botOwned: [], baselineApplied: Boolean(baseline) };
  for (const [file, fingerprint] of Object.entries(current)) {
    if (BOT_OWNED_PATHS.includes(file)) result.botOwned.push(file);
    else if (!baseline || !Object.hasOwn(baseline, file)) result.taskFiles.push(file);
    else if (baseline[file] === fingerprint) result.foreign.push(file);
    else {
      result.taskFiles.push(file);
      result.preexisting.push(file);
    }
  }
  return result;
}

function listFiles(files, limit = Infinity) {
  const shown = files.slice(0, limit).join(', ');
  return files.length > limit ? `${shown} und ${files.length - limit} weitere` : shown;
}

function describeTaskFiles({ taskFiles, preexisting, baselineApplied }) {
  const label = baselineApplied ? 'die seit Beginn dieses Tasks entstandenen uncommitteten Änderungen' : 'die aktuell uncommitteten Änderungen';
  const target = taskFiles.length === 1 ? 'dieser Datei' : `diesen ${taskFiles.length} Dateien`;
  const shared = preexisting.length
    ? ` (Achtung: ${listFiles(preexisting)} ${preexisting.length === 1 ? 'war' : 'waren'} schon vor Task-Start uncommittet verändert; der Diff kann dort fremde Anteile einer anderen Sitzung enthalten - bewerte nur, was zu diesem Auftrag gehört)`
    : '';
  return `${label} an ${target}: ${listFiles(taskFiles)}${shared}`;
}

function describeExclusions({ foreign = [], botOwned = [] }) {
  const parts = [];
  if (foreign.length) parts.push(`${listFiles(foreign, LISTED_EXCLUSIONS)} ${foreign.length === 1 ? 'lag' : 'lagen'} schon bei Task-Start mit identischem Inhalt uncommittet im Checkout (Arbeit einer anderen, parallel laufenden Sitzung)`);
  if (botOwned.length) parts.push(`${listFiles(botOwned)} gehört dem Dashboard-Bot und wird nie mitcommittet`);
  return parts.length ? ` Ausdrücklich NICHT Teil dieses Auftrags und kein Befund, auch wenn git status sie zeigt: ${parts.join('; ')}.` : '';
}

// Reine Entscheidung ohne git - testbar mit Strings.
// taskScoped=true bedeutet: baseRef/mergeBase beschreiben nicht origin/main,
// sondern den HEAD-Commit bei Task-Start (sinceRef). Der Wortlaut sagt dann
// "seit Beginn dieses Tasks" statt "gegenueber origin/main", damit der
// Reviewer fremde, in einem geteilten Checkout danebenliegende Commits nicht
// als Teil des zu pruefenden Auftrags missversteht.
// changes: Ergebnis von selectTaskChanges. Ohne Angabe wird es aus porcelain
// abgeleitet (alle schmutzigen Dateien ausser denen des Dashboard-Bots).
export function describeReviewScope({ porcelain = '', aheadCommits = '', baseRef = 'origin/main', mergeBase = '', taskScoped = false, changes = null } = {}) {
  const selected = changes ?? selectTaskChanges({ current: withoutFingerprints(parsePorcelainPaths(porcelain)) });
  const commits = String(aheadCommits ?? '').split('\n').map(line => line.trim()).filter(Boolean);
  const start = mergeBase || baseRef;
  const commitLabel = taskScoped ? `seit Beginn dieses Tasks (Commit ${start}) entstandenen` : `noch nicht in ${baseRef} enthaltenen`;
  const excluded = describeExclusions(selected);
  const base = { commits, files: selected.taskFiles, excluded: [...selected.foreign, ...selected.botOwned] };
  if (selected.taskFiles.length) {
    const files = describeTaskFiles(selected);
    return {
      kind: REVIEW_SCOPE_UNCOMMITTED,
      ...base,
      text: `${commits.length ? `${files} sowie die ${commits.length} ${commitLabel} Commits (git diff ${start}..HEAD)` : files}. Diff je Datei mit "git diff HEAD -- <datei>", neue ungetrackte Dateien direkt lesen.${excluded}`,
    };
  }
  // Ohne eigene uncommittete Dateien ist der Working Tree nur dann wirklich
  // sauber, wenn auch nichts ausgenommen wurde.
  const treeSentence = excluded ? 'Uncommittete Änderungen dieses Tasks gibt es keine' : 'Der Working Tree ist sauber';
  const emptyDiff = excluded ? 'Was "git diff" darüber hinaus zeigt, gehört nicht zu diesem Auftrag und ist kein Befund' : 'Ein leerer "git diff" ist hier erwartet und kein Befund';
  if (commits.length) {
    return {
      kind: REVIEW_SCOPE_COMMITTED,
      ...base,
      text: taskScoped
        ? `die ${commits.length} Commits seit Beginn dieses Tasks (Commit ${start}): ${commits.join('; ')}. Andere Commits in diesem Checkout, die vor Task-Start entstanden oder von einer anderen, parallel laufenden Sitzung stammen, gehören NICHT zu diesem Auftrag und sind kein Befund. ${treeSentence}; der zu prüfende Diff ist "git diff ${start}..HEAD". ${emptyDiff}.${excluded}`
        : `die ${commits.length} bereits committeten, aber noch nicht in ${baseRef} enthaltenen Commits: ${commits.join('; ')}. ${treeSentence}; der zu prüfende Diff ist "git diff ${start}..HEAD". ${emptyDiff}.${excluded}`,
    };
  }
  // Kein Diff beweist nur, dass nichts geaendert wurde - nicht, dass der Auftrag
  // erfuellt ist. Der Reviewer entscheidet, ob der No-op den Auftrag erfuellt.
  const treeClause = excluded ? 'es gibt keine uncommitteten Änderungen dieses Tasks' : 'der Working Tree ist sauber';
  const noop = 'Entscheide, ob der Auftrag ohne Änderung erfüllt ist (belegter No-op, dann PASS) oder ob eine Implementierung fehlt (dann Befund). Betrifft der Auftrag Dateien ausserhalb dieses Repositorys (etwa Benutzereinstellungen), erscheinen sie in keinem Diff; prüfe sie dann direkt.';
  return {
    kind: REVIEW_SCOPE_NONE,
    ...base,
    text: taskScoped
      ? `den unveränderten Stand: ${treeClause} und es gibt seit Beginn dieses Tasks (Commit ${start}) keine neuen Commits, es existiert also kein Diff dieses Tasks.${excluded} Andere Commits in diesem Checkout koennen von einer anderen, parallel laufenden Sitzung stammen und gehoeren nicht zu diesem Auftrag. ${noop}`
      : `den unveränderten Stand: ${treeClause} und es gibt keine Commits gegenüber ${baseRef}, es existiert also kein Diff.${excluded} ${noop}`,
  };
}

function taskChanges({ cwd, exec, io, porcelain, baseline }) {
  const paths = parsePorcelainPaths(porcelain);
  const usable = baseline && typeof baseline === 'object' && !Array.isArray(baseline) ? baseline : null;
  return selectTaskChanges({ current: usable ? fingerprintPaths({ cwd, exec, io, paths }) : withoutFingerprints(paths), baseline: usable });
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
//
// baseline: snapshotDirtyFiles() bei Task-Start (Session-State startDirty).
// Fehlt sie, zaehlen alle uncommitteten Dateien ausser denen des Dashboard-Bots.
export function detectReviewScope({ cwd = process.cwd(), baseRef = 'origin/main', sinceRef = null, baseline = null, exec = execFileSync, io = fs } = {}) {
  const errors = [];
  const run = (args, { raw = false } = {}) => {
    try {
      const out = String(exec('git', args, gitOptions(cwd)));
      return { ok: true, out: raw ? out : out.trim() };
    } catch (error) {
      errors.push(`git ${args.join(' ')}: ${error?.message ?? error}`);
      return { ok: false, out: '' };
    }
  };
  const git = (...args) => run(args);
  // Ungetrimmt: weicht nur der Working Tree ab, beginnt der Eintrag mit einem
  // Leerzeichen (" M a.js"); trim wuerde den ersten Pfad verstuemmeln.
  const status = run(STATUS_ARGS, { raw: true });
  if (!status.ok) return unknownScope(errors, baseRef);
  const changes = taskChanges({ cwd, exec, io, porcelain: status.out, baseline });
  if (sinceRef) {
    const since = git('rev-parse', '--verify', '--quiet', `${sinceRef}^{commit}`);
    if (since.ok && since.out) {
      const ahead = git('log', '--format=%h %s', `${since.out}..HEAD`);
      if (ahead.ok) {
        return describeReviewScope({ aheadCommits: ahead.out, baseRef: since.out.slice(0, 12), mergeBase: since.out.slice(0, 12), taskScoped: true, changes });
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
  return describeReviewScope({ aheadCommits: ahead.out, baseRef, mergeBase: mergeBase.out.slice(0, 12), changes });
}

// Fragen und Diagnoseauftraege (taskType ANALYSIS, siehe claude-bridge.mjs)
// brauchen kein Implementierungs-Review, solange sie das Repository nicht
// veraendert haben. Hat die Sitzung trotzdem etwas geaendert oder committet,
// wird geprueft wie bei jeder Umsetzung - eine Fehleinstufung kann ein Review
// damit nie verhindern. UNKNOWN (git-Fehler) prueft immer. Session-States ohne
// taskType stammen aus der Zeit, als nur IMPLEMENTATION einen State bekam.
export function reviewRequired({ taskType = 'IMPLEMENTATION', scope } = {}) {
  return !(taskType === 'ANALYSIS' && scope?.kind === REVIEW_SCOPE_NONE);
}

// Dritte Luecke, gefunden am 2026-09-10: Arbeitet eine Sitzung in einem
// git-Worktree (`.claude/worktrees/...`), zeigt CLAUDE_PROJECT_DIR weiterhin
// auf den Hauptcheckout. Dort liegen die Commits DIESER Sitzung gar nicht -
// wohl aber die einer anderen, parallel laufenden. Der Reviewer bekam so
// zuverlaessig einen fremden Diff vorgelegt und meldete, das Ergebnis des
// Auftrags fehle vollstaendig. Auch sinceRef half nicht: Der Startcommit wurde
// im selben falschen Verzeichnis gelesen.
//
// Deshalb: Alles Git-Bezogene laeuft im echten Arbeitsverzeichnis der Sitzung,
// sofern es zum selben Repository gehoert (gleiches --git-common-dir). Zustand,
// .env.local und .router bleiben beim projectDir, damit `router:status` und die
// Handoffs weiterhin an einer Stelle liegen.
//
// Gehoert sessionCwd zu einem anderen Repository oder ist git dort nicht
// lesbar, bleibt es bei projectDir - das ist das Verhalten von vorher.
export function resolveReviewDir({ projectDir, sessionCwd, exec = execFileSync } = {}) {
  if (!projectDir || !sessionCwd || sessionCwd === projectDir) return projectDir;
  const commonDir = (cwd) => {
    try {
      const out = String(exec('git', ['rev-parse', '--git-common-dir'], gitOptions(cwd))).trim();
      // Die Ausgabe ist relativ zum cwd, wenn das Repository dort liegt, sonst
      // absolut. path.resolve deckt beide Faelle ab.
      return out ? path.resolve(cwd, out) : null;
    } catch {
      return null;
    }
  };
  const session = commonDir(sessionCwd);
  if (!session) return projectDir;
  const project = commonDir(projectDir);
  return project && project === session ? sessionCwd : projectDir;
}

// Fuer openrouter-user-prompt.mjs: der HEAD-Commit bei Task-Start, der spaeter
// als sinceRef in den Session-State geschrieben wird. null statt Exception,
// wenn git (noch) keinen Commit hat oder kein Repository ist.
export function currentCommit({ cwd = process.cwd(), exec = execFileSync } = {}) {
  try {
    const out = String(exec('git', ['rev-parse', 'HEAD'], gitOptions(cwd))).trim();
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
