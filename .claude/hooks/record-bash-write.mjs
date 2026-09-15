// PreToolUse/PostToolUse-Hook auf Bash: haelt fest, welche Dateien DIESE
// Sitzung ueber Shell-Befehle schreibt. Zweck und Grenzen stehen in
// automation/core/session-writes.mjs (fuenfte Luecke, 2026-09-15).
//
// Vor dem Befehl: git status als Statuscode je Pfad plus Startzeit. Danach:
// jeder Pfad mit neuem oder anderem Statuscode, jeder verschwundene Pfad und
// jeder Pfad mit mtime nach dem Start gilt als von dieser Sitzung geschrieben.
//
// Der Hook ist bewusst stumm: Er gibt nichts aus, entscheidet nichts und
// beendet immer mit 0. Ein git-Fehler laesst den Befehl unerfasst; der Filter
// bleibt dann auf dem Stand des Bestands.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { bashTouchedPaths, porcelainCodes, readBashPreSnapshot, recordSessionWrites, writeBashPreSnapshot } from '../../automation/core/session-writes.mjs';
import { resolveReviewDir } from '../../automation/core/review-scope.mjs';

async function stdinJson() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input || '{}');
}

try {
  const input = await stdinJson();
  if (input.hook_event_name !== 'PreToolUse' && input.hook_event_name !== 'PostToolUse') process.exit(0);
  if (process.env.TP_AGENT_LOOP_ACTIVE === '1') process.exit(0);
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const reviewDir = resolveReviewDir({ projectDir, sessionCwd: input.cwd });
  const git = args => String(execFileSync('git', ['--no-optional-locks', ...args], { cwd: reviewDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }));
  const root = git(['rev-parse', '--show-toplevel']).trim();
  if (!root) process.exit(0);
  const codes = porcelainCodes(execFileSync('git', ['--no-optional-locks', 'status', '--porcelain', '-z', '--untracked-files=all'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }));
  if (input.hook_event_name === 'PreToolUse') {
    // Bestand anlegen, damit belegt ist, dass die Erfassung laeuft.
    recordSessionWrites({ sessionId: input.session_id, projectDir, files: [] });
    writeBashPreSnapshot({ sessionId: input.session_id, projectDir, codes });
    process.exit(0);
  }
  const before = readBashPreSnapshot({ sessionId: input.session_id, projectDir });
  // Ohne Vor-Snapshot (Hook erst waehrend des Befehls verdrahtet) laesst sich
  // nichts zuordnen; der Deckel MAX_PATHS wuerde sonst mit fremden Pfaden
  // gefuellt. Der Befehl bleibt unerfasst - lieber gar kein Filter als ein
  // falscher, siehe truncated in session-writes.mjs.
  if (!before) process.exit(0);
  const mtimeOf = file => {
    try { return fs.lstatSync(path.join(root, file)).mtimeMs; } catch { return null; }
  };
  const touched = bashTouchedPaths({ before: before.codes, after: codes, startedAt: before.startedAt, mtimeOf });
  recordSessionWrites({ sessionId: input.session_id, projectDir, files: touched });
} catch {
  process.exit(0);
}
