#!/usr/bin/env node
// PreToolUse-Hook: blockt über Bash nur produktionskritische Shopify-Operationen
// und Operationen, die main/den Verlauf verändern (Force-Push, Push/Merge nach
// main, Release/Tag). Normales `git commit` / `git push` auf dem aktuellen
// Feature-Branch ist ERLAUBT - das ist der vorgesehene Weg, wie eine
// Claude-Code-Session auf diesem Branch Fortschritt sichert (siehe Session-
// Git-Workflow). Ergänzt, ersetzt nicht die eigentliche Durchsetzung
// (Router-Gates in workflow/core.mjs: assertPrGate/assertPreviewGate/
// assertLiveGate, CI-Evidence-Gate).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const FORBIDDEN = [
  [/(^|&&|;|\|)\s*git\s+push\s+(--force|-f|--force-with-lease)\b/i, 'Force-Push ist gesperrt.'],
  [/(^|&&|;|\|)\s*git\s+push\b.*\b(origin\s+)?main\b/i, 'Push nach main ist gesperrt (Merge nach main erfordert menschliche Freigabe/PR).'],
  [/(^|&&|;|\|)\s*gh\s+pr\s+merge\b/i, 'gh pr merge ist gesperrt (Merge nach main erfordert menschliche Freigabe).'],
  [/(^|&&|;|\|)\s*git\s+(tag|release)\b/i, 'Tag/Release-Erstellung ist gesperrt.'],
  [/(^|&&|;|\|)\s*shopify\s+theme\s+(publish|push)\b/i, 'Direkter Shopify-Theme-Push/-Publish ist gesperrt. Nutze npm run workflow:preview bzw. npm run workflow:live (enthalten die erforderlichen Gates).'],
];

let payload;
try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

if (payload.tool_name !== 'Bash') process.exit(0);
const command = String(payload.tool_input?.command ?? '');

for (const [pattern, reason] of FORBIDDEN) {
  if (pattern.test(command)) {
    console.error(`BLOCKED: ${reason}`);
    process.exit(2);
  }
}

// git push auf den aktuellen Branch selbst ist erlaubt, aber niemals auf einen
// anderen Branch als den aktuell ausgecheckten (z. B. kein "git push origin X:main").
if (/(^|&&|;|\|)\s*git\s+push\b/i.test(command)) {
  let currentBranch = '';
  try { currentBranch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(); } catch {}
  const pushesOtherBranch = currentBranch && new RegExp(`:(?!${currentBranch}\\b)[A-Za-z0-9._/-]+\\s*$`).test(command.trim());
  if (pushesOtherBranch) {
    console.error('BLOCKED: git push mit explizitem Fremd-Branch-Ziel ist gesperrt.');
    process.exit(2);
  }
}

process.exit(0);
