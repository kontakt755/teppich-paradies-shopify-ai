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
// WICHTIGE GRENZE: Erfasst werden nur Schreibvorgaenge ueber die Werkzeuge
// Edit/Write/MultiEdit/NotebookEdit. Wer per Bash schreibt (`cat >>`, `chmod`,
// ein Generator, `npm run build`), taucht hier NICHT auf. Deshalb wird diese
// Liste ausschliesslich zum KENNZEICHNEN benutzt, nie zum Ausschliessen: Ein
// hart gefilterter Pruefbereich wuerde sonst eigene, per Bash geschriebene
// Arbeit ungeprueft durchlassen - und zu wenig zu pruefen ist gefaehrlicher
// als zu viel.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SESSION_WRITES_VERSION = 1;
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
// die Sitzung stoeren. Im schlimmsten Fall fehlt die Kennzeichnung.
export function recordSessionWrite({ sessionId, projectDir = process.cwd(), file, io = fs }) {
  if (!sessionId || !file) return null;
  try {
    const filePath = sessionWritesPath({ sessionId, projectDir });
    const current = readSessionWrites({ sessionId, projectDir, io }) ?? { version: SESSION_WRITES_VERSION, paths: [], truncated: false };
    if (current.paths.includes(file)) return filePath;
    if (current.paths.length >= SESSION_WRITES_MAX_PATHS) {
      if (current.truncated) return filePath;
      current.truncated = true;
    } else {
      current.paths.push(file);
    }
    io.mkdirSync(path.dirname(filePath), { recursive: true });
    io.writeFileSync(filePath, `${JSON.stringify({ ...current, version: SESSION_WRITES_VERSION })}\n`, 'utf8');
    return filePath;
  } catch {
    return null;
  }
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
