/**
 * Ansicht "Hausverwaltungen" (#/hausverwaltungen, Werkbank w-154, Issue #1768): Verwaltungen
 * mit Ansprechpartner, ihre Objekte und die Angebote bzw. Auftraege je Objekt. Die Liste zeigt
 * zuerst, wer heute wieder dran ist; ein Klick auf den Namen oeffnet die Verwaltung
 * (?hv=<id>). Gespeichert wird lokal ueber /api/hausverwaltungen/*; Lexware und Auftrags-App
 * sind nur Felder, versendet wird nichts. Regeln: lib/hausverwaltungen.mjs.
 */
import { state } from '../kern/zustand.mjs';
import { $, esc, fmtDate, toast } from '../kern/helfer.mjs';
import { istNurLesend } from '../kern/sitzung.mjs';
import { fetchEinkauf, orgSchreiben } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { emptyState, stoerungState } from '../bausteine/karten.mjs';
import { tageBis } from '../lib/akquise.mjs';
import {
  HV_STATUS, HV_LABEL, ANGEBOT_ART, ANGEBOT_ART_LABEL, ANGEBOT_STAND, ANGEBOT_STAND_LABEL,
  hvFaellig, sortiereHv, hvKennzahlen, telHref,
} from '../lib/hausverwaltungen.mjs';

export const hausverwaltungen = { daten: null, laedt: false };

const heute = () => new Date().toLocaleDateString('sv-SE');
const plural = (n, eins, mehr) => `${n} ${n === 1 ? eins : mehr}`;
// Ab so vielen Tagen ohne Antwort faellt ein offenes Angebot auf - wie das Nachfassen bei den Genossenschaften.
const ANGEBOT_NACHFASSEN_TAGE = 14;

/** Laedt die Verwaltungen - auch fuer das To-do auf "Heute". */
export function ensureHausverwaltungen(neu = false) {
  if (hausverwaltungen.laedt || (hausverwaltungen.daten && !neu)) return;
  hausverwaltungen.laedt = true;
  fetchEinkauf('/api/hausverwaltungen/liste').then(d => {
    hausverwaltungen.daten = d; hausverwaltungen.laedt = false;
    if (['heute', 'hausverwaltungen'].includes(state.route.view)) render();
  });
}

/** Faellige Wiedervorlagen fuer die To-dos auf "Heute". */
export function hausverwaltungenFaellig() {
  const d = hausverwaltungen.daten;
  return d?.verfuegbar ? hvFaellig(d.verwaltungen, heute()) : [];
}

const finde = id => hausverwaltungen.daten?.verwaltungen?.find(v => v.id === id) || null;

function statusChip(v, faellig) {
  const st = v.status || 'neu';
  const cls = st === 'kunde' ? 'fertig' : ['antwort', 'termin'].includes(st) ? 'review' : '';
  return `<span class="badge status ${cls}">${esc(HV_LABEL[st] || st)}</span>${faellig ? ' <span class="badge status freigabe">wieder melden</span>' : ''}`;
}

/** "wieder melden am 12.11." - faellige in Bernstein mit Zahl der Tage. */
function wiedervorlageText(v, tag) {
  if (!v.wiedervorlage || (v.status || 'neu') === 'kein-interesse') return '';
  const n = tageBis(v.wiedervorlage, tag);
  if (n === null) return '';
  if (n > 0) return `<span class="muted">wieder melden am ${esc(fmtDate(v.wiedervorlage))}</span>`;
  return `<span class="hv-faellig">${n === 0 ? 'heute wieder melden' : `wieder melden – seit ${plural(-n, 'Tag', 'Tagen')} fällig`}</span>`;
}

function kontaktZeile(v) {
  const teile = [
    v.ansprechpartner ? esc(v.ansprechpartner) : '',
    v.telefon ? `<a href="tel:${esc(telHref(v.telefon))}">${esc(v.telefon)}</a>` : '',
    v.email ? `<a href="mailto:${esc(v.email)}">${esc(v.email)}</a>` : '',
  ].filter(Boolean);
  return teile.length ? teile.join(' · ') : '<span class="hv-fehlt">Ansprechpartner fehlt</span>';
}

/** Zahlen ohne Nullen: "3 Objekte · 120 Wohnungen · 1 Angebot offen". */
function zahlenZeile(v) {
  const k = hvKennzahlen(v);
  return [
    k.objekte ? plural(k.objekte, 'Objekt', 'Objekte') : 'noch kein Objekt',
    k.wohnungen ? `${k.wohnungen.toLocaleString('de-DE')} Wohnungen` : '',
    k.offeneAngebote ? `${plural(k.offeneAngebote, 'Angebot', 'Angebote')} offen` : '',
    k.auftraege ? plural(k.auftraege, 'Auftrag', 'Aufträge') : '',
  ].filter(Boolean).join(' · ');
}

function zeile(v, faellig, tag) {
  const wv = wiedervorlageText(v, tag);
  return `<div class="row hv-zeile">
    <div>
      <div class="t"><a href="#/hausverwaltungen?hv=${esc(v.id)}">${esc(v.name)}</a> ${statusChip(v, faellig)}</div>
      <div class="m">${kontaktZeile(v)}</div>
      <div class="small">${esc(zahlenZeile(v))}${wv ? ` · ${wv}` : ''}</div>
    </div>
  </div>`;
}

function kopf(mitKnopf) {
  return `<div class="page-head"><div><h1>Hausverwaltungen</h1>
    <p class="sub">Hier pflegen wir die Hausverwaltungen, mit denen wir zusammenarbeiten: Ansprechpartner, Objekte und Angebote. Die erste Ansprache aus der Firmenliste läuft unter <a href="#/akquise">Genossenschaften</a>.</p></div>
    ${mitKnopf && !istNurLesend() ? '<div class="head-actions"><button type="button" class="btn btn-primary" data-hv-neu>+ Hausverwaltung</button></div>' : ''}</div>`;
}

function liste(d, tag) {
  const faellig = new Set(hvFaellig(d.verwaltungen, tag).map(v => v.id));
  const sortiert = sortiereHv(d.verwaltungen, tag);
  const aktiv = sortiert.filter(v => (v.status || 'neu') !== 'kein-interesse');
  const ohne = sortiert.filter(v => (v.status || 'neu') === 'kein-interesse');
  if (!d.verwaltungen.length) {
    return emptyState('Noch keine Hausverwaltung eingetragen.', istNurLesend() ? '' : 'Mit „+ Hausverwaltung“ die erste anlegen – Name genügt, der Rest kann später dazu.');
  }
  return `<div class="rows hv-liste">${aktiv.length ? aktiv.map(v => zeile(v, faellig.has(v.id), tag)).join('') : emptyState('Alle eingetragenen Verwaltungen haben kein Interesse.', '')}</div>
    ${ohne.length ? `<details class="hv-ohne"><summary>${plural(ohne.length, 'Verwaltung', 'Verwaltungen')} ohne Interesse</summary><div class="rows">${ohne.map(v => zeile(v, false, tag)).join('')}</div></details>` : ''}`;
}

function angebotZeile(v, o, a, tag) {
  const lesend = istNurLesend();
  const bezug = [
    a.lexware ? `Lexware <b>${esc(a.lexware)}</b>` : '',
    a.auftragsApp ? `Auftrags-App <b>${esc(a.auftragsApp)}</b>` : '',
    a.datum ? esc(fmtDate(a.datum)) : '',
  ].filter(Boolean).join(' · ');
  const alt = a.stand === 'offen' && a.art === 'angebot' && a.datum ? -tageBis(a.datum, tag) : null;
  const cls = a.stand === 'abgelehnt' ? '' : ['angenommen', 'erledigt'].includes(a.stand) ? 'fertig' : 'review';
  return `<li class="hv-angebot">
    <div><span class="badge plain">${esc(ANGEBOT_ART_LABEL[a.art] || a.art)}</span> <span class="badge status ${cls}">${esc(ANGEBOT_STAND_LABEL[a.stand] || a.stand)}</span>${bezug ? ` <span class="small">${bezug}</span>` : ''}</div>
    ${a.notiz ? `<div class="small hv-notiz">${esc(a.notiz)}</div>` : ''}
    ${alt !== null && alt >= ANGEBOT_NACHFASSEN_TAGE ? `<div class="small hv-faellig">seit ${plural(alt, 'Tag', 'Tagen')} offen – nachfassen</div>` : ''}
    ${lesend ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-hv-angebot="${esc(a.id)}" data-hv-v="${esc(v.id)}" data-hv-o="${esc(o.id)}">Bearbeiten</button>`}
  </li>`;
}

function objektKarte(v, o, tag) {
  const lesend = istNurLesend();
  const vorOrtTel = o.vorOrt && (o.vorOrt.match(/\d/g) || []).length >= 6 ? telHref(o.vorOrt.split(/[,;/]/).find(t => (t.match(/\d/g) || []).length >= 6)) : '';
  const meta = [
    Number.isFinite(o.wohnungen) && o.wohnungen > 0 ? `${o.wohnungen.toLocaleString('de-DE')} Wohnungen` : '',
    o.vorOrt ? `vor Ort: ${esc(o.vorOrt)}${vorOrtTel ? ` · <a href="tel:${esc(vorOrtTel)}">anrufen</a>` : ''}` : '',
  ].filter(Boolean).join(' · ');
  const angebote = o.angebote || [];
  return `<div class="hv-objekt">
    <div class="hv-objekt-kopf"><b class="hv-adresse">${esc(o.adresse)}</b>${lesend ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-hv-objekt="${esc(o.id)}" data-hv-v="${esc(v.id)}">Bearbeiten</button>`}</div>
    ${meta ? `<div class="small">${meta}</div>` : ''}
    ${o.notiz ? `<div class="small hv-notiz">${esc(o.notiz)}</div>` : ''}
    ${angebote.length ? `<ul class="hv-angebote">${angebote.map(a => angebotZeile(v, o, a, tag)).join('')}</ul>` : '<p class="small muted hv-leer">Noch kein Angebot und kein Auftrag.</p>'}
    ${lesend ? '' : `<div><button type="button" class="btn btn-sm" data-hv-angebot="" data-hv-v="${esc(v.id)}" data-hv-o="${esc(o.id)}">+ Angebot oder Auftrag</button></div>`}
  </div>`;
}

function detail(v, tag) {
  const lesend = istNurLesend();
  const faellig = hvFaellig([v], tag).length > 0;
  const wv = wiedervorlageText(v, tag);
  const objekte = v.objekte || [];
  const knoepfe = [
    v.telefon ? `<a class="btn" href="tel:${esc(telHref(v.telefon))}">Anrufen</a>` : '',
    v.email ? `<a class="btn" href="mailto:${esc(v.email)}">E-Mail schreiben</a>` : '',
    lesend ? '' : `<button type="button" class="btn" data-hv-bearbeiten="${esc(v.id)}">Bearbeiten</button>`,
  ].filter(Boolean).join('');
  return `<p class="hv-zurueck"><a href="#/hausverwaltungen">← Alle Hausverwaltungen</a></p>
    <section class="card hv-kopf">
      <div class="hv-kopf-zeile"><h2 class="hv-name">${esc(v.name)}</h2><div>${statusChip(v, faellig)}</div></div>
      <div>${kontaktZeile(v)}</div>
      ${wv ? `<div class="small">${wv}</div>` : ''}
      ${v.notiz ? `<p class="hv-notiz">${esc(v.notiz)}</p>` : ''}
      ${knoepfe ? `<div class="hv-knoepfe">${knoepfe}</div>` : ''}
      ${v.geaendertAm ? `<p class="small muted">Zuletzt geändert am ${esc(fmtDate(v.geaendertAm))}${v.geaendertVon ? ` von ${esc(v.geaendertVon)}` : ''}</p>` : ''}
    </section>
    <section class="card hv-objekte">
      <div class="card-head"><h2>Objekte${objekte.length ? ` (${objekte.length})` : ''}</h2>${lesend ? '' : `<button type="button" class="btn btn-sm btn-primary" data-hv-objekt="" data-hv-v="${esc(v.id)}">+ Objekt</button>`}</div>
      ${objekte.length ? objekte.map(o => objektKarte(v, o, tag)).join('') : '<p class="small muted">Noch kein Objekt. Ein Objekt ist ein Haus oder eine Wohnanlage, die die Verwaltung betreut – mit Adresse und Zahl der Wohnungen.</p>'}
    </section>`;
}

export function viewHausverwaltungen() {
  ensureHausverwaltungen();
  const d = hausverwaltungen.daten;
  if (!d && hausverwaltungen.laedt) return kopf(false) + '<div class="empty">Lade Hausverwaltungen …</div>';
  if (d?.fehler) return kopf(false) + stoerungState(d, 'Die Hausverwaltungen');
  if (!d || !d.verfuegbar) return kopf(false) + emptyState('Die Hausverwaltungen sind nicht erreichbar.', d?.hinweis || '');
  const tag = heute();
  const id = state.route.params.get('hv');
  if (id) {
    const v = finde(id);
    if (!v) return kopf(false) + `<div class="notice">Diese Hausverwaltung gibt es nicht mehr. <a href="#/hausverwaltungen">Zur Liste</a></div>`;
    return kopf(false) + detail(v, tag);
  }
  return kopf(true) + liste(d, tag);
}

/* ---- Dialoge --------------------------------------------------------------- */

const feld = (id, label, inhalt, hinweis = '') => `<div class="field"><label for="${id}">${label}</label>${inhalt}${hinweis ? `<span class="hint">${hinweis}</span>` : ''}</div>`;
const eingabe = (id, name, wert, attr = '') => `<input id="${id}" name="${name}" value="${esc(wert ?? '')}" ${attr}>`;
const auswahl = (id, name, werte, labels, aktuell) => `<select id="${id}" name="${name}">${werte.map(w => `<option value="${esc(w)}"${w === aktuell ? ' selected' : ''}>${esc(labels[w] || w)}</option>`).join('')}</select>`;

/**
 * Ein Dialog fuer alle drei Ebenen. `ziel` = { ebene, verwaltungId, objektId, id } - ohne id
 * wird angelegt. "Entfernen" steht nur beim Bearbeiten und fragt vorher nach.
 */
function dialog(titel, inhalt, ziel) {
  const entfernen = ziel.id ? `<button type="button" class="btn btn-ghost hv-entfernen" data-hv-entfernen>Entfernen</button>` : '';
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog hv-dialog" role="dialog" aria-modal="true" aria-labelledby="hvTitel" data-dialog novalidate>
    <h2 id="hvTitel">${esc(titel)}</h2>
    ${inhalt}
    <p class="small hv-fehler" role="alert" hidden></p>
    <div class="actions">${entfernen}<button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Speichern</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('input, select, textarea')?.focus();
  const fehler = text => { const p = form.querySelector('.hv-fehler'); p.textContent = text; p.hidden = !text; };
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const knopf = form.querySelector('[type=submit]');
    knopf.disabled = true;
    const ok = await speichere({ ...ziel, daten: Object.fromEntries(new FormData(form)) }, fehler);
    if (ok) $('#dialogRoot').innerHTML = '';
    else knopf.disabled = false;
  });
  form.querySelector('[data-hv-entfernen]')?.addEventListener('click', async () => {
    if (!window.confirm(`${titel.replace(/ bearbeiten$/, '')} wirklich entfernen? Das lässt sich hier nicht rückgängig machen.`)) return;
    if (await speichere({ ...ziel, entfernen: true }, fehler)) $('#dialogRoot').innerHTML = '';
  });
}

function verwaltungDialog(v) {
  const x = v || {};
  dialog(v ? `${v.name} bearbeiten` : 'Neue Hausverwaltung', [
    feld('hvName', 'Name der Verwaltung', eingabe('hvName', 'name', x.name, 'required maxlength="120" autocomplete="organization"')),
    feld('hvAp', 'Ansprechpartner', eingabe('hvAp', 'ansprechpartner', x.ansprechpartner, 'maxlength="120" placeholder="z. B. Frau Muster, Technik"')),
    `<div class="hv-zwei">${feld('hvTel', 'Telefon', eingabe('hvTel', 'telefon', x.telefon, 'type="tel" maxlength="40" inputmode="tel"'))}${feld('hvMail', 'E-Mail', eingabe('hvMail', 'email', x.email, 'type="email" maxlength="120" inputmode="email"'))}</div>`,
    `<div class="hv-zwei">${feld('hvStatus', 'Stand', auswahl('hvStatus', 'status', HV_STATUS, HV_LABEL, x.status || 'neu'))}${feld('hvWv', 'Wieder melden am', eingabe('hvWv', 'wiedervorlage', x.wiedervorlage, 'type="date"'), 'Leer lassen bei „angeschrieben“: dann in 14 Tagen.')}</div>`,
    feld('hvNotiz', 'Notiz', `<textarea id="hvNotiz" name="notiz" maxlength="2000" rows="3">${esc(x.notiz || '')}</textarea>`),
  ].join(''), { ebene: 'verwaltung', id: v?.id || '' });
}

function objektDialog(v, o) {
  const x = o || {};
  dialog(o ? 'Objekt bearbeiten' : `Neues Objekt · ${v.name}`, [
    feld('hvAdr', 'Adresse', eingabe('hvAdr', 'adresse', x.adresse, 'required maxlength="200" placeholder="Straße Hausnummer, PLZ Ort" autocomplete="off"')),
    feld('hvWhg', 'Anzahl Wohnungen', eingabe('hvWhg', 'wohnungen', x.wohnungen ?? '', 'inputmode="numeric" maxlength="6" placeholder="z. B. 24"')),
    feld('hvVorOrt', 'Ansprechpartner vor Ort', eingabe('hvVorOrt', 'vorOrt', x.vorOrt, 'maxlength="200" placeholder="z. B. Hausmeister Herr Beispiel, 0170 0000000"')),
    feld('hvONotiz', 'Notiz', `<textarea id="hvONotiz" name="notiz" maxlength="1000" rows="3">${esc(x.notiz || '')}</textarea>`),
  ].join(''), { ebene: 'objekt', verwaltungId: v.id, id: o?.id || '' });
}

function angebotDialog(v, o, a) {
  const x = a || { art: 'angebot', stand: 'offen', datum: heute() };
  dialog(a ? 'Angebot bearbeiten' : `Angebot oder Auftrag · ${o.adresse}`, [
    `<div class="hv-zwei">${feld('hvArt', 'Art', auswahl('hvArt', 'art', ANGEBOT_ART, ANGEBOT_ART_LABEL, x.art))}${feld('hvStand', 'Stand', auswahl('hvStand', 'stand', ANGEBOT_STAND, ANGEBOT_STAND_LABEL, x.stand))}</div>`,
    `<div class="hv-zwei">${feld('hvLex', 'Lexware-Nummer', eingabe('hvLex', 'lexware', x.lexware, 'maxlength="40" placeholder="z. B. AG-0123" autocomplete="off"'))}${feld('hvApp', 'Auftrag in der Auftrags-App', eingabe('hvApp', 'auftragsApp', x.auftragsApp, 'maxlength="60" autocomplete="off"'))}</div>`,
    feld('hvDatum', 'Datum', eingabe('hvDatum', 'datum', x.datum, 'type="date"')),
    feld('hvANotiz', 'Notiz', `<textarea id="hvANotiz" name="notiz" maxlength="1000" rows="3" placeholder="z. B. 3 Wohnungen Vinyl, Leerstand ab 1.12.">${esc(x.notiz || '')}</textarea>`),
    '<p class="small muted">Nur zum Wiederfinden – mit Lexware und der Auftrags-App wird nichts verbunden.</p>',
  ].join(''), { ebene: 'angebot', verwaltungId: v.id, objektId: o.id, id: a?.id || '' });
}

async function speichere(eingabe, fehler = () => {}) {
  try {
    const r = await orgSchreiben('/api/hausverwaltungen/speichern', eingabe);
    const liste = hausverwaltungen.daten?.verwaltungen;
    if (liste) {
      const i = liste.findIndex(v => v.id === (r.verwaltung?.id || eingabe.id));
      if (r.ebene === 'verwaltung' && r.entfernt) { if (i >= 0) liste.splice(i, 1); }
      else if (r.verwaltung) { if (i >= 0) liste[i] = r.verwaltung; else liste.push(r.verwaltung); }
    }
    const was = { verwaltung: 'Hausverwaltung', objekt: 'Objekt', angebot: 'Angebot' }[r.ebene] || 'Eintrag';
    toast(r.entfernt ? `${was} entfernt` : `${was} gespeichert`, 'ok');
    // Neue Verwaltung: gleich ihre Seite oeffnen, damit das erste Objekt dazukommen kann.
    if (r.ebene === 'verwaltung' && !eingabe.id && r.id) location.hash = `#/hausverwaltungen?hv=${encodeURIComponent(r.id)}`;
    else if (r.ebene === 'verwaltung' && r.entfernt) location.hash = '#/hausverwaltungen';
    else render();
    return true;
  } catch (e) {
    fehler(`Nicht gespeichert: ${e.message}`);
    return false;
  }
}

/** Klicks: Neu, Bearbeiten, Objekt und Angebot anlegen oder bearbeiten. */
export function hausverwaltungenKlick(ev) {
  if (ev.target.closest('[data-hv-neu]')) { verwaltungDialog(null); return true; }
  const b = ev.target.closest('[data-hv-bearbeiten]');
  if (b) { const v = finde(b.dataset.hvBearbeiten); if (v) verwaltungDialog(v); return true; }
  const o = ev.target.closest('[data-hv-objekt]');
  if (o) {
    const v = finde(o.dataset.hvV);
    if (v) objektDialog(v, (v.objekte || []).find(x => x.id === o.dataset.hvObjekt) || null);
    return true;
  }
  const a = ev.target.closest('[data-hv-angebot]');
  if (a) {
    const v = finde(a.dataset.hvV);
    const obj = v && (v.objekte || []).find(x => x.id === a.dataset.hvO);
    if (obj) angebotDialog(v, obj, (obj.angebote || []).find(x => x.id === a.dataset.hvAngebot) || null);
    return true;
  }
  return false;
}
