/**
 * Ansicht "Aktivitaet" (#/aktivitaet, nur Inhaber): Verlauf der Aufgaben aus GitHub,
 * lokales Protokoll, Benutzerliste. Die Daten werden beim Betreten der Ansicht geladen
 * (ladeAktivitaetsdaten), nicht bei jedem Zeichnen.
 */
import { STATUS_BY_KEY } from '../lib/model.mjs';
import { state } from '../kern/zustand.mjs';
import { esc, fmtDateTime } from '../kern/helfer.mjs';

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
/** Laedt alles, was die Ansicht "Aktivitaet" zeigt - nacheinander, wie bisher beim Betreten der Ansicht. */
export async function ladeAktivitaetsdaten() {
  activityCache = await loadActivity();
  protokollCache = await loadProtokoll();
  benutzerCache = await loadBenutzer();
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

export function viewAktivitaet() {
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
  // Die Verwaltung wohnt jetzt unter "Team" - hier stand eine zweite, nur
  // lesende Tabelle mit dem Hinweis, man moege es im Terminal erledigen.
  if (!benutzerCache) return '';
  return `<div class="page-head" style="margin-top:24px">
      <div><h2>Mitarbeiterzugänge</h2>
      <p class="sub">${esc((benutzerCache.benutzer || []).length)} Zugänge eingerichtet.</p></div>
      <div class="head-actions"><a class="btn" href="#/team">Zugänge verwalten →</a></div>
    </div>`;
}
