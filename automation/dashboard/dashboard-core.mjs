import crypto from 'node:crypto';

const MAX_TASK_LENGTH = 8_000;

export function sanitizeTask(value) {
  const task = String(value ?? '').trim();
  if (!task) throw new Error('Bitte beschreibe die Aufgabe.');
  if (task.length > MAX_TASK_LENGTH) throw new Error(`Die Aufgabe darf höchstens ${MAX_TASK_LENGTH} Zeichen haben.`);
  return task;
}

export function createDashboardState({ current = null, latest = null, history = [] } = {}) {
  return {
    current,
    latest,
    history,
    startedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

export function makeRun(task, { displayTask = null, parentRunId = null, issue = null } = {}) {
  return {
    id: `DASH-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    task: sanitizeTask(task),
    displayTask: displayTask ? sanitizeTask(displayTask) : null,
    parentRunId,
    issue: issue ? { number: Number(issue.number), title: redact(issue.title, 240), url: redact(issue.url, 500), created: Boolean(issue.created), reused: Boolean(issue.reused) } : null,
    state: 'QUEUED',
    startedAt: null,
    finishedAt: null,
    message: 'Wartet auf den Router.',
    result: null,
    progress: null,
    activities: [],
  };
}

export function publicRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    task: run.displayTask ?? run.task,
    parentRunId: run.parentRunId ?? null,
    issue: run.issue ?? null,
    issueSync: run.issueSync ?? null,
    issueSyncError: redact(run.issueSyncError, 300),
    activities: Array.isArray(run.activities) ? run.activities.slice(-30).map(activity => ({
      at: activity.at ?? null,
      kind: redact(activity.kind, 60),
      message: redact(activity.message, 300),
    })) : [],
    state: run.state,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    message: run.message,
    // Die Router-Entscheidung wird schon beim ROUTED-Ereignis festgehalten, nicht
    // erst im Endergebnis. Sonst geht sie bei einem Dashboard-Neustart mitten im
    // Lauf verloren - und ein "Erneut ausführen" müsste den Typ neu raten.
    taskType: ['IMPLEMENTATION', 'ANALYSIS'].includes(run.taskType) ? run.taskType : null,
    taskTypeSource: ['DECLARED', 'INHERITED', 'READ_ONLY_INTENT', 'HEURISTIC'].includes(run.taskTypeSource) ? run.taskTypeSource : null,
    risk: ['HIGH', 'LOW'].includes(run.risk) ? run.risk : null,
    progress: run.progress ? {
      phase: redact(run.progress.phase, 40),
      provider: redact(run.progress.provider, 80),
      reviewRound: Number.isInteger(run.progress.reviewRound) ? run.progress.reviewRound : null,
      maxReviewRounds: Number.isInteger(run.progress.maxReviewRounds) ? run.progress.maxReviewRounds : null,
    } : null,
    result: run.result ? {
      status: run.result.status ?? 'UNKNOWN',
      taskId: run.result.taskId ?? null,
      reason: run.result.reason ?? null,
      reviewError: redact(run.result.reviewError, 800),
      lastWorkerPhase: run.result.lastWorkerPhase ?? null,
      provider: run.result.authMode === 'SUBSCRIPTION' ? 'Claude Code Pro' : run.result.authMode === 'API' ? 'Claude API Backup' : null,
      authAttempts: Array.isArray(run.result.authAttempts) ? run.result.authAttempts : [],
      costUsd: Number.isFinite(run.result.costUsd) ? run.result.costUsd : null,
      // Preserved so a follow-up or a review-only retry never has to re-guess the
      // original task type / risk level / task text from a short new prompt.
      taskType: ['IMPLEMENTATION', 'ANALYSIS'].includes(run.result.taskType) ? run.result.taskType : null,
      taskTypeSource: ['DECLARED', 'INHERITED', 'READ_ONLY_INTENT', 'HEURISTIC'].includes(run.result.taskTypeSource) ? run.result.taskTypeSource : null,
      risk: ['HIGH', 'LOW'].includes(run.result.risk) ? run.result.risk : null,
      // Schutzprüfung: nur bekannte Felder, Dateipfade gekappt.
      guard: run.result.guard ? {
        status: redact(run.result.guard.status, 40),
        message: redact(run.result.guard.message, 600),
        effectiveRisk: redact(run.result.guard.effectiveRisk, 12),
        files: Number.isFinite(run.result.guard.files) ? run.result.guard.files : null,
        changedLines: Number.isFinite(run.result.guard.changedLines) ? run.result.guard.changedLines : null,
        changedFiles: Array.isArray(run.result.guard.changedFiles) ? run.result.guard.changedFiles.slice(0, 20).map(file => redact(file, 240)) : [],
      } : null,
      taskText: redact(run.result.taskText, 6_000),
      summary: redact(run.result.result),
      reviewRound: Number.isInteger(run.result.reviewRound) ? run.result.reviewRound : null,
      findings: Array.isArray(run.result.findings) ? run.result.findings.slice(0, 20).map(finding => ({
        priority: redact(finding.priority, 12),
        file: redact(finding.file, 240),
        problem: redact(finding.problem, 1_000),
        recommendedFix: redact(finding.recommendedFix, 1_000),
      })) : [],
    } : null,
  };
}

export function buildFollowUpTask(previous, command) {
  const followUp = sanitizeTask(command);
  if (!previous) throw new Error('Es gibt noch kein Ergebnis für einen Folgebefehl.');
  const previousTask = redact(previous.task, 2_500) || 'Nicht verfügbar';
  const previousResult = redact(previous.result?.summary || previous.message, 2_500) || 'Kein Ergebnistext verfügbar';
  return sanitizeTask(`Setze den vorherigen Dashboard-Auftrag fort.\n\nVORHERIGER AUFTRAG:\n${previousTask}\n\nBISHERIGES ERGEBNIS:\n${previousResult}\n\nFOLGEBEFEHL:\n${followUp}`);
}

export function redact(value, maximum = 6_000) {
  if (typeof value !== 'string') return null;
  return value.replace(/(?:sk-(?:or|ant)-[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]{20,})/g, '[geschützt]').slice(0, maximum);
}

export function summarizeUsage(entries) {
  const totals = { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, byProvider: {} };
  for (const entry of entries) {
    const usage = entry.usage ?? entry;
    totals.requests += 1;
    totals.inputTokens += Number(usage.inputTokens ?? 0) || 0;
    totals.outputTokens += Number(usage.outputTokens ?? 0) || 0;
    totals.costUsd += Number(usage.costUsd ?? 0) || 0;
    const provider = entry.upstreamProvider || entry.provider || 'UNKNOWN';
    const summary = totals.byProvider[provider] ?? { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    summary.requests += 1;
    summary.inputTokens += Number(usage.inputTokens ?? 0) || 0;
    summary.outputTokens += Number(usage.outputTokens ?? 0) || 0;
    summary.costUsd += Number(usage.costUsd ?? 0) || 0;
    totals.byProvider[provider] = summary;
  }
  return totals;
}
