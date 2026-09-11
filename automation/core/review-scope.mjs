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
import fs from 'node:fs';
import path from 'node:path';

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
//
// excluded: vorbestehende Pfade, die seit Sitzungsbeginn exakt gleich
// geblieben sind - sie werden namentlich genannt, damit der Reviewer sie
// kennt und nicht vermisst. reverted: Pfade, die bei Sitzungsbeginn geaendert
// oder unversioniert vorlagen und jetzt aus git status verschwunden sind
// (zurueckgesetzt, geloescht) - das ist eine Aenderung dieser Sitzung.
export function describeReviewScope({ excluded = [], reverted = [], ...rest } = {}) {
  return withBaselineNotes(describeTreeScope({ ...rest, forceDirty: reverted.length > 0 }), { excluded, reverted });
}

function describeTreeScope({ porcelain = '', aheadCommits = '', baseRef = 'origin/main', mergeBase = '', taskScoped = false, forceDirty = false } = {}) {
  const dirty = forceDirty || String(porcelain ?? '').trim().length > 0;
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
//
// baseline: Working-Tree-Zustand bei Sitzungsbeginn (captureWorkingTreeSnapshot).
// Ohne baseline laeuft die Funktion exakt wie vorher, ohne einen einzigen
// zusaetzlichen git-Aufruf.
export function detectReviewScope({ cwd = process.cwd(), baseRef = 'origin/main', sinceRef = null, baseline = null, exec = execFileSync, io = fs } = {}) {
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
  const tree = applyBaseline({ cwd, baseline, porcelain: status.out, exec, io });
  const finish = scope => (tree.status ? { ...scope, baselineStatus: tree.status } : scope);
  // UNKNOWN verlangt ohnehin, alles Uncommittete konservativ zu pruefen - eine
  // Notiz "kein Befund" zu vorbestehenden Dateien wuerde das nur aufweichen
  // (Pruefung 2026-09-11). Deshalb hier keine Ausklammerung und keine Notiz.
  const unknown = errs => ({ ...unknownScope(errs, baseRef), ...(tree.status ? { baselineStatus: tree.status === 'APPLIED' ? 'NOT_APPLIED_UNKNOWN_SCOPE' : tree.status } : {}) });
  if (sinceRef) {
    const since = git('rev-parse', '--verify', '--quiet', `${sinceRef}^{commit}`);
    if (since.ok && since.out) {
      const ahead = git('log', '--format=%h %s', `${since.out}..HEAD`);
      if (ahead.ok) {
        return finish(describeReviewScope({ porcelain: tree.porcelain, aheadCommits: ahead.out, baseRef: since.out.slice(0, 12), mergeBase: since.out.slice(0, 12), taskScoped: true, excluded: tree.excluded, reverted: tree.reverted }));
      }
    }
    // sinceRef nicht nutzbar (Commit weg, git-Fehler): bewusst kein Abbruch,
    // stattdessen unten mit baseRef weiterpruefen statt UNKNOWN zu melden.
  }
  const base = git('rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`);
  if (!base.ok || !base.out) return unknown(errors.length ? errors : [`${baseRef} nicht vorhanden`]);
  const mergeBase = git('merge-base', baseRef, 'HEAD');
  if (!mergeBase.ok || !mergeBase.out) return unknown(errors.length ? errors : ['merge-base leer']);
  const ahead = git('log', '--format=%h %s', `${mergeBase.out}..HEAD`);
  if (!ahead.ok) return unknown(errors);
  return finish(describeReviewScope({ porcelain: tree.porcelain, aheadCommits: ahead.out, baseRef, mergeBase: mergeBase.out.slice(0, 12), excluded: tree.excluded, reverted: tree.reverted }));
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
      const out = String(exec('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim();
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

// Vierte Luecke, belegt am 2026-09-11: sinceRef grenzt nur Commits ab. Dateien,
// die schon VOR Sitzungsbeginn geaendert oder unversioniert im Working Tree
// lagen (domains/shopify/bild-qualitaetstest.py, .claude/launch.json), landeten
// im Pruefbereich, und Codex verlangte, die fremde Datei zu loeschen. Deshalb
// haelt openrouter-user-prompt.mjs beim ersten Prompt einer Sitzung den Zustand
// jedes Pfads aus git status fest (Statuscode + Inhalts-Hash); hier wird nur
// ausgeklammert, was exakt so geblieben ist. Neue, weiter veraenderte,
// geloeschte und zurueckgesetzte Dateien bleiben im Scope.
//
// Fail-safe: Baseline fehlt, ist kaputt, stammt aus einem anderen Repository,
// git scheitert oder ein Pfad ist nicht hashbar - dann wird NICHTS
// ausgeklammert. Lieber mehr pruefen als weniger.
export const WORKING_TREE_BASELINE_VERSION = 1;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

// "XY pfad\0" je Eintrag; bei Umbenennung/Kopie folgt der alte Pfad als eigenes
// Feld ("R  neu\0alt\0"). Ein Pfad kann zweimal vorkommen ("D " und "??", wenn
// eine gestagte Loeschung neu angelegt wurde) - deshalb eine Liste von Codes.
export function parsePorcelainZ(raw) {
  const tokens = String(raw ?? '').split('\0');
  const byPath = new Map();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.length < 4) continue;
    const code = token.slice(0, 2);
    const file = token.slice(3);
    const from = /[RC]/.test(code) ? (tokens[++index] ?? '') : null;
    const codes = byPath.get(file) ?? [];
    codes.push(from === null ? code : `${code} <- ${from}`);
    byPath.set(file, codes);
  }
  return byPath;
}

// git hash-object --stdin-paths kennt kein -z: eine Zeile, die mit " beginnt,
// wird C-entquotet, ein abschliessendes \r abgeschnitten - beides haette den
// Hash der NACHBARDATEI geliefert, und die Datei waere trotz Aenderung
// ausgeklammert worden (Pruefung 2026-09-11). Solche Pfade gelten als nicht
// hashbar und werden nie ausgeklammert.
function isHashablePath(file) {
  return !/[\n\r]/.test(file) && !file.startsWith('"');
}

// "<mode> <hash> <stage>\t<pfad>\0" je Eintrag. Pfade mit Konfliktstufen
// (stage > 0) sind nicht eindeutig und gelten als nicht hashbar.
export function parseLsFilesZ(raw) {
  const index = new Map();
  for (const token of String(raw ?? '').split('\0')) {
    const tab = token.indexOf('\t');
    if (tab < 0) continue;
    const [, hash, stage] = token.slice(0, tab).split(' ');
    const file = token.slice(tab + 1);
    if (stage !== '0' || index.get(file) === null) index.set(file, null);
    else index.set(file, hash);
  }
  return index;
}

// Zustand jedes Pfads, den git status meldet: Statuscodes plus Inhalts-Hash
// (git hash-object, ein Aufruf fuer alle Dateien), Symlink-Ziel oder
// "geloescht". Fuer versionierte Pfade zusaetzlich der Blob-Hash im Index:
// committet die Sitzung eine vorbestehend geaenderte Datei und stellt danach
// den alten Working-Tree-Inhalt wieder her, sind Statuscode und Inhalts-Hash
// wie bei Sitzungsbeginn, der Index aber nicht (Pruefung 2026-09-11).
// Nie eine Exception - ein Fehler kommt als { ok: false } zurueck.
export function captureWorkingTreeSnapshot({ cwd = process.cwd(), exec = execFileSync, io = fs } = {}) {
  try {
    const run = (args, { dir = cwd, input } = {}) => String(exec('git', args, {
      cwd: dir,
      encoding: 'utf8',
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'],
      maxBuffer: GIT_MAX_BUFFER,
      ...(input === undefined ? {} : { input }),
    }));
    const root = run(['rev-parse', '--show-toplevel']).trim();
    if (!root) throw new Error('git rev-parse --show-toplevel lieferte nichts');
    // Porcelain-Pfade sind relativ zur Repository-Wurzel, deshalb laeuft alles
    // Weitere dort. Nicht trimmen: der Statuscode beginnt oft mit einem
    // Leerzeichen (" M", " D"). --no-optional-locks: kein index.lock neben einer
    // parallel arbeitenden Sitzung.
    const byPath = parsePorcelainZ(run(['--no-optional-locks', 'status', '--porcelain', '-z', '--untracked-files=all'], { dir: root }));
    const index = byPath.size ? parseLsFilesZ(run(['--no-optional-locks', 'ls-files', '-s', '-z'], { dir: root })) : new Map();
    const entries = Object.create(null);
    const toHash = [];
    for (const [file, codes] of byPath) {
      const entry = { codes: [...codes].sort() };
      const absolute = path.join(root, file);
      let stat = null;
      try {
        stat = io.lstatSync(absolute);
      } catch (error) {
        if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error;
      }
      if (index.has(file)) {
        const indexHash = index.get(file);
        if (indexHash === null) entry.unhashable = true;
        else entry.index = indexHash;
      }
      if (entry.unhashable) { /* Konfliktstufen: nie ausklammern */ }
      else if (!stat) entry.deleted = true;
      else if (stat.isSymbolicLink()) entry.link = io.readlinkSync(absolute);
      else if (stat.isFile() && isHashablePath(file)) toHash.push(file);
      // Verzeichnis (eingebettetes Repository), nicht hashbarer Pfad o. ae.:
      // Inhalt nicht belegbar, wird deshalb nie ausgeklammert.
      else entry.unhashable = true;
      entries[file] = entry;
    }
    if (toHash.length) {
      const hashes = run(['hash-object', '--stdin-paths'], { dir: root, input: `${toHash.join('\n')}\n` }).split('\n').map(line => line.trim()).filter(Boolean);
      if (hashes.length !== toHash.length) throw new Error(`git hash-object lieferte ${hashes.length} statt ${toHash.length} Hashes`);
      toHash.forEach((file, index) => { entries[file].hash = hashes[index]; });
    }
    return { ok: true, version: WORKING_TREE_BASELINE_VERSION, root, entries };
  } catch (error) {
    return { ok: false, version: WORKING_TREE_BASELINE_VERSION, error: String(error?.message ?? error).slice(0, 300) };
  }
}

export function isUsableBaseline(baseline) {
  return Boolean(baseline) && typeof baseline === 'object' && baseline.ok === true
    && baseline.version === WORKING_TREE_BASELINE_VERSION
    && typeof baseline.root === 'string' && baseline.root.length > 0
    && Boolean(baseline.entries) && typeof baseline.entries === 'object' && !Array.isArray(baseline.entries);
}

function sameEntry(before, now) {
  if (!before || typeof before !== 'object' || !Array.isArray(before.codes) || before.unhashable || now.unhashable) return false;
  if (JSON.stringify([...before.codes].sort()) !== JSON.stringify(now.codes)) return false;
  // Index-Hash: fehlt er auf einer Seite oder weicht er ab, hat sich der
  // Vergleichsstand (HEAD/Index) geaendert - dann ist der Diff ein anderer.
  if ((before.index ?? null) !== (now.index ?? null)) return false;
  if (before.deleted || now.deleted) return before.deleted === true && now.deleted === true;
  if (before.link !== undefined || now.link !== undefined) return typeof before.link === 'string' && before.link === now.link;
  return typeof before.hash === 'string' && before.hash.length > 0 && before.hash === now.hash;
}

// Reine Entscheidung ohne git: welche aktuellen Pfade sind exakt der
// vorbestehende Zustand (excluded), welche nicht (remaining), und welche
// vorbestehenden Pfade sind aus git status verschwunden (reverted).
export function compareWithBaseline({ baseline, current }) {
  const excluded = [];
  const remaining = [];
  const reverted = [];
  for (const [file, entry] of Object.entries(current.entries)) {
    if (Object.hasOwn(baseline.entries, file) && sameEntry(baseline.entries[file], entry)) excluded.push(file);
    else remaining.push(file);
  }
  for (const file of Object.keys(baseline.entries)) {
    if (!Object.hasOwn(current.entries, file)) reverted.push(file);
  }
  return { excluded: excluded.sort(), remaining: remaining.sort(), reverted: reverted.sort() };
}

function applyBaseline({ cwd, baseline, porcelain, exec, io }) {
  const untouched = status => ({ porcelain, excluded: [], reverted: [], status });
  if (baseline == null) return untouched(null);
  if (!isUsableBaseline(baseline)) return untouched('UNUSABLE');
  const current = captureWorkingTreeSnapshot({ cwd, exec, io });
  if (!current.ok) return untouched('CAPTURE_FAILED');
  if (current.root !== baseline.root) return untouched('ROOT_MISMATCH');
  const { excluded, remaining, reverted } = compareWithBaseline({ baseline, current });
  return { porcelain: remaining.join('\n'), excluded, reverted, status: 'APPLIED' };
}

function formatPaths(files, max = 15) {
  const shown = files.slice(0, max).join(', ');
  return files.length > max ? `${shown} und ${files.length - max} weitere` : shown;
}

function withBaselineNotes(scope, { excluded = [], reverted = [] } = {}) {
  if (!excluded.length && !reverted.length) return scope;
  const parts = [scope.text];
  if (reverted.length) parts.push(`Zusätzlich hat diese Sitzung Dateien zurückgesetzt oder entfernt, die bei Sitzungsbeginn geändert bzw. unversioniert vorlagen: ${formatPaths(reverted)}. Ihr früherer Stand ist per git diff nicht mehr sichtbar; prüfe, ob das zum Auftrag gehört`);
  if (excluded.length) parts.push(`Vorbestehend, unverändert seit Sitzungsbeginn: ${formatPaths(excluded)}. Diese Dateien lagen schon vor dieser Sitzung geändert oder unversioniert im Working Tree, gehören nicht zu diesem Auftrag und sind kein Befund - verlange weder ihre Änderung noch ihre Entfernung`);
  return { ...scope, text: parts.join('. '), excluded: [...excluded], reverted: [...reverted] };
}

// Reine Frage (taskTypeSource QUESTION, siehe claude-bridge.mjs) ohne jede
// Aenderung: kein Modell-Review. Bis 2026-09-11 kostete jede Frage bis zu drei
// Codex-Laeufe, die Code fuer eine Wissensfrage verlangten. Fuer
// IMPLEMENTATION bleibt es bei der Frage an den Reviewer, ob ein No-op den
// Auftrag erfuellt - ein leerer Scope beweist dort nichts. UNKNOWN (git-Fehler)
// ist nie leer und wird deshalb immer geprueft.
export function shouldSkipReview({ state, scope } = {}) {
  return state?.reviewOnlyIfChanged === true && state?.taskType !== 'IMPLEMENTATION' && scope?.kind === REVIEW_SCOPE_NONE;
}
