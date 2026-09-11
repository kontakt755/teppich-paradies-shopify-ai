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

// Ist dieser Prompt der erste der Sitzung? Belegt ueber das Transkript, das
// Claude Code als transcript_path mitgibt: je Nutzerprompt ein Eintrag
// {type:"user", message:{content:"<text>"}} (Tool-Ergebnisse haben ein Array
// als content). Ob der aktuelle Prompt beim Hook-Lauf schon drinsteht, ist
// nicht verbuergt - deshalb zaehlt ein einzelner Eintrag mit genau diesem
// Text noch als "erster". Fehlt der Pfad ganz (aelteres Claude Code), gilt
// der Prompt als erster; ist die Datei nicht lesbar oder groesser als das
// Leselimit, gilt er als NICHT erster - im Zweifel keine Baseline.
//
// Warum das noetig ist (Pruefung 2026-09-11): Scheitert das Speichern der
// Baseline beim ersten Prompt (ENOSPC - am 2026-09-05 war die Platte voll,
// EACCES, EROFS), haette der naechste Prompt eine Baseline angelegt, die die
// bis dahin gemachten Aenderungen der Sitzung als "vorbestehend" ausklammert.
const TRANSCRIPT_READ_LIMIT = 8 * 1024 * 1024;
export function isFirstPromptOfSession({ transcriptPath, prompt, io = fs } = {}) {
  if (!transcriptPath) return true;
  let raw;
  try {
    if (!io.existsSync(transcriptPath)) return true;
    if (io.statSync(transcriptPath).size > TRANSCRIPT_READ_LIMIT) return false;
    raw = io.readFileSync(transcriptPath, 'utf8');
  } catch {
    return false;
  }
  const prompts = [];
  for (const line of raw.split('\n')) {
    if (!line.includes('"user"')) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry?.type !== 'user' || entry.isMeta === true || entry.isSidechain === true) continue;
    const content = entry.message?.content;
    if (typeof content === 'string') prompts.push(content.trim());
    else if (Array.isArray(content) && content.some(block => block?.type === 'text')) prompts.push(content.filter(block => block?.type === 'text').map(block => String(block.text ?? '')).join('\n').trim());
    if (prompts.length > 1) return false;
  }
  return prompts.length === 0 || prompts[0] === String(prompt ?? '').trim();
}

// Legt die Baseline genau einmal pro Sitzung an und ueberschreibt sie nie
// (flag 'wx'). capture() laeuft nur, wenn noch keine existiert UND dies der
// erste Prompt der Sitzung ist (isFirstPromptOfSession). Scheitert capture,
// wird das Scheitern gespeichert: sonst legte der naechste Prompt eine
// Baseline an, die die bis dahin gemachten Aenderungen dieser Sitzung als
// "vorbestehend" ausklammern wuerde. Ohne sessionId keine Baseline - alle
// Sitzungen ohne ID teilten sich sonst eine Datei.
export function ensureClaudeSessionBaseline({ sessionId, projectDir = process.cwd(), capture, transcriptPath = null, prompt = null, io = fs, now = Date.now }) {
  if (!sessionId) return { created: false, filePath: null };
  const filePath = claudeSessionBaselinePath({ sessionId, projectDir });
  if (io.existsSync(filePath)) return { created: false, filePath };
  if (!isFirstPromptOfSession({ transcriptPath, prompt, io })) return { created: false, filePath, reason: 'NOT_FIRST_PROMPT' };
  let baseline;
  try {
    baseline = capture();
  } catch (error) {
    baseline = { ok: false, error: String(error?.message ?? error).slice(0, 300) };
  }
  io.mkdirSync(path.dirname(filePath), { recursive: true });
  pruneOldBaselines({ dir: path.dirname(filePath), io, now });
  try {
    io.writeFileSync(filePath, `${JSON.stringify({ ...baseline, capturedAt: new Date(now()).toISOString() })}\n`, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') return { created: false, filePath };
    throw error;
  }
  return { created: true, filePath };
}

// Baselines werden nie gezielt geloescht (PASS und spaetere Prompts duerfen
// sie nicht anfassen). Damit das Verzeichnis nicht unbegrenzt waechst, raeumt
// jede Neuanlage Dateien weg, die aelter als 30 Tage sind - eine so alte
// Sitzung verliert damit nur die Ausklammerung, nie eine Pruefung. Best
// effort: ein Fehler hier darf die Baseline nicht verhindern.
export const BASELINE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export function pruneOldBaselines({ dir, io = fs, now = Date.now, maxAgeMs = BASELINE_MAX_AGE_MS }) {
  let removed = 0;
  try {
    for (const name of io.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      const filePath = path.join(dir, name);
      try {
        if (now() - io.statSync(filePath).mtimeMs > maxAgeMs) { io.unlinkSync(filePath); removed += 1; }
      } catch { /* naechste Datei */ }
    }
  } catch { /* Verzeichnis nicht lesbar: nichts aufraeumen */ }
  return removed;
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
