/**
 * Ansicht "Freigaben" (#/freigaben, nur Inhaber): Entscheidungen, die auf einen Menschen warten.
 */
import { state } from '../kern/zustand.mjs';
import { esc, fmtDate, since, newIssueUrl } from '../kern/helfer.mjs';
import { emptyState } from '../bausteine/karten.mjs';
import { prioBadge, statusBadge, taskLink, taskRow, echterSchritt } from '../bausteine/aufgaben.mjs';

export function viewFreigaben() {
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
