/**
 * Kunden, Reiter "Kunden nach Produkt fragen": wer seit 5 Tagen Muster hat, wird nachgefragt - am Telefon oder,
 * wenn das nicht geht, per Rueckfrage-Mail. Das Ergebnis wird angeklickt, Notizen eingetippt. Oben
 * steht die Anrufliste, darunter, welche Gruende bisher genannt wurden, und zugeklappt Vermutungen
 * und Ideen (lib/muster-ideen.mjs). Rechnen: lib/muster-anrufe.mjs. Gestaltung: stile/muster.css.
 *
 * Ganz oben seit 07.11.2026 (Inhaber, w-284) die automatischen Nachfrage-Mails: eine ruhige Zeile mit
 * dem Stand des Versandlaufs, aufgeklappt (Parameter mn=1) die Karte aus heute/muster-nachfassen.mjs.
 * Anruf und Mail sind zwei Wege zum selben Ziel - vorher stand die Mail auf Heute ("0 Nachfragen
 * fällig") und der Anruf im Menue ("Kunden nach Produkt fragen 24"), mit verwechselbaren Woertern.
 */
import { state } from '../../kern/zustand.mjs';
import { $, esc, fmtDate, plural, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { render } from '../../kern/render.mjs';
import { emptyState, stoerungState } from '../../bausteine/karten.mjs';
import { kundenLinkWert } from '../../lib/kunden-linkwert.mjs';
import { ANRUF_ERGEBNISSE, ANRUF_GRUPPEN, ANRUF_NACH_TAGEN, HOECHSTENS_VERSUCHE, anrufErgebnis, anrufErgebnisText, rueckfrageLink, wiedervorlageTag } from '../../lib/muster-anrufe.mjs';
import { MUSTER_ALTERNATIVEN, MUSTER_VERMUTUNGEN, vermutungGenannt } from '../../lib/muster-ideen.mjs';
import { kunden, telLink } from './gemeinsam.mjs';
import { ensureKundenBestellungen } from './bestellungen.mjs';
import { ensureHeuteMusterTexte } from '../heute/daten.mjs';
import { musterNachfassenStand, musterNachfassenBlock, nachfrageMailsZeile } from '../heute/muster-nachfassen.mjs';

export function ensureMusterAnrufe() {
  if (kunden.musterAnrufe || kunden.loadingMusterAnrufe) return;
  kunden.loadingMusterAnrufe = true;
  fetchEinkauf('/api/kunden/muster-anrufe').then((d) => {
    kunden.musterAnrufe = d; kunden.loadingMusterAnrufe = false;
    if (['heute', 'kunden'].includes(state.route.view)) render();
  });
}

/** Zahl im Menue und am Reiter: alle, die jetzt dran sind, egal ob per Telefon oder E-Mail. */
export function musterAnrufeOffen() {
  const m = kunden.musterAnrufe;
  return m?.verfuegbar ? m.anrufen.length + m.ohneNummer.length + m.gesperrt.length : 0;
}

const alleZeilen = () => {
  const m = kunden.musterAnrufe || {};
  return [...(m.anrufen || []), ...(m.ohneNummer || []), ...(m.gesperrt || []), ...(m.spaeter || []), ...(m.erledigt || [])];
};

function verlaufHtml(z) {
  if (!z.verlauf?.length) return '';
  const zeilen = z.verlauf.map(v => `<li>${esc(fmtDate(v.am))} · ${esc(v.von || '')}${v.ergebnis ? ` · <b>${esc(anrufErgebnisText(v.ergebnis) || v.ergebnis)}</b>` : ''}${v.notiz ? `: ${esc(v.notiz)}` : ''}</li>`).join('');
  return `<ul class="anruf-verlauf">${zeilen}</ul>`;
}

function zeileHtml(z, { mitMail = false } = {}) {
  const lesend = istNurLesend();
  const kundeHref = z.kundenSchluessel ? `#/kunden?kunde=${kundenLinkWert(z.kundenSchluessel)}` : '#/kunden?tab=bestellungen';
  const absender = state.session?.benutzer?.name || null;
  const mail = mitMail ? rueckfrageLink(z, absender) : null;
  const key = esc(z.schluessel);
  return `<div class="row rueckruf-row anruf-zeile">
    <div>
      <div class="t"><a href="${esc(kundeHref)}">${esc(z.kundenname || z.orderNames[0])}</a> <span class="muted small mono">${esc(z.orderNames.join(', '))}</span>${z.rueckrufWunsch ? ' <span class="badge plain">Rückruf gewünscht</span>' : ''}</div>
      <div class="m">verschickt vor ${esc(plural(z.tage, 'Tag', 'Tagen'))}${z.versuche ? ` · ${esc(plural(z.versuche, 'Versuch', 'Versuche'))}` : ''}</div>
      ${z.muster.length ? `<div class="small muted">Muster: ${esc(z.muster.join(' · '))}</div>` : ''}
      ${z.telefon ? `<div class="tel-gross">${telLink(z.telefon)}</div>` : ''}
      ${z.hatNummer && !z.telefon ? '<div class="small muted">Nummer vorhanden, Anruf noch nicht freigegeben</div>' : ''}
      ${z.wiedervorlage ? `<div class="small muted">Nochmal am ${esc(fmtDate(z.wiedervorlage))}</div>` : ''}
      ${verlaufHtml(z)}
    </div>
    <div class="r rueckruf-actions"${lesend ? ' hidden' : ''}>
      ${mitMail && mail ? `<a class="btn btn-sm" href="${esc(mail)}" title="Öffnet die fertige E-Mail im Mailprogramm. Gesendet wird erst dort.">Rückfrage-Mail öffnen</a>` : ''}
      ${mitMail && !mail ? '<span class="small muted">Keine E-Mail-Adresse</span>' : ''}
      <button type="button" class="btn btn-sm" data-anruf-eintragen="${key}">Ergebnis eintragen</button>
    </div>
  </div>`;
}

/**
 * Eine Spalte: wer eine freigegebene Nummer hat, wird angerufen; alle anderen bekommen die Mail.
 * `raster`: steht die Spalte allein, liegen die Karten auf breiten Bildschirmen zu zweit nebeneinander.
 */
function spalte(titel, zeilen, { hinweis = '', raster = false } = {}) {
  return `<section class="anruf-spalte" aria-label="${esc(titel)}">
    <h3 class="anruf-titel">${esc(titel)} <span class="muted small">${zeilen.length}</span></h3>
    ${hinweis ? `<p class="small muted">${esc(hinweis)}</p>` : ''}
    <div class="rows${raster ? ' anruf-raster' : ''}">${zeilen.map(z => zeileHtml(z, { mitMail: !z.telefon })).join('')}</div>
  </section>`;
}

/**
 * Die Arbeitsliste. Eine leere Spalte faellt weg (bis 2026-11-06 stand fast immer "Keine
 * Telefonnummer: per E-Mail 0" daneben und die Telefonkarten nutzten nur die halbe Breite).
 */
function arbeitslisteHtml(m) {
  const telefon = [...m.anrufen, ...m.gesperrt];
  const teile = [];
  if (telefon.length) {
    // Nur gesperrte Kunden (Anruf ohne Rueckrufwunsch nicht freigegeben): kein "anrufen" im Titel.
    teile.push([m.anrufen.length ? 'Telefonnummer vorhanden: anrufen' : 'Telefonnummer vorhanden', telefon, m.gesperrt.length ? 'Ohne Rückrufwunsch ist der Anruf noch nicht freigegeben. Bis dahin hier per E-Mail fragen.' : '']);
  }
  if (m.ohneNummer.length) teile.push(['Keine Telefonnummer: per E-Mail', m.ohneNummer, '']);
  const raster = teile.length === 1;
  const html = teile.map(([titel, zeilen, hinweis]) => spalte(titel, zeilen, { hinweis, raster })).join('');
  return raster ? html : `<div class="anruf-spalten">${html}</div>`;
}

function aufgeklappt(titel, zeilen, opt = {}) {
  return `<details class="anruf-mehr"><summary>${esc(titel)} (${zeilen.length})</summary><div class="rows">${zeilen.map(z => zeileHtml(z, opt)).join('')}</div></details>`;
}

/** Zahlen, Vermutungen und Alternativen. Zugeklappt: die Liste bleibt die Arbeit, das hier das Nachdenken. */
function ideenHtml(m) {
  const k = m.kennzahlen;
  if (!k) return '';
  const vermutungen = MUSTER_VERMUTUNGEN.map((v) => {
    const genannt = vermutungGenannt(v, m.gruende);
    const zahl = v.zahl(k);
    return `<li class="anruf-idee">
      <div class="t">${esc(v.titel)}${genannt ? ` <span class="badge plain">${genannt}× genannt</span>` : ''}</div>
      <div class="small">${esc(v.text)}</div>
      ${zahl ? `<div class="small"><b>Unsere Zahlen:</b> ${esc(zahl)}</div>` : ''}
      <div class="small muted">Idee: ${esc(v.idee)}</div>
    </li>`;
  }).join('');
  const alternativen = MUSTER_ALTERNATIVEN.map(a => `<li class="anruf-idee">
    <div class="t">${esc(a.titel)}</div>
    <div class="small">${esc(a.text)}</div>
    <div class="small muted">Aufwand ${esc(a.aufwand)} · entscheidet: ${esc(a.entscheidet)}</div>
  </li>`).join('');
  return `<details class="anruf-mehr anruf-ideen"><summary>Warum nicht gekauft wird: Vermutungen und Ideen</summary>
    <p class="small muted">Das sind Vermutungen, keine Tatsachen. Die Klicks oben zeigen mit der Zeit, welche stimmen. Beschlossen ist davon nichts.</p>
    <h4>Mögliche Gründe</h4>
    <ul class="anruf-ideen-liste">${vermutungen}</ul>
    <h4>Was wir statt oder neben dem Gratis-Muster ausprobieren könnten</h4>
    <ul class="anruf-ideen-liste">${alternativen}</ul>
  </details>`;
}

/** Automatische Nachfrage-Mails: Zeile immer, Karte nur aufgeklappt. Unabhaengig von der Anrufliste geladen. */
function nachfrageMailsHtml() {
  ensureKundenBestellungen(); ensureHeuteMusterTexte();
  const stand = musterNachfassenStand();
  const auf = Boolean(state.route.params.get('mn'));
  return `<div class="nachfrage-mails">${nachfrageMailsZeile(stand, auf)}${auf ? musterNachfassenBlock(stand, { eingebettet: true }) : ''}</div>`;
}

export function viewMusterAnrufe() {
  ensureMusterAnrufe();
  const m = kunden.musterAnrufe;
  const mails = nachfrageMailsHtml();
  if (!m && kunden.loadingMusterAnrufe) return `${mails}<div class="empty">Lade Anrufliste …</div>`;
  if (m?.fehler) return mails + stoerungState(m, 'Die Anrufliste');
  if (!m || !m.verfuegbar) return mails + emptyState('Keine Daten verfügbar.', m?.hinweis || 'Bestellübersicht noch nicht exportiert.');
  const nichts = !m.anrufen.length && !m.ohneNummer.length && !m.gesperrt.length;
  const gruende = m.gruende?.length
    ? `<div class="anruf-gruende" aria-label="Genannte Gründe">${m.gruende.map(g => `<span class="anruf-grund"><b>${g.anzahl}</b> ${esc(g.text)}</span>`).join('')}</div>`
    : '<p class="small muted">Noch keine Gründe erfasst. Sobald Ergebnisse eingetragen sind, steht hier, warum gekauft wird oder nicht.</p>';
  // Erst die Arbeit, dann das Nachdenken: die Anrufliste beginnt oben, die Auswertung steht darunter.
  return `
    ${mails}
    <p class="small muted anruf-regel">Ab ${ANRUF_NACH_TAGEN} Tagen nach Versand · erst fragen, ob es passt · nach ${HOECHSTENS_VERSUCHE}× „Nicht erreicht“ Schluss · „Möchte keine Anrufe“ gilt dauerhaft</p>
    ${nichts ? emptyState('Gerade ist niemand dran.', 'Neue Kunden erscheinen hier von selbst.') : arbeitslisteHtml(m)}
    <h3 class="anruf-titel">Warum gekauft wird oder nicht</h3>
    ${gruende}
    ${ideenHtml(m)}
    ${m.spaeter.length ? aufgeklappt('Später nochmal', m.spaeter) : ''}
    ${m.erledigt.length ? aufgeklappt('Abgeschlossen', m.erledigt) : ''}
  `;
}

function oeffneDialog(schluessel) {
  const z = alleZeilen().find(x => x.schluessel === schluessel);
  if (!z) return;
  const gruppen = ANRUF_GRUPPEN.map(([g, titel]) => `<fieldset class="anruf-wahl"><legend>${esc(titel)}</legend>
    ${ANRUF_ERGEBNISSE.filter(e => e.gruppe === g).map(e => `<label class="anruf-chip"><input type="radio" name="ergebnis" value="${esc(e.wert)}"><span>${esc(e.text)}</span></label>`).join('')}
  </fieldset>`).join('');
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="anrufTitel" data-dialog>
    <h2 id="anrufTitel">Ergebnis · ${esc(z.kundenname || z.orderNames[0])}</h2>
    <p class="small muted">${esc(z.orderNames.join(', '))}${z.muster.length ? ` · ${esc(z.muster.join(' · '))}` : ''}</p>
    ${gruppen}
    <div class="field"><label for="anrufNotiz">Notiz</label><textarea id="anrufNotiz" name="notiz" maxlength="2000" placeholder="z. B. Farbe zu dunkel, hat bei der Konkurrenz 5 € günstiger gefunden"></textarea></div>
    <div class="field" data-anruf-datum hidden><label for="anrufWieder">Nochmal am</label><input type="date" id="anrufWieder" name="wiedervorlage"></div>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">Eintragen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('input[type=radio]')?.focus();
  // Das Datum gibt es nur bei Ergebnissen, die offen bleiben; der Vorschlag kommt vom Ergebnis.
  form.addEventListener('change', (ev) => {
    if (ev.target.name !== 'ergebnis') return;
    const art = anrufErgebnis(ev.target.value);
    const feld = form.querySelector('[data-anruf-datum]');
    feld.hidden = !art?.tage;
    form.querySelector('#anrufWieder').value = art?.tage ? wiedervorlageTag(art.tage) : '';
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const daten = new FormData(form);
    const ergebnis = String(daten.get('ergebnis') || '') || null;
    const notiz = String(daten.get('notiz') || '').trim() || null;
    if (!ergebnis && !notiz) { toast('Bitte ein Ergebnis anklicken oder eine Notiz eintippen', 'warn'); return; }
    const knopf = form.querySelector('[type=submit]');
    knopf.disabled = true;
    try {
      const antwort = await orgSchreiben('/api/kunden/muster-anrufe', { orderIds: z.orderIds, ergebnis, notiz, wiedervorlage: String(daten.get('wiedervorlage') || '') || null });
      if (antwort?.stand) kunden.musterAnrufe = antwort.stand;
      // Die Zeitleiste hat sich geaendert: Bestellzeilen beim naechsten Oeffnen frisch holen.
      kunden.bestellungen = null;
      if (antwort?.zeitleisteFehler) toast(`Eingetragen, aber nicht in der Zeitleiste: ${antwort.zeitleisteFehler}`, 'warn', { dauer: 9000 });
      else toast(`Eingetragen: ${(ergebnis && anrufErgebnisText(ergebnis)) || 'Notiz'}`);
      $('#dialogRoot').innerHTML = '';
      render();
    } catch (err) {
      toast(`Nicht gespeichert: ${err.message}`, 'crit');
      knopf.disabled = false;
    }
  });
}

/** Klicks des Reiters. Gibt true zurueck, wenn der Klick damit erledigt ist. */
export function musterAnrufeKlick(e) {
  const knopf = e.target.closest('[data-anruf-eintragen]');
  if (!knopf) return false;
  e.preventDefault();
  oeffneDialog(knopf.dataset.anrufEintragen);
  return true;
}
