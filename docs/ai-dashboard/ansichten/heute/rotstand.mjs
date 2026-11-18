/**
 * "Neu seit gestern" an den roten Problemen der Shop-Übersicht (#2241). Der Server merkt sich je
 * Tag, welche To-dos rot waren (operations/lib/rotstand.mjs), und sagt, welche davon seit dem
 * letzten frueheren Tag neu rot sind - auch alte Auftraege, die erst heute rot geworden sind.
 *
 * Gemeldet wird nur, wenn sich die Menge der roten IDs geaendert hat, nicht bei jedem Zeichnen.
 * Rolle "lesen" meldet nicht (Schreibweg) und sieht keine Markierung. Scheitert der Abruf, fehlt
 * nur die Markierung - die Probleme selbst bleiben vollstaendig.
 */
import { state } from '../../kern/zustand.mjs';
import { orgSchreiben } from '../../kern/api.mjs';
import { render } from '../../kern/render.mjs';

export const rotstand = { gemeldet: '', neu: new Set(), vortag: null };

/** @param {string[]} ids  IDs der roten To-dos, wie sie gerade unter "Probleme" stehen */
export function meldeRotstand(ids) {
  const kennung = [...ids].sort().join('|');
  if (kennung === rotstand.gemeldet) return;
  rotstand.gemeldet = kennung;
  orgSchreiben('/api/heute/rotstand', { ids }).then(d => {
    const neu = new Set(d?.neu || []);
    const vorher = [...rotstand.neu].sort().join('|');
    rotstand.neu = neu; rotstand.vortag = d?.vortag || null;
    if (state.route.view === 'heute' && [...neu].sort().join('|') !== vorher) render();
  }).catch(() => { /* Fehler meldet orgSchreiben; neuer Versuch, sobald sich die roten IDs aendern */ });
}

/** "seit Montag" statt "seit gestern", wenn dazwischen niemand das Dashboard offen hatte. */
export function seitText(vortag, jetzt = new Date()) {
  if (!vortag) return 'seit gestern';
  const gestern = new Date(jetzt.getTime() - 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  if (vortag === gestern) return 'seit gestern';
  return `seit ${new Date(`${vortag}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'long', timeZone: 'Europe/Berlin' })}`;
}
