/** Bewusst nur eine fluechtige Vorbereitung: kein Netzaufruf und keine Ablage. */
import { $, esc } from '../../kern/helfer.mjs';
import { GROSSBRIEF, pruefeGrossbrief } from '../../lib/muster-grossbrief.mjs';
import { ABSENDER } from '../../lib/adress-etiketten.mjs';

export function oeffneGrossbriefVorbereitung(kunde) {
  const felder = [['gramm', 'Gewicht (g)'], ['dickeMm', 'Dicke (mm)'], ['laengeMm', 'Länge (mm)'], ['breiteMm', 'Breite (mm)']];
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-close-dialog><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="gbTitel" data-dialog>
    <h2 id="gbTitel">Großbrief vorbereiten</h2>
    <p>${esc(kunde.bestellungen.map(b => b.orderName).join(' · '))}</p>
    <p class="small muted">${ABSENDER.map(esc).join('<br>')}</p>
    <p>${kunde.adressAufkleber.empfaenger.map(z => esc(z.text)).join('<br>')}</p>
    <p><strong>Großbrief Inland · ${GROSSBRIEF.preis}</strong><br><span class="small">Bis 500 g, 20 mm dick, 353 × 250 mm. Preisstand bis 31.12.2026; vor dem Portokauf erneut prüfen.</span></p>
    <p>Den fertig gepackten Umschlag inklusive Verpackung wiegen und messen.</p>
    ${felder.map(([name, label]) => `<div class="field"><label for="gb-${name}">${label}</label><input id="gb-${name}" name="${name}" type="text" inputmode="decimal" autocomplete="off" maxlength="12"></div>`).join('')}
    <div class="field"><label><input type="checkbox" name="vorOrt"> Alle enthaltenen Muster liegen vor Ort. Direktversand ist geprüft; es wird nichts doppelt verschickt.</label></div>
    <div data-gb-ergebnis role="status" aria-live="polite"></div>
    <p class="small muted">Nur Vorschau. Eingaben werden beim Schließen verworfen. Es wird kein Porto gekauft, nichts als versendet gebucht und keine Nachricht verschickt.</p>
    <div class="actions"><button type="button" class="btn" data-close-dialog>Schließen</button><button type="submit" class="btn btn-primary">Angaben prüfen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  const ausgabe = form.querySelector('[data-gb-ergebnis]');
  // Aenderungen machen das vorherige Pruefergebnis sofort ungueltig.
  form.addEventListener('input', () => { ausgabe.textContent = ''; });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    const r = pruefeGrossbrief(kunde, { ...Object.fromEntries(fd), vorOrt: fd.get('vorOrt') === 'on' });
    ausgabe.innerHTML = r.passt
      ? '<p class="notice">Die Angaben passen als Großbrief. Porto ist noch nicht gekauft; der Umschlag ist noch nicht als versendet gebucht.</p>'
      : `<ul class="missing">${r.fehlt.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`;
  });
  form.querySelector('input')?.focus();
}
