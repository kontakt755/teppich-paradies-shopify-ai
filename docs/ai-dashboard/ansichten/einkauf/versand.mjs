/**
 * Dialog "An Kunden raus": welche Artikel sind im Paket, Sendungsnummer, Versandmail.
 *
 * Seit 2026-10-13 bucht "raus" die Sendung in Shopify, und Shopify schickt dem Kunden die
 * Versandmail (Inhaber, Werkbank w-079). Deshalb ist "raus" kein Ein-Klick-Schritt mehr: der
 * Dialog zeigt, was gebucht wird, und laesst einzelne Artikel weg (Teillieferung). Geoeffnet
 * aus dem Einkauf (Knopf an einer Position) und aus der Zeitleiste (Knopf am Auftrag, auch auf
 * "Heute"). Gebucht wird serverseitig (POST /api/einkauf/auftragsstatus, aktion "schritt");
 * Regeln ohne DOM in lib/versand.mjs.
 */
import { $, esc, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { einkauf, kundeUndOrt, ladeStandNeu } from './auftragsfluss.mjs';
import { VERSANDDIENSTE, versandKandidaten, vorauswahl, versandRueckmeldung, istUebergabe } from '../../lib/versand.mjs';

// Zuletzt gewaehlter Versanddienst je Geraet - im Laden ist es fast immer derselbe.
const DIENST_SCHLUESSEL = 'tp-versanddienst';
function letzterDienst() {
  try { return localStorage.getItem(DIENST_SCHLUESSEL) || ''; } catch { return ''; }
}
function merkeDienst(dienst) {
  try { if (dienst) localStorage.setItem(DIENST_SCHLUESSEL, dienst); } catch { /* ohne Speicher eben ohne Vorschlag */ }
}

const gesetzt = v => v !== null && v !== undefined && v !== '' && v !== '–';

function artikelText(p) {
  const menge = p.kundenmenge || '';
  return `${p.titel || 'Artikel'}${gesetzt(p.farbe) ? ` · ${p.farbe}` : ''}${menge ? ` (${menge})` : ''}${p.eigenleistung ? ' – Eigenleistung' : ''}`;
}

/**
 * Oeffnet den Dialog fuer einen Auftrag.
 * @param {string} orderId
 * @param {object} [opt]
 * @param {string} [opt.lineItemId]  angeklickte Position (Einkauf) - sonst ganzer Auftrag
 * @param {string} [opt.notiz]       aus "Etwas anderes ist passiert ..." mitgebracht
 */
export async function oeffneVersandDialog(orderId, { lineItemId = null, notiz = null } = {}) {
  if (istNurLesend()) { toast('Rolle "lesen" darf keine Aenderungen vornehmen.', 'crit'); return; }
  // Stand und Positionen koennen fehlen, wenn der Klick von "Heute" kommt.
  if (!einkauf.auftragsstatus?.positionen) {
    const d = await fetchEinkauf('/api/einkauf/auftragsstatus');
    if (d?.verfuegbar) einkauf.auftragsstatus = d;
  }
  let info = kundeUndOrt(orderId);
  if (!info.auftrag) {
    const d = await fetchEinkauf('/api/einkauf/bestellungen');
    if (d?.verfuegbar) { einkauf.bestellungen = d; info = kundeUndOrt(orderId); }
  }
  const { name, ort, auftrag } = info;
  const kandidaten = auftrag ? versandKandidaten(auftrag, einkauf.auftragsstatus?.positionen || {}) : [];
  // Nichts mehr offen (laut geladenem Stand): kein Buchen-Knopf - sonst setzte der Server "erledigt"
  // still zurueck auf "raus". Mit angeklickter Position bleibt es bei genau dieser einen.
  const nichtsOffen = Boolean(auftrag) && !kandidaten.length && !lineItemId;
  const geklickt = kandidaten.find(p => p.lineItemId === lineItemId) || null;
  // Angeklickt, aber nicht unter den offenen Artikeln (Stand im Browser veraltet): dann genau
  // diese eine Position - nie eine andere und nie die ganze Bestellung.
  const nurGeklickt = Boolean(lineItemId) && !geklickt;
  const position = nurGeklickt ? (auftrag?.positionen || []).find(p => p.lineItemId === lineItemId) || null : null;
  const vor = vorauswahl(kandidaten, { geklickt: geklickt?.lineItemId || null });
  // Muster, die jemand persoenlich vorbeibringt: keine Sendungsnummer, Mail vorab aus.
  const uebergabe = istUebergabe(geklickt ? [geklickt] : position ? [position] : kandidaten);
  // Abholung im Laden: Mail vorab aus (eine Mail "ist unterwegs" passt nicht).
  const abholung = /abhol|pick.?up|selbst/i.test(String(auftrag?.details?.versandart || ''));
  const dienst = letzterDienst();
  const liste = nurGeklickt
    ? `<p class="small">${esc(position ? artikelText(position) : 'Dieser Artikel')}</p>`
    : kandidaten.length > 1
    ? `<fieldset class="zl-wahl"><legend>Was ist in diesem Paket?</legend>
        ${kandidaten.map(p => `<label><input type="checkbox" name="pos" value="${esc(p.lineItemId)}"${vor.has(p.lineItemId) ? ' checked' : ''}> ${esc(artikelText(p))}</label>`).join('')}
      </fieldset>`
    : kandidaten.length === 1 ? `<p class="small">${esc(artikelText(kandidaten[0]))}</p>`
      // Stand unbekannt (Bestellung nicht geladen): der Server nimmt alles, was noch nicht raus ist.
      : nichtsOffen ? '<p class="small muted">Alle Artikel sind schon als raus eingetragen – hier ist nichts mehr zu buchen.</p>'
        : '<p class="small muted">Alle Artikel dieser Bestellung, die noch nicht raus sind.</p>';
  const sendung = uebergabe ? '' : `<div class="vs-sendung">
      <div class="field"><label for="vsNummer">Sendungsnummer (optional)</label><input id="vsNummer" name="nummer" autocomplete="off" maxlength="60" placeholder="vom Paketaufkleber"></div>
      <div class="field"><label for="vsDienst">Versanddienst</label><select id="vsDienst" name="dienst"><option value="">–</option>${VERSANDDIENSTE.map(d => `<option${d === dienst ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
    </div>`;
  const wort = uebergabe ? 'übergeben' : 'verschickt';
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="vsTitel" data-dialog>
    <h2 id="vsTitel">${uebergabe ? 'Übergeben' : 'An Kunden raus'}${auftrag?.name ? ` · ${esc(auftrag.name)}` : ''}</h2>
    ${name || ort ? `<p class="small muted">${esc([name, ort].filter(Boolean).join(' · '))}</p>` : ''}
    ${liste}
    ${nichtsOffen ? '' : `${sendung}
    <fieldset class="zl-wahl"><label><input type="checkbox" name="mail"${uebergabe || abholung ? '' : ' checked'}> Kunde bekommt die Versandmail von Shopify</label></fieldset>
    <p class="small muted">Die Artikel werden in Shopify als versendet gebucht.</p>`}
    <div class="actions"><button type="button" class="btn" data-close-dialog>${nichtsOffen ? 'Schließen' : 'Abbrechen'}</button>${nichtsOffen ? '' : `<button type="submit" class="btn btn-primary">Als ${wort} buchen</button>`}</div>
  </form></div>`;
  const form = $('#dialogRoot form');
  (form.querySelector('#vsNummer') || form.querySelector('[type=submit]') || form.querySelector('[data-close-dialog].btn'))?.focus();
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const daten = new FormData(form);
    if (nichtsOffen) return;
    // Angeklickte Position, die im geladenen Stand fehlt: genau diese eine, nie die ganze Bestellung.
    const ids = nurGeklickt ? [lineItemId] : kandidaten.length > 1 ? daten.getAll('pos').map(String) : kandidaten.length === 1 ? [kandidaten[0].lineItemId] : null;
    if (ids && !ids.length) { toast('Bitte mindestens einen Artikel ankreuzen.', 'warn'); return; }
    const nummer = String(daten.get('nummer') || '').trim();
    const gewaehlt = String(daten.get('dienst') || '');
    const rumpf = { aktion: 'schritt', orderId, schritt: 'raus', notiz: notiz || null,
      versand: { sendungsnummer: nummer || null, versanddienst: nummer ? gewaehlt || null : null, benachrichtigen: daten.get('mail') === 'on' } };
    if (ids) rumpf.lineItemIds = ids;
    const knopf = form.querySelector('[type=submit]');
    const text = knopf.textContent;
    knopf.disabled = true;
    knopf.textContent = 'Wird gebucht …';
    let antwort;
    try {
      antwort = await orgSchreiben('/api/einkauf/auftragsstatus', rumpf);
    } catch (e) {
      // Der Server setzt erst den Schritt und bucht dann; ohne Antwort ist beides offen.
      toast(`Nicht gespeichert: ${e.message}`, 'crit');
      knopf.disabled = false;
      knopf.textContent = text;
      return;
    }
    $('#dialogRoot').innerHTML = '';
    if (nummer) merkeDienst(gewaehlt);
    const r = versandRueckmeldung(`Als ${wort} eingetragen`, antwort.shopify);
    toast(r.text, r.ton, { dauer: r.ton ? 9000 : 5000 });
    await ladeStandNeu();
  });
}

/** Misslungene Versandbuchung nachholen (Knopf an Zeitleiste bzw. Einkaufsposition). */
async function nachholen(knopf) {
  if (istNurLesend()) return;
  knopf.disabled = true;
  try {
    const j = await orgSchreiben('/api/einkauf/auftragsstatus', { aktion: 'versandNachholen', orderId: knopf.dataset.versandNachholen });
    const ok = ['gebucht', 'bereits'].includes(j.shopify?.status);
    toast(j.shopify?.meldung || 'Erledigt', ok ? '' : 'crit', { dauer: ok ? 5000 : 9000 });
  } catch (e) {
    toast(`Nicht nachgeholt: ${e.message}`, 'crit');
  }
  await ladeStandNeu();
}

/**
 * Klicks dieses Moduls: "Als raus zum Kunden markieren"/"Als verschickt markieren" an einer
 * Einkaufsposition oeffnet den Dialog (vor einkaufKlickStatus verteilt), "Nachholen" bucht neu.
 * Gibt true zurueck, wenn der Klick damit erledigt ist.
 */
export function versandKlick(e) {
  const knopf = e.target.closest('[data-versand-nachholen]');
  if (knopf) { e.preventDefault(); nachholen(knopf); return true; }
  const raus = e.target.closest('[data-af-set][data-af-status="raus"]');
  if (raus) { e.preventDefault(); oeffneVersandDialog(raus.dataset.afOrder, { lineItemId: raus.dataset.afItem || null }); return true; }
  return false;
}
