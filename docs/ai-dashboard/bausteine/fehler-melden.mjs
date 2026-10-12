/**
 * "Fehler melden": Dialog von jeder Seite aus (Seitenleiste, Hilfe, Befehlspalette).
 *
 * Bisher hiess es "bei Ahmet melden" - per Zuruf, ohne Seite, ohne Uhrzeit,
 * ohne Rueckmeldung. Jetzt landet die Meldung im Privatordner des Servers,
 * ein geplanter Lauf traegt sie als "Fehler, muss behoben werden" in die
 * Werkbank der Technik ein und meldet "behoben" hierher zurueck. Der Melder
 * sieht den Stand unter dem Formular.
 *
 * Damit die Technik den Fehler nachstellen kann, gehen Seite, Adresse,
 * Browser, Bildschirmbreite und die letzten Fehler im Browser automatisch mit.
 */
import { $, esc, toast, fmtDateTime } from '../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../kern/api.mjs';

// Die letzten Stoerungen im Browser - JS-Fehler und gescheiterte API-Aufrufe
// (kern/api.mjs meldet sie als Ereignis "tp-api-fehler"). Wer "geht nicht"
// meldet, hat die eigentliche Meldung meist nie gesehen.
const letzteFehler = [];
function merkeFehler(text) {
  if (!text) return;
  letzteFehler.push(`${new Date().toLocaleTimeString('de-DE')} ${String(text).slice(0, 300)}`);
  if (letzteFehler.length > 3) letzteFehler.shift();
}
if (typeof window !== 'undefined') {
  window.addEventListener('error', e => {
    const ort = e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '';
    merkeFehler(`${e.message || 'Fehler'}${ort}`);
  });
  window.addEventListener('unhandledrejection', e => merkeFehler(`Promise: ${e.reason?.message || e.reason}`));
  window.addEventListener('tp-api-fehler', e => merkeFehler(e.detail));
}

const STATUS_KLASSE = { neu: 'level-achtung', uebernommen: 'status in-arbeit', behoben: 'ok', verworfen: 'plain' };

function aktuelleSeite() {
  return ($('#seitentitel')?.textContent || document.title.split(' · ')[0] || '').trim();
}

function listeHtml(d) {
  if (!d) return '<p class="small muted">Lade deine Meldungen …</p>';
  if (d.fehler) return `<p class="small muted">${esc(d.hinweis || 'Meldungen konnten nicht geladen werden.')}</p>`;
  if (!d.meldungen?.length) return '';
  return `<h3 class="small" style="margin:6px 0 0">${d.alle ? 'Alle Meldungen' : 'Deine Meldungen'}</h3>
    <div class="rows">${d.meldungen.slice(0, 8).map(m => `<div class="row">
      <div>
        <div class="t"><span class="mono small">${esc(m.id)}</span> ${esc(m.text.split('\n')[0].slice(0, 90))}</div>
        <div class="m">${esc(fmtDateTime(m.erstelltAm))}${d.alle && m.von ? ` · ${esc(m.von)}` : ''}${m.ort ? ` · ${esc(m.ort)}` : ''}${m.dringend ? ' · blockiert die Arbeit' : ''}</div>
        ${m.ergebnis ? `<div class="m">→ ${esc(m.ergebnis)}</div>` : ''}
      </div>
      <div class="r"><span class="badge ${STATUS_KLASSE[m.status] || 'plain'}">${esc(m.statusLabel || m.status)}</span></div>
    </div>`).join('')}</div>`;
}

export function openFehlerMelden() {
  const root = $('#dialogRoot');
  const seite = aktuelleSeite();
  root.innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="fmTitel">
    <form id="fmForm" novalidate style="display:flex;flex-direction:column;gap:10px">
      <h2 id="fmTitel">Fehler melden</h2>
      <p class="small muted">Etwas geht nicht oder zeigt Falsches? Kurz beschreiben – die Meldung geht direkt an die Technik und wird als wichtig behandelt.</p>
      <label class="small" for="fmText">Was ist passiert?</label>
      <textarea id="fmText" rows="4" maxlength="2000" required placeholder="z. B. Bei „→ Bestellt“ passiert nichts, die Bestellung bleibt rot."></textarea>
      <label class="small" for="fmOrt">Wo?</label>
      <input type="text" id="fmOrt" maxlength="120" value="${esc(seite)}" placeholder="Seite oder Bereich, z. B. Einkauf">
      <label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="fmDringend"> Ich komme deswegen gerade nicht weiter</label>
      <p class="small muted">Bestellnummern helfen. Passwörter nie eintragen.</p>
      <div class="dialog-actions">
        <button type="button" class="btn" data-close-dialog>Abbrechen</button>
        <button type="submit" class="btn btn-primary" id="fmSenden">Fehler melden</button>
      </div>
    </form>
    <div id="fmListe">${listeHtml(null)}</div>
  </div></div>`;
  $('#fmText')?.focus();

  fetchEinkauf('/api/fehler/liste').then(d => {
    const ziel = $('#fmListe');
    if (ziel) ziel.innerHTML = listeHtml(d);
  });

  // Am Formular binden, nicht an #dialogRoot: das Formular entsteht bei jedem
  // Oeffnen neu, #dialogRoot bleibt - sonst haengen nach dem zweiten Oeffnen
  // zwei Zuhoerer daran (siehe openMeinPasswort).
  $('#fmForm').addEventListener('submit', async e => {
    e.preventDefault();
    const text = $('#fmText').value.trim();
    if (text.length < 5) { toast('Bitte kurz beschreiben, was passiert ist.', 'crit'); $('#fmText').focus(); return; }
    const knopf = $('#fmSenden');
    knopf.disabled = true;
    knopf.textContent = 'Wird gemeldet …';
    try {
      const r = await orgSchreiben('/api/fehler/melden', {
        text,
        ort: $('#fmOrt').value.trim(),
        dringend: $('#fmDringend').checked,
        technik: {
          adresse: location.hash || '#/',
          browser: navigator.userAgent,
          breite: window.innerWidth,
          fehler: [...letzteFehler],
        },
      });
      root.innerHTML = '';
      toast(r.doppelt ? `Schon gemeldet als ${r.id} – danke.` : `Danke – Fehler gemeldet (${r.id}). Den Stand siehst du hier unter „Fehler melden“.`);
    } catch (err) {
      knopf.disabled = false;
      knopf.textContent = 'Fehler melden';
      toast(`Melden hat nicht geklappt: ${err.message}`, 'crit');
    }
  });
}
