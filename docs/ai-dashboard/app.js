/**
 * Teppich Paradies Control Center – Oberflaeche.
 *
 * Laeuft in zwei Betriebsarten mit derselben Datei:
 *  - statisch (GitHub Pages / npm run dashboard:serve): liest issues.json, read-only,
 *    jede Aktion fuehrt tief nach GitHub.
 *  - lokal (npm run dashboard): /api/* vorhanden, Statuswechsel und Kommentare
 *    laufen serverseitig validiert ueber gh.
 *
 * Alle Regeln (Status, Dringlichkeit, Uebergaenge) kommen aus lib/model.mjs.
 */
import {
  STATUSES, STATUS_BY_KEY, COLUMNS, PRIORITIES, AREAS, SAVED_VIEWS, SORTS, TRANSITIONS,
  normalizeTask, attentionList, attentionScore, requirementsFor, summarize, areaHealth,
  freshness, matchesQuery, dependentsOf,
} from './lib/model.mjs';

const CONFIG = {
  owner: 'kontakt755',
  repo: 'teppich-paradies-shopify-ai',
  dataUrl: './issues.json',
  refreshMs: 120_000,
  workflowFile: 'dashboard-data.yml',
};
const REPO_URL = `https://github.com/${CONFIG.owner}/${CONFIG.repo}`;

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------
const state = {
  raw: null,            // issues.json
  tasks: [],
  scores: new Map(),
  loadError: null,
  capabilities: { mode: 'static' },
  me: null,
  workflowRun: null,    // letzter Actions-Lauf (oeffentliche API, optional)
  agentRuns: null,      // nur lokal
  route: { view: 'heute', params: new URLSearchParams() },
  selectedRow: -1,
  detailCache: new Map(),
};

const $ = sel => document.querySelector(sel);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
const fmtDateTime = iso => iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
const ago = iso => { if (!iso) return '–'; const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 60) return `vor ${m} Min.`; const h = Math.round(m / 60); if (h < 48) return `vor ${h} Std.`; return `vor ${Math.round(h / 24)} Tagen`; };
const since = iso => ago(iso).replace(/^vor /, 'seit ');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const issueUrl = n => `${REPO_URL}/issues/${n}`;
const newIssueUrl = (params = {}) => `${REPO_URL}/issues/new?${new URLSearchParams(params)}`;

function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.textContent = text;
  $('#toastRoot').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

// ---------------------------------------------------------------------------
// Daten laden
// ---------------------------------------------------------------------------
async function loadCapabilities() {
  try {
    const r = await fetch('/api/capabilities', { cache: 'no-store' });
    if (!r.ok) throw new Error();
    state.capabilities = await r.json();
    state.me = state.capabilities.user || null;
  } catch { state.capabilities = { mode: 'static' }; }
}

async function loadData() {
  try {
    const r = await fetch(`${CONFIG.dataUrl}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`issues.json konnte nicht geladen werden (HTTP ${r.status})`);
    const data = await r.json();
    if (!Array.isArray(data.issues)) throw new Error('issues.json hat kein issues-Array');
    state.raw = data;
    const now = new Date();
    state.tasks = data.issues.map(i => normalizeTask(i, { now }));
    state.scores = new Map(state.tasks.map(t => [t.number, attentionScore(t, state.tasks, { now }).score]));
    state.loadError = null;
  } catch (e) {
    state.loadError = e.message;
  }
}

/** Letzter Lauf des Sync-Workflows – oeffentliche API, ohne Token. Scheitert leise. */
async function loadWorkflowRun() {
  if (state.capabilities.mode === 'local') return;
  try {
    const r = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/actions/workflows/${CONFIG.workflowFile}/runs?per_page=1`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const run = j.workflow_runs?.[0];
    state.workflowRun = run ? { status: run.status, conclusion: run.conclusion, at: run.updated_at, url: run.html_url } : { unavailable: true };
  } catch (e) { state.workflowRun = { unavailable: true, reason: e.message }; }
}

async function loadAgentRuns() {
  if (!state.capabilities.agentRuns) { state.agentRuns = null; return; }
  try {
    const r = await fetch('/api/agent-runs', { cache: 'no-store' });
    state.agentRuns = r.ok ? await r.json() : { error: `HTTP ${r.status}` };
  } catch (e) { state.agentRuns = { error: e.message }; }
}

async function refresh({ silent = false } = {}) {
  await loadData();
  await Promise.all([loadWorkflowRun(), loadAgentRuns()]);
  renderSyncChip();
  render();
  if (!silent && !state.loadError) toast('Daten aktualisiert');
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = hash.split('?');
  const view = ['heute', 'arbeit', 'freigaben', 'bereiche', 'insights', 'aktivitaet'].includes(path) ? path : 'heute';
  state.route = { view, params: new URLSearchParams(query) };
}
function navigate(view, params = {}, { keepTask = false } = {}) {
  const p = new URLSearchParams(params);
  if (keepTask && state.route.params.get('task')) p.set('task', state.route.params.get('task'));
  const q = p.toString();
  location.hash = `#/${view}${q ? `?${q}` : ''}`;
}
function openTask(number) {
  const p = new URLSearchParams(state.route.params); p.set('task', String(number));
  location.hash = `#/${state.route.view}?${p}`;
}
function closeTask() {
  const p = new URLSearchParams(state.route.params); p.delete('task');
  const q = p.toString();
  location.hash = `#/${state.route.view}${q ? `?${q}` : ''}`;
}

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------
const prioBadge = t => t.priority ? `<span class="badge ${t.priority}" title="${esc(PRIORITIES[t.priority].label)}">${PRIORITIES[t.priority].short}</span>` : `<span class="badge gap" title="Priorität fehlt">P?</span>`;
const statusBadge = t => `<span class="badge status ${esc(t.status)}">${esc(t.statusLabel)}</span>${t.legacyApproval ? '<span class="badge plain" title="Übergangsregel: abgeleitet aus status:blockiert + reviewer:mensch, weil status:freigabe im Repository fehlt">abgeleitet</span>' : ''}`;
const ownerText = t => t.owner ? `@${esc(t.owner)}` : `<span class="badge gap">ohne Owner</span>`;
const execBadge = t => t.executor ? `<span class="badge ${t.executorKind === 'ki' ? 'ki' : 'plain'}" title="Ausführende:r">${esc(t.executor)}</span>` : '';
const dueText = t => t.due ? (t.overdue ? `<span class="warnc">überfällig seit ${fmtDate(t.due)}</span>` : t.daysToDue === 0 ? '<b>heute fällig</b>' : `fällig ${fmtDate(t.due)}`) : '';
const areaLabel = key => AREAS.find(a => a.key === key)?.label || key;
const taskLink = t => `<a href="#" data-open="${t.number}">${esc(t.title)}</a>`;

function taskRow(t, { showNext = true } = {}) {
  return `<div class="row" data-open="${t.number}" tabindex="0" role="button" aria-label="${esc(t.id)} ${esc(t.title)}">
    <div>
      <div class="t"><span class="muted small mono">${esc(t.id)}</span> ${esc(t.title)}</div>
      <div class="m">${statusBadge(t)} <span>${ownerText(t)}</span> ${execBadge(t)} ${t.area ? `<span>${esc(t.area)}</span>` : ''} ${dueText(t) ? `<span>${dueText(t)}</span>` : ''} <span title="zuletzt aktualisiert">${ago(t.updatedAt)}</span></div>
    </div>
    <div class="r">${prioBadge(t)}${t.triage.length ? `<span class="badge gap" title="${esc(t.triage.join(', '))}">${plural(t.triage.length, 'Lücke', 'Lücken')}</span>` : ''}</div>
    ${showNext && t.nextStep ? `<div class="next">${esc(t.nextStep)}</div>` : ''}
    ${t.blocker && ['blockiert', 'freigabe'].includes(t.status) ? `<div class="next" style="color:var(--crit)">${esc(t.blocker)}</div>` : ''}
  </div>`;
}

function emptyState(title, hint, link) {
  return `<div class="empty"><strong>${esc(title)}</strong> ${esc(hint)}${link ? `<a href="${esc(link.href)}">${esc(link.text)}</a>` : ''}</div>`;
}

// ---------------------------------------------------------------------------
// Sync-Chip und Systemzustand
// ---------------------------------------------------------------------------
function systemHealth() {
  const items = [];
  const fr = freshness(state.raw?.generated_at);
  if (state.loadError) items.push({ level: 'crit', title: 'Aufgabendaten nicht ladbar', detail: state.loadError });
  else items.push({ level: fr.level === 'frisch' ? 'ok' : fr.level === 'alt' ? 'warn' : 'crit', title: `Aufgabendaten aus GitHub Issues · Stand ${fmtDateTime(state.raw?.generated_at)} (${fr.text})`, detail: state.capabilities.mode === 'local' ? 'Lokaler Modus: „Jetzt synchronisieren" holt frische Daten über gh.' : 'Stand = letzter Commit von issues.json. Der Sync-Workflow committet nur bei Änderungen; ein alter Stand kann auch „nichts passiert" heißen – siehe nächste Zeile.' });
  const wr = state.workflowRun;
  if (state.capabilities.mode !== 'local') {
    if (!wr) items.push({ level: 'warn', title: 'Sync-Workflow: Status wird geladen', detail: '' });
    else if (wr.unavailable) items.push({ level: 'warn', title: 'Sync-Workflow: Status nicht abrufbar', detail: 'GitHub-API ohne Token nicht erreichbar (privates Repo oder Rate-Limit). Der Datenstand oben bleibt maßgeblich.' });
    else items.push({ level: wr.conclusion === 'success' ? 'ok' : wr.status !== 'completed' ? 'warn' : 'crit', title: `Sync-Workflow „dashboard-data": ${wr.status === 'completed' ? (wr.conclusion === 'success' ? 'erfolgreich' : `fehlgeschlagen (${wr.conclusion})`) : wr.status} · ${ago(wr.at)}`, detail: wr.conclusion === 'success' ? 'Läuft bei jedem Issue-Event und stündlich.' : 'Letzter Lauf ohne Erfolg – Daten können veraltet sein.', link: wr.url });
  }
  const cap = state.capabilities;
  items.push(cap.mode === 'local'
    ? { level: 'ok', title: `Lokaler Aktionsmodus aktiv${cap.user ? ` · angemeldet als @${cap.user}` : ''}`, detail: 'Statuswechsel, Zuweisung und Kommentare laufen über gh unter diesem Konto und sind auf GitHub auditierbar.' }
    : { level: 'warn', title: 'Read-only (statischer Modus)', detail: 'Aktionen führen zu GitHub. Für Aktionen im Control Center lokal `npm run dashboard` starten.' });
  const missing = ['status:triage', 'status:bereit', 'status:freigabe', 'status:beobachten', 'status:abgebrochen'].filter(l => !(state.raw?.sync?.labelsAvailable || []).includes(l));
  if (state.raw?.sync?.labelsAvailable) items.push(missing.length
    ? { level: 'warn', title: `${missing.length} Status-Labels fehlen im Repository`, detail: `${missing.join(', ')} – bis zur Anlage gilt die Übergangsregel (Freigabe = blockiert + reviewer:mensch). Anlage: setup-dashboard.sh (Freigabe nötig).` }
    : { level: 'ok', title: 'Alle Status-Labels vorhanden', detail: '' });
  if (cap.agentRuns) {
    const ar = state.agentRuns;
    if (!ar || ar.error) items.push({ level: 'warn', title: 'KI-Läufe: Steuerzentrale nicht lesbar', detail: ar?.error || '' });
    else {
      const failed = (ar.runs || []).filter(r => r.state === 'ERROR').length;
      items.push({ level: failed ? 'warn' : 'ok', title: `KI-Läufe: ${plural((ar.runs || []).length, 'Lauf', 'Läufe')} bekannt${failed ? `, ${failed} mit Fehler` : ''}`, detail: ar.usage ? `Ledger: ${ar.usage.requests} Provider-Aufrufe, ${ar.usage.costUsd.toFixed(2)} USD` : '' });
    }
  } else items.push({ level: 'warn', title: 'KI-Läufe nur lokal sichtbar', detail: 'Die Steuerzentrale speichert Läufe außerhalb des Repos; statisch ist nur der Issue-Status sichtbar.' });
  items.push({ level: 'warn', title: 'Keine Kennzahlen aus Shopify, Google Ads oder GA4 verbunden', detail: 'Bewusst: das Repository ist öffentlich. Anbindung erst nach Sichtbarkeitsentscheidung (docs/control-center/BESTANDSAUFNAHME.md, Punkt 4).' });
  return items;
}

function renderSyncChip() {
  const chip = $('#syncChip'); const txt = $('#syncChipText');
  const fr = freshness(state.raw?.generated_at);
  chip.className = `sync-chip ${state.loadError ? 'fehler' : fr.level}`;
  txt.textContent = state.loadError ? 'Daten fehlen' : `Stand ${fr.text}${state.capabilities.mode === 'local' ? ' · lokal' : ''}`;
  chip.title = state.loadError ? state.loadError : `GitHub Issues · ${fmtDateTime(state.raw?.generated_at)} · ${state.raw?.count ?? 0} Aufgaben`;
}

// ---------------------------------------------------------------------------
// Ansicht: Heute
// ---------------------------------------------------------------------------
function viewHeute() {
  const tasks = state.tasks; const s = summarize(tasks);
  const att = attentionList(tasks, { limit: 5 });
  const waiting = tasks.filter(t => t.open && (t.status === 'freigabe' || (t.status === 'review' && (!t.reviewer || t.reviewer === 'mensch')) || (t.status === 'eingang' && t.triage.length && t.ageDays <= 14))).sort((a, b) => a.priorityRank - b.priorityRank).slice(0, 6);
  const blocked = tasks.filter(t => t.status === 'blockiert');
  const running = tasks.filter(t => ['in-arbeit', 'korrektur'].includes(t.status));
  const week = { done: tasks.filter(t => t.closedAt && (Date.now() - new Date(t.closedAt)) < 7 * 864e5), fresh: tasks.filter(t => t.open && t.ageDays !== null && t.ageDays < 7), overdue: tasks.filter(t => t.overdue) };
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const health = systemHealth();
  const worst = health.some(h => h.level === 'crit') ? 'crit' : health.some(h => h.level === 'warn') ? 'warn' : 'ok';

  const bandItem = (n, label, cls, href) => `<a href="${href}" class="${n === 0 ? 'zero' : cls}"><span class="n">${n}</span><span class="l">${esc(label)}</span></a>`;
  return `
    <div class="page-head"><div><h1>Heute</h1><p class="sub">${esc(today)} · ${plural(s.open, 'offene Aufgabe', 'offene Aufgaben')} · Datenstand ${esc(freshness(state.raw?.generated_at).text)}</p></div>
      <div style="display:flex;gap:8px">${state.capabilities.sync ? '<button class="btn" data-action="sync">Jetzt synchronisieren</button>' : ''}<a class="btn" href="${newIssueUrl({ template: 'feature.yml' })}" target="_blank" rel="noopener">Neue Aufgabe ↗</a></div></div>
    <div class="band">
      ${bandItem(s.critical, 'kritisch (P0)', 'crit', '#/arbeit?prio=p0')}
      ${bandItem(s.blocked, 'blockiert', 'crit', '#/arbeit?view=blockiert')}
      ${bandItem(s.approvals, 'warten auf Freigabe', 'warn', '#/freigaben')}
      ${bandItem(s.dueToday, 'heute fällig / überfällig', 'warn', '#/arbeit?view=heute')}
      ${bandItem(s.triage, 'Triage nötig', 'info', '#/arbeit?view=triage')}
      ${bandItem(s.doneThisWeek, 'diese Woche erledigt', 'ok', '#/arbeit?status=fertig')}
    </div>

    <section class="card">
      <div class="card-head"><h2>Braucht jetzt Aufmerksamkeit</h2><a class="more" href="#/arbeit?sort=dringlichkeit">Alle nach Dringlichkeit</a></div>
      ${att.length ? `<div class="att">${att.map((x, i) => attentionItem(x, i)).join('')}</div>` : emptyState('Nichts drängt.', 'Keine P0, keine Blocker, keine offenen Freigaben – gute Zeit, die nächste wichtige Arbeit zu planen.', { href: '#/arbeit?status=geplant', text: 'Geplante Aufgaben ansehen' })}
    </section>

    <div class="grid grid-2 section">
      <section class="card">
        <div class="card-head"><h2>Wartet auf dich</h2><span class="more muted">Freigaben, Reviews, Triage</span></div>
        ${waiting.length ? `<div class="rows">${waiting.map(t => taskRow(t)).join('')}</div>` : emptyState('Keine Freigaben offen.', 'Plane die nächste wichtige Arbeit.', { href: '#/arbeit?status=geplant', text: 'Geplant' })}
      </section>
      <section class="card">
        <div class="card-head"><h2>Blockiert</h2><a class="more" href="#/arbeit?view=blockiert">${blocked.length} gesamt</a></div>
        ${blocked.length ? `<div class="rows">${blocked.slice(0, 5).map(t => blockedRow(t)).join('')}</div>` : emptyState('Nichts blockiert.', 'Alle offenen Aufgaben können bearbeitet werden.')}
      </section>
      <section class="card">
        <div class="card-head"><h2>Läuft gerade</h2><a class="more" href="#/arbeit?status=in-arbeit">${running.length} in Arbeit</a></div>
        ${runningBlock(running)}
      </section>
      <section class="card">
        <div class="card-head"><h2>Diese Woche</h2></div>
        <div class="band" style="margin:0 0 10px">
          ${bandItem(week.done.length, 'erledigt', 'ok', '#/arbeit?status=fertig')}
          ${bandItem(week.fresh.length, 'neu hinzugekommen', 'info', '#/arbeit?sort=aktualisiert')}
          ${bandItem(week.overdue.length, 'überfällig', 'crit', '#/arbeit?view=heute')}
        </div>
        ${week.done.length ? `<ul class="small muted" style="margin:0;padding-left:18px">${week.done.slice(0, 5).map(t => `<li>${esc(t.id)} ${taskLink(t)}</li>`).join('')}</ul>` : '<p class="small muted">Noch nichts erledigt in den letzten 7 Tagen.</p>'}
      </section>
    </div>

    <section class="card section">
      <div class="card-head"><h2>Systemgesundheit <span class="badge level-${worst === 'crit' ? 'kritisch' : worst === 'warn' ? 'achtung' : 'ok'}">${worst === 'crit' ? 'Störung' : worst === 'warn' ? 'Hinweise' : 'in Ordnung'}</span></h2><a class="more" href="#/insights">Details</a></div>
      <div class="health">${health.slice(0, 4).map(healthRow).join('')}</div>
    </section>`;
}

function attentionItem({ task: t, reasons }, i) {
  const primary = primaryAction(t);
  return `<article class="att-item">
    <div class="rank">${i + 1}</div>
    <div>
      <div class="title">${prioBadge(t)} ${taskLink(t)}</div>
      <div class="why">${reasons.map((r, k) => k === 0 ? `<b>${esc(r)}</b>` : esc(r)).join(' · ')}</div>
      <div class="meta"><span>${statusBadge(t)}</span><span>${t.owner ? `Owner @${esc(t.owner)}` : ownerText(t)}</span>${t.executor ? `<span>Ausführung ${execBadge(t)}</span>` : ''}<span>${t.due ? dueText(t) : `Alter ${plural(t.ageDays ?? 0, 'Tag', 'Tage')}`}</span></div>
      ${t.nextStep ? `<div class="next">${esc(t.nextStep)}</div>` : `<div class="next" style="color:var(--warn)">Nächster Schritt fehlt – in der Aufgabe festlegen</div>`}
    </div>
    <div class="actions"><button class="btn btn-sm btn-primary" data-open="${t.number}" data-primary="1">${esc(primary.label)}</button></div>
  </article>`;
}

function blockedRow(t) {
  return `<div class="row" data-open="${t.number}" tabindex="0" role="button">
    <div><div class="t">${prioBadge(t)} ${esc(t.title)}</div>
      <div class="m"><span style="color:var(--crit)">${esc(t.blocker || 'Grund fehlt – bitte im Issue nachtragen')}</span></div>
      <div class="m"><span>${since(t.updatedAt)}</span><span>${t.owner ? `Owner @${esc(t.owner)}` : ownerText(t)}</span>${t.dependencies.length ? `<span>hängt an ${esc(t.dependencies.join(', '))}</span>` : ''}</div></div>
    <div class="r"><button class="btn btn-sm" data-open="${t.number}" data-primary="1">Eskalieren / lösen</button></div>
  </div>`;
}

function runningBlock(running) {
  const runs = state.agentRuns?.runs || [];
  const active = runs.filter(r => ['QUEUED', 'WORKING', 'REVIEWING', 'RUNNING'].includes(r.state));
  let html = '';
  if (active.length) html += `<div class="rows">${active.map(r => `<div class="row"><div><div class="t"><span class="badge ki">KI</span> ${esc(r.task)}</div><div class="m"><span>${esc(r.state)}</span>${r.progress?.phase ? `<span>${esc(r.progress.phase)}</span>` : ''}${r.issue ? `<span><a href="#" data-open="${r.issue.number}">#${r.issue.number}</a></span>` : ''}<span>${since(r.startedAt)}</span></div></div></div>`).join('')}</div>`;
  if (running.length) html += `<div class="rows" style="margin-top:${active.length ? 8 : 0}px">${running.slice(0, 6).map(t => taskRow(t)).join('')}</div>`;
  if (!html) html = emptyState('Nichts in Arbeit.', 'Nächste Aufgabe aus „Bereit" oder „Geplant" starten.', { href: '#/arbeit?status=geplant', text: 'Geplant' });
  if (!state.capabilities.agentRuns) html += `<p class="small muted" style="margin-top:8px">KI-Läufe der Steuerzentrale sind nur im lokalen Modus sichtbar.</p>`;
  return html;
}

function healthRow(h) {
  return `<div class="health-row ${h.level}"><span class="dot" aria-hidden="true"></span><div><div>${esc(h.title)}</div>${h.detail ? `<div class="d">${esc(h.detail)}</div>` : ''}</div>${h.link ? `<a class="small" href="${esc(h.link)}" target="_blank" rel="noopener">Lauf ↗</a>` : ''}</div>`;
}

// ---------------------------------------------------------------------------
// Ansicht: Arbeit (Liste + Kanban)
// ---------------------------------------------------------------------------
function filteredTasks() {
  const p = state.route.params;
  const view = SAVED_VIEWS.find(v => v.key === (p.get('view') || 'alle')) || SAVED_VIEWS[0];
  let list = state.tasks.filter(t => view.filter(t, { me: state.me }));
  if (p.get('status')) list = state.tasks.filter(t => t.status === p.get('status') || (p.get('status') === 'in-arbeit' && t.status === 'korrektur'));
  if (p.get('prio')) list = list.filter(t => t.priority === p.get('prio'));
  if (p.get('owner')) list = list.filter(t => (p.get('owner') === '-' ? !t.owner : t.owner === p.get('owner')));
  if (p.get('exec')) list = list.filter(t => p.get('exec') === 'ki' ? t.executorKind === 'ki' : p.get('exec') === 'mensch' ? t.executorKind === 'mensch' : !t.executor);
  if (p.get('area')) list = list.filter(t => t.areaGroup === p.get('area') || t.area === p.get('area'));
  if (p.get('type')) list = list.filter(t => t.type === p.get('type'));
  if (p.get('q')) list = list.filter(t => matchesQuery(t, p.get('q')));
  const sort = SORTS[p.get('sort') || 'dringlichkeit'] || SORTS.dringlichkeit;
  return list.slice().sort((a, b) => sort.compare(a, b, { scores: state.scores }));
}

function setParam(key, value) {
  const p = new URLSearchParams(state.route.params);
  if (value === '' || value === null) p.delete(key); else p.set(key, value);
  if (key !== 'view' && key !== 'task' && p.get('view') && ['status'].includes(key)) p.delete('view');
  location.hash = `#/${state.route.view}?${p}`;
}

function viewArbeit() {
  const p = state.route.params; const mode = p.get('mode') || 'liste';
  const list = filteredTasks();
  const owners = [...new Set(state.tasks.map(t => t.owner).filter(Boolean))].sort();
  const counts = Object.fromEntries(SAVED_VIEWS.map(v => [v.key, state.tasks.filter(t => v.filter(t, { me: state.me })).length]));
  const sel = (name, opts, cur, first) => `<select data-param="${name}" aria-label="${esc(first)}"><option value="">${esc(first)}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const unassigned = state.tasks.filter(t => SAVED_VIEWS.find(v => v.key === 'unzugeordnet').filter(t, {})).length;
  return `
    <div class="page-head"><div><h1>Arbeit</h1><p class="sub">${plural(list.length, 'Aufgabe', 'Aufgaben')} in dieser Ansicht · Quelle GitHub Issues</p></div>
      <div class="seg" role="group" aria-label="Darstellung"><button data-param="mode" data-value="liste" aria-pressed="${mode === 'liste'}">Liste</button><button data-param="mode" data-value="kanban" aria-pressed="${mode === 'kanban'}">Kanban</button></div></div>
    ${unassigned && !p.get('view') ? `<div class="notice warn" style="margin-bottom:12px">${plural(unassigned, 'aktive Aufgabe', 'aktive Aufgaben')} ohne Owner. <a href="#/arbeit?view=unzugeordnet">Jetzt zuordnen</a></div>` : ''}
    <div class="chips" role="group" aria-label="Gespeicherte Ansichten">${SAVED_VIEWS.filter(v => v.key !== 'meine' || state.me).map(v => `<button class="chip" data-param="view" data-value="${v.key === 'alle' ? '' : v.key}" aria-pressed="${(p.get('view') || 'alle') === v.key && !p.get('status')}">${esc(v.label)}<span class="c">${counts[v.key]}</span></button>`).join('')}</div>
    <div class="toolbar">
      <input type="search" placeholder="Suchen (Titel, #Nr, Label, Owner) …" value="${esc(p.get('q') || '')}" data-param="q" aria-label="Suche">
      ${sel('status', STATUSES.filter(s => !s.legacy).map(s => [s.key, s.label]), p.get('status'), 'Status')}
      ${sel('prio', Object.values(PRIORITIES).map(x => [x.key, x.label]), p.get('prio'), 'Priorität')}
      ${sel('owner', [['-', 'ohne Owner'], ...owners.map(o => [o, `@${o}`])], p.get('owner'), 'Owner')}
      ${sel('exec', [['ki', 'KI-Agent'], ['mensch', 'Mensch'], ['-', 'nicht gesetzt']], p.get('exec'), 'Ausführung')}
      ${sel('area', AREAS.map(a => [a.key, a.label]), p.get('area'), 'Bereich')}
      ${sel('sort', Object.entries(SORTS).map(([k, v]) => [k, v.label]), p.get('sort') || 'dringlichkeit', 'Sortierung')}
      ${[...p.keys()].some(k => !['mode', 'task'].includes(k)) ? '<button class="btn btn-ghost btn-sm" data-action="clear-filters">Filter zurücksetzen</button>' : ''}
    </div>
    ${mode === 'kanban' ? kanban(list) : tableView(list)}`;
}

function tableView(list) {
  if (!list.length) return emptyState('Keine Aufgaben in dieser Ansicht.', 'Filter anpassen oder eine neue Aufgabe anlegen.', { href: newIssueUrl({ template: 'feature.yml' }), text: 'Neue Aufgabe ↗' });
  return `<div class="table-wrap"><table class="tasks"><thead><tr>
    <th>Aufgabe</th><th>Bereich</th><th>Status</th><th>Prio</th><th>Owner</th><th>Ausführung</th><th>Nächster Schritt</th><th>Fällig</th><th>Blocker / Lücken</th><th>Update</th></tr></thead>
    <tbody>${list.map((t, i) => `<tr class="task-row ${i === state.selectedRow ? 'selected' : ''}" data-open="${t.number}" tabindex="0">
      <td class="t"><span class="id">${esc(t.id)}</span> <a href="#" data-open="${t.number}">${esc(t.title)}</a></td>
      <td>${esc(t.area || '–')}</td><td>${statusBadge(t)}</td><td>${prioBadge(t)}</td>
      <td>${ownerText(t)}</td><td>${execBadge(t) || '<span class="muted">–</span>'}</td>
      <td class="next">${esc(t.nextStep || '–')}</td>
      <td class="nowrap ${t.overdue ? 'warnc' : ''}">${t.due ? fmtDate(t.due) : '–'}</td>
      <td>${t.blocker && ['blockiert', 'freigabe'].includes(t.status) ? `<span class="warnc">${esc(t.blocker)}</span>` : ''}${t.triage.length ? `<div class="gapc">${esc(t.triage.join(' · '))}</div>` : ''}</td>
      <td class="nowrap muted">${ago(t.updatedAt)}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted" style="margin-top:8px">Tastatur: <kbd>j</kbd>/<kbd>k</kbd> bewegen, <kbd>Enter</kbd> öffnen, <kbd>Esc</kbd> schließen.</p>`;
}

function kanban(list) {
  const canDrag = state.capabilities.actions === true;
  return `<div class="kanban">${COLUMNS.map(col => {
    const items = list.filter(t => t.column === col.key);
    return `<section class="kcol" data-col="${col.key}" aria-label="${esc(col.label)}">
      <div class="kcol-head"><span>${esc(col.label)}</span><span class="c">${items.length}</span></div>
      ${items.map(t => `<article class="kcard" draggable="${canDrag}" data-open="${t.number}" data-drag="${t.number}" tabindex="0">
        <div class="t"><a href="#" data-open="${t.number}">${esc(t.title)}</a></div>
        <div class="m">${prioBadge(t)}${t.type ? `<span class="badge plain">${esc(t.type)}</span>` : ''}${t.status === 'korrektur' ? '<span class="badge status korrektur">Korrektur</span>' : ''}${execBadge(t)}</div>
        ${t.blocker && ['blockiert', 'freigabe'].includes(t.status) ? `<div class="blk">${esc(t.blocker)}</div>` : ''}
        <div class="foot"><span>${ownerText(t)}</span>${t.due ? `<span>${dueText(t)}</span>` : ''}<span>${ago(t.updatedAt)}</span>${t.triage.length ? `<span class="badge gap">${t.triage.length} Lücken</span>` : ''}</div>
      </article>`).join('') || '<p class="small muted" style="padding:6px">leer</p>'}
    </section>`;
  }).join('')}</div>
  <p class="small muted" style="margin-top:8px">${canDrag ? 'Karten ziehen löst einen protokollierten Statuswechsel mit Pflichtangaben aus.' : 'Statuswechsel per Ziehen sind nur im lokalen Modus (npm run dashboard) möglich; hier führt jede Karte zum Issue.'}</p>`;
}

// ---------------------------------------------------------------------------
// Ansicht: Freigaben
// ---------------------------------------------------------------------------
function viewFreigaben() {
  const open = state.tasks.filter(t => t.open && (t.status === 'freigabe' || (t.isDecision && t.open))).sort((a, b) => a.priorityRank - b.priorityRank);
  const reviews = state.tasks.filter(t => t.status === 'review');
  const history = state.tasks.filter(t => !t.open && (t.isDecision || t.labels.includes('reviewer:mensch'))).sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || '')).slice(0, 15);
  return `
    <div class="page-head"><div><h1>Freigaben</h1><p class="sub">Entscheidungen, Reviews und wartende KI-Aktionen – jede mit Empfehlung und klarer Aktion</p></div>
      <a class="btn" href="${newIssueUrl({ template: 'entscheidung.yml' })}" target="_blank" rel="noopener">Entscheidung anlegen ↗</a></div>
    <section class="card"><div class="card-head"><h2>Offen (${open.length})</h2></div>
      ${open.length ? `<div class="grid grid-2">${open.map(decisionCard).join('')}</div>` : emptyState('Keine Freigaben offen.', 'Wenn eine Entscheidung ansteht, lege sie mit Frage, Optionen und Empfehlung an.', { href: newIssueUrl({ template: 'entscheidung.yml' }), text: 'Entscheidung anlegen ↗' })}
    </section>
    <section class="card section"><div class="card-head"><h2>Review-Queue (${reviews.length})</h2><a class="more" href="#/arbeit?view=review">Als Liste</a></div>
      ${reviews.length ? `<div class="rows">${reviews.map(t => taskRow(t)).join('')}</div>` : emptyState('Kein Review offen.', '')}
    </section>
    <section class="card section"><div class="card-head"><h2>Verlauf</h2><span class="more muted">abgeschlossene Entscheidungen</span></div>
      ${history.length ? `<div class="rows">${history.map(t => `<div class="row" data-open="${t.number}" tabindex="0" role="button"><div><div class="t">${esc(t.title)}</div><div class="m"><span>${statusBadge(t)}</span><span>${t.decision?.outcome ? `Ergebnis: ${esc(t.decision.outcome)}` : 'Ergebnis im Issue-Verlauf'}</span><span>${fmtDate(t.closedAt)}</span></div></div></div>`).join('')}</div>` : '<p class="small muted">Noch keine abgeschlossenen Entscheidungen. Der vollständige Verlauf jeder Entscheidung liegt unveränderbar im GitHub-Issue.</p>'}
    </section>`;
}

function decisionCard(t) {
  const d = t.decision || {};
  const decider = d.decider || t.owner || null;
  return `<article class="card" style="box-shadow:none">
    <div class="card-head"><h3>${prioBadge(t)} ${taskLink(t)}</h3>${t.due ? `<span class="small ${t.overdue ? 'warnc' : 'muted'}">Frist ${fmtDate(t.due)}</span>` : ''}</div>
    <p style="font-weight:600;margin-bottom:6px">${esc(d.question || t.blocker || t.nextStep || 'Freigabe erforderlich – Frage im Issue nachtragen')}</p>
    ${d.options?.length ? `<ol style="margin:0 0 8px;padding-left:18px;font-size:.9rem">${d.options.map(o => `<li>${esc(o)}</li>`).join('')}</ol>` : '<p class="small muted" style="margin-bottom:6px">Keine Optionen hinterlegt – Entscheidungsvorlage unvollständig.</p>'}
    ${d.recommendation ? `<div class="notice" style="margin-bottom:8px"><b>Empfehlung:</b> ${esc(d.recommendation)}</div>` : ''}
    ${t.risk ? `<p class="small muted">Risiko: ${esc(t.risk)}</p>` : ''}
    <div class="m small muted" style="display:flex;gap:12px;flex-wrap:wrap;margin:8px 0"><span>Entscheider:in ${decider ? `<b>${esc(decider)}</b>` : '<span class="badge gap">fehlt</span>'}</span><span>${statusBadge(t)}</span><span>wartet ${since(t.updatedAt)}</span></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-sm btn-primary" data-decide="approve" data-task="${t.number}">Freigeben</button>
      <button class="btn btn-sm" data-decide="reject" data-task="${t.number}">Ablehnen</button>
      <button class="btn btn-sm" data-decide="question" data-task="${t.number}">Rückfrage</button>
      <button class="btn btn-sm" data-decide="delegate" data-task="${t.number}">Delegieren</button>
      <button class="btn btn-sm btn-ghost" data-decide="later" data-task="${t.number}">Später</button>
    </div>
  </article>`;
}

// ---------------------------------------------------------------------------
// Ansicht: Bereiche
// ---------------------------------------------------------------------------
function viewBereiche() {
  const health = areaHealth(state.tasks);
  return `
    <div class="page-head"><div><h1>Bereiche & Projekte</h1><p class="sub">Zustand je Bereich mit Begründung – abgeleitet aus den Aufgaben, keine geschätzten Kennzahlen</p></div></div>
    <div class="grid grid-3">${health.map(a => `<article class="card area-card">
      <div class="card-head"><h2>${esc(a.label)}</h2><span class="badge level-${a.level}">${a.level === 'ok' ? 'stabil' : a.level === 'achtung' ? 'Achtung' : 'kritisch'}</span></div>
      <div class="reasons">${esc(a.reasons.join(' · '))}</div>
      <div class="stats"><span><b>${a.open}</b> offen</span><span><b>${a.inProgress}</b> in Arbeit</span><span><b>${a.blocked}</b> blockiert</span><span><b>${a.approvals}</b> Freigabe</span></div>
      <div class="small muted">Owner: ${a.owners.length ? a.owners.map(o => `@${esc(o)}`).join(', ') : '<span class="badge gap">niemand zugeordnet</span>'}</div>
      ${a.top.length ? `<ul>${a.top.map(t => `<li>${prioBadge(t)} ${taskLink(t)}</li>`).join('')}</ul>` : ''}
      <div><a class="small" href="#/arbeit?area=${a.key}">Alle Aufgaben im Bereich →</a></div>
    </article>`).join('')}</div>
    <p class="small muted section">Projekte: Zusammengehörige Aufgaben tragen heute ein Präfix im Titel (z. B. „[Google Ads] Phase 5.x", „[SHP-0xx]"). Ein eigenes Projekt-Objekt wird erst angelegt, wenn Meilensteine und Zieltermine gepflegt werden – siehe docs/control-center/ARCHITEKTUR.md.</p>
    ${projectGroups()}`;
}

function projectGroups() {
  const groups = new Map();
  for (const t of state.tasks) {
    const m = t.title.match(/^\[([^\]]+)\]/);
    const key = m ? m[1].replace(/\s+\d.*$/, '').replace(/^SHP.*$/, 'SHP (Shop-Backlog)') : null;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  if (!groups.size) return '';
  return `<div class="grid grid-2 section">${[...groups.entries()].map(([k, ts]) => {
    const open = ts.filter(t => t.open); const done = ts.length - open.length; const pct = ts.length ? Math.round(done / ts.length * 100) : 0;
    const next = open.slice().sort((a, b) => a.priorityRank - b.priorityRank)[0];
    return `<article class="card"><div class="card-head"><h2>${esc(k)}</h2><span class="small muted">${done}/${ts.length} erledigt</span></div>
      <div class="bar" style="grid-template-columns:1fr 40px"><div class="track"><div class="fill" style="width:${pct}%"></div></div><span class="small">${pct}%</span></div>
      <div class="small muted" style="margin-top:8px">Fortschritt = erledigte Aufgaben, keine Aufwandsgewichtung.</div>
      ${next ? `<div class="small" style="margin-top:8px">Nächste: ${prioBadge(next)} ${taskLink(next)}</div>` : ''}
      <div class="small muted" style="margin-top:4px">${open.filter(t => t.status === 'blockiert').length} blockiert · ${open.filter(t => t.status === 'freigabe').length} Freigabe · <a href="#/arbeit?q=${encodeURIComponent('[' + k.split(' (')[0])}">Aufgaben</a></div>
    </article>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Ansicht: Insights
// ---------------------------------------------------------------------------
function viewInsights() {
  const open = state.tasks.filter(t => t.open);
  const byStatus = STATUSES.filter(s => s.open).map(s => [s.label, open.filter(t => t.status === s.key).length]).filter(x => x[1]);
  const byPrio = Object.values(PRIORITIES).map(p => [p.label, open.filter(t => t.priority === p.key).length]);
  byPrio.push(['ohne Priorität', open.filter(t => !t.priority).length]);
  const bars = rows => { const max = Math.max(1, ...rows.map(r => r[1])); return `<div class="bars">${rows.map(([l, n]) => `<div class="bar"><span>${esc(l)}</span><div class="track"><div class="fill" style="width:${Math.round(n / max * 100)}%"></div></div><span class="mono small">${n}</span></div>`).join('')}</div>`; };
  const warnings = [];
  for (const t of open) {
    if (['p0', 'p1'].includes(t.priority) && t.status === 'blockiert' && (t.daysSinceUpdate ?? 0) >= 3) warnings.push({ t, text: `${PRIORITIES[t.priority].short} seit ${t.daysSinceUpdate} Tagen blockiert` });
    if (t.status === 'freigabe' && (t.daysSinceUpdate ?? 0) >= 3) warnings.push({ t, text: `Freigabe wartet seit ${t.daysSinceUpdate} Tagen` });
    if (t.overdue) warnings.push({ t, text: `überfällig seit ${fmtDate(t.due)}` });
    if (['in-arbeit', 'korrektur'].includes(t.status) && (t.daysSinceUpdate ?? 0) >= 7) warnings.push({ t, text: `in Arbeit ohne Update seit ${t.daysSinceUpdate} Tagen` });
  }
  return `
    <div class="page-head"><div><h1>Insights</h1><p class="sub">Systemzustand und Verteilung der Arbeit. Jede Zahl mit Quelle und Datenstand.</p></div></div>
    <div class="grid grid-2">
      <section class="card span-2"><div class="card-head"><h2>Systemzustand</h2><span class="more muted">Stand ${fmtDateTime(new Date().toISOString())}</span></div><div class="health">${systemHealth().map(healthRow).join('')}</div></section>
      <section class="card"><div class="card-head"><h2>Warnungen</h2><span class="more muted">aus Aufgabenzustand abgeleitet</span></div>
        ${warnings.length ? `<div class="rows">${warnings.map(w => `<div class="row" data-open="${w.t.number}" tabindex="0" role="button"><div><div class="t">${prioBadge(w.t)} ${esc(w.t.title)}</div><div class="m"><span class="warnc" style="color:var(--crit)">${esc(w.text)}</span></div></div></div>`).join('')}</div>` : emptyState('Keine Warnungen.', 'Keine lange blockierten P0/P1, keine überfälligen Aufgaben.')}
      </section>
      <section class="card"><div class="card-head"><h2>Offene Arbeit nach Status</h2><span class="more muted">Quelle: GitHub Issues · ${fmtDateTime(state.raw?.generated_at)}</span></div>${bars(byStatus)}
        <div class="card-head" style="margin-top:16px"><h2>Nach Priorität</h2></div>${bars(byPrio)}</section>
      <section class="card span-2"><div class="card-head"><h2>Kennzahlen aus Shop, Ads und Analytics</h2></div>
        ${emptyState('Noch nicht verbunden – absichtlich.', 'Das Repository ist öffentlich; Umsätze, Ausgaben und Conversion-Daten dürfen nicht in docs/ landen. Sobald Sichtbarkeit und Lese-Zugänge entschieden sind, kommen die Integrationen in dieser Reihenfolge: GitHub (fertig), Shopify (read-only), Google Ads, GA4/Search Console. Bis dahin werden hier keine Demo-Zahlen gezeigt.')}
      </section>
    </div>`;
}

// ---------------------------------------------------------------------------
// Ansicht: Aktivitaet
// ---------------------------------------------------------------------------
let activityCache = null;
async function loadActivity() {
  if (!state.capabilities.activity) return null;
  try { const r = await fetch('/api/activity', { cache: 'no-store' }); return r.ok ? await r.json() : { error: `HTTP ${r.status}` }; } catch (e) { return { error: e.message }; }
}

function viewAktivitaet() {
  const q = (state.route.params.get('q') || '').toLowerCase();
  const local = activityCache && !activityCache.error ? activityCache.events : null;
  let events;
  if (local) {
    events = local.map(e => ({ at: e.at, who: e.actor, kind: e.type, text: e.text, number: e.number, title: e.title }));
  } else {
    events = [];
    for (const t of state.tasks) {
      events.push({ at: t.createdAt, who: 'GitHub', kind: 'angelegt', text: t.title, number: t.number });
      if (t.closedAt) events.push({ at: t.closedAt, who: 'GitHub', kind: 'geschlossen', text: t.title, number: t.number });
      else if (t.updatedAt && t.updatedAt !== t.createdAt) events.push({ at: t.updatedAt, who: 'GitHub', kind: 'aktualisiert', text: `${t.title} · ${t.statusLabel}`, number: t.number });
    }
  }
  events = events.filter(e => !q || `${e.who} ${e.kind} ${e.text} #${e.number}`.toLowerCase().includes(q)).sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 150);
  return `
    <div class="page-head"><div><h1>Aktivität</h1><p class="sub">${local ? 'Issue-Events und Kommentare aus GitHub (lokal abgerufen)' : 'Statischer Modus: nur Anlage-, Änderungs- und Abschlusszeitpunkte aus issues.json. Kommentare und Label-Wechsel im Detail stehen auf GitHub.'}</p></div></div>
    <div class="toolbar"><input type="search" placeholder="Verlauf durchsuchen …" value="${esc(state.route.params.get('q') || '')}" data-param="q" aria-label="Verlauf durchsuchen"></div>
    ${activityCache?.error ? `<div class="notice warn" style="margin-bottom:12px">Verlauf konnte nicht geladen werden: ${esc(activityCache.error)}</div>` : ''}
    <section class="card"><ul class="activity">${events.map(e => `<li><span class="when">${fmtDateTime(e.at)}</span><div><span class="who">${esc(e.who)}</span> <span class="badge plain">${esc(e.kind)}</span> <a href="#" data-open="${e.number}">#${e.number}</a> <span class="body" style="display:inline">${esc(e.text)}</span></div></li>`).join('') || '<li class="muted">Keine Einträge.</li>'}</ul></section>`;
}

// ---------------------------------------------------------------------------
// Aufgaben-Detail (Sheet)
// ---------------------------------------------------------------------------
function primaryAction(t) {
  if (t.status === 'freigabe') return { key: 'approve', label: 'Freigabe erteilen' };
  if (t.status === 'blockiert') return { key: 'unblock', label: 'Blocker lösen' };
  if (t.status === 'review') return { key: 'fertig', label: 'Review abschließen' };
  if (['in-arbeit', 'korrektur'].includes(t.status)) return { key: 'review', label: 'Review anfordern' };
  if (['bereit', 'geplant', 'eingang', 'triage'].includes(t.status)) return t.owner ? { key: 'in-arbeit', label: 'Nächsten Schritt starten' } : { key: 'assign', label: 'Owner zuordnen' };
  if (!t.open) return { key: 'reopen', label: 'Wieder öffnen' };
  return { key: 'open', label: 'Aufgabe öffnen' };
}

async function renderSheet() {
  const root = $('#sheetRoot');
  const n = Number(state.route.params.get('task'));
  if (!n) { root.innerHTML = ''; document.body.style.overflow = ''; return; }
  const t = state.tasks.find(x => x.number === n);
  if (!t) { root.innerHTML = `<div class="sheet-backdrop" data-close-sheet></div><aside class="sheet" role="dialog" aria-modal="true"><div class="sheet-head"><h2>#${n}</h2><button class="btn btn-ghost" data-close-sheet aria-label="Schließen">✕</button></div><div class="sheet-body">${emptyState('Aufgabe nicht in den Daten.', 'Sie hat vielleicht kein relevantes Label oder der Datenstand ist älter.', { href: issueUrl(n), text: 'Auf GitHub öffnen ↗' })}</div></aside>`; return; }
  const local = state.capabilities.actions === true;
  const dependents = dependentsOf(t, state.tasks);
  const primary = primaryAction(t);
  const runs = (state.agentRuns?.runs || []).filter(r => r.issue?.number === t.number);
  const score = attentionScore(t, state.tasks);
  const detail = state.detailCache.get(n);
  const fact = (k, v, cls = '') => `<div class="fact"><dt>${esc(k)}</dt><dd class="${cls}">${v}</dd></div>`;
  root.innerHTML = `<div class="sheet-backdrop" data-close-sheet></div>
  <aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
    <div class="sheet-head"><div style="flex:1"><div class="small muted mono">${esc(t.id)} · Quelle GitHub Issue · <a href="${esc(t.url || issueUrl(n))}" target="_blank" rel="noopener">auf GitHub öffnen ↗</a></div><h2 id="sheetTitle">${esc(t.title)}</h2></div><button class="btn btn-ghost" data-close-sheet aria-label="Schließen (Esc)">✕</button></div>
    <div class="sheet-body">
      <div class="m" style="display:flex;gap:6px;flex-wrap:wrap">${statusBadge(t)}${prioBadge(t)}${t.type ? `<span class="badge plain">${esc(t.type)}</span>` : ''}${t.area ? `<span class="badge plain">${esc(t.area)} · ${esc(areaLabel(t.areaGroup))}</span>` : ''}${t.reviewer ? `<span class="badge plain">reviewer:${esc(t.reviewer)}</span>` : ''}</div>
      ${t.triage.length ? `<div class="notice warn"><b>Triage:</b> ${esc(t.triage.join(' · '))}</div>` : ''}
      ${t.statusConflicts.length ? `<div class="notice crit"><b>Status-Konflikt:</b> ${esc(t.statusConflicts.join(', '))} – auf GitHub bereinigen.</div>` : ''}
      <div class="primary-action"><span class="lbl">Wichtigste Aktion${score.reasons.length ? ` · ${esc(score.reasons.join(', '))}` : ''}</span>
        <button class="btn btn-primary" data-act="${primary.key}" data-task="${n}">${esc(primary.label)}</button>
        ${t.open && primary.key !== 'blockiert' ? `<button class="btn" data-act="blockiert" data-task="${n}">Blocker melden</button>` : ''}
        ${t.open && !['freigabe'].includes(t.status) ? `<button class="btn" data-act="freigabe" data-task="${n}">Freigabe anfordern</button>` : ''}
        <button class="btn" data-act="comment" data-task="${n}">Kommentar</button>
        ${t.open ? `<button class="btn btn-ghost" data-act="move" data-task="${n}">Status ändern …</button>` : ''}
        ${!local ? `<span class="small muted" style="flex-basis:100%">Read-only: Aktionen öffnen das Issue auf GitHub. Für Aktionen hier: lokal <span class="mono">npm run dashboard</span>.</span>` : ''}
      </div>
      <dl class="facts">
        ${fact('Owner (verantwortlich)', ownerText(t) + (t.ownerHint && !t.owner ? ` <span class="small muted">Hinweis im Body: ${esc(t.ownerHint)}</span>` : ''))}
        ${fact('Ausführung', execBadge(t) || '<span class="muted">nicht gesetzt</span>')}
        ${fact('Fälligkeit', t.due ? dueText(t) : '<span class="muted">keine Frist</span>', t.overdue ? 'warn' : '')}
        ${fact('Aufwand', esc(t.size || '–'))}
        ${fact('Risiko', esc(t.risk || '–'))}
        ${fact('Erstellt', fmtDate(t.createdAt))}
        ${fact('Aktualisiert', `${fmtDateTime(t.updatedAt)} (${ago(t.updatedAt)})`)}
        ${fact('Kommentare', String(state.raw?.issues.find(i => i.number === n)?.comments ?? '–'))}
      </dl>
      <div class="block"><h3>Nächster Schritt</h3>${t.nextStep ? `<div class="body">→ ${esc(t.nextStep)}</div>` : '<div class="notice warn">Fehlt. Im Issue unter „## Nächster Schritt" eintragen.</div>'}</div>
      ${t.blocker ? `<div class="block"><h3>Blocker</h3><div class="notice crit">${esc(t.blocker)}<div class="small" style="margin-top:4px">${since(t.updatedAt)} · nächste Aktion: ${esc(t.nextStep || 'im Issue festlegen')}</div></div></div>` : ''}
      ${t.decision ? `<div class="block"><h3>Entscheidung</h3><p><b>${esc(t.decision.question)}</b></p>${t.decision.options?.length ? `<ol style="margin:6px 0;padding-left:18px">${t.decision.options.map(o => `<li>${esc(o)}</li>`).join('')}</ol>` : ''}${t.decision.recommendation ? `<div class="notice">Empfehlung: ${esc(t.decision.recommendation)}</div>` : ''}${t.decision.impact ? `<p class="small muted" style="margin-top:6px">Auswirkungen: ${esc(t.decision.impact)}</p>` : ''}<p class="small muted" style="margin-top:6px">Entscheider:in ${esc(t.decision.decider || '–')} · Frist ${t.decision.deadline ? fmtDate(t.decision.deadline) : '–'}${t.decision.outcome ? ` · Ergebnis: ${esc(t.decision.outcome)}` : ''}</p></div>` : ''}
      <div class="block"><h3>Ziel / Warum</h3><div class="body">${esc(t.goal || (state.raw?.issues.find(i => i.number === n)?.fields?.description) || '–')}</div></div>
      <div class="block"><h3>Definition of Done / Akzeptanzkriterien</h3>${t.acceptance?.items?.length ? `<ul class="checklist">${t.acceptance.items.map(i => `<li class="${i.done ? 'done' : ''}"><span class="box" aria-hidden="true"></span><span>${esc(i.text)}</span></li>`).join('')}</ul><p class="small muted" style="margin-top:4px">${t.acceptance.done}/${t.acceptance.total} erfüllt${t.acceptance.source === 'checkliste' ? ' · Checkliste aus dem Body' : ''}</p>` : t.acceptance?.text ? `<div class="body">${esc(t.acceptance.text)}</div>` : '<div class="notice warn">Keine Akzeptanzkriterien – Erledigung braucht dann eine ausdrückliche Bestätigung.</div>'}</div>
      <div class="block"><h3>Abhängigkeiten</h3>
        ${t.dependencies.length ? `<p class="small">Hängt ab von: ${t.dependencies.map(d => d.startsWith('#') ? `<a href="#" data-open="${d.slice(1)}">${esc(d)}</a>` : `<a href="#/arbeit?q=${encodeURIComponent(d)}">${esc(d)}</a>`).join(', ')}</p>` : '<p class="small muted">Keine Abhängigkeiten angegeben.</p>'}
        ${dependents.length ? `<p class="small" style="margin-top:4px">Hält auf: ${dependents.map(d => `<a href="#" data-open="${d.number}">${esc(d.id)} ${esc(d.title)}</a>`).join(', ')}</p>` : ''}
      </div>
      <div class="block"><h3>KI-Arbeitsbereich</h3>
        ${runs.length ? `<div class="rows">${runs.map(r => `<div class="row" style="cursor:default"><div><div class="t"><span class="badge ki">${esc(r.provider || 'Steuerzentrale')}</span> ${esc(r.id)} · ${esc(r.state)}</div><div class="m"><span>${fmtDateTime(r.startedAt)} → ${r.finishedAt ? fmtDateTime(r.finishedAt) : 'läuft'}</span>${r.risk ? `<span>Risiko ${esc(r.risk)}</span>` : ''}${r.costUsd !== null && r.costUsd !== undefined ? `<span>${r.costUsd.toFixed(2)} USD</span>` : ''}${r.guard ? `<span>Guard ${esc(r.guard)}</span>` : ''}</div>${r.message ? `<div class="small muted">${esc(r.message)}</div>` : ''}${r.summary ? `<div class="small" style="white-space:pre-wrap;max-height:160px;overflow:auto;margin-top:4px">${esc(r.summary)}</div>` : ''}${r.findings ? `<div class="small muted">${r.findings} Review-Findings</div>` : ''}</div></div>`).join('')}</div>`
          : t.executorKind === 'ki' ? `<p class="small muted">Ausführung durch ${esc(t.executor)}. ${state.capabilities.agentRuns ? 'Kein Lauf der Steuerzentrale mit dieser Aufgabe verknüpft.' : 'Läufe der Steuerzentrale sind nur lokal sichtbar.'} Freigabestatus: ${t.status === 'freigabe' ? 'wartet auf Mensch' : t.status === 'review' ? 'Ergebnis im Review' : 'keine Freigabe offen'}.</p>` : '<p class="small muted">Kein KI-Agent zugeordnet. Ein Lauf wird über die Steuerzentrale mit dieser Issue-Nummer gestartet.</p>'}
      </div>
      <div class="block"><h3>Verlauf</h3>
        ${detail?.error ? `<div class="notice warn">${esc(detail.error)}</div>` : ''}
        ${detail?.events ? `<ul class="activity">${detail.events.map(e => `<li><span class="when">${fmtDateTime(e.at)}</span><div><span class="who">${esc(e.actor)}</span> <span class="badge plain">${esc(e.type)}</span> ${e.text ? `<div class="body">${esc(e.text)}</div>` : ''}</div></li>`).join('') || '<li class="muted small">Keine Ereignisse.</li>'}</ul>`
          : local ? '<p class="small muted">Verlauf wird geladen …</p>' : `<ul class="activity"><li><span class="when">${fmtDateTime(t.createdAt)}</span><div><span class="who">GitHub</span> angelegt</div></li>${t.updatedAt !== t.createdAt ? `<li><span class="when">${fmtDateTime(t.updatedAt)}</span><div><span class="who">GitHub</span> zuletzt geändert</div></li>` : ''}${t.closedAt ? `<li><span class="when">${fmtDateTime(t.closedAt)}</span><div><span class="who">GitHub</span> geschlossen</div></li>` : ''}</ul><p class="small muted">Kommentare und Label-Wechsel: <a href="${esc(t.url || issueUrl(n))}" target="_blank" rel="noopener">vollständiger Verlauf auf GitHub ↗</a></p>`}
      </div>
    </div>
  </aside>`;
  document.body.style.overflow = 'hidden';
  root.querySelector('[data-close-sheet].btn')?.focus();
  if (local && !detail) {
    try {
      const r = await fetch(`/api/tasks/${n}/activity`, { cache: 'no-store' });
      state.detailCache.set(n, r.ok ? await r.json() : { error: `Verlauf nicht ladbar (HTTP ${r.status})` });
    } catch (e) { state.detailCache.set(n, { error: e.message }); }
    if (Number(state.route.params.get('task')) === n) renderSheet();
  }
}

// ---------------------------------------------------------------------------
// Aktionen (Statuswechsel, Kommentar, Freigabe)
// ---------------------------------------------------------------------------
const DECISION_TEXT = {
  approve: { title: 'Freigabe erteilen', target: 'bereit', hint: 'Die Aufgabe geht auf „Bereit" zurück; Begründung wird als Kommentar protokolliert.', field: 'Begründung / gewählte Option' },
  reject: { title: 'Ablehnen', target: 'abgebrochen', hint: 'Die Aufgabe wird mit Begründung geschlossen.', field: 'Begründung' },
  question: { title: 'Rückfrage stellen', target: null, hint: 'Die Rückfrage wird als Kommentar hinterlegt; Status bleibt „Warten auf Freigabe".', field: 'Rückfrage' },
  delegate: { title: 'Delegieren', target: null, hint: 'Owner wird geändert; die Entscheidung bleibt offen.', field: 'Begründung', owner: true },
  later: { title: 'Später entscheiden', target: null, hint: 'Ein Hinweis mit neuem Termin wird als Kommentar hinterlegt.', field: 'Bis wann? Warum?' },
};

function openActionDialog(t, act, extra = {}) {
  const local = state.capabilities.actions === true;
  const url = t.url || issueUrl(t.number);
  if (!local) {
    // statisch: kein Dialog, direkt zum Issue - mit erklaerendem Hinweis
    window.open(url, '_blank', 'noopener');
    toast('Read-only: Aktion auf GitHub ausführen (Label/Assignee/Kommentar).');
    return;
  }
  let target = null; let title = ''; let hint = ''; let needOwner = false; let needText = null; let needConfirm = false; let commentOnly = false;
  if (act in DECISION_TEXT) { const d = DECISION_TEXT[act]; target = d.target; title = d.title; hint = d.hint; needText = d.field; needOwner = Boolean(d.owner); commentOnly = !d.target; }
  else if (act === 'assign') { title = 'Owner zuordnen'; hint = 'Der Owner ist fachlich verantwortlich (GitHub-Assignee).'; needOwner = true; commentOnly = true; }
  else if (act === 'comment') { title = 'Kommentar'; hint = 'Wird als Kommentar im Issue gespeichert.'; needText = 'Kommentar'; commentOnly = true; }
  else if (act === 'unblock') { target = t.owner ? 'in-arbeit' : 'bereit'; title = 'Blocker lösen'; hint = 'Wie wurde der Blocker gelöst? Der Text wird protokolliert.'; needText = 'Lösung / Ergebnis'; }
  else if (act === 'reopen') { target = 'geplant'; title = 'Wieder öffnen'; needText = 'Warum?'; }
  else if (act === 'move') { title = 'Status ändern'; target = extra.target || (TRANSITIONS[t.status] || [])[0]; }
  else { target = act; title = `Status → ${STATUS_BY_KEY[act]?.label || act}`; }
  if (target) {
    const req = requirementsFor(t, target, {});
    if (req.some(r => /Owner/.test(r))) needOwner = true;
    if (req.some(r => /Kommentar|Grund|Begründung|Freigabefrage/.test(r))) needText = needText || (target === 'blockiert' ? 'Blocker-Grund (wer/was, benötigte Aktion)' : target === 'freigabe' ? 'Freigabefrage (was soll entschieden werden?)' : target === 'review' ? 'Ergebnis / Checkliste' : 'Begründung');
    if (req.some(r => /Akzeptanzkriterien/.test(r))) needConfirm = true;
  }
  const targets = (TRANSITIONS[t.status] || []).filter(k => STATUS_BY_KEY[k]);
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlgTitle" data-dialog>
    <h2 id="dlgTitle">${esc(title)} · ${esc(t.id)}</h2>
    <p class="small muted">${esc(t.title)}${hint ? `<br>${esc(hint)}` : ''}</p>
    ${act === 'move' ? `<div class="field"><label for="dlgTarget">Zielstatus</label><select id="dlgTarget" name="target">${targets.map(k => `<option value="${k}" ${k === target ? 'selected' : ''}>${esc(STATUS_BY_KEY[k].label)}</option>`).join('')}</select><span class="hint">Nur vorgesehene Übergänge aus „${esc(t.statusLabel)}".</span></div>` : target ? `<input type="hidden" name="target" value="${esc(target)}">` : ''}
    ${needOwner ? `<div class="field"><label for="dlgOwner">Owner (GitHub-Login)</label><input id="dlgOwner" name="owner" value="${esc(t.owner || state.me || '')}" required placeholder="z. B. ahmet"><span class="hint">Pflicht für Bereit / In Arbeit. Ein KI-Agent ersetzt keinen verantwortlichen Menschen.</span></div>` : ''}
    ${needText ? `<div class="field"><label for="dlgText">${esc(needText)}</label><textarea id="dlgText" name="text" required></textarea></div>` : (act === 'move' ? '<div class="field"><label for="dlgText">Kommentar (je nach Zielstatus Pflicht)</label><textarea id="dlgText" name="text"></textarea></div>' : '')}
    ${needConfirm ? `<div class="field"><label><input type="checkbox" name="confirmAcceptance"> Akzeptanzkriterien sind erfüllt bzw. Erledigung wird ausdrücklich bestätigt</label></div>` : (act === 'move' ? '<div class="field"><label><input type="checkbox" name="confirmAcceptance"> Bei „Erledigt": Akzeptanzkriterien erfüllt / bestätigt</label></div>' : '')}
    <ul class="missing" id="dlgMissing" hidden></ul>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">${esc(commentOnly ? 'Speichern' : 'Übernehmen')}</button></div>
    <input type="hidden" name="act" value="${esc(act)}">
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('input:not([type=hidden]), select, textarea')?.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const fd = new FormData(form);
    const payload = { target: fd.get('target') || null, owner: (fd.get('owner') || '').trim() || null, comment: (fd.get('text') || '').trim() || null, reason: (fd.get('text') || '').trim() || null, confirmAcceptance: fd.get('confirmAcceptance') === 'on', act };
    if (payload.target) {
      const missing = requirementsFor(t, payload.target, payload);
      if (missing.length) { const ul = $('#dlgMissing'); ul.hidden = false; ul.innerHTML = missing.map(m => `<li>${esc(m)}</li>`).join(''); return; }
    }
    form.querySelector('[type=submit]').disabled = true;
    try {
      let r;
      if (payload.target) r = await fetch(`/api/tasks/${t.number}/transition`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, decision: act in DECISION_TEXT ? act : undefined }) });
      else if (act === 'assign' || act === 'delegate') r = await fetch(`/api/tasks/${t.number}/assign`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: payload.owner, comment: payload.comment, decision: act === 'delegate' ? 'delegate' : undefined }) });
      else r = await fetch(`/api/tasks/${t.number}/comment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: payload.comment, decision: act in DECISION_TEXT ? act : undefined }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { const ul = $('#dlgMissing'); ul.hidden = false; ul.innerHTML = (j.missing || [j.error || `Fehler ${r.status}`]).map(m => `<li>${esc(m)}</li>`).join(''); form.querySelector('[type=submit]').disabled = false; return; }
      $('#dialogRoot').innerHTML = '';
      toast(j.note ? `Gespeichert · ${j.note}` : 'Gespeichert – auf GitHub protokolliert');
      state.detailCache.delete(t.number);
      await refresh({ silent: true });
    } catch (e) { toast(`Fehler: ${e.message}`, 'crit'); form.querySelector('[type=submit]').disabled = false; }
  });
}

// ---------------------------------------------------------------------------
// Command Palette
// ---------------------------------------------------------------------------
function paletteItems(q) {
  const items = [];
  const views = [['heute', 'Heute'], ['arbeit', 'Arbeit'], ['freigaben', 'Freigaben'], ['bereiche', 'Bereiche'], ['insights', 'Insights'], ['aktivitaet', 'Aktivität']];
  for (const [k, l] of views) items.push({ kind: 'Ansicht', label: l, run: () => navigate(k) });
  for (const v of SAVED_VIEWS) items.push({ kind: 'Ansicht', label: `Arbeit: ${v.label}`, run: () => navigate('arbeit', { view: v.key }) });
  for (const a of AREAS) items.push({ kind: 'Bereich', label: a.label, run: () => navigate('arbeit', { area: a.key }) });
  items.push({ kind: 'Aktion', label: 'Neue Aufgabe auf GitHub anlegen', run: () => window.open(newIssueUrl({ template: 'feature.yml' }), '_blank', 'noopener') });
  items.push({ kind: 'Aktion', label: 'Entscheidung anlegen', run: () => window.open(newIssueUrl({ template: 'entscheidung.yml' }), '_blank', 'noopener') });
  items.push({ kind: 'Aktion', label: 'Daten neu laden', run: () => refresh() });
  if (state.capabilities.sync) items.push({ kind: 'Aktion', label: 'Jetzt mit GitHub synchronisieren', run: () => syncNow() });
  items.push({ kind: 'Aktion', label: 'GitHub Issues öffnen', run: () => window.open(`${REPO_URL}/issues`, '_blank', 'noopener') });
  const owners = [...new Set(state.tasks.map(t => t.owner).filter(Boolean))];
  for (const o of owners) items.push({ kind: 'Person', label: `@${o}`, run: () => navigate('arbeit', { owner: o }) });
  for (const e of [...new Set(state.tasks.map(t => t.executor).filter(Boolean))]) items.push({ kind: 'Agent', label: e, run: () => navigate('arbeit', { q: e }) });
  for (const t of state.tasks) items.push({ kind: t.isDecision ? 'Entscheidung' : 'Aufgabe', label: `${t.id} ${t.title}`, sub: t.statusLabel, run: () => openTask(t.number) });
  const ql = q.trim().toLowerCase();
  const scored = items.map(i => ({ i, s: !ql ? 1 : i.label.toLowerCase().includes(ql) ? 2 + (i.label.toLowerCase().startsWith(ql) ? 1 : 0) : ql.split(/\s+/).every(p => i.label.toLowerCase().includes(p)) ? 1 : 0 })).filter(x => x.s > 0);
  return scored.sort((a, b) => b.s - a.s).slice(0, 14).map(x => x.i);
}

function openPalette() {
  const root = $('#paletteRoot');
  let sel = 0; let items = paletteItems('');
  const draw = () => { root.querySelector('ul').innerHTML = items.map((it, k) => `<li role="option" aria-selected="${k === sel}" data-k="${k}"><span class="k">${esc(it.kind)}</span><span>${esc(it.label)}</span>${it.sub ? `<span class="s">${esc(it.sub)}</span>` : ''}</li>`).join('') || '<li class="muted">Nichts gefunden.</li>'; };
  root.innerHTML = `<div class="palette-backdrop" data-close-palette><div class="palette" role="combobox" aria-expanded="true"><input type="text" placeholder="Aufgabe, Ansicht, Person, Aktion … (Esc schließt)" aria-label="Suche" autocomplete="off"><ul role="listbox"></ul></div></div>`;
  draw();
  const input = root.querySelector('input'); input.focus();
  const run = () => { const it = items[sel]; closePalette(); it?.run(); };
  input.addEventListener('input', () => { items = paletteItems(input.value); sel = 0; draw(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(); }
    else if (e.key === 'Escape') closePalette();
  });
  root.querySelector('ul').addEventListener('click', e => { const li = e.target.closest('li[data-k]'); if (li) { sel = Number(li.dataset.k); run(); } });
}
function closePalette() { $('#paletteRoot').innerHTML = ''; }

async function syncNow() {
  toast('Synchronisiere mit GitHub …');
  try {
    const r = await fetch('/api/sync', { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    await refresh({ silent: true });
    toast(`Synchronisiert: ${j.count} Aufgaben`);
  } catch (e) { toast(`Sync fehlgeschlagen: ${e.message}`, 'crit'); }
}

// ---------------------------------------------------------------------------
// Render + Events
// ---------------------------------------------------------------------------
const VIEWS = { heute: viewHeute, arbeit: viewArbeit, freigaben: viewFreigaben, bereiche: viewBereiche, insights: viewInsights, aktivitaet: viewAktivitaet };

function render() {
  const main = $('#main');
  document.querySelectorAll('.mainnav a').forEach(a => a.toggleAttribute('aria-current', a.dataset.nav === state.route.view) || (a.dataset.nav === state.route.view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const nf = $('#navFreigaben'); const approvals = state.tasks.filter(t => t.status === 'freigabe').length;
  nf.hidden = !approvals; nf.textContent = approvals;
  if (state.loadError && !state.raw) {
    main.innerHTML = `<div class="page-head"><h1>Daten nicht verfügbar</h1></div><div class="notice crit">${esc(state.loadError)}</div><p class="small muted" style="margin-top:10px">issues.json wird vom Workflow „dashboard-data" erzeugt. Lokal: <span class="mono">npm run dashboard</span>. <button class="btn btn-sm" data-action="refresh" style="margin-left:8px">Erneut versuchen</button></p>`;
    return;
  }
  main.innerHTML = (state.loadError ? `<div class="notice crit" style="margin-bottom:12px">Aktualisierung fehlgeschlagen: ${esc(state.loadError)} – es wird der letzte geladene Stand gezeigt.</div>` : '') + VIEWS[state.route.view]();
  document.title = `${{ heute: 'Heute', arbeit: 'Arbeit', freigaben: 'Freigaben', bereiche: 'Bereiche', insights: 'Insights', aktivitaet: 'Aktivität' }[state.route.view]} · Teppich Dashboard`;
  renderSheet();
  $('#mainnav').classList.remove('open'); $('#navToggle').setAttribute('aria-expanded', 'false');
}

function bindEvents() {
  document.addEventListener('click', e => {
    const open = e.target.closest('[data-open]');
    if (open && !e.target.closest('[data-decide]')) { e.preventDefault(); openTask(Number(open.dataset.open)); if (open.dataset.primary) { setTimeout(() => $('#sheetRoot [data-act]')?.focus(), 50); } return; }
    if (e.target.closest('[data-close-sheet]')) { closeTask(); return; }
    if (e.target.closest('[data-close-dialog]') && !e.target.closest('form')) { $('#dialogRoot').innerHTML = ''; return; }
    if (e.target.closest('[data-close-dialog]')) { $('#dialogRoot').innerHTML = ''; return; }
    if (e.target.closest('[data-close-palette]') && !e.target.closest('.palette')) { closePalette(); return; }
    const act = e.target.closest('[data-act]');
    if (act) { const t = state.tasks.find(x => x.number === Number(act.dataset.task)); if (t) openActionDialog(t, act.dataset.act); return; }
    const dec = e.target.closest('[data-decide]');
    if (dec) { const t = state.tasks.find(x => x.number === Number(dec.dataset.task)); if (t) openActionDialog(t, dec.dataset.decide); return; }
    const p = e.target.closest('button[data-param]');
    if (p) { setParam(p.dataset.param, p.dataset.value); return; }
    const a = e.target.closest('[data-action]');
    if (a) { if (a.dataset.action === 'sync') syncNow(); if (a.dataset.action === 'refresh') refresh(); if (a.dataset.action === 'clear-filters') navigate('arbeit', { mode: state.route.params.get('mode') || '' }); }
  });
  document.addEventListener('change', e => { const el = e.target.closest('select[data-param]'); if (el) setParam(el.dataset.param, el.value); });
  let qTimer;
  document.addEventListener('input', e => { const el = e.target.closest('input[type=search][data-param]'); if (!el) return; clearTimeout(qTimer); qTimer = setTimeout(() => { const p = new URLSearchParams(state.route.params); if (el.value) p.set('q', el.value); else p.delete('q'); history.replaceState(null, '', `#/${state.route.view}?${p}`); parseRoute(); const focus = el; render(); const again = document.querySelector('input[type=search][data-param]'); if (again && focus) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } }, 220); });
  document.addEventListener('keydown', e => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#paletteRoot').children.length ? closePalette() : openPalette(); return; }
    if (e.key === 'Escape') { if ($('#paletteRoot').children.length) closePalette(); else if ($('#dialogRoot').children.length) $('#dialogRoot').innerHTML = ''; else if (state.route.params.get('task')) closeTask(); return; }
    if (inField || $('#dialogRoot').children.length || $('#paletteRoot').children.length) return;
    if (e.key === '/') { e.preventDefault(); openPalette(); return; }
    const rows = [...document.querySelectorAll('#main [data-open][tabindex]')];
    if (!rows.length) return;
    if (e.key === 'j' || e.key === 'ArrowDown' && !state.route.params.get('task')) { e.preventDefault(); state.selectedRow = Math.min(rows.length - 1, Math.max(0, state.selectedRow + 1)); rows[state.selectedRow].focus(); rows.forEach((r, i) => r.classList.toggle('selected', i === state.selectedRow)); }
    else if (e.key === 'k' || e.key === 'ArrowUp' && !state.route.params.get('task')) { e.preventDefault(); state.selectedRow = Math.max(0, state.selectedRow - 1); rows[state.selectedRow].focus(); rows.forEach((r, i) => r.classList.toggle('selected', i === state.selectedRow)); }
    else if (e.key === 'Enter' && document.activeElement?.dataset?.open) { e.preventDefault(); openTask(Number(document.activeElement.dataset.open)); }
  });
  // Kanban Drag & Drop (nur lokal)
  document.addEventListener('dragstart', e => { const c = e.target.closest('[data-drag]'); if (c) { e.dataTransfer.setData('text/plain', c.dataset.drag); e.dataTransfer.effectAllowed = 'move'; } });
  document.addEventListener('dragover', e => { const col = e.target.closest('.kcol'); if (col && state.capabilities.actions) { e.preventDefault(); col.classList.add('drop'); } });
  document.addEventListener('dragleave', e => { e.target.closest?.('.kcol')?.classList.remove('drop'); });
  document.addEventListener('drop', e => {
    const col = e.target.closest('.kcol'); if (!col) return; e.preventDefault(); col.classList.remove('drop');
    const n = Number(e.dataTransfer.getData('text/plain')); const t = state.tasks.find(x => x.number === n); if (!t) return;
    const targetCol = col.dataset.col;
    const target = targetCol === 'fertig' ? 'fertig' : targetCol === t.column ? null : targetCol;
    if (!target) return;
    const allowed = (TRANSITIONS[t.status] || []).includes(target);
    if (!allowed) { toast(`Übergang ${t.statusLabel} → ${STATUS_BY_KEY[target].label} ist nicht vorgesehen`, 'crit'); return; }
    openActionDialog(t, 'move', { target });
  });
  $('#searchBtn').addEventListener('click', openPalette);
  $('#syncChip').addEventListener('click', () => navigate('insights'));
  $('#navToggle').addEventListener('click', () => { const nav = $('#mainnav'); const open = nav.classList.toggle('open'); $('#navToggle').setAttribute('aria-expanded', String(open)); });
  window.addEventListener('hashchange', async () => { const prev = state.route.view; parseRoute(); state.selectedRow = -1; if (state.route.view === 'aktivitaet' && prev !== 'aktivitaet') activityCache = await loadActivity(); render(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh({ silent: true }); });
}

async function init() {
  parseRoute();
  bindEvents();
  await loadCapabilities();
  await loadData();
  renderSyncChip();
  if (state.route.view === 'aktivitaet') activityCache = await loadActivity();
  render();
  loadWorkflowRun().then(() => { renderSyncChip(); if (['heute', 'insights'].includes(state.route.view)) render(); });
  loadAgentRuns().then(() => { if (state.agentRuns) render(); });
  setInterval(() => refresh({ silent: true }), CONFIG.refreshMs);
}

init();
