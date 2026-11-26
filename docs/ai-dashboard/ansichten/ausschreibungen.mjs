/**
 * Ansicht "Ausschreibungen" (#/ausschreibungen): alle oeffentlichen Ausschreibungen auf einen Blick -
 * offen nach Frist, darunter ungeprueft Suchtreffer, ganz unten erledigt oder abgesagt. Ohne KI
 * aktuell: der Server liest bei jedem Abruf status.json und die Kopfbloecke der Checklisten
 * (/api/ausschreibungen/liste), diese Ansicht laedt bei jedem Oeffnen neu. Nur lesen - die Abgabe
 * im Portal macht der Inhaber. Regeln: lib/ausschreibungen.mjs.
 */
import { state } from '../kern/zustand.mjs';
import { esc, fmtDateTime } from '../kern/helfer.mjs';
import { fetchEinkauf } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { emptyState, stoerungState } from '../bausteine/karten.mjs';
import { STATUS_LABEL, fristLage } from '../lib/ausschreibungen.mjs';

export const ausschreibungen = { daten: null, laedt: false, geladenAm: 0 };

// Beim Oeffnen frisch laden; innerhalb weniger Sekunden reicht der Stand (jede Zeichnung ruft die Ansicht).
const NEU_LADEN_NACH_MS = 5000;

function ladeNeu() {
  if (ausschreibungen.laedt) return;
  ausschreibungen.laedt = true;
  fetchEinkauf('/api/ausschreibungen/liste').then(d => {
    ausschreibungen.daten = d;
    ausschreibungen.laedt = false;
    ausschreibungen.geladenAm = Date.now();
    if (state.route.view === 'ausschreibungen') render();
  });
}

const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function datumKurz(tag) {
  const [j, m, t] = tag.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t, 12));
  return `${WOCHENTAG[d.getUTCDay()]} ${String(t).padStart(2, '0')}.${String(m).padStart(2, '0')}.${j}`;
}

function fristText(e, heute) {
  if (!e.frist) return { html: '<span class="muted">keine Frist angegeben</span>', cls: '' };
  const l = fristLage(e, heute);
  const uhr = e.frist.uhr ? `, ${esc(e.frist.uhr)} Uhr` : '';
  let zusatz = '';
  if (l.vorbei) zusatz = ` – seit ${-l.tage === 1 ? '1 Tag' : `${-l.tage} Tagen`} vorbei`;
  else if (l.nah) zusatz = l.tage === 0 ? ' – heute' : l.tage === 1 ? ' – morgen' : ` – in ${l.tage} Tagen`;
  return { html: `${esc(datumKurz(e.frist.tag))}${uhr}${zusatz}`, cls: l.vorbei ? 'aus-vorbei' : l.nah ? 'aus-nah' : '' };
}

function pille(e) {
  const st = e.status || (e.quelle === 'ordner' ? null : 'ungeprueft');
  if (!st) return '<span class="badge status blockiert">Status fehlt</span>';
  const cls = { bieten: 'review', 'in-arbeit': 'in-arbeit', abgegeben: 'fertig' }[st] || '';
  return `<span class="badge status ${cls}">${esc(STATUS_LABEL[st] || st)}</span>`;
}

const fakt = (label, inhalt) => inhalt ? `<div class="aus-fakt"><dt>${label}</dt><dd>${inhalt}</dd></div>` : '';

function karte(e, heute) {
  const f = fristText(e, heute);
  const ortZeile = [e.auftraggeber, e.ort].filter(Boolean).map(esc).join(' · ');
  return `<article class="card aus-karte${f.cls ? ` ${f.cls}-karte` : ''}">
    <div class="aus-kopf"><h3 class="aus-titel">${esc(e.titel)}</h3><div class="aus-pillen">${e.neu ? '<span class="badge status freigabe">neu</span> ' : ''}${pille(e)}</div></div>
    ${ortZeile ? `<div class="small aus-meta">${ortZeile}</div>` : ''}
    ${e.leistung ? `<p class="aus-leistung">${esc(e.leistung)}</p>` : ''}
    <dl class="aus-fakten">
      ${fakt('Frist', `<span class="${f.cls}">${f.html}</span>`)}
      ${fakt('Außerdem', esc(e.nebenfrist))}
      ${fakt('Stand', esc(e.stand))}
      ${fakt('Nächster Schritt', esc(e.naechsterSchritt))}
    </dl>
    ${e.hinweis ? `<p class="small aus-hinweis">${esc(e.hinweis)}</p>` : ''}
    ${e.portal ? `<a class="small aus-link" href="${esc(e.portal)}" target="_blank" rel="noopener noreferrer">Zum Portal</a>` : ''}
  </article>`;
}

function abschnitt(titel, hinweis, liste, heute) {
  if (!liste.length) return '';
  return `<section class="aus-abschnitt"><h2 class="aus-ueberschrift">${esc(titel)} <span class="muted">(${liste.length})</span></h2>
    ${hinweis ? `<p class="small muted">${esc(hinweis)}</p>` : ''}
    <div class="aus-liste">${liste.map(e => karte(e, heute)).join('')}</div></section>`;
}

function kopf(d) {
  const suche = d?.geprueftAm ? `Suche zuletzt: ${esc(fmtDateTime(d.geprueftAm))}` : '';
  return `<div class="page-head"><div><h1>Ausschreibungen</h1>
    <p class="sub">Hier sehen wir alle öffentlichen Ausschreibungen: offen nach Frist, darunter das Erledigte.</p>${suche ? `<p class="small muted aus-suche">${suche}</p>` : ''}</div></div>`;
}

export function viewAusschreibungen() {
  if (!ausschreibungen.laedt && Date.now() - ausschreibungen.geladenAm > NEU_LADEN_NACH_MS) ladeNeu();
  const d = ausschreibungen.daten;
  if (!d) return kopf(null) + '<div class="empty">Lade Ausschreibungen …</div>';
  if (d.fehler) return kopf(null) + stoerungState(d, 'Die Ausschreibungen');
  if (!d.verfuegbar) return kopf(null) + emptyState('Keine Ausschreibungen auf diesem Rechner.', d.hinweis || '');
  const heute = d.heute;
  const ausfall = d.ausfaelle?.length
    ? `<div class="notice warn">Bei der letzten Suche waren nicht alle Quellen erreichbar (${esc(d.ausfaelle.join(', '))}). Treffer können fehlen.</div>` : '';
  const stand = d.statusHinweis ? `<div class="notice warn">${esc(d.statusHinweis)}</div>` : '';
  const leer = !d.offen.length && !d.ungeprueft.length && !d.erledigt.length;
  return kopf(d) + stand + ausfall + (leer ? emptyState('Zurzeit keine Ausschreibungen.', 'Neue Treffer kommen vom wöchentlichen Suchlauf.') : [
    abschnitt('Offen', '', d.offen, heute),
    abschnitt('Neu im Suchlauf, noch nicht geprüft', 'Diese Treffer hat noch niemand angesehen. Sobald ein Verfahren bearbeitet wird, bekommt es einen eigenen Ordner.', d.ungeprueft, heute),
    abschnitt('Erledigt oder abgesagt', '', d.erledigt, heute),
  ].join(''));
}
