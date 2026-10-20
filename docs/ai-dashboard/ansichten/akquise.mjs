/**
 * Ansicht "Akquise" (#/akquise, nur Inhaber, Issue #1447): Verlegeauftraege bei
 * Wohnungsgenossenschaften und Hausverwaltungen nachhalten. Die Firmenliste und die
 * Vorlage liegen privat, der Stand im Privatordner (/api/akquise/*). Versendet wird
 * nichts - "Nachricht kopieren" legt den Text in die Zwischenablage.
 */
import { state } from '../kern/zustand.mjs';
import { esc, fmtDate, fmtDateTime, toast } from '../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { emptyState } from '../bausteine/karten.mjs';
import { AKQUISE_STATUS, AKQUISE_LABEL, faelligeWiedervorlagen, nachrichtFuer } from '../lib/akquise.mjs';

export const akquise = { daten: null, laedt: false };

const heute = () => new Date().toLocaleDateString('sv-SE');
const OFFEN = f => !['auftrag', 'kein-interesse'].includes(f.status);

/** Laedt Firmen, Stand und Ausschreibungen - auch fuer das To-do auf "Heute". */
export function ensureAkquise(neu = false) {
  if (akquise.laedt || (akquise.daten && !neu)) return;
  akquise.laedt = true;
  fetchEinkauf('/api/akquise/liste').then(d => {
    akquise.daten = d; akquise.laedt = false;
    if (['heute', 'akquise'].includes(state.route.view)) render();
  });
}

/** Faellige Wiedervorlagen fuer die To-dos auf "Heute". */
export function akquiseFaellig() {
  const d = akquise.daten;
  return d?.verfuegbar ? faelligeWiedervorlagen(d.firmen, heute()) : [];
}

function zeile(f, faellig) {
  const web = f.website ? `<a href="${esc(f.website)}" target="_blank" rel="noopener">${esc(f.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>` : '';
  const optionen = AKQUISE_STATUS.map(s => `<option value="${s}"${s === f.status ? ' selected' : ''}>${esc(AKQUISE_LABEL[s])}</option>`).join('');
  return `<li class="akq-firma${faellig ? ' akq-faellig' : ''}">
    <div class="akq-kopf"><b>${esc(f.name)}</b>
      <span class="small muted">${[f.ort, f.wohnungen ? `${f.wohnungen} Wohnungen` : ''].filter(Boolean).map(esc).join(' · ')}</span>
      ${web ? `<span class="small akq-web">${web}</span>` : ''}</div>
    <div class="akq-felder">
      <label class="small">Status <select data-akq-feld="status" data-akq-id="${esc(f.id)}">${optionen}</select></label>
      <label class="small">Wiedervorlage <input type="date" value="${esc(f.wiedervorlage)}" data-akq-feld="wiedervorlage" data-akq-id="${esc(f.id)}"></label>
      <span class="small ${faellig ? 'akq-hinweis' : 'muted'}">${faellig ? 'Nachfassen fällig' : f.letzteAktion ? `zuletzt ${esc(fmtDate(f.letzteAktion))}` : ''}</span>
      <button type="button" class="btn btn-sm" data-akq-kopieren="${esc(f.id)}">Nachricht kopieren</button>
    </div>
    <textarea class="akq-notiz" rows="1" placeholder="Notiz (Ansprechpartner, Rückmeldung …)" data-akq-feld="notiz" data-akq-id="${esc(f.id)}">${esc(f.notiz)}</textarea>
  </li>`;
}

function ausschreibungen(a) {
  if (!a) return `<section class="card"><div class="card-head"><h2>Ausschreibungen</h2></div><p class="small muted">Die wöchentliche Suche nach Ausschreibungen ist noch nicht gelaufen.</p></section>`;
  const t = [...(a.treffer || [])].sort((x, y) => String(x.frist || '9').localeCompare(String(y.frist || '9')));
  return `<section class="card"><div class="card-head"><h2>Ausschreibungen Bodenbelag</h2><span class="small muted">geprüft ${esc(fmtDateTime(a.geprueftAm))}</span></div>
    ${t.length ? `<div class="table-scroll"><table class="tasks"><thead><tr><th>Titel</th><th>Auftraggeber</th><th>Frist</th><th></th></tr></thead><tbody>
      ${t.map(x => `<tr><td>${esc(x.titel)}</td><td>${esc(x.auftraggeber || '')}</td><td>${esc(x.frist || '–')}</td><td>${x.link ? `<a href="${esc(x.link)}" target="_blank" rel="noopener">Bekanntmachung</a>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : `<p class="small muted">Zurzeit keine passenden Ausschreibungen im Umkreis.</p>`}
  </section>`;
}

export function viewAkquise() {
  ensureAkquise();
  const kopf = `<div class="page-head"><div><h1>Akquise</h1><p class="sub">Verlegeaufträge bei Wohnungsunternehmen – wer ist angeschrieben, wann wird nachgefasst.</p></div></div>`;
  const d = akquise.daten;
  if (!d && akquise.laedt) return kopf + `<div class="empty">Lade Firmenliste …</div>`;
  if (!d || !d.verfuegbar) return kopf + emptyState(d?.hinweis || 'Die Firmenliste ist nicht erreichbar.', d?.befehl || '');
  const filter = state.route.params.get('as') || 'offen';
  const tag = heute();
  const faelligIds = new Set(faelligeWiedervorlagen(d.firmen, tag).map(f => f.id));
  const zahl = s => d.firmen.filter(f => s === 'offen' ? OFFEN(f) : s === 'faellig' ? faelligIds.has(f.id) : f.status === s).length;
  const chips = ['offen', ...(faelligIds.size ? ['faellig'] : []), ...AKQUISE_STATUS, 'alle'].map(s => {
    const n = s === 'alle' ? d.firmen.length : zahl(s);
    if (!n && !['offen', 'alle'].includes(s) && s !== filter) return '';
    const label = { offen: 'Offen', faellig: 'Nachfassen fällig', alle: 'Alle' }[s] || AKQUISE_LABEL[s];
    return `<a class="chip" aria-pressed="${s === filter}" href="#/akquise?as=${s}">${esc(label)}<span class="c">${n}</span></a>`;
  }).join('');
  const liste = d.firmen
    .filter(f => filter === 'alle' ? true : filter === 'offen' ? OFFEN(f) : filter === 'faellig' ? faelligIds.has(f.id) : f.status === filter)
    .sort((a, b) => Number(faelligIds.has(b.id)) - Number(faelligIds.has(a.id)) || String(a.wiedervorlage || '9').localeCompare(String(b.wiedervorlage || '9')));
  return kopf + `
    <div class="chips akq-chips">${chips}</div>
    <section class="card" style="margin-bottom:14px">
      ${liste.length ? `<ul class="akq-liste">${liste.map(f => zeile(f, faelligIds.has(f.id))).join('')}</ul>` : `<p class="small muted">In diesem Filter ist keine Firma.</p>`}
      <p class="small muted" style="margin:10px 0 0">„Nachricht kopieren“ legt das Anschreiben mit Firmennamen in die Zwischenablage – versendet wird nichts. Nach „angeschrieben“ steht die Wiedervorlage automatisch 14 Tage später.</p>
    </section>
    ${ausschreibungen(d.ausschreibungen)}`;
}

async function speichere(id, feld, wert) {
  try {
    const r = await orgSchreiben('/api/akquise/aendern', { id, [feld]: wert });
    const f = akquise.daten?.firmen?.find(x => x.id === id);
    if (f) Object.assign(f, r.firma);
    toast(feld === 'status' ? `Status: ${AKQUISE_LABEL[wert]}` : feld === 'notiz' ? 'Notiz gespeichert' : 'Wiedervorlage gespeichert', 'ok');
  } catch (e) {
    toast(`Nicht gespeichert: ${e.message}`, 'crit');
  }
  render();
}

/** change-Ereignis: Status, Wiedervorlage, Notiz (Notiz beim Verlassen des Feldes). */
export function akquiseAenderung(ev) {
  const el = ev.target.closest('[data-akq-feld]');
  if (!el) return false;
  speichere(el.dataset.akqId, el.dataset.akqFeld, el.value);
  return true;
}

export function akquiseKlick(ev) {
  const k = ev.target.closest('[data-akq-kopieren]');
  if (!k) return false;
  const f = akquise.daten?.firmen?.find(x => x.id === k.dataset.akqKopieren);
  if (!f || !akquise.daten.vorlage) { toast('Keine Vorlage gefunden.', 'crit'); return true; }
  navigator.clipboard.writeText(nachrichtFuer(akquise.daten.vorlage, f.name)).then(
    () => { k.textContent = 'Kopiert'; setTimeout(() => { k.textContent = 'Nachricht kopieren'; }, 1800); },
    () => toast('Kopieren fehlgeschlagen – Browser erlaubt die Zwischenablage nicht.', 'crit'),
  );
  return true;
}
