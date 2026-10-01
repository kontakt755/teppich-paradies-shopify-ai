/**
 * Ansicht "Entwicklung" (#/arbeit, nur Inhaber): GitHub-Aufgaben als Liste oder Kanban,
 * gespeicherte Sichten, Filter, ruhende Projekte gebuendelt.
 */
import { STATUSES, COLUMNS, PRIORITIES, AREAS, SAVED_VIEWS, SORTS, matchesQuery } from '../lib/model.mjs';
import { state } from '../kern/zustand.mjs';
import { esc, fmtDate, ago, plural, newIssueUrl } from '../kern/helfer.mjs';
import { render } from '../kern/render.mjs';
import { emptyState } from '../bausteine/karten.mjs';
import {
  prioBadge, statusBadge, ownerText, execBadge, dueText, taskRow, echterSchritt,
} from '../bausteine/aufgaben.mjs';

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

export function viewArbeit() {
  const p = state.route.params; const mode = p.get('mode') || 'liste';
  const list = filteredTasks();
  const owners = [...new Set(state.tasks.map(t => t.owner).filter(Boolean))].sort();
  const counts = Object.fromEntries(SAVED_VIEWS.map(v => [v.key, state.tasks.filter(t => v.filter(t, { me: state.me })).length]));
  const sel = (name, opts, cur, first) => `<select data-param="${name}" aria-label="${esc(first)}"><option value="">${esc(first)}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const unassigned = state.tasks.filter(t => SAVED_VIEWS.find(v => v.key === 'unzugeordnet').filter(t, {})).length;
  return `
    <div class="page-head"><div><h1>Entwicklung</h1><p class="sub">${plural(list.length, 'Aufgabe', 'Aufgaben')} in dieser Ansicht · Quelle GitHub Issues</p></div>
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

/** Entwicklung: ruhendes Projekt auf- und zuklappen. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function arbeitKlick(e) {
  const proj = e.target.closest('[data-toggle-projekt]');
  if (proj) { const k = proj.dataset.toggleProjekt; if (state.offeneProjekte.has(k)) state.offeneProjekte.delete(k); else state.offeneProjekte.add(k); render(); return true; }
  return false;
}
