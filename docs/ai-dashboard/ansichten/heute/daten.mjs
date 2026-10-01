/**
 * "Heute": die zwei Datenquellen, die nur die Startseite braucht - die Lieferanten-Uebersicht
 * (Namen und Wartefristen) und alle sichtbaren Team-Aufgaben in einer Liste.
 *
 * Beides aendert sich durch Arbeit in anderen Ansichten (im Einkauf wird bestellt, in den
 * Aufgaben wird abgehakt), ohne dass diese Module hier Bescheid geben. Deshalb gilt ein
 * geladener Stand nur kurz: beim naechsten Zeichnen von "Heute" wird nach einer halben Minute
 * still nachgeladen - der alte Stand bleibt so lange stehen, nichts flackert.
 */
import { state } from '../../kern/zustand.mjs';
import { fetchEinkauf } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';

const HALTBAR_MS = 30_000;

export const heuteDaten = {
  lieferanten: null, lieferantenAm: 0, laedtLieferanten: false,
  aufgaben: null, aufgabenAm: 0, laedtAufgaben: false,
};

function lade(feld, pfad) {
  const am = `${feld}Am`;
  const laedt = `laedt${feld[0].toUpperCase()}${feld.slice(1)}`;
  if (heuteDaten[laedt]) return;
  if (heuteDaten[feld] && Date.now() - heuteDaten[am] < HALTBAR_MS) return;
  heuteDaten[laedt] = true;
  fetchEinkauf(pfad).then(d => {
    const vorher = JSON.stringify(heuteDaten[feld]);
    heuteDaten[feld] = d; heuteDaten[am] = Date.now(); heuteDaten[laedt] = false;
    // Nur neu zeichnen, wenn sich etwas geaendert hat - sonst zoege jedes stille Nachladen
    // ein weiteres Zeichnen nach sich.
    if (state.route.view === 'heute' && JSON.stringify(d) !== vorher) render();
  });
}

/** /api/einkauf/lieferanten: Anzeigenamen je Lieferant und die Schwellen 7/14 Tage. */
export function ensureHeuteLieferanten() { lade('lieferanten', '/api/einkauf/lieferanten'); }

/** Alle offenen Aufgaben, die der angemeldete Benutzer sehen darf - Team wie Technik. */
export function ensureHeuteAufgaben() {
  lade('aufgaben', `/api/org/liste?${new URLSearchParams({ bereich: 'alle-aufgaben', ansicht: 'offen', gruppe: 'alles' })}`);
}

/** Nach "Jetzt aktualisieren": die Lieferanten-Uebersicht stammt aus den Bestelldaten und ist dann veraltet. */
export function verwirfHeuteDaten() { heuteDaten.lieferantenAm = 0; }
