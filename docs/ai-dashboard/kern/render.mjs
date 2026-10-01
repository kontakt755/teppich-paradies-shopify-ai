/**
 * Zeichnet die aktuelle Ansicht in #main: Navigation markieren, Sonderzustaende
 * (abgemeldet, nicht lokal, Daten fehlen), Seitentitel, Eingabe und Fokus erhalten.
 *
 * Die Tabelle der Ansichten kommt vom Einstieg (app.js) ueber registriereAnsichten() -
 * dieses Modul kennt keine einzelne Ansicht. Einzige Ausnahme nach oben: nach jedem
 * Zeichnen wird das Aufgaben-Panel (bausteine/aufgaben-panel.mjs) nachgefuehrt.
 */
import { merkeEingabe, stelleEingabeWiederHer } from '../lib/eingabe.mjs';
import { state } from './zustand.mjs';
import { $, esc } from './helfer.mjs';
import { istNurLesend } from './sitzung.mjs';
import { renderSheet } from '../bausteine/aufgaben-panel.mjs';

let letzteAnsicht = null;

// Die Tabelle der Ansichten kommt vom Einstieg (registriereAnsichten), damit
// das Zeichnen keine einzelne Ansicht kennen muss.
let ansichten = {};
export function registriereAnsichten(tabelle) { ansichten = tabelle; }

export function render() {
  const main = $('#main');
  const eingabe = merkeEingabe(document.activeElement, (el) => main.contains(el));
  // aria-current braucht den Wert "page". toggleAttribute setzte nur einen
  // leeren Wert und gab true zurueck - der zweite Zweig lief nie, der aktive
  // Reiter war nirgends hervorgehoben.
  document.querySelectorAll('.mainnav a').forEach(a => {
    if (a.dataset.nav === state.route.view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const nf = $('#navFreigaben'); const approvals = state.tasks.filter(t => t.status === 'freigabe').length;
  nf.hidden = !approvals; nf.textContent = approvals;
  // "Mehr" traegt die Freigaben-Zahl mit, damit sie im eingeklappten Menue nicht untergeht,
  // und ist markiert, solange eine seiner Ansichten offen ist.
  const more = $('#navMore');
  if (more) {
    const mc = $('#navMoreCount'); mc.hidden = !approvals; mc.textContent = approvals;
    more.querySelector('summary').classList.toggle('current', ['arbeit', 'freigaben', 'ratgeber', 'bereiche', 'insights', 'aktivitaet'].includes(state.route.view));
    more.open = false;
  }
  // Ein Satz oben ist ehrlicher als lauter fehlende Knoepfe ohne Erklaerung.
  const lesenHinweis = $('#lesenHinweis');
  if (lesenHinweis) lesenHinweis.hidden = !istNurLesend();
  if (state.capabilities.mode === 'ausgeloggt') {
    main.innerHTML = `<div class="page-head"><h1>Sitzung abgelaufen</h1></div><div class="notice warn">Die Anmeldung ist abgelaufen oder das Passwort hat sich geändert. Bereits eingegebene Angaben auf dieser Seite bleiben erhalten, bis neu geladen wird. <a href="/login" class="btn btn-sm" style="margin-left:8px">Neu anmelden</a></div>`;
    document.title = 'Sitzung abgelaufen · Teppich Dashboard';
    return;
  }
  if (state.capabilities.mode !== 'local') {
    main.innerHTML = `<div class="page-head"><h1>Nur lokal im Betrieb</h1></div><div class="notice">Das Control Center läuft seit 2026-09-23 nicht mehr öffentlich. Es zeigt hier keine Aufgabendaten. Auf dem Mac starten: <span class="mono">npm run dashboard</span>, dann <span class="mono">http://localhost:8001</span> öffnen.</div>`;
    document.title = 'Nur lokal im Betrieb · Teppich Dashboard';
    return;
  }
  if (state.loadError && !state.raw) {
    main.innerHTML = `<div class="page-head"><h1>Daten nicht verfügbar</h1></div><div class="notice crit">${esc(state.loadError)}</div><p class="small muted" style="margin-top:10px">issues.json entsteht lokal: <span class="mono">npm run dashboard</span>. <button class="btn btn-sm" data-action="refresh" style="margin-left:8px">Erneut versuchen</button></p>`;
    return;
  }
  main.innerHTML = (state.loadError ? `<div class="notice crit" style="margin-bottom:12px">Aktualisierung fehlgeschlagen: ${esc(state.loadError)} – es wird der letzte geladene Stand gezeigt.</div>` : '') + ansichten[state.route.view]();
  document.title = `${{ heute: 'Heute', arbeit: 'Entwicklung', freigaben: 'Freigaben', bereiche: 'Bereiche', insights: 'Insights', aktivitaet: 'Aktivität', einkauf: 'Einkauf', kunden: 'Kunden', lexikon: 'Lexikon', ratgeber: 'Ratgeber', hilfe: 'Hilfe', shopwache: 'Shop-Wache', organisation: 'Aufgaben & Organisation' }[state.route.view] || 'Teppich Paradies'} · Teppich Dashboard`;
  renderSheet();
  $('#mainnav').classList.remove('open'); $('#navToggle').setAttribute('aria-expanded', 'false');
  // Zuerst weitertippen lassen, wo jemand gerade tippt.
  if (eingabe && stelleEingabeWiederHer(main.querySelector(`input[data-param="${eingabe.param}"]`), eingabe)) return;
  // Kundensuche: Feld soll beim Öffnen sofort tippbereit sein (Telefon-Arbeitsplatz)
  // - aber nur beim Betreten. Sonst riss der stille 2-Minuten-Refresh den Fokus
  // aus jedem anderen Bedienelement (auf dem Handy samt Tastatur).
  const kundenAnsichtNeu = state.route.view === 'kunden' && letzteAnsicht !== 'kunden';
  letzteAnsicht = state.route.view;
  if (kundenAnsichtNeu && !state.route.params.get('kunde') && state.route.params.get('tab') !== 'rueckrufe') {
    const feld = main.querySelector('input[type=search][data-param="kq"]');
    if (feld && document.activeElement !== feld) { feld.focus(); feld.setSelectionRange(feld.value.length, feld.value.length); }
  }
}
