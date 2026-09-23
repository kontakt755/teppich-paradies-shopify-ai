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
  session: { required: false, authenticated: true },
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
  const view = ['heute', 'arbeit', 'freigaben', 'bereiche', 'insights', 'aktivitaet', 'einkauf', 'lexikon'].includes(path) ? path : 'heute';
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
  } else items.push({ level: 'warn', title: 'KI-Läufe nur lokal sichtbar', detail: 'Die Steuerzentrale speichert Läufe außerhalb des Repos; statisch ist nur der Issue-Status sichtbar.' });
  items.push({ level: 'warn', title: 'Keine Kennzahlen aus Shopify, Google Ads oder GA4 verbunden', detail: 'Bewusst: das Repository ist öffentlich. Anbindung erst nach Sichtbarkeitsentscheidung (docs/control-center/BESTANDSAUFNAHME.md, Punkt 4).' });
  if (state.capabilities.mode === 'local') items.push(...aktualisierungHealth());
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
  if (localMode) { ensureEinkaufBestellungen(); ensureEinkaufAuftragsstatus(); ensureEinkaufKennzahlen(); ensureAktualisierung(); }

  const bandItem = (n, label, cls, href) => `<a href="${href}" class="${n === 0 ? 'zero' : cls}"><span class="n">${n}</span><span class="l">${esc(label)}</span></a>`;

  // Oberstes Band zeigt das Kundengeschaeft (Kauf/Verkauf), nicht mehr die interne
  // Aufgabenverwaltung - das ist laut Inhaber das Wichtigste auf der Startseite.
  const bK = localMode ? einkauf.bestellungen : null;
  const kundenVerfuegbar = !!(bK && bK.verfuegbar);
  const kundenProbleme = kundenVerfuegbar ? (bK.auftraege || []).filter(a => a.offen && a.ampel === 'rot').length : 0;
  const bestellungen7 = localMode ? einkauf.kennzahlen?.zeitraeume?.['7']?.bestellungen : null;
  const kundenBand = !localMode
    ? `<p class="small muted">Kundengeschäft nur lokal sichtbar (private Daten). Auf dem Mac starten: <code class="mono">npm run dashboard</code></p>`
    : !kundenVerfuegbar
      ? `<p class="small muted">${esc(bK?.hinweis || 'Bestellübersicht noch nicht exportiert.')} <a href="#/einkauf">Bereich Einkauf öffnen →</a></p>`
      : `<div class="band">
          ${bandItem(bK.zahlen.offeneAuftraege, `offene Kundenaufträge (von ${bK.zahlen.auftraege})`, 'info', '#/einkauf?tab=bestellungen')}
          ${bandItem(bK.zahlen.zuBestellen, 'beim Lieferanten zu bestellen', 'info', '#/einkauf?tab=bestellungen')}
          ${bandItem(kundenProbleme, 'Aufträge mit Problem', kundenProbleme ? 'crit' : 'ok', '#/einkauf?tab=bestellungen')}
          ${typeof bestellungen7 === 'number' ? bandItem(bestellungen7, 'Bestellungen (7 Tage)', 'ok', '#/einkauf?tab=bestellungen') : `<span class="zero"><span class="n">–</span><span class="l">Bestellungen (7 Tage) – kein Export</span></span>`}
        </div>`;

  return `
    <div class="page-head"><div><h1>Heute</h1><p class="sub">${esc(today)} · Kauf, Verkauf und Kundengeschäft zuerst · Datenstand ${esc(freshness(state.raw?.generated_at).text)}</p></div>
      <div style="display:flex;gap:8px">${aktualisierenButton()}${state.capabilities.sync ? '<button class="btn" data-action="sync">Jetzt synchronisieren</button>' : ''}<a class="btn" href="${newIssueUrl({ template: 'feature.yml' })}" target="_blank" rel="noopener">Neue Aufgabe ↗</a></div></div>

    ${kundenBand}

    <section class="card">
      <div class="card-head"><h2>Kundengeschäft</h2><a class="more" href="#/einkauf">Bereich Einkauf öffnen</a></div>
      ${heuteEinkaufBlock()}
    </section>

    <section class="card section">
      <div class="card-head"><h2>Verkauf / Zahlen</h2></div>
      ${heuteKennzahlenBlock()}
    </section>

    <h2 class="section" style="margin:22px 0 4px;font-size:1rem;color:var(--muted)">Interne Arbeit</h2>
    <p class="small muted" style="margin:0 0 10px">Aufgabenverwaltung – wichtig, aber nicht so dringend wie das Kundengeschäft oben.</p>

    <div class="band">
      ${bandItem(s.critical, 'kritisch, höchste Priorität (P0)', 'crit', '#/arbeit?prio=p0')}
      ${bandItem(s.blocked, 'blockiert', 'crit', '#/arbeit?view=blockiert')}
      ${bandItem(s.approvals, 'warten auf Freigabe', 'warn', '#/freigaben')}
      ${bandItem(s.dueToday, 'heute fällig / überfällig', 'warn', '#/arbeit?view=heute')}
      ${bandItem(s.triage, 'noch zu bewerten (Triage)', 'info', '#/arbeit?view=triage')}
      ${bandItem(s.doneThisWeek, 'diese Woche erledigt', 'ok', '#/arbeit?status=fertig')}
    </div>

    ${collapsibleCard('aufmerksamkeit', 'Braucht jetzt Aufmerksamkeit', att.length ? String(att.length) : 'nichts', att.length ? `<p class="small muted" style="margin:-4px 0 8px">Dringlichkeit aus Priorität, Blocker und Frist – Grund als Tooltip auf der Zeile.</p><div class="att">${att.map((x, i) => attentionItem(x, i)).join('')}</div>` : emptyState('Nichts drängt.', 'Keine P0, keine Blocker, keine offenen Freigaben – gute Zeit, die nächste wichtige Arbeit zu planen.', { href: '#/arbeit?status=geplant', text: 'Geplante Aufgaben ansehen' }), { openByDefault: att.length > 0 })}

    ${collapsibleCard('wartet', 'Wartet auf dich', waitingAll.length ? String(waitingAll.length) : 'nichts', `${waiting.length ? `<div class="rows">${waiting.map(t => heuteCompactRow(t, primaryAction(t).label)).join('')}</div>` : emptyState('Keine Freigaben offen.', 'Plane die nächste wichtige Arbeit.', { href: '#/arbeit?status=geplant', text: 'Geplant' })}${waitingRest.length ? `<details class="inline-more"><summary>Alle anzeigen (+${waitingRest.length})</summary><div class="rows" style="margin-top:6px">${waitingRest.map(t => heuteCompactRow(t, primaryAction(t).label)).join('')}</div></details>` : ''}`, { openByDefault: waitingAll.length > 0 })}

    ${collapsibleCard('blockiert', 'Blockiert', String(tasks.filter(t => t.status === 'blockiert').length), blocked.length ? `<div class="rows">${blocked.slice(0, 5).map(t => heuteCompactRow(t, 'Eskalieren / lösen', { title: t.blocker || 'Grund fehlt – bitte im Issue nachtragen' })).join('')}</div>` : emptyState('Nichts blockiert.', 'Alle offenen Aufgaben können bearbeitet werden (die dringendsten stehen ggf. oben unter „Aufmerksamkeit").'), { openByDefault: blocked.length > 0 })}

    ${collapsibleCard('laeuft', 'Läuft gerade', running.length ? `${plural(running.length, 'in Arbeit', 'in Arbeit')}` : 'nichts', runningBlock(running), { openByDefault: false })}

    ${collapsibleCard('woche', 'Diese Woche', `${week.done.length} erledigt`, `
        <div class="band" style="margin:0 0 10px">
          ${bandItem(week.done.length, 'erledigt', 'ok', '#/arbeit?status=fertig')}
          ${bandItem(week.fresh.length, 'neu hinzugekommen', 'info', '#/arbeit?sort=aktualisiert')}
          ${bandItem(week.overdue.length, 'überfällig', 'crit', '#/arbeit?view=heute')}
        </div>
        ${week.done.length ? `<ul class="small muted" style="margin:0;padding-left:18px">${week.done.slice(0, 5).map(t => `<li>${esc(t.id)} ${taskLink(t)}</li>`).join('')}</ul>` : '<p class="small muted">Noch nichts erledigt in den letzten 7 Tagen.</p>'}`, { openByDefault: false })}

    ${collapsibleCard('gesundheit', 'Systemgesundheit', `<span class="badge level-${worst === 'crit' ? 'kritisch' : worst === 'warn' ? 'achtung' : 'ok'}">${worst === 'crit' ? 'Störung' : worst === 'warn' ? 'Hinweise' : 'in Ordnung'}</span>`, `<div class="health">${health.slice(0, 3).map(healthRow).join('')}</div><p class="small muted" style="margin-top:8px">${health.length > 3 ? `+${health.length - 3} weitere – ` : ''}<a href="#/insights">Alle Details in Insights →</a></p>`, { openByDefault: worst !== 'ok' })}`;
}

/** Einkauf-Auftragsfluss-Zaehler (Bestellt -> Geliefert an uns -> An Kunden raus -> Erledigt). */
function heuteAuftragsflussZaehler(b) {
  const allePositionen = [...(b.gruppen || []).flatMap(g => g.positionen), ...(b.musterGruppen || []).flatMap(g => g.positionen)];
  const afZaehler = { offen: 0, bestellt: 0, unterwegs: 0, erledigt: 0 };
  for (const p of allePositionen) afZaehler[afFilterGruppe(afEintragFuer(p)?.status)] += 1;
  return afZaehler;
}

/** Einkauf-Kachel der Startseite: nur lokal verfügbar, klickt in den Bereich Einkauf durch.
 * Bewusst nur zwei grosse Zahlen (zu bestellen, Probleme) plus eine schmale Auftragsfluss-Zeile -
 * Musterbestellungen und "ohne Großhändler-ID" bleiben im Bereich Einkauf sichtbar, verdoppeln
 * aber nicht die Zahlenflut auf der Startseite. */
function heuteEinkaufBlock() {
  if (state.capabilities.mode !== 'local') {
    return emptyState('Nur lokal im Betrieb verfügbar.', 'Bestellübersicht und Auftragsfluss lesen private Daten, die nie öffentlich werden. Auf dem Mac starten: npm run dashboard');
  }
  const b = einkauf.bestellungen;
  if (!b && einkauf.loadingBestellungen) return `<div class="empty">Lade Einkaufsdaten …</div>`;
  if (!b || !b.verfuegbar) return emptyState('Keine Bestelldaten verfügbar.', b?.hinweis || 'Bestellübersicht noch nicht exportiert.', { href: '#/einkauf', text: 'Bereich Einkauf öffnen' });
  const z = b.zahlen;
  const afZaehler = heuteAuftragsflussZaehler(b);
  const probleme = (b.auftraege || []).filter(a => a.offen && a.ampel === 'rot');
  const bandItem = (n, label, cls, href) => `<a href="${href}" class="${n === 0 ? 'zero' : cls}"><span class="n">${n}</span><span class="l">${esc(label)}</span></a>`;
  return `
    <div class="band" style="margin:0 0 10px">
      ${bandItem(z.zuBestellen, 'zu bestellen', 'info', '#/einkauf?tab=bestellungen')}
      ${bandItem(probleme.length, 'Aufträge mit Problem', probleme.length ? 'crit' : 'ok', '#/einkauf?tab=bestellungen')}
    </div>
    <p class="small muted" style="margin:0 0 10px">Auftragsfluss: <b>${afZaehler.offen}</b> offen · <b>${afZaehler.bestellt}</b> bestellt · <b>${afZaehler.unterwegs}</b> unterwegs · <b>${afZaehler.erledigt}</b> erledigt · <a href="#/einkauf?tab=bestellungen">${plural(z.muster, 'Musterbestellung', 'Musterbestellungen')} offen, ${plural(z.ohneId, 'Position', 'Positionen')} ohne Großhändler-ID →</a></p>
    ${probleme.length ? `<div class="rows">${probleme.slice(0, 3).map(einkaufAuftragZeile).join('')}</div>${probleme.length > 3 ? `<p class="small muted" style="margin-top:6px">+${probleme.length - 3} weitere Aufträge mit Problem – <a href="#/einkauf?tab=bestellungen">alle ansehen →</a></p>` : ''}` : '<p class="small muted">Keine Aufträge mit Problem (Beratung ohne Telefon, Maßprüfung offen, fehlende Großhändler-ID).</p>'}
    <p class="small muted" style="margin-top:8px">Stand: ${esc(fmtDateTime(b.exportiertAm || b.erstellt))} · <a href="#/einkauf">Bereich Einkauf öffnen →</a></p>`;
}

/** Shop-Kennzahlen-Kachel: liest kennzahlen/shop-snapshot.json, erfindet keine Zahlen ohne Export. */
function heuteKennzahlenBlock() {
  if (state.capabilities.mode !== 'local') {
    return emptyState('Nur lokal im Betrieb verfügbar.', 'Shop-Kennzahlen lesen einen lokalen Export, der nie öffentlich wird.');
  }
  const k = einkauf.kennzahlen;
  if (!k && einkauf.loadingKennzahlen) return `<div class="empty">Lade Shop-Kennzahlen …</div>`;
  if (!k || !k.verfuegbar) {
    return emptyState('Noch kein Export der Shop-Kennzahlen.', k?.hinweis || 'Es liegt noch keine kennzahlen/shop-snapshot.json vor.') +
      `<p class="small muted" style="margin-top:6px">Befehl zum Erzeugen: <code class="mono">${esc(k?.befehl || 'npm run kennzahlen:export')}</code></p>`;
  }
  const spanne = (tage) => {
    const z = k.zeitraeume?.[String(tage)];
    if (!z) return emptyState(`Kein Zeitraum ${tage} Tage im Export.`, '');
    const fmt = n => typeof n === 'number' ? n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–';
    return `<div class="band" style="margin:0">
      <div class="ok"><span class="n">${z.bestellungen ?? '–'}</span><span class="l">Bestellungen</span></div>
      <div class="ok"><span class="n">${fmt(z.umsatz)} ${esc(z.waehrung || '')}</span><span class="l">Umsatz</span></div>
      <div class="ok"><span class="n">${fmt(z.durchschnitt)} ${esc(z.waehrung || '')}</span><span class="l">Ø Bestellwert</span></div>
    </div>`;
  };
  return `
    <div class="grid grid-2">
      <div><h3 style="margin:0 0 6px;font-size:.85rem;color:var(--muted)">Letzte 7 Tage</h3>${spanne(7)}</div>
      <div><h3 style="margin:0 0 6px;font-size:.85rem;color:var(--muted)">Letzte 30 Tage</h3>${spanne(30)}</div>
    </div>
    <p class="small muted" style="margin-top:8px">Stand des Exports: ${esc(fmtDateTime(k.erstellt))} · Quelle: ${esc(k.quelle)}</p>`;
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
  return `<div class="row att-row" data-open="${t.number}" tabindex="0" role="button" title="${esc(title ?? (t.nextStep || t.blocker || ''))}">
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
  // Schmale Bildschirme: Karten statt Tabelle, damit nichts seitlich scrollen muss.
  if (list.length && window.matchMedia('(max-width: 760px)').matches) return `<div class="rows">${list.map(t => taskRow(t)).join('')}</div>`;
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
    if (state.route.view === 'einkauf') render();
  });
}

function ensureEinkaufAuftragsstatus() {
  if (einkauf.auftragsstatus || einkauf.loadingAuftragsstatus) return;
  einkauf.loadingAuftragsstatus = true;
  fetchEinkauf('/api/einkauf/auftragsstatus').then(d => {
    einkauf.auftragsstatus = d; einkauf.loadingAuftragsstatus = false;
    if (state.route.view === 'einkauf') render();
  });
}

async function setzeAuftragsstatus(pos, status, { lieferantBestellnummer = null } = {}) {
  try {
    const r = await fetch('/api/einkauf/auftragsstatus', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId: pos.orderId, lineItemId: pos.lineItemId, status, lieferantBestellnummer }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(`Fehler: ${j.error || r.status}`, 'crit'); return false; }
    if (!einkauf.auftragsstatus) einkauf.auftragsstatus = { verfuegbar: true, positionen: {} };
    einkauf.auftragsstatus.positionen[afKey(pos.orderId, pos.lineItemId)] = j.eintrag;
    toast(`Status: ${AF_STATUS_LABEL[status]}`);
    render();
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
    if (stand.veraltet) return { level: 'warn', title: `${label}: Stand ${fmtDateTime(stand.zeitpunkt)} – Daten veraltet`, detail: 'Bitte `npm run daten:aktualisieren` ausführen.' };
    return { level: 'ok', title: `${label}: Stand ${fmtDateTime(stand.zeitpunkt)}`, detail: stand.anzahl !== null && stand.anzahl !== undefined ? `${stand.anzahl} Datensätze${stand.meldung ? ` · ${stand.meldung}` : ''}` : (stand.meldung || '') };
  });
}

function ensureEinkaufProduktstatus() {
  const p = state.route.params;
  const qs = new URLSearchParams({ page: p.get('seite') || '1', q: p.get('psq') || '', gruppe: p.get('gruppe') || '', filter: p.get('psfilter') || '' }).toString();
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

const EINKAUF_AMPEL_LABEL = { gruen: 'Bereit', gelb: 'Prüfen', rot: 'Blockiert', grau: 'Geschlossen' };

/** Menschenlesbare Anzeige statt des internen Markers "UNGEKLAERT" (Grosshandel-Exportdaten). */
function anzeigeWert(wert) { return wert === 'UNGEKLAERT' ? 'Ungeklärt' : wert; }

function afEintragFuer(p) {
  return einkauf.auftragsstatus?.positionen?.[afKey(p.orderId, p.lineItemId)] || null;
}

/** Lieferanten-Link oder Begründung, warum keiner hinterlegt ist. */
function lieferantLinkZelle(p) {
  if (p.lieferantUrl && p.lieferantUrl !== 'UNGEKLAERT') {
    return `<a class="btn btn-sm" href="${esc(p.lieferantUrl)}" target="_blank" rel="noopener">Beim Lieferanten öffnen ↗</a>`;
  }
  return `<span class="small muted">keine Produktseite hinterlegt (einkauf.lieferant_url fehlt)</span>`;
}

/** Status-Zelle: aktueller Stand + Buttons fuer den naechsten Schritt. */
function afStatusZelle(p) {
  const eintrag = afEintragFuer(p);
  const status = eintrag?.status || null;
  const gruppe = afFilterGruppe(status);
  const badgeClass = gruppe === 'erledigt' ? 'fertig' : gruppe === 'unterwegs' ? 'freigabe' : gruppe === 'bestellt' ? 'plain' : 'blockiert';
  const stand = status ? `<div class="small muted">${esc(AF_STATUS_LABEL[status])} · ${fmtDateTime(eintrag.aktualisiertAm)} · @${esc(eintrag.aktualisiertVon)}</div>` : '';
  const nr = eintrag?.lieferantBestellnummer ? `<div class="small muted">Bestellnr.: ${esc(eintrag.lieferantBestellnummer)}</div>` : '';
  const naechster = afNaechsterStatus(status);
  const btn = naechster ? `<button type="button" class="btn btn-sm" data-af-set data-af-order="${esc(p.orderId)}" data-af-item="${esc(p.lineItemId)}" data-af-status="${naechster}">${esc(AF_STATUS_LABEL[naechster])}</button>` : '';
  return `<span class="badge status ${badgeClass}">${esc(status ? AF_STATUS_LABEL[status] : 'Offen')}</span>${stand}${nr}<div style="margin-top:4px">${btn}</div>`;
}

function einkaufGruppeKarte(g, i, praefix) {
  const id = `ek-${praefix}-${i}`;
  const titel = g.lieferant === 'UNGEKLAERT' ? 'Lieferant ungeklärt' : `Lieferant ${esc(g.lieferant)}`;
  const route = g.route && g.route !== 'UNGEKLAERT' && g.route !== 'MUSTER' ? ` <span class="badge plain">${esc(g.route)}</span>` : '';
  const af = state.route.params.get('af') || '';
  const positionen = af ? g.positionen.filter(p => afFilterGruppe(afEintragFuer(p)?.status) === af) : g.positionen;
  if (af && !positionen.length) return '';
  const zeilen = positionen.map(p => `<tr>
      <td>${p.grosshaendlerId === 'UNGEKLAERT' ? `<span class="badge gap" title="Nicht in Shopify hinterlegt">Ungeklärt</span>` : `<code class="mono">${esc(p.grosshaendlerId)}</code>`}${p.idGrund ? `<div class="small muted">${esc(p.idGrund)}</div>` : ''}</td>
      <td>${esc(p.orderName)} <span class="muted small">${fmtDate(p.orderDatum)}</span></td>
      <td>${esc(p.titel)}<div class="small muted mono">${esc(p.sku)}</div></td>
      <td>${esc(p.farbe)}</td>
      <td>${esc(p.kundenmenge)}</td>
      <td>${p.bestellmenge.menge === 'UNGEKLAERT' ? `<span class="badge gap" title="Nicht in Shopify hinterlegt">Ungeklärt</span>` : esc(p.bestellmenge.text)}${p.bestellmenge.grund ? `<div class="small muted">${esc(p.bestellmenge.grund)}</div>` : ''}</td>
      <td>${lieferantLinkZelle(p)}</td>
      <td><a href="${esc(p.adminUrl || '')}" target="_blank" rel="noopener">Bestellung ↗</a></td>
      <td>${afStatusZelle(p)}</td>
    </tr>`).join('');
  return `<section class="card${g.lieferant === 'UNGEKLAERT' ? ' notice warn' : ''}" style="margin-bottom:12px">
    <div class="card-head"><h2>${titel}${route} <span class="muted small">${positionen.length} Pos.</span></h2>${kopierbutton(id)}</div>
    <div style="overflow-x:auto"><table class="tasks"><thead><tr><th>Großhändler-ID</th><th>Kundenauftrag</th><th>Artikel</th><th>Farbe/Variante</th><th>Kunde bestellt</th><th>Beim Lieferanten bestellen</th><th>Lieferant</th><th>Auftrag</th><th>Status</th></tr></thead>
    <tbody>${zeilen}</tbody></table></div>
    <textarea id="${id}" style="position:absolute;left:-9999px;width:1px;height:1px">${esc(g.text)}</textarea>
  </section>`;
}

function einkaufAuftragZeile(a) {
  const c = a.checks;
  const chip = (label, wert, schlecht) => `<span class="badge ${schlecht ? 'p0' : 'plain'}">${esc(label)}: ${esc(wert)}</span>`;
  return `<div class="row" style="cursor:default" tabindex="-1">
    <div>
      <div class="t"><span class="badge status ${a.ampel === 'rot' ? 'blockiert' : a.ampel === 'gelb' ? 'freigabe' : a.ampel === 'gruen' ? 'fertig' : ''}">${esc(EINKAUF_AMPEL_LABEL[a.ampel] || a.ampel)}</span> <a href="${esc(a.adminUrl || '')}" target="_blank" rel="noopener">${esc(a.name)}</a> <span class="muted small">${fmtDate(a.datum)}</span></div>
      <div class="m">${chip('Bezahlt', a.bezahlt, a.bezahlt !== 'PAID')}${chip('Versand', a.erfuellt)}${chip('Beratung', c.beratung)}${chip('Telefon', c.telefon, c.beratung === 'Ja' && c.telefon === 'fehlt')}${chip('Maßprüfung', c.masspruefung, c.masspruefung === 'Problem')}${chip('Verlegung', c.verlegung)}</div>
      ${a.hinweise?.length ? `<div class="next" style="color:var(--crit)">${a.hinweise.map(esc).join(' · ')}</div>` : ''}
    </div>
  </div>`;
}

const AF_FILTER_LABEL = { offen: 'Offen', bestellt: 'Bestellt', unterwegs: 'Unterwegs', erledigt: 'Erledigt' };

function afFortschrittBand(alleWarePositionen) {
  const zaehler = { offen: 0, bestellt: 0, unterwegs: 0, erledigt: 0 };
  for (const p of alleWarePositionen) zaehler[afFilterGruppe(afEintragFuer(p)?.status)] += 1;
  const af = state.route.params.get('af') || '';
  const cls = { offen: 'crit', bestellt: 'warn', unterwegs: 'info', erledigt: 'ok' };
  return `<div class="chips" role="group" aria-label="Nach Auftragsfluss-Status filtern" style="margin:12px 0">
    ${Object.keys(AF_FILTER_LABEL).map(k => `<button type="button" class="chip" data-param="af" data-value="${af === k ? '' : k}" aria-pressed="${af === k}">${esc(AF_FILTER_LABEL[k])}<span class="c">${zaehler[k]}</span></button>`).join('')}
    ${af ? `<button type="button" class="chip" data-param="af" data-value="">Alle</button>` : ''}
  </div>
  <div class="band" style="margin:12px 0">
    ${Object.keys(AF_FILTER_LABEL).map(k => `<div class="${cls[k]}"><span class="n">${zaehler[k]}</span><span class="l">${esc(AF_FILTER_LABEL[k])}</span></div>`).join('')}
  </div>`;
}

function viewEinkaufBestellungen() {
  ensureEinkaufBestellungen();
  ensureEinkaufAuftragsstatus();
  const d = einkauf.bestellungen;
  if (!d && einkauf.loadingBestellungen) return `<div class="empty">Lade Bestelluebersicht …</div>`;
  if (!d || !d.verfuegbar) return emptyState('Keine Bestelldaten verfügbar.', d?.hinweis || 'Quelle fehlt oder ist leer.');
  const z = d.zahlen;
  const allePositionen = [...(d.gruppen || []).flatMap(g => g.positionen), ...(d.musterGruppen || []).flatMap(g => g.positionen)];
  return `
    <div class="band" style="margin:12px 0">
      <div class="ok"><span class="n">${z.offeneAuftraege}</span><span class="l">offene Aufträge (von ${z.auftraege})</span></div>
      <div class="info"><span class="n">${z.zuBestellen}</span><span class="l">Positionen zu bestellen</span></div>
      <div class="info"><span class="n">${z.muster}</span><span class="l">Muster offen</span></div>
      <div class="${z.ohneId ? 'crit' : 'ok'}"><span class="n">${z.ohneId}</span><span class="l">ohne Großhändler-ID</span></div>
      <div class="${z.mengeUngeklaert ? 'warn' : 'ok'}"><span class="n">${z.mengeUngeklaert}</span><span class="l">Menge UNGEKLÄRT</span></div>
    </div>
    <h2 style="margin-top:20px">Auftragsfluss</h2>
    ${afFortschrittBand(allePositionen)}
    <h2 style="margin-top:20px">Zu bestellen je Lieferant</h2>
    ${d.gruppen?.length ? d.gruppen.map((g, i) => einkaufGruppeKarte(g, i, 'ware')).join('') || emptyState('Nichts zu bestellen.', 'Kein Treffer für diesen Filter.') : emptyState('Nichts zu bestellen.', 'Keine offenen Warenpositionen.')}
    <h2 style="margin-top:20px">Muster</h2>
    ${d.musterGruppen?.length ? d.musterGruppen.map((g, i) => einkaufGruppeKarte(g, i, 'muster')).join('') || emptyState('Keine offenen Muster.', 'Kein Treffer für diesen Filter.') : emptyState('Keine offenen Muster.', '')}
    <h2 style="margin-top:20px">Aufträge – Ampel-Status</h2>
    <p class="small muted" style="margin:0 0 8px">Grün = bereit zum Bestellen, Gelb = erst prüfen, Rot = blockiert (z. B. fehlende Angabe).</p>
    <div class="rows">${d.auftraege?.filter(a => a.offen).map(einkaufAuftragZeile).join('') || emptyState('Keine offenen Aufträge.', '')}</div>
    <p class="small muted" style="margin-top:10px">Stand: ${esc(fmtDateTime(d.exportiertAm || d.erstellt))} · Quelle: ${esc(d.quelle)} · wird nie automatisch versendet.</p>`;
}

const EINKAUF_PSFILTER_LABEL = { '': 'Alle offenen Produkte', blockierend: 'Nur blockierend', handarbeit: 'Nur Handarbeit' };

function viewEinkaufProduktdaten() {
  ensureEinkaufProduktstatus();
  const d = einkauf.produktstatus;
  const p = state.route.params;
  const psfilter = ['', 'blockierend', 'handarbeit'].includes(p.get('psfilter')) ? p.get('psfilter') : '';
  const toolbar = `<div class="toolbar" style="margin:12px 0">
      <input type="search" placeholder="Suche nach Produkt, Handle oder SKU …" value="${esc(p.get('psq') || '')}" data-param="psq" aria-label="Produktdaten durchsuchen">
      ${d?.gruppen?.length ? `<select data-param="gruppe" aria-label="Nach Produktgruppe filtern"><option value="">Alle Gruppen</option>${d.gruppen.map(g => `<option value="${esc(g.gruppe)}" ${p.get('gruppe') === g.gruppe ? 'selected' : ''}>${esc(g.gruppe)}</option>`).join('')}</select>` : ''}
    </div>
    <div class="chips" role="group" aria-label="Nach Dringlichkeit filtern" style="margin:8px 0 12px">
      ${Object.entries(EINKAUF_PSFILTER_LABEL).map(([k, l]) => `<button type="button" class="chip" data-param="psfilter" data-value="${k}" aria-pressed="${psfilter === k}">${esc(l)}</button>`).join('')}
    </div>`;
  if (!d && einkauf.loadingProduktstatus) return toolbar + `<div class="empty">Lade Produktdaten-Status …</div>`;
  if (!d || !d.verfuegbar) return emptyState('Keine Produktdaten-Statusdaten verfügbar.', d?.hinweis || 'Quelle fehlt oder ist leer.');
  const g = d.gesamt;
  const gruppenzeilen = d.gruppen.map(row => {
    const summe = row.vollstaendig + row.handarbeit + row.automatisch;
    return `<tr>
      <td>${esc(row.gruppe)}</td>
      <td>${row.vollstaendig}</td>
      <td>${row.handarbeit}</td>
      <td>${row.automatisch}</td>
      <td><div class="track" style="max-width:160px"><div class="fill" style="width:${summe ? Math.round(row.vollstaendig / summe * 100) : 0}%"></div></div></td>
    </tr>`;
  }).join('');
  const offen = d.offen;
  const items = offen.items.map(e => {
    const status = e.status === 'handarbeit' ? { cls: 'blockiert', label: 'Handarbeit' } : { cls: 'freigabe', label: 'Füllt sich automatisch' };
    return `<tr>
      <td><span class="badge status ${status.cls}">${esc(status.label)}</span></td>
      <td>${esc(e.titel)}<div class="small muted mono">${esc(e.handle)}</div></td>
      <td>${esc(e.gruppe)}<div class="small muted">${e.variantenAnzahl} Variante${e.variantenAnzahl === 1 ? '' : 'n'}</div></td>
      <td>${e.offeneFelder.map(f => `<div><b>${esc(f.klartext)}</b>${f.blockierend ? ' <span class="badge p0" style="font-size:10px">blockiert Bestellung</span>' : ''}<div class="small muted">${esc(f.grund)}${f.variantenBetroffen < e.variantenAnzahl ? ` · ${f.variantenBetroffen}/${e.variantenAnzahl} Varianten` : ''}</div></div>`).join('')}</td>
      <td>${e.offeneFelder.map(f => `<div>${esc(f.naechsterSchritt)}</div>`).join('')}</td>
    </tr>`;
  }).join('');
  const pages = offen.pages > 1 ? `<div class="toolbar" style="margin-top:10px">
      <button type="button" class="btn btn-sm" ${offen.page <= 1 ? 'disabled' : ''} data-param="seite" data-value="${offen.page - 1}">← Zurück</button>
      <span class="muted small">Seite ${offen.page} von ${offen.pages} · ${offen.count} Produkte</span>
      <button type="button" class="btn btn-sm" ${offen.page >= offen.pages ? 'disabled' : ''} data-param="seite" data-value="${offen.page + 1}">Weiter →</button>
    </div>` : '';
  return `
    <div class="band" style="margin:12px 0">
      <div class="ok"><span class="n">${g.vollstaendig}</span><span class="l">von ${g.anzahl} Produkten vollständig</span></div>
      <div class="${g.handarbeit ? 'crit' : 'ok'}"><span class="n">${g.handarbeit}</span><span class="l">brauchen Handarbeit</span></div>
      <div class="info"><span class="n">${g.automatisch}</span><span class="l">füllen sich automatisch</span></div>
    </div>
    <p class="small muted" style="margin:-6px 0 14px">„Handarbeit" blockiert eine Bestellung beim Lieferanten (Lieferant, Artikelnummer, Farbnummer oder Bestellmenge unklar) – dort muss jemand nachschauen. „Füllt sich automatisch" sind reine Zusatzinformationen wie Kollektion oder Hersteller, die keine Bestellung aufhalten und sich ergänzen, sobald der laufende Abgleich weiterläuft.</p>
    <section class="card" style="margin-bottom:16px"><div class="card-head"><h2>Je Produktgruppe</h2></div>
      <table class="tasks"><thead><tr><th>Gruppe</th><th>Vollständig</th><th>Handarbeit</th><th>Automatisch</th><th>Anteil vollständig</th></tr></thead><tbody>${gruppenzeilen}</tbody></table>
    </section>
    ${toolbar}
    <section class="card"><div class="card-head"><h2>${esc(EINKAUF_PSFILTER_LABEL[psfilter])}</h2></div>
      <div style="overflow-x:auto"><table class="tasks"><thead><tr><th>Status</th><th>Produkt</th><th>Gruppe</th><th>Was fehlt</th><th>Nächster Schritt</th></tr></thead><tbody>${items || ''}</tbody></table></div>
      ${!items ? emptyState('Keine Treffer.', 'Suche oder Filter anpassen.') : ''}
      ${pages}
    </section>
    <p class="small muted" style="margin-top:10px">Quelle: ${esc(d.quelle)} · sortiert nach Dringlichkeit: was eine Bestellung blockiert steht oben.</p>`;
}

function viewEinkaufHilfe() {
  return `<section class="card">
    <h2>Dein Tag im Einkauf</h2>
    <p class="small muted">So gehst du die Bestellübersicht in der Praxis durch, Schritt für Schritt:</p>
    <ol style="margin:0 0 4px;padding-left:22px;line-height:1.7">
      <li>Öffne den Tab „Bestellübersicht" und schau oben auf die Zahlen: wie viele Positionen (das ist eine einzelne Zeile/ein Artikel einer Kundenbestellung) es noch zu bestellen gibt und wie viele Aufträge ein Problem haben (rot markiert).</li>
      <li>Kümmere dich zuerst um die Aufträge mit Problem (rote Ampel) – meist fehlt eine Angabe, die dort auch benannt wird, z. B. eine fehlende Großhändler-ID.</li>
      <li>Gehe dann die restlichen Positionen gruppiert nach Lieferant durch. Klicke bei jeder neuen Position auf „Beim Lieferanten öffnen" – das öffnet die passende Produktseite des Lieferanten in einem neuen Tab.</li>
      <li>Bestelle dort wie gewohnt (Telefon, E-Mail, Bestellportal – je nach Lieferant).</li>
      <li>Trage die Bestellung hier ein: Klick auf „Bestellt" und gib die Bestellnummer des Lieferanten ein (optional, hilft aber bei Rückfragen).</li>
      <li>Sobald die Ware bei dir ankommt, setze die Position auf „Geliefert an uns"; sobald sie an den Kunden raus ist (verschickt oder abgeholt), auf „An Kunden raus"; zum Schluss auf „Erledigt".</li>
      <li>Der Filter oben („Offen / Bestellt / Unterwegs / Erledigt") zeigt dir jederzeit, wie viele Positionen noch in welchem Schritt stehen – so siehst du auf einen Blick, was liegen geblieben ist.</li>
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
    <p><b>Bestellübersicht:</b> zeigt jede offene Kundenbestellung mit Ampel (grün = bereit, gelb = erst prüfen, rot = blockiert, z. B. fehlende Großhändler-ID oder Maßprüfungs-Problem) und darunter die Positionen, gruppiert nach Lieferant. Jede Zeile zeigt Kundenauftrag und Datum, Artikel, Farbe/Variante, die Kundenmenge und die daraus berechnete Bestellmenge beim Lieferanten samt Einheit, die Großhändler-ID, einen Link „Beim Lieferanten öffnen" (öffnet die Lieferanten-Produktseite in einem neuen Tab) und den Status mit dem Button für den nächsten Schritt. Über „Liste kopieren" kannst du die Bestellliste eines Lieferanten weiterhin komplett in eine Mail oder ein Bestellportal einfügen. Muster (Bestellungen von Produktmustern statt ganzer Ware) stehen in einer eigenen Liste. Der Auftrags-Link führt direkt zur Bestellung in Shopify.</p>
    <p><b>Status setzen:</b> „Bestellt" fragt nach der Bestellnummer des Lieferanten (optional, aber hilfreich bei Rückfragen) und merkt sich, wer wann bestellt hat. Die weiteren Schritte („Geliefert an uns", „An Kunden raus", „Erledigt") brauchen keine weitere Eingabe. Der Filter oben auf der Seite („Offen / Bestellt / Unterwegs / Erledigt") blendet die Listen entsprechend ein oder aus.</p>
    <p><b>Produktdaten-Status:</b> zeigt je PRODUKT (nicht je Variante) eine Zeile: wie viele Varianten es hat, was fehlt und was der nächste Schritt ist. Oben steht ehrlich, wie viele von den insgesamt erfassten Produkten vollständig sind, wie viele Handarbeit brauchen und wie viele sich von selbst füllen, sobald der laufende Lieferantenabgleich weiterläuft. „Handarbeit" heißt: eine Bestellung ist blockiert, weil Lieferant, Artikelnummer, Farbnummer oder Bestellmenge fehlen – das muss jemand von Hand in der Preisliste nachschauen. Zusatzinformation wie Kollektion oder Hersteller blockiert nichts und taucht nur als „füllt sich automatisch" auf. Filter oben: alle offenen Produkte, nur blockierende oder nur Handarbeit; dazu Suche nach Produktname, Handle oder SKU und Filter nach Produktgruppe. Sortiert ist die Liste nach Dringlichkeit – was eine Bestellung aufhält, steht oben.</p>
    <p><b>Wichtig:</b> Alle drei Ansichten laufen nur lokal auf dem Mac (<span class="mono">npm run dashboard</span>), weil sie private Bestell- und Einkaufsdaten lesen. Auf der öffentlichen Seite (GitHub Pages) ist der Bereich Einkauf immer leer – das ist beabsichtigt, damit keine Kundendaten oder Lieferantennamen öffentlich werden. Der Auftragsfluss-Status liegt in einer eigenen lokalen Datei auf deinem Mac und wird nie ins Repository übernommen. Nichts hier wird automatisch verschickt oder bestellt; jede Bestellung bleibt ein bewusster, manueller Schritt.</p>
  </section>`;
}

function viewEinkauf() {
  if (state.capabilities.mode !== 'local') {
    return `<div class="page-head"><div><h1>Einkauf</h1><p class="sub">Bestellübersicht und Produktdaten-Status für den Einkauf.</p></div></div>
      ${emptyState('Nur lokal im Betrieb verfügbar.', 'Diese Ansicht liest private Bestell- und Einkaufsdaten, die nie im öffentlichen Repository landen. Auf dem Mac starten: npm run dashboard')}`;
  }
  const tab = ['bestellungen', 'produktdaten', 'hilfe'].includes(state.route.params.get('tab')) ? state.route.params.get('tab') : 'bestellungen';
  const tabs = [['bestellungen', 'Bestellübersicht'], ['produktdaten', 'Produktdaten-Status'], ['hilfe', 'Hilfe & Anleitung']];
  ensureAktualisierung();
  const head = `<div class="page-head"><div><h1>Einkauf</h1><p class="sub">Was für offene Kundenbestellungen bei welchem Lieferanten zu bestellen ist, und wo Produktdaten für den Einkauf noch fehlen.</p></div>
      <div style="display:flex;gap:8px;align-items:start">${aktualisierenButton()}</div></div>
    <div class="chips" role="tablist">${tabs.map(([k, l]) => `<button type="button" class="chip" role="tab" aria-pressed="${tab === k}" data-param="tab" data-value="${k}">${esc(l)}</button>`).join('')}</div>`;
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
  const toolbar = `<div class="toolbar" style="margin:12px 0"><input type="search" placeholder="Produktname, Handle, SKU, Lieferanten-Artikelnummer, Farbe oder Kollektion …" value="${esc(q)}" data-param="lq" aria-label="Lexikon durchsuchen"></div>`;
  const d = lexikon.liste;
  if (!d && lexikon.loadingListe) return toolbar + `<div class="empty">Lade Lexikon …</div>`;
  if (!d || !d.verfuegbar) {
    const hinweis = `${d?.hinweis || 'Noch keine Daten exportiert.'}${d?.befehl ? ` Befehl: ${d.befehl}` : ''}`;
    return toolbar + emptyState('Keine Lexikon-Daten verfügbar.', hinweis);
  }
  const t = d.treffer;
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
  const head = `<div class="page-head"><div><h1>Lexikon</h1><p class="sub">Wofür ist das da: Ein Kunde nennt einen Produktnamen aus unserem Shop – hier findest du in Sekunden das Original beim Lieferanten samt Bestelldaten.</p></div></div>`;
  return head + (handle ? viewLexikonDetail(handle) : viewLexikonListe());
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
const VIEWS = { heute: viewHeute, arbeit: viewArbeit, freigaben: viewFreigaben, bereiche: viewBereiche, insights: viewInsights, aktivitaet: viewAktivitaet, einkauf: viewEinkauf, lexikon: viewLexikon };

function render() {
  const main = $('#main');
  document.querySelectorAll('.mainnav a').forEach(a => a.toggleAttribute('aria-current', a.dataset.nav === state.route.view) || (a.dataset.nav === state.route.view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const nf = $('#navFreigaben'); const approvals = state.tasks.filter(t => t.status === 'freigabe').length;
  nf.hidden = !approvals; nf.textContent = approvals;
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
  document.title = `${{ heute: 'Heute', arbeit: 'Arbeit', freigaben: 'Freigaben', bereiche: 'Bereiche', insights: 'Insights', aktivitaet: 'Aktivität', einkauf: 'Einkauf', lexikon: 'Lexikon' }[state.route.view]} · Teppich Dashboard`;
  renderSheet();
  $('#mainnav').classList.remove('open'); $('#navToggle').setAttribute('aria-expanded', 'false');
}

function bindEvents() {
  // Aufklappbare Startseiten-Abschnitte merken sich Auf/Zu je Abschnitt (nicht je Aufgabe).
  document.addEventListener('toggle', e => {
    const d = e.target.closest?.('details[data-collapsible]');
    if (!d) return;
    try { localStorage.setItem(`tp-heute-${d.dataset.collapsible}`, d.open ? '1' : '0'); } catch {}
  }, true);
  document.addEventListener('click', e => {
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
      // Nur den direkten Zellentext lesen, nicht das verschachtelte SKU-<div> mit -
      // sonst haengt am Titel im Dialog z.B. "UNGEKLAERT" ohne Trennzeichen an ("testUNGEKLAERT").
      const zellenText = td => { const c = td?.cloneNode(true); c?.querySelectorAll('div').forEach(d => d.remove()); return c?.textContent?.trim() || ''; };
      const tr = afBtn.closest('tr');
      const pos = { orderId: afBtn.dataset.afOrder, lineItemId: afBtn.dataset.afItem, orderName: zellenText(tr?.querySelector('td:nth-child(2)')), titel: zellenText(tr?.querySelector('td:nth-child(3)')), farbe: zellenText(tr?.querySelector('td:nth-child(4)')) };
      const status = afBtn.dataset.afStatus;
      if (status === 'bestellt') openAuftragsstatusDialog(pos, status);
      else setzeAuftragsstatus(pos, status);
      return;
    }
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
  document.addEventListener('input', e => { const el = e.target.closest('input[type=search][data-param]'); if (!el) return; const key = el.dataset.param; clearTimeout(qTimer); qTimer = setTimeout(() => { const p = new URLSearchParams(state.route.params); if (el.value) p.set(key, el.value); else p.delete(key); history.replaceState(null, '', `#/${state.route.view}?${p}`); parseRoute(); const focus = el; render(); const again = document.querySelector('input[type=search][data-param]'); if (again && focus) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } }, 220); });
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
  window.addEventListener('hashchange', async () => { const prev = state.route.view; parseRoute(); state.selectedRow = -1; if (state.route.view === 'aktivitaet' && prev !== 'aktivitaet') activityCache = await loadActivity(); render(); if (state.route.view === 'lexikon' && prev !== 'lexikon' && !state.route.params.get('handle')) $('#main input[data-param="lq"]')?.focus(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh({ silent: true }); });
}

async function init() {
  parseRoute();
  bindEvents();
  await loadSession();
  await loadCapabilities();
  await loadData();
  renderSyncChip();
  if (state.route.view === 'aktivitaet') activityCache = await loadActivity();
  render();
  if (state.route.view === 'lexikon' && !state.route.params.get('handle')) $('#main input[data-param="lq"]')?.focus();
  loadWorkflowRun().then(() => { renderSyncChip(); if (['heute', 'insights'].includes(state.route.view)) render(); });
  loadAgentRuns().then(() => { if (state.agentRuns) render(); });
  setInterval(() => refresh({ silent: true }), CONFIG.refreshMs);
}

init();
