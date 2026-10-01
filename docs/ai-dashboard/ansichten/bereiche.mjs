/**
 * Ansicht "Bereiche" (#/bereiche, nur Inhaber): Zustand je Arbeitsbereich und Projektgruppen.
 */
import { areaHealth } from '../lib/model.mjs';
import { state } from '../kern/zustand.mjs';
import { esc } from '../kern/helfer.mjs';
import { prioBadge, taskLink } from '../bausteine/aufgaben.mjs';

export function viewBereiche() {
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
