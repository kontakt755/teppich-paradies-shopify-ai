/**
 * "Heute": Karte "Muster nachfassen" (Inhaberentscheidung 2026-10-10 - der Verkauf im Laden
 * fasst nach, wer montags im Laden ist).
 *
 * Je Kunde: wer, welche Muster, wann bestellt und verschickt, auf welchem Weg, ein Textvorschlag
 * und der Knopf "Erledigt - nachgefasst". Der Knopf ist der vorhandene Zeitleisten-Schritt
 * (data-zl-schritt, ansichten/kunden/zeitleiste.mjs): er speichert wer und wann, danach rechnet
 * die Liste neu. Welche Kunden dran sind, rechnet lib/muster-nachfassen.mjs; hier wird nur
 * gezeichnet. Gestaltung: stile/heute.css.
 */
import { state } from '../../kern/zustand.mjs';
import { esc, fmtDate, fmtDateTime, plural } from '../../kern/helfer.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { kunden } from '../kunden/gemeinsam.mjs';
import { musterNachfassen, fuelleText, mailtoLink, STUFE_LABEL, ERSTE_NACH_TAGEN, ERINNERUNG_NACH_TAGEN } from '../../lib/muster-nachfassen.mjs';
import { heuteDaten } from './daten.mjs';

const tageText = n => (n === 0 ? 'heute' : n === 1 ? 'vor 1 Tag' : `vor ${n} Tagen`);
// Bestell-IDs sind gid://-Adressen - als HTML-id nur Buchstaben und Ziffern.
const textId = orderId => `mnText-${String(orderId).replace(/[^A-Za-z0-9_-]/g, '')}`;
const kundenLink = e => (e.kundenSchluessel ? `#/kunden?kunde=${encodeURIComponent(e.kundenSchluessel)}` : '#/kunden?tab=bestellungen');

/** Offene und kuerzlich erledigte Nachfragen aus den geladenen Bestellzeilen. */
export function musterNachfassenStand() {
  const zeilen = kunden.bestellungen?.verfuegbar ? kunden.bestellungen.zeilen : [];
  return musterNachfassen(zeilen);
}

function kontaktText(k) {
  if (k.weg === 'rueckruf') return `Rückruf gewünscht: ${esc(k.telefon)}`;
  if (k.weg === 'email') return `per E-Mail an ${esc(k.email)}`;
  return 'keine E-Mail hinterlegt – anrufen nur, wenn der Kunde einen Rückruf möchte';
}

function zeile(e, texte, lesend, erste) {
  const vorlage = texte?.[e.stufe] || null;
  const absender = state.session?.benutzer?.name || null;
  const mail = fuelleText(vorlage, { kundenname: e.kundenname, absender });
  const id = textId(e.orderId);
  const k = e.kontakt;
  const kontaktKnopf = k.weg === 'rueckruf'
    ? `<a class="btn btn-sm" href="tel:${esc(String(k.telefon).replace(/[^0-9+]/g, ''))}">Anrufen</a>`
    : k.weg === 'email' ? `<a class="btn btn-sm" href="${esc(mailtoLink(k.email, mail || {}))}">E-Mail öffnen</a>` : '';
  const knoepfe = lesend ? '' : `<div class="heute-mn-knoepfe">
      ${kontaktKnopf}
      <button type="button" class="btn btn-sm${erste ? ' btn-primary' : ''}" data-zl-schritt="nachgefasst" data-zl-order="${esc(e.orderId)}">Erledigt – nachgefasst</button>
    </div>`;
  const wann = e.stufe === 'erinnerung'
    ? `erste Nachfrage ${tageText(e.tage)}${e.zuletzt?.von ? ` (${esc(e.zuletzt.von)})` : ''}`
    : `verschickt ${tageText(e.tage)}`;
  return `<div class="heute-mn-zeile" data-mn="${esc(e.orderId)}">
    <div class="heute-mn-kopf">
      <div class="heute-mn-text">
        <div class="t"><a href="${esc(kundenLink(e))}">${esc(e.kundenname || e.orderName)}</a> <span class="heute-mn-stufe">${esc(STUFE_LABEL[e.stufe])}</span></div>
        <div class="s">${esc(e.orderName)} · bestellt ${esc(fmtDate(e.datum))} · ${wann}</div>
        ${e.muster.length ? `<div class="s">Muster: ${esc(e.muster.join(' · '))}</div>` : ''}
        <div class="s">Kontakt: ${kontaktText(k)}</div>
      </div>
      ${knoepfe}
    </div>
    ${mail ? `<details class="heute-mn-vorschlag">
      <summary>Textvorschlag (${esc(e.stufe === 'erinnerung' ? 'kurze Erinnerung' : 'erste E-Mail')})</summary>
      <p class="heute-mn-betreff"><span>Betreff:</span> ${esc(mail.betreff)}</p>
      <label class="visually-hidden" for="${esc(id)}">Text der E-Mail an ${esc(e.kundenname || e.orderName)}</label>
      <textarea id="${esc(id)}" readonly rows="10">${esc(mail.text)}</textarea>
      <button type="button" class="btn btn-sm" data-kopieren="${esc(id)}">Text kopieren</button>
    </details>` : ''}
  </div>`;
}

function fertigZeile(e) {
  return `<div class="heute-mn-fertig">
    <a href="${esc(kundenLink(e))}">${esc(e.kundenname || e.orderName)}</a>
    <span>${esc(e.orderName)} · ${e.anzahl > 1 ? 'Erinnerung' : 'nachgefasst'}${e.von ? ` von ${esc(e.von)}` : ''} am ${esc(fmtDateTime(e.am))}</span>
  </div>`;
}

/**
 * Die Karte - leer bleibt sie ganz weg (nichts offen, in den letzten Tagen nichts erledigt).
 * @param {{offen: object[], erledigt: object[]}} stand  musterNachfassenStand()
 */
export function musterNachfassenBlock(stand) {
  if (!stand.offen.length && !stand.erledigt.length) return '';
  const t = heuteDaten.musterTexte;
  const texte = t?.verfuegbar ? t.texte : null;
  const lesend = istNurLesend();
  // Fehlt die Vorlage, geht es trotzdem: Liste und Knopf funktionieren, nur ohne Textvorschlag.
  const hinweis = stand.offen.length && t && !t.verfuegbar ? `<p class="heute-hinweis">Ohne Textvorschlag: ${esc(t.hinweis || 'Textvorlage nicht geladen.')}</p>` : '';
  return `<section class="heute-block heute-mn" aria-labelledby="heuteMuster">
    <div class="heute-block-kopf"><h2 id="heuteMuster">Muster nachfassen</h2><span>${stand.offen.length ? `${plural(stand.offen.length, 'Kunde', 'Kunden')} offen` : 'alles nachgefasst'}</span></div>
    <p class="heute-mn-regel">Erste E-Mail ab ${ERSTE_NACH_TAGEN} Tagen nach dem Versand, höchstens eine Erinnerung ${ERINNERUNG_NACH_TAGEN} Tage danach. Anrufen nur bei Rückrufwunsch.</p>
    ${stand.offen.length ? `<div class="heute-mn-liste">${stand.offen.map((e, i) => zeile(e, texte, lesend, i === 0)).join('')}</div>` : ''}
    ${hinweis}
    ${stand.erledigt.length ? `<div class="heute-mn-erledigt"><p class="heute-mn-unter">Erledigt in den letzten Tagen</p>${stand.erledigt.map(fertigZeile).join('')}</div>` : ''}
  </section>`;
}
