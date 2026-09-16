// Welche Dateien hat DIESE Sitzung nachweislich selbst geschrieben?
//
// Warum das noetig ist (belegt am 2026-09-14): Der Pruefbereich stuetzte sich
// bis dahin auf Zeitpunkte - "was hat sich seit Sitzungsbeginn im Ordner
// veraendert". In einem Checkout, in dem 30 Sitzungen gleichzeitig arbeiten,
// ist das die falsche Frage: Fremde Aenderungen, die WAEHREND einer langen
// Sitzung entstehen, gelten damit als eigene. Der Reviewer verlangte daraufhin
// zweimal Korrekturen an fremder Arbeit - zuletzt an drei Dateien, die eine
// parallele Sitzung um 10:20, 10:32 und 10:37 geschrieben hatte.
//
// Die richtige Frage ist "welche Pfade habe ich selbst geschrieben", und die
// ist beantwortbar: Jeder Edit/Write laeuft durch einen PostToolUse-Hook.
//
// Bis 2026-09-15 galt die GRENZE: Erfasst wurden nur Schreibvorgaenge ueber
// Edit/Write/MultiEdit/NotebookEdit. Wer per Bash schrieb (`cat >>`, `chmod`,
// ein Generator, `npm run build`), tauchte hier NICHT auf. Deshalb wurde die
// Liste nur zum KENNZEICHNEN benutzt, nie zum Ausschliessen - ein harter
// Filter haette eigene, per Bash geschriebene Arbeit ungeprueft durchgelassen.
//
// Fuenfte Luecke, belegt am 2026-09-15 (Sitzung 413c819c im Hauptcheckout):
// Kennzeichnen reichte nicht. Fremde Dateien, die andere Sitzungen WAEHREND
// der Sitzung schrieben (assets/tp-einfass-konfigurator.js, die interne
// Bestellmail, .claude/launch.json, SEO_REPORT.md), standen trotz Vermerk
// vollstaendig im Pruefbereich, und Codex verlangte zwei Runden lang, sie zu
// "isolieren" - also zu stashen oder zurueckzusetzen, was CLAUDE.md verbietet.
// Die eigene Arbeit lag derweil auf Remote-Branches, die nie gelesen wurden.
//
// Seit Version 2 wird deshalb GEFILTERT, und die Bash-Luecke ist geschlossen:
// Ein PreToolUse/PostToolUse-Hook auf Bash (record-bash-write.mjs) haelt vor
// jedem Shell-Befehl `git status` fest und rechnet danach jeden Pfad der
// Sitzung zu, dessen Statuscode sich geaendert hat, der aus dem Status
// verschwunden ist oder dessen mtime nach dem Befehlsstart liegt
// (bashTouchedPaths). Fremde Schreibvorgaenge, die zufaellig in dasselbe
// Zeitfenster fallen, werden dabei mit erfasst - zu viel zu pruefen bleibt
// die sichere Richtung. Ein Bestand der Version 1 (nur Werkzeug-Schreibvorgaenge)
// wird nicht mehr gelesen: er darf nie als Filter dienen.
//
// Der Filter greift nur, wenn ein Bestand dieser Sitzung existiert und nicht
// gedeckelt ist (truncated). Sonst bleibt der Pruefbereich wie bisher: alles.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SESSION_WRITES_VERSION = 2;
// Deckel gegen unbegrenztes Wachstum bei sehr langen Sitzungen. Wird er
// erreicht, gilt die Liste als unvollstaendig (`truncated`) und der Vermerk
// beim Reviewer entfaellt - lieber keine Kennzeichnung als eine falsche.
export const SESSION_WRITES_MAX_PATHS = 500;

function sessionKey(sessionId) {
  return crypto.createHash('sha256').update(String(sessionId ?? 'unknown')).digest('hex').slice(0, 24);
}

export function sessionWritesPath({ sessionId, projectDir = process.cwd() }) {
  return path.join(projectDir, '.router', 'claude-writes', `${sessionKey(sessionId)}.json`);
}

// Pfade werden relativ zur Repository-Wurzel gespeichert, damit sie mit den
// Pfaden aus `git status --porcelain` vergleichbar sind. Ein Pfad ausserhalb
// des Repositories (Speicherdateien, /tmp) wird bewusst verworfen: er kann im
// Pruefbereich ohnehin nie auftauchen.
// Beide Seiten werden ueber realpath aufgeloest, bevor verglichen wird.
// Grund (im Praxistest 2026-09-14 aufgefallen): Auf macOS ist /tmp ein Symlink
// auf /private/tmp. `git rev-parse --show-toplevel` liefert den aufgeloesten
// Pfad, das Werkzeug meldet den unaufgeloesten - der Vergleich ergab dann
// "liegt ausserhalb des Repositories", und es wurde gar nichts erfasst.
// Schlaegt realpath fehl (Datei geloescht, keine Rechte), wird der Pfad
// unveraendert weiterbenutzt statt aufzugeben.
// Loest den tiefsten Teil des Pfades auf, der tatsaechlich existiert, und haengt
// den Rest unveraendert an. Noetig fuer neu angelegte Dateien in neu angelegten
// Verzeichnissen: realpath wirft dort, und ein Rueckfall auf den unaufgeloesten
// Pfad wuerde den Symlink-Vergleich wieder scheitern lassen (genau daran ist im
// Praxistest die Erfassung einer neuen Datei gescheitert).
function resolveReal(value, io) {
  const absolute = path.resolve(value);
  let vorhanden = absolute;
  const rest = [];
  for (;;) {
    try { return path.join(io.realpathSync(vorhanden), ...rest); } catch { /* weiter oben versuchen */ }
    const eltern = path.dirname(vorhanden);
    // Wurzel erreicht: nichts aufloesbar, unveraendert weiterbenutzen.
    if (eltern === vorhanden) return absolute;
    rest.unshift(path.basename(vorhanden));
    vorhanden = eltern;
  }
}

export function relativeRepoPath({ file, repoRoot, io = fs }) {
  if (!file || !repoRoot) return null;
  const relative = path.relative(resolveReal(repoRoot, io), resolveReal(file, io));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join('/');
}

// Nie eine Exception: Ein Fehler beim Mitschreiben darf weder das Werkzeug noch
// die Sitzung stoeren. Im schlimmsten Fall fehlt die Erfassung - und dann
// greift kein Filter (readSessionWrites liefert null).
export function recordSessionWrite({ sessionId, projectDir = process.cwd(), file, io = fs }) {
  if (!file) return null;
  return recordSessionWrites({ sessionId, projectDir, files: [file], io });
}

// Mehrere Pfade in einem Schreibvorgang (Bash-Hook). Eine leere Liste legt den
// Bestand an, ohne einen Pfad einzutragen - so ist belegt, dass die Erfassung
// dieser Sitzung laeuft, auch wenn sie (noch) nichts geschrieben hat.
export function recordSessionWrites({ sessionId, projectDir = process.cwd(), files = [], io = fs }) {
  if (!sessionId || !Array.isArray(files)) return null;
  try {
    const filePath = sessionWritesPath({ sessionId, projectDir });
    const current = readSessionWrites({ sessionId, projectDir, io }) ?? { version: SESSION_WRITES_VERSION, paths: [], truncated: false, created: true };
    let changed = current.created === true;
    for (const file of files) {
      if (!file || current.paths.includes(file)) continue;
      if (current.paths.length >= SESSION_WRITES_MAX_PATHS) {
        if (!current.truncated) { current.truncated = true; changed = true; }
        break;
      }
      current.paths.push(file);
      changed = true;
    }
    if (!changed) return filePath;
    io.mkdirSync(path.dirname(filePath), { recursive: true });
    io.writeFileSync(filePath, `${JSON.stringify({ version: SESSION_WRITES_VERSION, paths: current.paths, truncated: current.truncated })}\n`, 'utf8');
    return filePath;
  } catch {
    return null;
  }
}

// Vor-Snapshot je Bash-Aufruf: Statuscodes aller Pfade aus git status und der
// Startzeitpunkt. Liegt neben dem Bestand, wird bei jedem Befehl ueberschrieben.
export function bashPreSnapshotPath({ sessionId, projectDir = process.cwd() }) {
  return path.join(projectDir, '.router', 'claude-writes', `${sessionKey(sessionId)}.bash-pre.json`);
}

export function writeBashPreSnapshot({ sessionId, projectDir = process.cwd(), codes, startedAt = Date.now(), io = fs }) {
  if (!sessionId || !codes || typeof codes !== 'object') return null;
  try {
    const filePath = bashPreSnapshotPath({ sessionId, projectDir });
    io.mkdirSync(path.dirname(filePath), { recursive: true });
    io.writeFileSync(filePath, `${JSON.stringify({ version: SESSION_WRITES_VERSION, startedAt, codes })}\n`, 'utf8');
    return filePath;
  } catch {
    return null;
  }
}

export function readBashPreSnapshot({ sessionId, projectDir = process.cwd(), io = fs }) {
  if (!sessionId) return null;
  try {
    const parsed = JSON.parse(io.readFileSync(bashPreSnapshotPath({ sessionId, projectDir }), 'utf8'));
    if (parsed?.version !== SESSION_WRITES_VERSION || typeof parsed.startedAt !== 'number' || !parsed.codes || typeof parsed.codes !== 'object') return null;
    return { startedAt: parsed.startedAt, codes: parsed.codes };
  } catch {
    return null;
  }
}

// "XY pfad\0" je Eintrag aus `git status --porcelain -z`; bei Umbenennung folgt
// der alte Pfad als eigenes Feld und wird mit erfasst - beide Seiten hat
// dieser Befehl angefasst.
export function porcelainCodes(raw) {
  const tokens = String(raw ?? '').split('\0');
  const codes = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.length < 4) continue;
    const code = token.slice(0, 2);
    const file = token.slice(3);
    (codes[file] ??= []).push(code);
    if (/[RC]/.test(code)) {
      const from = tokens[++index];
      if (from) (codes[from] ??= []).push(`${code} ->`);
    }
  }
  for (const file of Object.keys(codes)) codes[file].sort();
  return codes;
}

// Reine Entscheidung ohne git: Welche Pfade hat der Bash-Befehl angefasst?
// - Statuscode neu oder geaendert (angelegt, geaendert, gestagt, ...)
// - aus dem Status verschwunden (zurueckgesetzt, geloescht, committet)
// - Statuscode gleich, aber mtime nach dem Start (Inhalt erneut geschrieben)
// mtimeOf(file) liefert Millisekunden oder null (nicht lesbar -> zaehlt nicht,
// der Statuscode hat dann schon entschieden oder der Pfad ist unveraendert).
// Die Toleranz faengt Uhren- und Dateisystemgranularitaet ab; sie vergroessert
// nur die Menge, nie verkleinert sie sie.
export const BASH_MTIME_TOLERANCE_MS = 2000;

export function bashTouchedPaths({ before = {}, after = {}, startedAt, mtimeOf = () => null } = {}) {
  const touched = new Set();
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  for (const [file, codes] of Object.entries(after)) {
    if (!Object.hasOwn(before, file) || !same(before[file], codes)) { touched.add(file); continue; }
    if (typeof startedAt !== 'number') continue;
    const mtime = mtimeOf(file);
    if (typeof mtime === 'number' && mtime >= startedAt - BASH_MTIME_TOLERANCE_MS) touched.add(file);
  }
  for (const file of Object.keys(before)) if (!Object.hasOwn(after, file)) touched.add(file);
  return [...touched].sort();
}

// null statt Exception: fehlt die Datei oder ist sie kaputt, gibt es eben keine
// Kennzeichnung und der Pruefbereich bleibt wie bisher.
export function readSessionWrites({ sessionId, projectDir = process.cwd(), io = fs }) {
  if (!sessionId) return null;
  try {
    const parsed = JSON.parse(io.readFileSync(sessionWritesPath({ sessionId, projectDir }), 'utf8'));
    if (parsed?.version !== SESSION_WRITES_VERSION || !Array.isArray(parsed.paths)) return null;
    return { version: parsed.version, paths: parsed.paths, truncated: parsed.truncated === true };
  } catch {
    return null;
  }
}
