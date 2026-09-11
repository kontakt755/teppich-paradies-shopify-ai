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

// Working-Tree-Zustand bei Sitzungsbeginn (2026-09-11, siehe review-scope.mjs).
// Bewusst ein eigenes Verzeichnis neben claude-sessions: der Session-State wird
// bei PASS, bei Klasse A und bei jedem nicht gerouteten Prompt geloescht, die
// Baseline muss die ganze Sitzung ueberleben.
export function claudeSessionBaselinePath({ sessionId, projectDir = process.cwd() }) {
  return path.join(projectDir, '.router', 'claude-baselines', `${sessionKey(sessionId)}.json`);
}

// Legt die Baseline genau einmal pro Sitzung an und ueberschreibt sie nie
// (flag 'wx'). capture() laeuft nur, wenn noch keine existiert. Scheitert
// capture, wird das Scheitern gespeichert: sonst legte der naechste Prompt eine
// Baseline an, die die bis dahin gemachten Aenderungen dieser Sitzung als
// "vorbestehend" ausklammern wuerde. Ohne sessionId keine Baseline - alle
// Sitzungen ohne ID teilten sich sonst eine Datei.
export function ensureClaudeSessionBaseline({ sessionId, projectDir = process.cwd(), capture, io = fs }) {
  if (!sessionId) return { created: false, filePath: null };
  const filePath = claudeSessionBaselinePath({ sessionId, projectDir });
  if (io.existsSync(filePath)) return { created: false, filePath };
  let baseline;
  try {
    baseline = capture();
  } catch (error) {
    baseline = { ok: false, error: String(error?.message ?? error).slice(0, 300) };
  }
  io.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    io.writeFileSync(filePath, `${JSON.stringify({ ...baseline, capturedAt: new Date().toISOString() })}\n`, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') return { created: false, filePath };
    throw error;
  }
  return { created: true, filePath };
}

// null statt Exception: eine fehlende oder kaputte Baseline heisst nur, dass
// nichts ausgeklammert wird.
export function readClaudeSessionBaseline({ sessionId, projectDir = process.cwd(), io = fs }) {
  if (!sessionId) return null;
  try {
    return JSON.parse(io.readFileSync(claudeSessionBaselinePath({ sessionId, projectDir }), 'utf8'));
  } catch {
    return null;
  }
}
