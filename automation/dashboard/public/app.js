const $ = selector => document.querySelector(selector);
const login = $('#login');
const workspace = $('#workspace');
let signedIn = false;
let issuesLoaded = false;
let issuesLoading = false;
let lastIssueAttempt = 0;

// At least 3 decimals so a 0.135 USD API-backup cost is never rounded away.
function money(value) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD', minimumFractionDigits: 3, maximumFractionDigits: 6 }).format(Number(value || 0)); }
function number(value) { return new Intl.NumberFormat('de-DE').format(Number(value || 0)); }
function label(state) { return ({ QUEUED: 'Eingeplant', ROUTING: 'Router entscheidet …', WORKING: 'Ausführung läuft …', PASS: 'Fertig', HUMAN_GATE: 'Freigabe nötig', ERROR: 'Nicht abgeschlossen', REVIEW_INFRA_FAILED: 'Claude erfolgreich – Prüfung technisch fehlgeschlagen' })[state] || state; }
function phaseLabel(phase) { return ({ ROUTED: 'Aufgabe klassifiziert', IMPLEMENT: 'Umsetzung & Tests', PROVIDER: 'KI arbeitet', FALLBACK: 'API-Backup aktiv', REVIEW: 'Codex-Review', REVIEW_FINDINGS: 'Befunde erkannt', CORRECTION_REQUIRED: 'Korrektur beauftragt', CORRECT: 'Korrektur & neuer Test', REVIEW_LIMIT_REACHED: 'Review-Limit', HARD_FAIL: 'Schwerer Befund', HUMAN_GATE: 'Freigabe nötig' })[phase] || phase; }
async function request(url, options) {
  const response = await fetch(url, { headers: { 'content-type': 'application/json', ...(options?.headers || {}) }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unbekannter Fehler');
  return data;
}
function renderRun(run) {
  const node = $('#run');
  const progress = $('#progress');
  if (!run) { node.textContent = 'Bereit für deinen Auftrag.'; node.className = 'status'; progress.hidden = true; progress.replaceChildren(); return; }
  node.className = `status ${run.state.toLowerCase()}`;
  const title = document.createElement('strong'); title.textContent = label(run.state);
  const message = document.createElement('span'); message.textContent = run.message;
  const task = document.createElement('small'); task.textContent = run.task;
  node.replaceChildren(title, message, task);
  if (run.issue?.url) { const issue = document.createElement('a'); issue.href = run.issue.url; issue.target = '_blank'; issue.rel = 'noreferrer'; issue.className = 'issue-link'; issue.textContent = `${run.issue.created ? 'Neu erstellt: ' : run.issue.reused ? 'Vorhandene Aufgabe wiederverwendet: ' : ''}Online-Shop-Aufgabe #${run.issue.number}`; node.append(issue); }
  if (run.issueSyncError) { const syncError = document.createElement('small'); syncError.className = 'sync-error'; syncError.textContent = run.issueSyncError; node.append(syncError); }
  if (!run.progress) { progress.hidden = true; progress.replaceChildren(); return; }
  progress.hidden = false;
  const parts = [phaseLabel(run.progress.phase)];
  if (run.progress.provider) parts.push(run.progress.provider);
  if (run.progress.reviewRound) parts.push(`Review ${run.progress.reviewRound}/${run.progress.maxReviewRounds || '?'}`);
  progress.textContent = parts.join(' · ');
}
async function loadIssues(force = false) {
  if (issuesLoading || (!force && Date.now() - lastIssueAttempt < 10_000)) return;
  issuesLoading = true;
  lastIssueAttempt = Date.now();
  const status = $('#issues-status');
  status.textContent = 'GitHub-Aufgaben werden geladen …';
  try {
    const { issues } = await request('/api/issues');
    const select = $('#issue-number');
    const selected = select.value;
    select.replaceChildren(new Option('Neue Online-Shop-Aufgabe automatisch erstellen', 'new'), new Option('Nur lokal – keine GitHub-Aufgabe', ''));
    for (const issue of issues) select.append(new Option(`#${issue.number} · ${issue.title}`, String(issue.number)));
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
    issuesLoaded = true;
    status.textContent = `${issues.length} offene Aufgaben geladen. Neue Probleme werden automatisch angelegt.`;
    status.classList.remove('error');
  } catch {
    issuesLoaded = false;
    status.textContent = 'GitHub-Aufgaben konnten nicht geladen werden. Bitte „Neu laden“ drücken.';
    status.classList.add('error');
  } finally { issuesLoading = false; }
}
function renderResult(run) {
  const card = $('#result-card');
  const target = $('#result');
  const result = run?.result;
  if (!result) { card.hidden = true; return; }
  card.hidden = false;
  target.replaceChildren();
  const status = document.createElement('strong'); status.textContent = `Abschluss: ${result.status}`; target.append(status);
  if (run.issue?.url) { const issue = document.createElement('a'); issue.href = run.issue.url; issue.target = '_blank'; issue.rel = 'noreferrer'; issue.className = 'issue-link'; issue.textContent = `Online-Shop-Aufgabe #${run.issue.number} öffnen`; target.append(issue); }
  const facts = [result.provider, result.reviewRound ? `Review-Runde ${result.reviewRound}` : null, Number.isFinite(result.costUsd) && result.costUsd > 0 ? `Kosten: ${money(result.costUsd)}` : null].filter(Boolean);
  if (facts.length) { const meta = document.createElement('p'); meta.className = 'result-meta'; meta.textContent = facts.join(' · '); target.append(meta); }
  if (result.reason) { const reason = document.createElement('p'); reason.textContent = result.reason; target.append(reason); }
  if (result.reviewError) { const reviewError = document.createElement('p'); reviewError.className = 'sync-error'; reviewError.textContent = `Technischer Prüf-Fehler: ${result.reviewError}`; target.append(reviewError); }
  if (result.summary) { const summary = document.createElement('pre'); summary.textContent = result.summary; target.append(summary); }
  if (result.status === 'REVIEW_INFRA_FAILED') {
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Nur die Prüfung erneut starten';
    retry.addEventListener('click', async () => {
      retry.disabled = true;
      try { await request('/api/review-retry', { method: 'POST' }); await refresh(); }
      catch (error) { alert(error.message); }
      finally { retry.disabled = false; }
    });
    target.append(retry);
  }
  if (result.findings?.length) {
    const heading = document.createElement('h3'); heading.textContent = 'Review-Befunde'; target.append(heading);
    const list = document.createElement('ul');
    for (const finding of result.findings) { const item = document.createElement('li'); item.textContent = `${finding.priority || 'Hinweis'} · ${finding.file || 'Projekt'}: ${finding.problem || finding.recommendedFix || ''}`; list.append(item); }
    target.append(list);
  }
}
function renderActivities(run) {
  const card = $('#activity-card');
  const target = $('#activities');
  target.replaceChildren();
  const activities = run?.activities || [];
  if (!activities.length) { card.hidden = true; return; }
  card.hidden = false;
  for (const activity of activities.slice().reverse()) {
    const item = document.createElement('div'); item.className = 'activity-item';
    const dot = document.createElement('span'); dot.className = 'activity-dot';
    const content = document.createElement('div');
    const message = document.createElement('strong'); message.textContent = activity.message;
    const meta = document.createElement('small'); meta.textContent = `${activity.kind || 'Aktion'}${activity.at ? ` · ${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(activity.at))}` : ''}`;
    content.append(message, meta); item.append(dot, content); target.append(item);
  }
}
function renderHistory(history) {
  const card = $('#history-card');
  const target = $('#history');
  target.replaceChildren();
  if (!history?.length) { card.hidden = true; return; }
  card.hidden = false;
  for (const run of history.slice(0, 10)) {
    const item = document.createElement('article'); item.className = `history-item ${run.state.toLowerCase()}`;
    const top = document.createElement('div'); top.className = 'history-top';
    const state = document.createElement('strong'); state.textContent = label(run.state);
    const time = document.createElement('time'); time.textContent = run.finishedAt ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(run.finishedAt)) : 'läuft';
    top.append(state, time);
    const task = document.createElement('p'); task.textContent = run.task;
    const summaryText = run.result?.summary || run.message;
    item.append(top, task);
    if (run.issue?.url) { const issue = document.createElement('a'); issue.href = run.issue.url; issue.target = '_blank'; issue.rel = 'noreferrer'; issue.className = 'issue-link'; issue.textContent = `Aufgabe #${run.issue.number}`; item.append(issue); }
    if (summaryText) { const summary = document.createElement('small'); summary.textContent = summaryText.slice(0, 240); item.append(summary); }
    target.append(item);
  }
}
function render(status) {
  const run = status.current || status.latest;
  renderRun(run);
  renderActivities(run);
  renderResult(run);
  renderHistory(status.history);
  $('#follow-up-card').hidden = !status.latest || Boolean(status.current);
  $('#network').textContent = status.connection === 'PRIVATE_NETWORK' ? 'Privates Netzwerk' : 'Nur dieser Mac';
  $('#requests').textContent = number(status.usage.requests);
  $('#tokens').textContent = number(status.usage.inputTokens + status.usage.outputTokens);
  $('#cost').textContent = money(status.usage.costUsd);
  const providers = Object.entries(status.usage.byProvider);
  $('#providers').textContent = providers.length ? providers.map(([name, data]) => `${name}: ${data.requests} Anfrage(n), ${number(data.inputTokens + data.outputTokens)} Tokens`).join(' · ') : 'Noch keine gemessenen Anfragen.';
}
async function refresh() {
  if (!signedIn) return;
  try { render(await request('/api/status')); if (!issuesLoaded) loadIssues(); } catch (error) { if (String(error.message).includes('Zugangscode')) { signedIn = false; login.hidden = false; workspace.hidden = true; } }
}
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { await request('/api/login', { method: 'POST', body: JSON.stringify({ token: $('#access-token').value }) }); signedIn = true; login.hidden = true; workspace.hidden = false; await Promise.all([refresh(), loadIssues()]); }
  catch (error) { $('#login-error').textContent = error.message; }
});
$('#task-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#submit'); button.disabled = true;
  try { await request('/api/tasks', { method: 'POST', body: JSON.stringify({ task: $('#task').value, issueNumber: $('#issue-number').value || null }) }); $('#task').value = ''; await refresh(); }
  catch (error) { alert(error.message); }
  finally { button.disabled = false; }
});
document.querySelectorAll('.quick').forEach(button => button.addEventListener('click', () => { $('#follow-up').value = button.dataset.command; $('#follow-up').focus(); }));
$('#reload-issues').addEventListener('click', () => loadIssues(true));
$('#follow-up-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#follow-up-submit'); button.disabled = true;
  try { await request('/api/follow-ups', { method: 'POST', body: JSON.stringify({ command: $('#follow-up').value }) }); $('#follow-up').value = ''; await refresh(); }
  catch (error) { alert(error.message); }
  finally { button.disabled = false; }
});
setInterval(refresh, 2500);
