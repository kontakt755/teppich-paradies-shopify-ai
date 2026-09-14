// PreToolUse-Hook fuer Edit/Write: siehe automation/core/model-gate.mjs.
// Warnt einmal je Sitzung, wenn eine Klasse-A/B-Aufgabe in der interaktiven
// Sitzung statt ueber agents:loop bearbeitet wird. Blockiert nie.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readClaudeSessionState } from '../../automation/core/claude-session-state.mjs';
import { decideModelGate } from '../../automation/core/model-gate.mjs';

async function stdinJson() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input || '{}');
}

function warnMarkerPath({ sessionId, projectDir }) {
  const key = crypto.createHash('sha256').update(String(sessionId ?? 'unknown')).digest('hex').slice(0, 24);
  return path.join(projectDir, '.router', 'model-gate', `${key}.json`);
}

// Jeder Fehler endet in exit 0 ohne Ausgabe: ein Hinweis darf einen Edit nie
// verhindern, auch nicht durch einen Fehler in sich selbst.
try {
  const input = await stdinJson();
  if (input.hook_event_name !== 'PreToolUse') process.exit(0);
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const marker = warnMarkerPath({ sessionId: input.session_id, projectDir });
  const decision = decideModelGate({
    taskClass: readClaudeSessionState({ sessionId: input.session_id, projectDir })?.state?.taskClass ?? null,
    agentLoopActive: process.env.TP_AGENT_LOOP_ACTIVE === '1',
    gateSetting: process.env.TP_MODEL_GATE ?? null,
    alreadyWarned: fs.existsSync(marker),
  });
  if (!decision.warn) process.exit(0);
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, `${JSON.stringify({ warnedAt: new Date().toISOString() })}\n`, 'utf8');
  // Nur systemMessage: kein permissionDecision, damit der normale
  // Berechtigungsfluss unveraendert weiterlaeuft.
  process.stdout.write(`${JSON.stringify({ systemMessage: decision.message })}\n`);
} catch {
  process.exit(0);
}
