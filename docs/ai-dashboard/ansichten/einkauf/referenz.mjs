/**
 * Einkauf "Je Auftrag", Schritt 5 "Erledigt": optionaler kleiner Link "Als Referenz merken".
 * Eine Notiz je Auftrag landet privat in akquise/referenzen.json (/api/akquise/referenz) und
 * erscheint in der Akquise zugeklappt unter "Referenzen (N)". Fotos laufen weiter ueber den
 * Bereich "Fotos" - hier bewusst nur die Notiz, damit der Schritt ein Klick bleibt.
 */
import { $, esc, toast } from '../../kern/helfer.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { orgSchreiben } from '../../kern/api.mjs';
import { akquise } from '../akquise.mjs';

const gemerkt = new Set();

export function referenzKnopf(a) {
  if (istNurLesend()) return '';
  const schon = gemerkt.has(String(a.id)) || (akquise.daten?.referenzen || []).some(r => String(r.orderId) === String(a.id));
  return schon ? ' · <span class="muted">als Referenz gemerkt</span>'
    : ` · <button type="button" class="btn-link" data-ref-merken="${esc(a.id)}" data-ref-name="${esc(a.name || '')}">Als Referenz merken</button>`;
}

function dialog(orderId, name) {
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="refTitel" data-dialog>
    <h2 id="refTitel">Als Referenz merken · ${esc(name)}</h2>
    <div class="field"><label for="refNotiz">Was wurde gemacht?</label>
      <textarea id="refNotiz" rows="3" maxlength="1000" placeholder="z. B. 3 Zimmer Vinyl, Altbelag raus, Wohnung frisch saniert"></textarea></div>
    <p class="small muted">Steht danach unter „Neue Aufträge“ bei „Referenzen“. Fotos bitte über „Fotos“ hochladen.</p>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button>
      <button type="button" class="btn btn-primary" data-ref-speichern="${esc(orderId)}" data-ref-name="${esc(name)}">Merken</button></div>
  </div></div>`;
  $('#refNotiz')?.focus();
}

/** true = Ereignis erledigt. */
export function referenzKlick(ev) {
  const m = ev.target.closest('[data-ref-merken]');
  if (m) { dialog(m.dataset.refMerken, m.dataset.refName); return true; }
  const s = ev.target.closest('[data-ref-speichern]');
  if (!s) return false;
  const orderId = s.dataset.refSpeichern;
  const notiz = ($('#refNotiz')?.value || '').trim();
  if (!notiz) { toast('Bitte kurz notieren, was gemacht wurde.', 'crit'); return true; }
  s.disabled = true;
  orgSchreiben('/api/akquise/referenz', { orderId, auftrag: s.dataset.refName, notiz }).then(r => {
    gemerkt.add(String(orderId));
    if (akquise.daten?.referenzen && r?.referenz) akquise.daten.referenzen = [r.referenz, ...akquise.daten.referenzen.filter(x => x.orderId !== orderId)];
    $('#dialogRoot').innerHTML = '';
    toast('Als Referenz gemerkt');
    document.querySelectorAll(`[data-ref-merken="${CSS.escape(orderId)}"]`).forEach(b => { b.outerHTML = '<span class="muted">als Referenz gemerkt</span>'; });
  }, err => { toast(`Nicht gespeichert: ${err.message}`, 'crit'); s.disabled = false; });
  return true;
}
