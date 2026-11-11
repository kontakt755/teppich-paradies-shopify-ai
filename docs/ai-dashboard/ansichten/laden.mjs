/**
 * Ansicht "Laden" (#/laden): abgespeckte Vollbild-Ansicht fuer den Ladenrechner.
 *
 * Zwei Spalten, links "Mails", rechts "Zu tun". Je Spalte oben, was noch niemand uebernommen hat
 * (rot und aelteste zuerst), darunter eingeklappt "Jemand kuemmert sich". Ganz oben hoechstens eine
 * rote Zeile, wenn Offenes zu lange liegt. Kein Menue: beim Betreten blendet die Klasse `nur-laden`
 * am body Seitenleiste, Tab-Leiste und Kopfzeile aus (stile/laden.css), beim Verlassen wieder ein.
 *
 * Es gibt keinen Login je Person: "Uebernehmen" fragt "Wer?" und zeigt je Name einen Knopf (Namen aus
 * $TP_PRIVAT_DIR/laden-personen.json, nie im Repository). Mails und To-dos teilen sich EINEN Zeilen-
 * Renderer; die Mails kommen aus operations/lib/laden-mails.mjs (nur lesender IMAP-Abruf, Zwischenspeicher).
 * Die Seite laedt alle 3 Minuten neu, solange sie offen ist - ausser jemand waehlt gerade einen Namen
 * oder tippt eine Aufgabe.
 */
import { state } from '../kern/zustand.mjs';
import { esc, toast, since } from '../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../kern/api.mjs';
import { render } from '../kern/render.mjs';
import { istNurLesend } from '../kern/sitzung.mjs';
import { stoerungState } from '../bausteine/karten.mjs';
import { liegtZuLange, teileSpalte } from '../lib/laden.mjs';

const NEU_LADEN_MS = 3 * 60 * 1000;
const ARTEN = ['Rolle schneiden', 'Rechnung kontrollieren', 'Angebot kontrollieren', 'Sonstiges'];

const NACHLADEN_MS = 8 * 1000; // laeuft ein Mail-Abruf, kurz danach noch einmal holen
const laden = { daten: null, laedt: false, timer: null, nachladen: null, wer: null, formOffen: false, offen: {} };

/** Beim Betreten und Verlassen der Route: Kiosk-Klasse, Auffrischen. Aufruf vor dem Zeichnen. */
export function ladenRouteAbgleichen() {
  const an = state.route.view === 'laden';
  document.body.classList.toggle('nur-laden', an);
  if (an && !laden.timer) laden.timer = setInterval(ladenAuffrischen, NEU_LADEN_MS);
  if (!an && laden.timer) {
    clearInterval(laden.timer);
    clearTimeout(laden.nachladen);
    Object.assign(laden, { timer: null, nachladen: null, daten: null, wer: null, formOffen: false });
  }
}

async function holen() {
  laden.laedt = true;
  const d = await fetchEinkauf('/api/laden/uebersicht');
  laden.laedt = false;
  // Wer inzwischen weitergeklickt hat, bekommt keine fremde Ansicht ueberzeichnet.
  if (state.route.view !== 'laden') return;
  merkeAufgeklappt();
  laden.daten = d;
  // Der Abruf laeuft im Server im Hintergrund: sein Ergebnis kommt erst beim naechsten Holen.
  if (d.mails?.laeuft && !laden.nachladen) laden.nachladen = setTimeout(() => { laden.nachladen = null; ladenAuffrischen(); }, NACHLADEN_MS);
  render();
}

function ladenAuffrischen() {
  if (laden.laedt || document.hidden || laden.wer || laden.formOffen) return;
  holen();
}

/** Aufgeklappte Teile ueberleben das Neuzeichnen - sonst klappt alle 3 Minuten alles wieder zu. */
function merkeAufgeklappt() {
  document.querySelectorAll('#main details[data-laden]').forEach(d => { laden.offen[d.dataset.laden] = d.open; });
}

function zeile(e, { lesen }) {
  const meta = [e.art, e.von].filter(Boolean).map(esc).join(' · ');
  const z = e.zustaendig;
  const rechts = z
    ? `<span class="laden-plakette">${esc(z.wer)} kümmert sich · ${esc(since(z.seit))}</span>
       ${lesen ? '' : `<button type="button" class="btn laden-knopf" data-laden-zurueck="${esc(e.schluessel)}">Zurückgeben</button>
       ${e.aufgabeId ? `<button type="button" class="btn laden-knopf" data-laden-erledigt="${esc(e.aufgabeId)}">Erledigt</button>` : ''}`}`
    : `<span class="laden-plakette${e.ton ? ` ${esc(e.ton)}` : ''}">${esc(e.alter || '')}</span>
       ${lesen ? '' : laden.wer === e.schluessel
    ? `<span class="laden-wer"><strong>Wer?</strong>${(laden.daten.personen || []).map(n => `<button type="button" class="btn laden-knopf" data-laden-wer="${esc(n)}" data-schluessel="${esc(e.schluessel)}">${esc(n)}</button>`).join('')}<button type="button" class="btn btn-ghost laden-knopf" data-laden-abbrechen>Abbrechen</button></span>`
    : `<button type="button" class="btn laden-knopf" data-laden-uebernehmen="${esc(e.schluessel)}"${laden.daten.personen ? '' : ' disabled'}>Übernehmen</button>`}`;
  const telefon = e.schluessel.startsWith('mail:') && !lesen ? `<button type="button" class="btn laden-knopf" data-laden-telefonisch="${esc(e.schluessel)}">Telefonisch erledigt</button>` : '';
  return `<li class="laden-zeile${e.ton === 'crit' && e.schluessel.startsWith('mail:') ? ' laden-zeile-rot' : ''}">
    <div class="laden-text"><p class="small muted">${meta}</p><p class="laden-titel">${esc(e.text)}</p>${e.beantwortetAm ? '<p class="small muted">Schon aus dem Hauptpostfach beantwortet</p>' : ''}${e.nurHaken ? '<p class="small muted">Hier zählt nur der Haken: bitte anrufen und danach abhaken.</p>' : ''}</div>
    <div class="laden-rechts">${rechts}${telefon}</div>
  </li>`;
}

function spalte(eintraege, { id, titel, satz, leer, kopf = '', vorspann = '' }, lesen) {
  const { offen, inArbeit } = teileSpalte(eintraege);
  const liste = l => `<ul class="laden-liste">${l.map(e => zeile(e, { lesen })).join('')}</ul>`;
  return `<section class="laden-spalte" aria-labelledby="laden-${id}">
    <div class="laden-spalte-kopf"><h2 id="laden-${id}">${esc(titel)}</h2>${kopf}</div>
    <p class="small muted">${esc(satz)}</p>
    ${vorspann}
    ${offen.length ? liste(offen) : `<p class="laden-leer">${esc(leer)}</p>`}
    ${inArbeit.length ? `<details class="laden-kuemmert" data-laden="${id}"${laden.offen[id] ? ' open' : ''}><summary>Jemand kümmert sich (${inArbeit.length})</summary>${liste(inArbeit)}</details>` : ''}
  </section>`;
}

/**
 * "Ware unterwegs": reine Info (keine Aufgabe, niemand uebernimmt sie), darum eigener Abschnitt unter den Spalten.
 * Leer und eingerichtet = der Abschnitt faellt weg; ohne Lieferantenliste ein Hinweis, nie Beispielzeilen.
 */
function wareAbschnitt(w, lesen) {
  if (!w || (w.eingerichtet && !w.fehler && !w.eintraege.length)) return '';
  const inhalt = !w.eingerichtet ? '<p class="laden-leer">Die Liste der Lieferanten ist noch nicht hinterlegt. Sobald sie steht, erscheint hier, von wem eine Rechnung gekommen ist.</p>'
    : w.fehler ? `<div class="notice warn" role="status">${esc(w.fehler)}</div>`
      : `<ul class="laden-liste">${w.eintraege.map(e => `<li class="laden-zeile">
        <div class="laden-text"><p class="small muted">${esc(e.von)}${e.bezug ? ` · ${esc(e.bezug)}` : ''}</p><p class="laden-titel">${esc(e.text)}</p></div>
        <div class="laden-rechts"><span class="laden-plakette">${esc(e.alter || '')}</span>${lesen ? '' : `<button type="button" class="btn laden-knopf" data-laden-gesehen="${esc(e.schluessel)}">Gesehen</button>`}</div>
      </li>`).join('')}</ul>`;
  return `<section class="laden-spalte laden-ware" aria-labelledby="laden-ware">
    <div class="laden-spalte-kopf"><h2 id="laden-ware">Ware unterwegs</h2></div>
    <p class="small muted">Hier steht, von welchem Lieferanten in den letzten 7 Tagen eine Rechnung gekommen ist. Dann ist die Ware meist schon verladen.${w.stand ? ` Stand: ${esc(since(w.stand))}` : ''}</p>
    ${inhalt}
  </section>`;
}

/** Ein stilles Neuzeichnen (Datenabgleich) soll Getipptes nicht wegnehmen: Werte aus dem alten Formular uebernehmen. */
function aufgabenFormular() {
  const alt = document.querySelector('#main [data-laden-form]')?.elements;
  return `<form class="laden-form" data-laden-form>
    <label>Art<select name="art">${ARTEN.map(a => `<option${alt?.art.value === a ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
    <label>Was ist zu tun?<input type="text" id="ladenText" name="text" maxlength="200" required autocomplete="off" data-focus-erhalten value="${esc(alt?.text.value || '')}"></label>
    <div class="laden-form-knoepfe"><button type="submit" class="btn btn-primary laden-knopf">Speichern</button><button type="button" class="btn laden-knopf" data-laden-abbrechen>Abbrechen</button></div>
  </form>`;
}

export function viewLaden() {
  const d = laden.daten;
  if (!d && !laden.laedt) holen();
  const kopf = `<div class="page-head"><div><h1>Laden</h1></div></div>`;
  if (!d) return `${kopf}<div class="empty">Lade …</div>`;
  if (d.fehler) return kopf + stoerungState(d, 'Die Übersicht für den Laden');
  const lesen = istNurLesend();
  const zuLange = liegtZuLange(d.mails.eintraege, d.todos);
  const mailsLeer = !d.mails.eingerichtet ? 'Das Postfach für den Laden ist noch nicht eingerichtet. Sobald es steht, erscheinen hier die Mails.'
    : d.mails.stand || d.mails.fehler ? 'Keine Mail offen.' : 'Die Mails werden abgerufen …';
  const mailsFehler = d.mails.fehler ? `<div class="notice warn" role="status">${esc(d.mails.fehler)}</div>` : '';
  return `${kopf}
    ${zuLange ? `<div class="notice crit laden-rot" role="status">${esc(zuLange)}</div>` : ''}
    ${d.personen ? '' : `<div class="notice warn">Die Namen für „Übernehmen“ fehlen noch. Der Inhaber muss die Namen der Kolleginnen und Kollegen im Laden einmal hinterlegen (Claude im Chat Bescheid geben: „Laden-Namen eintragen“).</div>`}
    ${d.bestelldatenFehlen ? '<div class="notice warn">Die Bestelldaten fehlen. Rückrufe und wartende Kunden erscheinen erst, wenn sie wieder da sind.</div>' : ''}
    <div class="laden-spalten">
      ${spalte(d.mails.eintraege, { id: 'mails', titel: 'Mails', satz: 'Hier stehen die Mails an den Laden. Wer eine übernimmt, antwortet darauf.', leer: mailsLeer, vorspann: mailsFehler }, lesen)}
      ${spalte(d.todos, {
    id: 'zutun', titel: 'Zu tun', satz: 'Hier stehen Rückrufe, Kunden, die sich nicht melden, und eigene Aufgaben.', leer: 'Nichts offen.',
    kopf: lesen || laden.formOffen ? '' : '<button type="button" class="btn laden-knopf" data-laden-neu>Aufgabe dazu</button>',
    vorspann: laden.formOffen ? aufgabenFormular() : '',
  }, lesen)}
    </div>
    ${wareAbschnitt(d.ware, lesen)}`;
}

async function schreiben(pfad, rumpf, erfolg) {
  try {
    await orgSchreiben(pfad, rumpf);
  } catch (err) {
    // Auswahl und Eingabe bleiben stehen, damit nichts neu getippt werden muss.
    toast(`Fehler: ${err.message}`, 'crit');
    return;
  }
  if (erfolg) toast(erfolg);
  Object.assign(laden, { wer: null, formOffen: false });
  await holen();
}

export function ladenKlick(e) {
  if (state.route.view !== 'laden') return false;
  const t = e.target;
  const von = a => t.closest(`[${a}]`);
  let el;
  if ((el = von('data-laden-uebernehmen'))) { laden.wer = el.dataset.ladenUebernehmen; render(); return true; }
  if ((el = von('data-laden-wer'))) { schreiben('/api/laden/zustaendig', { schluessel: el.dataset.schluessel, wer: el.dataset.ladenWer }); return true; }
  if ((el = von('data-laden-zurueck'))) { schreiben('/api/laden/zustaendig', { schluessel: el.dataset.ladenZurueck, wer: null }); return true; }
  if ((el = von('data-laden-telefonisch'))) { schreiben('/api/laden/telefonisch', { schluessel: el.dataset.ladenTelefonisch, wer: laden.daten?.personen?.length === 1 ? laden.daten.personen[0] : null }, 'Telefonisch erledigt'); return true; }
  // Gleiche Ablage wie "Telefonisch erledigt": der Haken blendet die Zeile nur aus, am Postfach aendert sich nichts.
  if ((el = von('data-laden-gesehen'))) { schreiben('/api/laden/telefonisch', { schluessel: el.dataset.ladenGesehen }, 'Gesehen'); return true; }
  if ((el = von('data-laden-erledigt'))) { schreiben('/api/laden/aufgabe-erledigt', { id: el.dataset.ladenErledigt }, 'Erledigt'); return true; }
  if (von('data-laden-neu')) { Object.assign(laden, { formOffen: true, wer: null }); render(); document.querySelector('#main [data-laden-form] input')?.focus(); return true; }
  if (von('data-laden-abbrechen')) { Object.assign(laden, { wer: null, formOffen: false }); render(); return true; }
  return false;
}

export function ladenAbsenden(e) {
  const form = e.target.closest?.('[data-laden-form]');
  if (!form) return false;
  e.preventDefault();
  schreiben('/api/laden/aufgabe', { art: form.elements.art.value, text: form.elements.text.value }, 'Aufgabe gespeichert');
  return true;
}
