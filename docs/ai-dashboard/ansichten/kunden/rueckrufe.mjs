/**
 * Kunden, Reiter "Rueckrufe": alle Bestellungen mit Beratungswunsch, Masspruefung oder
 * angefragter Verlegung, dazu seit 2026-11-06 die Musterberatung aus dem Warenkorb (Mail,
 * keine Bestellung), aelteste zuerst, mit klickbarer Telefonnummer - und der zugehoerige
 * Block auf "Heute". Seit 2026-10-13 die fuehrende Liste (w-078): die Laden-Ansicht der
 * Auftrags-App legt dafuer keine eigenen Faelle mehr an und verlinkt hierher.
 */
import { state } from '../../kern/zustand.mjs';
import { $, esc, fmtDate, fmtDateTime, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { kunden, telLink } from './gemeinsam.mjs';

const RUECKRUF_STATUS_LABEL = { offen: 'Offen', nicht_erreicht: 'Nicht erreicht', angerufen: 'Angerufen', erledigt: 'Erledigt' };

export function ensureKundenRueckrufe() {
  if (kunden.rueckrufe || kunden.loadingRueckrufe) return;
  kunden.loadingRueckrufe = true;
  fetchEinkauf('/api/kunden/rueckrufe').then(d => {
    kunden.rueckrufe = d; kunden.loadingRueckrufe = false;
    if (['heute', 'kunden'].includes(state.route.view)) render();
  });
}

/** Tagesdatum als JJJJ-MM-TT in lokaler Zeit - Wiedervorlagen sind Kalendertage. */
function heuteTag(versatz = 0) {
  const d = new Date();
  d.setDate(d.getDate() + versatz);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function morgenTag() { return heuteTag(1); }

async function setzeRueckrufStatus(orderId, status, notiz, wiedervorlage = null) {
  try {
    const r = await fetch('/api/kunden/rueckrufe', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId, status, notiz: notiz ?? null, wiedervorlage }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(`Fehler: ${j.error || r.status}`, 'crit'); return false; }
    if (kunden.rueckrufe?.zeilen) {
      const zeile = kunden.rueckrufe.zeilen.find(z => z.orderId === orderId);
      if (zeile) Object.assign(zeile, j.eintrag);
    }
    // Die rote Marke "Falsch geliefert" an der Bestellung zeigt denselben Stand, ohne die Liste neu zu laden.
    const bestellung = kunden.bestellungen?.zeilen?.find(z => z.orderId === orderId);
    if (bestellung) { bestellung.rueckrufStatus = status; if (status === 'erledigt') bestellung.rueckrufThema = null; }
    toast(`Rückruf: ${RUECKRUF_STATUS_LABEL[status]}`);
    render();
    return true;
  } catch (e) { toast(`Fehler: ${e.message}`, 'crit'); return false; }
}

/**
 * Rueckruf aus der Musterberatung im Warenkorb: es gibt keine Bestellung, nur die Mail. Was
 * der Kunde angefragt hat, steht deshalb in der Zeile selbst - welche Muster und was er
 * geschrieben hat - und die Eingangszeit statt eines Bestelldatums.
 */
function mailAngaben(z) {
  if (z.quelle !== 'mail') return '';
  const muster = z.muster || [];
  return `${muster.length ? `<div class="small">Muster: ${muster.map(m => esc(m)).join(' · ')}</div>` : ''}
      ${z.nachricht ? `<div class="small">„${esc(z.nachricht)}“</div>` : ''}`;
}

/**
 * Ohne Telefonnummer bleibt bei der Musterberatung nur die Mail: dann steht die Adresse als
 * Link da, sonst saehe die Zeile aus, als koenne niemand den Kunden erreichen.
 */
function kontaktHtml(z) {
  if (z.quelle === 'mail' && !z.telefon && z.email) {
    // Lange Adressen ohne Leerzeichen duerfen umbrechen, sonst steht die Zeile am Handy ueber.
    return `<a href="mailto:${esc(z.email)}" style="overflow-wrap:anywhere">${esc(z.email)}</a> <span class="small muted">· keine Telefonnummer, per Mail antworten</span>`;
  }
  return telLink(z.telefon);
}

/** "eingegangen 04.11., 14:32" - bei zwei Anfragen derselben Person mit der letzten dazu. */
function eingangText(z) {
  const mehr = z.anfragen > 1 && z.zuletztAm ? ` · ${z.anfragen}× angefragt, zuletzt ${esc(fmtDateTime(z.zuletztAm))}` : '';
  return `eingegangen ${esc(fmtDateTime(z.datum))}${mehr}`;
}

function rueckrufZeileHtml(z) {
  const ausMail = z.quelle === 'mail';
  return `<div class="row rueckruf-row">
    <div>
      <div class="t">${esc(z.kundenname)} ${ausMail ? '<span class="badge plain">noch keine Bestellung</span>' : `<span class="muted small mono">${esc(z.orderName)}</span>`}${z.testbestellung ? ' <span class="badge plain">Testbestellung</span>' : ''}</div>
      <div class="m">${ausMail ? `${esc(z.thema)} aus dem Warenkorb · ${eingangText(z)}` : `${esc(z.thema)}${z.wunschzeit ? ` · Wunschzeit: ${esc(z.wunschzeit)}` : ''} · seit ${fmtDate(z.datum)}`}</div>
      <div class="tel-gross">${kontaktHtml(z)}</div>
      ${mailAngaben(z)}
      ${z.notiz ? `<div class="small muted">Notiz: ${esc(z.notiz)}</div>` : ''}
      ${z.aktualisiertVon ? `<div class="small muted">Zuletzt: ${esc(z.aktualisiertVon)}${z.aktualisiertAm ? ` am ${esc(fmtDate(z.aktualisiertAm))}` : ''}</div>` : ''}
      ${z.wiedervorlage ? `<div class="small${z.wiedervorlage <= heuteTag() ? ' warnc' : ' muted'}">Nochmal versuchen: ${esc(fmtDate(z.wiedervorlage))}${z.wiedervorlage <= heuteTag() ? ' – heute fällig' : ''}</div>` : ''}
    </div>
    <div class="r rueckruf-actions">
      <span class="badge ${z.status === 'erledigt' ? 'ok' : z.status === 'angerufen' ? 'plain' : 'gap'}">${esc(RUECKRUF_STATUS_LABEL[z.status])}</span>
      <div class="btn-row"${istNurLesend() ? ' hidden' : ''}>
        ${['nicht_erreicht', 'angerufen', 'erledigt'].map(s => `<button type="button" class="btn btn-sm${z.status === s ? ' btn-primary' : ' btn-ghost'}" data-rueckruf-open="${esc(z.orderId)}" data-rueckruf-status="${s}">${esc(RUECKRUF_STATUS_LABEL[s])}</button>`).join('')}
      </div>
    </div>
  </div>`;
}

export function openRueckrufDialog(orderId, status) {
  const z = kunden.rueckrufe?.zeilen?.find(x => x.orderId === orderId);
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="rrTitle" data-dialog>
    <h2 id="rrTitle">Rückruf · ${esc(z?.orderName || z?.thema || '')} → ${esc(RUECKRUF_STATUS_LABEL[status])}</h2>
    <p class="small muted">${esc(z?.kundenname || '')} · ${esc(z?.thema || '')}</p>
    <div class="field"><label for="rrNotiz">Notiz (optional)</label><textarea id="rrNotiz" name="notiz" maxlength="2000" placeholder="z. B. Ergebnis des Anrufs">${esc(z?.notiz || '')}</textarea></div>
    ${status === 'erledigt' ? '' : `<div class="field"><label for="rrWieder">Nochmal versuchen am (optional)</label>
      <input type="date" id="rrWieder" name="wiedervorlage" value="${esc(z?.wiedervorlage || (status === 'nicht_erreicht' ? morgenTag() : ''))}"></div>`}
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Übernehmen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('textarea')?.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    form.querySelector('[type=submit]').disabled = true;
    const daten = new FormData(form);
    const ok = await setzeRueckrufStatus(orderId, status, (daten.get('notiz') || '').trim() || null,
      (daten.get('wiedervorlage') || '').trim() || null);
    if (ok) $('#dialogRoot').innerHTML = '';
    else form.querySelector('[type=submit]').disabled = false;
  });
}

export function viewKundenRueckrufe() {
  ensureKundenRueckrufe();
  const r = kunden.rueckrufe;
  if (!r && kunden.loadingRueckrufe) return `<div class="empty">Lade Rückrufliste …</div>`;
  if (r?.fehler) return stoerungState(r, 'Die Rückrufliste');
  if (!r || !r.verfuegbar) return emptyState('Keine Daten verfügbar.', r?.hinweis || 'Bestellübersicht noch nicht exportiert.');
  // Testbestellungen sind keine Arbeit - auf der Startseite waren sie schon
  // ausgenommen, in dieser Liste und im Zaehler standen sie weiter drin.
  const auftrag = state.route.params.get('auftrag');
  const zeilen = auftrag ? r.zeilen.filter(z => String(z.orderId) === auftrag) : r.zeilen;
  // Wichtigkeit (22.10.): nicht erreicht vor offen vor angerufen, darin die aelteste Bestellung zuerst.
  const RANG = { nicht_erreicht: 0, offen: 1, angerufen: 2 };
  const offen = zeilen.filter(z => z.status !== 'erledigt' && !z.testbestellung)
    .map((z, i) => [z, i]).sort(([a, ai], [b, bi]) => (RANG[a.status] ?? 1) - (RANG[b.status] ?? 1) || ai - bi).map(([z]) => z);
  const erledigt = zeilen.filter(z => z.status === 'erledigt');
  const tests = zeilen.filter(z => z.status !== 'erledigt' && z.testbestellung);
  return `
    ${auftrag ? '<p><a href="#/heute">← Zurück zu Heute</a> · <a href="#/kunden?tab=rueckrufe">Alle Rückrufe</a></p>' : ''}
    <p class="small muted" style="margin:0 0 10px">Alle Bestellungen mit Beratungswunsch, Maßprüfung „Ja" oder angefragter Verlegung, jede Musterberatung aus dem Warenkorb und jede als „Falsch geliefert“ gemeldete Bestellung – „Nicht erreicht“ zuerst, sonst älteste zuerst. Nachgefasst wird nur hier, nicht in der Laden-Ansicht. Status und Notiz werden lokal auf diesem Mac gespeichert.</p>
    <div class="rows">${offen.length ? offen.map(rueckrufZeileHtml).join('') : emptyState('Keine offenen Rückrufe.', '')}</div>
    ${tests.length ? `<details style="margin-top:14px"><summary>${tests.length} aus Testbestellungen</summary><div class="rows">${tests.map(rueckrufZeileHtml).join('')}</div></details>` : ''}
    ${erledigt.length ? `<details ${auftrag ? 'open' : ''} style="margin-top:14px"><summary>${erledigt.length} erledigt</summary><div class="rows">${erledigt.map(rueckrufZeileHtml).join('')}</div></details>` : ''}
  `;
}
