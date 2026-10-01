/**
 * Betriebsart und Anmeldung: /api/capabilities, /api/session, Abmelden, Rolle "lesen".
 *
 * Die Rolle wird hier nur fuer eine ruhige Oberflaeche ausgewertet - durchgesetzt wird sie
 * im Server (scripts/serve-dashboard.mjs).
 */
import { state } from './zustand.mjs';
import { $ } from './helfer.mjs';

export async function loadCapabilities() {
  try {
    const r = await fetch('/api/capabilities', { cache: 'no-store' });
    if (r.status === 401) { state.capabilities = { mode: 'ausgeloggt' }; return; }
    if (!r.ok) throw new Error();
    state.capabilities = await r.json();
    state.me = state.capabilities.user || null;
  } catch { state.capabilities = { mode: 'static' }; }
}

export async function loadSession() {
  try {
    const r = await fetch('/api/session', { cache: 'no-store' });
    state.session = r.ok ? await r.json() : { required: false, authenticated: true };
  } catch { state.session = { required: false, authenticated: true }; }
  renderSessionButton();
}

function renderSessionButton() {
  const btn = $('#sessionBtn');
  if (!btn) return;
  const show = Boolean(state.session?.required && state.session?.authenticated);
  btn.hidden = !show;
  // Das eigene Passwort darf jeder aendern - nicht nur der Inhaber fuer andere.
  const pw = $('#meinPasswortBtn');
  if (pw) pw.hidden = !show || !state.session?.benutzer?.kuerzel;
  const label = $('#sessionBtnText');
  if (label) {
    const b = state.session?.benutzer;
    label.textContent = b?.name ? `${b.name} (${b.rolle})` : 'Angemeldet';
  }
  // Rolle "lesen" darf serverseitig nichts veraendern - hier nur die zugehoerige
  // Bedienoberflaeche ausblenden, damit niemand versehentlich auf eine 403-Antwort
  // trifft. Die eigentliche Durchsetzung liegt im Server (scripts/serve-dashboard.mjs).
  const istLesend = state.session?.benutzer?.rolle === 'lesen';
  document.body.classList.toggle('rolle-lesen', istLesend);
  // Mitarbeiter sehen das Kundengeschaeft; die interne Entwicklungsarbeit
  // (GitHub-Aufgaben, Freigaben, Auswertungen) bleibt beim Inhaber.
  document.body.classList.toggle('rolle-mitarbeiter', state.session?.benutzer?.rolle === 'mitarbeiter');
}

/** true, wenn die aktuelle Rolle keine Aenderungen vornehmen darf (nur Anzeige, Server prueft ohnehin serverseitig). */
export function istNurLesend() {
  return state.session?.benutzer?.rolle === 'lesen';
}

export async function logout() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch { /* egal, wir leiten trotzdem um */ }
  window.location.href = '/login';
}
