/**
 * Protokoll mit Uhrzeit vor jeder Zeile (ISO, UTC) - fuer die Dienstprotokolle von launchd.
 *
 * launchd schreibt stdout und stderr ohne Datum in die Logdatei. Bis 2026-10-26 liessen sich
 * deshalb 13 rote Laeufe der Shop-Wache nicht datieren. Zuerst im Sync-Dienst gebaut
 * (operations/scripts/sync-dienst.mjs), jetzt hier fuer alle Dienste.
 */
export function mitZeitstempel(ziel = console, jetzt = () => new Date()) {
  const zeile = (art) => (text) => ziel[art]?.(`${jetzt().toISOString()} ${text}`);
  return { log: zeile('log'), warn: zeile('warn'), error: zeile('error') };
}
