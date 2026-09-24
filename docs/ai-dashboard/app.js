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
import { ratgeberStatus, pipelineRows, statusLabel, suchleistungHinweis } from './lib/bodenwissen.mjs';

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
  session: { required: false, authenticated: true },
  me: null,
  workflowRun: null,    // letzter Actions-Lauf (oeffentliche API, optional)
  agentRuns: null,      // nur lokal
  route: { view: 'heute', params: new URLSearchParams() },
  selectedRow: -1,
  detailCache: new Map(),
  bodenwissen: null,       // docs/ai-dashboard/bodenwissen.json, siehe ensureBodenwissen()
  bodenwissenError: null,
  bodenwissenLoaded: false,
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
    if (r.status === 401) { state.capabilities = { mode: 'ausgeloggt' }; return; }
    if (!r.ok) throw new Error();
    state.capabilities = await r.json();
    state.me = state.capabilities.user || null;
  } catch { state.capabilities = { mode: 'static' }; }
}

async function loadSession() {
  try {
    const r = await fetch('/api/session', { cache: 'no-store' });
    state.session = r.ok ? await r.json() : { required: false, authenticated: true };
  } catch { state.session = { required: false, authenticated: true }; }
  renderSessionButton();
}

function renderSessionButton() {
  const btn = $('#sessionBtn');
  if (!btn) return;
  const show = Boolean(state.session?.required && state.session?.authenticated);
  btn.hidden = !show;
  const label = $('#sessionBtnText');
  if (label) {
    const b = state.session?.benutzer;
    label.textContent = b?.name ? `${b.name} (${b.rolle})` : 'Angemeldet';
  }
  // Rolle "lesen" darf serverseitig nichts veraendern - hier nur die zugehoerige
  // Bedienoberflaeche ausblenden, damit niemand versehentlich auf eine 403-Antwort
  // trifft. Die eigentliche Durchsetzung liegt im Server (scripts/serve-dashboard.mjs).
  const istLesend = state.session?.benutzer?.rolle === 'lesen';
  document.body.classList.toggle('rolle-lesen', istLesend);
}

/** true, wenn die aktuelle Rolle keine Aenderungen vornehmen darf (nur Anzeige, Server prueft ohnehin serverseitig). */
export function istNurLesend() {
  return state.session?.benutzer?.rolle === 'lesen';
}

async function logout() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch { /* egal, wir leiten trotzdem um */ }
  window.location.href = '/login';
}

async function loadData() {
  if (state.capabilities.mode !== 'local') { state.raw = null; state.tasks = []; state.scores = new Map(); state.loadError = null; return; }
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
  const view = ['heute', 'arbeit', 'freigaben', 'bereiche', 'insights', 'aktivitaet', 'einkauf', 'kunden', 'lexikon', 'ratgeber'].includes(path) ? path : 'heute';
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
    ${showNext && echterSchritt(t) ? `<div class="next">${esc(echterSchritt(t))}</div>` : ''}
    ${t.blocker && ['blockiert', 'freigabe'].includes(t.status) ? `<div class="next" style="color:var(--crit)">${esc(t.blocker)}</div>` : ''}
  </div>`;
}

function emptyState(title, hint, link) {
  return `<div class="empty"><strong>${esc(title)}</strong> ${esc(hint)}${link ? `<a href="${esc(link.href)}">${esc(link.text)}</a>` : ''}</div>`;
}

/**
 * Aufklappbarer Kartenabschnitt fuer die Startseite: haelt weniger dringende
 * Inhalte standardmaessig eingeklappt, damit "Heute" in eine Bildschirmhoehe
 * passt. Merkt sich je Abschnitt (id), ob der/die Nutzer:in ihn geoeffnet hat.
 * Kopfzeile ist bewusst kein Flex-Space-Between mit dem Browser-Aufklapp-
 * Zeichen als drittem Element (das zentriert sonst den Titel) - Chevron ist
 * ein eigenes Element links, die Vorschau-Zahl rechts via margin-left:auto.
 */
function collapsibleCard(id, title, preview, bodyHtml, { openByDefault = false } = {}) {
  let open = openByDefault;
  try { const v = localStorage.getItem(`tp-heute-${id}`); if (v !== null) open = v === '1'; } catch {}
  return `<details class="card section" data-collapsible="${esc(id)}" ${open ? 'open' : ''}>
    <summary class="collapsible-head"><span class="chev" aria-hidden="true">›</span><h2>${title}</h2>${preview ? `<span class="preview">${preview}</span>` : ''}</summary>
    <div class="details-body">${bodyHtml}</div>
  </details>`;
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
  } else items.push({ level: 'info', title: 'KI-Läufe nur lokal sichtbar', detail: 'Die Steuerzentrale speichert Läufe außerhalb des Repos; statisch ist nur der Issue-Status sichtbar.' });
  // Level "info" = dauerhafter, bewusster Zustand (kein Handlungsbedarf). Zaehlt nie als
  // Warnung - sonst stuende die Systemgesundheit auf "Hinweise", obwohl alles laeuft.
  items.push({ level: 'info', title: 'Google Ads und GA4 nicht angebunden', detail: 'Bewusst: Shop-Kennzahlen kommen aus dem lokalen Export (Startseite „Heute"); Ads und Analytics erst nach Sichtbarkeitsentscheidung (docs/control-center/BESTANDSAUFNAHME.md, Punkt 4).' });
  if (state.capabilities.mode === 'local') items.push(...aktualisierungHealth());
  return items;
}

function renderSyncChip() {
  const chip = $('#syncChip'); const txt = $('#syncChipText');
  const fr = freshness(state.raw?.generated_at);
  chip.className = `sync-chip ${state.loadError ? 'fehler' : fr.level}`;
  // Kurz halten: der Chip darf in der Kopfzeile nicht umbrechen. Details stehen im Tooltip.
  const uhrzeit = state.raw?.generated_at ? new Date(state.raw.generated_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';
  txt.textContent = state.loadError ? 'Daten fehlen' : `Stand ${uhrzeit}`;
  chip.title = state.loadError ? state.loadError : `Aufgabendaten ${fr.text} · ${fmtDateTime(state.raw?.generated_at)} · ${state.raw?.count ?? 0} Aufgaben · Klick: Systemzustand`;
}

// ---------------------------------------------------------------------------
// Ansicht: Heute
// ---------------------------------------------------------------------------
function viewHeute() {
  const tasks = state.tasks; const s = summarize(tasks);
  // "Braucht jetzt Aufmerksamkeit" ist die dringendste Rangliste; jede Aufgabe darf auf
  // "Heute" nur an einer Stelle stehen, darum werden ihre Nummern aus den Listen darunter
  // (Wartet auf dich, Blockiert) herausgefiltert statt sie zusaetzlich dort zu wiederholen.
  const att = attentionList(tasks, { limit: 3 });
  const attNumbers = new Set(att.map(x => x.task.number));
  const waitingAll = tasks.filter(t => t.open && (t.status === 'freigabe' || (t.status === 'review' && (!t.reviewer || t.reviewer === 'mensch')) || (t.status === 'eingang' && t.triage.length && t.ageDays <= 14)) && !attNumbers.has(t.number)).sort((a, b) => a.priorityRank - b.priorityRank);
  const waiting = waitingAll.slice(0, 4);
  const waitingRest = waitingAll.slice(4);
  const blocked = tasks.filter(t => t.status === 'blockiert' && !attNumbers.has(t.number));
  const running = tasks.filter(t => ['in-arbeit', 'korrektur'].includes(t.status));
  const week = { done: tasks.filter(t => t.closedAt && (Date.now() - new Date(t.closedAt)) < 7 * 864e5), fresh: tasks.filter(t => t.open && t.ageDays !== null && t.ageDays < 7), overdue: tasks.filter(t => t.overdue) };
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const health = systemHealth();
  const worst = health.some(h => h.level === 'crit') ? 'crit' : health.some(h => h.level === 'warn') ? 'warn' : 'ok';
  const localMode = state.capabilities.mode === 'local';
  if (localMode) { ensureEinkaufBestellungen(); ensureEinkaufAuftragsstatus(); ensureEinkaufKennzahlen(); ensureAktualisierung(); ensureKundenRueckrufe(); }

  // Interne Arbeit: Kacheln mit 0 sind Rauschen und fallen weg; "erledigt" bleibt als
  // positives Signal immer stehen.
  const intern = [
    [s.critical, 'kritisch (P0)', 'crit', '#/arbeit?prio=p0'],
    [s.blocked, 'blockiert', 'crit', '#/arbeit?view=blockiert'],
    [s.approvals, 'warten auf Freigabe', 'warn', '#/freigaben'],
    [s.dueToday, 'heute fällig / überfällig', 'warn', '#/arbeit?view=heute'],
    [s.triage, 'noch zu bewerten', 'plain', '#/arbeit?view=triage'],
  ].filter(([n]) => n > 0);

  return `
    <div class="page-head"><div><h1>Heute</h1><p class="sub">${esc(today)}</p></div>
      <div class="head-actions">${aktualisierenButton()}${state.capabilities.sync ? '<button class="btn" data-action="sync" title="Aufgaben frisch von GitHub holen">Aufgaben synchronisieren</button>' : ''}<a class="btn btn-ghost" href="${newIssueUrl({ template: 'feature.yml' })}" target="_blank" rel="noopener">Neue Aufgabe ↗</a></div></div>

    <h2 class="section-title">Kundengeschäft</h2>
    ${heuteEinkaufBlock()}
    ${heuteRueckrufBlock()}

    <h2 class="section-title">Shop-Zahlen</h2>
    ${heuteKennzahlenBlock()}

    <h2 class="section-title">Interne Arbeit <span class="section-note">Aufgaben aus GitHub – wichtig, aber nach dem Kundengeschäft</span></h2>
    <div class="band">
      ${intern.map(([n, l, cls, href]) => bandItem(n, l, cls, href)).join('')}
      ${bandItem(s.doneThisWeek, 'diese Woche erledigt', 'plain', '#/arbeit?status=fertig')}
    </div>

    ${collapsibleCard('aufmerksamkeit', 'Braucht jetzt Aufmerksamkeit', att.length ? String(att.length) : 'nichts', att.length ? `<div class="att">${att.map((x, i) => attentionItem(x, i)).join('')}</div>` : emptyState('Nichts drängt.', 'Keine P0, keine Blocker, keine offenen Freigaben – gute Zeit, die nächste wichtige Arbeit zu planen.', { href: '#/arbeit?status=geplant', text: 'Geplante Aufgaben ansehen' }), { openByDefault: att.length > 0 })}

    ${collapsibleCard('wartet', 'Wartet auf dich', waitingAll.length ? String(waitingAll.length) : 'nichts', `${waiting.length ? `<div class="rows">${waiting.map(t => heuteCompactRow(t, primaryAction(t).label)).join('')}</div>` : emptyState('Keine Freigaben offen.', 'Plane die nächste wichtige Arbeit.', { href: '#/arbeit?status=geplant', text: 'Geplant' })}${waitingRest.length ? `<details class="inline-more"><summary>Alle anzeigen (+${waitingRest.length})</summary><div class="rows" style="margin-top:6px">${waitingRest.map(t => heuteCompactRow(t, primaryAction(t).label)).join('')}</div></details>` : ''}`, { openByDefault: waitingAll.length > 0 })}

    ${blocked.length ? collapsibleCard('blockiert', 'Blockiert', String(blocked.length), `<div class="rows">${blocked.slice(0, 5).map(t => heuteCompactRow(t, 'Lösen', { title: t.blocker || 'Grund fehlt – bitte im Issue nachtragen' })).join('')}</div>`, { openByDefault: true }) : ''}

    ${collapsibleCard('laeuft', 'Läuft gerade', running.length ? `${running.length} in Arbeit` : 'nichts', runningBlock(running), { openByDefault: false })}

    ${collapsibleCard('woche', 'Diese Woche', `${week.done.length} erledigt · ${week.fresh.length} neu`, `
        ${week.overdue.length ? `<p class="notice crit" style="margin-bottom:10px">${plural(week.overdue.length, 'Aufgabe ist', 'Aufgaben sind')} überfällig. <a href="#/arbeit?view=heute">Ansehen →</a></p>` : ''}
        ${week.done.length ? `<ul class="plain-list">${week.done.slice(0, 8).map(t => `<li><span class="muted mono small">${esc(t.id)}</span> ${taskLink(t)}</li>`).join('')}</ul>` : '<p class="small muted">Noch nichts erledigt in den letzten 7 Tagen.</p>'}`, { openByDefault: false })}

    ${worst === 'ok'
      ? `<p class="health-ok"><span class="dot" aria-hidden="true"></span>Alle Datenquellen in Ordnung · <a href="#/insights">Systemzustand ansehen</a></p>`
      : `<section class="card section health-card ${worst}"><div class="card-head"><h2>Systemgesundheit</h2><a class="more" href="#/insights">Alle Details →</a></div><div class="health">${health.filter(h => h.level === 'warn' || h.level === 'crit').map(healthRow).join('')}</div></section>`}`;
}

/** Kachel im Zahlenband. 0 wird grau, damit echte Zahlen hervorstechen. */
function bandItem(n, label, cls, href) {
  const inner = `<span class="n">${esc(n)}</span><span class="l">${esc(label)}</span>`;
  const klasse = n === 0 ? 'zero' : cls;
  return href ? `<a href="${href}" class="${klasse}">${inner}</a>` : `<div class="${klasse}">${inner}</div>`;
}

/** Positionen (Ware und Muster) der Bestelluebersicht mit ihrem lokalen Auftragsfluss-Stand. */
function einkaufPositionenMitStand(b) {
  const ware = (b.gruppen || []).flatMap(g => g.positionen);
  const muster = (b.musterGruppen || []).flatMap(g => g.positionen);
  const gruppe = p => afFilterGruppe(afEintragFuer(p)?.status);
  return { ware, muster, gruppe };
}

/** Auftragsfluss-Zaehler je Gruppe (offen/bestellt/unterwegs/erledigt) ueber Ware und Muster. */
function heuteAuftragsflussZaehler(b) {
  const { ware, muster, gruppe } = einkaufPositionenMitStand(b);
  const afZaehler = { offen: 0, bestellt: 0, unterwegs: 0, erledigt: 0 };
  for (const p of [...ware, ...muster]) afZaehler[gruppe(p)] += 1;
  return afZaehler;
}

/**
 * Noch nicht abgeschlossene Positionen eines Auftrags. Ein Auftrag, dessen Positionen im
 * Auftragsfluss alle auf "Erledigt" stehen (z. B. als Testbestellung ohne Einkauf
 * abgeschlossen), zaehlt nicht mehr als offen oder als Problem - auch wenn Shopify ihn
 * weiter als unerfuellt fuehrt.
 */
function auftragOffenePositionen(a) {
  return (a.positionen || []).filter(p => (p.menge ?? 1) > 0 && afFilterGruppe(afEintragFuer(p)?.status) !== 'erledigt');
}
function aktiveAuftraege(b) { return (b.auftraege || []).filter(a => a.offen && auftragOffenePositionen(a).length); }

/** Kundengeschaeft auf der Startseite: vier Zahlen, darunter nur die Auftraege mit Problem. */
function heuteEinkaufBlock() {
  if (state.capabilities.mode !== 'local') {
    return emptyState('Nur lokal im Betrieb verfügbar.', 'Bestellübersicht und Auftragsfluss lesen private Daten, die nie öffentlich werden. Auf dem Mac starten: npm run dashboard');
  }
  const b = einkauf.bestellungen;
  if (!b && einkauf.loadingBestellungen) return `<div class="empty">Lade Einkaufsdaten …</div>`;
  if (!b || !b.verfuegbar) return emptyState('Keine Bestelldaten verfügbar.', b?.hinweis || 'Bestellübersicht noch nicht exportiert.', { href: '#/einkauf', text: 'Bereich Einkauf öffnen' });
  const { ware, muster, gruppe } = einkaufPositionenMitStand(b);
  const aktiv = aktiveAuftraege(b);
  const probleme = aktiv.filter(a => a.ampel === 'rot');
  const warePendent = ware.filter(p => gruppe(p) === 'offen').length;
  const musterPendent = muster.filter(p => gruppe(p) === 'offen').length;
  const af = heuteAuftragsflussZaehler(b);
  const unterwegs = af.bestellt + af.unterwegs;
  return `
    <div class="band">
      ${bandItem(aktiv.length, 'offene Kundenaufträge', 'plain', '#/einkauf')}
      ${bandItem(warePendent, 'Artikel noch zu bestellen', 'warn', '#/einkauf')}
      ${bandItem(musterPendent, 'Muster noch zu bestellen', 'warn', '#/einkauf')}
      ${bandItem(probleme.length, probleme.length === 1 ? 'Auftrag mit Problem' : 'Aufträge mit Problem', 'crit', '#/einkauf')}
    </div>
    ${probleme.length
      ? `<section class="card problem-card"><div class="card-head"><h3>Zuerst klären</h3><a class="more" href="#/einkauf">Alle Aufträge im Einkauf →</a></div><div class="rows">${probleme.slice(0, 3).map(a => einkaufAuftragZeile(a)).join('')}</div>${probleme.length > 3 ? `<p class="small muted" style="margin-top:6px">+${probleme.length - 3} weitere – <a href="#/einkauf">alle ansehen →</a></p>` : ''}</section>`
      : `<p class="notice ok">Kein Auftrag mit Problem.</p>`}
    <p class="small muted flow-line">${unterwegs ? `${plural(unterwegs, 'Artikel ist', 'Artikel sind')} beim Lieferanten bestellt oder unterwegs · ` : ''}Stand Bestellungen ${esc(fmtDateTime(b.exportiertAm || b.erstellt))} · <a href="#/einkauf">Einkauf öffnen →</a></p>`;
}

/** Shop-Kennzahlen: eine kompakte Tabelle statt sechs Kacheln. Erfindet ohne Export nichts. */
function heuteKennzahlenBlock() {
  if (state.capabilities.mode !== 'local') {
    return emptyState('Nur lokal im Betrieb verfügbar.', 'Shop-Kennzahlen lesen einen lokalen Export, der nie öffentlich wird.');
  }
  const k = einkauf.kennzahlen;
  if (!k && einkauf.loadingKennzahlen) return `<div class="empty">Lade Shop-Kennzahlen …</div>`;
  if (!k || !k.verfuegbar) {
    return emptyState('Noch kein Export der Shop-Kennzahlen.', k?.hinweis || 'Es liegt noch keine kennzahlen/shop-snapshot.json vor.') +
      `<p class="small muted" style="margin-top:6px">Befehl zum Erzeugen: <code class="mono">${esc(k?.befehl || 'npm run daten:aktualisieren')}</code></p>`;
  }
  const geld = (n, w) => typeof n === 'number' ? n.toLocaleString('de-DE', { style: 'currency', currency: w || 'EUR' }) : '–';
  const spalten = [['7', 'Letzte 7 Tage'], ['30', 'Letzte 30 Tage']].map(([t, l]) => ({ l, z: k.zeitraeume?.[t] })).filter(x => x.z);
  if (!spalten.length) return emptyState('Keine Zeiträume im Export.', '');
  // Bezahlte Bestellungen ohne Betrag sind kostenlose Musterbestellungen. Umsatz 0 ist dann
  // richtig, soll aber nicht wie ein Datenfehler aussehen.
  const hinweis = spalten.some(({ z }) => z.bestellungen > 0 && !z.umsatz)
    ? `<p class="small muted" style="margin-top:8px">Umsatz 0 €: ${spalten.every(({ z }) => typeof z.kostenlos !== 'number' || z.kostenlos === z.bestellungen) ? 'die Bestellungen im Zeitraum waren kostenlose Musterbestellungen.' : 'bezahlte Bestellungen ohne Betrag (z. B. kostenlose Muster).'}</p>`
    : '';
  return `<section class="card kpi-card">
      <table class="kpi"><thead><tr><th></th>${spalten.map(({ l }) => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>
        <tr><th>Bestellungen</th>${spalten.map(({ z }) => `<td>${esc(z.bestellungen ?? '–')}${z.kostenlos ? ` <span class="small muted">(davon ${z.kostenlos} Muster)</span>` : ''}</td>`).join('')}</tr>
        <tr><th>Umsatz</th>${spalten.map(({ z }) => `<td>${geld(z.umsatz, z.waehrung)}</td>`).join('')}</tr>
        <tr><th>Ø Bestellwert</th>${spalten.map(({ z }) => `<td>${z.bestellungen ? geld(z.durchschnitt, z.waehrung) : '–'}</td>`).join('')}</tr>
      </tbody></table>
      ${hinweis}
      <p class="small muted" style="margin-top:6px">Stornierte und unbezahlte Bestellungen zählen nicht · Stand ${esc(fmtDateTime(k.erstellt))}</p>
    </section>`;
}

/** Einzeiler: Titel, ein Status-Chip, Knopf rechts. Der Grund (Prioritaet/Blocker/Frist) steht
 * als Tooltip auf der ganzen Zeile statt als eigene Zeile - bei fuenf Eintraegen wiederholte sich
 * sonst derselbe Erklaersatz mehrfach sichtbar. */
function attentionItem({ task: t, reasons }, i) {
  const primary = primaryAction(t);
  const why = reasons.join(' · ');
  return `<div class="row att-row" data-open="${t.number}" tabindex="0" role="button" title="${esc(why)}">
    <span class="rank">${i + 1}</span>
    <span class="t">${prioBadge(t)} ${taskLink(t)}</span>
    ${statusBadge(t)}
    <button class="btn btn-sm btn-primary" data-open="${t.number}" data-primary="1">${esc(primary.label)}</button>
  </div>`;
}

/** Gleicher Einzeiler wie attentionItem, aber ohne Rang und mit frei waehlbarem Knopftext -
 * fuer die Listen "Wartet auf dich", "Blockiert" und "Läuft gerade" auf der Startseite. Ersetzt
 * dort die mehrzeilige taskRow/blockedRow-Darstellung, damit vier bis sechs Eintraege nicht
 * gleich eine halbe Bildschirmhoehe brauchen. */
function heuteCompactRow(t, buttonLabel, { title } = {}) {
  return `<div class="row att-row" data-open="${t.number}" tabindex="0" role="button" title="${esc(title ?? (echterSchritt(t) || t.blocker || ''))}">
    <span class="t">${prioBadge(t)} ${taskLink(t)}</span>
    ${statusBadge(t)}
    <button class="btn btn-sm" data-open="${t.number}" data-primary="1">${esc(buttonLabel)}</button>
  </div>`;
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
  if (running.length) html += `<div class="rows" style="margin-top:${active.length ? 8 : 0}px">${running.slice(0, 3).map(t => heuteCompactRow(t, 'Öffnen')).join('')}</div>${running.length > 3 ? `<p class="small muted" style="margin-top:6px">+${running.length - 3} weitere – <a href="#/arbeit?status=in-arbeit">alle ansehen →</a></p>` : ''}`;
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
  // Ein neuer Filter beginnt wieder auf Seite 1 - sonst landet man auf einer leeren Seite.
  if (['psfilter', 'gruppe', 'psq'].includes(key)) p.delete('seite');
  if (key === 'lq') p.delete('lseite');
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

// Der Standardtext, den `npm run task -- create` ohne --next eintraegt. Er sagt nichts ueber
// die Aufgabe und wiederholte sich in fast jeder Zeile - in Listen wird er ausgeblendet.
const PLATZHALTER_SCHRITT = /^Triage: Priorität, Owner und Akzeptanzkriterien festlegen\.?$/i;
const echterSchritt = t => (t.nextStep && !PLATZHALTER_SCHRITT.test(t.nextStep.trim())) ? t.nextStep : '';

/** Projektpraefix aus dem Titel ("[Google Ads] Phase 5.1 …" -> "Google Ads"). */
function projektVon(t) {
  const m = t.title.match(/^\[([^\]]+)\]/);
  return m ? m[1].replace(/\s+\d.*$/, '').replace(/^SHP.*$/, 'SHP (Shop-Backlog)') : null;
}

/**
 * Projekte mit mindestens drei Aufgaben, die alle seit 14+ Tagen unveraendert sind, werden
 * in der ungefilterten Liste zu einer aufklappbaren Zeile zusammengefasst - sonst schieben
 * sich zehn ruhende Phasen-Aufgaben zwischen die Arbeit, die gerade laeuft.
 */
function ruhendeProjekte(list) {
  const p = state.route.params;
  if ([...p.keys()].some(k => !['mode', 'task'].includes(k))) return new Map();
  const gruppen = new Map();
  for (const t of list) { const k = projektVon(t); if (k) gruppen.set(k, [...(gruppen.get(k) || []), t]); }
  const ruhend = new Map();
  for (const [k, ts] of gruppen) if (ts.length >= 3 && ts.every(t => (t.daysSinceUpdate ?? 0) >= 14)) ruhend.set(k, ts);
  return ruhend;
}
state.offeneProjekte = new Set();

/** Liste in Anzeige-Eintraege: Aufgaben und (eingeklappte) Projektgruppen in Sortierreihenfolge. */
function listeMitGruppen(list) {
  const ruhend = ruhendeProjekte(list);
  const gesehen = new Set(); const out = [];
  for (const t of list) {
    const k = projektVon(t);
    if (k && ruhend.has(k)) {
      if (!gesehen.has(k)) {
        gesehen.add(k);
        const ts = ruhend.get(k); const offen = state.offeneProjekte.has(k);
        out.push({ gruppe: k, tasks: ts, offen, tage: Math.min(...ts.map(x => x.daysSinceUpdate ?? 0)) });
        if (offen) out.push(...ts.map(x => ({ task: x, inGruppe: true })));
      }
      continue;
    }
    out.push({ task: t });
  }
  return out;
}
const gruppenText = e => `<b>[${esc(e.gruppe)}]</b> · ${plural(e.tasks.length, 'Aufgabe', 'Aufgaben')} · seit ${e.tage} Tagen unverändert`;

function tableView(list) {
  if (!list.length) return emptyState('Keine Aufgaben in dieser Ansicht.', 'Filter anpassen oder eine neue Aufgabe anlegen.', { href: newIssueUrl({ template: 'feature.yml' }), text: 'Neue Aufgabe ↗' });
  const eintraege = listeMitGruppen(list);
  // Schmale Bildschirme: Karten statt Tabelle, damit nichts seitlich scrollen muss.
  if (window.matchMedia('(max-width: 760px)').matches) {
    return `<div class="rows">${eintraege.map(e => e.gruppe
      ? `<button type="button" class="group-toggle" data-toggle-projekt="${esc(e.gruppe)}" aria-expanded="${e.offen}">${e.offen ? '▾' : '▸'} ${gruppenText(e)}</button>`
      : taskRow(e.task)).join('')}</div>`;
  }
  // Spalten, die in dieser Ansicht bei allen Aufgaben gleich oder leer sind, tragen keine
  // Information und fallen weg (z. B. Owner, wenn alles bei derselben Person liegt).
  const spalten = {
    owner: new Set(list.map(t => t.owner || '')).size > 1,
    exec: list.some(t => t.executor),
    next: list.some(t => echterSchritt(t)),
    due: list.some(t => t.due),
    hint: list.some(t => (t.blocker && ['blockiert', 'freigabe'].includes(t.status)) || t.triage.length),
  };
  const breite = 5 + Object.values(spalten).filter(Boolean).length;
  let zeile = -1;
  const rows = eintraege.map(e => {
    if (e.gruppe) return `<tr class="group-row"><td colspan="${breite}"><button type="button" class="group-toggle" data-toggle-projekt="${esc(e.gruppe)}" aria-expanded="${e.offen}">${e.offen ? '▾' : '▸'} ${gruppenText(e)}</button></td></tr>`;
    const t = e.task; zeile += 1;
    return `<tr class="task-row ${zeile === state.selectedRow ? 'selected' : ''} ${e.inGruppe ? 'in-group' : ''}" data-open="${t.number}" tabindex="0">
      <td class="t"><span class="id">${esc(t.id)}</span> <a href="#" data-open="${t.number}">${esc(t.title)}</a></td>
      <td>${statusBadge(t)}</td><td>${prioBadge(t)}</td><td class="muted">${esc(t.area || '–')}</td>
      ${spalten.owner ? `<td>${ownerText(t)}</td>` : ''}
      ${spalten.exec ? `<td>${execBadge(t) || '<span class="muted">–</span>'}</td>` : ''}
      ${spalten.next ? `<td class="next">${esc(echterSchritt(t) || '')}</td>` : ''}
      ${spalten.due ? `<td class="nowrap ${t.overdue ? 'warnc' : ''}">${t.due ? fmtDate(t.due) : ''}</td>` : ''}
      ${spalten.hint ? `<td>${t.blocker && ['blockiert', 'freigabe'].includes(t.status) ? `<span class="warnc">${esc(t.blocker)}</span>` : ''}${t.triage.length ? `<div class="gapc">${esc(t.triage.join(' · '))}</div>` : ''}</td>` : ''}
      <td class="nowrap muted">${ago(t.updatedAt)}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="tasks"><thead><tr>
    <th>Aufgabe</th><th>Status</th><th>Prio</th><th>Bereich</th>${spalten.owner ? '<th>Owner</th>' : ''}${spalten.exec ? '<th>Ausführung</th>' : ''}${spalten.next ? '<th>Nächster Schritt</th>' : ''}${spalten.due ? '<th>Fällig</th>' : ''}${spalten.hint ? '<th>Hinweis</th>' : ''}<th>Update</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="small muted" style="margin-top:8px">Tastatur: <kbd>j</kbd>/<kbd>k</kbd> bewegen, <kbd>Enter</kbd> öffnen, <kbd>Esc</kbd> schließen.${!spalten.owner && list[0]?.owner ? ` · Alle Aufgaben liegen bei @${esc(list[0].owner)}.` : ''}</p>`;
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
  // Ohne Optionen ist die Vorlage unvollstaendig: dann ist "Rueckfrage" der naheliegende Schritt.
  const vollstaendig = Boolean(d.options?.length);
  return `<article class="card" style="box-shadow:none">
    <div class="card-head"><h3>${prioBadge(t)} ${taskLink(t)}</h3>${t.due ? `<span class="small ${t.overdue ? 'warnc' : 'muted'}">Frist ${fmtDate(t.due)}</span>` : ''}</div>
    ${(d.question || t.blocker || echterSchritt(t)) && (d.question || t.blocker || echterSchritt(t)) !== t.title ? `<p style="font-weight:600;margin-bottom:6px">${esc(d.question || t.blocker || echterSchritt(t))}</p>` : ''}
    ${d.options?.length ? `<ol style="margin:0 0 8px;padding-left:18px;font-size:.9rem">${d.options.map(o => `<li>${esc(o)}</li>`).join('')}</ol>` : '<p class="notice warn small" style="margin-bottom:8px">Keine Optionen hinterlegt – im Issue unter „Optionen" ergänzen oder nachfragen.</p>'}
    ${d.recommendation ? `<div class="notice" style="margin-bottom:8px"><b>Empfehlung:</b> ${esc(d.recommendation)}</div>` : ''}
    ${t.risk ? `<p class="small muted">Risiko: ${esc(t.risk)}</p>` : ''}
    <div class="m small muted" style="display:flex;gap:12px;flex-wrap:wrap;margin:8px 0"><span>Entscheider:in ${decider ? `<b>${esc(decider)}</b>` : '<span class="badge gap">fehlt</span>'}</span><span>${statusBadge(t)}</span><span>wartet ${since(t.updatedAt)}</span></div>
    <div class="decide-actions">
      ${vollstaendig
        ? `<button class="btn btn-sm btn-primary" data-decide="approve" data-task="${t.number}">Freigeben</button>
      <button class="btn btn-sm" data-decide="reject" data-task="${t.number}">Ablehnen</button>
      <button class="btn btn-sm" data-decide="question" data-task="${t.number}">Rückfrage</button>`
        : `<button class="btn btn-sm btn-primary" data-decide="question" data-task="${t.number}" title="Vorlage ohne Optionen – erst nachfragen">Rückfrage stellen</button>
      <button class="btn btn-sm" data-decide="approve" data-task="${t.number}">Trotzdem freigeben</button>`}
      <details class="more-actions"><summary class="btn btn-sm btn-ghost">Mehr</summary><div>
        ${vollstaendig ? '' : `<button class="btn btn-sm" data-decide="reject" data-task="${t.number}">Ablehnen</button>`}
        <button class="btn btn-sm" data-decide="delegate" data-task="${t.number}">Delegieren</button>
        <button class="btn btn-sm" data-decide="later" data-task="${t.number}">Später</button>
      </div></details>
    </div>
  </article>`;
}

// ---------------------------------------------------------------------------
// Ansicht: Bereiche
// ---------------------------------------------------------------------------
function viewBereiche() {
  const health = areaHealth(state.tasks);
  // Liegt alles bei derselben Person, sagt die Owner-Zeile auf jeder Karte nichts.
  const mehrereOwner = new Set(state.tasks.filter(t => t.open).map(t => t.owner).filter(Boolean)).size > 1;
  return `
    <div class="page-head"><div><h1>Bereiche & Projekte</h1><p class="sub">Zustand je Bereich mit Begründung – abgeleitet aus den Aufgaben, keine geschätzten Kennzahlen</p></div></div>
    <div class="grid grid-3">${health.map(a => `<article class="card area-card">
      <div class="card-head"><h2>${esc(a.label)}</h2><span class="badge level-${a.level}">${a.level === 'ok' ? 'stabil' : a.level === 'achtung' ? 'Achtung' : 'kritisch'}</span></div>
      <div class="reasons">${esc(a.reasons.join(' · '))}</div>
      <div class="stats"><span><b>${a.open}</b> offen</span><span><b>${a.inProgress}</b> in Arbeit</span><span><b>${a.blocked}</b> blockiert</span><span><b>${a.approvals}</b> Freigabe</span></div>
      ${mehrereOwner ? `<div class="small muted">Owner: ${a.owners.length ? a.owners.map(o => `@${esc(o)}`).join(', ') : '<span class="badge gap">niemand zugeordnet</span>'}</div>` : (!a.owners.length ? '<div><span class="badge gap">niemand zugeordnet</span></div>' : '')}
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
  if (state.capabilities.mode === 'local') ensureAktualisierung();
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
      <section class="card span-2"><div class="card-head"><h2>Kennzahlen</h2></div>
        <p class="small muted">Shop-Kennzahlen (Bestellungen, Umsatz) stehen auf <a href="#/heute">Heute</a> und kommen aus einem lokalen Export, der nie ins öffentliche Repository gelangt. Google Ads und GA4/Search Console sind noch nicht angebunden – erst nach der Sichtbarkeitsentscheidung. Bis dahin gibt es hier keine Demo-Zahlen.</p>
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

// Lokales Protokoll (wer hat was im Control Center gemacht) - nur bei Mehrbenutzerbetrieb
// interessant, aber unschaedlich, wenn keine Anmeldung aktiv ist (dann leer).
let protokollCache = null;
async function loadProtokoll() {
  try { const r = await fetch('/api/protokoll', { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
}

// Mitarbeiterliste - nur fuer die Rolle "inhaber" sichtbar (der Server liefert sie nur dieser Rolle aus).
let benutzerCache = null;
async function loadBenutzer() {
  if (state.session?.benutzer?.rolle !== 'inhaber') return null;
  try { const r = await fetch('/api/benutzer', { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
}

const EREIGNIS_LABEL = { labeled: 'Label', unlabeled: 'Label entfernt', assigned: 'zugewiesen', unassigned: 'Zuweisung entfernt', closed: 'geschlossen', reopened: 'wieder geöffnet', referenced: 'verknüpft', commented: 'Kommentar', renamed: 'umbenannt', angelegt: 'angelegt', geschlossen: 'geschlossen', aktualisiert: 'aktualisiert' };

/** Label-Name in Klartext: status:review -> "Status Review", priority:p2 -> "Prio P2". */
function labelKlartext(name) {
  const [gruppe, wert = ''] = String(name).split(':');
  if (gruppe === 'status') return `Status ${STATUS_BY_KEY[wert]?.label || wert}`;
  if (gruppe === 'priority') return `Prio ${wert.toUpperCase()}`;
  if (gruppe === 'area') return `Bereich ${wert}`;
  if (gruppe === 'type') return `Typ ${wert}`;
  if (gruppe === 'reviewer') return `Review durch ${wert}`;
  return name;
}

/**
 * Fasst Ereignisse derselben Person an derselben Aufgabe innerhalb von drei Minuten zu einem
 * Eintrag zusammen. Beim Anlegen einer Aufgabe entstehen sonst acht Zeilen Label-Wechsel in
 * derselben Minute. Bei Status-Labels zaehlt nur das zuletzt gesetzte.
 */
function buendeleAktivitaet(events) {
  const out = [];
  const FENSTER = 180_000;
  for (const e of events) {
    const t = new Date(e.at).getTime();
    // Rueckwaerts suchen, solange die Buendel noch im Zeitfenster liegen - Ereignisse
    // anderer Aufgaben duerfen dazwischen stehen (Bots arbeiten oft parallel).
    let ziel = null;
    for (let i = out.length - 1; i >= 0 && Math.abs(out[i].letzteZeit - t) <= FENSTER; i--) {
      if (out[i].number === e.number && out[i].who === e.who) { ziel = out[i]; break; }
    }
    if (ziel) { ziel.teile.push(e); ziel.letzteZeit = t; }
    else out.push({ at: e.at, who: e.who, number: e.number, title: e.title, teile: [e], letzteZeit: t });
  }
  return out.map(b => {
    const chrono = b.teile.slice().reverse();
    const gesetzt = []; const entfernt = []; const sonst = [];
    for (const e of chrono) {
      const m = /Label „([^"“”]+)["“”]( entfernt)?/.exec(e.text || '');
      if (m) (m[2] || e.kind === 'unlabeled' ? entfernt : gesetzt).push(m[1]);
      else { const roh = String(e.text || '').split(' · ').pop(); sonst.push(e.kind === 'commented' ? 'Kommentar' : EREIGNIS_LABEL[roh] || roh || EREIGNIS_LABEL[e.kind] || e.kind); }
    }
    const letzteJeGruppe = new Map();
    for (const l of gesetzt) letzteJeGruppe.set(l.includes(':') ? l.split(':')[0] : l, l);
    const gesetzteGruppen = new Set(letzteJeGruppe.keys());
    const teile = [
      ...[...letzteJeGruppe.values()].map(l => ({ text: labelKlartext(l), art: l.startsWith('status:') ? 'status' : 'label' })),
      ...entfernt.filter(l => !gesetzteGruppen.has(l.includes(':') ? l.split(':')[0] : l)).map(l => ({ text: `${labelKlartext(l)} entfernt`, art: 'entfernt' })),
      ...[...new Set(sonst)].map(t => ({ text: t, art: 'sonst' })),
    ];
    return { ...b, teile };
  });
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
      events.push({ at: t.createdAt, who: 'GitHub', kind: 'angelegt', text: 'angelegt', number: t.number, title: t.title });
      if (t.closedAt) events.push({ at: t.closedAt, who: 'GitHub', kind: 'geschlossen', text: 'geschlossen', number: t.number, title: t.title });
      else if (t.updatedAt && t.updatedAt !== t.createdAt) events.push({ at: t.updatedAt, who: 'GitHub', kind: 'aktualisiert', text: t.statusLabel, number: t.number, title: t.title });
    }
  }
  events = events.filter(e => !q || `${e.who} ${e.kind} ${e.text} ${e.title || ''} #${e.number}`.toLowerCase().includes(q)).sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 300);
  const buendel = buendeleAktivitaet(events).slice(0, 120);
  const titelVon = b => b.title || state.tasks.find(t => t.number === b.number)?.title || '';
  return `
    <div class="page-head"><div><h1>Aktivität</h1><p class="sub">Was sich an den Aufgaben geändert hat – zusammengefasst je Person und Aufgabe</p></div></div>
    <div class="toolbar"><input type="search" placeholder="Verlauf durchsuchen …" value="${esc(state.route.params.get('q') || '')}" data-param="q" aria-label="Verlauf durchsuchen"></div>
    ${activityCache?.error ? `<div class="notice warn" style="margin-bottom:12px">Verlauf konnte nicht geladen werden: ${esc(activityCache.error)}</div>` : ''}
    <section class="card"><ul class="activity">${buendel.map(b => `<li><span class="when">${fmtDateTime(b.at)}</span><div><div><a href="#" data-open="${b.number}"><span class="mono small muted">#${b.number}</span> ${esc(titelVon(b))}</a></div><div class="activity-meta"><span class="who">${esc(b.who)}</span>${b.teile.map(t => `<span class="badge ${t.art === 'status' ? 'status review' : 'plain'}">${esc(t.text)}</span>`).join('')}</div></div></li>`).join('') || '<li class="muted">Keine Einträge.</li>'}</ul></section>
    ${renderProtokoll()}
    ${renderBenutzerverwaltung()}`;
}

/** Lokales Protokoll (wer hat was gemacht) - letzte 50 Eintraege, nur lokal, nie auf GitHub. */
function renderProtokoll() {
  const eintraege = protokollCache?.eintraege || [];
  if (!eintraege.length) return '';
  return `
    <div class="page-head" style="margin-top:24px"><div><h2>Lokales Protokoll</h2><p class="sub">Letzte 50 Aktionen im Control Center (nie im Repository, nur auf diesem Mac)</p></div></div>
    <section class="card"><ul class="activity">${eintraege.map(e => `<li><span class="when">${fmtDateTime(e.zeitpunkt)}</span><div><div>${esc(e.aktion)}${e.objekt ? ` · ${esc(e.objekt)}` : ''}</div><div class="activity-meta"><span class="who">${esc(e.benutzer)}</span></div></div></li>`).join('')}</ul></section>`;
}

/** Benutzerverwaltung - nur fuer die Rolle "inhaber" sichtbar. Anlegen/Deaktivieren laeuft ueber
 * das Skript (operations/scripts/benutzer.mjs), hier reicht eine Liste plus Hinweis. */
function renderBenutzerverwaltung() {
  if (!benutzerCache) return '';
  const liste = benutzerCache.benutzer || [];
  return `
    <div class="page-head" style="margin-top:24px"><div><h2>Mitarbeiterzugänge</h2><p class="sub">${esc(benutzerCache.hinweis || '')}</p></div></div>
    <section class="card">${liste.length ? `<table class="table"><thead><tr><th>Name</th><th>Kürzel</th><th>Rolle</th><th>Status</th></tr></thead><tbody>${liste.map(b => `<tr><td>${esc(b.name)}</td><td class="mono">${esc(b.kuerzel)}</td><td>${esc(b.rolle)}</td><td>${b.aktiv ? 'aktiv' : 'deaktiviert'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Noch keine Mitarbeiterzugänge angelegt – Notzugang per Einzelpasswort aktiv.</p>'}</section>`;
}

// ---------------------------------------------------------------------------
// Ansicht: Einkauf (Bestelluebersicht + Produktdaten-Status)
// ---------------------------------------------------------------------------
const einkauf = {
  bestellungen: null, loadingBestellungen: false,
  produktstatus: null, loadingProduktstatus: false, produktstatusKey: null,
  auftragsstatus: null, loadingAuftragsstatus: false,
  kennzahlen: null, loadingKennzahlen: false,
  aktualisierung: null, loadingAktualisierung: false,
  aktualisierungLaeuft: false, aktualisierungPollTimer: null,
};

// Auftragsfluss je Position: Bestellt -> Geliefert an uns -> An Kunden raus -> Erledigt.
// Muss zu operations/lib/auftragsstatus.mjs passen (dort die fuehrende Quelle).
const AF_STATUS_ORDER = ['bestellt', 'geliefert', 'raus', 'erledigt'];
const AF_STATUS_LABEL = { bestellt: 'Bestellt', geliefert: 'Geliefert an uns', raus: 'An Kunden raus', erledigt: 'Erledigt' };
// Naechster Schritt nach dem AKTUELLEN Status (nicht nach der Filtergruppe!). "geliefert" und
// "raus" fallen beide in die Filtergruppe "unterwegs" (afFilterGruppe) - ein Mapping ueber die
// Filtergruppe wie zuvor hier stand liefert dafuer keinen Eintrag, und der "Weiter"-Button
// verschwand dauerhaft ab "Geliefert an uns": die Position blieb ohne Bedienelement stecken.
function afNaechsterStatus(status) {
  if (!status) return AF_STATUS_ORDER[0];
  const idx = AF_STATUS_ORDER.indexOf(status);
  return idx >= 0 && idx < AF_STATUS_ORDER.length - 1 ? AF_STATUS_ORDER[idx + 1] : null;
}
function afFilterGruppe(status) {
  if (!status) return 'offen';
  if (status === 'bestellt') return 'bestellt';
  if (status === 'geliefert' || status === 'raus') return 'unterwegs';
  if (status === 'erledigt') return 'erledigt';
  return 'offen';
}
function afKey(orderId, lineItemId) { return `${orderId}::${lineItemId}`; }

async function fetchEinkauf(path) {
  try {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok) return { verfuegbar: false, hinweis: `HTTP ${r.status}` };
    return await r.json();
  } catch (e) { return { verfuegbar: false, hinweis: e.message }; }
}

function ensureEinkaufBestellungen() {
  if (einkauf.bestellungen || einkauf.loadingBestellungen) return;
  einkauf.loadingBestellungen = true;
  fetchEinkauf('/api/einkauf/bestellungen').then(d => {
    einkauf.bestellungen = d; einkauf.loadingBestellungen = false;
    if (['heute', 'einkauf'].includes(state.route.view)) render();
  });
}

function ensureEinkaufAuftragsstatus() {
  if (einkauf.auftragsstatus || einkauf.loadingAuftragsstatus) return;
  einkauf.loadingAuftragsstatus = true;
  fetchEinkauf('/api/einkauf/auftragsstatus').then(d => {
    einkauf.auftragsstatus = d; einkauf.loadingAuftragsstatus = false;
    if (['heute', 'einkauf'].includes(state.route.view)) render();
  });
}

/** Setzt den Auftragsfluss-Stand einer Position. `still` unterdrueckt Toast und Neuzeichnen
 * (fuer Sammelaktionen, die am Ende selbst einmal melden und zeichnen). */
async function setzeAuftragsstatus(pos, status, { lieferantBestellnummer = null, notiz = null, still = false } = {}) {
  if (istNurLesend()) { toast('Rolle "lesen" darf keine Aenderungen vornehmen.', 'crit'); return false; }
  try {
    const r = await fetch('/api/einkauf/auftragsstatus', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId: pos.orderId, lineItemId: pos.lineItemId, status, lieferantBestellnummer, notiz }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(`Fehler: ${j.error || r.status}`, 'crit'); return false; }
    if (!einkauf.auftragsstatus || !einkauf.auftragsstatus.positionen) einkauf.auftragsstatus = { verfuegbar: true, positionen: {} };
    einkauf.auftragsstatus.positionen[afKey(pos.orderId, pos.lineItemId)] = j.eintrag;
    if (!still) { toast(`Status: ${AF_STATUS_LABEL[status]}`); render(); }
    return true;
  } catch (e) { toast(`Fehler: ${e.message}`, 'crit'); return false; }
}

function openAuftragsstatusDialog(pos, status) {
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="afTitle" data-dialog>
    <h2 id="afTitle">Bestellt · ${esc(pos.orderName)}</h2>
    <p class="small muted">${esc(pos.titel)} · ${esc(pos.farbe)}<br>Beim Lieferanten bestellt – Bestellnummer des Lieferanten notieren (optional, hilft bei Rückfragen).</p>
    <div class="field"><label for="afNr">Lieferanten-Bestellnummer</label><input id="afNr" name="nr" placeholder="z. B. 2026-4711" maxlength="200"></div>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Übernehmen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('input')?.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    form.querySelector('[type=submit]').disabled = true;
    const ok = await setzeAuftragsstatus(pos, status, { lieferantBestellnummer: (new FormData(form).get('nr') || '').trim() || null });
    if (ok) $('#dialogRoot').innerHTML = '';
    else form.querySelector('[type=submit]').disabled = false;
  });
}

function ensureEinkaufKennzahlen() {
  if (einkauf.kennzahlen || einkauf.loadingKennzahlen) return;
  einkauf.loadingKennzahlen = true;
  fetchEinkauf('/api/einkauf/kennzahlen').then(d => {
    einkauf.kennzahlen = d; einkauf.loadingKennzahlen = false;
    if (state.route.view === 'heute') render();
  });
}

const AKTUALISIERUNG_TEIL_LABEL = { lexikon: 'Lexikon', bestellungen: 'Bestellübersicht', kennzahlen: 'Kennzahlen' };

function ensureAktualisierung() {
  if (einkauf.aktualisierung || einkauf.loadingAktualisierung) return;
  einkauf.loadingAktualisierung = true;
  fetchEinkauf('/api/aktualisierung').then(d => {
    einkauf.aktualisierung = d; einkauf.loadingAktualisierung = false;
    einkauf.aktualisierungLaeuft = !!d.laeuft;
    if (['heute', 'insights', 'einkauf'].includes(state.route.view)) render();
  });
}

/** Knopf "Jetzt aktualisieren" - nur lokal, wo die privaten Datenquellen ueberhaupt existieren.
 * Gesperrt und mit Ladehinweis waehrend ein Lauf aktiv ist (sowohl serverseitig als auch nach
 * einem Klick auf diesem Tab); das Ergebnis je Quelle zeigt danach aktualisierungHealth(). */
function aktualisierenButton() {
  if (state.capabilities.mode !== 'local') return '';
  const laeuft = einkauf.aktualisierungLaeuft;
  return `<button class="btn" type="button" data-action="aktualisieren" ${laeuft ? 'disabled' : ''}>${laeuft ? 'Wird aktualisiert …' : 'Jetzt aktualisieren'}</button>`;
}

/** Systemgesundheit-Zeilen fuer die lokalen Datenquellen (Lexikon, Bestellübersicht, Kennzahlen). */
function aktualisierungHealth() {
  const a = einkauf.aktualisierung;
  if (!a) return [];
  if (!a.verfuegbar) {
    return [{ level: 'warn', title: 'Lokale Datenquellen noch nie aktualisiert', detail: `${a.hinweis || ''} Befehl: ${a.befehl || 'npm run daten:aktualisieren'}` }];
  }
  return Object.entries(a.teile || {}).map(([teil, stand]) => {
    const label = AKTUALISIERUNG_TEIL_LABEL[teil] || teil;
    if (!stand.erfolg) {
      // Ohne Zugang (z.B. kein SHOPIFY_ADMIN_TOKEN in .env.local) laeuft der Lauf ins Leere -
      // die vorhandene Ausgabedatei bleibt unveraendert stehen, ist also aelter als der
      // gescheiterte Versuch. Kein "Stand: <Versuchszeitpunkt>" vortaeuschen.
      const keinZugang = /kein zugang/i.test(stand.meldung || '');
      const versuch = stand.zeitpunkt ? fmtDateTime(stand.zeitpunkt) : 'unbekannt';
      return {
        level: 'warn',
        title: keinZugang ? `${label}: Kein Zugang hinterlegt` : `${label}: letzter Lauf fehlgeschlagen`,
        detail: `${stand.meldung || ''} · Versuch ${versuch} – die vorhandenen (älteren) Daten bleiben unverändert stehen · Befehl: npm run daten:aktualisieren -- --nur ${teil}`,
      };
    }
    if (stand.letzterFehler) {
      // Der letzte Versuch scheiterte, die Daten des erfolgreichen Laufs davor gelten weiter:
      // deren Stand zeigen, den Fehlschlag daneben (operations/scripts/aktualisieren.mjs, standNachLauf).
      const f = stand.letzterFehler;
      const keinZugang = /kein zugang/i.test(f.meldung || '');
      return {
        level: 'warn',
        title: `${label}: Stand ${fmtDateTime(stand.zeitpunkt)}${stand.veraltet ? ' – Daten veraltet' : ''} · ${keinZugang ? 'Aktualisieren ohne Zugang' : 'letzter Versuch fehlgeschlagen'}`,
        detail: `${stand.anzahl ?? '?'} Datensätze · Versuch ${f.zeitpunkt ? fmtDateTime(f.zeitpunkt) : 'unbekannt'}: ${f.meldung || ''}${keinZugang ? ' · Auf diesem Rechner aktualisiert der geplante Export-Lauf die Daten.' : ''}`,
      };
    }
    if (stand.veraltet) return { level: 'warn', title: `${label}: Stand ${fmtDateTime(stand.zeitpunkt)} – Daten veraltet`, detail: 'Bitte `npm run daten:aktualisieren` ausführen.' };
    return { level: 'ok', title: `${label}: Stand ${fmtDateTime(stand.zeitpunkt)}`, detail: stand.anzahl !== null && stand.anzahl !== undefined ? `${stand.anzahl} Datensätze${stand.meldung ? ` · ${stand.meldung}` : ''}` : (stand.meldung || '') };
  });
}

function ensureEinkaufProduktstatus() {
  const p = state.route.params;
  const qs = new URLSearchParams({ page: p.get('seite') || '1', pageSize: '25', q: p.get('psq') || '', gruppe: p.get('gruppe') || '', filter: psFilterAktiv() === 'alle' ? '' : psFilterAktiv() }).toString();
  if (einkauf.produktstatusKey === qs && (einkauf.produktstatus || einkauf.loadingProduktstatus)) return;
  einkauf.produktstatusKey = qs;
  einkauf.loadingProduktstatus = true;
  fetchEinkauf(`/api/einkauf/produktstatus?${qs}`).then(d => {
    einkauf.produktstatus = d; einkauf.loadingProduktstatus = false;
    if (state.route.view === 'einkauf') render();
  });
}

function kopierbutton(id, label = 'Liste kopieren') {
  return `<button type="button" class="btn btn-sm" data-kopieren="${esc(id)}">${esc(label)}</button>`;
}

const EINKAUF_AMPEL_LABEL = { gruen: 'Bereit', gelb: 'Prüfen', rot: 'Blockiert', grau: 'Geschlossen', test: 'Testbestellung' };

/** Menschenlesbare Anzeige statt des internen Markers "UNGEKLAERT" (Grosshandel-Exportdaten). */
function anzeigeWert(wert) { return wert === 'UNGEKLAERT' ? 'Ungeklärt' : wert; }

function afEintragFuer(p) {
  return einkauf.auftragsstatus?.positionen?.[afKey(p.orderId, p.lineItemId)] || null;
}

/** Lieferanten-Link oder kurzer Hinweis, warum keiner hinterlegt ist. */
function lieferantLinkZelle(p) {
  // Zwei Wege zum Originalartikel: direkt zum Lieferanten, wenn eine
  // Produktseite hinterlegt ist - und immer ins Lexikon, wo Originalname,
  // Artikelnummer, Farbnummer und Bestellweg beieinanderstehen. Ohne den
  // Lexikon-Weg bliebe die Zelle bei fehlender URL eine Sackgasse.
  const lex = p.handle
    ? `<div style="margin-top:4px"><a class="btn btn-sm btn-ghost" href="#" data-lex-open="${esc(p.handle)}" title="Originalname, Artikelnummer und Bestellweg im Lexikon">Lexikon</a></div>`
    : '';
  if (hatLieferantLink(p)) {
    return `<a class="btn btn-sm" href="${esc(p.lieferantUrl)}" target="_blank" rel="noopener" title="Produktseite beim Lieferanten in neuem Tab">Öffnen ↗</a>${lex}`;
  }
  return `<span class="small muted" title="Metafeld einkauf.lieferant_url fehlt">kein Link</span>${lex}`;
}
const hatLieferantLink = p => Boolean(p.lieferantUrl && p.lieferantUrl !== 'UNGEKLAERT');

/** Status-Zelle: aktueller Stand + Knopf fuer den naechsten Schritt. */
function afStatusZelle(p) {
  const eintrag = afEintragFuer(p);
  const status = eintrag?.status || null;
  const gruppe = afFilterGruppe(status);
  const badgeClass = gruppe === 'erledigt' ? 'fertig' : gruppe === 'unterwegs' ? 'in-arbeit' : gruppe === 'bestellt' ? 'freigabe' : 'plain';
  const stand = status ? `<div class="small muted">${fmtDateTime(eintrag.aktualisiertAm)} · @${esc(eintrag.aktualisiertVon)}</div>` : '';
  const nr = eintrag?.lieferantBestellnummer ? `<div class="small muted">Bestellnr. ${esc(eintrag.lieferantBestellnummer)}</div>` : '';
  const naechster = afNaechsterStatus(status);
  const btn = naechster ? `<button type="button" class="btn btn-sm" data-af-set data-af-order="${esc(p.orderId)}" data-af-item="${esc(p.lineItemId)}" data-af-status="${naechster}" data-af-name="${esc(p.orderName)}" data-af-titel="${esc(p.titel)}" data-af-farbe="${esc(p.farbe)}">→ ${esc(AF_STATUS_LABEL[naechster])}</button>` : '';
  return `<span class="badge status ${badgeClass}">${esc(status ? AF_STATUS_LABEL[status] : 'Noch nicht bestellt')}</span>${stand}${nr}${btn ? `<div style="margin-top:6px">${btn}</div>` : ''}`;
}

/** Fehlt einer Position etwas, das die Bestellung beim Lieferanten verhindert? */
function positionUnvollstaendig(p) {
  return p.grosshaendlerId === 'UNGEKLAERT' || p.bestellmenge?.menge === 'UNGEKLAERT' || !hatLieferantLink(p);
}

function einkaufGruppeKarte(g, i, praefix) {
  const id = `ek-${praefix}-${i}`;
  const af = state.route.params.get('af') || '';
  // Ohne Filter zeigt die Liste alles, was noch Arbeit macht - "Erledigt" nur auf Wunsch.
  const positionen = g.positionen.filter(p => { const gr = afFilterGruppe(afEintragFuer(p)?.status); return af ? gr === af : gr !== 'erledigt'; });
  if (!positionen.length) return '';
  const unbekannt = g.lieferant === 'UNGEKLAERT';
  const luecken = positionen.filter(positionUnvollstaendig).length;
  const titel = unbekannt ? 'Lieferant nicht zugeordnet' : `Lieferant ${esc(g.lieferant)}`;
  const route = g.route && g.route !== 'UNGEKLAERT' && g.route !== 'MUSTER' ? ` <span class="badge plain">${esc(g.route)}</span>` : '';
  const unterzeile = luecken
    ? `<p class="small warnc" style="margin:-6px 0 10px">${plural(luecken, 'Artikel kann', 'Artikel können')} so nicht bestellt werden – Angaben fehlen (siehe markierte Felder).</p>`
    : unbekannt ? '<p class="small muted" style="margin:-6px 0 10px">Großhändler-ID und Produktseite sind je Artikel hinterlegt – über „Öffnen" beim Lieferanten bestellen.</p>' : '';
  const ungeklaert = grund => `<span class="badge gap" title="${esc(grund || 'Nicht in Shopify hinterlegt')}">fehlt</span>`;
  const zeilen = positionen.map(p => `<tr class="${positionUnvollstaendig(p) ? 'row-gap' : ''}">
      <td><div class="cell-title">${esc(anzeigeWert(p.titel))}</div><div class="small muted">${esc(p.farbe)}${p.sku && p.sku !== 'UNGEKLAERT' ? ` · <span class="mono">${esc(p.sku)}</span>` : ''}</div></td>
      <td class="nowrap"><a href="${esc(adminAuftragUrl(p.orderId))}" target="_blank" rel="noopener" title="Bestellung in Shopify öffnen">${esc(p.orderName)} ↗</a><div class="small muted">${fmtDate(p.orderDatum)}</div></td>
      <td>${p.bestellmenge.menge === 'UNGEKLAERT' ? `${ungeklaert(p.bestellmenge.grund)}<div class="small muted">${esc(p.bestellmenge.grund || '')}</div>` : `<b>${esc(p.bestellmenge.text)}</b>`}<div class="small muted">Kunde: ${esc(p.kundenmenge)}</div></td>
      <td>${p.grosshaendlerId === 'UNGEKLAERT' ? `${ungeklaert(p.idGrund)}<div class="small muted">${esc(p.idGrund || '')}</div>` : `<code class="mono" data-kopiertext="${esc(p.grosshaendlerId)}" title="Klicken zum Kopieren">${esc(p.grosshaendlerId)}</code>`}</td>
      <td>${lieferantLinkZelle(p)}</td>
      <td>${afStatusZelle(p)}</td>
    </tr>`).join('');
  return `<section class="card group-card${luecken ? ' has-gap' : ''}">
    <div class="card-head"><h3>${titel}${route} <span class="muted small">${plural(positionen.length, 'Artikel', 'Artikel')}</span></h3>${kopierbutton(id)}</div>
    ${unterzeile}
    <div class="table-scroll"><table class="tasks compact"><thead><tr><th>Artikel</th><th>Auftrag</th><th>Menge beim Lieferanten</th><th>Großhändler-ID</th><th>Lieferant</th><th>Stand</th></tr></thead>
    <tbody>${zeilen}</tbody></table></div>
    <textarea id="${id}" class="visually-hidden" aria-hidden="true" tabindex="-1">${esc(kopierTextFuer(g, positionen))}</textarea>
  </section>`;
}
/** Shopify-Link eines Auftrags aus der Auftragsliste (Positionen tragen ihn nicht selbst). */
const adminAuftragUrl = id => (einkauf.bestellungen?.auftraege || []).find(a => a.id === id)?.adminUrl || '#';

function geldText(g) {
  if (!g || g.betrag === null || g.betrag === undefined) return '–';
  return `${g.betrag.toFixed(2)} ${esc(g.waehrung || 'EUR')}`;
}

function adresseText(a) {
  if (!a) return '–';
  return `${esc(a.name)}<br>${esc(a.strasse)}<br>${esc(a.plz)} ${esc(a.ort)}, ${esc(a.land)}${a.telefon && a.telefon !== '–' ? `<br>Tel: ${esc(a.telefon)}` : ''}`;
}

/** Volle Detailansicht einer Bestellung: Kunde, Adressen, Summen, Beratung, Positionen. */
function einkaufAuftragDetails(a) {
  const d = a.details;
  if (!d) return '';
  const s = d.summen || {};
  const beratungZeilen = Object.entries(d.beratungsangaben || {}).map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v || '–')}</div>`).join('') || '<div class="muted small">Keine Beratungsangaben.</div>';
  const posZeilen = (d.positionen || []).map(p => `<tr>
      <td>${esc(p.titel)}<div class="small muted">${esc(p.sku || '–')}</div></td>
      <td>${esc(p.farbe)}</td>
      <td>${esc(p.kundenmasse)}</td>
      <td>${geldText(p.preis)}</td>
      <td>${esc(p.lieferantenArtikelnummer === 'UNGEKLAERT' ? '–' : p.lieferantenArtikelnummer)}${p.lieferantenLink && p.lieferantenLink !== 'UNGEKLAERT' ? `<div class="small"><a href="${esc(p.lieferantenLink)}" target="_blank" rel="noopener">Beim Lieferanten öffnen</a></div>` : ''}</td>
    </tr>`).join('');
  return `<div style="padding:10px 4px;display:grid;gap:10px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
      <div><b>Kunde</b><br>${esc(d.kunde?.name)}<br>${esc(d.kunde?.email)}<br>${esc(d.kunde?.telefon)}</div>
      <div><b>Lieferadresse</b><br>${adresseText(d.lieferadresse)}</div>
      <div><b>Rechnungsadresse</b><br>${adresseText(d.rechnungsadresse)}</div>
      <div><b>Versand &amp; Zahlung</b><br>Versandart: ${esc(d.versandart)}<br>Zahlungsart: ${esc(d.zahlungsart)}</div>
      <div><b>Summen</b><br>Zwischensumme: ${geldText(s.zwischensumme)}<br>Versand: ${geldText(s.versand)}<br>Steuer: ${geldText(s.steuer)}<br><b>Gesamt: ${geldText(s.gesamt)}</b></div>
      <div><b>Beratung/Angaben</b>${beratungZeilen}</div>
    </div>
    ${d.tags?.length ? `<div><b>Tags:</b> ${d.tags.map(t => `<span class="badge plain">${esc(t)}</span>`).join(' ')}</div>` : ''}
    ${d.notiz ? `<div><b>Notiz des Kunden:</b> ${esc(d.notiz)}</div>` : ''}
    <table class="tasks"><thead><tr><th>Artikel</th><th>Farbe/Variante</th><th>Kundenmaße</th><th>Preis</th><th>Lieferanten-Art.-Nr.</th></tr></thead><tbody>${posZeilen}</tbody></table>
  </div>`;
}

/** Kopiertext fuer Mail/Bestellportal - nur die gerade sichtbaren Artikel, ohne interne Marker. */
function kopierTextFuer(g, positionen) {
  const kopf = `Bestellung ${g.lieferant === 'UNGEKLAERT' ? '(Lieferant nicht zugeordnet)' : `Lieferant ${g.lieferant}`}` + (g.route && g.route !== 'UNGEKLAERT' && g.route !== 'MUSTER' ? ` (${g.route})` : '');
  return [kopf, ...positionen.map((p, i) => `${i + 1}. ${anzeigeWert(p.grosshaendlerId)} | ${anzeigeWert(p.titel)} | ${p.farbe} | ${p.bestellmenge.menge === 'UNGEKLAERT' ? `ungeklärt (Kunde: ${p.kundenmenge})` : p.bestellmenge.text} | Kd.-Best. ${p.orderName}`)].join('\n');
}

const FINANZ_LABEL = { PAID: 'bezahlt', PENDING: 'Zahlung offen', AUTHORIZED: 'Zahlung autorisiert', PARTIALLY_PAID: 'teilweise bezahlt', REFUNDED: 'erstattet', PARTIALLY_REFUNDED: 'teilweise erstattet', VOIDED: 'Zahlung storniert', EXPIRED: 'Zahlung abgelaufen' };
const VERSAND_LABEL = { UNFULFILLED: 'nicht versendet', FULFILLED: 'versendet', PARTIALLY_FULFILLED: 'teilweise versendet', IN_PROGRESS: 'in Bearbeitung', ON_HOLD: 'angehalten', SCHEDULED: 'geplant', RESTOCKED: 'zurückgelegt', OPEN: 'offen' };
/** Hinweise aus der Aufbereitung in Alltagssprache (interne Marker nie roh zeigen). */
const hinweisText = h => String(h).replace(/UNGEKLAERT/g, 'ungeklärt').replace(/Position\(en\)/g, 'Artikel').replace(/Einkaufsmenge\(n\)/g, 'Bestellmenge(n)').replace(/^Zahlung: (\w+)$/, (_, c) => FINANZ_LABEL[c] ? `Zahlung: ${FINANZ_LABEL[c]}` : `Zahlung: ${c}`);

/**
 * Ein Auftrag als Karte: Ampel, Nummer, Datum, was fehlt - in Klartext. Die frueheren
 * Chips (Bezahlt: PAID, Telefon: fehlt, …) standen bei jedem Auftrag, auch wenn sie
 * nichts bedeuteten; jetzt erscheint nur, was vom Normalfall abweicht.
 */
function einkaufAuftragZeile(a) {
  const offen = auftragOffenePositionen(a);
  const artikel = offen.map(p => anzeigeWert(p.titel)).filter(Boolean);
  const abweichungen = [];
  if (a.erfuellt && a.erfuellt !== 'UNFULFILLED' && VERSAND_LABEL[a.erfuellt]) abweichungen.push(VERSAND_LABEL[a.erfuellt]);
  if (a.checks?.verlegung === 'Ja' && !a.hinweise?.some(h => /Verlegung/.test(h))) abweichungen.push('Verlegung gebucht');
  const ampelKlasse = a.ampel === 'rot' ? 'blockiert' : a.ampel === 'gelb' ? 'freigabe' : a.ampel === 'gruen' ? 'fertig' : 'plain';
  const detail = einkaufAuftragDetails(a);
  const kopf = `<div class="order-row ${esc(a.ampel)}">
    <div class="order-main">
      <div class="t"><span class="badge status ${ampelKlasse}">${esc(EINKAUF_AMPEL_LABEL[a.ampel] || a.ampel)}</span> <a href="${esc(a.adminUrl || '')}" target="_blank" rel="noopener" title="In Shopify öffnen" onclick="event.stopPropagation()">${esc(a.name)} ↗</a> <span class="muted small">${fmtDate(a.datum)}</span>${abweichungen.map(x => ` <span class="badge plain">${esc(x)}</span>`).join('')}</div>
      ${artikel.length ? `<div class="small muted">${esc(artikel.slice(0, 3).join(' · '))}${artikel.length > 3 ? ` · +${artikel.length - 3}` : ''}</div>` : ''}
      ${a.hinweise?.length ? `<ul class="order-issues">${a.hinweise.map(h => `<li>${esc(hinweisText(h))}</li>`).join('')}</ul>` : ''}
    </div>
    ${offen.length && a.ampel !== 'gruen' ? `<button type="button" class="btn btn-sm btn-ghost" onclick="event.preventDefault()" data-auftrag-erledigt="${esc(a.id)}" title="Z. B. Testbestellung oder anders erledigt – setzt die Artikel im Auftragsfluss auf „Erledigt"">Ohne Einkauf abschließen…</button>` : ''}
  </div>`;
  // Ohne Detaildaten bleibt es bei der Zeile; sonst klappt die volle Bestellung darunter auf.
  if (!detail) return kopf;
  return `<details class="order-details"><summary>${kopf}</summary>${detail}</details>`;
}

const AF_FILTER_LABEL = { offen: 'Noch zu bestellen', bestellt: 'Bestellt', unterwegs: 'Unterwegs', erledigt: 'Erledigt' };

/** Filter nach Auftragsfluss-Schritt. Ohne Auswahl: alles ausser "Erledigt". */
function afFilterChips(allePositionen) {
  const zaehler = { offen: 0, bestellt: 0, unterwegs: 0, erledigt: 0 };
  for (const p of allePositionen) zaehler[afFilterGruppe(afEintragFuer(p)?.status)] += 1;
  const af = state.route.params.get('af') || '';
  const offenGesamt = zaehler.offen + zaehler.bestellt + zaehler.unterwegs;
  return `<div class="chips" role="group" aria-label="Nach Auftragsfluss filtern">
    <button type="button" class="chip" data-param="af" data-value="" aria-pressed="${!af}">Alle offenen<span class="c">${offenGesamt}</span></button>
    ${Object.keys(AF_FILTER_LABEL).map(k => `<button type="button" class="chip" data-param="af" data-value="${k}" aria-pressed="${af === k}">${esc(AF_FILTER_LABEL[k])}<span class="c">${zaehler[k]}</span></button>`).join('')}
  </div>`;
}

function viewEinkaufBestellungen() {
  ensureEinkaufBestellungen();
  ensureEinkaufAuftragsstatus();
  const d = einkauf.bestellungen;
  if (!d && einkauf.loadingBestellungen) return `<div class="empty">Lade Bestellübersicht …</div>`;
  if (!d || !d.verfuegbar) return emptyState('Keine Bestelldaten verfügbar.', d?.hinweis || 'Quelle fehlt oder ist leer.');
  const { ware, muster, gruppe } = einkaufPositionenMitStand(d);
  const aktiv = aktiveAuftraege(d);
  const klaeren = aktiv.filter(a => a.ampel === 'rot' || a.ampel === 'gelb').sort((a, b) => (a.ampel === 'rot' ? 0 : 1) - (b.ampel === 'rot' ? 0 : 1));
  const rot = klaeren.filter(a => a.ampel === 'rot').length;
  const wareKarten = (d.gruppen || []).map((g, i) => einkaufGruppeKarte(g, i, 'ware')).join('');
  const musterKarten = (d.musterGruppen || []).map((g, i) => einkaufGruppeKarte(g, i, 'muster')).join('');
  const af = state.route.params.get('af') || '';
  const leer = af ? 'Kein Artikel in diesem Schritt.' : 'Alles bestellt.';
  return `
    <div class="band">
      ${bandItem(aktiv.length, 'offene Kundenaufträge', 'plain')}
      ${bandItem(ware.filter(p => gruppe(p) === 'offen').length, 'Artikel noch zu bestellen', 'warn')}
      ${bandItem(muster.filter(p => gruppe(p) === 'offen').length, 'Muster noch zu bestellen', 'warn')}
      ${bandItem(rot, rot === 1 ? 'Auftrag mit Problem' : 'Aufträge mit Problem', 'crit')}
    </div>
    ${klaeren.length ? `<section class="card problem-card"><div class="card-head"><h2>Zuerst klären</h2><span class="more muted">Rot = blockiert, Gelb = vor dem Bestellen prüfen</span></div><div class="rows">${klaeren.map(einkaufAuftragZeile).join('')}</div></section>` : ''}
    <div class="section-bar"><h2 class="section-title" style="margin:0">Bestellen</h2>${afFilterChips([...ware, ...muster])}</div>
    <h3 class="sub-title">Ware <span class="muted small">je Lieferant</span></h3>
    ${wareKarten || emptyState(leer, af ? '' : 'Keine offenen Warenartikel.')}
    <h3 class="sub-title">Muster</h3>
    ${musterKarten || emptyState(af ? leer : 'Keine offenen Muster.', '')}
    <details class="card section plain-details"><summary><h2>Alle offenen Aufträge</h2><span class="preview">${aktiv.length}</span></summary>
      <div class="rows" style="margin-top:10px">${aktiv.map(einkaufAuftragZeile).join('') || emptyState('Keine offenen Aufträge.', '')}</div>
    </details>
    ${(d.testauftraege || []).length ? `<details style="margin-top:20px">
      <summary style="cursor:pointer;font-weight:600">Testbestellungen (${d.testauftraege.length}) – zählen in keiner Kennzahl</summary>
      <p class="small muted" style="margin:6px 0">Tag „TESTBESTELLUNG" oder Shopify-Feld test=true. Fließen nicht in Auftragsampel, Einkauf oder Shop-Zahlen ein.</p>
      <div class="rows">${d.testauftraege.map(einkaufAuftragZeile).join('')}</div>
    </details>` : ''}
    <p class="small muted" style="margin-top:12px">Stand der Bestellungen: ${esc(fmtDateTime(d.exportiertAm || d.erstellt))} · Hier wird nie etwas automatisch bestellt oder versendet.</p>`;
}

/** Dialog "Ohne Einkauf abschließen": setzt alle offenen Artikel eines Auftrags auf Erledigt. */
function openAuftragAbschliessenDialog(orderId) {
  const a = (einkauf.bestellungen?.auftraege || []).find(x => x.id === orderId);
  if (!a) return;
  const offen = auftragOffenePositionen(a).filter(p => p.lineItemId);
  if (!offen.length) { toast('Keine offenen Artikel in diesem Auftrag.'); return; }
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="abTitle" data-dialog>
    <h2 id="abTitle">Ohne Einkauf abschließen · ${esc(a.name)}</h2>
    <p class="small muted">Setzt ${plural(offen.length, 'Artikel', 'Artikel')} dieses Auftrags im Auftragsfluss auf „Erledigt". Gedacht für Testbestellungen oder Aufträge, die anders erledigt wurden. In Shopify ändert sich nichts; der Schritt lässt sich über den Filter „Erledigt" nachvollziehen.</p>
    <ul class="small" style="margin:0;padding-left:18px">${offen.map(p => `<li>${esc(anzeigeWert(p.titel))} · ${esc(p.farbe)}</li>`).join('')}</ul>
    <div class="field"><label for="abGrund">Grund (Pflicht)</label><textarea id="abGrund" name="grund" required maxlength="500" placeholder="z. B. Testbestellung, kein Einkauf nötig"></textarea></div>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Abschließen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('textarea')?.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const grund = (new FormData(form).get('grund') || '').trim();
    if (!grund) return;
    form.querySelector('[type=submit]').disabled = true;
    let ok = 0;
    for (const p of offen) {
      if (await setzeAuftragsstatus({ orderId: a.id, lineItemId: p.lineItemId }, 'erledigt', { notiz: grund, still: true })) ok += 1;
    }
    $('#dialogRoot').innerHTML = '';
    toast(ok === offen.length ? `${a.name}: ${plural(ok, 'Artikel', 'Artikel')} abgeschlossen` : `${a.name}: nur ${ok} von ${offen.length} abgeschlossen`, ok === offen.length ? '' : 'crit');
    render();
  });
}

// Standard ist "Braucht Handarbeit": das ist die Arbeitsliste und dieselbe Zahl wie die
// Kachel darueber (die Kachel stand sonst neben einer anders gezaehlten Liste).
// "Alle offenen" (auch reine Zusatzinfos) bleibt einen Klick entfernt.
const EINKAUF_PSFILTER_LABEL = { handarbeit: 'Braucht Handarbeit', blockierend: 'Blockiert eine Bestellung', alle: 'Alle offenen Produkte' };
const PSFILTER_STANDARD = 'handarbeit';
function psFilterAktiv() {
  const f = state.route.params.get('psfilter');
  return Object.hasOwn(EINKAUF_PSFILTER_LABEL, f || '') ? f : PSFILTER_STANDARD;
}

function viewEinkaufProduktdaten() {
  ensureEinkaufProduktstatus();
  const d = einkauf.produktstatus;
  const p = state.route.params;
  const psfilter = psFilterAktiv();
  const toolbar = `<div class="toolbar">
      <input type="search" placeholder="Produkt, Handle oder SKU suchen …" value="${esc(p.get('psq') || '')}" data-param="psq" aria-label="Produktdaten durchsuchen">
      ${d?.gruppen?.length ? `<select data-param="gruppe" aria-label="Nach Produktgruppe filtern"><option value="">Alle Gruppen</option>${d.gruppen.map(g => `<option value="${esc(g.gruppe)}" ${p.get('gruppe') === g.gruppe ? 'selected' : ''}>${esc(g.gruppe)}</option>`).join('')}</select>` : ''}
    </div>
    <div class="chips" role="group" aria-label="Welche Produkte zeigen">
      ${Object.entries(EINKAUF_PSFILTER_LABEL).map(([k, l]) => `<button type="button" class="chip" data-param="psfilter" data-value="${k === PSFILTER_STANDARD ? '' : k}" aria-pressed="${psfilter === k}">${esc(l)}</button>`).join('')}
    </div>`;
  if (!d && einkauf.loadingProduktstatus) return toolbar + `<div class="empty">Lade Produktdaten-Status …</div>`;
  if (!d || !d.verfuegbar) return emptyState('Keine Produktdaten-Statusdaten verfügbar.', d?.hinweis || 'Quelle fehlt oder ist leer.');
  const g = d.gesamt;
  const gruppenzeilen = d.gruppen.map(row => {
    const summe = row.vollstaendig + row.handarbeit + row.automatisch;
    return `<tr>
      <td>${esc(row.gruppe)}</td>
      <td class="num ${row.handarbeit ? 'warnc' : 'muted'}">${row.handarbeit}</td>
      <td class="num muted">${row.automatisch}</td>
      <td class="num">${row.vollstaendig}<span class="muted"> / ${summe}</span></td>
    </tr>`;
  }).join('');
  const offen = d.offen;
  const items = offen.items.map(e => {
    const blockierend = e.offeneFelder.filter(f => f.blockierend);
    const zusatz = e.offeneFelder.filter(f => !f.blockierend);
    return `<tr>
      <td><div class="cell-title">${esc(e.titel)}</div><div class="small muted">${esc(e.gruppe)} · ${plural(e.variantenAnzahl, 'Variante', 'Varianten')}</div></td>
      <td>${blockierend.length ? blockierend.map(f => `<div class="fehlt" title="${esc(f.grund)}"><b>${esc(f.klartext)}</b>${f.variantenBetroffen < e.variantenAnzahl ? ` <span class="small muted">· ${f.variantenBetroffen}/${e.variantenAnzahl} Varianten</span>` : ''} <span class="small muted">→ ${esc(f.naechsterSchritt)}</span></div>`).join('') : '<span class="small muted">blockiert nichts</span>'}</td>
      <td class="small muted">${zusatz.length ? esc(zusatz.map(f => f.klartext).join(', ')) : '–'}</td>
    </tr>`;
  }).join('');
  const pages = offen.pages > 1 ? `<div class="pager">
      <button type="button" class="btn btn-sm" ${offen.page <= 1 ? 'disabled' : ''} data-param="seite" data-value="${offen.page - 1}">← Zurück</button>
      <span class="muted small">Seite ${offen.page} von ${offen.pages} · ${offen.count} Produkte</span>
      <button type="button" class="btn btn-sm" ${offen.page >= offen.pages ? 'disabled' : ''} data-param="seite" data-value="${offen.page + 1}">Weiter →</button>
    </div>` : '';
  return `
    <div class="band">
      ${bandItem(g.handarbeit, 'Produkte brauchen Handarbeit', 'crit')}
      ${bandItem(g.automatisch, 'nur Zusatzinfos offen (füllt sich selbst)', 'plain')}
      ${bandItem(g.vollstaendig, `von ${g.anzahl} vollständig`, 'plain')}
    </div>
    <p class="small muted" style="margin:-4px 0 14px">„Handarbeit" heißt: Lieferant, Artikelnummer, Farbnummer oder Bestellmenge fehlen – ohne sie kann nicht bestellt werden. Zusatzinfos wie Kollektion oder Hersteller halten keine Bestellung auf.</p>
    ${toolbar}
    <section class="card"><div class="card-head"><h2>${esc(EINKAUF_PSFILTER_LABEL[psfilter])}</h2><span class="more muted">${offen.count} Produkte · dringendste zuerst</span></div>
      ${items ? `<div class="table-scroll"><table class="tasks compact"><thead><tr><th>Produkt</th><th>Was fehlt für die Bestellung</th><th>Außerdem offen</th></tr></thead><tbody>${items}</tbody></table></div>` : emptyState('Keine Treffer.', psfilter !== 'alle' && !p.get('psq') ? 'Hier ist gerade nichts zu tun.' : 'Suche oder Filter anpassen.')}
      ${pages}
    </section>
    <details class="card section plain-details"><summary><h2>Je Produktgruppe</h2><span class="preview">${d.gruppen.length} Gruppen</span></summary>
      <div class="table-scroll" style="margin-top:10px"><table class="tasks compact"><thead><tr><th>Gruppe</th><th class="num">Handarbeit</th><th class="num">Nur Zusatzinfos</th><th class="num">Vollständig</th></tr></thead><tbody>${gruppenzeilen}</tbody></table></div>
    </details>`;
}

function viewEinkaufHilfe() {
  return `<section class="card">
    <h2>Dein Tag im Einkauf</h2>
    <p class="small muted">So gehst du die Bestellübersicht in der Praxis durch, Schritt für Schritt:</p>
    <ol style="margin:0 0 4px;padding-left:22px;line-height:1.7">
      <li>Öffne den Tab „Bestellungen" und schau oben auf die Zahlen: wie viele Artikel und Muster noch zu bestellen sind und wie viele Aufträge ein Problem haben.</li>
      <li>Kümmere dich zuerst um den Kasten „Zuerst klären" – dort steht bei jedem Auftrag in Klartext, was fehlt, z. B. eine Großhändler-ID. War es nur eine Testbestellung oder ist der Auftrag anders erledigt, schließe ihn mit „Ohne Einkauf abschließen…" und einem Grund ab.</li>
      <li>Gehe dann die restlichen Positionen gruppiert nach Lieferant durch. Klicke bei jedem Artikel auf „Öffnen" – das öffnet die passende Produktseite des Lieferanten in einem neuen Tab. Die Großhändler-ID kopierst du mit einem Klick darauf.</li>
      <li>Bestelle dort wie gewohnt (Telefon, E-Mail, Bestellportal – je nach Lieferant).</li>
      <li>Trage die Bestellung hier ein: Klick auf „→ Bestellt" und gib die Bestellnummer des Lieferanten ein (optional, hilft aber bei Rückfragen).</li>
      <li>Sobald die Ware bei dir ankommt, setze die Position auf „Geliefert an uns"; sobald sie an den Kunden raus ist (verschickt oder abgeholt), auf „An Kunden raus"; zum Schluss auf „Erledigt".</li>
      <li>Der Filter über den Listen („Noch zu bestellen / Bestellt / Unterwegs / Erledigt") zeigt dir jederzeit, wie viele Artikel in welchem Schritt stehen. Ohne Auswahl siehst du alles, was noch nicht erledigt ist.</li>
    </ol>

    <h3 style="margin-top:20px">Was tun, wenn etwas fehlt?</h3>
    <ul style="margin:0 0 4px;padding-left:22px;line-height:1.7">
      <li><b>Ein Wert zeigt „Ungeklärt":</b> Das bedeutet, die Angabe ist in Shopify nicht (mehr) hinterlegt – oft weil eine Produktvariante zwischenzeitlich gelöscht wurde. Bitte den Artikel von Hand im Shopify-Adminbereich prüfen und, falls nötig, im Team klären. Nicht raten und nichts erfinden.</li>
      <li><b>Kein Lieferant-Link vorhanden:</b> Bestelle über den gewohnten Weg (Telefon/E-Mail) und melde die fehlende Produktseite, damit sie ergänzt werden kann.</li>
      <li><b>Eine Position lässt sich nicht weiterschalten oder eine Zahl sieht falsch aus:</b> Seite neu laden (der Stand liegt in einer lokalen Datei auf diesem Mac). Bleibt der Fehler, kurz im Team Bescheid geben – nichts wird automatisch verschickt, ein falscher Klick bestellt also nichts.</li>
      <li><b>Die Bestellübersicht bleibt leer:</b> Die Ansicht braucht den lokalen Server (<span class="mono">npm run dashboard</span>) und exportierte Bestelldaten. Ohne die Datei zeigt die Seite einen Hinweis statt erfundener Zahlen.</li>
    </ul>

    <h3 style="margin-top:20px">Begriffe kurz erklärt</h3>
    <ul style="margin:0 0 4px;padding-left:22px;line-height:1.7">
      <li><b>Position:</b> eine einzelne Zeile innerhalb einer Kundenbestellung, meist ein Artikel in einer bestimmten Farbe/Größe – eine Bestellung kann mehrere Positionen haben.</li>
      <li><b>Ampel:</b> eine farbige Markierung, die auf einen Blick zeigt, wie es um einen Auftrag steht: grün = bereit, gelb = erst prüfen, rot = blockiert (z. B. fehlende Angabe).</li>
      <li><b>Großhändler-ID:</b> die interne Bestellnummer/Artikelnummer, unter der der Lieferant (Großhändler) den Artikel führt – nicht dieselbe Nummer wie in unserem eigenen Shop.</li>
      <li><b>Ungeklärt:</b> die Angabe fehlt oder konnte nicht automatisch ermittelt werden (siehe oben, „Was tun, wenn etwas fehlt?").</li>
      <li><b>Triage:</b> eine neue Aufgabe wird zuerst bewertet (Priorität, Zuständigkeit, nächster Schritt), bevor jemand sie bearbeitet – vergleichbar mit „Posteingang sortieren".</li>
      <li><b>P0 / P1 / P2 / P3:</b> Prioritätsstufen für Aufgaben im Bereich „Arbeit", von P0 (kritisch, sofort) bis P3 (niedrig, hat Zeit).</li>
    </ul>

    <h3 style="margin-top:20px">Die drei Unteransichten im Detail</h3>
    <p><b>Bestellungen:</b> zeigt jede offene Kundenbestellung mit Ampel (grün = bereit, gelb = erst prüfen, rot = blockiert, z. B. fehlende Großhändler-ID oder Maßprüfungs-Problem) und darunter die Positionen, gruppiert nach Lieferant. Jede Zeile zeigt Kundenauftrag und Datum, Artikel, Farbe/Variante, die Kundenmenge und die daraus berechnete Bestellmenge beim Lieferanten samt Einheit, die Großhändler-ID, einen Link „Beim Lieferanten öffnen" (öffnet die Lieferanten-Produktseite in einem neuen Tab) und den Status mit dem Button für den nächsten Schritt. Über „Liste kopieren" kannst du die Bestellliste eines Lieferanten weiterhin komplett in eine Mail oder ein Bestellportal einfügen. Muster (Bestellungen von Produktmustern statt ganzer Ware) stehen in einer eigenen Liste. Der Auftrags-Link führt direkt zur Bestellung in Shopify.</p>
    <p><b>Status setzen:</b> „Bestellt" fragt nach der Bestellnummer des Lieferanten (optional, aber hilfreich bei Rückfragen) und merkt sich, wer wann bestellt hat. Die weiteren Schritte („Geliefert an uns", „An Kunden raus", „Erledigt") brauchen keine weitere Eingabe. Der Filter über den Listen („Noch zu bestellen / Bestellt / Unterwegs / Erledigt") blendet die Listen entsprechend ein oder aus; erledigte Artikel erscheinen nur unter „Erledigt".</p>
    <p><b>Produktdaten:</b> zeigt je PRODUKT (nicht je Variante) eine Zeile: wie viele Varianten es hat, was fehlt und was der nächste Schritt ist. Oben steht ehrlich, wie viele von den insgesamt erfassten Produkten vollständig sind, wie viele Handarbeit brauchen und wie viele sich von selbst füllen, sobald der laufende Lieferantenabgleich weiterläuft. „Handarbeit" heißt: eine Bestellung ist blockiert, weil Lieferant, Artikelnummer, Farbnummer oder Bestellmenge fehlen – das muss jemand von Hand in der Preisliste nachschauen. Zusatzinformation wie Kollektion oder Hersteller blockiert nichts und taucht nur als „füllt sich automatisch" auf. Filter oben: zuerst die Produkte, die Handarbeit brauchen (dieselbe Zahl wie die Kachel) – daneben „Blockiert eine Bestellung" und „Alle offenen Produkte"; dazu Suche nach Produktname, Handle oder SKU und Filter nach Produktgruppe. Sortiert ist die Liste nach Dringlichkeit – was eine Bestellung aufhält, steht oben. Die Zahl „ohne Großhändler-ID" in der Kachel „Kundengeschäft" auf „Heute" zählt etwas anderes: offene Positionen in tatsächlichen Kundenbestellungen (Bestellübersicht), nicht Lücken im gesamten Produktkatalog – beide Zahlen dürfen auseinanderlaufen, das ist kein Widerspruch.</p>
    <p><b>Wichtig:</b> Alle drei Ansichten laufen nur lokal auf dem Mac (<span class="mono">npm run dashboard</span>), weil sie private Bestell- und Einkaufsdaten lesen. Auf der öffentlichen Seite (GitHub Pages) ist der Bereich Einkauf immer leer – das ist beabsichtigt, damit keine Kundendaten oder Lieferantennamen öffentlich werden. Der Auftragsfluss-Status liegt in einer eigenen lokalen Datei auf deinem Mac und wird nie ins Repository übernommen. Nichts hier wird automatisch verschickt oder bestellt; jede Bestellung bleibt ein bewusster, manueller Schritt.</p>
  </section>`;
}

function viewEinkauf() {
  if (state.capabilities.mode !== 'local') {
    return `<div class="page-head"><div><h1>Einkauf</h1><p class="sub">Bestellübersicht und Produktdaten-Status für den Einkauf.</p></div></div>
      ${emptyState('Nur lokal im Betrieb verfügbar.', 'Diese Ansicht liest private Bestell- und Einkaufsdaten, die nie im öffentlichen Repository landen. Auf dem Mac starten: npm run dashboard')}`;
  }
  const tab = ['bestellungen', 'produktdaten', 'hilfe'].includes(state.route.params.get('tab')) ? state.route.params.get('tab') : 'bestellungen';
  const tabs = [['bestellungen', 'Bestellungen'], ['produktdaten', 'Produktdaten'], ['hilfe', 'Anleitung']];
  ensureAktualisierung();
  const head = `<div class="page-head"><div><h1>Einkauf</h1><p class="sub">Was bei welchem Lieferanten zu bestellen ist – und wo Produktdaten dafür fehlen.</p></div>
      <div class="head-actions">${aktualisierenButton()}</div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" class="tab" role="tab" aria-selected="${tab === k}" data-param="tab" data-value="${k === 'bestellungen' ? '' : k}">${esc(l)}</button>`).join('')}</div>`;
  const body = tab === 'bestellungen' ? viewEinkaufBestellungen() : tab === 'produktdaten' ? viewEinkaufProduktdaten() : viewEinkaufHilfe();
  return head + body;
}

// ---------------------------------------------------------------------------
// Ansicht: Lexikon (Produkt anhand des Kundenbegriffs finden, Original-Link)
// ---------------------------------------------------------------------------
const lexikon = {
  liste: null, loadingListe: false, listeKey: null,
  produkt: null, loadingProdukt: false, produktKey: null,
};

function ensureLexikonListe() {
  const q = state.route.params.get('lq') || '';
  const seite = state.route.params.get('lseite') || '1';
  const key = `${q}::${seite}`;
  if (lexikon.listeKey === key && (lexikon.liste || lexikon.loadingListe)) return;
  lexikon.listeKey = key;
  lexikon.loadingListe = true;
  fetchEinkauf(`/api/lexikon/liste?${new URLSearchParams({ q, page: seite })}`).then(d => {
    lexikon.liste = d; lexikon.loadingListe = false;
    if (state.route.view === 'lexikon') render();
  });
}

function ensureLexikonProdukt(handle) {
  if (lexikon.produktKey === handle && (lexikon.produkt || lexikon.loadingProdukt)) return;
  lexikon.produktKey = handle;
  lexikon.loadingProdukt = true;
  fetchEinkauf(`/api/lexikon/produkt?${new URLSearchParams({ handle })}`).then(d => {
    lexikon.produkt = d; lexikon.loadingProdukt = false;
    if (state.route.view === 'lexikon') render();
  });
}

const NICHT_HINTERLEGT = '<span class="small muted">nicht hinterlegt</span>';
function lexWert(w) { return (w === null || w === undefined || w === '') ? NICHT_HINTERLEGT : esc(String(w)); }

function lexikonTrefferZeile(p) {
  const bild = p.bild ? `<img src="${esc(p.bild)}" alt="" loading="lazy" style="width:48px;height:48px;object-fit:cover;border-radius:6px;background:var(--bg-2,#eee)">` : `<div style="width:48px;height:48px;border-radius:6px;background:var(--bg-2,#eee)"></div>`;
  return `<div class="row" data-lex-open="${esc(p.handle)}" tabindex="0" role="button" style="cursor:pointer">
    <div style="display:flex;gap:10px;align-items:center">
      ${bild}
      <div>
        <div class="t">${esc(p.titel)}</div>
        <div class="m">${p.produktgruppe ? esc(p.produktgruppe) : NICHT_HINTERLEGT} · ${p.farbenAnzahl} Farbe${p.farbenAnzahl === 1 ? '' : 'n'}</div>
      </div>
    </div>
  </div>`;
}

function viewLexikonListe() {
  ensureLexikonListe();
  const q = state.route.params.get('lq') || '';
  const toolbar = `<div class="toolbar search-hero"><input type="search" placeholder="Was hat der Kunde gesagt? Produktname, Farbe, SKU oder Artikelnummer …" value="${esc(q)}" data-param="lq" aria-label="Lexikon durchsuchen"></div>`;
  const d = lexikon.liste;
  if (!d && lexikon.loadingListe) return toolbar + `<div class="empty">Lade Lexikon …</div>`;
  if (!d || !d.verfuegbar) {
    const hinweis = `${d?.hinweis || 'Noch keine Daten exportiert.'}${d?.befehl ? ` Befehl: ${d.befehl}` : ''}`;
    return toolbar + emptyState('Keine Lexikon-Daten verfügbar.', hinweis);
  }
  const t = d.treffer;
  // Ohne Suchbegriff zuerst die Suche anbieten statt 638 Produkte in Shop-Reihenfolge -
  // die Liste bleibt einen Klick entfernt ("Alle durchblättern").
  if (!q && !state.route.params.get('lalle')) {
    return `${toolbar}
      <div class="empty search-hint"><strong>${d.anzahl} Produkte im Lexikon.</strong> Tippe ein, was der Kunde genannt hat – das Lexikon findet das Produkt samt Lieferanten-Artikelnummer und Link. <button type="button" class="btn btn-sm" data-param="lalle" data-value="1">Alle durchblättern</button>
      <div class="small muted" style="margin-top:6px">Stand: ${esc(fmtDateTime(d.erstellt))}</div></div>`;
  }
  const pages = t.pages > 1 ? `<div class="toolbar" style="margin-top:10px">
      <button type="button" class="btn btn-sm" ${t.page <= 1 ? 'disabled' : ''} data-param="lseite" data-value="${t.page - 1}">← Zurück</button>
      <span class="muted small">Seite ${t.page} von ${t.pages} · ${t.count} Treffer</span>
      <button type="button" class="btn btn-sm" ${t.page >= t.pages ? 'disabled' : ''} data-param="lseite" data-value="${t.page + 1}">Weiter →</button>
    </div>` : '';
  return `${toolbar}
    <p class="small muted" style="margin:-4px 0 10px">${q ? `${t.count} Treffer für „${esc(q)}"` : `${d.anzahl} Produkte im Lexikon`} · Stand: ${esc(fmtDateTime(d.erstellt))}</p>
    <div class="rows">${t.items.length ? t.items.map(lexikonTrefferZeile).join('') : emptyState(q ? 'Keine Treffer.' : 'Noch keine Produkte.', q ? 'Begriff prüfen oder anders schreiben.' : '')}</div>
    ${pages}`;
}

// Lesbare deutsche Bezeichnung je internem Eigenschaften-Schluessel (aus
// operations/lib/lexikon.mjs::EIGENSCHAFTEN_FELDER). Unbekannte Schluessel
// werden trotzdem lesbar aufbereitet, nie roh angezeigt.
const EIGENSCHAFTEN_LABEL = {
  rollenbreite: 'Rollenbreite',
  qmProPaket: 'm² pro Paket',
  florhoehe: 'Florhöhe',
  material: 'Material',
  ruecken: 'Rücken',
  nutzungsklasse: 'Nutzungsklasse',
  fussbodenheizung: 'Fußbodenheizung',
  brandverhalten: 'Brandverhalten',
  belagsart: 'Belagsart',
  optik: 'Optik',
  fasermaterial: 'Fasermaterial',
  zimmer: 'Zimmer',
  aufbau: 'Aufbau',
  gesamtstaerke: 'Gesamtstärke',
  poleneinsatzgewicht: 'Poleneinsatzgewicht',
  komfortklasse: 'Komfortklasse',
  trittschallverbesserung: 'Trittschallverbesserung',
  marke: 'Marke',
};
function eigenschaftLabel(key) {
  if (EIGENSCHAFTEN_LABEL[key]) return EIGENSCHAFTEN_LABEL[key];
  const lesbar = String(key).replaceAll('_', ' ');
  return lesbar.charAt(0).toUpperCase() + lesbar.slice(1);
}

const LEXIKON_VARIANTEN_KOPF = '<tr><th>Farbe</th><th>Unsere SKU</th><th>Lieferanten-Artikelnummer</th><th>Farbnummer</th><th>Preis</th><th>Verfügbar</th><th>Lieferantenseite</th></tr>';

function lexikonVarianteZeile(v) {
  const artikelnr = v.einkauf?.artikelnummer;
  const artikelZelle = artikelnr
    ? `<code class="mono" data-kopiertext="${esc(artikelnr)}" title="Klicken zum Kopieren" style="cursor:pointer">${esc(artikelnr)}</code>`
    : NICHT_HINTERLEGT;
  return `<tr>
    <td>${lexWert(v.farbe)}</td>
    <td>${v.sku ? `<code class="mono">${esc(v.sku)}</code>` : NICHT_HINTERLEGT}</td>
    <td>${artikelZelle}</td>
    <td>${lexWert(v.einkauf?.farbnummer)}</td>
    <td>${(v.preis !== null && v.preis !== undefined) ? `${esc(v.preis)} ${esc(v.waehrung || '')}` : NICHT_HINTERLEGT}</td>
    <td>${v.verfuegbar === true ? 'Ja' : v.verfuegbar === false ? 'Nein' : NICHT_HINTERLEGT}</td>
    <td>${v.einkauf?.url ? `<a class="btn btn-sm" href="${esc(v.einkauf.url)}" target="_blank" rel="noopener">Beim Lieferanten öffnen ↗</a>` : NICHT_HINTERLEGT}</td>
  </tr>`;
}

function viewLexikonDetail(handle) {
  ensureLexikonProdukt(handle);
  const zurueck = `<p style="margin:0 0 12px"><a href="#" data-lex-zurueck>← Zurück zur Lexikon-Suche</a></p>`;
  const d = lexikon.produkt;
  if (!d && lexikon.loadingProdukt) return zurueck + `<div class="empty">Lade Produkt …</div>`;
  if (!d || !d.verfuegbar) return zurueck + emptyState('Produkt nicht gefunden.', d?.hinweis || 'Handle prüfen.');
  const p = d.produkt;
  const eigenschaften = Object.entries(p.eigenschaften || {});
  const alleVarianten = p.varianten || [];
  const normaleVarianten = alleVarianten.filter((v) => !v.wunschmass);
  const wunschmassVarianten = alleVarianten.filter((v) => v.wunschmass);
  const musterHinweis = p.muster?.vorhanden
    ? `<p class="small">Es gibt ein Muster. ${p.muster.handle ? `<a href="#" data-lex-open="${esc(p.muster.handle)}">Muster im Lexikon ansehen →</a>` : ''}</p>`
    : `<p class="small muted">Kein Muster hinterlegt.</p>`;
  return `${zurueck}
    <div class="page-head"><div><h1>${esc(p.titel)}</h1><p class="sub">${p.produktgruppe ? esc(p.produktgruppe) : NICHT_HINTERLEGT} · Handle: <code class="mono">${esc(p.handle)}</code>${p.status ? ` · ${esc(p.status)}` : ''}</p></div></div>
    <div class="toolbar" style="margin:10px 0 16px">
      ${p.shopUrl ? `<a class="btn btn-primary" href="${esc(p.shopUrl)}" target="_blank" rel="noopener">Im Shop ansehen ↗</a>` : `<span class="btn" aria-disabled="true">Im Shop ansehen (${NICHT_HINTERLEGT})</span>`}
      ${p.adminUrl ? `<a class="btn" href="${esc(p.adminUrl)}" target="_blank" rel="noopener">Im Shopify-Admin ↗</a>` : `<span class="btn" aria-disabled="true">Im Shopify-Admin (${NICHT_HINTERLEGT})</span>`}
    </div>
    <section class="card" style="margin-bottom:16px"><div class="card-head"><h2>Farben / Varianten</h2></div>
      <div style="overflow-x:auto"><table class="tasks"><thead>${LEXIKON_VARIANTEN_KOPF}</thead>
      <tbody>${normaleVarianten.map(lexikonVarianteZeile).join('') || `<tr><td colspan="7">${NICHT_HINTERLEGT}</td></tr>`}</tbody></table></div>
    </section>
    ${wunschmassVarianten.length ? `<section class="card" style="margin-bottom:16px"><div class="card-head"><h2>Wunschmaß (wird zugeschnitten)</h2></div>
      <p class="small muted" style="margin:0 0 10px">Zuschnitt nach Maß: SKU, Lieferanten-Artikelnummer und Farbnummer entstehen erst beim Zuschnitt – das ist keine fehlende Angabe.</p>
      <div style="overflow-x:auto"><table class="tasks"><thead>${LEXIKON_VARIANTEN_KOPF}</thead>
      <tbody>${wunschmassVarianten.map(lexikonVarianteZeile).join('')}</tbody></table></div>
    </section>` : ''}
    <section class="card" style="margin-bottom:16px"><div class="card-head"><h2>Eigenschaften</h2></div>
      ${eigenschaften.length ? `<ul style="margin:0;padding-left:20px;line-height:1.8">${eigenschaften.map(([k, v]) => `<li><b>${esc(eigenschaftLabel(k))}:</b> ${lexWert(v)}</li>`).join('')}</ul>` : `<p class="small muted">Keine Eigenschaften hinterlegt.</p>`}
    </section>
    <section class="card">${musterHinweis}</section>`;
}

function viewLexikon() {
  if (state.capabilities.mode !== 'local') {
    return `<div class="page-head"><div><h1>Lexikon</h1><p class="sub">Kunde nennt den Produktnamen – hier findest du das Original beim Lieferanten.</p></div></div>
      ${emptyState('Nur lokal im Betrieb verfügbar.', 'Diese Ansicht liest private Einkaufsdaten, die nie im öffentlichen Repository landen. Auf dem Mac starten: npm run dashboard')}`;
  }
  const handle = state.route.params.get('handle');
  const head = `<div class="page-head"><div><h1>Lexikon</h1><p class="sub">Kunde nennt einen Produktnamen – hier steht das Original beim Lieferanten samt Bestelldaten.</p></div></div>`;
  return head + (handle ? viewLexikonDetail(handle) : viewLexikonListe());
}

// ---------------------------------------------------------------------------
// Ansicht: Kunden (Kundensuche, Rueckruf-/Beratungsliste, Druckansicht)
//
// Wofuer: Mitarbeiter am Telefon findet einen Kunden ueber Name, E-Mail,
// Telefonnummer, Bestellnummer, Strasse/Ort oder PLZ und sieht sofort alle
// Bestellungen. Der Rueckruf-Bereich listet alle Bestellungen mit
// Beratungswunsch oder Massspruefung, aelteste zuerst, mit klickbarer
// Telefonnummer. Alles kommt aus der bereits lokal vorliegenden
// Bestelluebersicht - keine neue Shopify-Abfrage im Browser.
// ---------------------------------------------------------------------------
const RUECKRUF_STATUS_LABEL = { offen: 'Offen', angerufen: 'Angerufen', erledigt: 'Erledigt' };

const kunden = {
  suche: null, loadingSuche: false, sucheKey: null,
  detail: null, loadingDetail: false, detailKey: null,
  rueckrufe: null, loadingRueckrufe: false,
};

function ensureKundenSuche(q) {
  const query = String(q || '').trim();
  if (kunden.sucheKey === query && (kunden.suche || kunden.loadingSuche)) return;
  kunden.sucheKey = query;
  if (query.length < 2) { kunden.suche = { verfuegbar: true, treffer: [] }; return; }
  kunden.loadingSuche = true;
  fetchEinkauf(`/api/kunden/suche?${new URLSearchParams({ q: query })}`).then(d => {
    kunden.suche = d; kunden.loadingSuche = false;
    if (state.route.view === 'kunden') render();
  });
}

function ensureKundenDetail(key) {
  if (kunden.detailKey === key && (kunden.detail || kunden.loadingDetail)) return;
  kunden.detailKey = key;
  kunden.loadingDetail = true;
  fetchEinkauf(`/api/kunden/detail?${new URLSearchParams({ key })}`).then(d => {
    kunden.detail = d; kunden.loadingDetail = false;
    if (state.route.view === 'kunden') render();
  });
}

function ensureKundenRueckrufe() {
  if (kunden.rueckrufe || kunden.loadingRueckrufe) return;
  kunden.loadingRueckrufe = true;
  fetchEinkauf('/api/kunden/rueckrufe').then(d => {
    kunden.rueckrufe = d; kunden.loadingRueckrufe = false;
    if (['heute', 'kunden'].includes(state.route.view)) render();
  });
}

async function setzeRueckrufStatus(orderId, status, notiz) {
  try {
    const r = await fetch('/api/kunden/rueckrufe', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId, status, notiz: notiz ?? null }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(`Fehler: ${j.error || r.status}`, 'crit'); return false; }
    if (kunden.rueckrufe?.zeilen) {
      const zeile = kunden.rueckrufe.zeilen.find(z => z.orderId === orderId);
      if (zeile) Object.assign(zeile, j.eintrag);
    }
    toast(`Rückruf: ${RUECKRUF_STATUS_LABEL[status]}`);
    render();
    return true;
  } catch (e) { toast(`Fehler: ${e.message}`, 'crit'); return false; }
}

function telLink(telefon) {
  if (!telefon || telefon === '–') return '<span class="small muted">keine Telefonnummer</span>';
  const zifferAllein = String(telefon).replace(/[^0-9+]/g, '');
  return `<a class="tel-link" href="tel:${esc(zifferAllein)}">${esc(telefon)}</a>`;
}

/** Startseiten-Block "Heute": die aeltesten offenen Rueckrufe, damit niemand vergessen wird. */
function heuteRueckrufBlock() {
  ensureKundenRueckrufe();
  const r = kunden.rueckrufe;
  if (!r && kunden.loadingRueckrufe) return '';
  if (!r || !r.verfuegbar) return '';
  const offen = r.zeilen.filter(z => z.status !== 'erledigt' && !z.testbestellung);
  if (!offen.length) return '';
  return collapsibleCard('rueckrufe', 'Rückrufe & Beratungen', `${offen.length} offen`, `
    <p class="small muted" style="margin:0 0 8px">Bestellungen mit Beratungswunsch oder Maßprüfung – ältester Wunsch zuerst.</p>
    <div class="rows">${offen.slice(0, 5).map(rueckrufZeileHtml).join('')}</div>
    ${offen.length > 5 ? `<p class="small muted" style="margin-top:6px">+${offen.length - 5} weitere – <a href="#/kunden?tab=rueckrufe">alle ansehen →</a></p>` : ''}
  `, { openByDefault: true });
}

function rueckrufZeileHtml(z) {
  return `<div class="row rueckruf-row">
    <div>
      <div class="t">${esc(z.kundenname)} <span class="muted small mono">${esc(z.orderName)}</span>${z.testbestellung ? ' <span class="badge plain">Testbestellung</span>' : ''}</div>
      <div class="m">${esc(z.thema)}${z.wunschzeit ? ` · Wunschzeit: ${esc(z.wunschzeit)}` : ''} · seit ${fmtDate(z.datum)}</div>
      <div class="tel-gross">${telLink(z.telefon)}</div>
      ${z.notiz ? `<div class="small muted">Notiz: ${esc(z.notiz)}</div>` : ''}
    </div>
    <div class="r rueckruf-actions">
      <span class="badge ${z.status === 'erledigt' ? 'ok' : z.status === 'angerufen' ? 'plain' : 'gap'}">${esc(RUECKRUF_STATUS_LABEL[z.status])}</span>
      <div class="btn-row">
        ${['offen', 'angerufen', 'erledigt'].map(s => `<button type="button" class="btn btn-sm${z.status === s ? ' btn-primary' : ' btn-ghost'}" data-rueckruf-open="${esc(z.orderId)}" data-rueckruf-status="${s}">${esc(RUECKRUF_STATUS_LABEL[s])}</button>`).join('')}
      </div>
    </div>
  </div>`;
}

function openRueckrufDialog(orderId, status) {
  const z = kunden.rueckrufe?.zeilen?.find(x => x.orderId === orderId);
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="rrTitle" data-dialog>
    <h2 id="rrTitle">Rückruf · ${esc(z?.orderName || '')} → ${esc(RUECKRUF_STATUS_LABEL[status])}</h2>
    <p class="small muted">${esc(z?.kundenname || '')} · ${esc(z?.thema || '')}</p>
    <div class="field"><label for="rrNotiz">Notiz (optional)</label><textarea id="rrNotiz" name="notiz" maxlength="2000" placeholder="z. B. Ergebnis des Anrufs">${esc(z?.notiz || '')}</textarea></div>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Übernehmen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('textarea')?.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    form.querySelector('[type=submit]').disabled = true;
    const ok = await setzeRueckrufStatus(orderId, status, (new FormData(form).get('notiz') || '').trim() || null);
    if (ok) $('#dialogRoot').innerHTML = '';
    else form.querySelector('[type=submit]').disabled = false;
  });
}

function kundenTrefferZeile(k) {
  return `<div class="row" data-kunden-open="${esc(k.key)}" tabindex="0" role="button" aria-label="${esc(k.name)}">
    <div>
      <div class="t">${esc(k.name)}${k.nurTestbestellungen ? ' <span class="badge plain">nur Testbestellungen</span>' : ''}</div>
      <div class="m">${esc(k.email !== '–' ? k.email : '')}${k.telefon !== '–' ? ` · ${esc(k.telefon)}` : ''}</div>
    </div>
    <div class="r">
      <div class="small">${plural(k.anzahlBestellungen, 'Bestellung', 'Bestellungen')} · ${geldText({ betrag: k.gesamtumsatz, waehrung: k.waehrung })}</div>
      <div class="small muted">letzte: ${k.letzteBestellungName ? `${esc(k.letzteBestellungName)} · ` : ''}${fmtDate(k.letzteBestellung)}</div>
    </div>
  </div>`;
}

function viewKundenSuche() {
  const q = state.route.params.get('kq') || '';
  ensureKundenSuche(q);
  const toolbar = `<div class="toolbar search-hero"><input type="search" placeholder="Name, E-Mail, Telefon, Bestellnummer, Straße/Ort oder PLZ …" value="${esc(q)}" data-param="kq" aria-label="Kunden durchsuchen" autofocus></div>`;
  const d = kunden.suche;
  if (q.trim().length < 2) return toolbar + `<div class="empty search-hint"><strong>Kundensuche.</strong> Mindestens zwei Zeichen eingeben – gesucht wird über Kundenname, E-Mail, Telefonnummer, Bestellnummer, Straße/Ort und PLZ.</div>`;
  if (!d && kunden.loadingSuche) return toolbar + `<div class="empty">Suche …</div>`;
  if (!d || !d.verfuegbar) return toolbar + emptyState('Keine Kundendaten verfügbar.', d?.hinweis || 'Bestellübersicht noch nicht exportiert.');
  return toolbar + `
    <p class="small muted" style="margin:-4px 0 10px">${d.treffer.length} Treffer${d.treffer.length === 50 ? ' (mehr – Suche genauer eingrenzen)' : ''}</p>
    <div class="rows">${d.treffer.length ? d.treffer.map(kundenTrefferZeile).join('') : emptyState('Keine Treffer.', 'Begriff prüfen oder anders schreiben.')}</div>`;
}

function kundenPositionZeile(p) {
  return `<tr>
    <td data-l="Artikel">${esc(p.titel)}${p.farbe ? `<br><span class="small muted">${esc(p.farbe)}</span>` : ''}</td>
    <td data-l="Unsere SKU">${esc(p.sku || '–')}</td>
    <td data-l="Lieferanten-Art.-Nr.">${esc(p.lieferantenArtikelnummer || '–')}</td>
    <td data-l="Menge">${esc(p.kundenmasse || p.menge)}</td>
    <td data-l="Preis">${p.preis?.betrag != null ? geldText(p.preis) : '–'}</td>
  </tr>`;
}

function kundenAuftragKarte(a) {
  const dt = a.details;
  const beratungsZeilen = Object.entries(dt?.beratungsangaben || {}).filter(([, v]) => v);
  return `<article class="card kunden-auftrag${a.testbestellung ? ' testbestellung' : ''}" id="druck-${esc(a.id.replace(/\W/g, ''))}">
    <div class="card-head">
      <h3>${esc(a.name)} <span class="small muted">${fmtDate(a.datum)}</span>${a.testbestellung ? ' <span class="badge plain">Testbestellung</span>' : ''}</h3>
      <span class="no-print"><a class="btn btn-sm btn-ghost" href="${esc(a.adminUrl)}" target="_blank" rel="noopener">Im Shopify-Admin öffnen ↗</a> <button type="button" class="btn btn-sm" data-drucken="${esc(a.id)}">Drucken</button></span>
    </div>
    <div class="chips">
      <span class="chip">Status: <b>${esc(a.status)}</b></span>
      <span class="chip">Bezahlt: <b>${esc(a.bezahlt)}</b></span>
      <span class="chip">Versand: <b>${esc(a.erfuellt)}</b></span>
      <span class="chip">Beratung: <b>${esc(a.checks?.beratung || '–')}</b></span>
      <span class="chip">Maßprüfung: <b>${esc(a.checks?.masspruefung || '–')}</b></span>
    </div>
    ${beratungsZeilen.length ? `<p class="small">${beratungsZeilen.map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join(' · ')}</p>` : ''}
    <div class="table-wrap kunden-table"><table><thead><tr><th>Artikel</th><th>Unsere SKU</th><th>Lieferanten-Art.-Nr.</th><th>Menge</th><th>Preis</th></tr></thead>
    <tbody>${(dt?.positionen || []).map(kundenPositionZeile).join('') || `<tr><td colspan="5">Keine Positionen.</td></tr>`}</tbody></table></div>
    <p class="small muted" style="margin-top:8px">Gesamt: ${geldText(dt?.summen?.gesamt)} · Zahlungsart: ${esc(dt?.zahlungsart || '–')} · Versandart: ${esc(dt?.versandart || '–')}</p>
  </article>`;
}

function adresseHtml(a, titel) {
  if (!a) return '';
  return `<div><p class="small muted" style="margin:0">${esc(titel)}</p><p style="margin:2px 0">${esc(a.name)}<br>${esc(a.strasse)}<br>${esc(a.plz)} ${esc(a.ort)}${a.land && a.land !== '–' ? `, ${esc(a.land)}` : ''}${a.telefon && a.telefon !== '–' ? `<br>${esc(a.telefon)}` : ''}</p></div>`;
}

function viewKundenDetail(key) {
  ensureKundenDetail(key);
  const zurueck = `<p class="no-print" style="margin:0 0 12px"><a href="#" data-kunden-zurueck>← Zurück zur Kundensuche</a></p>`;
  const d = kunden.detail;
  if (!d && kunden.loadingDetail) return zurueck + `<div class="empty">Lade Kunde …</div>`;
  if (!d || !d.verfuegbar) return zurueck + emptyState('Kunde nicht gefunden.', d?.hinweis || '');
  const k = d.kunde;
  return zurueck + `
    <section class="card">
      <div class="card-head"><h2>${esc(k.kunde.name)}</h2><span class="small">${plural(k.anzahlBestellungen, 'Bestellung', 'Bestellungen')} · ${geldText({ betrag: k.gesamtumsatz, waehrung: k.waehrung })}</span></div>
      <p class="small">E-Mail: ${k.kunde.email !== '–' ? esc(k.kunde.email) : '–'} · Telefon: ${telLink(k.kunde.telefon)}</p>
      <div class="kunden-adressen">
        ${adresseHtml(k.lieferadresse, 'Lieferadresse')}
        ${adresseHtml(k.rechnungsadresse, 'Rechnungsadresse')}
      </div>
    </section>
    <h2 style="margin-top:18px">Bestellungen</h2>
    ${k.auftraege.map(kundenAuftragKarte).join('') || emptyState('Keine Bestellungen.', '')}
  `;
}

function viewKundenRueckrufe() {
  ensureKundenRueckrufe();
  const r = kunden.rueckrufe;
  if (!r && kunden.loadingRueckrufe) return `<div class="empty">Lade Rückrufliste …</div>`;
  if (!r || !r.verfuegbar) return emptyState('Keine Daten verfügbar.', r?.hinweis || 'Bestellübersicht noch nicht exportiert.');
  const offen = r.zeilen.filter(z => z.status !== 'erledigt');
  const erledigt = r.zeilen.filter(z => z.status === 'erledigt');
  return `
    <p class="small muted" style="margin:0 0 10px">Alle Bestellungen mit Beratungswunsch oder Maßprüfung „Ja" – älteste zuerst. Status und Notiz werden lokal auf diesem Mac gespeichert.</p>
    <div class="rows">${offen.length ? offen.map(rueckrufZeileHtml).join('') : emptyState('Keine offenen Rückrufe.', '')}</div>
    ${erledigt.length ? `<details style="margin-top:14px"><summary>${erledigt.length} erledigt</summary><div class="rows">${erledigt.map(rueckrufZeileHtml).join('')}</div></details>` : ''}
  `;
}

function viewKunden() {
  if (state.capabilities.mode !== 'local') {
    return `<div class="page-head"><div><h1>Kunden</h1><p class="sub">Kundensuche und Rückruf-/Beratungsliste.</p></div></div>
      ${emptyState('Nur lokal im Betrieb verfügbar.', 'Diese Ansicht liest private Bestell- und Kundendaten, die nie im öffentlichen Repository landen. Auf dem Mac starten: npm run dashboard')}`;
  }
  const key = state.route.params.get('key');
  if (key) return `<div class="page-head"><div><h1>Kunden</h1><p class="sub">Kontaktdaten, Anschriften und alle Bestellungen dieses Kunden.</p></div></div>` + viewKundenDetail(key);
  const tab = state.route.params.get('tab') === 'rueckrufe' ? 'rueckrufe' : 'suche';
  ensureKundenRueckrufe();
  const head = `<div class="page-head"><div><h1>Kunden</h1><p class="sub">Kunden am Telefon schnell finden – und wer zurückgerufen werden möchte.</p></div></div>
    <div class="tabs no-print" role="tablist">
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'suche'}" data-param="tab" data-value="">Suche</button>
      <button type="button" class="tab" role="tab" aria-selected="${tab === 'rueckrufe'}" data-param="tab" data-value="rueckrufe">Rückrufe &amp; Beratungen${r_badge()}</button>
    </div>`;
  return head + (tab === 'rueckrufe' ? viewKundenRueckrufe() : viewKundenSuche());
}

function r_badge() {
  const n = (kunden.rueckrufe?.zeilen || []).filter(z => z.status !== 'erledigt').length;
  return n ? ` <span class="badge gap">${n}</span>` : '';
}

// ---------------------------------------------------------------------------
// Ansicht: Ratgeber (Bodenwissen-Inhalte)
// ---------------------------------------------------------------------------
/**
 * Laedt docs/ai-dashboard/bodenwissen.json einmal je Sitzung. Fehlt die Datei
 * (HTTP 404, z. B. weil sie noch nie erzeugt wurde), ist das kein Fehler -
 * ratgeberStatus() zeigt dann den ruhigen "fehlt"-Hinweis statt eines Absturzes.
 */
function ensureBodenwissen() {
  if (state.bodenwissenLoaded) return;
  state.bodenwissenLoaded = true;
  fetch(`./bodenwissen.json?t=${Date.now()}`, { cache: 'no-store' })
    .then(async r => {
      if (!r.ok) { state.bodenwissen = null; state.bodenwissenError = null; return; }
      state.bodenwissen = await r.json();
      state.bodenwissenError = null;
    })
    .catch(e => { state.bodenwissen = null; state.bodenwissenError = e.message; })
    .finally(() => { if (state.route.view === 'ratgeber') render(); });
}

function viewRatgeber() {
  ensureBodenwissen();
  const head = `<div class="page-head"><div><h1>Ratgeber</h1><p class="sub">Stand der Bodenwissen-Inhalte (content/ratgeber, content/lexikon, content/probleme) · Quelle: <span class="mono">node scripts/build-bodenwissen-data.mjs</span></p></div></div>`;
  const status = ratgeberStatus(state.bodenwissen, state.bodenwissenError);
  if (status.state !== 'ok') {
    return head + emptyState(status.state === 'fehler' ? 'Ratgeber-Daten konnten nicht geladen werden.' : 'Noch keine Ratgeber-Daten erzeugt.', status.hinweis);
  }
  const d = state.bodenwissen;
  const bandItem = (n, label, cls, href) => href
    ? `<a href="${href}" class="${n === 0 ? 'zero' : cls}"><span class="n">${n}</span><span class="l">${esc(label)}</span></a>`
    : `<div class="${n === 0 ? 'zero' : cls}"><span class="n">${n}</span><span class="l">${esc(label)}</span></div>`;
  const pipeline = pipelineRows(d);
  const maxPipeline = Math.max(1, ...pipeline.map(r => r.anzahl));
  const ueb = d.ueberarbeitungsbedarf || [];
  const bilder = d.bilder || { offen: 0, items: [] };
  const ei = d.expertInput || { gesamt: 0, ratgeber: 0, lexikon: 0, items: [] };
  const pf = d.problemFinder || { gesamt: 0, mitZiel: 0, ohneZiel: 0 };
  const gate = d.gate || { fehler: [], hinweise: [], zahlen: {} };
  const kappen = (liste, n = 20) => liste.length > n ? `<p class="small muted" style="margin-top:6px">… und ${liste.length - n} weitere.</p>` : '';

  return `${head}
    <div class="band">
      ${bandItem(d.gesamt?.artikel || 0, 'Artikel', 'info')}
      ${bandItem(ueb.length, 'Überarbeitung fällig', ueb.length ? 'crit' : 'ok')}
      ${bandItem(bilder.offen, 'Bildbedarfe offen', bilder.offen ? 'warn' : 'ok')}
      ${bandItem(ei.gesamt, 'Expert Input offen', ei.gesamt ? 'warn' : 'ok')}
      ${bandItem(gate.fehler.length, 'Gate-Fehler', gate.fehler.length ? 'crit' : 'ok')}
      ${bandItem(gate.hinweise.length, 'Gate-Hinweise', gate.hinweise.length ? 'warn' : 'ok')}
    </div>

    <section class="card">
      <div class="card-head"><h2>Content-Pipeline</h2><span class="more muted">${plural(d.gesamt?.artikel || 0, 'Artikel', 'Artikel')} gesamt</span></div>
      <div class="bars">${pipeline.map(r => `<div class="bar"><span>${esc(r.label)}</span><div class="track"><div class="fill" style="width:${Math.round(r.anzahl / maxPipeline * 100)}%"></div></div><span class="mono small">${r.anzahl}</span></div>`).join('')}</div>
    </section>

    <div class="grid grid-2 section">
      <section class="card">
        <div class="card-head"><h2>Überarbeitung fällig</h2><span class="more muted">pruefung.naechste in der Vergangenheit</span></div>
        ${ueb.length ? `<div class="rows">${ueb.map(a => `<div class="row" style="cursor:default" tabindex="-1"><div><div class="t">${esc(a.titel || a.handle)}</div><div class="m"><span>${esc(a.bereich)}</span><span class="badge status">${esc(a.status ? statusLabel(a.status) : 'ohne Status')}</span><span style="color:var(--crit)">fällig seit ${fmtDate(a.naechste)} (${a.tageUeberfaellig} Tage)</span></div></div></div>`).join('')}</div>` : emptyState('Keine Überarbeitung fällig.', 'Kein Artikel mit abgelaufenem Prüfdatum.')}
      </section>
      <section class="card">
        <div class="card-head"><h2>Offene Bildbedarfe</h2><span class="more muted">${bilder.offen} offen</span></div>
        ${bilder.items.length ? `<ul class="small muted" style="margin:0;padding-left:18px">${bilder.items.slice(0, 20).map(b => `<li>${esc(b.titel || b.handle)} · ${esc(b.zweck)}</li>`).join('')}</ul>${kappen(bilder.items)}` : emptyState('Keine offenen Bildbedarfe.', '')}
      </section>
      <section class="card">
        <div class="card-head"><h2>Offener Expert Input</h2><span class="more muted">${ei.gesamt} Fragen · ${ei.ratgeber} Ratgeber, ${ei.lexikon} Lexikon</span></div>
        ${ei.items.length ? `<ul class="small muted" style="margin:0;padding-left:18px">${ei.items.slice(0, 20).map(f => `<li><b>${esc(f.titel || f.handle)}</b> (${esc(f.quelle)}): ${esc(f.frage)}</li>`).join('')}</ul>${kappen(ei.items)}` : emptyState('Kein offener Expert Input.', '')}
      </section>
      <section class="card">
        <div class="card-head"><h2>Problem-Finder</h2><span class="more muted">content/probleme</span></div>
        <div class="band" style="margin:0">
          ${bandItem(pf.gesamt, 'Probleme gesamt', 'info')}
          ${bandItem(pf.mitZiel, 'mit Ziel-Artikel', 'ok')}
          ${bandItem(pf.ohneZiel, 'ohne Ziel-Artikel', pf.ohneZiel ? 'warn' : 'ok')}
        </div>
      </section>
    </div>

    <section class="card section">
      <div class="card-head"><h2>Gate (bodenwissen-guard)</h2><span class="more muted">${plural(gate.zahlen?.artikel || 0, 'Artikel', 'Artikel')}, ${plural(gate.zahlen?.lexikon || 0, 'Lexikoneintrag', 'Lexikoneinträge')}, ${plural(gate.zahlen?.probleme || 0, 'Problem', 'Probleme')} geprüft</span></div>
      ${gate.fehler.length ? `<div class="notice crit" style="margin-bottom:8px"><b>${plural(gate.fehler.length, 'Fehler', 'Fehler')}:</b><ul style="margin:6px 0 0;padding-left:18px">${gate.fehler.slice(0, 20).map(f => `<li>${esc(f.ort)}: ${esc(f.text)}</li>`).join('')}</ul>${kappen(gate.fehler)}</div>` : ''}
      ${gate.hinweise.length ? `<div class="notice warn"><b>${plural(gate.hinweise.length, 'Hinweis', 'Hinweise')}:</b><ul style="margin:6px 0 0;padding-left:18px">${gate.hinweise.slice(0, 20).map(h => `<li>${esc(h.ort)}: ${esc(h.text)}</li>`).join('')}</ul>${kappen(gate.hinweise)}</div>` : ''}
      ${!gate.fehler.length && !gate.hinweise.length ? emptyState('Gate ist sauber.', 'npm run bodenwissen:guard meldet weder Fehler noch Hinweise.') : ''}
    </section>

    <section class="card section">
      <div class="card-head"><h2>Suchleistung</h2><span class="more muted">Klicks, Impressionen, CTR, Position</span></div>
      ${emptyState('Daten noch nicht verfügbar.', suchleistungHinweis(d))}
    </section>

    <p class="small muted section">Stand: ${esc(fmtDateTime(d.erzeugtAm))} · erzeugt aus dem Repository, keine externen Aufrufe.</p>`;
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
    if (istNurLesend()) { toast('Rolle "lesen" darf keine Aenderungen vornehmen.', 'crit'); return; }
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
  const views = [['heute', 'Heute'], ['arbeit', 'Arbeit'], ['freigaben', 'Freigaben'], ['bereiche', 'Bereiche'], ['insights', 'Insights'], ['aktivitaet', 'Aktivität'], ['ratgeber', 'Ratgeber']];
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

/**
 * Knopf "Jetzt aktualisieren": startet operations/scripts/aktualisieren.mjs
 * serverseitig (POST /api/aktualisierung/start) und pollt danach den
 * Status-Endpunkt, bis der Lauf fertig ist - kein Warten im Request, die
 * Anfrage selbst kommt sofort zurueck. Waehrend des Laufs ist der Knopf
 * gesperrt ("Wird aktualisiert …"); danach zeigt render() ueber
 * aktualisierungHealth()/heuteEinkaufBlock() das Ergebnis je Quelle mit
 * Anzahl und Zeitpunkt (aus derselben aktualisierung.json).
 */
async function aktualisierenNow() {
  if (istNurLesend()) { toast('Rolle "lesen" darf keine Aktualisierung anstossen.', 'crit'); return; }
  if (einkauf.aktualisierungLaeuft) { toast('Aktualisierung läuft bereits.'); return; }
  try {
    const r = await fetch('/api/aktualisierung/start', { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(`Aktualisierung fehlgeschlagen: ${j.error || r.status}`, 'crit'); return; }
    if (j.laeuft && !j.gestartet) { toast('Aktualisierung läuft bereits.'); }
    else toast('Aktualisierung gestartet …');
    einkauf.aktualisierungLaeuft = true;
    render();
    pollAktualisierung();
  } catch (e) { toast(`Aktualisierung fehlgeschlagen: ${e.message}`, 'crit'); }
}

function pollAktualisierung() {
  clearTimeout(einkauf.aktualisierungPollTimer);
  einkauf.aktualisierungPollTimer = setTimeout(async () => {
    const d = await fetchEinkauf('/api/aktualisierung/status');
    einkauf.aktualisierung = d;
    einkauf.aktualisierungLaeuft = !!d.laeuft;
    if (einkauf.aktualisierungLaeuft) { pollAktualisierung(); return; }
    toast('Aktualisierung abgeschlossen.');
    if (state.route.view === 'heute' || state.route.view === 'einkauf' || state.route.view === 'insights') render();
  }, 2000);
}

// ---------------------------------------------------------------------------
// Render + Events
// ---------------------------------------------------------------------------
const VIEWS = { heute: viewHeute, arbeit: viewArbeit, freigaben: viewFreigaben, bereiche: viewBereiche, insights: viewInsights, aktivitaet: viewAktivitaet, einkauf: viewEinkauf, kunden: viewKunden, lexikon: viewLexikon, ratgeber: viewRatgeber };

function render() {
  const main = $('#main');
  document.querySelectorAll('.mainnav a').forEach(a => a.toggleAttribute('aria-current', a.dataset.nav === state.route.view) || (a.dataset.nav === state.route.view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const nf = $('#navFreigaben'); const approvals = state.tasks.filter(t => t.status === 'freigabe').length;
  nf.hidden = !approvals; nf.textContent = approvals;
  // "Mehr" traegt die Freigaben-Zahl mit, damit sie im eingeklappten Menue nicht untergeht,
  // und ist markiert, solange eine seiner Ansichten offen ist.
  const more = $('#navMore');
  if (more) {
    const mc = $('#navMoreCount'); mc.hidden = !approvals; mc.textContent = approvals;
    more.querySelector('summary').classList.toggle('current', ['freigaben', 'ratgeber', 'bereiche', 'insights', 'aktivitaet'].includes(state.route.view));
    more.open = false;
  }
  if (state.capabilities.mode === 'ausgeloggt') {
    main.innerHTML = `<div class="page-head"><h1>Sitzung abgelaufen</h1></div><div class="notice warn">Die Anmeldung ist nicht mehr gültig (Sitzungen gelten 12 Stunden) oder das Passwort hat sich geändert. Bereits eingegebene Angaben auf dieser Seite bleiben erhalten, bis neu geladen wird. <a href="/login" class="btn btn-sm" style="margin-left:8px">Neu anmelden</a></div>`;
    document.title = 'Sitzung abgelaufen · Teppich Dashboard';
    return;
  }
  if (state.capabilities.mode !== 'local') {
    main.innerHTML = `<div class="page-head"><h1>Nur lokal im Betrieb</h1></div><div class="notice">Das Control Center läuft seit 2026-09-23 nicht mehr öffentlich. Es zeigt hier keine Aufgabendaten. Auf dem Mac starten: <span class="mono">npm run dashboard</span>, dann <span class="mono">http://localhost:8001</span> öffnen.</div>`;
    document.title = 'Nur lokal im Betrieb · Teppich Dashboard';
    return;
  }
  if (state.loadError && !state.raw) {
    main.innerHTML = `<div class="page-head"><h1>Daten nicht verfügbar</h1></div><div class="notice crit">${esc(state.loadError)}</div><p class="small muted" style="margin-top:10px">issues.json wird vom Workflow „dashboard-data" erzeugt. Lokal: <span class="mono">npm run dashboard</span>. <button class="btn btn-sm" data-action="refresh" style="margin-left:8px">Erneut versuchen</button></p>`;
    return;
  }
  main.innerHTML = (state.loadError ? `<div class="notice crit" style="margin-bottom:12px">Aktualisierung fehlgeschlagen: ${esc(state.loadError)} – es wird der letzte geladene Stand gezeigt.</div>` : '') + VIEWS[state.route.view]();
  document.title = `${{ heute: 'Heute', arbeit: 'Arbeit', freigaben: 'Freigaben', bereiche: 'Bereiche', insights: 'Insights', aktivitaet: 'Aktivität', einkauf: 'Einkauf', kunden: 'Kunden', lexikon: 'Lexikon', ratgeber: 'Ratgeber' }[state.route.view]} · Teppich Dashboard`;
  renderSheet();
  $('#mainnav').classList.remove('open'); $('#navToggle').setAttribute('aria-expanded', 'false');
  // Kundensuche: Feld soll beim Öffnen sofort tippbereit sein (Telefon-Arbeitsplatz).
  if (state.route.view === 'kunden' && !state.route.params.get('key') && state.route.params.get('tab') !== 'rueckrufe') {
    const feld = main.querySelector('input[type=search][data-param="kq"]');
    if (feld && document.activeElement !== feld) { feld.focus(); feld.setSelectionRange(feld.value.length, feld.value.length); }
  }
}

function bindEvents() {
  // Aufklappbare Startseiten-Abschnitte merken sich Auf/Zu je Abschnitt (nicht je Aufgabe).
  document.addEventListener('toggle', e => {
    const d = e.target.closest?.('details[data-collapsible]');
    if (!d) return;
    try { localStorage.setItem(`tp-heute-${d.dataset.collapsible}`, d.open ? '1' : '0'); } catch {}
  }, true);
  document.addEventListener('click', e => {
    const more = $('#navMore');
    if (more?.open && !e.target.closest('#navMore')) more.open = false;
    const open = e.target.closest('[data-open]');
    if (open && !e.target.closest('[data-decide]')) { e.preventDefault(); openTask(Number(open.dataset.open)); if (open.dataset.primary) { setTimeout(() => $('#sheetRoot [data-act]')?.focus(), 50); } return; }
    if (e.target.closest('[data-close-sheet]')) { closeTask(); return; }
    // Dialog schliessen: nur bei Klick auf den Schliessen-Button selbst (z.B. "Abbrechen")
    // oder bei Klick auf die Flaeche ausserhalb des Formulars (Hintergrund). closest() findet
    // sonst auch den umschliessenden Hintergrund-Container bei JEDEM Klick im Dialog (auch auf
    // "Uebernehmen"/Absenden) und schliesst den Dialog, bevor das Formular abschicken kann -
    // dadurch ging jeder per Maus-Klick bestaetigte Dialog verloren, ohne zu speichern.
    const closeTarget = e.target.closest('[data-close-dialog]');
    if (closeTarget) {
      const insideForm = e.target.closest('form');
      if (closeTarget === e.target || !insideForm) { $('#dialogRoot').innerHTML = ''; return; }
    }
    if (e.target.closest('[data-close-palette]') && !e.target.closest('.palette')) { closePalette(); return; }
    const act = e.target.closest('[data-act]');
    if (act) { const t = state.tasks.find(x => x.number === Number(act.dataset.task)); if (t) openActionDialog(t, act.dataset.act); return; }
    const dec = e.target.closest('[data-decide]');
    if (dec) { const t = state.tasks.find(x => x.number === Number(dec.dataset.task)); if (t) openActionDialog(t, dec.dataset.decide); return; }
    const afBtn = e.target.closest('[data-af-set]');
    if (afBtn) {
      // Anzeige-Angaben fuer den Dialog stehen als data-Attribute am Knopf - nicht aus den
      // Tabellenspalten lesen, deren Reihenfolge sich mit dem Layout aendert.
      const ds = afBtn.dataset;
      const pos = { orderId: ds.afOrder, lineItemId: ds.afItem, orderName: ds.afName || '', titel: anzeigeWert(ds.afTitel || ''), farbe: ds.afFarbe || '' };
      const status = afBtn.dataset.afStatus;
      if (status === 'bestellt') openAuftragsstatusDialog(pos, status);
      else setzeAuftragsstatus(pos, status);
      return;
    }
    const proj = e.target.closest('[data-toggle-projekt]');
    if (proj) { const k = proj.dataset.toggleProjekt; if (state.offeneProjekte.has(k)) state.offeneProjekte.delete(k); else state.offeneProjekte.add(k); render(); return; }
    const abschl = e.target.closest('[data-auftrag-erledigt]');
    if (abschl) { openAuftragAbschliessenDialog(abschl.dataset.auftragErledigt); return; }
    const p = e.target.closest('button[data-param]');
    if (p) { setParam(p.dataset.param, p.dataset.value); return; }
    const kop = e.target.closest('[data-kopieren]');
    if (kop) {
      const ta = document.getElementById(kop.dataset.kopieren);
      if (ta) {
        const doCopy = async () => { try { await navigator.clipboard.writeText(ta.value); return true; } catch { try { ta.select(); return document.execCommand('copy'); } catch { return false; } } };
        doCopy().then(ok => { const alt = kop.textContent; kop.textContent = ok ? 'Kopiert' : 'Kopieren fehlgeschlagen'; setTimeout(() => { kop.textContent = alt; }, 1800); });
      }
      return;
    }
    const lexOpen = e.target.closest('[data-lex-open]');
    if (lexOpen) { e.preventDefault(); const p = new URLSearchParams(); p.set('handle', lexOpen.dataset.lexOpen); location.hash = `#/lexikon?${p}`; return; }
    const lexZurueck = e.target.closest('[data-lex-zurueck]');
    if (lexZurueck) { e.preventDefault(); location.hash = `#/lexikon${state.route.params.get('lq') ? `?${new URLSearchParams({ lq: state.route.params.get('lq') })}` : ''}`; return; }
    const kundenOpen = e.target.closest('[data-kunden-open]');
    if (kundenOpen) { e.preventDefault(); const p = new URLSearchParams(); p.set('key', kundenOpen.dataset.kundenOpen); location.hash = `#/kunden?${p}`; return; }
    const kundenZurueck = e.target.closest('[data-kunden-zurueck]');
    if (kundenZurueck) { e.preventDefault(); location.hash = `#/kunden${state.route.params.get('kq') ? `?${new URLSearchParams({ kq: state.route.params.get('kq') })}` : ''}`; return; }
    const rueckrufBtn = e.target.closest('[data-rueckruf-open]');
    if (rueckrufBtn) { e.preventDefault(); openRueckrufDialog(rueckrufBtn.dataset.rueckrufOpen, rueckrufBtn.dataset.rueckrufStatus); return; }
    const druckBtn = e.target.closest('[data-drucken]');
    if (druckBtn) { e.preventDefault(); window.print(); return; }
    const kt = e.target.closest('[data-kopiertext]');
    if (kt) {
      const text = kt.dataset.kopiertext;
      const doCopy = async () => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };
      doCopy().then(ok => { const alt = kt.textContent; kt.textContent = ok ? 'Kopiert' : 'Kopieren fehlgeschlagen'; setTimeout(() => { kt.textContent = alt; }, 1800); });
      return;
    }
    const a = e.target.closest('[data-action]');
    if (a) { if (a.dataset.action === 'sync') syncNow(); if (a.dataset.action === 'refresh') refresh(); if (a.dataset.action === 'aktualisieren') aktualisierenNow(); if (a.dataset.action === 'clear-filters') navigate('arbeit', { mode: state.route.params.get('mode') || '' }); }
  });
  document.addEventListener('change', e => { const el = e.target.closest('select[data-param]'); if (el) setParam(el.dataset.param, el.value); });
  let qTimer;
  document.addEventListener('input', e => { const el = e.target.closest('input[type=search][data-param]'); if (!el) return; const key = el.dataset.param; clearTimeout(qTimer); qTimer = setTimeout(() => { const p = new URLSearchParams(state.route.params); if (el.value) p.set(key, el.value); else p.delete(key); if (key === 'psq') p.delete('seite'); if (key === 'lq') p.delete('lseite'); history.replaceState(null, '', `#/${state.route.view}?${p}`); parseRoute(); const focus = el; render(); const again = document.querySelector('input[type=search][data-param]'); if (again && focus) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } }, 220); });
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
  $('#sessionBtn').addEventListener('click', logout);
  $('#syncChip').addEventListener('click', () => navigate('insights'));
  $('#navToggle').addEventListener('click', () => { const nav = $('#mainnav'); const open = nav.classList.toggle('open'); $('#navToggle').setAttribute('aria-expanded', String(open)); });
  window.addEventListener('hashchange', async () => { const prev = state.route.view; parseRoute(); state.selectedRow = -1; if (state.route.view === 'aktivitaet' && prev !== 'aktivitaet') { activityCache = await loadActivity(); protokollCache = await loadProtokoll(); benutzerCache = await loadBenutzer(); } render(); if (state.route.view === 'lexikon' && prev !== 'lexikon' && !state.route.params.get('handle')) $('#main input[data-param="lq"]')?.focus(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh({ silent: true }); });
}

async function init() {
  parseRoute();
  bindEvents();
  await loadSession();
  await loadCapabilities();
  await loadData();
  renderSyncChip();
  if (state.route.view === 'aktivitaet') { activityCache = await loadActivity(); protokollCache = await loadProtokoll(); benutzerCache = await loadBenutzer(); }
  render();
  if (state.route.view === 'lexikon' && !state.route.params.get('handle')) $('#main input[data-param="lq"]')?.focus();
  loadWorkflowRun().then(() => { renderSyncChip(); if (['heute', 'insights'].includes(state.route.view)) render(); });
  loadAgentRuns().then(() => { if (state.agentRuns) render(); });
  setInterval(() => refresh({ silent: true }), CONFIG.refreshMs);
}

init();
