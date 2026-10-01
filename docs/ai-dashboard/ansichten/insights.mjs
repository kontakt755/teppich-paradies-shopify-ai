/**
 * Ansicht "Insights" (#/insights, nur Inhaber): Verteilung der Aufgaben und Systemgesundheit.
 */
import { STATUSES, PRIORITIES } from '../lib/model.mjs';
import { state } from '../kern/zustand.mjs';
import { esc, fmtDate, fmtDateTime } from '../kern/helfer.mjs';
import { emptyState } from '../bausteine/karten.mjs';
import { prioBadge } from '../bausteine/aufgaben.mjs';
import { ensureAktualisierung } from '../bausteine/aktualisierung.mjs';
import { systemHealth, healthRow } from '../bausteine/systemzustand.mjs';

export function viewInsights() {
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
