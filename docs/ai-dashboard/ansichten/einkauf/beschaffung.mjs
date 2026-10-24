/** Manuelle Einkaufsangaben und sichtbare Arbeitsuebernahme im vorhandenen Dialoggeruest. */
import { state } from '../../kern/zustand.mjs';
import { $, esc, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { personId, uebernahmeText, einheitText, beschaffungsStand, beschaffungText, restmenge } from '../../lib/beschaffung.mjs';
import { alleAuftraege, afEintragFuer, ladeStandNeu, einkauf, setzeAuftragsstatus } from './auftragsfluss.mjs';

const istMusterPosition = (orderId, lineItemId) => Boolean(alleAuftraege().find(a => a.id === orderId)?.positionen?.find(p => p.lineItemId === lineItemId)?.istMuster);

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
  const bestellmenge = p.bestellSoll || p.bestellmenge;
  const stand = beschaffungsStand(afEintragFuer(p), bestellmenge);
  const b = stand?.beschaffung || {}, w = b.wareneingang;
  const rest = restmenge(stand);
  const soll = bestellmenge?.menge, rohEinheit = bestellmenge?.einheit;
  const einheit = einheitText(rohEinheit);
  const belegt = Number.isFinite(Number(soll)) && Number(soll) > 0 && ['paket', 'stueck', 'muster', 'lfm', 'm2'].includes(rohEinheit);
  const einheitGeaendert = w && w.einheit !== rohEinheit;
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="bTitel" data-dialog>
    <h2 id="bTitel">Liefertermin / Wareneingang · ${esc(p.orderName)}</h2><p class="small">${esc(p.titel)} · ${esc(p.farbe || '')}</p>
    <div class="field"><label for="bTermin">Bestätigter Liefertermin (optional)</label><input id="bTermin" name="liefertermin" type="date" value="${esc(b.liefertermin || '')}"></div>
    ${b.klaerung ? `<p class="notice warn">${esc(b.klaerung)}${w ? ` Erfasst: ${esc(w.angekommen)} angekommen / ${esc(w.verwendbar)} verwendbar (${esc(einheitText(w.einheit))}).` : ''}</p>` : ''}
    ${belegt && !einheitGeaendert ? `<p class="small">Bestellt: <b>${esc(Number(soll).toLocaleString('de-DE'))} ${esc(einheit)}</b>. Mengen sind der bisherige Gesamtstand, keine zusätzliche Lieferung.</p>${rest > 0 ? `<p class="notice warn">Noch offen: ${esc(Number(rest).toLocaleString('de-DE'))} ${esc(einheit)}. Ist der Rest jetzt da, bei „Bisher angekommen“ die neue Gesamtmenge eintragen – sonst bleibt die Position offen.</p>` : ''}${[['angekommen', 'Bisher angekommen'], ['verwendbar', 'Davon verwendbar']].map(([n, t]) => `<div class="field"><label for="b-${n}">${t} (${esc(einheit)})</label><input id="b-${n}" name="${n}" type="number" min="0" max="${esc(soll)}" step="any" ${eingang ? 'required' : ''} value="${esc(w?.[n] ?? '')}"></div>`).join('')}` : '<p class="notice warn">Wareneingang zuerst klären. Nur Termin und Hinweis können gespeichert werden.</p>'}
    <div class="field"><label for="bGrund">Hinweis / Grund für nicht verwendbare Menge</label><textarea id="bGrund" name="grund" rows="2" maxlength="1000">${esc(b.grund || '')}</textarea></div>
    <p class="small muted">Sie bestätigen den tatsächlichen Stand. Eine Fehlmenge bleibt offen. Keine Shopify-Änderung oder Nachricht.</p><p data-b-fehler class="notice crit" role="alert" tabindex="-1" hidden></p>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Angaben bestätigen</button></div></form></div>`;
  const form = $('#dialogRoot form'); form.querySelector(eingang && belegt && !einheitGeaendert ? '#b-angekommen' : '#bTermin')?.focus();
  form.addEventListener('submit', async e => {
    e.preventDefault(); const fd = new FormData(form), btn = form.querySelector('[type=submit]'); btn.disabled = true;
    const felder = { liefertermin: fd.get('liefertermin') || null, grund: fd.get('grund') || null };
    if (belegt && !einheitGeaendert && (fd.get('angekommen') !== '' || fd.get('verwendbar') !== '')) Object.assign(felder, { angekommen: fd.get('angekommen'), verwendbar: fd.get('verwendbar') });
    try {
      const j = await schreiben({ aktion: 'beschaffung', orderId, lineItemId, felder }); $('#dialogRoot').innerHTML = '';
      // Teil-Wareneingang: sagen, dass die Position offen bleibt. Am 19.10. wurde "2 von 3" dreimal
      // bestaetigt, weil die Rueckmeldung nach Abschluss klang.
      const neu = beschaffungsStand(j?.eintrag, bestellmenge);
      if (restmenge(neu) > 0) toast(`Gespeichert: ${beschaffungText(neu)}. Die Position bleibt offen, bis der Rest eingetragen ist.`, 'warn', { dauer: 9000 });
      else toast('Liefertermin / Wareneingang bestätigt.');
    }
    catch (err) { const h = form.querySelector('[data-b-fehler]'); h.textContent = err.message; h.hidden = false; h.focus(); btn.disabled = false; }
  });
}
async function oeffneGemischtenWareneingang(orderId) {
  const root = $('#dialogRoot');
  const kontext = `${state.route.view}?${state.route.params}`;
  root.innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="bAuswahl"><h2 id="bAuswahl">Wareneingang je Position bestätigen</h2><p role="status">Aktuellen Positionsstand laden …</p><button type="button" class="btn" data-close-dialog>Schließen</button></div></div>`;
  const fenster = $('#dialogRoot .dialog');
  const aktuell = () => $('#dialogRoot .dialog') === fenster && `${state.route.view}?${state.route.params}` === kontext;
  try {
    const stand = await fetchEinkauf('/api/einkauf/auftragsstatus');
    if (!aktuell()) return;
    if (!stand?.verfuegbar || stand.fehler || !stand.positionen || typeof stand.positionen !== 'object' || Array.isArray(stand.positionen)) throw new Error(stand?.hinweis || 'Der aktuelle Positionsstand ist nicht verfügbar.');
    einkauf.auftragsstatus = stand;
    const alle = alleAuftraege().find(a => a.id === orderId)?.positionen || [];
    if (!alle.length) throw new Error('Die Bestellpositionen sind nicht mehr verfügbar. Bitte die Bestellung aktualisieren.');
    const muster = alle.filter(p => p.istMuster);
    const ps = alle.filter(p => !p.istMuster);
    // Ein einzelner Warenartikel braucht keine zweite Auswahl vor den bestaetigten Mengen.
    if (!muster.length && ps.length === 1) { openBeschaffung(ps[0].orderId, ps[0].lineItemId, true); return; }
    fenster.innerHTML = `<h2 id="bAuswahl">Wareneingang je Position bestätigen</h2><p>Nur tatsächlich vorliegende Positionen bestätigen. Fehlende Ware bleibt offen.</p>
      ${muster.length ? `<p>Muster:</p>${muster.map(p => afEintragFuer(p)?.status === 'bestellt' ? `<p><button type="button" class="btn" data-b-muster-angekommen data-af-order="${esc(p.orderId)}" data-af-item="${esc(p.lineItemId)}">${esc(p.titel)} · ${esc(p.farbe || '')} als angekommen bestätigen</button></p>` : `<p class="small muted">${esc(p.titel)} · ${esc(p.farbe || '')} – ${['geliefert', 'raus', 'erledigt'].includes(afEintragFuer(p)?.status) ? 'bereits bestätigt oder abgeschlossen' : 'noch nicht als bestellt erfasst'}</p>`).join('')}` : ''}
      ${ps.map(p => `<p><button type="button" class="btn" data-beschaffung data-af-order="${esc(p.orderId)}" data-af-item="${esc(p.lineItemId)}">${esc(p.titel)} · ${esc(p.farbe || '')}</button></p>`).join('')}
      <button type="button" class="btn" data-close-dialog>Schließen</button>`;
  } catch (err) {
    if (!aktuell()) return;
    fenster.innerHTML = `<h2 id="bAuswahl">Wareneingang nicht geladen</h2><p class="notice warn" role="alert">${esc(err.message)} Es wurde nichts bestätigt.</p><button type="button" class="btn" data-b-wareneingang-neu="${esc(orderId)}">Positionsstand erneut laden</button><button type="button" class="btn" data-close-dialog>Schließen</button>`;
  }
}

export function beschaffungKlick(e) {
  const neu = e.target.closest('[data-b-wareneingang-neu]');
  if (neu) { e.preventDefault(); if (!istNurLesend()) void oeffneGemischtenWareneingang(neu.dataset.bWareneingangNeu); return true; }
  const musterKnopf = e.target.closest('[data-b-muster-angekommen]');
  if (musterKnopf) {
    e.preventDefault();
    if (istNurLesend() || musterKnopf.disabled) return true;
    musterKnopf.disabled = true;
    const p = { orderId: musterKnopf.dataset.afOrder, lineItemId: musterKnopf.dataset.afItem };
    Promise.resolve().then(() => setzeAuftragsstatus(p, 'geliefert')).then(ok => {
      if (ok) musterKnopf.textContent = 'Angekommen bestätigt';
      else musterKnopf.disabled = false;
    }).catch(() => { musterKnopf.disabled = false; toast('Muster konnte nicht bestätigt werden. Bitte erneut prüfen.', 'crit'); });
    return true;
  }
  const zs = e.target.closest('[data-zl-schritt="geliefert"]');
  if (zs) {
    // Reine Musterbestellung: ein Klick fuer alle (Zeitleiste setzt den Schritt fuer den ganzen
    // Auftrag). Mengen bestaetigt nur, wer Ware bekommt.
    const alle = alleAuftraege().find(a => a.id === zs.dataset.zlOrder)?.positionen || [];
    if (alle.length && alle.every(p => p.istMuster)) return false;
    e.preventDefault(); if (istNurLesend()) return true;
    // Der frische Serverstand wird vor der Auswahl gelesen; ein leerer Browsercache ist kein Nullbestand.
    void oeffneGemischtenWareneingang(zs.dataset.zlOrder);
    return true;
  }
  const b = e.target.closest('[data-beschaffung], [data-af-set][data-af-status="geliefert"]');
  // Ein einzelnes Muster "angekommen": direkt setzen (einkaufKlickStatus), kein Mengen-Dialog.
  if (b?.matches('[data-af-set]') && istMusterPosition(b.dataset.afOrder, b.dataset.afItem)) return false;
  if (b) { e.preventDefault(); if (!istNurLesend()) openBeschaffung(b.dataset.afOrder, b.dataset.afItem, b.dataset.afStatus === 'geliefert' || !!b.closest('[aria-labelledby="bAuswahl"]')); return true; }
  const u = e.target.closest('[data-einkauf-uebernahme]');
  if (!u) return false;
  e.preventDefault(); if (istNurLesend()) return true; u.disabled = true;
  Promise.resolve().then(() => JSON.parse(u.dataset.einkaufPositionen)).then(positionen => schreiben({ aktion: 'uebernahme', uebernahmeAktion: u.dataset.einkaufUebernahme, positionen }))
    .then(() => { toast(u.dataset.einkaufUebernahme === 'freigeben' ? 'Meine Übernahme freigegeben.' : 'Arbeit übernommen.'); render(); })
    .catch(err => { toast(err.message, 'crit'); u.disabled = false; });
  return true;
}
