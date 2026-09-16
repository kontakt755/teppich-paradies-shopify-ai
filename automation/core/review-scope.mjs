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
// Das Ergebnis liegt als Commit vor, den die Sitzung per Ergebnis-Zeiger
// benannt hat (siehe readResultPointer). Der Working Tree ist dann nicht der
// Pruefbereich - der Diff zwischen Basis und Commit ist es.
export const REVIEW_SCOPE_RESULT = 'RESULT';

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
export function describeReviewScope({ excluded = [], reverted = [], ownPaths = null, ownPathsTruncated = false, ...rest } = {}) {
  // Erst die Zuordnung: Was diese Sitzung nachweislich nicht geschrieben hat,
  // verlaesst den Pruefbereich, bevor entschieden wird, ob er "dirty" ist.
  const own = splitByOwnership({ porcelain: rest.porcelain, reverted, ownPaths, truncated: ownPathsTruncated });
  const scope = describeTreeScope({ ...rest, porcelain: own.porcelain, forceDirty: own.reverted.length > 0 });
  // Welche Pfade liegen ueberhaupt im Bereich? Nur die uncommitteten aus
  // git status; Commits sind bereits durch sinceRef auf diesen Auftrag begrenzt.
  const scopePaths = porcelainPaths(own.porcelain);
  return withForeignNotes(withBaselineNotes({ ...scope, scopePaths }, { excluded, reverted: own.reverted }), own);
}

// Eine Zeile aus `git status --porcelain` ist "XY pfad". Umbenennungen
// ("R  neu -> alt") liefern den neuen Pfad; er ist der, der im Diff auftaucht.
export function porcelainPaths(porcelain) {
  return String(porcelain ?? '').split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    // Nach Abzug der Baseline steht in porcelain nur noch der blosse Pfad,
    // davor die Form "XY pfad" - beide Faelle abdecken.
    .map(line => (/^[ ?!ACDMRTU]{1,2}\s/.test(line) ? line.replace(/^[ ?!ACDMRTU]{1,2}\s+/, '') : line))
    .map(line => line.split(' -> ').pop().trim())
    .filter(Boolean);
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
// docs/ai-dashboard/issues.json schreibt der Dashboard-Bot (CLAUDE.md,
// Abschnitt Dashboard): stuendlich nach main, lokal von `npm run task` und
// `npm run dashboard`, und sie wird nie mitcommittet. Die Sitzungs-Baseline
// allein genuegt hier nicht - schreibt der Bot die Datei waehrend der Sitzung
// neu, weicht sie von der Baseline ab und stuende wieder im Pruefbereich.
export const BOT_OWNED_PATHS = Object.freeze(['docs/ai-dashboard/issues.json']);

// Eine Zeile ist entweder "XY pfad" aus git status - der Statuscode kann durch
// das trim() der git-Hilfe sein fuehrendes Leerzeichen verloren haben - oder,
// nach Abzug der Baseline, der blosse Pfad. Eine Umbenennung ("R  alt -> pfad")
// zaehlt bewusst nicht: dort ist der Bezug nicht eindeutig, und mehr pruefen
// ist sicherer als weniger.
function botOwnedPath(line) {
  return BOT_OWNED_PATHS.find(file => line === file
    || (line.endsWith(file) && /^[ ?!ACDMRTU]{1,2} $/.test(line.slice(0, line.length - file.length)))) ?? null;
}

function withoutBotOwned(tree) {
  const porcelain = [];
  const botOwned = [];
  for (const line of String(tree.porcelain ?? '').split('\n')) {
    if (!line.trim()) continue;
    const file = botOwnedPath(line);
    if (file) botOwned.push(file);
    else porcelain.push(line);
  }
  return { ...tree, porcelain: porcelain.join('\n'), botOwned };
}

function noteBotOwned(scope, botOwned) {
  if (!botOwned.length) return scope;
  return { ...scope, botOwned: [...botOwned], text: `${scope.text}. ${formatPaths(botOwned)} schreibt der Dashboard-Bot und wird nie mitcommittet: gehört nicht zu diesem Auftrag und ist kein Befund` };
}

export function detectReviewScope({ cwd = process.cwd(), baseRef = 'origin/main', sinceRef = null, baseline = null, ownPaths = null, ownPathsTruncated = false, resultPointer = null, exec = execFileSync, io = fs } = {}) {
  const errors = [];
  const git = (...args) => {
    try {
      return { ok: true, out: String(exec('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim() };
    } catch (error) {
      errors.push(`git ${args.join(' ')}: ${error?.message ?? error}`);
      return { ok: false, out: '' };
    }
  };
  // Ergebnis-Zeiger zuerst: Ist er belegt, ist der Working Tree dieses
  // Verzeichnisses nicht der Pruefbereich. Ein verworfener Zeiger wird unten
  // im Text genannt, der Pruefbereich bleibt dann wie bisher.
  const pointer = resultPointer ? verifyResultPointer({ pointer: resultPointer, cwd, exec }) : null;
  if (pointer?.ok) return resultScope(pointer);
  const notePointer = scope => (pointer ? { ...scope, resultPointer: { rejected: pointer.error }, text: `${scope.text}. Ein hinterlegter Ergebnis-Zeiger wurde verworfen (${pointer.error}); geprüft wird deshalb wie ohne Zeiger` } : scope);
  const status = git('status', '--porcelain');
  if (!status.ok) return notePointer(unknownScope(errors, baseRef));
  const tree = withoutBotOwned(applyBaseline({ cwd, baseline, porcelain: status.out, exec, io }));
  const finish = scope => notePointer(noteBotOwned(tree.status ? { ...scope, baselineStatus: tree.status } : scope, tree.botOwned));
  // UNKNOWN verlangt ohnehin, alles Uncommittete konservativ zu pruefen - eine
  // Notiz "kein Befund" zu vorbestehenden Dateien wuerde das nur aufweichen
  // (Pruefung 2026-09-11). Deshalb hier keine Ausklammerung und keine Notiz.
  const unknown = errs => notePointer({ ...unknownScope(errs, baseRef), ...(tree.status ? { baselineStatus: tree.status === 'APPLIED' ? 'NOT_APPLIED_UNKNOWN_SCOPE' : tree.status } : {}) });
  if (sinceRef) {
    const since = git('rev-parse', '--verify', '--quiet', `${sinceRef}^{commit}`);
    if (since.ok && since.out) {
      const ahead = git('log', '--format=%h %s', `${since.out}..HEAD`);
      if (ahead.ok) {
        return finish(describeReviewScope({ porcelain: tree.porcelain, aheadCommits: ahead.out, baseRef: since.out.slice(0, 12), mergeBase: since.out.slice(0, 12), taskScoped: true, excluded: tree.excluded, reverted: tree.reverted, ownPaths, ownPathsTruncated }));
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
  return finish(describeReviewScope({ porcelain: tree.porcelain, aheadCommits: ahead.out, baseRef, mergeBase: mergeBase.out.slice(0, 12), excluded: tree.excluded, reverted: tree.reverted, ownPaths, ownPathsTruncated }));
}

// Sechste Luecke, belegt am 2026-09-16 (Sitzung 413c819c): Das Ergebnis eines
// Auftrags entstand in einem Wegwerf-Worktree, ging als PR #343 nach main
// (Commit d14d822). Der Sitzungsordner stand die ganze Zeit auf einem fremden
// Branch mit 16 uncommitteten fremden Dateien. Der Reviewer las drei Runden
// lang den Working Tree und meldete korrekt "kein Diff, kein Commit" - die
// Arbeit lag nur woanders. Beide von ihm empfohlenen Auswege (im fremden
// Arbeitsstand nochmal implementieren, geteilten Checkout auf main drehen)
// verbietet CLAUDE.md.
//
// Deshalb kann eine Sitzung einen Ergebnis-Zeiger hinterlegen:
// .router/claude-handoffs/<TASK-ID>.ergebnis.json mit
// { "commit": "<sha>", "basis": "<sha>", "pr": <nummer> }. Liegt er vor und
// haelt er der Pruefung stand, ist "git diff <basis> <commit>" der
// Pruefbereich statt des Working Trees. Ohne Zeiger aendert sich nichts.
//
// Ein frei erfundener SHA wird nicht angenommen: Commit und Basis muessen
// von origin/main oder einem anderen origin/*-Branch erreichbar sein, und die
// Basis muss ein Vorfahr des Commits sein. Ein Zeiger, der das nicht erfuellt,
// wird verworfen und im Pruefbereich genannt - dann gilt wieder der Working
// Tree. Fail-safe in beide Richtungen: nie eine Exception, nie ein stiller
// Wechsel des Pruefbereichs.
const SHA_PATTERN = /^[0-9a-f]{7,40}$/;

export function resultPointerPath({ projectDir, taskId, reviewTaskPath = null }) {
  if (reviewTaskPath && /\.review\.md$/.test(reviewTaskPath)) return reviewTaskPath.replace(/\.review\.md$/, '.ergebnis.json');
  if (!projectDir || !taskId) return null;
  const compact = String(taskId).trim().toUpperCase().replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'CLAUDE-TASK';
  return path.join(projectDir, '.router', 'claude-handoffs', `${compact}.ergebnis.json`);
}

// Liest den Zeiger. Fehlt die Datei: null (kein Zeiger, kein Vermerk). Ist sie
// da, aber unbrauchbar: { error } - das wird als verworfener Zeiger genannt,
// damit ein Tippfehler nicht still im alten Verhalten verschwindet.
export function readResultPointer({ filePath, io = fs } = {}) {
  if (!filePath) return null;
  let raw;
  try {
    if (!io.existsSync(filePath)) return null;
    raw = io.readFileSync(filePath, 'utf8');
  } catch (error) {
    return { error: `Ergebnis-Zeiger nicht lesbar: ${String(error?.message ?? error).slice(0, 120)}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: `Ergebnis-Zeiger ${path.basename(filePath)} ist kein gültiges JSON` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: `Ergebnis-Zeiger ${path.basename(filePath)} ist kein Objekt` };
  const commit = String(parsed.commit ?? '').trim().toLowerCase();
  const basis = String(parsed.basis ?? '').trim().toLowerCase();
  if (!SHA_PATTERN.test(commit) || !SHA_PATTERN.test(basis)) return { error: 'Ergebnis-Zeiger braucht "commit" und "basis" als SHA (7-40 Hex-Zeichen)' };
  const pr = Number.isInteger(parsed.pr) && parsed.pr > 0 ? parsed.pr : null;
  return { commit, basis, pr, filePath };
}

// Prueft den Zeiger gegen das Repository. ok:true nur, wenn beide SHAs
// aufloesbar, von einem origin/*-Ref erreichbar und die Basis Vorfahr des
// Commits ist. Sonst ok:false mit Begruendung - nie eine Exception.
export function verifyResultPointer({ pointer, cwd = process.cwd(), exec = execFileSync } = {}) {
  if (!pointer || pointer.error) return { ok: false, error: pointer?.error ?? 'kein Zeiger' };
  const git = (...args) => {
    try {
      return String(exec('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim();
    } catch {
      return null;
    }
  };
  const resolved = {};
  for (const key of ['commit', 'basis']) {
    const sha = git('rev-parse', '--verify', '--quiet', `${pointer[key]}^{commit}`);
    if (!sha) return { ok: false, error: `${key} ${pointer[key]} ist kein Commit in diesem Repository` };
    const refs = git('for-each-ref', '--format=%(refname:short)', `--contains=${sha}`, 'refs/remotes/origin/');
    if (refs === null) return { ok: false, error: `Erreichbarkeit von ${key} ${pointer[key]} nicht prüfbar (git for-each-ref fehlgeschlagen)` };
    const reachable = refs.split('\n').map(line => line.trim()).filter(line => line && line !== 'origin/HEAD');
    if (!reachable.length) return { ok: false, error: `${key} ${pointer[key]} ist von keinem origin/*-Branch erreichbar` };
    resolved[key] = { sha, refs: reachable };
  }
  try {
    exec('git', ['merge-base', '--is-ancestor', resolved.basis.sha, resolved.commit.sha], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return { ok: false, error: `basis ${pointer.basis} ist kein Vorfahr von commit ${pointer.commit}` };
  }
  const log = git('log', '--format=%h %s', `${resolved.basis.sha}..${resolved.commit.sha}`);
  const stat = git('diff', '--stat', resolved.basis.sha, resolved.commit.sha);
  return {
    ok: true,
    commit: resolved.commit.sha,
    basis: resolved.basis.sha,
    pr: pointer.pr ?? null,
    reachableVia: resolved.commit.refs,
    commits: String(log ?? '').split('\n').map(line => line.trim()).filter(Boolean),
    diffStat: stat ?? '',
    filePath: pointer.filePath ?? null,
  };
}

// Ein Satz fuer Reviewer und Handoff - dieselbe Formulierung an beiden Stellen.
export function describeResultPointer(pointer) {
  const pr = pointer.pr ? `, PR #${pointer.pr}` : '';
  const via = pointer.reachableVia?.length ? `, erreichbar über ${formatPaths(pointer.reachableVia, 5)}` : '';
  return `Commit ${pointer.commit.slice(0, 12)} gegenüber Basis ${pointer.basis.slice(0, 12)}${pr}${via}`;
}

function resultScope(pointer) {
  const commits = pointer.commits ?? [];
  return {
    kind: REVIEW_SCOPE_RESULT,
    commits,
    resultPointer: pointer,
    text: `das per Ergebnis-Zeiger benannte Ergebnis dieses Auftrags: ${describeResultPointer(pointer)}. Der zu prüfende Diff ist "git diff ${pointer.basis} ${pointer.commit}"${commits.length ? ` (${commits.length} Commits: ${commits.join('; ')})` : ''}. Der Working Tree dieses Verzeichnisses gehört NICHT zum Prüfbereich: Er kann auf einem anderen Branch stehen und uncommittete Dateien anderer Sitzungen enthalten - beides ist kein Befund, verlange weder ihre Änderung, Entfernung noch Isolierung. Ein leerer "git diff" und ein Branch ohne diese Commits sind hier erwartet; lies den Diff ausschließlich über die beiden SHAs`,
  };
}

// Traegt den Zeiger sichtbar in den Pruefauftrag (<TASK-ID>.review.md) ein,
// idempotent: ein zweiter Stop ersetzt den Abschnitt statt ihn zu doppeln.
const HANDOFF_POINTER_MARK = '\n## Ergebnis-Zeiger\n';

export function noteResultPointerInHandoff({ reviewTaskPath, pointer, io = fs } = {}) {
  if (!reviewTaskPath || !pointer?.ok) return false;
  try {
    if (!io.existsSync(reviewTaskPath)) return false;
    const current = io.readFileSync(reviewTaskPath, 'utf8');
    const index = current.indexOf(HANDOFF_POINTER_MARK);
    const base = index >= 0 ? current.slice(0, index) : current.replace(/\n*$/, '\n');
    const section = `${HANDOFF_POINTER_MARK}Die Sitzung hat ihr Ergebnis als Commit hinterlegt: ${describeResultPointer(pointer)}. Prüfbereich ist "git diff ${pointer.basis} ${pointer.commit}", nicht der Working Tree.\n`;
    io.writeFileSync(reviewTaskPath, `${base}${section}`, 'utf8');
    return true;
  } catch {
    return false;
  }
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
//
// Grenze der Baseline (fuenfte Luecke, 2026-09-15): Sie kennt nur den Stand
// beim ersten Prompt. Was andere Sitzungen danach schreiben, ist ihr gegenueber
// neu. Dafuer ist die Zuordnung nach Urheber zustaendig (splitByOwnership,
// gespeist aus session-writes.mjs), die nach der Baseline greift.
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

// Fuenfte Luecke, belegt am 2026-09-15 (Sitzung 413c819c, Hauptcheckout):
// Die Baseline haelt nur den Stand beim ERSTEN Prompt fest. Was andere
// Sitzungen im geteilten Checkout SPAETER schreiben (assets/tp-einfass-
// konfigurator.js, domains/shopify/benachrichtigungen/, .claude/launch.json,
// SEO_REPORT.md), ist ihr gegenueber neu und stand vollstaendig im
// Pruefbereich. Codex verlangte zwei Runden lang, diese fremde Arbeit zu
// "isolieren" - stashen oder zuruecksetzen, was CLAUDE.md verbietet -, waehrend
// die eigene Arbeit der Sitzung auf Remote-Branches lag und ungelesen blieb.
//
// Seit 2026-09-14 gab es dafuer nur einen Vermerk ("stammen nicht aus dieser
// Sitzung"), keinen Filter: Die Erfassung kannte nur Edit/Write, nicht Bash.
// Der Vermerk hat nichts geaendert - und im Hauptcheckout lief er nicht
// einmal, weil dessen HEAD den Commit nicht enthielt. Seit 2026-09-15 erfasst
// record-bash-write.mjs auch Shell-Befehle (siehe session-writes.mjs), und
// hier wird gefiltert: Ein Pfad im Working Tree, den diese Sitzung
// nachweislich nicht geschrieben hat, gehoert nicht in den Pruefbereich.
// Das gilt auch fuer "reverted": ein vorbestehender Pfad, der aus git status
// verschwand, ohne dass diese Sitzung ihn anfasste, wurde von jemand anderem
// zurueckgesetzt.
//
// Fail-safe: ohne Bestand (ownPaths null) oder bei gedeckelter Erfassung
// (truncated) wird NICHT gefiltert, der Pruefbereich bleibt Wort fuer Wort wie
// bisher. Eine LEERE Liste ist dagegen ein Beleg: Der Bestand existiert, die
// Sitzung hat nichts geschrieben - alles im Working Tree ist fremd.
function splitByOwnership({ porcelain = '', reverted = [], ownPaths = null, truncated = false } = {}) {
  const untouched = { porcelain, reverted: [...reverted], foreignPaths: [], foreignReverted: [], ownPaths: null, filtered: false };
  if (!Array.isArray(ownPaths) || truncated) return untouched;
  const eigene = new Set(ownPaths);
  // Ohne Baseline meldet git status ein neues Verzeichnis als eine Zeile
  // ("?? assets/"). Liegt darin ein eigener Pfad, ist die Zeile eigen.
  const eigenesVerzeichnis = dir => dir.endsWith('/') && ownPaths.some(file => file.startsWith(dir));
  const kept = [];
  const foreign = [];
  for (const line of String(porcelain ?? '').split('\n')) {
    if (!line.trim()) continue;
    const [file] = porcelainPaths(line);
    if (eigene.has(file) || eigenesVerzeichnis(file)) kept.push(line);
    else foreign.push(file);
  }
  return {
    porcelain: kept.join('\n'),
    reverted: reverted.filter(file => eigene.has(file)),
    foreignPaths: foreign.sort(),
    foreignReverted: reverted.filter(file => !eigene.has(file)).sort(),
    ownPaths: [...ownPaths],
    filtered: true,
  };
}

function withForeignNotes(scope, own) {
  if (!own.filtered) return scope;
  const result = { ...scope, ownPaths: own.ownPaths, foreignPaths: own.foreignPaths };
  const fremde = [...own.foreignPaths, ...own.foreignReverted];
  if (!fremde.length) return result;
  return {
    ...result,
    text: `${scope.text}. Nicht im Prüfbereich, weil nachweislich nicht von dieser Sitzung geschrieben: ${formatPaths(fremde)}. Erfasst werden alle Schreibvorgänge dieser Sitzung über Datei-Werkzeuge und Shell-Befehle; diese Pfade stammen aus einer anderen, parallel im selben Checkout laufenden Sitzung. Sie gehören nicht zu diesem Auftrag und sind kein Befund - verlange weder ihre Änderung, Entfernung noch Isolierung`,
  };
}

// Bis 2026-09-15: nur ein Vermerk statt eines Filters. Bleibt als Export fuer
// aeltere Aufrufer erhalten, liefert aber dieselbe Zuordnung wie der Filter.
export function withOwnPathNotes(scope, { ownPaths = null, truncated = false } = {}) {
  if (!Array.isArray(ownPaths) || truncated) return scope;
  const eigene = new Set(ownPaths);
  const fremde = (scope.scopePaths ?? []).filter(file => !eigene.has(file));
  return withForeignNotes({ ...scope, scopePaths: (scope.scopePaths ?? []).filter(file => eigene.has(file)) }, { filtered: true, ownPaths: [...ownPaths], foreignPaths: fremde, foreignReverted: [] });
}

function withBaselineNotes(scope, { excluded = [], reverted = [] } = {}) {
  if (!excluded.length && !reverted.length) return scope;
  const parts = [scope.text];
  if (reverted.length) parts.push(`Zusätzlich hat diese Sitzung Dateien zurückgesetzt oder entfernt, die bei Sitzungsbeginn geändert bzw. unversioniert vorlagen: ${formatPaths(reverted)}. Ihr früherer Stand ist per git diff nicht mehr sichtbar; prüfe, ob das zum Auftrag gehört`);
  if (excluded.length) parts.push(`Vorbestehend, unverändert seit Sitzungsbeginn: ${formatPaths(excluded)}. Diese Dateien lagen schon vor dieser Sitzung geändert oder unversioniert im Working Tree, gehören nicht zu diesem Auftrag und sind kein Befund - verlange weder ihre Änderung noch ihre Entfernung`);
  return { ...scope, text: parts.join('. '), excluded: [...excluded], reverted: [...reverted] };
}

// Schlussantwort an den Reviewer (2026-09-11). Eine reine Wissensfrage wurde
// als IMPLEMENTATION eingestuft, und der Reviewer verlangte fuer einen leeren
// Diff Code. Die Einstufung wird bewusst NICHT ueber Wortmuster korrigiert:
// eine Probe ueber 485 echte Nutzerprompts kippte 36 davon auf "Frage",
// darunter eindeutige Auftraege - die Aenderung waere still ausgefallen.
// Stattdessen sieht der Reviewer bei leerem Pruefbereich die letzte Antwort
// des Agenten und entscheidet selbst, ob sie den Auftrag ohne Aenderung
// erfuellt. Bei jedem anderen Scope (CHANGES, UNKNOWN) bleibt alles wie bisher:
// dort ist der Diff der Beleg, und der Abschnitt "es gibt keinen Diff" waere
// falsch.
//
// Quelle ist last_assistant_message aus dem Stop-Hook-Input (Hook-Doku von
// Claude Code), nicht das Transkript: das wird asynchron geschrieben und kann
// der letzten Antwort hinterherhinken. Fail-safe: fehlt das Feld, ist es leer
// oder kein String, laeuft das Review wie bisher ohne Schlussantwort - nie
// wird deshalb uebersprungen oder abgebrochen.
export const REVIEW_CANDIDATE_MAX_CHARS = 12_000;

export function reviewCandidateFromStop({ input, scope } = {}) {
  if (scope?.kind !== REVIEW_SCOPE_NONE) return '';
  const text = sanitizeReviewCandidate(input?.last_assistant_message);
  if (!text) return '';
  return truncateKeepingEnds(text, REVIEW_CANDIDATE_MAX_CHARS);
}

// Steuerzeichen raus (Nachpruefung 2026-09-11): Der Prompt geht als argv an
// spawnSync, und ein NUL darin wirft ERR_INVALID_ARG_VALUE. Der Stop-Hook
// landete damit im Infrastrukturfehler-Pfad, und der Turn endete ohne Review -
// ausgeloest von genau dem Agenten, der geprueft werden soll. Tab, Zeilenumbruch
// und Wagenruecklauf bleiben; alle anderen C0-Zeichen und DEL werden zu einem
// Leerzeichen, damit keine Woerter zusammenkleben. Kein String -> ''.
const CANDIDATE_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeReviewCandidate(text) {
  if (typeof text !== 'string') return '';
  return text.replace(CANDIDATE_CONTROL_CHARS, ' ').trim();
}

// Anfang UND Ende behalten: am Anfang steht meist die Antwort, am Ende das
// Fazit bzw. die Belege. Gezaehlt wird in Unicode-Zeichen, damit kein Emoji
// oder Umlaut-Surrogat mitten durchgeschnitten wird. Das Ergebnis ist nie
// laenger als maxChars, die Kuerzung steht als Markierung im Text.
function truncateKeepingEnds(text, maxChars) {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  const MARK_BUDGET = 100;
  const budget = Math.max(0, maxChars - MARK_BUDGET);
  const head = Math.ceil(budget / 2);
  const tail = budget - head;
  const omitted = chars.length - head - tail;
  const mark = `\n\n[… ${omitted} von ${chars.length} Zeichen in der Mitte gekürzt …]\n\n`;
  return `${chars.slice(0, head).join('')}${mark}${tail ? chars.slice(-tail).join('') : ''}`;
}
