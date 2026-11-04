/**
 * Packstation: "Kunde informieren…" bei gesperrten Mustern (w-210; Inhaber 28.10.: bei nicht
 * lieferbaren Mustern erfaehrt es der Kunde). Der Dialog zeigt den Textvorschlag zum Kopieren und
 * oeffnet das Mailprogramm - gesendet wird hier nichts.
 * Liegt sonst nichts im Umschlag, schliesst er die Bestellung mit dem vorhandenen Schritt "Muster nicht
 * verfuegbar" ab. Sonst nicht: der Schritt gilt fuer die ganze Bestellung und nimmt auch die Muster mit,
 * die noch raus sollen - dann folgt am Muster "Ohne dieses Muster weiter packen".
 */
import { $, esc } from '../../kern/helfer.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { state } from '../../kern/zustand.mjs';
import { musterKurz, fuelleText, mailtoLink, NICHT_VERFUEGBAR_VORLAGE } from '../../lib/muster-nachfassen.mjs';
import { setzeSchritt } from './zeitleiste.mjs';

/** Standtext je Sperre: "im Shop gesperrt" nur, wenn die Sperre dort bestaetigt ist. */
export const GESPERRT_KURZ = Object.freeze({ imShop: 'im Shop gesperrt – kommt nicht', gemeldet: 'als nicht lieferbar gemeldet – kommt nicht' });

let vorlage = null;

/**
 * @param {object} k  Umschlag aus der Packliste
 * @param {{lesend: boolean, danach: () => Promise<void>}} p  `danach` laedt die Packliste neu
 */
export function oeffneKundeInformieren(k, { lesend = false, danach } = {}) {
  const gesperrte = k.muster.filter(m => m.gesperrt);
  if (!gesperrte.length) return;
  const farben = musterKurz(gesperrte.map(m => ({ istMuster: true, titel: m.bestellt.titel, farbe: m.bestellt.farbe })));
  const mail = () => fuelleText(vorlage || NICHT_VERFUEGBAR_VORLAGE, { kundenname: k.name, absender: state.session?.benutzer?.name || null, farben }) || {};
  const alleGesperrt = gesperrte.length === k.muster.length;
  const erste = mail();
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="mpInfoTitel" data-dialog>
    <h2 id="mpInfoTitel">Kunde informieren · ${esc(k.name)}</h2>
    <p>${esc(gesperrte.length === 1 ? 'Dieses Muster kommt nicht' : 'Diese Muster kommen nicht')}: ${esc(farben.join('; '))}. Gesendet wird hier nichts: Text kopieren oder im Mailprogramm öffnen.</p>
    <p class="small"><span class="muted">Betreff:</span> <span data-mp-info-betreff>${esc(erste.betreff || '')}</span></p>
    <label class="visually-hidden" for="mpInfoText">Text der E-Mail</label>
    <textarea id="mpInfoText" readonly rows="9">${esc(erste.text || '')}</textarea>
    <div class="zl-nv-knoepfe"><button type="button" class="btn btn-sm" data-kopieren="mpInfoText">Text kopieren</button>
      ${k.email ? `<a class="btn btn-sm" data-mp-info-mailto href="${esc(mailtoLink(k.email, erste))}">E-Mail öffnen</a>` : '<span class="small muted">Keine E-Mail-Adresse hinterlegt.</span>'}</div>
    <p class="small muted">${alleGesperrt
    ? `Danach abschließen: ${esc(k.bestellungen.map(b => b.orderName).join(', '))} ${k.bestellungen.length === 1 ? 'gilt' : 'gelten'} dann als „Muster nicht verfügbar“ und ${k.bestellungen.length === 1 ? 'verschwindet' : 'verschwinden'} aus der Packstation.`
    : 'Die übrigen Muster bleiben im Umschlag. Danach am gesperrten Muster „Ohne dieses Muster weiter packen“ wählen.'}</p>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Schließen</button>${alleGesperrt && !lesend ? '<button type="submit" class="btn btn-primary">Kunde ist informiert – abschließen</button>' : ''}</div>
  </form></div>`;
  const form = $('#dialogRoot form');
  form.querySelector('[data-kopieren]')?.focus();
  const aktualisiere = () => {
    const m = mail();
    form.querySelector('#mpInfoText').value = m.text || '';
    form.querySelector('[data-mp-info-betreff]').textContent = m.betreff || '';
    const link = form.querySelector('[data-mp-info-mailto]');
    if (link) link.href = mailtoLink(k.email, m);
  };
  if (!vorlage) {
    fetchEinkauf('/api/kunden/muster-texte').then(d => {
      if (d?.nichtVerfuegbar?.text) { vorlage = d.nichtVerfuegbar; if (form.isConnected) aktualisiere(); }
    }).catch(() => { /* eingebauter Vorschlag bleibt */ });
  }
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!alleGesperrt || lesend) return;
    const knopf = form.querySelector('[type=submit]');
    knopf.disabled = true;
    let alleOk = true;
    for (const b of k.bestellungen) {
      const muster = gesperrte.filter(m => m.orderId === b.orderId).map(m => m.lineItemId);
      // eslint-disable-next-line no-await-in-loop -- je Bestellung nacheinander, der erste Fehler bricht ab.
      alleOk = await setzeSchritt(b.orderId, 'muster_nicht_verfuegbar', { muster });
      if (!alleOk) break;
    }
    if (alleOk) $('#dialogRoot').innerHTML = ''; else knopf.disabled = false;
    await danach?.();
  });
}
