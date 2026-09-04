import fs from 'node:fs';
import path from 'node:path';
import { spawn as spawnProcess, spawnSync } from 'node:child_process';
import { classifyClaudeRequest } from './claude-bridge.mjs';
import { appendUsageRecord } from './openrouter-executor.mjs';
import { runReviewCorrectionCycle } from './review-cycle.mjs';

const REVIEW_SCHEMA = path.resolve('automation/schemas/review-result.schema.json');

export class CliAgentError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'CliAgentError';
    this.commandOutput = options.commandOutput ?? '';
  }
}

function compactId(value) {
  return String(value).toUpperCase().replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || `AGENT-${Date.now()}`;
}

function execute(command, args, { cwd, env, timeoutMs, spawn = spawnSync }) {
  const result = spawn(command, args, { cwd, env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw new CliAgentError(`${command} could not start`, { cause: result.error });
  if (result.status !== 0) {
    const commandOutput = (result.stderr || result.stdout || '').trim().slice(-4000);
    throw new CliAgentError(`${command} exited with status ${result.status}: ${commandOutput.slice(-1200)}`, { commandOutput });
  }
  return result;
}

function claudeAuthStatus({ cwd, env, spawn = spawnSync }) {
  const result = spawn('claude', ['auth', 'status'], { cwd, env, encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024 });
  try { return JSON.parse(result.stdout || '{}'); } catch { return { loggedIn: false, authMethod: 'unknown' }; }
}

function subscriptionEnvironment() {
  const env = { ...process.env, TP_AGENT_LOOP_ACTIVE: '1' };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

function readTaskSource(taskFile, io = fs) {
  const absolutePath = path.resolve(taskFile);
  if (!io.existsSync(absolutePath)) throw new CliAgentError(`Task file does not exist: ${absolutePath}`);
  return { text: io.readFileSync(absolutePath, 'utf8'), absolutePath };
}

export function buildCodexReviewPrompt(taskText, { taskType = 'IMPLEMENTATION', candidateText = '' } = {}) {
  if (taskType === 'ANALYSIS') return `Prüfe die folgende technische Analyse unabhängig gegen den Auftrag. Lies AGENTS.md und untersuche das Repository mit ausschließlich lesenden Prüfungen. Bewerte sachliche Richtigkeit, wichtige Auslassungen, Sicherheit und ob Behauptungen belegt sind. Antworte ausschließlich im vorgegebenen JSON-Schema. Wenn keine P0/P1/P2-Befunde bestehen, ist der Status PASS.\n\nAUFTRAG:\n${taskText}\n\nZU PRÜFENDE ANALYSE:\n${candidateText}`;
  return `Prüfe die aktuell uncommitteten Änderungen in diesem Repository unabhängig gegen den folgenden Auftrag. Lies AGENTS.md. Führe nur lesende Prüfungen aus und verändere keine Dateien. Bewerte Korrektheit, Regressionen, Sicherheit, Scope und vorhandene Testbelege. P3-Hinweise blockieren PASS nicht. Antworte ausschließlich im vorgegebenen JSON-Schema. Wenn keine P0/P1/P2-Befunde bestehen, ist der Status PASS. Geschäftskritische oder irreversible Schritte sind HUMAN_GATE.\n\nAUFTRAG:\n${taskText}`;
}

export function buildClaudeWorkPrompt(taskText, findings = [], taskType = 'IMPLEMENTATION') {
  const correction = findings.length ? `\n\nUNABHÄNGIGE CODEX-BEFUNDE:\n${JSON.stringify(findings, null, 2)}\nBehebe alle P1/P2-Befunde, führe die passenden Tests erneut aus und hinterlasse die Arbeitskopie in einem prüfbaren Zustand.` : '';
  if (taskType === 'ANALYSIS') return `Analysiere den folgenden Auftrag im aktuellen Repository. Lies zuerst AGENTS.md. Arbeite ausschließlich lesend: verändere keine Dateien und veröffentliche nichts. Begrenze dich auf die wichtigsten belegbaren Fehler, nenne den Prüfweg, Schweregrad und eine konkrete Empfehlung. Nutze vorhandene QA-Skripte nur, wenn sie rein lesend sind. Gib am Ende einen kompakten deutschen Abschlussbericht aus.\n\nAUFTRAG:\n${taskText}${correction}`;
  return `Arbeite den folgenden Auftrag im aktuellen Repository vollständig ab. Lies zuerst AGENTS.md. Untersuche vorhandenen Code, implementiere minimal und robust, führe passende Tests aus, behebe Fehler und teste erneut. Veröffentliche nichts live und führe keine geschäftskritischen Änderungen aus. Stoppe nur bei fertigem, getestetem Stand oder einem echten Human Gate.\n\nAUFTRAG:\n${taskText}${correction}`;
}

export function parseReviewResult(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch (error) { throw new CliAgentError('Codex review did not return valid JSON', { cause: error }); }
  if (!['PASS', 'CHANGES_REQUIRED', 'HUMAN_GATE'].includes(parsed?.status) || !Array.isArray(parsed?.findings)) throw new CliAgentError('Codex review returned an invalid result shape');
  return parsed;
}

export function runCodexReview({ taskText = null, taskFile = null, taskType = 'IMPLEMENTATION', candidateText = '', taskId = `REVIEW-${Date.now()}`, cwd = process.cwd(), runDir = '.router/agent-runs', timeoutMs = 15 * 60_000, io = fs, spawn = spawnSync }) {
  const source = taskFile ? readTaskSource(taskFile, io) : { text: taskText, absolutePath: null };
  if (!source.text?.trim()) throw new CliAgentError('A task or task file is required');
  const id = compactId(taskId);
  const outputDir = path.resolve(cwd, runDir, id);
  io.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'codex-review.json');
  execute('codex', [
    'exec', '--ephemeral', '--sandbox', 'read-only',
    '--output-schema', REVIEW_SCHEMA, '--output-last-message', outputPath,
    buildCodexReviewPrompt(source.text, { taskType, candidateText }),
  ], { cwd, env: { ...process.env, TP_AGENT_LOOP_ACTIVE: '1' }, timeoutMs, spawn });
  const review = parseReviewResult(io.readFileSync(outputPath, 'utf8'));
  return { ...review, reviewer: 'CODEX', taskFile: source.absolutePath, outputPath };
}

function recordClaudeUsage({ response, taskId, taskType, authMode, startedAt, finishedAt, recordUsage }) {
  if (!response || typeof response !== 'object') return;
  const usage = response.usage ?? {};
  recordUsage({
    timestamp: finishedAt,
    taskId,
    role: taskType === 'ANALYSIS' ? 'ANALYST' : 'WORKER',
    provider: authMode === 'API' ? 'CLAUDE_API' : 'CLAUDE_SUBSCRIPTION',
    upstreamProvider: 'ANTHROPIC',
    gateway: 'CLAUDE_CODE',
    model: Object.keys(response.modelUsage ?? {})[0] ?? null,
    startedAt,
    finishedAt,
    durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
    stopReason: response.terminal_reason ?? response.subtype ?? null,
    responseContentTypes: typeof response.result === 'string' && response.result ? ['text'] : [],
    usage: {
      inputTokens: Number(usage.input_tokens ?? 0) || 0,
      outputTokens: Number(usage.output_tokens ?? 0) || 0,
      cacheReadInputTokens: Number(usage.cache_read_input_tokens ?? 0) || 0,
      cacheCreationInputTokens: Number(usage.cache_creation_input_tokens ?? 0) || 0,
      costUsd: authMode === 'API' && Number.isFinite(response.total_cost_usd) ? response.total_cost_usd : 0,
    },
  });
}

function safeActivityText(value, maximum = 180) {
  return String(value ?? '')
    .replace(/(?:sk-(?:or|ant)-[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]{20,})/g, '[geschützt]')
    .replace(/\b(passwort|password|zugangscode|api[-_ ]?key|token|secret)\b\s*[:=]?\s*\S+/gi, '$1: [geschützt]')
    .replace(/\s+/g, ' ').trim().slice(0, maximum);
}

export function describeClaudeActivities(event) {
  if (event?.type !== 'assistant' || !Array.isArray(event.message?.content)) return [];
  return event.message.content.flatMap(block => {
    if (block?.type !== 'tool_use') return [];
    const input = block.input ?? {};
    const file = safeActivityText(input.file_path || input.path || '');
    const pattern = safeActivityText(input.pattern || input.query || '');
    const command = safeActivityText(String(input.command || '').split('\n')[0], 140);
    const messages = {
      Read: file ? `Liest Datei: ${file}` : 'Liest eine Projektdatei.',
      Edit: file ? `Bearbeitet Datei: ${file}` : 'Bearbeitet eine Projektdatei.',
      Write: file ? `Schreibt Datei: ${file}` : 'Schreibt eine Projektdatei.',
      Glob: pattern ? `Sucht Dateien: ${pattern}` : 'Sucht passende Projektdateien.',
      Grep: pattern ? `Durchsucht Code nach: ${pattern}` : 'Durchsucht den Projektcode.',
      Bash: command ? `Terminal: ${command}` : 'Führt einen Terminal-Befehl aus.',
      WebFetch: 'Prüft eine Webseite.',
      WebSearch: pattern ? `Websuche: ${pattern}` : 'Führt eine Websuche aus.',
      TodoWrite: 'Aktualisiert den Arbeitsplan.',
      Task: 'Startet eine abgegrenzte Teilprüfung.',
    };
    return [{ kind: block.name || 'Tool', message: messages[block.name] || `Verwendet ${safeActivityText(block.name || 'ein Werkzeug', 60)}.` }];
  });
}

function runClaudeStreaming(args, { cwd, env, timeoutMs, onState }) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess('claude', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdoutBuffer = '';
    let stderr = '';
    let finalResponse = null;
    let settled = false;
    let timer;
    const settle = callback => value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    timer = setTimeout(() => {
      child.kill('SIGTERM');
      settle(reject)(new CliAgentError(`claude exceeded ${timeoutMs} ms`));
    }, timeoutMs);
    const acceptLine = line => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        for (const activity of describeClaudeActivities(event)) onState?.({ status: 'ACTIVITY', ...activity });
        if (event.type === 'result') finalResponse = event;
      } catch { /* Non-JSON stdout is retained only for the final error. */ }
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) acceptLine(line);
    });
    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-8_000); });
    child.on('error', settle(reject));
    child.on('close', settle(code => {
      acceptLine(stdoutBuffer);
      resolve({ status: code, stdout: finalResponse ? JSON.stringify(finalResponse) : '', stderr });
    }));
  });
}

async function runClaude({ taskText, taskId, taskType = 'IMPLEMENTATION', findings = [], cwd, timeoutMs, budgetUsd, maxTurns = Number(process.env.AGENT_LOOP_CLAUDE_MAX_TURNS ?? 24), authMode, apiKey = null, spawn = null, recordUsage = appendUsageRecord, onState = null }) {
  const childEnv = { ...process.env, TP_AGENT_LOOP_ACTIVE: '1' };
  if (authMode === 'SUBSCRIPTION') delete childEnv.ANTHROPIC_API_KEY;
  if (authMode === 'API') {
    if (!apiKey) throw new CliAgentError('Claude API fallback key is unavailable');
    childEnv.ANTHROPIC_API_KEY = apiKey;
  }
  const analysisMode = taskType === 'ANALYSIS';
  const effectiveMaxTurns = analysisMode
    ? Math.min(maxTurns, Number(process.env[authMode === 'API' ? 'AGENT_LOOP_API_ANALYSIS_MAX_TURNS' : 'AGENT_LOOP_ANALYSIS_MAX_TURNS'] ?? (authMode === 'API' ? 10 : 16)))
    : authMode === 'API' ? Math.min(maxTurns, Number(process.env.AGENT_LOOP_API_MAX_TURNS ?? 12)) : maxTurns;
  const effectiveBudgetUsd = analysisMode ? Math.min(budgetUsd, Number(process.env.AGENT_LOOP_ANALYSIS_MAX_BUDGET_USD ?? 0.50)) : budgetUsd;
  const streaming = !spawn;
  const args = [
    '--print', '--output-format', streaming ? 'stream-json' : 'json', ...(streaming ? ['--verbose'] : []), '--permission-mode', analysisMode ? 'plan' : 'auto', '--effort', analysisMode ? 'low' : 'medium',
    '--max-turns', String(effectiveMaxTurns), ...(authMode === 'API' ? ['--max-budget-usd', String(effectiveBudgetUsd)] : []),
    ...(analysisMode ? ['--model', process.env.AGENT_LOOP_ANALYSIS_MODEL ?? 'haiku'] : []),
    buildClaudeWorkPrompt(taskText, findings, taskType),
  ];
  const startedAt = new Date().toISOString();
  const result = streaming
    ? await runClaudeStreaming(args, { cwd, env: childEnv, timeoutMs, onState })
    : spawn('claude', args, { cwd, env: childEnv, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw new CliAgentError('claude could not start', { cause: result.error });
  let response;
  try { response = JSON.parse(result.stdout); } catch (error) {
    const commandOutput = (result.stderr || result.stdout || '').trim().slice(-4000);
    throw new CliAgentError(result.status === 0 ? 'Claude did not return valid JSON' : `claude exited with status ${result.status}: ${commandOutput.slice(-1200)}`, { cause: error, commandOutput });
  }
  const finishedAt = new Date().toISOString();
  recordClaudeUsage({ response, taskId, taskType, authMode, startedAt, finishedAt, recordUsage });
  if (response?.is_error || result.status !== 0) {
    if (response?.subtype === 'error_max_turns' || response?.terminal_reason === 'max_turns') {
      return { status: 'PARKED', reason: 'MAX_TURNS', result: response.result || `Claude erreichte das Arbeitsschritt-Limit (${effectiveMaxTurns}). Bitte den Auftrag enger formulieren.`, usage: response.usage ?? null, costUsd: response.total_cost_usd ?? null, authMode };
    }
    if (response?.subtype === 'error_max_budget_usd' || response?.terminal_reason === 'max_budget_usd') {
      return { status: 'PARKED', reason: 'MAX_BUDGET', result: response.result || `Claude erreichte das Analysebudget von ${effectiveBudgetUsd.toFixed(2)} USD.`, usage: response.usage ?? null, costUsd: response.total_cost_usd ?? null, authMode };
    }
    throw new CliAgentError(`Claude reported an error: ${response.result ?? response?.errors?.join('; ') ?? 'unknown error'}`, { commandOutput: (result.stderr || '').slice(-1200) });
  }
  return { status: 'PASS', result: response?.result ?? '', usage: response?.usage ?? null, costUsd: response?.total_cost_usd ?? null, authMode };
}

function permitsApiFallback(error) {
  return /(?:usage|rate|quota).{0,40}limit|limit.{0,40}(?:reached|resets)|rate_limit_error|too many requests/i.test(`${error?.message ?? ''}\n${error?.commandOutput ?? ''}`);
}

async function runClaudeWithFallback(options) {
  const apiKey = process.env.ANTHROPIC_FALLBACK_API_KEY || process.env.ANTHROPIC_API_KEY || null;
  const auth = claudeAuthStatus({ cwd: options.cwd, env: subscriptionEnvironment(), spawn: options.spawn ?? spawnSync });
  const attempts = [];
  if (!auth.loggedIn) {
    throw new CliAgentError('Claude Code Pro ist nicht angemeldet. Der API-Fallback wurde absichtlich nicht verwendet; bitte zuerst `claude auth login` ausführen.');
  }
  try {
    options.onState?.({ status: 'PROVIDER', provider: 'Claude Code Pro' });
    return { ...await runClaude({ ...options, authMode: 'SUBSCRIPTION' }), authAttempts: [{ mode: 'SUBSCRIPTION', status: 'PASS' }] };
  } catch (error) {
    // Only an explicitly recognized Pro usage/rate/capacity limit may spend paid
    // API credit; any other program, prompt, or configuration error must surface
    // as a normal failure instead of silently switching to the paid fallback.
    if (!apiKey || !permitsApiFallback(error)) throw error;
    const fallbackReason = safeActivityText(error.message, 300);
    attempts.push({ mode: 'SUBSCRIPTION', status: 'LIMIT_REACHED', reason: fallbackReason });
    options.onState?.({ status: 'FALLBACK', provider: 'Claude API Backup', reason: 'PRO_LIMIT' });
    options.onState?.({ status: 'PROVIDER', provider: 'Claude API Backup' });
    const result = await runClaude({ ...options, authMode: 'API', apiKey });
    return { ...result, fallbackReason, authAttempts: [...attempts, { mode: 'API', status: 'PASS' }] };
  }
}

// Retries only the independent Codex review after a pure reviewer infrastructure
// failure (REVIEW_INFRA_FAILED). Never spawns Claude, so a broken review call can
// be retried at no additional Claude API cost.
export function runReviewOnly({ taskText, taskType = 'IMPLEMENTATION', candidateText, taskId = `REVIEW-${Date.now()}`, cwd = process.cwd(), timeoutMs = 15 * 60_000, spawn = spawnSync, review = runCodexReview, onState = null }) {
  onState?.({ status: 'REVIEW', reviewRound: 1, maxReviewRounds: 1 });
  try {
    const result = review({ taskText, taskType, candidateText, taskId, cwd, timeoutMs, spawn });
    if (result.status === 'HUMAN_GATE') return { status: 'SECURITY_STOP', review: result };
    return { status: result.status === 'PASS' ? 'PASS' : 'REVIEW_FINDINGS', findings: result.findings, review: result };
  } catch (error) {
    onState?.({ status: 'REVIEW_INFRA_FAILED', reviewError: error.message });
    return { status: 'REVIEW_INFRA_FAILED', reviewError: error.message };
  }
}

export async function runCliAgentCycle({ task, taskId = `AGENT-${Date.now()}`, cwd = process.cwd(), maxReviewRounds = 3, timeoutMs = 30 * 60_000, budgetUsd = Number(process.env.AGENT_LOOP_CLAUDE_MAX_BUDGET_USD ?? 1), spawn = null, review = runCodexReview, recordUsage = appendUsageRecord, onState = null, forceTaskType = null, previousRisk = null }) {
  const classified = classifyClaudeRequest({ taskId, task, forceTaskType, previousRisk });
  onState?.({ status: 'ROUTED', risk: classified.risk, taskType: classified.taskType });
  if (classified.risk === 'HIGH') {
    onState?.({ status: 'HUMAN_GATE', risk: classified.risk });
    return { status: 'HUMAN_GATE', reason: 'HIGH-risk task is not executed by the unattended CLI loop', classified };
  }
  let phase = 'IMPLEMENT';
  const result = await runReviewCorrectionCycle({
    task: classified,
    maxReviewRounds,
    providerTimeoutMs: timeoutMs,
    implement: async () => runClaudeWithFallback({ taskText: classified.task, taskId: classified.id, taskType: classified.taskType, cwd, timeoutMs, budgetUsd, spawn, recordUsage, onState }),
    review: async (_task, candidate, metadata) => {
      let result;
      try {
        result = await review({ taskText: classified.task, taskType: classified.taskType, candidateText: candidate.result ?? '', taskId: `${classified.id}-R${metadata.reviewRound}`, cwd, timeoutMs, spawn: spawn ?? spawnSync });
      } catch (error) {
        // A technical reviewer failure (e.g. a broken codex CLI invocation) is not a
        // review finding: Claude's already-completed work must not be discarded, and
        // no further Claude API cost may be triggered to "fix" an infra-only failure.
        onState?.({ status: 'REVIEW_INFRA_FAILED', reviewError: error.message });
        return { status: 'REVIEW_INFRA_FAILED', reviewError: error.message };
      }
      if (result.status === 'HUMAN_GATE') return { status: 'SECURITY_STOP' };
      return { status: result.status === 'PASS' ? 'PASS' : 'REVIEW_FINDINGS', findings: result.findings };
    },
    correct: async (_task, _candidate, findings) => {
      phase = 'CORRECT';
      return runClaudeWithFallback({ taskText: classified.task, taskId: classified.id, taskType: classified.taskType, findings, cwd, timeoutMs, budgetUsd, spawn, recordUsage, onState });
    },
    onState,
  });
  return { ...result, taskId: classified.id, taskText: classified.task, taskType: classified.taskType, risk: classified.risk, lastWorkerPhase: phase };
}
