/**
 * Dialog fuer Aktionen an einer Entwicklungsaufgabe: Statuswechsel, Kommentar, Freigabe.
 * Die Regeln (erlaubte Uebergaenge, Pflichtangaben) kommen aus lib/model.mjs; der Server
 * prueft sie erneut.
 */
import { STATUS_BY_KEY, TRANSITIONS, requirementsFor } from '../lib/model.mjs';
import { state } from '../kern/zustand.mjs';
import { $, esc, issueUrl, toast } from '../kern/helfer.mjs';
import { istNurLesend } from '../kern/sitzung.mjs';
import { refresh } from '../kern/daten.mjs';

const DECISION_TEXT = {
  approve: { title: 'Freigabe erteilen', target: 'bereit', hint: 'Die Aufgabe geht auf „Bereit" zurück; Begründung wird als Kommentar protokolliert.', field: 'Begründung / gewählte Option' },
  reject: { title: 'Ablehnen', target: 'abgebrochen', hint: 'Die Aufgabe wird mit Begründung geschlossen.', field: 'Begründung' },
  question: { title: 'Rückfrage stellen', target: null, hint: 'Die Rückfrage wird als Kommentar hinterlegt; Status bleibt „Warten auf Freigabe".', field: 'Rückfrage' },
  delegate: { title: 'Delegieren', target: null, hint: 'Owner wird geändert; die Entscheidung bleibt offen.', field: 'Begründung', owner: true },
  later: { title: 'Später entscheiden', target: null, hint: 'Ein Hinweis mit neuem Termin wird als Kommentar hinterlegt.', field: 'Bis wann? Warum?' },
};

export function openActionDialog(t, act, extra = {}) {
  const local = state.capabilities.actions === true;
  const url = t.url || issueUrl(t.number);
  if (!local) {
    // statisch: kein Dialog, direkt zum Issue - mit erklaerendem Hinweis
    window.open(url, '_blank', 'noopener');
    toast('Read-only: Aktion auf GitHub ausführen (Label/Assignee/Kommentar).');
    return;
  }
  let target = null; let title = ''; let hint = ''; let needOwner = false; let needText = null; let needConfirm = false; let commentOnly = false;
  if (act in DECISION_TEXT) { const d = DECISION_TEXT[act]; target = d.target; title = d.title; hint = d.hint; needText = d.field; needOwner = Boolean(d.owner); commentOnly = !d.target; }
  else if (act === 'assign') { title = 'Owner zuordnen'; hint = 'Der Owner ist fachlich verantwortlich (GitHub-Assignee).'; needOwner = true; commentOnly = true; }
  else if (act === 'comment') { title = 'Kommentar'; hint = 'Wird als Kommentar im Issue gespeichert.'; needText = 'Kommentar'; commentOnly = true; }
  else if (act === 'unblock') { target = t.owner ? 'in-arbeit' : 'bereit'; title = 'Blocker lösen'; hint = 'Wie wurde der Blocker gelöst? Der Text wird protokolliert.'; needText = 'Lösung / Ergebnis'; }
  else if (act === 'reopen') { target = 'geplant'; title = 'Wieder öffnen'; needText = 'Warum?'; }
  else if (act === 'move') { title = 'Status ändern'; target = extra.target || (TRANSITIONS[t.status] || [])[0]; }
  else { target = act; title = `Status → ${STATUS_BY_KEY[act]?.label || act}`; }
  if (target) {
    const req = requirementsFor(t, target, {});
    if (req.some(r => /Owner/.test(r))) needOwner = true;
    if (req.some(r => /Kommentar|Grund|Begründung|Freigabefrage/.test(r))) needText = needText || (target === 'blockiert' ? 'Blocker-Grund (wer/was, benötigte Aktion)' : target === 'freigabe' ? 'Freigabefrage (was soll entschieden werden?)' : target === 'review' ? 'Ergebnis / Checkliste' : 'Begründung');
    if (req.some(r => /Akzeptanzkriterien/.test(r))) needConfirm = true;
  }
  const targets = (TRANSITIONS[t.status] || []).filter(k => STATUS_BY_KEY[k]);
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlgTitle" data-dialog>
    <h2 id="dlgTitle">${esc(title)} · ${esc(t.id)}</h2>
    <p class="small muted">${esc(t.title)}${hint ? `<br>${esc(hint)}` : ''}</p>
    ${act === 'move' ? `<div class="field"><label for="dlgTarget">Zielstatus</label><select id="dlgTarget" name="target">${targets.map(k => `<option value="${k}" ${k === target ? 'selected' : ''}>${esc(STATUS_BY_KEY[k].label)}</option>`).join('')}</select><span class="hint">Nur vorgesehene Übergänge aus „${esc(t.statusLabel)}".</span></div>` : target ? `<input type="hidden" name="target" value="${esc(target)}">` : ''}
    ${needOwner ? `<div class="field"><label for="dlgOwner">Owner (GitHub-Login)</label><input id="dlgOwner" name="owner" value="${esc(t.owner || state.me || '')}" required placeholder="z. B. ahmet"><span class="hint">Pflicht für Bereit / In Arbeit. Ein KI-Agent ersetzt keinen verantwortlichen Menschen.</span></div>` : ''}
    ${needText ? `<div class="field"><label for="dlgText">${esc(needText)}</label><textarea id="dlgText" name="text" required></textarea></div>` : (act === 'move' ? '<div class="field"><label for="dlgText">Kommentar (je nach Zielstatus Pflicht)</label><textarea id="dlgText" name="text"></textarea></div>' : '')}
    ${needConfirm ? `<div class="field"><label><input type="checkbox" name="confirmAcceptance"> Akzeptanzkriterien sind erfüllt bzw. Erledigung wird ausdrücklich bestätigt</label></div>` : (act === 'move' ? '<div class="field"><label><input type="checkbox" name="confirmAcceptance"> Bei „Erledigt": Akzeptanzkriterien erfüllt / bestätigt</label></div>' : '')}
    <ul class="missing" id="dlgMissing" hidden></ul>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">${esc(commentOnly ? 'Speichern' : 'Übernehmen')}</button></div>
    <input type="hidden" name="act" value="${esc(act)}">
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('input:not([type=hidden]), select, textarea')?.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (istNurLesend()) { toast('Rolle "lesen" darf keine Aenderungen vornehmen.', 'crit'); return; }
    const fd = new FormData(form);
    const payload = { target: fd.get('target') || null, owner: (fd.get('owner') || '').trim() || null, comment: (fd.get('text') || '').trim() || null, reason: (fd.get('text') || '').trim() || null, confirmAcceptance: fd.get('confirmAcceptance') === 'on', act };
    if (payload.target) {
      const missing = requirementsFor(t, payload.target, payload);
      if (missing.length) { const ul = $('#dlgMissing'); ul.hidden = false; ul.innerHTML = missing.map(m => `<li>${esc(m)}</li>`).join(''); return; }
    }
    form.querySelector('[type=submit]').disabled = true;
    try {
      let r;
      if (payload.target) r = await fetch(`/api/tasks/${t.number}/transition`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, decision: act in DECISION_TEXT ? act : undefined }) });
      else if (act === 'assign' || act === 'delegate') r = await fetch(`/api/tasks/${t.number}/assign`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: payload.owner, comment: payload.comment, decision: act === 'delegate' ? 'delegate' : undefined }) });
      else r = await fetch(`/api/tasks/${t.number}/comment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: payload.comment, decision: act in DECISION_TEXT ? act : undefined }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { const ul = $('#dlgMissing'); ul.hidden = false; ul.innerHTML = (j.missing || [j.error || `Fehler ${r.status}`]).map(m => `<li>${esc(m)}</li>`).join(''); form.querySelector('[type=submit]').disabled = false; return; }
      $('#dialogRoot').innerHTML = '';
      toast(j.note ? `Gespeichert · ${j.note}` : 'Gespeichert – auf GitHub protokolliert');
      state.detailCache.delete(t.number);
      await refresh({ silent: true });
    } catch (e) { toast(`Fehler: ${e.message}`, 'crit'); form.querySelector('[type=submit]').disabled = false; }
  });
}
