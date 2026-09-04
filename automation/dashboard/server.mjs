import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildFollowUpTask, createDashboardState, makeRun, publicRun, sanitizeTask, summarizeUsage } from './dashboard-core.mjs';
import { buildIssueTaskContext, createOrReuseIssue, getIssue, listOpenIssues, parseIssueNumber, synchronizeIssue } from './github-issues.mjs';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const dashboardDir = path.join(root, 'automation/dashboard/public');
const stateDir = process.env.DASHBOARD_STATE_DIR || path.join(os.homedir(), 'Library/Application Support/TP AI Dashboard');
const secretPath = path.join(stateDir, 'access-token');
const pidPath = path.join(stateDir, 'server.pid');
const dashboardStatePath = path.join(stateDir, 'dashboard-state.json');
const agentLoopScript = process.env.DASHBOARD_AGENT_LOOP_SCRIPT || 'automation/scripts/agent-loop.mjs';
const EVENT_PREFIX = '@@TP_EVENT@@';
const MAX_HISTORY = 20;
const TASK_TYPES = new Set(['IMPLEMENTATION', 'ANALYSIS']);

const configuredLedger = process.env.AI_ROUTER_USAGE_LEDGER || '.router/ai-usage.jsonl';
const ledgerPath = path.isAbsolute(configuredLedger) ? configuredLedger : path.join(root, configuredLedger);
const port = Number(process.env.DASHBOARD_PORT || 4310);
const host = process.env.DASHBOARD_HOST || '127.0.0.1';

function ensurePrivateMode(targetPath, mode) {
  try {
    const stats = fs.statSync(targetPath);
    if ((stats.mode & 0o077) !== 0) fs.chmodSync(targetPath, mode);
  } catch { /* nothing to tighten */ }
}

function ensureSecureStateDir() {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  ensurePrivateMode(stateDir, 0o700);
}

function accessToken() {
  if (process.env.DASHBOARD_ACCESS_TOKEN?.trim()) return process.env.DASHBOARD_ACCESS_TOKEN.trim();
  ensureSecureStateDir();
  if (fs.existsSync(secretPath)) {
    ensurePrivateMode(secretPath, 0o600);
    return fs.readFileSync(secretPath, 'utf8').trim();
  }
  const token = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(secretPath, `${token}\n`, { mode: 0o600 });
  return token;
}

const token = accessToken();
const sessions = new Set();

function readPersistedState() {
  try {
    const saved = JSON.parse(fs.readFileSync(dashboardStatePath, 'utf8'));
    const history = Array.isArray(saved.history) ? saved.history.slice(0, MAX_HISTORY) : [];
    if (saved.current) {
      // Aufgabentext, Router-Entscheidung und die bis dahin sichtbaren
      // Aktivitaeten bleiben erhalten (sie stecken in saved.current), damit ein
      // Neustart des Auftrags nicht bei null anfaengt.
      const activityCount = Array.isArray(saved.current.activities) ? saved.current.activities.length : 0;
      const interrupted = {
        ...saved.current,
        state: 'ERROR',
        finishedAt: new Date().toISOString(),
        message: `Dashboard wurde während dieses Auftrags neu gestartet. Auftrag und Einstufung${activityCount ? ` sowie ${activityCount} protokollierte Schritte sind` : ' sind'} erhalten; der Auftrag kann unten erneut gestartet werden.`,
      };
      history.unshift(interrupted);
    }
    return createDashboardState({ latest: history[0] ?? null, history });
  } catch {
    return createDashboardState();
  }
}

const state = readPersistedState();

function persistState() {
  ensureSecureStateDir();
  const temporaryPath = `${dashboardStatePath}.${process.pid}.tmp`;
  const snapshot = { version: 1, current: publicRun(state.current), history: state.history.slice(0, MAX_HISTORY), updatedAt: new Date().toISOString() };
  fs.writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, dashboardStatePath);
}

const MAX_BODY_BYTES = 32_000;
const BODY_TIMEOUT_MS = 10_000;

function readBody(request) {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(request.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      request.destroy();
      reject(new Error('Request too large'));
      return;
    }
    let body = '';
    let size = 0;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      request.destroy();
      finish(reject, new Error('Request timeout'));
    }, BODY_TIMEOUT_MS);
    request.setEncoding('utf8');
    request.on('data', chunk => {
      if (settled) return;
      size += Buffer.byteLength(chunk, 'utf8');
      if (size > MAX_BODY_BYTES) {
        request.destroy();
        finish(reject, new Error('Request too large'));
        return;
      }
      body += chunk;
    });
    request.on('end', () => finish(resolve, body));
    request.on('error', error => finish(reject, error));
  });
}

function json(response, status, value, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0', pragma: 'no-cache', expires: '0', ...headers });
  response.end(JSON.stringify(value));
}

function isAuthorized(request) {
  const cookie = request.headers.cookie || '';
  return [...sessions].some(session => cookie.split(';').some(part => part.trim() === `tp_dashboard=${session}`));
}

function usage() {
  if (!fs.existsSync(ledgerPath)) return summarizeUsage([]);
  const entries = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  return summarizeUsage(entries);
}

function publicStatus() {
  return {
    current: publicRun(state.current),
    latest: publicRun(state.latest),
    history: state.history.slice(0, MAX_HISTORY),
    usage: usage(),
    connection: host === '127.0.0.1' || host === 'localhost' ? 'LOCAL_ONLY' : 'PRIVATE_NETWORK',
  };
}

function progressMessage(event) {
  const messages = {
    ROUTED: 'Router hat Aufgabe und Sicherheitsstufe bestimmt.',
    IMPLEMENT: 'Claude setzt den Auftrag um und führt passende Tests aus.',
    PROVIDER: `${event.provider || 'KI-Anbieter'} arbeitet am Auftrag.`,
    FALLBACK: 'Claude Code Pro hat sein Limit erreicht. Der eingerichtete API-Backup übernimmt.',
    REVIEW: `Codex prüft das Ergebnis unabhängig${event.reviewRound ? ` (Runde ${event.reviewRound})` : ''}.`,
    REVIEW_FINDINGS: 'Codex hat verbesserungsbedürftige Punkte gefunden.',
    CORRECTION_REQUIRED: 'Die Befunde werden automatisch an Claude zurückgegeben.',
    CORRECT: 'Claude behebt die Review-Befunde und testet erneut.',
    REVIEW_LIMIT_REACHED: 'Das automatische Review-Limit wurde erreicht.',
    HARD_FAIL: 'Die unabhängige Prüfung hat einen schweren Fehler erkannt.',
    HUMAN_GATE: 'Diese Änderung benötigt eine ausdrückliche Freigabe.',
    REVIEW_INFRA_FAILED: 'Claude abgeschlossen – unabhängige Prüfung technisch fehlgeschlagen.',
    GUARD_BLOCKED: 'Eine Schutzprüfung hat den Lauf angehalten.',
  };
  return messages[event.status] || 'Der Auftrag wird weiterverarbeitet.';
}

function applyProgress(run, event) {
  if (event.status === 'ACTIVITY') {
    run.activities = [...(run.activities ?? []), { at: new Date().toISOString(), kind: event.kind ?? 'Aktion', message: event.message ?? 'Claude arbeitet weiter.' }].slice(-30);
    run.message = event.message ?? run.message;
    state.updatedAt = new Date().toISOString();
    persistState();
    return;
  }
  run.state = event.status === 'HUMAN_GATE' ? 'HUMAN_GATE' : 'WORKING';
  run.message = progressMessage(event);
  if (event.status === 'ROUTED') {
    run.taskType = event.taskType ?? null;
    run.taskTypeSource = event.taskTypeSource ?? null;
    run.risk = event.risk ?? null;
    // Erst jetzt steht fest, ob der Lauf ueberhaupt etwas veraendert. Nur dann
    // ist ein "in Arbeit"-Kommentar auf GitHub gerechtfertigt.
    if (event.taskType === 'IMPLEMENTATION' && !run.startSynced) {
      run.startSynced = true;
      syncIssue(run, 'WORKING');
    }
  }
  run.progress = {
    phase: event.status,
    provider: event.provider ?? run.progress?.provider ?? null,
    reviewRound: Number.isInteger(event.reviewRound) ? event.reviewRound : run.progress?.reviewRound ?? null,
    maxReviewRounds: Number.isInteger(event.maxReviewRounds) ? event.maxReviewRounds : run.progress?.maxReviewRounds ?? null,
  };
  state.updatedAt = new Date().toISOString();
  persistState();
}

function syncIssue(run, issueState) {
  if (!run.issue?.number) return;
  try {
    run.issueSync = synchronizeIssue({ issueNumber: run.issue.number, state: issueState, run });
    delete run.issueSyncError;
  } catch (error) {
    run.issueSyncError = `GitHub-Abgleich fehlgeschlagen: ${String(error.message).slice(0, 240)}`;
  }
  persistState();
}

function executeRun(run, extraArgs = [], previousWorkerResult = null) {
  state.current = run;
  state.startedAt = new Date().toISOString();
  state.updatedAt = state.startedAt;
  run.state = 'ROUTING';
  run.startedAt = state.startedAt;
  run.message = 'Router prüft Aufgabe und Sicherheitsstufe.';
  persistState();
  // Bewusst KEIN GitHub-Schreibvorgang vor der Router-Entscheidung: frueher
  // wurde hier sofort ein "in Arbeit"-Kommentar gepostet, auch fuer rein
  // lesende Auftraege und fuer solche, die gleich darauf im Human Gate landen.
  // Der Start-Abgleich passiert jetzt in applyProgress beim ROUTED-Event, und
  // nur fuer Laeufe, die tatsaechlich etwas veraendern.
  const child = spawn(process.execPath, [agentLoopScript, '--task', run.task, '--task-id', run.id, ...extraArgs], {
    cwd: root,
    env: { ...process.env, TP_AGENT_LOOP_ACTIVE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  let errorBuffer = '';
  let finished = false;
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => {
    errorBuffer += String(chunk);
    const lines = errorBuffer.split('\n');
    errorBuffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith(EVENT_PREFIX)) {
        try { applyProgress(run, JSON.parse(line.slice(EVENT_PREFIX.length))); } catch { errors += `${line}\n`; }
      } else if (line) errors += `${line}\n`;
    }
  });
  child.on('spawn', () => { run.state = 'WORKING'; run.message = 'Router-Ausführung wurde gestartet.'; persistState(); });
  child.on('error', error => finish('ERROR', `Start fehlgeschlagen: ${error.message}`));
  child.on('close', code => {
    if (errorBuffer && !errorBuffer.startsWith(EVENT_PREFIX)) errors += errorBuffer;
    let result = null;
    try { result = JSON.parse(output); } catch { /* handled below */ }
    if (result && previousWorkerResult && result.result === undefined) {
      // A review-only retry has no worker output of its own: keep the original
      // completed work visible instead of losing it behind the retried review.
      result = { ...previousWorkerResult, ...result, reviewRetry: true };
    }
    if (result?.status === 'HUMAN_GATE') finish('HUMAN_GATE', 'Angehalten: Diese Aufgabe braucht eine ausdrückliche Freigabe.', result);
    else if (result?.status === 'BLOCKED') finish('BLOCKED', result.guard?.message || 'Angehalten: Eine Schutzprüfung hat den Lauf gestoppt. Die Änderungen stehen unverändert in der Arbeitskopie.', result);
    else if (result?.status === 'REVIEW_INFRA_FAILED') finish('REVIEW_INFRA_FAILED', 'Claude abgeschlossen – unabhängige Prüfung technisch fehlgeschlagen. Nur die Prüfung kann unten erneut gestartet werden.', result);
    else if (result?.status === 'REVIEW_FINDINGS') finish('HUMAN_GATE', 'Die erneute Prüfung fand Befunde. Bitte manuell entscheiden oder einen Folgebefehl zur Korrektur starten.', result);
    else if (result?.status === 'PARKED') finish('ERROR', result.reason === 'MAX_TURNS' ? 'Arbeitsschritt-Limit erreicht. Das Teilresultat und die Kosten stehen unten.' : result.reason === 'MAX_BUDGET' ? 'Analysebudget erreicht. Teilresultat und Kosten stehen unten.' : result.reason === 'API_CORRECTION_LIMIT' ? 'Angehalten zum Kostenschutz: Die Korrektur lief bereits über das kostenpflichtige API-Backup. Die Befunde stehen unten – entscheide selbst, ob eine weitere Runde nötig ist.' : 'Aufgabe wurde sicher geparkt.', result);
    else if (code === 0 && result?.status === 'PASS') finish('PASS', 'Erledigt und durch den Review-Zyklus bestätigt.', result);
    else finish('ERROR', `Nicht abgeschlossen. ${String(errors || output || `Prozessstatus ${code}`).replace(/sk-[A-Za-z0-9_-]+/g, '[geschützt]').slice(-800)}`, result);
  });
  function finish(nextState, message, result = null) {
    if (finished) return;
    finished = true;
    run.state = nextState;
    run.message = message;
    run.result = result;
    run.finishedAt = new Date().toISOString();
    syncIssue(run, nextState);
    state.latest = run;
    const visible = publicRun(run);
    state.history = [visible, ...state.history.filter(item => item.id !== visible.id)].slice(0, MAX_HISTORY);
    state.current = null;
    state.updatedAt = run.finishedAt;
    persistState();
  }
}

function serveAsset(response, name, type) {
  response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0', pragma: 'no-cache', expires: '0', 'clear-site-data': '"cache"', 'x-content-type-options': 'nosniff' });
  response.end(fs.readFileSync(path.join(dashboardDir, name)));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/health') return json(response, 200, { ok: true });
  if (url.pathname === '/api/login' && request.method === 'POST') {
    try {
      const supplied = JSON.parse(await readBody(request)).token;
      const received = Buffer.from(String(supplied || ''));
      const expected = Buffer.from(token);
      if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return json(response, 401, { error: 'Ungültiger Zugangscode.' });
      const session = crypto.randomBytes(24).toString('base64url');
      sessions.add(session);
      return json(response, 200, { ok: true }, { 'set-cookie': `tp_dashboard=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` });
    } catch { return json(response, 400, { error: 'Ungültige Anfrage.' }); }
  }
  if (url.pathname.startsWith('/api/') && !isAuthorized(request)) return json(response, 401, { error: 'Bitte Zugangscode eingeben.' });
  if (url.pathname === '/api/status' && request.method === 'GET') return json(response, 200, publicStatus());
  if (url.pathname === '/api/issues' && request.method === 'GET') {
    try { return json(response, 200, { issues: listOpenIssues() }); }
    catch { return json(response, 503, { error: 'GitHub-Aufgaben konnten gerade nicht geladen werden.' }); }
  }
  if (url.pathname === '/api/tasks' && request.method === 'POST') {
    if (state.current) return json(response, 409, { error: 'Eine Aufgabe läuft bereits. Warte auf das Ergebnis.' });
    try {
      const body = JSON.parse(await readBody(request));
      const supplement = sanitizeTask(body.task);
      const declaredTaskType = TASK_TYPES.has(body.taskType) ? body.taskType : null;
      const isExistingIssue = body.issueNumber !== 'new' && body.issueNumber !== '' && body.issueNumber !== undefined && body.issueNumber !== null;
      let issue = null;
      let task = supplement;
      if (body.issueNumber === 'new') {
        // Ein reiner Analyse-Auftrag veraendert nichts und bekommt deshalb auch
        // kein neues oeffentliches GitHub-Issue. Frueher wurde hier immer eines
        // angelegt - noch bevor der Router ueberhaupt entschieden hatte.
        if (declaredTaskType !== 'ANALYSIS') issue = createOrReuseIssue(supplement);
      } else if (isExistingIssue) {
        const number = parseIssueNumber(body.issueNumber);
        const fullIssue = number ? getIssue(number) : null;
        if (fullIssue) {
          issue = { number: fullIssue.number, url: fullIssue.url, title: fullIssue.title, created: false, reused: true };
          // Selecting an existing issue must not silently drop its title/description:
          // the person's own text only ever supplements it, never replaces it.
          task = buildIssueTaskContext(fullIssue, supplement);
        } else if (number) {
          issue = { number, url: `https://github.com/${process.env.DASHBOARD_GITHUB_REPO || 'kontakt755/teppich-paradies-shopify-ai'}/issues/${number}` };
        }
      }
      const run = makeRun(task, { displayTask: supplement, issue });
      executeRun(run, declaredTaskType ? ['--declare-type', declaredTaskType] : []);
      return json(response, 202, { run: publicRun(run) });
    } catch (error) { return json(response, 400, { error: error.message }); }
  }
  if (url.pathname === '/api/follow-ups' && request.method === 'POST') {
    if (state.current) return json(response, 409, { error: 'Eine Aufgabe läuft bereits. Warte auf das Ergebnis.' });
    try {
      const followUpBody = JSON.parse(await readBody(request));
      const command = followUpBody.command;
      const declaredFollowUpType = TASK_TYPES.has(followUpBody.taskType) ? followUpBody.taskType : null;
      const previous = publicRun(state.latest);
      const task = buildFollowUpTask(previous, command);
      const run = makeRun(task, { displayTask: command, parentRunId: previous.id, issue: previous.issue ?? null });
      // A short follow-up prompt ("Versuch es erneut") must not get reclassified
      // from scratch: it inherits the original task's type and risk level so it
      // cannot be silently downgraded to ANALYSIS or LOW-risk.
      const extraArgs = [];
      // Eine ausdrueckliche Wahl beim Folgebefehl schlaegt den geerbten Typ.
      if (declaredFollowUpType) extraArgs.push('--declare-type', declaredFollowUpType);
      // Ein abgebrochener Lauf hat kein Endergebnis - dann zaehlt die beim
      // ROUTED-Ereignis festgehaltene Entscheidung des Laufs selbst.
      const inheritedType = previous?.result?.taskType ?? previous?.taskType;
      const inheritedRisk = previous?.result?.risk ?? previous?.risk;
      if (TASK_TYPES.has(inheritedType)) extraArgs.push('--task-type', inheritedType);
      if (inheritedRisk) extraArgs.push('--previous-risk', inheritedRisk);
      executeRun(run, extraArgs);
      return json(response, 202, { run: publicRun(run) });
    } catch (error) { return json(response, 400, { error: error.message }); }
  }
  if (url.pathname === '/api/review-retry' && request.method === 'POST') {
    if (state.current) return json(response, 409, { error: 'Eine Aufgabe läuft bereits. Warte auf das Ergebnis.' });
    const previous = publicRun(state.latest);
    if (!previous || previous.result?.status !== 'REVIEW_INFRA_FAILED') return json(response, 409, { error: 'Es gibt kein Ergebnis mit einer fehlgeschlagenen Prüfung, das erneut geprüft werden kann.' });
    try {
      const candidatePath = path.join(stateDir, `review-retry-${previous.id}.txt`);
      fs.writeFileSync(candidatePath, previous.result.summary ?? '', { mode: 0o600 });
      const taskText = previous.result.taskText || previous.task;
      const run = makeRun(taskText, { displayTask: previous.task, parentRunId: previous.id, issue: previous.issue ?? null });
      executeRun(run, ['--review-only', '--task-type', previous.result.taskType ?? 'IMPLEMENTATION', '--candidate-file', candidatePath], previous.result);
      return json(response, 202, { run: publicRun(run) });
    } catch (error) { return json(response, 400, { error: error.message }); }
  }
  if (url.pathname === '/' || url.pathname === '/index.html') return serveAsset(response, 'index.html', 'text/html; charset=utf-8');
  if (url.pathname === '/app.js') return serveAsset(response, 'app.js', 'application/javascript; charset=utf-8');
  if (url.pathname === '/styles.css') return serveAsset(response, 'styles.css', 'text/css; charset=utf-8');
  if (url.pathname === '/manifest.webmanifest') return serveAsset(response, 'manifest.webmanifest', 'application/manifest+json');
  response.writeHead(404).end();
});

server.on('error', error => {
  console.error(`Dashboard konnte nicht gestartet werden: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  ensureSecureStateDir();
  fs.writeFileSync(pidPath, `${process.pid}\n`, { mode: 0o600 });
  const actualPort = server.address().port;
  const location = `http://${host}:${actualPort}`;
  console.log(`Teppich-Paradies AI Dashboard: ${location}`);
  console.log('Zugangscode (nur einmal auf dem Gerät eingeben):');
  console.log(token);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
