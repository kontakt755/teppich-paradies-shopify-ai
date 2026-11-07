/**
 * Lieferweg als ruhige Plakette mit einem Wort (Regel: lib/lieferweg.mjs). Ueberall dieselbe:
 * Heute, Kundenakte, Einkauf (Je Lieferant, Je Auftrag) und Versand-Dialog. Keine Farbe -
 * der Weg ist eine Angabe, kein Problem. Nicht vermerkte Wege sind gestrichelt und sagen es
 * im Titel. Styles: app.css, Abschnitt "Lieferweg".
 */
import { esc } from '../kern/helfer.mjs';
import { wegeImAuftrag } from '../lib/lieferweg.mjs';

const UNBELEGT = 'nicht vermerkt – aus den Stammdaten';

/** Plakette fuer einen Weg ({ weg, wort, belegt } aus lieferwegVon); leer ohne Weg. */
export function lieferwegPlakette(lw, { anzahl = null } = {}) {
  if (!lw?.weg) return '';
  const titel = lw.belegt ? `Lieferweg: ${lw.wort}` : `Lieferweg: ${lw.wort} – ${UNBELEGT}`;
  return `<span class="lieferweg${lw.belegt ? '' : ' unbelegt'}" data-lieferweg="${esc(lw.weg)}" title="${esc(titel)}">${anzahl ? `${esc(anzahl)} × ` : ''}${esc(lw.wort)}</span>`;
}

/** Alle Wege eines Auftrags nebeneinander ("1 × Hersteller → Kunde", "1 × aus Lager"); leer ohne Ware. */
export function lieferwegeAuftrag(positionen = [], eintragVon = () => null) {
  const wege = wegeImAuftrag(positionen, eintragVon);
  if (!wege.length) return '';
  // Nur ein Weg mit einer Position: die Zahl sagt nichts.
  const mitZahl = wege.length > 1 || wege[0].anzahl > 1;
  return `<span class="lieferwege">${wege.map(w => lieferwegPlakette(w, { anzahl: mitZahl ? w.anzahl : null })).join('')}</span>`;
}
