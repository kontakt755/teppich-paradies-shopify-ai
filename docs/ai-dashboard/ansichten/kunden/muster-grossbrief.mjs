/** Zentral gespeicherte Messwerte; keine Porto- oder Versand-Anbindung. */
import { $, esc, toast } from '../../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../../kern/api.mjs';
import { istNurLesend } from '../../kern/sitzung.mjs';
import { GROSSBRIEF, pruefeGrossbrief } from '../../lib/muster-grossbrief.mjs';
import { state } from '../../kern/zustand.mjs';
import { ABSENDER } from '../../lib/adress-etiketten.mjs';

let oeffnung = 0;
export async function oeffneGrossbriefVorbereitung(kunde) {
  const ticket = ++oeffnung;
  const route = state.route;
  // Auch beim zweiten Oeffnen frischen Stand holen, nicht den alten Seiten-Cache verwenden.
  const frisch = await fetchEinkauf('/api/kunden/muster-packen');
  if (ticket !== oeffnung || state.route !== route) return;
  const aktuell = frisch.kunden?.find(k => k.packSchluessel === kunde.packSchluessel);
  if (!aktuell?.grossbrief || frisch.fehler) { toast(frisch.hinweis || 'Vorbereitung nicht verfügbar. Bitte die Liste neu laden.', 'warn'); return; }
  kunde = aktuell;
  let stand = kunde.grossbrief;
  const lesend = istNurLesend();
  const felder = [['gramm', 'Gewicht (g)'], ['dickeMm', 'Dicke (mm)'], ['laengeMm', 'Länge (mm)'], ['breiteMm', 'Breite (mm)']];
  $('#dialogRoot').innerHTML = `<div class="dialog-backdrop" data-gb-hintergrund><form class="dialog" role="dialog" aria-modal="true" aria-labelledby="gbTitel" data-dialog>
    <h2 id="gbTitel">Großbrief vorbereiten</h2>
    <p>${esc(kunde.bestellungen.map(b => b.orderName).join(' · '))}</p>
    <p class="small muted">${ABSENDER.map(esc).join('<br>')}</p>
    <p>${kunde.adressAufkleber.empfaenger.map(z => esc(z.text)).join('<br>')}</p>
    <p><strong>Großbrief Inland · ${GROSSBRIEF.preis}</strong><br><span class="small">Bis 500 g, 20 mm dick, 353 × 250 mm. Preisstand bis 31.12.2026; vor dem Portokauf erneut prüfen.</span></p>
    <p>Den fertig gepackten Umschlag inklusive Verpackung wiegen und messen.</p>
    ${felder.map(([name, label]) => `<div class="field"><label for="gb-${name}">${label}</label><input id="gb-${name}" name="${name}" type="text" inputmode="decimal" autocomplete="off" maxlength="12" value="${esc(stand.messung[name])}"${lesend ? ' readonly' : ''}></div>`).join('')}
    <p class="small muted" data-gb-speicher role="status" aria-live="polite">${lesend ? 'Nur ansehen.' : stand.version ? 'Gespeicherte Messwerte geladen.' : 'Gewicht und Maße werden automatisch gespeichert.'}</p>
    <button type="button" class="btn btn-sm" data-gb-neu hidden title="Eigene ungespeicherte Eingaben werden verworfen.">Gespeicherten Stand neu laden</button>
    <div class="field"><label><input type="checkbox" name="vorOrt"> Alle enthaltenen Muster liegen vor Ort. Direktversand ist geprüft; es wird nichts doppelt verschickt.</label></div>
    <div data-gb-ergebnis role="status" aria-live="polite"></div>
    <p class="small muted">Gewicht und Maße bleiben für diesen Umschlag erhalten. Den Bestand bei jedem Öffnen neu bestätigen. Es wird kein Porto gekauft, nichts als versendet gebucht und keine Nachricht verschickt.</p>
    <div class="actions"><button type="button" class="btn" data-gb-schliessen>Schließen</button><button type="submit" class="btn btn-primary">Angaben prüfen</button></div>
  </form></div>`;
  const form = $('#dialogRoot form');
  const backdrop = form.parentElement;
  const ausgabe = form.querySelector('[data-gb-ergebnis]');
  const meldung = form.querySelector('[data-gb-speicher]');
  const neu = form.querySelector('[data-gb-neu]');
  neu.addEventListener('click', () => { void oeffneGrossbriefVorbereitung(kunde); });
  const lesen = () => Object.fromEntries(felder.map(([name]) => [name, form.elements.namedItem(name).value]));
  let gespeichert = JSON.stringify(stand.messung);
  let lauf = null;
  let gewuenscht = stand.messung;
  // Pro Dialog nur ein laufender Schreibvorgang: neu getippte Werte folgen danach. Versionen
  // verhindern, dass ein zweiter Arbeitsplatz zwischenzeitliche Messungen ueberschreibt.
  function speichern() {
    if (lesend) return Promise.resolve(true);
    gewuenscht = lesen();
    if (lauf) return lauf;
    lauf = (async () => {
      while (true) {
        const messung = { ...gewuenscht };
        if (JSON.stringify(messung) === gespeichert) return true;
        meldung.textContent = 'Wird gespeichert …';
        const r = await orgSchreiben('/api/kunden/muster-packen', { aktion: 'grossbrief', packSchluessel: kunde.packSchluessel, kontext: stand.kontext, version: stand.version, messung });
        stand = r.grossbrief;
        gespeichert = JSON.stringify(messung);
        meldung.textContent = 'Gewicht und Maße gespeichert.';
      }
    })().catch(e => { meldung.textContent = `Nicht gespeichert: ${e.message} Die Eingaben bleiben hier stehen. Beim Neuladen werden eigene ungespeicherte Eingaben verworfen.`; neu.hidden = false; return false; }).finally(() => { lauf = null; });
    return lauf;
  }
  async function schliessen() {
    if (await speichern()) { if (form.isConnected) backdrop.remove(); }
  }
  // Vor Schliessen/ESC/Hintergrundklick ausstehende Werte speichern. Bei Fehler bleibt der
  // Dialog offen, statt die Eingaben als vermeintlich gespeichert zu verlieren.
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop || e.target.closest('[data-gb-schliessen]')) { e.preventDefault(); e.stopPropagation(); void schliessen(); }
  });
  backdrop.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); void schliessen(); }
  });
  form.addEventListener('input', () => { ausgabe.textContent = ''; void speichern(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!await speichern() || !form.isConnected) return;
    const fd = new FormData(form);
    const r = pruefeGrossbrief(kunde, { ...Object.fromEntries(fd), vorOrt: fd.get('vorOrt') === 'on' });
    ausgabe.innerHTML = r.passt
      ? '<p class="notice">Die Angaben passen als Großbrief. Porto ist noch nicht gekauft; der Umschlag ist noch nicht als versendet gebucht.</p>'
      : `<ul class="missing">${r.fehlt.map(f => `<li>${esc(f)}</li>`).join('')}</ul>`;
  });
  form.querySelector('input')?.focus();
}
