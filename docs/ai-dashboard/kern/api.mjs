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

import { merkeStoerung } from './helfer.mjs';
import { markiereSitzungAbgelaufen } from './sitzung.mjs';

/**
 * Gescheiterte Aufrufe als Ereignis melden. "Fehler melden"
 * (bausteine/fehler-melden.mjs) haengt die letzten davon an die Meldung - der
 * Kern kennt den Baustein nicht, deshalb ein Ereignis statt eines Imports.
 * 404 bleibt aussen vor: das heisst hier "Export noch nicht da", kein Fehler.
 */
function meldeApiFehler(methode, pfad, status, text) {
  if (status === 401) markiereSitzungAbgelaufen();
  if (status === 404 || typeof window === 'undefined') return;
  // Nur echte Stoerungen (Server kaputt, keine Verbindung) bekommen den
  // Melden-Knopf - eine fehlende Berechtigung ist kein Fehler im Dashboard.
  if (!status || status >= 500) merkeStoerung();
  try { window.dispatchEvent(new CustomEvent('tp-api-fehler', { detail: `${methode} ${pfad} → ${status || 'keine Verbindung'}: ${text || ''}` })); } catch { /* nur Zusatzinfo */ }
}

export async function fetchEinkauf(path) {
  try {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok) {
      // "HTTP 500" sagt niemandem etwas, und eine Stoerung sah bisher aus wie
      // "nichts zu tun" - beides in derselben blassen Box.
      let roh = null;
      try { roh = (await r.json())?.error || null; } catch { /* kein JSON im Fehlerfall */ }
      meldeApiFehler('GET', path, r.status, roh);
      return { verfuegbar: false, fehler: true, status: r.status, hinweis: fehlerText(r.status, roh) };
    }
    return await r.json();
  } catch (e) {
    meldeApiFehler('GET', path, 0, e.message);
    return { verfuegbar: false, fehler: true, hinweis: 'Keine Verbindung zum Dashboard am Mac. Läuft es noch?', roh: e.message };
  }
}

export async function orgSchreiben(pfad, rumpf) {
  const r = await fetch(pfad, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rumpf) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    meldeApiFehler('POST', pfad, r.status, [j.error, j.technisch].filter(Boolean).join(' | '));
    throw new Error(j.error || `HTTP ${r.status}`);
  }
  return j;
}
