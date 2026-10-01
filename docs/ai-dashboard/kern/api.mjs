/**
 * Zugriff auf /api/* des lokalen Servers.
 *
 * fetchEinkauf() liest (jede Ansicht, nicht nur der Einkauf - der Name ist gewachsen) und
 * liefert bei einer Stoerung { verfuegbar: false, fehler: true, hinweis } statt zu werfen.
 * orgSchreiben() schreibt per POST und wirft mit der Fehlermeldung des Servers.
 * Kein Token im Browser: der Server prueft Sitzung und Rolle.
 */

function fehlerText(status, roh) {
  if (status === 404) return 'Diese Daten liegen noch nicht vor.';
  if (status === 401 || status === 403) return 'Dafür fehlt die Berechtigung – oder die Anmeldung ist abgelaufen.';
  if (status >= 500) return 'Das Dashboard am Mac antwortet gerade nicht. Läuft es noch?';
  return roh || 'Unbekannter Fehler';
}

export async function fetchEinkauf(path) {
  try {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok) {
      // "HTTP 500" sagt niemandem etwas, und eine Stoerung sah bisher aus wie
      // "nichts zu tun" - beides in derselben blassen Box.
      let roh = null;
      try { roh = (await r.json())?.error || null; } catch { /* kein JSON im Fehlerfall */ }
      return { verfuegbar: false, fehler: true, status: r.status, hinweis: fehlerText(r.status, roh) };
    }
    return await r.json();
  } catch (e) {
    return { verfuegbar: false, fehler: true, hinweis: 'Keine Verbindung zum Dashboard am Mac. Läuft es noch?', roh: e.message };
  }
}

export async function orgSchreiben(pfad, rumpf) {
  const r = await fetch(pfad, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rumpf) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
