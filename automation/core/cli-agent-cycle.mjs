import fs from 'node:fs';
import path from 'node:path';
import { spawn as spawnProcess, spawnSync } from 'node:child_process';
import { classifyClaudeRequest } from './claude-bridge.mjs';
import { appendUsageRecord } from './openrouter-executor.mjs';
import { runReviewCorrectionCycle } from './review-cycle.mjs';
import { diffSinceSnapshot, evaluateDashboardGuards, loadDashboardRiskMap, snapshotWorkingTree } from './dashboard-guards.mjs';
import { classifyTask } from '../../workflow/router.mjs';
import { buildModelPlan, claudeArgsForStep, codexArgsForStep, describeStep, escalateStep, failureSignature, isRateLimitError, rateLimitFallback, resolveCodexBinary } from '../../workflow/model-matrix.mjs';

const REVIEW_SCHEMA = path.resolve('automation/schemas/review-result.schema.json');
const REVIEW_SCHEMA_TEXT = fs.existsSync(REVIEW_SCHEMA) ? fs.readFileSync(REVIEW_SCHEMA, 'utf8') : '{"status":"PASS|CHANGES_REQUIRED|HUMAN_GATE","summary":"","findings":[]}';

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

// Die read-only Sandbox blockiert den confstr()-Syscall, mit dem Apples git-Shim sein
// Temp-Verzeichnis sucht. git schreibt daraufhin zwei Zeilen auf stderr und liefert
// trotzdem korrekte Ergebnisse. Am 2026-09-06 las ein Reviewer das als Abbruch und
// meldete P1 "Diff nicht ermittelbar", obwohl der Diff im selben Lauf ausgegeben wurde.
const SANDBOX_GIT_NOISE = 'Hinweis zur Umgebung: In dieser Sandbox meldet git auf stderr "confstr() failed ... DARWIN_USER_TEMP_DIR" und "couldn\'t create cache file \'/tmp/xcrun_db-...\'". Das ist bekanntes Rauschen des macOS-git-Shims; git liefert trotzdem vollstaendige, korrekte Ausgaben. Diese Zeilen sind kein Befund und kein Grund, die Pruefung abzubrechen. Nur wenn ein git-Befehl tatsaechlich keine Ausgabe liefert, ist das ein echtes Problem.';

// reviewScope: Text aus describeReviewScope(). Ohne Angabe bleibt der bisherige
// Wortlaut (uncommittete Aenderungen); mit Angabe weiss der Reviewer auch nach
// einem Commit, welchen Diff er pruefen soll.
export function buildCodexReviewPrompt(taskText, { taskType = 'IMPLEMENTATION', candidateText = '', reviewScope = '' } = {}) {
  if (taskType === 'ANALYSIS') return `Prüfe die folgende technische Analyse unabhängig gegen den Auftrag. Lies AGENTS.md und untersuche das Repository mit ausschließlich lesenden Prüfungen. Bewerte sachliche Richtigkeit, wichtige Auslassungen, Sicherheit und ob Behauptungen belegt sind. Antworte ausschließlich im vorgegebenen JSON-Schema. Wenn keine P0/P1/P2-Befunde bestehen, ist der Status PASS.\n\n${SANDBOX_GIT_NOISE}\n\nAUFTRAG:\n${taskText}\n\nZU PRÜFENDE ANALYSE:\n${candidateText}`;
  const scope = String(reviewScope ?? '').trim() || 'die aktuell uncommitteten Änderungen';
  return `Prüfe ${scope} in diesem Repository unabhängig gegen den folgenden Auftrag. Lies AGENTS.md. Führe nur lesende Prüfungen aus und verändere keine Dateien. Bewerte Korrektheit, Regressionen, Sicherheit, Scope und vorhandene Testbelege. P3-Hinweise blockieren PASS nicht. Antworte ausschließlich im vorgegebenen JSON-Schema. Wenn keine P0/P1/P2-Befunde bestehen, ist der Status PASS. Geschäftskritische oder irreversible Schritte sind HUMAN_GATE.\n\n${SANDBOX_GIT_NOISE}\n\nAUFTRAG:\n${taskText}`;
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

function recordReviewUsage({ recordUsage, taskId, provider, model, effort, startedAt, reviewStatus }) {
  const finishedAt = new Date().toISOString();
  try {
    recordUsage({
      timestamp: finishedAt, taskId, role: 'REVIEWER', provider, upstreamProvider: provider === 'CODEX_SUBSCRIPTION' ? 'OPENAI' : 'ANTHROPIC',
      gateway: provider === 'CODEX_SUBSCRIPTION' ? 'CODEX_CLI' : 'CLAUDE_CODE', model, effort: effort ?? null, startedAt, finishedAt,
      durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(), stopReason: reviewStatus, responseContentTypes: ['json'],
      // Abo-Aufrufe liefern keine Tokenzahlen; der Eintrag zaehlt den Aufruf, nicht die Tokens.
      usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0 },
    });
  } catch { /* Ledger darf ein Review nie verhindern. */ }
}

// `reviewStep` kommt aus workflow/model-matrix.mjs (Provider, Modell, Effort).
// Ohne Angabe laeuft Codex mit seinem Konfig-Default - das ist der Legacy-Pfad.
export function runCodexReview({ reviewScope = '', taskText = null, taskFile = null, taskType = 'IMPLEMENTATION', candidateText = '', taskId = `REVIEW-${Date.now()}`, cwd = process.cwd(), runDir = '.router/agent-runs', timeoutMs = 15 * 60_000, io = fs, spawn = spawnSync, reviewStep = null, recordUsage = appendUsageRecord }) {
  const source = taskFile ? readTaskSource(taskFile, io) : { text: taskText, absolutePath: null };
  if (!source.text?.trim()) throw new CliAgentError('A task or task file is required');
  const id = compactId(taskId);
  const outputDir = path.resolve(cwd, runDir, id);
  io.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'codex-review.json');
  // Absoluter Pfad statt blossem "codex": das Desktop-Bundle liegt nicht im PATH.
  const binary = resolveCodexBinary() ?? 'codex';
  const startedAt = new Date().toISOString();
  execute(binary, [
    'exec', '--ephemeral', '--sandbox', 'read-only', ...codexArgsForStep(reviewStep),
    '--output-schema', REVIEW_SCHEMA, '--output-last-message', outputPath,
    buildCodexReviewPrompt(source.text, { taskType, candidateText, reviewScope }),
  ], { cwd, env: { ...process.env, TP_AGENT_LOOP_ACTIVE: '1' }, timeoutMs, spawn });
  const review = parseReviewResult(io.readFileSync(outputPath, 'utf8'));
  recordReviewUsage({ recordUsage, taskId: id, provider: 'CODEX_SUBSCRIPTION', model: reviewStep?.model ?? null, effort: reviewStep?.effort, startedAt, reviewStatus: review.status });
  return { ...review, reviewer: 'CODEX', model: reviewStep?.model ?? null, effort: reviewStep?.effort ?? null, taskFile: source.absolutePath, outputPath };
}

function extractJsonObject(text) {
  const value = String(text ?? '');
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start === -1 || end <= start) throw new CliAgentError('Claude review did not return a JSON object');
  return value.slice(start, end + 1);
}

// Cross-Provider-Fallback des Reviews: faellt Codex wegen Rate Limit oder
// erschoepftem Kontingent aus, prueft ein anderes Claude-Modell als der Autor.
// Read-only ueber --permission-mode plan; Ergebnis im selben Review-Schema.
export function runClaudeReview({ reviewScope = '', taskText, taskType = 'IMPLEMENTATION', candidateText = '', taskId = `REVIEW-${Date.now()}`, cwd = process.cwd(), runDir = '.router/agent-runs', timeoutMs = 15 * 60_000, io = fs, spawn = spawnSync, reviewStep, recordUsage = appendUsageRecord }) {
  if (!taskText?.trim()) throw new CliAgentError('A task is required');
  if (!reviewStep?.model) throw new CliAgentError('Claude review requires an explicit model that differs from the author');
  const id = compactId(taskId);
  const outputDir = path.resolve(cwd, runDir, id);
  io.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'claude-review.json');
  const prompt = `${buildCodexReviewPrompt(taskText, { taskType, candidateText, reviewScope })}\n\nAntworte ausschliesslich mit einem JSON-Objekt nach diesem Schema, ohne Markdown:\n${REVIEW_SCHEMA_TEXT}`;
  const env = { ...process.env, TP_AGENT_LOOP_ACTIVE: '1' };
  delete env.ANTHROPIC_API_KEY;
  const startedAt = new Date().toISOString();
  const result = execute('claude', ['--print', '--output-format', 'json', '--permission-mode', 'plan', ...claudeArgsForStep(reviewStep), '--max-turns', '16', prompt], { cwd, env, timeoutMs, spawn });
  let response;
  try { response = JSON.parse(result.stdout); } catch (error) { throw new CliAgentError('Claude review did not return valid JSON', { cause: error }); }
  const review = parseReviewResult(extractJsonObject(response?.result));
  io.writeFileSync(outputPath, JSON.stringify(review, null, 2), 'utf8');
  recordReviewUsage({ recordUsage, taskId: id, provider: 'CLAUDE_SUBSCRIPTION', model: reviewStep.model, effort: reviewStep.effort, startedAt, reviewStatus: review.status });
  return { ...review, reviewer: 'CLAUDE', model: reviewStep.model, effort: reviewStep.effort ?? null, taskFile: null, outputPath };
}

// Ein Review-Schritt mit Fallback bei Rate Limit: Codex -> unabhaengiges
// Claude-Modell (nie das des Autors). Andere Fehler bleiben Infrastrukturfehler.
export function runReviewStep({ reviewStep, authorModel = null, review = runCodexReview, claudeReview = runClaudeReview, onState = null, ...options }) {
  try {
    return review({ ...options, reviewStep });
  } catch (error) {
    if (!isRateLimitError(error)) throw error;
    const fallback = rateLimitFallback(reviewStep, { authorModel });
    if (!fallback) throw error;
    onState?.({ status: 'REVIEW_FALLBACK', from: describeStep(reviewStep), to: describeStep(fallback), reason: fallback.reason });
    return claudeReview({ ...options, reviewStep: fallback });
  }
}

function recordClaudeUsage({ response, taskId, taskType, authMode, startedAt, finishedAt, recordUsage, implementStep = null, taskClass = null, escalation = null }) {
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
    requestedModel: implementStep?.model ?? null,
    effort: implementStep?.effort ?? null,
    taskClass,
    escalation,
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

async function runClaude({ taskText, taskId, taskType = 'IMPLEMENTATION', findings = [], cwd, timeoutMs, budgetUsd, maxTurns = Number(process.env.AGENT_LOOP_CLAUDE_MAX_TURNS ?? 24), authMode, apiKey = null, spawn = null, recordUsage = appendUsageRecord, onState = null, implementStep = null, taskClass = null, escalation = null }) {
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
  // Analyse (reine Voranalyse ohne Entscheidung) bleibt bei Haiku/low. Alles
  // Schreibende bekommt Modell und Effort aus der Matrix; ohne Schritt bleibt
  // das alte Verhalten (Account-Default, effort medium) als Rollback erhalten.
  const modelArgs = analysisMode
    ? ['--effort', 'low', '--model', process.env.AGENT_LOOP_ANALYSIS_MODEL ?? 'haiku']
    : (implementStep ? claudeArgsForStep(implementStep) : ['--effort', 'medium']);
  const args = [
    '--print', '--output-format', streaming ? 'stream-json' : 'json', ...(streaming ? ['--verbose'] : []), '--permission-mode', analysisMode ? 'plan' : 'auto', ...modelArgs,
    '--max-turns', String(effectiveMaxTurns), ...(authMode === 'API' ? ['--max-budget-usd', String(effectiveBudgetUsd)] : []),
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
  recordClaudeUsage({ response, taskId, taskType, authMode, startedAt, finishedAt, recordUsage, implementStep, taskClass, escalation });
  if (response?.is_error || result.status !== 0) {
    if (response?.subtype === 'error_max_turns' || response?.terminal_reason === 'max_turns') {
      return { status: 'PARKED', reason: 'MAX_TURNS', result: response.result || `Claude erreichte das Arbeitsschritt-Limit (${effectiveMaxTurns}). Bitte den Auftrag enger formulieren.`, usage: response.usage ?? null, costUsd: response.total_cost_usd ?? null, authMode };
    }
    if (response?.subtype === 'error_max_budget_usd' || response?.terminal_reason === 'max_budget_usd') {
      return { status: 'PARKED', reason: 'MAX_BUDGET', result: response.result || `Claude erreichte das Analysebudget von ${effectiveBudgetUsd.toFixed(2)} USD.`, usage: response.usage ?? null, costUsd: response.total_cost_usd ?? null, authMode };
    }
    throw new CliAgentError(`Claude reported an error: ${response.result ?? response?.errors?.join('; ') ?? 'unknown error'}`, { commandOutput: (result.stderr || '').slice(-1200) });
  }
  return { status: 'PASS', result: response?.result ?? '', usage: response?.usage ?? null, costUsd: response?.total_cost_usd ?? null, authMode, model: implementStep?.model ?? null, effort: implementStep?.effort ?? null };
}

// Codex als Implementer/Corrector: nur ueber die Eskalationsleiter oder als
// Rate-Limit-Fallback von Claude. Schreibt im Arbeitsbereich, nie darueber
// hinaus; das Ergebnis laeuft durch dieselben Diff-Guards wie ein Claude-Lauf.
function runCodexWork({ taskText, taskId, findings = [], cwd, timeoutMs, implementStep, runDir = '.router/agent-runs', io = fs, spawn = spawnSync, recordUsage = appendUsageRecord, taskClass = null, escalation = null }) {
  const id = compactId(taskId);
  const outputDir = path.resolve(cwd, runDir, id);
  io.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `codex-work-${Date.now()}.md`);
  const binary = resolveCodexBinary() ?? 'codex';
  const startedAt = new Date().toISOString();
  execute(binary, ['exec', '--ephemeral', '--sandbox', 'workspace-write', ...codexArgsForStep(implementStep), '--output-last-message', outputPath, buildClaudeWorkPrompt(taskText, findings, 'IMPLEMENTATION')],
    { cwd, env: { ...process.env, TP_AGENT_LOOP_ACTIVE: '1' }, timeoutMs, spawn });
  const finishedAt = new Date().toISOString();
  try {
    recordUsage({ timestamp: finishedAt, taskId: id, role: 'WORKER', provider: 'CODEX_SUBSCRIPTION', upstreamProvider: 'OPENAI', gateway: 'CODEX_CLI', model: implementStep.model, requestedModel: implementStep.model, effort: implementStep.effort ?? null, taskClass, escalation, startedAt, finishedAt, durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(), stopReason: 'end_turn', responseContentTypes: ['text'], usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0 } });
  } catch { /* Ledger darf die Arbeit nicht verhindern. */ }
  return { status: 'PASS', result: io.existsSync(outputPath) ? io.readFileSync(outputPath, 'utf8') : '', authMode: 'CODEX', model: implementStep.model, effort: implementStep.effort ?? null };
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

// Fuehrt einen Implementer-/Corrector-Schritt aus und wechselt bei Rate Limit
// ohne API-Backup einmal den Provider (Claude -> Codex), nie das Faehigkeits-
// niveau. Codex-Schritte kommen nur aus der Eskalationsleiter.
async function runWorkStep({ implementStep, onState = null, ...options }) {
  if (implementStep?.provider === 'CODEX') return runCodexWork({ ...options, implementStep });
  try {
    return await runClaudeWithFallback({ ...options, implementStep, onState });
  } catch (error) {
    if (!isRateLimitError(error)) throw error;
    const fallback = rateLimitFallback(implementStep ?? { provider: 'CLAUDE', model: 'fable', effort: 'medium' });
    if (!fallback) throw error;
    onState?.({ status: 'PROVIDER_FALLBACK', from: describeStep(implementStep), to: describeStep(fallback), reason: fallback.reason });
    return { ...runCodexWork({ ...options, implementStep: fallback, escalation: fallback.reason }), fallbackReason: fallback.reason };
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

export async function createManifestExecutor({ gateway, model, cacheSessionKey, cwd = process.cwd(), timeoutMs = 30 * 60_000, budgetUsd = Number(process.env.AGENT_LOOP_CLAUDE_MAX_BUDGET_USD ?? 1), spawn = null, recordUsage = appendUsageRecord, onState = null }) {
  if (gateway === 'CLAUDE_CODE_CLI' || gateway === 'CLAUDE_CODE') {
    return async (task, metadata) => {
      const result = await runClaudeWithFallback({
        taskText: task.description ?? task.id,
        taskId: task.id,
        taskType: 'IMPLEMENTATION',
        findings: [],
        cwd,
        timeoutMs,
        budgetUsd,
        spawn,
        recordUsage,
        onState,
      });
      if (result.status !== 'PASS') {
        return { status: result.status, reason: result.reason ?? 'Claude executor failed', result: result.result ?? '' };
      }
      return {
        status: 'PASS',
        result: result.result ?? '',
        diffEntries: [],
        changedFiles: [],
        resources: [],
        actualOperations: task.allowedOperations ?? [],
      };
    };
  }
  if (gateway === 'CODEX_CLI' || gateway === 'CODEX') {
    return async (task, metadata) => {
      const result = runCodexReview({
        taskText: task.description ?? task.id,
        taskType: 'IMPLEMENTATION',
        taskId: task.id,
        cwd,
        timeoutMs,
        spawn,
      });
      if (result.status === 'PASS') {
        return {
          status: 'PASS',
          result: result.taskFile ?? '',
          diffEntries: [],
          changedFiles: [],
          resources: [],
          actualOperations: task.allowedOperations ?? [],
        };
      }
      if (result.status === 'HUMAN_GATE') {
        return { status: 'SECURITY_STOP', reason: 'Codex review requires human gate', findings: result.findings ?? [] };
      }
      return { status: 'REVIEW_FINDINGS', findings: result.findings ?? [] };
    };
  }
  throw new Error(`Unsupported gateway for executor: ${gateway}`);
}

export function createImplementExecutor({ gateway, cwd, timeoutMs, budgetUsd, recordUsage }) {
  return async (task, metadata) => {
    try {
      if (gateway === 'CLAUDE_CODE_CLI' || gateway === 'CLAUDE_CODE') {
        const result = await runClaudeWithFallback({
          taskText: task.description ?? task.id,
          taskId: task.id,
          taskType: 'IMPLEMENTATION',
          findings: [],
          cwd,
          timeoutMs,
          budgetUsd,
          recordUsage,
        });
        if (result.status !== 'PASS') {
          return { status: result.status === 'PARKED' ? 'PARKED' : 'HARD_FAIL', reason: result.reason ?? 'Claude executor failed', result: result.result ?? '' };
        }
        return {
          status: 'PASS',
          result: result.result ?? '',
          diffEntries: [],
          changedFiles: [],
          resources: task.resources ?? [],
          actualOperations: task.allowedOperations ?? [],
        };
      }
      return { status: 'HARD_FAIL', reason: `Unsupported gateway for implementation: ${gateway}` };
    } catch (error) {
      return { status: 'HARD_FAIL', reason: `Executor error: ${error.message}` };
    }
  };
}

export function createReviewExecutor({ gateway, cwd, timeoutMs }) {
  return async (task, candidate, metadata) => {
    try {
      if (gateway === 'CODEX_CLI' || gateway === 'CODEX') {
        const result = runCodexReview({
          taskText: candidate.result ?? task.description ?? task.id,
          taskType: 'IMPLEMENTATION',
          taskId: `${task.id}-R${metadata.reviewRound}`,
          cwd,
          timeoutMs,
        });
        if (result.status === 'HUMAN_GATE') {
          return { status: 'SECURITY_STOP', findings: result.findings ?? [] };
        }
        if (result.status === 'PASS') {
          return { status: 'PASS', findings: [] };
        }
        return { status: 'REVIEW_FINDINGS', findings: result.findings ?? [] };
      }
      if (gateway === 'CLAUDE_CODE_CLI' || gateway === 'CLAUDE_CODE') {
        return { status: 'PASS', findings: [] };
      }
      return { status: 'REVIEW_INFRA_FAILED', reviewError: `Unsupported gateway for review: ${gateway}` };
    } catch (error) {
      return { status: 'REVIEW_INFRA_FAILED', reviewError: `Executor error: ${error.message}` };
    }
  };
}

export function createCorrectExecutor({ gateway, cwd, timeoutMs, budgetUsd, recordUsage }) {
  return async (task, candidate, findings, metadata) => {
    try {
      if (gateway === 'CLAUDE_CODE_CLI' || gateway === 'CLAUDE_CODE') {
        const result = await runClaudeWithFallback({
          taskText: task.description ?? task.id,
          taskId: task.id,
          taskType: 'IMPLEMENTATION',
          findings: findings.map(f => ({ priority: f.priority, message: f.problem })),
          cwd,
          timeoutMs,
          budgetUsd,
          recordUsage,
        });
        if (result.status !== 'PASS') {
          return { status: result.status === 'PARKED' ? 'PARKED' : 'HARD_FAIL', reason: result.reason ?? 'Claude executor failed' };
        }
        return {
          status: 'PASS',
          result: result.result ?? '',
          diffEntries: [],
          changedFiles: [],
          resources: task.resources ?? [],
          actualOperations: task.allowedOperations ?? [],
        };
      }
      return { status: 'HARD_FAIL', reason: `Unsupported gateway for correction: ${gateway}` };
    } catch (error) {
      return { status: 'HARD_FAIL', reason: `Executor error: ${error.message}` };
    }
  };
}

export async function runCliAgentCycle({ task, taskId = `AGENT-${Date.now()}`, cwd = process.cwd(), maxReviewRounds = 3, timeoutMs = 30 * 60_000, budgetUsd = Number(process.env.AGENT_LOOP_CLAUDE_MAX_BUDGET_USD ?? 1), spawn = null, review = runCodexReview, recordUsage = appendUsageRecord, onState = null, io = fs, declaredTaskType = null, forceTaskType = null, previousRisk = null, guardsEnabled = process.env.DASHBOARD_GUARDS !== 'off' }) {
  const classified = classifyClaudeRequest({ taskId, task, declaredTaskType, forceTaskType, previousRisk });
  // Modellwahl je Klasse aus einer Quelle (workflow/model-matrix.mjs). Vorher
  // lief jeder Worker mit dem Account-Default und jede Korrektur mit demselben
  // Modell, egal wie oft sie scheiterte.
  const taskClass = classifyTask(classified.task);
  const plan = buildModelPlan(taskClass);
  onState?.({ status: 'ROUTED', risk: classified.risk, taskType: classified.taskType, taskTypeSource: classified.taskTypeSource, taskClass, primary: describeStep(plan.primary), reviewer: describeStep(plan.reviewer), strategy: plan.strategy });
  if (classified.risk === 'HIGH') {
    onState?.({ status: 'HUMAN_GATE', risk: classified.risk });
    return { status: 'HUMAN_GATE', reason: 'HIGH-risk task is not executed by the unattended CLI loop', classified, taskClass, plan };
  }
  let phase = 'IMPLEMENT';
  let apiCorrections = 0;
  let currentStep = classified.taskType === 'ANALYSIS' ? null : plan.primary;
  let lastSignature = null;
  let repeatedFailures = 0;
  const escalations = [];
  const maxApiCorrections = Number(process.env.AGENT_LOOP_API_MAX_CORRECTIONS ?? 1);
  // Bezugspunkt vor dem ersten Worker-Lauf: nur was DIESER Lauf zusaetzlich
  // veraendert, darf ihm angelastet werden.
  const riskMap = guardsEnabled ? loadDashboardRiskMap({ cwd }) : null;
  const baseline = riskMap ? snapshotWorkingTree({ cwd }) : null;
  // Prueft den tatsaechlichen Diff gegen Risiko-Karte und Umfang. `BLOCKED` ist
  // in review-cycle bereits ein Terminal-Status, der das Worker-Ergebnis behaelt
  // - es geht also nichts verloren, es wird nur nicht als fertig ausgegeben.
  const guardCandidate = candidate => {
    if (!riskMap || !baseline) return candidate;
    const changes = diffSinceSnapshot(baseline, snapshotWorkingTree({ cwd }));
    const verdict = evaluateDashboardGuards({ taskType: classified.taskType, risk: classified.risk, changes, riskMap });
    if (verdict.status === 'PASS') return { ...candidate, guard: verdict };
    onState?.({ status: 'GUARD_BLOCKED', guardStatus: verdict.status, message: verdict.message });
    return { ...candidate, status: 'BLOCKED', guard: verdict, reason: verdict.status };
  };
  const result = await runReviewCorrectionCycle({
    task: classified,
    maxReviewRounds,
    providerTimeoutMs: timeoutMs,
    implement: async () => guardCandidate(await runWorkStep({ taskText: classified.task, taskId: classified.id, taskType: classified.taskType, cwd, timeoutMs, budgetUsd, spawn, recordUsage, onState, io, implementStep: currentStep, taskClass })),
    // Klasse A: deterministische Pruefung reicht, kein Modell-Review.
    review: plan.reviewer === null ? null : async (_task, candidate, metadata) => {
      let result;
      try {
        result = runReviewStep({ review, reviewStep: plan.reviewer, authorModel: currentStep?.model ?? plan.primary.model, onState, taskText: classified.task, taskType: classified.taskType, candidateText: candidate.result ?? '', taskId: `${classified.id}-R${metadata.reviewRound}`, cwd, timeoutMs, spawn: spawn ?? spawnSync, recordUsage });
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
    correct: async (_task, candidate, findings, metadata) => {
      // Kostenbremse: Solange Claude Code Pro laeuft, sind Korrekturrunden
      // gratis und duerfen bis maxReviewRounds gehen. Sobald der Worker auf die
      // kostenpflichtige API ausgewichen ist, kostet jede weitere Runde echtes
      // Geld - und ein Reviewbefund ist nicht zwingend richtig. Deshalb dort
      // nur eine automatische Korrektur; danach entscheidet der Mensch.
      //
      // Gezaehlt wird NACH dem Lauf anhand des tatsaechlich benutzten Modus.
      // Vorher am uebergebenen Kandidaten zu pruefen reichte nicht: faellt erst
      // die Korrektur selbst auf die API zurueck, trug der Kandidat noch
      // SUBSCRIPTION - und es liefen zwei bezahlte Runden statt einer.
      if (apiCorrections >= maxApiCorrections) {
        onState?.({ status: 'API_CORRECTION_LIMIT', corrections: apiCorrections });
        return { ...candidate, status: 'PARKED', reason: 'API_CORRECTION_LIMIT', findings };
      }
      phase = 'CORRECT';
      // Eskalation statt Wiederholung: derselbe Befund ein zweites Mal oder
      // eine zweite Ablehnung heben den Corrector an (Effort -> Peer-Modell ->
      // anderer Provider). Ein Corrector unter dem Niveau des Implementers
      // entsteht dabei nie; die Leiter kennt nur Schritte nach oben.
      const signature = failureSignature(findings);
      const sameFailureAgain = signature === lastSignature;
      lastSignature = signature;
      if (sameFailureAgain) repeatedFailures += 1;
      const failureRound = metadata.reviewRound + (sameFailureAgain ? repeatedFailures : 0);
      const escalated = escalateStep(currentStep ?? plan.corrector, { round: failureRound, reason: sameFailureAgain ? 'SAME_FINDINGS_AGAIN' : 'REVIEW_REJECTED' });
      if (!escalated) {
        onState?.({ status: 'ESCALATION_EXHAUSTED', from: describeStep(currentStep), findings });
        return { ...candidate, status: 'PARKED', reason: 'ESCALATION_EXHAUSTED', findings };
      }
      if (describeStep(escalated) !== describeStep(currentStep)) {
        escalations.push({ round: metadata.reviewRound, from: describeStep(currentStep), to: describeStep(escalated), reason: escalated.reason });
        onState?.({ status: 'ESCALATED', ...escalations.at(-1) });
        currentStep = escalated;
      }
      const corrected = await runWorkStep({ taskText: classified.task, taskId: classified.id, taskType: classified.taskType, findings, cwd, timeoutMs, budgetUsd, spawn, recordUsage, onState, io, implementStep: currentStep, taskClass, escalation: escalated.reason ?? null });
      if (corrected?.authMode === 'API') apiCorrections += 1;
      return guardCandidate(corrected);
    },
    onState,
  });
  return { ...result, taskId: classified.id, taskText: classified.task, taskType: classified.taskType, taskTypeSource: classified.taskTypeSource, risk: classified.risk, taskClass, plan, escalations, finalStep: describeStep(currentStep), lastWorkerPhase: phase };
}
