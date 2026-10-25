/**
 * Kunden, Reiter "Service-Anfragen" (#/kunden?tab=service): Anfragen fuer
 * Verlegeservice, Treppe und Aufmass mit Quelle und Status, oben die
 * Auswertung je Woche und je Quelle (Werkbank w-030).
 *
 * Formular-Mails der Serviceseiten uebernimmt der geplante Lauf
 * "serviceanfragen-postfach" (operations/scripts/serviceanfragen.mjs); alles
 * andere wird von Hand erfasst, eine Formular-Mail laesst sich auch einfuegen. Ablage: $TP_PRIVAT_DIR/serviceanfragen.json ueber
 * /api/kunden/serviceanfragen (operations/lib/serviceanfragen.mjs).
 */
import { state } from '../../kern/zustand.mjs';
import { $, esc, fmtDate, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { kunden, telLink } from './gemeinsam.mjs';
import {
  LEISTUNG, LEISTUNG_LABEL, QUELLE, QUELLE_LABEL, STATUS, STATUS_LABEL, ABGESCHLOSSEN, GRENZEN,
  ausFormularMail, auswertung, serviceOffen,
} from '../../lib/serviceanfragen.mjs';

const WOCHEN = 8;

// Neue Anfragen kommen stuendlich aus dem Postfach - "Heute" zeigt sie als To-do und laedt
// deshalb nach ein paar Minuten still nach; der alte Stand bleibt so lange stehen.
const SERVICE_HALTBAR_MS = 5 * 60_000;

export function ensureServiceanfragen() {
  if (kunden.loadingServiceanfragen) return;
  if (kunden.serviceanfragen && Date.now() - (kunden.serviceanfragenAm || 0) < SERVICE_HALTBAR_MS) return;
  kunden.loadingServiceanfragen = true;
  fetchEinkauf('/api/kunden/serviceanfragen').then(d => {
    const vorher = JSON.stringify(kunden.serviceanfragen);
    kunden.serviceanfragen = d; kunden.serviceanfragenAm = Date.now(); kunden.loadingServiceanfragen = false;
    if (['kunden', 'heute'].includes(state.route.view) && JSON.stringify(d) !== vorher) render();
  });
}

/** Zahl fuer den Reiter entspricht dessen offener Arbeitsliste. */
export function serviceOffenAnzahl() {
  return (kunden.serviceanfragen?.eintraege || []).filter(serviceOffen).length;
}

/** Kalendertag in lokaler Zeit - ein Anruf um 0:30 gehoert zum heutigen Tag. */
function heuteTag() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function auswertungHtml(eintraege) {
  const a = auswertung(eintraege, { heute: heuteTag(), wochen: WOCHEN });
  if (!a.gesamt) {
    return `<div class="card sa-auswertung"><p class="small muted" style="margin:0">Letzte ${WOCHEN} Wochen: noch keine Anfrage erfasst. Sobald Anfragen eingetragen sind, steht hier, wie viele je Woche kommen und über welchen Weg.</p></div>`;
  }
  const max = Math.max(...a.wochen.map(w => w.anzahl), 1);
  const wochen = a.wochen.map(w => `<div class="sa-woche" title="Woche ab ${esc(fmtDate(w.start))}: ${w.anzahl}">
      <span class="sa-zahl${w.anzahl ? '' : ' muted'}">${w.anzahl || '·'}</span>
      <span class="sa-saeule"><span style="height:${Math.round(w.anzahl / max * 100)}%"></span></span>
      <span class="sa-kw">KW ${w.kw}</span>
    </div>`).join('');
  const quellen = a.quellen.map(q => `<tr>
      <td>${esc(q.label)}</td><td class="num">${q.anzahl}</td>
      <td class="num${q.gewonnen ? '' : ' muted'}">${q.gewonnen}</td><td class="num${q.verloren ? '' : ' muted'}">${q.verloren}</td>
    </tr>`).join('');
  return `<div class="card sa-auswertung">
    <div class="card-head"><h2>Letzte ${WOCHEN} Wochen</h2><span class="small muted">${a.gesamt} ${a.gesamt === 1 ? 'Anfrage' : 'Anfragen'}, ${a.gewonnen} gewonnen</span></div>
    <div class="sa-grid">
      <div><h3 class="sa-h">Je Woche</h3><div class="sa-wochen">${wochen}</div></div>
      <div><h3 class="sa-h">Je Quelle</h3>
        <table class="sa-quellen"><thead><tr><th>Quelle</th><th class="num">Anfragen</th><th class="num">gewonnen</th><th class="num">verloren</th></tr></thead><tbody>${quellen}</tbody></table>
      </div>
    </div>
  </div>`;
}

function statusBadge(status) {
  const klasse = status === 'neu' ? 'gap' : status === 'gewonnen' ? 'ok' : 'plain';
  return `<span class="badge ${klasse}">${esc(STATUS_LABEL[status] || status)}</span>`;
}

function zeileHtml(e) {
  const ladenStatus = { neu: 'Neu', angebot: 'Angebot', nachfassen: 'Nachfassen', gewonnen: 'Gewonnen', verloren: 'Verloren' };
  const laden = e.laden?.anzahl === 1
    ? `<p class="small muted">Laden: ${esc(ladenStatus[e.laden.status] || e.laden.status)} · <a href="${esc(e.laden.url)}" target="_blank" rel="noopener">Zugehörigen Vorgang öffnen</a></p>`
    : e.laden?.anzahl === 2 ? '<p class="small muted">Mehrere Laden-Vorgänge zur selben Anfrage – Zuordnung prüfen.</p>' : '';
  const kontakt = [
    e.telefon ? `<span class="tel-gross">${telLink(e.telefon)}</span>` : '',
    e.email ? `<a href="mailto:${esc(e.email)}" class="sa-mail">${esc(e.email)}</a>` : '',
  ].filter(Boolean).join(' ');
  const notiz = e.notiz && e.notiz.length > 160 ? `${e.notiz.slice(0, 160)} …` : e.notiz;
  return `<div class="row sa-row" data-sa-bearbeiten="${esc(e.id)}">
    <div class="sa-inhalt">
      <div class="t">${esc(e.name || 'ohne Namen')}${e.plz ? ` <span class="muted small">${esc(e.plz)}</span>` : ''}</div>
      <div class="m"><span class="badge plain">${esc(LEISTUNG_LABEL[e.leistung] || e.leistung)}</span><span>${esc(QUELLE_LABEL[e.quelle] || e.quelle)}${e.herkunft ? ` · ${esc(e.herkunft)}` : ''}</span><span>${esc(fmtDate(e.datum))}</span>${e.mailId ? '<span>aus dem Postfach übernommen</span>' : ''}</div>
      ${kontakt ? `<div class="sa-kontakt">${kontakt}</div>` : ''}
      ${laden}
      ${e.naechsterSchritt ? `<div class="next">${esc(e.naechsterSchritt)}</div>` : ''}
      ${notiz ? `<div class="small muted sa-notiz">${esc(notiz)}</div>` : ''}
    </div>
    <div class="r">${statusBadge(e.status)}${istNurLesend() ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-sa-bearbeiten="${esc(e.id)}">Bearbeiten</button>`}</div>
  </div>`;
}

/**
 * Naechster Stand mit einem Klick (Anfrage aus dem To-do auf "Heute" geoeffnet). Vorher ging jeder
 * Wechsel ueber "Bearbeiten" -> Auswahlfeld -> Speichern; vier von fuenf Anfragen standen am
 * 24.10. seit ihrer Uebernahme aus dem Postfach (16.10.) unveraendert auf "Neu".
 */
function statusKnoepfe(e) {
  if (istNurLesend() || !serviceOffen(e)) return '';
  const weiter = STATUS.slice(STATUS.indexOf(e.status) + 1);
  return `<div class="btn-row sa-status" role="group" aria-label="Neuer Stand von ${esc(e.id)}">${weiter.map((st, i) => `<button type="button" class="btn btn-sm${i === 0 ? ' btn-primary' : ''}" data-sa-status="${esc(st)}" data-sa-id="${esc(e.id)}">${esc(STATUS_LABEL[st])}</button>`).join('')}</div>`;
}

async function setzeStatus(knopf) {
  const { saId: id, saStatus: status } = knopf.dataset;
  knopf.closest('.sa-status')?.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try {
    const j = await orgSchreiben('/api/kunden/serviceanfragen', { id, status });
    const liste = kunden.serviceanfragen?.eintraege;
    const i = liste ? liste.findIndex(x => x.id === j.eintrag.id) : -1;
    // Den Laden-Abgleich behalten; der Server schickt ihn nur beim Lesen mit.
    if (i >= 0) liste[i] = { ...j.eintrag, laden: liste[i].laden }; else kunden.serviceanfragen = null;
    toast(`${j.eintrag.id}: ${STATUS_LABEL[j.eintrag.status] || j.eintrag.status}`);
    render();
  } catch (err) {
    toast(`Nicht gespeichert: ${err.message}`, 'crit');
    knopf.closest('.sa-status')?.querySelectorAll('button').forEach(b => { b.disabled = false; });
  }
}

const FILTER = {
  offen: { label: 'Offen', passt: serviceOffen },
  gewonnen: { label: 'Gewonnen', passt: e => e.status === 'gewonnen' },
  verloren: { label: 'Verloren', passt: e => e.status === 'verloren' },
  alle: { label: 'Alle', passt: () => true },
};

export function viewKundenServiceanfragen() {
  ensureServiceanfragen();
  const d = kunden.serviceanfragen;
  if (!d && kunden.loadingServiceanfragen) return `<div class="empty">Lade Service-Anfragen …</div>`;
  if (d?.fehler) return stoerungState(d, 'Die Service-Anfragen');
  const eintraege = d?.eintraege || [];
  const anfrage = state.route.params.get('anfrage');
  if (anfrage) {
    const e = eintraege.find(x => x.id === anfrage);
    const laden = state.capabilities.dashboards?.laden;
    return `<p><a href="#/kunden?tab=service">Alle offenen Service-Anfragen</a></p>
      ${e ? `<div class="rows">${zeileHtml(e)}</div>
        ${statusKnoepfe(e)}
        ${!ABGESCHLOSSEN.includes(e.status) ? `<p class="small muted">Wiedervorlagen werden in der bestehenden Laden-Ansicht gepflegt. ${laden ? `<a href="${esc(laden)}" target="_blank" rel="noopener">Laden-Ansicht öffnen</a>` : ''}</p>` : ''}`
        : emptyState('Diese Anfrage wurde nicht gefunden.', 'Zur offenen Liste wechseln und den aktuellen Stand prüfen.')}`;
  }
  const filterRaw = state.route.params.get('sf');
  const filter = FILTER[filterRaw] ? filterRaw : 'offen';
  // Offene: neue Anfragen zuerst, dann nach Bearbeitungsstand; darin wer am laengsten wartet (22.10.).
  // Andere Auswahlen bleiben neueste zuerst.
  const liste = eintraege.filter(FILTER[filter].passt);
  if (filter === 'offen') liste.sort((a, b) => STATUS.indexOf(a.status) - STATUS.indexOf(b.status) || String(a.datum).localeCompare(String(b.datum)) || String(a.id).localeCompare(String(b.id)));
  const chips = Object.entries(FILTER).map(([k, f]) => {
    const n = eintraege.filter(f.passt).length;
    return `<button type="button" class="chip" aria-pressed="${k === filter}" data-param="sf" data-value="${k === 'offen' ? '' : k}">${esc(f.label)}<span class="c">${n}</span></button>`;
  }).join('');
  const leer = filter === 'offen'
    ? emptyState('Keine offenen Anfragen.', eintraege.length ? 'Alles bearbeitet.' : 'Kommt eine Anfrage per Formular, Telefon oder WhatsApp herein: „+ Anfrage erfassen“.')
    : emptyState('Keine Anfragen in dieser Auswahl.', '');
  return `
    <p class="small muted" style="margin:0 0 10px">Anfragen für Verlegeservice, Treppen und Aufmaß. Formular-Anfragen der Serviceseiten kommen von selbst (stündlich aus dem Postfach); Anrufe, WhatsApp und Laden hier eintragen – dann zeigt die Auswertung, was Serviceseiten und Werbung bringen.</p>
    ${auswertungHtml(eintraege)}
    <div class="sa-leiste">
      <div class="chips" style="margin:0">${chips}</div>
      ${istNurLesend() ? '' : '<button type="button" class="btn btn-primary" data-sa-neu>+ Anfrage erfassen</button>'}
    </div>
    <div class="rows">${liste.length ? liste.map(zeileHtml).join('') : leer}</div>
  `;
}

// --- Dialog ----------------------------------------------------------------------

function auswahl(name, werte, labels, aktuell) {
  return `<select id="sa-${name}" name="${name}" required>${werte.map(w => `<option value="${esc(w)}"${w === aktuell ? ' selected' : ''}>${esc(labels[w])}</option>`).join('')}</select>`;
}

function feld(name, label, wert, { typ = 'text', extra = '' } = {}) {
  return `<div class="field"><label for="sa-${name}">${esc(label)}</label><input type="${typ}" id="sa-${name}" name="${name}" value="${esc(wert || '')}" maxlength="${GRENZEN[name] || 20}" ${extra}></div>`;
}

export function openServiceDialog(id = null) {
  const e = id ? (kunden.serviceanfragen?.eintraege || []).find(x => x.id === id) : null;
  if (id && !e) { toast('Diese Anfrage gibt es nicht mehr – Liste neu laden.', 'crit'); return; }
  const w = e || { datum: heuteTag(), leistung: 'verlegeservice', quelle: 'telefon', status: 'neu' };
  const verlauf = (e?.verlauf || []).slice(-6).reverse()
    .map(v => `<li>${esc(fmtDate(v.wann))} · ${esc(v.wer)}: ${esc(v.was)}</li>`).join('');
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog sa-dialog" role="dialog" aria-modal="true" aria-labelledby="saTitel" data-dialog>
    <h2 id="saTitel">${e ? `Service-Anfrage ${esc(e.id)}` : 'Service-Anfrage erfassen'}</h2>
    ${e ? '' : `<details class="sa-mailimport"><summary>Aus einer Formular-Mail übernehmen</summary>
      <div class="field"><label for="sa-mailtext">Text der Mail „Neue Kundennachricht“ hier einfügen</label>
        <textarea id="sa-mailtext" rows="4" placeholder="Betreff: …&#10;Name: …&#10;E-Mail: …"></textarea>
        <div><button type="button" class="btn btn-sm" data-sa-mail>Felder füllen</button> <span class="small muted" id="sa-mailhinweis" role="status"></span></div>
      </div></details>`}
    <div class="sa-felder">
      ${feld('datum', 'Datum der Anfrage', w.datum, { typ: 'date', extra: 'required' })}
      <div class="field"><label for="sa-status">Status</label>${auswahl('status', STATUS, STATUS_LABEL, w.status)}</div>
      <div class="field"><label for="sa-leistung">Leistung</label>${auswahl('leistung', LEISTUNG, LEISTUNG_LABEL, w.leistung)}</div>
      <div class="field"><label for="sa-quelle">Quelle</label>${auswahl('quelle', QUELLE, QUELLE_LABEL, w.quelle)}</div>
      ${feld('name', 'Name', w.name, { extra: 'autocomplete="off"' })}
      ${feld('telefon', 'Telefon', w.telefon, { typ: 'tel', extra: 'autocomplete="off"' })}
      ${feld('email', 'E-Mail', w.email, { typ: 'email', extra: 'autocomplete="off"' })}
      ${feld('plz', 'PLZ', w.plz, { extra: 'inputmode="numeric"' })}
    </div>
    ${feld('herkunft', 'Herkunft (Seite, Anzeige, Empfehlung)', w.herkunft, { extra: 'placeholder="z. B. Anfrage Treppenverlegung, Google-Anzeige"' })}
    ${feld('naechsterSchritt', 'Nächster Schritt', w.naechsterSchritt, { extra: 'placeholder="z. B. Aufmaß-Termin vereinbaren"' })}
    <div class="field"><label for="sa-notiz">Notiz</label><textarea id="sa-notiz" name="notiz" maxlength="${GRENZEN.notiz}">${esc(w.notiz || '')}</textarea></div>
    ${verlauf ? `<div class="small muted"><b>Verlauf</b><ul class="sa-verlauf">${verlauf}</ul></div>` : ''}
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">${e ? 'Speichern' : 'Anfrage anlegen'}</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  (form.querySelector(e ? '#sa-status' : '#sa-name'))?.focus();
  form.querySelector('[data-sa-mail]')?.addEventListener('click', () => {
    const r = ausFormularMail(form.querySelector('#sa-mailtext').value);
    const hinweis = form.querySelector('#sa-mailhinweis');
    if (!r.erkannt) { hinweis.textContent = r.grund; return; }
    for (const [k, v] of Object.entries(r.felder)) {
      const el = form.elements[k];
      if (el && v) el.value = v;
    }
    hinweis.textContent = 'Felder gefüllt – bitte kurz prüfen.';
    form.querySelector('.sa-mailimport').open = false;
  });
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const knopf = form.querySelector('[type=submit]');
    knopf.disabled = true;
    const daten = Object.fromEntries(['datum', 'status', 'leistung', 'quelle', 'name', 'telefon', 'email', 'plz', 'herkunft', 'naechsterSchritt', 'notiz']
      .map(k => [k, (form.elements[k]?.value || '').trim()]));
    try {
      const j = await orgSchreiben('/api/kunden/serviceanfragen', e ? { id: e.id, ...daten } : daten);
      const liste = kunden.serviceanfragen?.eintraege;
      if (liste) {
        const i = liste.findIndex(x => x.id === j.eintrag.id);
        if (i >= 0) liste[i] = j.eintrag; else liste.unshift(j.eintrag);
        liste.sort((a, b) => b.datum.localeCompare(a.datum) || b.id.localeCompare(a.id));
      } else {
        kunden.serviceanfragen = null; // beim naechsten Zeichnen neu laden
      }
      $('#dialogRoot').innerHTML = '';
      toast(e ? `${j.eintrag.id} gespeichert` : `${j.eintrag.id} angelegt`);
      render();
    } catch (err) {
      toast(`Nicht gespeichert: ${err.message}`, 'crit');
      knopf.disabled = false;
    }
  });
}

/** Klicks im Reiter: neue Anfrage, Statusknopf, Bearbeiten (Knopf oder Zeile). Telefon- und Mail-Links bleiben Links. */
export function serviceKlick(e) {
  if (e.target.closest('[data-sa-neu]')) { e.preventDefault(); openServiceDialog(); return true; }
  const st = e.target.closest('[data-sa-status]');
  if (st) { e.preventDefault(); if (!istNurLesend() && !st.disabled) void setzeStatus(st); return true; }
  const zeile = e.target.closest('[data-sa-bearbeiten]');
  if (!zeile || e.target.closest('a')) return false;
  if (istNurLesend()) return true;
  e.preventDefault();
  openServiceDialog(zeile.dataset.saBearbeiten);
  return true;
}
