/**
 * "Heute": die Datenquellen, die nur die Startseite braucht - die Lieferanten-Uebersicht
 * (Namen und Wartefristen), alle sichtbaren Team-Aufgaben in einer Liste und die Textvorlage
 * fuer "Muster nachfassen".
 *
 * Beides aendert sich durch Arbeit in anderen Ansichten (im Einkauf wird bestellt, in den
 * Aufgaben wird abgehakt), ohne dass diese Module hier Bescheid geben. Deshalb gilt ein
 * geladener Stand nur kurz: beim naechsten Zeichnen von "Heute" wird nach einer halben Minute
 * still nachgeladen - der alte Stand bleibt so lange stehen, nichts flackert.
 */
import { state } from '../../kern/zustand.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';
import { kunden } from '../kunden/gemeinsam.mjs';
import { neuerVersandlauf } from '../../lib/muster-nachfassen.mjs';

const HALTBAR_MS = 30_000;

export const heuteDaten = {
  lieferanten: null, lieferantenAm: 0, laedtLieferanten: false,
  aufgaben: null, aufgabenAm: 0, laedtAufgaben: false,
  musterTexte: null, musterTexteAm: 0, laedtMusterTexte: false,
};

function lade(feld, pfad, danach = null) {
  const am = `${feld}Am`;
  const laedt = `laedt${feld[0].toUpperCase()}${feld.slice(1)}`;
  if (heuteDaten[laedt]) return;
  if (heuteDaten[feld] && Date.now() - heuteDaten[am] < HALTBAR_MS) return;
  heuteDaten[laedt] = true;
  fetchEinkauf(pfad).then(d => {
    const alt = heuteDaten[feld];
    const vorher = JSON.stringify(alt);
    heuteDaten[feld] = d; heuteDaten[am] = Date.now(); heuteDaten[laedt] = false;
    // Nur neu zeichnen, wenn sich etwas geaendert hat - sonst zoege jedes stille Nachladen
    // ein weiteres Zeichnen nach sich.
    if (state.route.view === 'heute' && JSON.stringify(d) !== vorher) render();
    if (danach) danach(d, alt);
  });
}

/** /api/einkauf/lieferanten: Anzeigenamen je Lieferant und die Schwellen 7/14 Tage. */
export function ensureHeuteLieferanten() { lade('lieferanten', '/api/einkauf/lieferanten'); }

/** Alle offenen Aufgaben, die der angemeldete Benutzer sehen darf - Team wie Technik. */
export function ensureHeuteAufgaben() {
  lade('aufgaben', `/api/org/liste?${new URLSearchParams({ bereich: 'alle-aufgaben', ansicht: 'offen', gruppe: 'alles' })}`);
}

/** Betreff und Text fuer "Muster nachfassen" (Vorlage des Inhabers aus dem Privatordner). */
export function ensureHeuteMusterTexte() {
  lade('musterTexte', '/api/kunden/muster-texte', (neu, alt) => { if (neuerVersandlauf(alt, neu)) ladeBestellzeilenNeu(); });
}

/**
 * Bestellzeilen frisch holen. Sie werden sonst nur einmal je Tab geladen - nach einem Versandlauf
 * stuenden versorgte Kunden sonst weiter als "offen" in der Karte (2026-10-19).
 */
export function ladeBestellzeilenNeu() {
  return fetchEinkauf('/api/kunden/bestellungen').then(d => {
    if (!d?.verfuegbar) return;
    kunden.bestellungen = d;
    if (['heute', 'kunden'].includes(state.route.view)) render();
  }).catch(() => { /* Naechster Abruf versucht es wieder; die Karte bleibt beim alten Stand. */ });
}

/** Nach "Jetzt aktualisieren": die Lieferanten-Uebersicht stammt aus den Bestelldaten und ist dann veraltet. */
export function verwirfHeuteDaten() { heuteDaten.lieferantenAm = 0; }
