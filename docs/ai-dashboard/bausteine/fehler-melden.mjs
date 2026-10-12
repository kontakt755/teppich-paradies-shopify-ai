/**
 * "Fehler melden": Dialog von jeder Seite aus (Seitenleiste, Hilfe, Befehlspalette,
 * rote Rueckmeldungen nach einer Stoerung).
 *
 * Bisher hiess es "bei Ahmet melden" - per Zuruf, ohne Seite, ohne Uhrzeit,
 * ohne Rueckmeldung. Jetzt landet die Meldung im Privatordner des Servers,
 * ein geplanter Lauf traegt sie als "Fehler, muss behoben werden" in die
 * Werkbank der Technik ein und meldet den Stand hierher zurueck.
 *
 * Leicht fuer den Melder: ein Textfeld, die Seite steht schon da, ein
 * Bildschirmfoto per Knopf oder Einfuegen (⌘V). Informativ fuer die Technik:
 * Seite, Adresse, Geraet, die letzten Klicks und Stoerungen gehen von selbst
 * mit - und der Melder sieht unter "Was automatisch mitgeht", was das ist.
 */
import { $, esc, toast, fmtDateTime, merkeStoerung } from '../kern/helfer.mjs';
import { fetchEinkauf, orgSchreiben } from '../kern/api.mjs';
import { state } from '../kern/zustand.mjs';
import { alsHochladbar } from './bilder.mjs';

const BILDER_MAX = 3;
const GESEHEN_KEY = 'tp-fehler-gesehen';

// -- Was automatisch mitgeht ---------------------------------------------------

// Die letzten Stoerungen im Browser - JS-Fehler und gescheiterte API-Aufrufe
// (kern/api.mjs meldet sie als Ereignis "tp-api-fehler"). Wer "geht nicht"
// meldet, hat die eigentliche Meldung meist nie gesehen.
const letzteFehler = [];
// Die letzten Klicks: "Einkauf: „→ Bestellt“" sagt der Technik in einer Zeile,
// wie man den Fehler nachstellt.
const letzteSchritte = [];

function uhrzeit() { return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function seiteAusAdresse() { return ((location.hash || '#/').split('?')[0].replace(/^#\/?/, '') || 'heute'); }
function merke(liste, eintrag, max) { if (!eintrag) return; liste.push(eintrag); if (liste.length > max) liste.shift(); }

let jsFehlerGezeigt = false;
if (typeof window !== 'undefined') {
  window.addEventListener('error', e => {
    const ort = e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '';
    merke(letzteFehler, `${uhrzeit()} ${String(e.message || 'Fehler').slice(0, 240)}${ort}`, 3);
    // Nur Fehler aus dem eigenen Code melden, nicht aus Browser-Erweiterungen -
    // und hoechstens einmal je Seitenaufruf, sonst wird es laut.
    if (!jsFehlerGezeigt && e.filename && e.filename.startsWith(location.origin)) {
      jsFehlerGezeigt = true;
      merkeStoerung();
      toast('Auf dieser Seite ist etwas schiefgegangen.', 'crit');
    }
  });
  window.addEventListener('unhandledrejection', e => merke(letzteFehler, `${uhrzeit()} ${String(e.reason?.message || e.reason).slice(0, 240)}`, 3));
  window.addEventListener('tp-api-fehler', e => merke(letzteFehler, `${uhrzeit()} ${String(e.detail).slice(0, 280)}`, 3));
  document.addEventListener('click', e => {
    const el = e.target.closest?.('button, a, summary, [role="button"], [data-open]');
    if (!el || el.closest('[data-fehler-melden], .fm-dialog')) return;
    const text = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 50);
    if (text) merke(letzteSchritte, `${uhrzeit()} ${seiteAusAdresse()}: „${text}“`, 6);
  }, true);
}

/** "Safari auf iPhone" statt einer 150 Zeichen langen Kennung - fuer die Anzeige im Dialog. */
export function geraetKurz(ua = '') {
  const geraet = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : '';
  return [browser, geraet].filter(Boolean).join(' auf ') || 'unbekannt';
}

// -- Rueckmeldung an den Melder ---------------------------------------------------

function leseGesehen() { try { return localStorage.getItem(GESEHEN_KEY) || ''; } catch { return ''; } }
function merkeGesehen() { try { localStorage.setItem(GESEHEN_KEY, new Date().toISOString()); } catch { /* nur Bequemlichkeit */ } }

function neueAntworten(meldungen, gesehen) {
  return (meldungen || []).filter(m => m.eigen && ['behoben', 'verworfen'].includes(m.status) && m.erledigtAm && m.erledigtAm > gesehen);
}

function setzeZahl(n) {
  const el = $('#fehlerMeldenZahl');
  if (!el) return;
  el.hidden = !n;
  el.textContent = n ? String(n) : '';
  el.setAttribute('aria-label', n ? `${n} neue Antwort${n === 1 ? '' : 'en'} auf deine Meldungen` : '');
}

let zuletztGeprueft = 0;
const schonGezeigt = new Set();

/**
 * Beim Start und wenn der Tab wieder sichtbar wird: Ist eine eigene Meldung
 * inzwischen behoben oder geprueft? Dann eine Zeile unten und eine Zahl am
 * Knopf, bis der Dialog geoeffnet wurde. Der Melder soll nicht nachsehen
 * muessen, ob sich etwas getan hat.
 */
export async function pruefeAntworten({ gedrosselt = false } = {}) {
  if (state.capabilities?.mode !== 'local') return;
  if (gedrosselt && Date.now() - zuletztGeprueft < 5 * 60 * 1000) return;
  zuletztGeprueft = Date.now();
  const d = await fetchEinkauf('/api/fehler/liste');
  if (!d || d.fehler || !Array.isArray(d.meldungen)) return;
  const neu = neueAntworten(d.meldungen, leseGesehen());
  setzeZahl(neu.length);
  const zuZeigen = neu.filter(m => !schonGezeigt.has(m.id));
  if (!zuZeigen.length) return;
  zuZeigen.forEach(m => schonGezeigt.add(m.id));
  const m = zuZeigen[0];
  const weitere = zuZeigen.length > 1 ? ` (und ${zuZeigen.length - 1} weitere)` : '';
  toast(`Deine Meldung ${m.id}: ${m.statusLabel}${m.ergebnis ? ` – ${m.ergebnis}` : ''}${weitere}`, '', { dauer: 10000 });
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pruefeAntworten({ gedrosselt: true }); });
}

// -- Dialog ------------------------------------------------------------------

const STATUS_KLASSE = { neu: 'level-achtung', uebernommen: 'status in-arbeit', behoben: 'ok', verworfen: 'plain' };

function listeHtml(d, gesehen) {
  if (!d) return '<p class="small muted">Lade deine Meldungen …</p>';
  if (d.fehler) return `<p class="small muted">${esc(d.hinweis || 'Meldungen konnten nicht geladen werden.')}</p>`;
  if (!d.meldungen?.length) return '';
  const offen = d.meldungen.filter(m => ['neu', 'uebernommen'].includes(m.status)).length;
  return `<h3 class="small" style="margin:6px 0 0">${d.alle ? 'Alle Meldungen' : 'Deine Meldungen'}${d.alle && offen ? ` · ${offen} offen` : ''}</h3>
    <div class="rows">${d.meldungen.slice(0, 8).map(m => {
      const neu = m.eigen && m.erledigtAm && m.erledigtAm > gesehen;
      const bilder = Array.from({ length: m.bilder || 0 }, (_, i) =>
        `<a href="/api/fehler/bild?${new URLSearchParams({ id: m.id, nr: String(i + 1) })}" target="_blank" rel="noopener">Bild ${i + 1}</a>`).join(' · ');
      return `<div class="row${neu ? ' fm-neu' : ''}">
      <div>
        <div class="t"><span class="mono small">${esc(m.id)}</span> ${esc(m.text.split('\n')[0].slice(0, 90))}</div>
        <div class="m">${esc(fmtDateTime(m.erstelltAm))}${d.alle && m.von ? ` · ${esc(m.von)}` : ''}${m.ort ? ` · ${esc(m.ort)}` : ''}${m.dringend ? ' · blockiert die Arbeit' : ''}${bilder ? ` · ${bilder}` : ''}</div>
        ${m.ergebnis ? `<div class="m">${neu ? '<strong>Neu:</strong> ' : ''}→ ${esc(m.ergebnis)}</div>` : ''}
      </div>
      <div class="r"><span class="badge ${STATUS_KLASSE[m.status] || 'plain'}">${esc(m.statusLabel || m.status)}</span></div>
    </div>`;
    }).join('')}</div>`;
}

function technikHtml(ort) {
  const zeilen = [
    `Seite: ${esc(ort || seiteAusAdresse())} (${esc(location.hash || '#/')})`,
    `Gerät: ${esc(geraetKurz(navigator.userAgent))}, ${window.innerWidth} px breit`,
    letzteSchritte.length ? `Letzte Schritte: ${letzteSchritte.map(esc).join(' → ')}` : 'Letzte Schritte: –',
    `Fehler im Browser: ${letzteFehler.length ? letzteFehler.map(esc).join(' · ') : 'keine'}`,
  ];
  return `<ul>${zeilen.map(z => `<li>${z}</li>`).join('')}</ul>`;
}

export function openFehlerMelden() {
  const root = $('#dialogRoot');
  const seite = ($('#seitentitel')?.textContent || document.title.split(' · ')[0] || '').trim();
  const gesehen = leseGesehen();
  const bilder = [];   // { name, typ, daten, url }
  const feinZeiger = window.matchMedia?.('(pointer: fine)').matches;
  root.innerHTML = `<div class="dialog-backdrop" data-close-dialog><div class="dialog fm-dialog" role="dialog" aria-modal="true" aria-labelledby="fmTitel">
    <form id="fmForm" novalidate class="fm-form">
      <h2 id="fmTitel">Fehler melden</h2>
      <p class="small muted">Kurz beschreiben, was nicht geht. Die Technik bekommt es als wichtig – Seite und deine letzten Schritte gehen automatisch mit.</p>
      <label class="small" for="fmText">Was ist passiert?</label>
      <textarea id="fmText" rows="3" maxlength="2000" required placeholder="z. B. Bei „→ Bestellt“ passiert nichts, die Bestellung bleibt rot."></textarea>
      <div class="fm-zeile">
        <span>Seite: <strong id="fmOrtText">${esc(seite || 'unbekannt')}</strong></span>
        <button type="button" class="fm-link" id="fmOrtAendern">ändern</button>
        <input type="text" id="fmOrt" maxlength="120" value="${esc(seite)}" aria-label="Seite oder Bereich" hidden>
      </div>
      <div class="fm-zeile">
        <button type="button" class="btn btn-sm" id="fmBildKnopf">Bildschirmfoto anhängen</button>
        <input type="file" id="fmDatei" accept="image/png,image/jpeg,image/webp" multiple hidden>
        ${feinZeiger ? '<span class="small muted">oder mit ⌘V einfügen</span>' : ''}
      </div>
      <div class="fm-vorschau" id="fmVorschau"></div>
      <label class="small fm-haken"><input type="checkbox" id="fmDringend"> Ich komme deswegen gerade nicht weiter</label>
      <details class="fm-technik"><summary>Was automatisch mitgeht</summary>${technikHtml(seite)}</details>
      <div class="dialog-actions">
        <button type="button" class="btn" data-close-dialog>Abbrechen</button>
        <button type="submit" class="btn btn-primary" id="fmSenden">Fehler melden</button>
      </div>
    </form>
    <div id="fmListe">${listeHtml(null, gesehen)}</div>
  </div></div>`;
  const dialog = root.querySelector('.dialog');
  $('#fmText')?.focus();

  // Wer den Dialog oeffnet, hat die Antworten gesehen: Zahl am Knopf weg.
  fetchEinkauf('/api/fehler/liste').then(d => {
    const ziel = $('#fmListe');
    if (ziel && ziel.closest('.fm-dialog') === dialog) ziel.innerHTML = listeHtml(d, gesehen);
    merkeGesehen();
    setzeZahl(0);
  });

  const zeigeBilder = () => {
    const ziel = $('#fmVorschau');
    if (!ziel) return;
    ziel.innerHTML = bilder.map((b, i) => `<div class="fm-bild"><img src="${b.url}" alt="Bildschirmfoto ${i + 1}"><button type="button" data-fm-bild-weg="${i}" aria-label="Bild ${i + 1} entfernen">×</button></div>`).join('');
    const knopf = $('#fmBildKnopf');
    if (knopf) knopf.disabled = bilder.length >= BILDER_MAX;
  };
  const fuegeHinzu = async (dateien) => {
    for (const datei of dateien) {
      if (!/^image\/(png|jpeg|webp)$/.test(datei.type)) { toast('Nur Bilder (PNG, JPG oder WebP) lassen sich anhängen.', 'crit'); continue; }
      if (bilder.length >= BILDER_MAX) { toast(`Höchstens ${BILDER_MAX} Bilder je Meldung.`, 'crit'); break; }
      // eslint-disable-next-line no-await-in-loop -- nacheinander, damit nicht mehrere grosse Bilder gleichzeitig im Speicher liegen.
      const fertig = await alsHochladbar(datei);
      bilder.push({ ...fertig, url: URL.createObjectURL(datei) });
    }
    zeigeBilder();
  };

  // Am Dialog binden, nicht an #dialogRoot: der Dialog entsteht bei jedem
  // Oeffnen neu, #dialogRoot bleibt - sonst haengen nach dem zweiten Oeffnen
  // zwei Zuhoerer daran (siehe openMeinPasswort).
  dialog.addEventListener('click', e => {
    if (e.target.closest('#fmOrtAendern')) {
      const feld = $('#fmOrt');
      feld.hidden = false; feld.focus(); feld.select();
      e.target.closest('#fmOrtAendern').hidden = true;
      $('#fmOrtText').parentElement.hidden = true;
      return;
    }
    if (e.target.closest('#fmBildKnopf')) { $('#fmDatei').click(); return; }
    const weg = e.target.closest('[data-fm-bild-weg]');
    if (weg) {
      const [b] = bilder.splice(Number(weg.dataset.fmBildWeg), 1);
      if (b) URL.revokeObjectURL(b.url);
      zeigeBilder();
    }
  });
  dialog.addEventListener('change', e => {
    if (e.target.id === 'fmDatei') { fuegeHinzu([...e.target.files]); e.target.value = ''; }
  });
  dialog.addEventListener('paste', e => {
    const dateien = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type));
    if (!dateien.length) return;
    e.preventDefault();
    fuegeHinzu(dateien);
  });

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
        bilder: bilder.map(({ name, typ, daten }) => ({ name, typ, daten })),
        technik: {
          adresse: location.hash || '#/',
          browser: navigator.userAgent,
          breite: window.innerWidth,
          fehler: [...letzteFehler],
          schritte: [...letzteSchritte],
        },
      });
      bilder.forEach(b => URL.revokeObjectURL(b.url));
      root.innerHTML = '';
      toast(r.doppelt
        ? `Schon gemeldet als ${r.id} – danke.`
        : `Danke – gemeldet als ${r.id}. Sobald es behoben ist, siehst du es hier.`, '', { dauer: 6000 });
    } catch (err) {
      knopf.disabled = false;
      knopf.textContent = 'Fehler melden';
      toast(`Melden hat nicht geklappt: ${err.message}`, 'crit');
    }
  });
}
