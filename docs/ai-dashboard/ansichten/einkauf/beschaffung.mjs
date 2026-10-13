/** Manuelle Einkaufsangaben und sichtbare Arbeitsuebernahme im vorhandenen Dialoggeruest. */
import { state } from '../../kern/zustand.mjs';
import { $, esc, toast } from '../../kern/helfer.mjs';
import { render } from '../../kern/render.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { personId, uebernahmeText, einheitText } from '../../lib/beschaffung.mjs';
import { alleAuftraege, afEintragFuer, ladeStandNeu, einkauf } from './auftragsfluss.mjs';

export function uebernahmeBlock(positionen) {
  if (!einkauf.auftragsstatus?.verfuegbar) return '<p class="small muted">Übernahmestand noch nicht verfügbar.</p>';
  const ps = (positionen || []).filter(p => p.orderId && p.lineItemId);
  const mit = ps.map(afEintragFuer).filter(e => e?.uebernahme);
  const namen = [...new Set(mit.map(uebernahmeText))];
  const fremd = mit.some(e => e.uebernahme.id !== personId(state.session?.benutzer, state.capabilities.user));
  const inhaber = !state.session?.benutzer || state.session.benutzer.rolle === 'inhaber';
  const data = `data-einkauf-positionen="${esc(JSON.stringify(ps.map(p => ({ orderId: p.orderId, lineItemId: p.lineItemId }))))}"`;
  const knopf = (a, t) => `<button type="button" class="btn btn-sm btn-ghost" data-einkauf-uebernahme="${a}" ${data}>${t}</button>`;
  return `<div class="small" style="margin:6px 0;overflow-wrap:anywhere">${esc(namen.join(' · ') || 'Noch nicht übernommen')}${istNurLesend() || !ps.length ? '' : `<div class="btn-row">${fremd ? (inhaber ? knopf('uebernehmen', 'Als Inhaber übernehmen') : '<span class="muted">Eine fremde Übernahme kann der Inhaber ändern.</span>') : mit.length ? knopf('freigeben', 'Meine Übernahme freigeben') : knopf('nehmen', 'Ich übernehme')}</div>`}</div>`;
}
async function schreiben(payload) {
  const r = await fetch('/api/einkauf/auftragsstatus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Aktion nicht möglich (${r.status})`);
  await ladeStandNeu({ bestellungen: true });
  return j;
}
function openBeschaffung(orderId, lineItemId, eingang) {
  const p = alleAuftraege().flatMap(a => a.positionen || []).find(x => x.orderId === orderId && x.lineItemId === lineItemId);
  if (!p) { toast('Die Position ist nicht in den aktuellen Daten. Bitte aktualisieren.', 'crit'); return; }
  const b = afEintragFuer(p)?.beschaffung || {}, w = b.wareneingang;
  const soll = w?.soll ?? p.bestellmenge?.menge, rohEinheit = w?.einheit || p.bestellmenge?.einheit;
  const einheit = einheitText(rohEinheit);
  const belegt = Number.isFinite(Number(soll)) && Number(soll) > 0 && ['paket', 'stueck', 'muster', 'lfm', 'm2'].includes(rohEinheit);
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="bTitel" data-dialog>
    <h2 id="bTitel">Liefertermin / Wareneingang · ${esc(p.orderName)}</h2><p class="small">${esc(p.titel)} · ${esc(p.farbe || '')}</p>
    <div class="field"><label for="bTermin">Bestätigter Liefertermin (optional)</label><input id="bTermin" name="liefertermin" type="date" value="${esc(b.liefertermin || '')}"></div>
    ${belegt ? `<p class="small">Bestellt: <b>${esc(Number(soll).toLocaleString('de-DE'))} ${esc(einheit)}</b>. Mengen sind der bisherige Gesamtstand, keine zusätzliche Lieferung.</p>${[['angekommen', 'Bisher angekommen'], ['verwendbar', 'Davon verwendbar']].map(([n, t]) => `<div class="field"><label for="b-${n}">${t} (${esc(einheit)})</label><input id="b-${n}" name="${n}" type="number" min="0" max="${esc(soll)}" step="any" ${eingang ? 'required' : ''} value="${esc(w?.[n] ?? '')}"></div>`).join('')}` : '<p class="notice warn">Bestellmenge nicht belegt. Nur der Termin kann gespeichert werden.</p>'}
    <div class="field"><label for="bGrund">Hinweis / Grund für nicht verwendbare Menge</label><textarea id="bGrund" name="grund" rows="2" maxlength="1000">${esc(b.grund || '')}</textarea></div>
    <p class="small muted">Sie bestätigen den tatsächlichen Stand. Eine Fehlmenge bleibt offen. Keine Shopify-Änderung oder Nachricht.</p><p data-b-fehler class="notice crit" role="alert" tabindex="-1" hidden></p>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Angaben bestätigen</button></div></form></div>`;
  const form = $('#dialogRoot form'); form.querySelector(eingang && belegt ? '#b-angekommen' : '#bTermin')?.focus();
  form.addEventListener('submit', async e => {
    e.preventDefault(); const fd = new FormData(form), btn = form.querySelector('[type=submit]'); btn.disabled = true;
    const felder = { liefertermin: fd.get('liefertermin') || null, grund: fd.get('grund') || null };
    if (belegt && (fd.get('angekommen') !== '' || fd.get('verwendbar') !== '')) Object.assign(felder, { angekommen: fd.get('angekommen'), verwendbar: fd.get('verwendbar') });
    try { await schreiben({ aktion: 'beschaffung', orderId, lineItemId, felder }); $('#dialogRoot').innerHTML = ''; toast('Liefertermin / Wareneingang bestätigt.'); }
    catch (err) { const h = form.querySelector('[data-b-fehler]'); h.textContent = err.message; h.hidden = false; h.focus(); btn.disabled = false; }
  });
}
export function beschaffungKlick(e) {
  const zs = e.target.closest('[data-zl-schritt="geliefert"]');
  if (zs) {
    e.preventDefault(); if (istNurLesend()) return true;
    const ps = alleAuftraege().find(a => a.id === zs.dataset.zlOrder)?.positionen || [];
    if (ps.length === 1) openBeschaffung(ps[0].orderId, ps[0].lineItemId, true);
    else {
      $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="bAuswahl"><h2 id="bAuswahl">Wareneingang je Position bestätigen</h2><p>Die Bestellung ist erst vollständig geliefert, wenn jede benötigte Menge bestätigt ist.</p>${ps.map(p => `<p><button type="button" class="btn" data-beschaffung data-af-order="${esc(p.orderId)}" data-af-item="${esc(p.lineItemId)}">${esc(p.titel)} · ${esc(p.farbe || '')}</button></p>`).join('')}<button type="button" class="btn" data-close-dialog>Schließen</button></div></div>`;
      if (!ps.length) toast('Die Bestellpositionen sind noch nicht geladen. Bitte aktualisieren.', 'crit');
    }
    return true;
  }
  const b = e.target.closest('[data-beschaffung], [data-af-set][data-af-status="geliefert"]');
  if (b) { e.preventDefault(); if (!istNurLesend()) openBeschaffung(b.dataset.afOrder, b.dataset.afItem, b.dataset.afStatus === 'geliefert' || !!b.closest('[aria-labelledby="bAuswahl"]')); return true; }
  const u = e.target.closest('[data-einkauf-uebernahme]');
  if (!u) return false;
  e.preventDefault(); if (istNurLesend()) return true; u.disabled = true;
  Promise.resolve().then(() => JSON.parse(u.dataset.einkaufPositionen)).then(positionen => schreiben({ aktion: 'uebernahme', uebernahmeAktion: u.dataset.einkaufUebernahme, positionen }))
    .then(() => { toast(u.dataset.einkaufUebernahme === 'freigeben' ? 'Meine Übernahme freigegeben.' : 'Arbeit übernommen.'); render(); })
    .catch(err => { toast(err.message, 'crit'); u.disabled = false; });
  return true;
}
