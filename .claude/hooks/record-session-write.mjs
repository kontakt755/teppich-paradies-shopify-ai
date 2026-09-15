// PostToolUse-Hook: haelt fest, welche Dateien DIESE Sitzung selbst schreibt.
// Zweck und Grenzen stehen in automation/core/session-writes.mjs.
//
// Der Hook ist bewusst stumm: Er gibt nichts aus, entscheidet nichts und
// beendet immer mit 0. Sein einziges Ergebnis ist ein Eintrag unter
// .router/claude-writes/.
import { execFileSync } from 'node:child_process';
import { recordSessionWrite, relativeRepoPath } from '../../automation/core/session-writes.mjs';
import { resolveReviewDir } from '../../automation/core/review-scope.mjs';

async function stdinJson() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input || '{}');
}

try {
  const input = await stdinJson();
  if (input.hook_event_name !== 'PostToolUse') process.exit(0);
  // Innerhalb von agents:loop laeuft ein eigener Lauf mit eigenem Pruefbereich
  // (dort belegen die Guard-Diffs, was der Worker anfasste).
  if (process.env.TP_AGENT_LOOP_ACTIVE === '1') process.exit(0);
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!file) process.exit(0);
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  // Arbeitet die Sitzung in einem Worktree, liegt ihre Arbeit dort - der
  // Pruefbereich wird spaeter im selben Verzeichnis ermittelt (resolveReviewDir).
  const reviewDir = resolveReviewDir({ projectDir, sessionCwd: input.cwd });
  let repoRoot;
  try {
    repoRoot = String(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: reviewDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim();
  } catch {
    process.exit(0);
  }
  const relative = relativeRepoPath({ file, repoRoot });
  if (!relative) process.exit(0);
  // Der Zustand liegt bewusst unter projectDir, wie Session-State und Baseline,
  // damit router:status und die Handoffs alles an einer Stelle finden.
  recordSessionWrite({ sessionId: input.session_id, projectDir, file: relative });
} catch {
  process.exit(0);
}
