/**
 * Zeichnet die aktuelle Ansicht in #main: Navigation nachfuehren (kern/navigation.mjs), Sonderzustaende
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
import { aktualisiereNavigation, aktualisiereSeitentitel } from './navigation.mjs';
import { renderSheet } from '../bausteine/aufgaben-panel.mjs';

let letzteAnsicht = null;

// Die Tabelle der Ansichten kommt vom Einstieg (registriereAnsichten), damit
// das Zeichnen keine einzelne Ansicht kennen muss.
let ansichten = {};
export function registriereAnsichten(tabelle) { ansichten = tabelle; }

// Nach jedem Zeichnen, ausserhalb von #main (z. B. Zeile "Stand: vor 3 Min.", bausteine/datenstand.mjs).
// Ueber den Einstieg angemeldet, damit dieses Modul keinen Baustein mit Ansichtsdaten laden muss.
let nachZeichnen = () => {};
export function registriereNachZeichnen(fn) { nachZeichnen = fn; }

export function render() {
  zeichne();
  aktualisiereSeitentitel();
  nachZeichnen();
}

function zeichne() {
  const main = $('#main');
  const eingabe = merkeEingabe(document.activeElement, (el) => main.contains(el));
  const aktiv = document.activeElement;
  // Manche Formulare halten Werte im Modul statt in der Adresszeile. Auch bei
  // einem stillen Datenabgleich bleiben ihre Tastatur und Textauswahl erhalten.
  const lokalerFokus = aktiv?.matches?.('[data-focus-erhalten]') && main.contains(aktiv)
    ? { id: aktiv.id, start: aktiv.selectionStart, ende: aktiv.selectionEnd } : null;
  aktualisiereNavigation();
  // Ein Satz oben ist ehrlicher als lauter fehlende Knoepfe ohne Erklaerung.
  const lesenHinweis = $('#lesenHinweis');
  if (lesenHinweis) lesenHinweis.hidden = !istNurLesend();
  if (state.capabilities.mode === 'ausgeloggt') {
    // Lokale Arbeitsanweisungen koennen eingefuegte Nachrichten enthalten.
    // Die Ansicht verwirft sie auch, wenn die Sitzung ohne Abmelden ablaeuft.
    window.dispatchEvent(new Event('tp-sitzung-beendet'));
    main.innerHTML = `<div class="page-head"><h1>Sitzung abgelaufen</h1></div><div class="notice warn">Die Anmeldung ist abgelaufen oder das Passwort hat sich geändert. Bitte neu anmelden. <a href="/login" class="btn btn-sm" style="margin-left:8px">Neu anmelden</a></div>`;
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
  document.title = `${{ heute: 'Heute', prozesse: 'Vorbereiten', arbeit: 'Technik', freigaben: 'Entscheidungen', bereiche: 'Bereiche', insights: 'Kennzahlen', aktivitaet: 'Verlauf', einkauf: 'Bestellen', kunden: !state.route.params.get('kunde') && state.route.params.get('tab') === 'muster' ? 'Packstation' : !state.route.params.get('kunde') && state.route.params.get('tab') === 'bestellungen' ? 'Bestellungen' : 'Kunden', lexikon: 'Lexikon', ratgeber: 'Ratgeber', hilfe: 'Hilfe', shopwache: 'Shop-Kontrolle', organisation: 'Aufgaben', sonderposten: 'Sonderposten', akquise: 'Genossenschaften', hausverwaltungen: 'Hausverwaltungen', bildrechte: 'Bildrechte' }[state.route.view] || 'Teppich Paradies'} · Teppich Dashboard`;
  renderSheet();
  if (lokalerFokus?.id) {
    const feld = document.getElementById(lokalerFokus.id);
    if (feld && main.contains(feld)) {
      feld.focus();
      if (typeof lokalerFokus.start === 'number') {
        try { feld.setSelectionRange(lokalerFokus.start, lokalerFokus.ende); } catch { /* Auswahl nur fuer Textfelder */ }
      }
    }
  }
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
