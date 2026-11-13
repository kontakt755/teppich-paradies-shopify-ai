import { $, esc } from '../kern/helfer.mjs';

/** Dialog mit fertigem Text: kopieren oder im Mailprogramm oeffnen - abgeschickt wird nur von Hand. */
export function textDialog({ titel, an, telefon, betreff, text, nachher = '' }) {
  const mailto = an ? `mailto:${encodeURIComponent(an)}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}` : '';
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="abTxtTitel" data-dialog>
    <h2 id="abTxtTitel">${esc(titel)}</h2>
    <p class="small">${an ? `An: <b>${esc(an)}</b>` : '<span class="muted">Keine E-Mail-Adresse hinterlegt – Text kopieren.</span>'}${telefon ? ` · Telefon: <a href="tel:${esc(telefon.replace(/[^\d+]/g, ''))}">${esc(telefon)}</a>` : ''}<br>Betreff: ${esc(betreff)}</p>
    <textarea id="abTxt" class="ab-text-feld" rows="12" readonly>${esc(text)}</textarea>
    <p class="small muted">Es wird nichts automatisch gesendet.</p>
    ${nachher}
    <div class="actions"><button type="button" class="btn" data-close-dialog>Schließen</button>
      <button type="button" class="btn" data-kopieren="abTxt">Text kopieren</button>
      ${mailto ? `<a class="btn btn-primary" href="${esc(mailto)}">Im Mailprogramm öffnen</a>` : ''}</div>
  </div></div>`;
  $('#dialogRoot [data-kopieren]')?.focus();
}
