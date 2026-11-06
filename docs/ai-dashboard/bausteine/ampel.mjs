/**
 * Darstellung der Ampel (Regeln: lib/ampel.mjs). Zwei Teile, sonst nichts:
 *   - linker Farbrand an Zeile oder Karte (`ampelRand`), wie .order-row.rot/.gelb
 *   - kleine Plakette mit Zeichen und Wort (`ampelPlakette`) - Farbe steht nie allein
 * Ruhig bekommt keine Flaeche und keinen Rand. Styles: app.css, Abschnitt "Ampel".
 */
import { esc } from '../kern/helfer.mjs';
import { ZEICHEN } from '../lib/ampel.mjs';

const FARBIG = new Set(['rot', 'gelb']);

/** Klassen fuer den linken Farbrand; leer, wenn ruhig. `art`: 'karte' (mit Rahmen) oder 'zeile'. */
export function ampelRand(stufe, art = 'zeile') {
  return FARBIG.has(stufe) ? ` ampel-${art} ${stufe}` : '';
}

/**
 * Plakette "× Blockiert", "! Knapp". Ohne Stufe nichts - ausser `haken` ist gesetzt, dann ein
 * leiser Haken mit Wort (keine gruene Flaeche).
 */
export function ampelPlakette(stufe, wort, { titel = '', haken = false } = {}) {
  if (!FARBIG.has(stufe)) {
    return haken && wort ? `<span class="ampel ampel-ruhig"${titel ? ` title="${esc(titel)}"` : ''}><span class="ampel-zeichen" aria-hidden="true">${ZEICHEN.ruhig}</span>${esc(wort)}</span>` : '';
  }
  return `<span class="ampel ampel-${stufe}"${titel ? ` title="${esc(titel)}"` : ''}><span class="ampel-zeichen" aria-hidden="true">${ZEICHEN[stufe]}</span>${esc(wort)}</span>`;
}
