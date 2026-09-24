/**
 * Eingabefelder ueber ein Neuzeichnen retten.
 *
 * Die Oberflaeche baut `#main` bei jeder Aenderung komplett neu auf - auch
 * mitten im Tippen, weil die Suche entprellt in die Adresszeile schreibt und
 * weil Datenabgleiche jederzeit ein Neuzeichnen ausloesen koennen. Dabei wird
 * das Eingabefeld durch ein neues Element ersetzt, dessen Wert aus der
 * Adresszeile stammt - und die hinkt dem Tippen hinterher.
 *
 * Diese beiden Funktionen halten Wert, Fokus und Cursor fest. Sie arbeiten
 * bewusst nur mit den Eigenschaften, die ein Eingabefeld hat (value,
 * dataset.param, selectionStart/-End, focus, setSelectionRange), damit sie
 * ohne Browser testbar sind.
 */

/**
 * Merkt sich das gerade benutzte Eingabefeld.
 * @param {object|null} aktiv  das fokussierte Element (document.activeElement)
 * @param {(el: object) => boolean} gehoertDazu  liegt es im neu gezeichneten Bereich?
 * @returns {{param: string, wert: string, start: number|null, ende: number|null}|null}
 */
export function merkeEingabe(aktiv, gehoertDazu) {
  if (!aktiv || !aktiv.dataset?.param) return null;
  if (typeof gehoertDazu === 'function' && !gehoertDazu(aktiv)) return null;
  return {
    param: aktiv.dataset.param,
    wert: typeof aktiv.value === 'string' ? aktiv.value : '',
    start: aktiv.selectionStart ?? null,
    ende: aktiv.selectionEnd ?? null,
  };
}

/**
 * Stellt Wert, Fokus und Cursor im neu gezeichneten Feld wieder her.
 * Getipptes schlaegt den aus der Adresszeile rekonstruierten Wert.
 * @returns {boolean} true, wenn ein Feld wiederhergestellt wurde
 */
export function stelleEingabeWiederHer(feld, merk) {
  if (!merk || !feld) return false;
  if (typeof merk.wert === 'string' && feld.value !== merk.wert) feld.value = merk.wert;
  feld.focus?.();
  const pos = merk.start ?? (typeof feld.value === 'string' ? feld.value.length : 0);
  try { feld.setSelectionRange?.(pos, merk.ende ?? pos); } catch { /* Feldtypen ohne Auswahlbereich */ }
  return true;
}

/**
 * Darf ein entprellter Sucheingabe-Lauf noch in die Adresszeile schreiben?
 *
 * Nein, wenn der Benutzer waehrend der Entprellzeit die Ansicht gewechselt hat
 * (sonst taucht der Suchtext in der neuen Ansicht auf) oder das Feld gar nicht
 * mehr existiert.
 *
 * @param {{gemerkteAnsicht: string, aktuelleAnsicht: string, feldNochDa: boolean}} lage
 */
export function darfUebernehmen({ gemerkteAnsicht, aktuelleAnsicht, feldNochDa }) {
  if (gemerkteAnsicht !== aktuelleAnsicht) return false;
  return feldNochDa !== false;
}
