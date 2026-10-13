/**
 * Eine Protokollzeile je Fehler im Dienst des Control Centers.
 *
 * Bis 2026-10-12 stand im Dienstprotokoll (dashboard-dienst.log) nur jeder
 * 500er, ohne Uhrzeit; abgelehnte Anfragen (400, 403, 409 ...) tauchten gar
 * nicht auf. Wer nach einer Meldung "ging nicht" nachsah, fand nichts und
 * wusste nicht einmal, wann.
 *
 * Was hier hineingehoert: Zeit (ISO, UTC), Bereich, Status, Methode, Pfad ohne
 * Abfrageteil und die Fehlermeldung. Was nie hineingehoert: Cookies,
 * Anfragekoerper und der Abfrageteil der Adresse - dort stehen Suchbegriffe
 * wie Kundennamen.
 */

export function zeitstempel(jetzt = new Date()) {
  return jetzt.toISOString();
}

/** Schreibt eine Zeile nach stderr: "2026-10-12T14:05:00.000Z [api] 400 POST /api/org/neu: Ohne Titel geht es nicht". */
export function logFehler(bereich, text, { ziel = console, jetzt = new Date() } = {}) {
  const einzeilig = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
  ziel.error(`${zeitstempel(jetzt)} [${bereich}] ${einzeilig}`);
}

/** Pfad einer Anfrage ohne Abfrageteil - der kann Suchbegriffe (Kundennamen) tragen. */
export function pfadOhneAbfrage(url) {
  return String(url || '/').split('?')[0].split('#')[0].slice(0, 200);
}
