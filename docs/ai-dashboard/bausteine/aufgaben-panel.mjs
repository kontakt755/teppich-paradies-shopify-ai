/**
 * Aufgaben-Detail als seitliches Panel mit Deep Link (#/…?task=92).
 */
import { attentionScore, dependentsOf } from '../lib/model.mjs';
import { state } from '../kern/zustand.mjs';
import { $, esc, fmtDate, fmtDateTime, ago, since, issueUrl } from '../kern/helfer.mjs';
import { emptyState } from './karten.mjs';
import {
  prioBadge, statusBadge, ownerText, execBadge, dueText, areaLabel, primaryAction,
} from './aufgaben.mjs';

export async function renderSheet() {
  const root = $('#sheetRoot');
  const n = Number(state.route.params.get('task'));
  if (!n) { root.innerHTML = ''; document.body.style.overflow = ''; state.sheetOffenFuer = null; return; }
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
  // Nur beim Oeffnen fokussieren. renderSheet() laeuft auch beim Nachladen und
  // beim stillen Datenabgleich - dabei riss der Fokus aus dem Panel zurueck
  // aufs Kreuz, und das naechste Enter schloss es.
  if (state.sheetOffenFuer !== n) {
    state.sheetOffenFuer = n;
    root.querySelector('[data-close-sheet].btn')?.focus();
  }
  if (local && !detail) {
    try {
      const r = await fetch(`/api/tasks/${n}/activity`, { cache: 'no-store' });
      state.detailCache.set(n, r.ok ? await r.json() : { error: `Verlauf nicht ladbar (HTTP ${r.status})` });
    } catch (e) { state.detailCache.set(n, { error: e.message }); }
    if (Number(state.route.params.get('task')) === n) renderSheet();
  }
}
