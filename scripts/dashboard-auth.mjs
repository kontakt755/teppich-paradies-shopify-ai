/**
 * Passwort-Absicherung des Control Centers fuer den Netzmodus.
 *
 * Standardbetrieb (TP_DASHBOARD_HOST unveraendert = 127.0.0.1, kein Passwort
 * gesetzt) bleibt exakt wie zuvor: `auth.required` ist dann `false`, es gibt
 * keine Anmeldeseite und keinen Unterschied zum bisherigen Verhalten.
 *
 * Sobald ein Passwort konfiguriert ist (per TP_DASHBOARD_PASSWORT oder Datei
 * $TP_PRIVAT_DIR/dashboard-passwort.txt), verlangt der Server fuer JEDE Route
 * (statisch und /api/*) eine gueltige Sitzung - unabhaengig davon, an welche
 * Adresse er gebunden ist. Startet der Prozess an einer anderen Adresse als
 * 127.0.0.1 ohne Passwort, verweigert er den Start (siehe requireStartupAuth).
 *
 * Kein Passwort und kein Hash werden geloggt. Der Passwortvergleich laeuft
 * zeitkonstant ueber SHA-256-Hashes (crypto.timingSafeEqual).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { leseBenutzer, benutzerDateiExistiert, authentifiziere, benutzerDateiPfad } from '../operations/lib/benutzer.mjs';

export const SESSION_COOKIE = 'tp_dashboard_sid';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 Stunden (ohne "angemeldet bleiben")
// Mit "an diesem Geraet angemeldet bleiben": der Ladenrechner soll morgens
// nicht nach dem Passwort fragen. Dafuer muessen Sitzungen auch einen
// Dienst-Neustart ueberleben - sonst wirft jedes Update alle Mitarbeiter raus.
export const SESSION_TTL_LANG_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage

const MAX_FAILS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000; // Fehlversuche zaehlen 15 Minuten
const LOCK_DURATION_MS = 5 * 60 * 1000; // Sperre nach zu vielen Fehlversuchen
const FAIL_DELAY_MS = 400; // bremst automatisiertes Raten je Versuch

/** Privatverzeichnis fuer nicht-oeffentliche Dateien (Konvention des Repos). */
export function privatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

export function sessionFilePath() {
  return path.join(privatDir(), 'dashboard-sitzungen.json');
}

export function passwordFilePath() {
  return path.join(privatDir(), 'dashboard-passwort.txt');
}

/** Liest das konfigurierte Passwort. Env geht vor Datei. Gibt null zurueck, wenn keins gesetzt ist. */
export function loadConfiguredPassword({ env = process.env, readFile = f => fs.readFileSync(f, 'utf8') } = {}) {
  const fromEnv = env.TP_DASHBOARD_PASSWORT;
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
  try {
    const raw = readFile(passwordFilePath());
    const trimmed = String(raw).trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

/** Liest die Benutzerliste frisch bei jedem Login-Versuch - `benutzer` (an-/abmelden) darf ohne Neustart wirken. */
export function ladeBenutzerliste({ readList = leseBenutzer, exists = benutzerDateiExistiert } = {}) {
  if (!exists()) return [];
  return readList();
}

/**
 * Baut das Auth-Objekt. `password` = null und keine benutzer.json bedeutet
 * Standardbetrieb ohne Anmeldung (auth.required === false).
 *
 * Sobald `$TP_PRIVAT_DIR/benutzer.json` existiert, laeuft die Anmeldung
 * ueber Name/Kuerzel + Passwort gegen diese Liste (Mehrbenutzerbetrieb). Das
 * alte Einzelpasswort bleibt zusaetzlich als Notzugang fuer den Inhaber
 * gueltig (Rolle "inhaber", Name "Inhaber"), solange keine benutzer.json
 * existiert.
 */
export function createAuth({ password = null, benutzerDatei = benutzerDateiPfad() } = {}) {
  const passwordHash = password ? sha256(password) : null;
  const hatBenutzerdatei = () => {
    try { return fs.existsSync(benutzerDatei); } catch { return false; }
  };
  const required = Boolean(password) || hatBenutzerdatei();
  // Schluessel ist der SHA-256 des Sitzungscookies, nie der Cookie selbst -
  // wer die Datei liest, kann sich damit nicht anmelden.
  const sessions = new Map(); // sidHash -> { expiresAt, benutzer }
  ladeSitzungen();
  const attempts = new Map(); // schluessel (ip::name) -> { count, firstFailAt, lockedUntil }

  function sidHash(sid) { return sha256(sid).toString('hex'); }

  function ladeSitzungen() {
    try {
      const roh = JSON.parse(fs.readFileSync(sessionFilePath(), 'utf8'));
      const now = Date.now();
      for (const [hash, eintrag] of Object.entries(roh?.sitzungen ?? {})) {
        if (eintrag?.expiresAt > now) sessions.set(hash, eintrag);
      }
    } catch { /* keine Datei, unlesbar oder kaputt - dann eben neu anmelden */ }
  }

  function speichereSitzungen() {
    const datei = sessionFilePath();
    try {
      fs.mkdirSync(path.dirname(datei), { recursive: true });
      fs.writeFileSync(datei, JSON.stringify({ sitzungen: Object.fromEntries(sessions) }), { mode: 0o600 });
    } catch { /* Sitzungen ueberleben dann keinen Neustart - kein Grund, die Anmeldung scheitern zu lassen */ }
  }

  function purgeExpiredSessions() {
    const now = Date.now();
    let entfernt = false;
    for (const [sid, s] of sessions) if (s.expiresAt <= now) { sessions.delete(sid); entfernt = true; }
    if (entfernt) speichereSitzungen();
  }

  /** Prueft Name+Passwort (Mehrbenutzerbetrieb) oder nur Passwort (Notzugang). Gibt Benutzerobjekt oder null zurueck. */
  function verifyLogin({ name = '', passwort = '' } = {}) {
    if (hatBenutzerdatei()) {
      const liste = ladeBenutzerliste({ exists: hatBenutzerdatei });
      const treffer = authentifiziere(liste, name, passwort);
      if (treffer) return treffer;
      // Notzugang bleibt gueltig, auch wenn schon eine benutzer.json existiert - der Inhaber darf sich nie aussperren.
      if (passwordHash && verifyPassword(passwort)) return { name: 'Inhaber', kuerzel: null, rolle: 'inhaber' };
      return null;
    }
    if (passwordHash && verifyPassword(passwort)) return { name: 'Inhaber', kuerzel: null, rolle: 'inhaber' };
    return null;
  }

  function verifyPassword(candidate) {
    if (!passwordHash) return false;
    const candidateHash = sha256(typeof candidate === 'string' ? candidate : '');
    // Beide Hashes sind SHA-256 (32 Byte) -> gleiche Laenge, sicher fuer timingSafeEqual.
    return crypto.timingSafeEqual(candidateHash, passwordHash);
  }

  function createSession(benutzer, { lang = false } = {}) {
    purgeExpiredSessions();
    const sid = crypto.randomBytes(32).toString('hex');
    sessions.set(sidHash(sid), { expiresAt: Date.now() + (lang ? SESSION_TTL_LANG_MS : SESSION_TTL_MS), benutzer });
    speichereSitzungen();
    return sid;
  }

  function validSession(sid) {
    if (!sid) return false;
    purgeExpiredSessions();
    return sessions.has(sidHash(sid));
  }

  /** Gibt den angemeldeten Benutzer ({name, kuerzel, rolle}) zurueck oder null. */
  function sessionBenutzer(sid) {
    if (!sid) return null;
    purgeExpiredSessions();
    return sessions.get(sidHash(sid))?.benutzer || null;
  }

  function destroySession(sid) {
    if (sid && sessions.delete(sidHash(sid))) speichereSitzungen();
  }

  function rateState(key) {
    let s = attempts.get(key);
    if (!s) { s = { count: 0, firstFailAt: 0, lockedUntil: 0 }; attempts.set(key, s); }
    return s;
  }

  function isLocked(key) {
    const s = rateState(key);
    if (s.lockedUntil && s.lockedUntil > Date.now()) return true;
    if (s.lockedUntil && s.lockedUntil <= Date.now()) { s.count = 0; s.lockedUntil = 0; }
    return false;
  }

  function registerFailure(key) {
    const s = rateState(key);
    const now = Date.now();
    if (!s.firstFailAt || now - s.firstFailAt > LOCK_WINDOW_MS) { s.firstFailAt = now; s.count = 0; }
    s.count += 1;
    if (s.count >= MAX_FAILS) s.lockedUntil = now + LOCK_DURATION_MS;
  }

  function registerSuccess(key) {
    attempts.delete(key);
  }

  return {
    get required() { return Boolean(password) || hatBenutzerdatei(); },
    verifyLogin,
    verifyPassword,
    createSession,
    validSession,
    sessionBenutzer,
    destroySession,
    isLocked,
    registerFailure,
    registerSuccess,
    failDelayMs: FAIL_DELAY_MS,
    lockDurationMs: LOCK_DURATION_MS,
  };
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function sessionCookieHeader(sid, { lang = false } = {}) {
  const maxAgeSec = Math.floor((lang ? SESSION_TTL_LANG_MS : SESSION_TTL_MS) / 1000);
  return `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

export function clearedCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** Anmeldeseite auf Deutsch, ohne externe Ressourcen (funktioniert auch ohne Sitzung). */
export function renderLoginPage({ error = null, mitBenutzern = benutzerDateiExistiert() } = {}) {
  const errorHtml = error
    ? `<p class="error" role="alert">${escapeHtml(error)}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Anmeldung – Teppich Paradies Control Center</title>
<meta name="robots" content="noindex, nofollow">
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#0f172a; color:#e2e8f0; display:flex; min-height:100vh; align-items:center; justify-content:center; margin:0; padding:16px; }
  main { background:#1e293b; border-radius:12px; padding:32px; width:100%; max-width:360px; box-shadow:0 10px 30px rgba(0,0,0,.4); }
  h1 { font-size:1.15rem; margin:0 0 4px; }
  p.hint { color:#94a3b8; font-size:.85rem; margin:0 0 20px; }
  label { display:block; font-size:.85rem; margin-bottom:6px; color:#cbd5e1; }
  input[type=password] { width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px; border:1px solid #334155; background:#0f172a; color:#e2e8f0; font-size:1rem; }
  button { margin-top:16px; width:100%; padding:10px 12px; border:0; border-radius:8px; background:#2563eb; color:#fff; font-size:1rem; cursor:pointer; }
  button:disabled { opacity:.6; cursor:default; }
  p.error { color:#fca5a5; background:#450a0a; border-radius:8px; padding:8px 10px; font-size:.85rem; margin:0 0 16px; }
  p.note { color:#64748b; font-size:.75rem; margin-top:20px; }
  label.bleiben { display:flex; align-items:center; gap:8px; margin:14px 0 0; font-size:.85rem; color:#cbd5e1; }
  label.bleiben input { width:auto; margin:0; }
</style>
</head>
<body>
<main>
  <h1>Control Center – Anmeldung</h1>
  <p class="hint">Nur für Inhaber, Admins und Mitarbeiter. Enthält Kundenbestellungen und Einkaufsdaten.</p>
  ${errorHtml}
  <form id="loginForm">
    ${mitBenutzern ? `<label for="name">Name oder Kürzel</label>
    <input type="text" id="name" name="name" autocomplete="username" autofocus required style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:1rem;margin-bottom:14px;">` : ''}
    <label for="pw">Passwort</label>
    <input type="password" id="pw" name="pw" autocomplete="current-password"${mitBenutzern ? '' : ' autofocus'} required>
    <label class="bleiben"><input type="checkbox" id="bleiben" checked> An diesem Gerät angemeldet bleiben</label>
    <button type="submit" id="submitBtn">Anmelden</button>
  </form>
  <p class="note">${mitBenutzern ? 'Eigener Zugang je Mitarbeiter. ' : 'Ein gemeinsames Passwort. Eigene Zugänge je Mitarbeiter legt der Inhaber an. '}Angemeldet bleiben hält 30 Tage – nur auf Geräten im Laden benutzen, nicht auf fremden. Verbindung im lokalen Netz ist unverschlüsselt (HTTP), dieses Passwort nirgendwo sonst verwenden.</p>
</main>
<script>
  const form = document.getElementById('loginForm');
  const btn = document.getElementById('submitBtn');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'Prüfe …';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('name')?.value || '',
          passwort: document.getElementById('pw').value,
          angemeldetBleiben: document.getElementById('bleiben').checked,
        }),
      });
      if (res.ok) { window.location.href = '/'; return; }
      const data = await res.json().catch(() => ({}));
      window.location.href = '/login?fehler=' + encodeURIComponent(data.error || 'Anmeldung fehlgeschlagen');
    } catch {
      window.location.href = '/login?fehler=' + encodeURIComponent('Verbindung fehlgeschlagen');
    }
  });
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
