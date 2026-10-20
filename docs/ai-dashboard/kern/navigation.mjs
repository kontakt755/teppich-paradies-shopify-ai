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
import { $, esc } from './helfer.mjs';
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

// Weitere Dashboards: eigene Anwendungen mit eigener Anmeldung. Die Adressen kommen vom Server
// (/api/capabilities -> dashboards), weil sie nicht ins oeffentliche Repository gehoeren.
const DASHBOARDS = [
  // Werkbank: Ideen und Fragen zwischen Inhaber und Shop-Mitarbeiter - nicht fuer "lesen".
  { key: 'werkbank', text: 'Werkbank', titel: 'Werkbank Shop & Technik – öffnet in Claude', nichtLesen: true,
    icon: '<path d="M3.500 10h17M6 10v9M18 10v9M6 15h12M9 10V6.500h6V10"/>' },
  { key: 'laden', text: 'Laden', titel: 'Laden-Ansicht der Auftrags-App',
    icon: '<path d="M4 9.500 5.500 5h13L20 9.500M4 9.500h16M4 9.500a2.700 2.700 0 0 0 5.300 0 2.700 2.700 0 0 0 5.400 0 2.700 2.700 0 0 0 5.300 0M5.500 12v7.500h13V12M10 19.500v-4.500h4v4.500"/>' },
  { key: 'montage', text: 'Montage', titel: 'Montage-App (Aufträge der Monteure)',
    icon: '<path d="M14.500 5.500a3.500 3.500 0 0 0-4.300 4.300L4.500 15.500 7 18l5.700-5.700a3.500 3.500 0 0 0 4.300-4.300l-2 2-2-.500-.500-2z"/>' },
];
const PFEIL = '<svg class="nav-ic nav-extern-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7h8v8M17 7 7 17"/></svg>';

/** Nur https-Adressen werden Links - alles andere (oder nichts) laesst den Punkt weg. */
function sichereUrl(roh) {
  try { const u = new URL(String(roh || '')); return u.protocol === 'https:' ? u.toString() : null; } catch { return null; }
}

/** Gruppe "Weitere Dashboards" in der Seitenleiste fuellen; ohne eine Adresse bleibt sie weg. */
export function zeichneDashboards() {
  const ziel = $('#navDashboards');
  if (!ziel) return;
  const urls = state.capabilities?.dashboards || {};
  const links = DASHBOARDS.map(d => ({ ...d, href: sichereUrl(urls[d.key]) })).filter(d => d.href);
  ziel.hidden = !links.length;
  ziel.innerHTML = links.length
    ? `<p class="nav-label">Weitere Dashboards</p>${links.map(d => `<a href="${esc(d.href)}" class="nav-extern" target="_blank" rel="noopener" data-dashboard="${d.key}"${d.nichtLesen ? ' data-nicht-lesen' : ''} title="${esc(d.titel)}"><svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true">${d.icon}</svg><span>${esc(d.text)}</span>${PFEIL}<span class="visually-hidden"> (öffnet in neuem Tab)</span></a>`).join('')}`
    : '';
}

/** Einmal beim Start: "Mehr"-Blatt, Sammelpunkt "Mehr", Schliessen per Schleier. */
export function bindeNavigation() {
  $('#navToggle')?.addEventListener('click', () => { if (mehrOffen()) schliesseMehr(); else oeffneMehr(); });
  $('#sideSchleier')?.addEventListener('click', schliesseMehr);
  $('#navMoreKopf')?.addEventListener('click', () => {
    const offen = !$('#navMore').classList.contains('offen');
    setzeBuero(offen);
    try { localStorage.setItem(BUERO_KEY, offen ? '1' : '0'); } catch {}
  });
  // Derselbe Punkt nochmal angetippt aendert die Adresse nicht - das Blatt muss trotzdem zu.
  $('#side')?.addEventListener('click', e => { if (e.target.closest('a[href], #syncChip, #meinPasswortBtn, [data-fehler-melden]')) schliesseMehr(); });
}
