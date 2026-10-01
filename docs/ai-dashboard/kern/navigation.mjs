/**
 * Navigation: Seitenleiste (Rechner), untere Leiste und "Mehr"-Blatt (Handy), Seitentitel
 * in der Kopfzeile, Zaehler an den Menuepunkten.
 *
 * Das Markup steht in index.html. Jeder Link traegt data-nav="<route>" - derselbe Punkt darf
 * mehrfach vorkommen (Seitenleiste und untere Leiste) und wird hier gemeinsam markiert.
 * Welche Ansicht wem gehoert, entscheidet weiterhin kern/router.mjs (darfAnsicht) und das
 * Attribut data-nur-inhaber; hier wird nichts davon neu geregelt.
 */
import { state } from './zustand.mjs';
import { $ } from './helfer.mjs';
import { darfAnsicht } from './router.mjs';

/** Punkte mit eigenem Platz in der unteren Leiste; alles andere liegt am Handy hinter "Mehr". */
const UNTEN = ['heute', 'kunden', 'lexikon', 'einkauf'];
const BUERO_KEY = 'tp-nav-buero';

// Zaehler kommen aus den Zwischenspeichern der Ansichten. Der Kern kennt keine Ansicht,
// deshalb meldet der Einstieg (app.js) sie hier an: { kunden: () => 4, einkauf: () => null }.
let zaehler = {};
export function registriereNavZaehler(tabelle) { zaehler = { ...zaehler, ...tabelle }; }

function setzeZahl(el, n) {
  if (!el) return;
  const zahl = Number(n) || 0;
  el.hidden = !zahl;
  el.textContent = zahl ? String(zahl) : '';
}

function bueroGemerkt() {
  try { return localStorage.getItem(BUERO_KEY) === '1'; } catch { return false; }
}

function bueroAnsichten() {
  return [...document.querySelectorAll('#navMoreMenu [data-nav]')].map(a => a.dataset.nav);
}

function setzeBuero(offen) {
  $('#navMore')?.classList.toggle('offen', offen);
  $('#navMoreKopf')?.setAttribute('aria-expanded', String(offen));
}

export function mehrOffen() { return document.body.classList.contains('nav-offen'); }

export function schliesseMehr() {
  document.body.classList.remove('nav-offen');
  $('#navToggle')?.setAttribute('aria-expanded', 'false');
  const schleier = $('#sideSchleier'); if (schleier) schleier.hidden = true;
}

function oeffneMehr() {
  document.body.classList.add('nav-offen');
  $('#navToggle')?.setAttribute('aria-expanded', 'true');
  const schleier = $('#sideSchleier'); if (schleier) schleier.hidden = false;
}

/** Nach jedem Zeichnen: aktiven Punkt markieren, Zaehler setzen, "Mehr"-Blatt schliessen. */
export function aktualisiereNavigation() {
  const view = state.route.view;
  // aria-current braucht den Wert "page" - ein leeres Attribut hebt nichts hervor.
  document.querySelectorAll('[data-nav]').forEach(a => {
    if (a.dataset.nav === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const freigaben = darfAnsicht('freigaben') ? state.tasks.filter(t => t.status === 'freigabe').length : 0;
  setzeZahl($('#navFreigaben'), freigaben);
  // Der Sammelpunkt traegt die Freigaben-Zahl mit, damit sie eingeklappt nicht untergeht,
  // und steht offen, solange eine seiner Ansichten gezeigt wird.
  setzeZahl($('#navMoreCount'), freigaben);
  const imBuero = bueroAnsichten().includes(view);
  $('#navMoreKopf')?.classList.toggle('current', imBuero);
  setzeBuero(imBuero || bueroGemerkt());
  document.querySelectorAll('[data-nav-zahl]').forEach(el => {
    const name = el.dataset.navZahl;
    if (name === 'mehr') { setzeZahl(el, freigaben); return; }
    let n = 0;
    try { n = zaehler[name]?.() || 0; } catch { n = 0; }
    setzeZahl(el, n);
  });
  const mehr = $('#navToggle');
  if (mehr) {
    if (UNTEN.includes(view)) mehr.removeAttribute('aria-current'); else mehr.setAttribute('aria-current', 'page');
  }
  schliesseMehr();
}

/**
 * Kopfzeile: zeigt die Ueberschrift der Ansicht. Steht dieselbe Ueberschrift gleich darunter
 * als <h1>, wird sie dort nur noch fuer Vorleseprogramme behalten (Klasse kopf-oben) - sonst
 * stuende "Kunden" zweimal uebereinander.
 */
export function aktualisiereSeitentitel() {
  const ziel = $('#seitentitel');
  if (!ziel) return;
  const kopf = $('#main > .page-head');
  const h1 = kopf?.querySelector('h1');
  const text = h1?.textContent.trim() || document.title.split(' · ')[0];
  ziel.textContent = text;
  if (kopf && h1) kopf.classList.add('kopf-oben');
}

/** Einmal beim Start: "Mehr"-Blatt, Sammelpunkt "Buero", Schliessen per Schleier. */
export function bindeNavigation() {
  $('#navToggle')?.addEventListener('click', () => { if (mehrOffen()) schliesseMehr(); else oeffneMehr(); });
  $('#sideSchleier')?.addEventListener('click', schliesseMehr);
  $('#navMoreKopf')?.addEventListener('click', () => {
    const offen = !$('#navMore').classList.contains('offen');
    setzeBuero(offen);
    try { localStorage.setItem(BUERO_KEY, offen ? '1' : '0'); } catch {}
  });
  // Derselbe Punkt nochmal angetippt aendert die Adresse nicht - das Blatt muss trotzdem zu.
  $('#side')?.addEventListener('click', e => { if (e.target.closest('a[href], #syncChip, #meinPasswortBtn')) schliesseMehr(); });
}
