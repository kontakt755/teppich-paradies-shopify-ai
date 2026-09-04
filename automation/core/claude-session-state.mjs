import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function sessionKey(sessionId) {
  return crypto.createHash('sha256').update(String(sessionId ?? 'unknown')).digest('hex').slice(0, 24);
}

export function claudeSessionStatePath({ sessionId, projectDir = process.cwd() }) {
  return path.join(projectDir, '.router', 'claude-sessions', `${sessionKey(sessionId)}.json`);
}

export function writeClaudeSessionState({ sessionId, state, projectDir = process.cwd(), io = fs }) {
  const filePath = claudeSessionStatePath({ sessionId, projectDir });
  io.mkdirSync(path.dirname(filePath), { recursive: true });
  io.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return filePath;
}

export function readClaudeSessionState({ sessionId, projectDir = process.cwd(), io = fs }) {
  const filePath = claudeSessionStatePath({ sessionId, projectDir });
  if (!io.existsSync(filePath)) return null;
  return { filePath, state: JSON.parse(io.readFileSync(filePath, 'utf8')) };
}

export function clearClaudeSessionState({ sessionId, projectDir = process.cwd(), io = fs }) {
  const filePath = claudeSessionStatePath({ sessionId, projectDir });
  if (io.existsSync(filePath)) io.unlinkSync(filePath);
}
