/**
 * Darstellung einer Entwicklungsaufgabe (GitHub Issue): Badges, Zeile, naechster Schritt.
 * Gebraucht von Heute, Entwicklung, Freigaben, Bereiche, Insights und dem Aufgaben-Panel.
 */
import { PRIORITIES, AREAS } from '../lib/model.mjs';
import { esc, fmtDate, ago, plural } from '../kern/helfer.mjs';

export const prioBadge = t => t.priority ? `<span class="badge ${t.priority}" title="${esc(PRIORITIES[t.priority].label)}">${PRIORITIES[t.priority].short}</span>` : `<span class="badge gap" title="Priorität fehlt">P?</span>`;
export const statusBadge = t => `<span class="badge status ${esc(t.status)}">${esc(t.statusLabel)}</span>${t.legacyApproval ? '<span class="badge plain" title="Übergangsregel: abgeleitet aus status:blockiert + reviewer:mensch, weil status:freigabe im Repository fehlt">abgeleitet</span>' : ''}`;
export const ownerText = t => t.owner ? `@${esc(t.owner)}` : `<span class="badge gap">ohne Owner</span>`;
export const execBadge = t => t.executor ? `<span class="badge ${t.executorKind === 'ki' ? 'ki' : 'plain'}" title="Ausführende:r">${esc(t.executor)}</span>` : '';
export const dueText = t => t.due ? (t.overdue ? `<span class="warnc">überfällig seit ${fmtDate(t.due)}</span>` : t.daysToDue === 0 ? '<b>heute fällig</b>' : `fällig ${fmtDate(t.due)}`) : '';
export const areaLabel = key => AREAS.find(a => a.key === key)?.label || key;
export const taskLink = t => `<a href="#" data-open="${t.number}">${esc(t.title)}</a>`;

export function taskRow(t, { showNext = true } = {}) {
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

// Der Standardtext, den `npm run task -- create` ohne --next eintraegt. Er sagt nichts ueber
// die Aufgabe und wiederholte sich in fast jeder Zeile - in Listen wird er ausgeblendet.
const PLATZHALTER_SCHRITT = /^Triage: Priorität, Owner und Akzeptanzkriterien festlegen\.?$/i;
export const echterSchritt = t => (t.nextStep && !PLATZHALTER_SCHRITT.test(t.nextStep.trim())) ? t.nextStep : '';

export function primaryAction(t) {
  if (t.status === 'freigabe') return { key: 'approve', label: 'Freigabe erteilen' };
  if (t.status === 'blockiert') return { key: 'unblock', label: 'Blocker lösen' };
  if (t.status === 'review') return { key: 'fertig', label: 'Review abschließen' };
  if (['in-arbeit', 'korrektur'].includes(t.status)) return { key: 'review', label: 'Review anfordern' };
  if (['bereit', 'geplant', 'eingang', 'triage'].includes(t.status)) return t.owner ? { key: 'in-arbeit', label: 'Nächsten Schritt starten' } : { key: 'assign', label: 'Owner zuordnen' };
  if (!t.open) return { key: 'reopen', label: 'Wieder öffnen' };
  return { key: 'open', label: 'Aufgabe öffnen' };
}
