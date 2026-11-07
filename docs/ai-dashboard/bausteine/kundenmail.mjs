/**
 * Rueckfrage "Kunde per Mail informieren" beim Abschliessen (Inhaber 07.11.2026, w-276).
 *
 * "Erledigt", "Abschließen", "Kunde fertig" und "Ohne Einkauf abschließen" buchen den Versand in
 * Shopify ohne Mail an den Kunden (Inhaber 2026-10-19). Geht Ware aber von vor "raus" direkt auf
 * "Erledigt", hat der Kunde nie eine Versandmail bekommen. Dann fragt der Klick zurueck, mit der
 * Option vorab angehakt - die Mail ist dieselbe Versandmail von Shopify wie bei "raus". Abhaken
 * heisst: ohne Mail wie bisher. Muster bleiben immer ohne Mail.
 *
 * Welche Positionen das betrifft, rechnet lib/versand.mjs (kundenmailKandidaten) - dieselbe Regel
 * prueft der Server noch einmal, bevor er `kundeInformieren` annimmt.
 */
import { $, esc } from '../kern/helfer.mjs';

const gesetzt = v => v !== null && v !== undefined && v !== '' && v !== '–' && v !== 'UNGEKLAERT' && v !== 'Default Title';
const artikel = p => [p.titel || 'Artikel', gesetzt(p.farbe) ? p.farbe : null].filter(Boolean).join(' · ');

/**
 * Das Kaestchen als Teil eines Dialogs. Leer, wenn keine Ware betroffen ist.
 * @param {object[]} kandidaten  kundenmailKandidaten(...)
 * @param {{versteckt?: boolean}} [opt]  versteckt: erst sichtbar, wenn "Erledigt" gewaehlt ist
 */
export function kundenmailFeld(kandidaten, { versteckt = false } = {}) {
  if (!kandidaten?.length) return '';
  return `<fieldset class="zl-wahl kundenmail" data-kundenmail${versteckt ? ' hidden' : ''}>
    <label><input type="checkbox" name="kundenmail" checked> Kunde per Mail informieren (Versandmail von Shopify)</label>
    <p class="small muted">Noch nicht als „raus“ eingetragen: ${esc(kandidaten.map(artikel).join(', '))}. Ohne Haken wird in Shopify ohne Mail gebucht, wie bisher.</p>
  </fieldset>`;
}

/** Ist das (sichtbare) Kaestchen angehakt? Ohne Kaestchen: false. */
export function kundenmailGewaehlt(form) {
  const feld = form?.querySelector('[data-kundenmail]');
  return Boolean(feld && !feld.hidden && feld.querySelector('input[name=kundenmail]')?.checked);
}

/**
 * Eigener Dialog statt window.confirm (das kennt kein Kaestchen).
 * @returns {Promise<boolean|null>} true = mit Mail, false = ohne Mail, null = abgebrochen (Abbrechen, Esc, Hintergrund)
 */
export function kundenmailFrage({ titel, text, kandidaten, knopf = 'Abschließen' }) {
  return new Promise((fertig) => {
    const root = $('#dialogRoot');
    root.innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="kmTitel" data-dialog>
      <h2 id="kmTitel">${esc(titel)}</h2>
      ${text ? `<p>${esc(text)}</p>` : ''}
      ${kundenmailFeld(kandidaten)}
      <div class="actions"><button type="button" class="btn" data-close-dialog>Abbrechen</button><button type="submit" class="btn btn-primary">${esc(knopf)}</button></div>
    </form></div>`;
    const form = root.querySelector('form');
    let beantwortet = false;
    // Abbrechen, Esc und Hintergrund leeren #dialogRoot (ereignisse.mjs) - dann gilt "abgebrochen".
    const beobachter = new MutationObserver(() => {
      if (form.isConnected || beantwortet) return;
      beobachter.disconnect();
      fertig(null);
    });
    beobachter.observe(root, { childList: true });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      beantwortet = true;
      beobachter.disconnect();
      const mail = kundenmailGewaehlt(form);
      root.innerHTML = '';
      fertig(mail);
    });
    form.querySelector('[type=submit]')?.focus();
  });
}
