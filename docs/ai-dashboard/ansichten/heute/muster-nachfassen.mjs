/**
 * "Heute": Karte "Muster nachfassen" (Inhaberentscheidung 2026-10-10 - der Verkauf im Laden
 * fasst nach; seit w-119 vom 2026-10-16 verschickt ein taeglicher Lauf Text 1 und die
 * Erinnerung selbst vom Firmenpostfach, scripts/muster-nachfassen-senden.mjs).
 *
 * Je Kunde: wer, welche Muster, wann bestellt und verschickt, auf welchem Weg, ein Textvorschlag
 * und die Knoepfe "Erledigt - nachgefasst" (Zeitleisten-Schritt, data-zl-schritt,
 * ansichten/kunden/zeitleiste.mjs - speichert wer und wann) und "Abgemeldet" (der Kunde hat
 * mit "Abmelden" geantwortet: Stoppliste im Privatordner, POST /api/kunden/nachfassen-abmelden).
 * Welche Kunden dran sind, rechnet lib/muster-nachfassen.mjs; hier wird nur gezeichnet.
 * Gestaltung: stile/heute.css.
 */
import { state } from '../../kern/zustand.mjs';
import { esc, fmtDate, fmtDateTime, plural, toast } from '../../kern/helfer.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { orgSchreiben } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';
import { kunden } from '../kunden/gemeinsam.mjs';
import { musterNachfassen, fuelleText, mailtoLink, STUFE_LABEL, ERSTE_NACH_TAGEN, ERINNERUNG_NACH_TAGEN } from '../../lib/muster-nachfassen.mjs';
import { heuteDaten } from './daten.mjs';

/** Steht in der Zeitleiste als "von", wenn der Versandlauf nachgefasst hat (operations/lib/nachfass-versand.mjs). */
const AUTOMATISCH = 'automatisch';

const tageText = n => (n === 0 ? 'heute' : n === 1 ? 'vor 1 Tag' : `vor ${n} Tagen`);
// Bestell-IDs sind gid://-Adressen - als HTML-id nur Buchstaben und Ziffern.
const textId = orderId => `mnText-${String(orderId).replace(/[^A-Za-z0-9_-]/g, '')}`;
const kundenLink = e => (e.kundenSchluessel ? `#/kunden?kunde=${encodeURIComponent(e.kundenSchluessel)}` : '#/kunden?tab=bestellungen');

/** Stoppliste aus der zuletzt geladenen Antwort von /api/kunden/muster-texte (Adresse -> { am }). */
function stoppliste() {
  const liste = heuteDaten.musterTexte?.abgemeldet;
  return new Map((Array.isArray(liste) ? liste : []).map(e => [String(e.email).toLowerCase(), { am: e.am || null }]));
}

/** Offene, abgemeldete und kuerzlich erledigte Nachfragen aus den geladenen Bestellzeilen. */
export function musterNachfassenStand() {
  const zeilen = kunden.bestellungen?.verfuegbar ? kunden.bestellungen.zeilen : [];
  return musterNachfassen(zeilen, { abgemeldet: stoppliste() });
}

function kontaktText(k) {
  if (k.weg === 'rueckruf') return `Rückruf gewünscht: ${esc(k.telefon)}`;
  if (k.weg === 'email') return `per E-Mail an ${esc(k.email)}`;
  return 'keine E-Mail hinterlegt – anrufen nur, wenn der Kunde einen Rückruf möchte';
}

function zeile(e, texte, lesend, erste, automatisch) {
  const vorlage = texte?.[e.stufe] || null;
  const absender = state.session?.benutzer?.name || null;
  const mail = fuelleText(vorlage, { kundenname: e.kundenname, absender, produkte: e.produkte });
  const id = textId(e.orderId);
  const k = e.kontakt;
  const kontaktKnopf = k.weg === 'rueckruf'
    ? `<a class="btn btn-sm" href="tel:${esc(String(k.telefon).replace(/[^0-9+]/g, ''))}">Anrufen</a>`
    : k.weg === 'email' ? `<a class="btn btn-sm" href="${esc(mailtoLink(k.email, mail || {}))}">E-Mail öffnen</a>` : '';
  const abmelden = k.weg === 'email'
    ? `<button type="button" class="btn btn-sm" data-mn-abmelden="${esc(k.email)}" data-mn-order="${esc(e.orderId)}" data-mn-name="${esc(e.orderName)}" title="Der Kunde hat mit „Abmelden“ geantwortet – keine Nachfragen mehr">Abgemeldet</button>`
    : '';
  // Verschickt der Lauf selbst, ist "Erledigt" nur noch die Ausnahme (z. B. am Telefon nachgefasst) - nicht mehr die Hauptaktion.
  const haupt = erste && !automatisch ? ' btn-primary' : '';
  const knoepfe = lesend ? '' : `<div class="heute-mn-knoepfe">
      ${kontaktKnopf}
      ${abmelden}
      <button type="button" class="btn btn-sm${haupt}" data-zl-schritt="nachgefasst" data-zl-order="${esc(e.orderId)}">Erledigt – nachgefasst</button>
    </div>`;
  const wann = e.stufe === 'erinnerung'
    ? `erste Nachfrage ${tageText(e.tage)}${e.zuletzt?.von ? ` (${esc(vonText(e.zuletzt.von))})` : ''}`
    : `verschickt ${tageText(e.tage)}`;
  const naechsterLauf = automatisch && k.weg === 'email' ? '<div class="s">Geht beim nächsten Lauf automatisch per E-Mail raus.</div>' : '';
  return `<div class="heute-mn-zeile" data-mn="${esc(e.orderId)}">
    <div class="heute-mn-kopf">
      <div class="heute-mn-text">
        <div class="t"><a href="${esc(kundenLink(e))}">${esc(e.kundenname || e.orderName)}</a> <span class="heute-mn-stufe">${esc(STUFE_LABEL[e.stufe])}</span></div>
        <div class="s">${esc(e.orderName)} · bestellt ${esc(fmtDate(e.datum))} · ${wann}</div>
        ${e.muster.length ? `<div class="s">Muster: ${esc(e.muster.join(' · '))}</div>` : ''}
        <div class="s">Kontakt: ${kontaktText(k)}</div>
        ${naechsterLauf}
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

/** "automatisch" ist kein Kollege - sagen, was es war. */
const vonText = von => (von === AUTOMATISCH ? 'automatisch per E-Mail' : von);

function fertigZeile(e) {
  const art = e.anzahl > 1 ? 'Erinnerung' : 'nachgefasst';
  const wer = e.von === AUTOMATISCH ? ' automatisch per E-Mail' : (e.von ? ` von ${esc(e.von)}` : '');
  return `<div class="heute-mn-fertig">
    <a href="${esc(kundenLink(e))}">${esc(e.kundenname || e.orderName)}</a>
    <span>${esc(e.orderName)} · ${art}${wer} am ${esc(fmtDateTime(e.am))}</span>
  </div>`;
}

function abgemeldetZeile(e) {
  return `<div class="heute-mn-fertig">
    <a href="${esc(kundenLink(e))}">${esc(e.kundenname || e.orderName)}</a>
    <span>${esc(e.orderName)} · abgemeldet${e.abgemeldetAm ? ` am ${esc(fmtDate(e.abgemeldetAm))}` : ''} – keine Nachfragen mehr</span>
  </div>`;
}

/**
 * Eine Zeile zum automatischen Versand: laeuft er, und mit Kopie ans Buero? Ist er nicht
 * eingerichtet, steht der Grund da - dann fasst der Laden weiter per Klick nach.
 */
function versandZeile(v, offen) {
  if (!v) return '';
  if (!v.eingerichtet) {
    return offen ? `<p class="heute-hinweis">${esc(v.hinweis || 'Automatischer Versand nicht eingerichtet.')} Bis dahin per Klick nachfassen.</p>` : '';
  }
  const lauf = v.letzterLauf?.am ? `letzter Lauf ${esc(fmtDateTime(v.letzterLauf.am))} (${v.letzterLauf.verschickt} verschickt${v.letzterLauf.fehler ? `, ${v.letzterLauf.fehler} Fehler` : ''})` : 'noch kein Lauf';
  const kopie = v.mitlesenBis === 'immer' ? ` · Kopie an ${esc(v.kopie)}` : v.mitlesenBis ? ` · bis ${esc(fmtDate(v.mitlesenBis))} mit Kopie an ${esc(v.kopie)}` : '';
  const warnung = v.hinweis ? ` · <span class="heute-mn-warn">${esc(v.hinweis)}</span>` : '';
  return `<p class="heute-mn-regel">E-Mails gehen automatisch vom Firmenpostfach raus (Mo–Sa vormittags) · ${lauf}${kopie}${warnung}</p>`;
}

/**
 * Die Karte - leer bleibt sie ganz weg (nichts offen, nichts abgemeldet, in den letzten Tagen nichts erledigt).
 * @param {{offen: object[], erledigt: object[], abgemeldet?: object[]}} stand  musterNachfassenStand()
 */
export function musterNachfassenBlock(stand) {
  const abgemeldet = stand.abgemeldet || [];
  if (!stand.offen.length && !stand.erledigt.length && !abgemeldet.length) return '';
  const t = heuteDaten.musterTexte;
  const texte = t?.verfuegbar ? t.texte : null;
  const automatisch = Boolean(t?.versand?.eingerichtet);
  const lesend = istNurLesend();
  // Fehlt die Vorlage, geht es trotzdem: Liste und Knopf funktionieren, nur ohne Textvorschlag.
  const hinweis = stand.offen.length && t && !t.verfuegbar ? `<p class="heute-hinweis">Ohne Textvorschlag: ${esc(t.hinweis || 'Textvorlage nicht geladen.')}</p>` : '';
  return `<section class="heute-block heute-mn" aria-labelledby="heuteMuster">
    <div class="heute-block-kopf"><h2 id="heuteMuster">Muster nachfassen</h2><span>${stand.offen.length ? `${plural(stand.offen.length, 'Kunde', 'Kunden')} offen` : 'alles nachgefasst'}</span></div>
    <p class="heute-mn-regel">Erste E-Mail ab ${ERSTE_NACH_TAGEN} Tagen nach dem Versand, höchstens eine Erinnerung ${ERINNERUNG_NACH_TAGEN} Tage danach. Anrufen nur bei Rückrufwunsch.</p>
    ${versandZeile(t?.versand, stand.offen.length)}
    ${stand.offen.length ? `<div class="heute-mn-liste">${stand.offen.map((e, i) => zeile(e, texte, lesend, i === 0, automatisch)).join('')}</div>` : ''}
    ${hinweis}
    ${abgemeldet.length ? `<div class="heute-mn-erledigt"><p class="heute-mn-unter">Abgemeldet</p>${abgemeldet.map(abgemeldetZeile).join('')}</div>` : ''}
    ${stand.erledigt.length ? `<div class="heute-mn-erledigt"><p class="heute-mn-unter">Erledigt in den letzten Tagen</p>${stand.erledigt.map(fertigZeile).join('')}</div>` : ''}
  </section>`;
}

/**
 * Klick "Abgemeldet": Adresse auf die Stoppliste. Der Server antwortet mit dem frischen Stand der
 * Karte (Stoppliste, Versand), damit sie ohne zweiten Abruf neu zeichnet.
 * Gibt true zurueck, wenn der Klick damit erledigt ist.
 */
export function musterNachfassenKlick(e) {
  const knopf = e.target.closest('[data-mn-abmelden]');
  if (!knopf) return false;
  e.preventDefault();
  const { mnAbmelden: email, mnOrder: orderId, mnName: orderName } = knopf.dataset;
  if (!window.confirm(`${email} abmelden? Der Kunde bekommt dann keine Nachfragen mehr – weder automatisch noch per Klick.`)) return true;
  knopf.disabled = true;
  orgSchreiben('/api/kunden/nachfassen-abmelden', { email, orderId, orderName })
    .then((antwort) => {
      if (antwort?.stand) { heuteDaten.musterTexte = antwort.stand; heuteDaten.musterTexteAm = Date.now(); }
      toast(antwort?.neu === false ? 'War schon abgemeldet' : 'Abgemeldet – keine Nachfragen mehr');
      render();
    })
    .catch((err) => { toast(`Nicht gespeichert: ${err.message}`, 'crit'); knopf.disabled = false; });
  return true;
}
