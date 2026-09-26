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
import {
  leseBenutzer, benutzerDateiExistiert, authentifiziere, benutzerDateiPfad, findeAktivenBenutzer,
} from '../operations/lib/benutzer.mjs';

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

  /**
   * Der Benutzer zu einer Sitzung - bei JEDEM Zugriff frisch aus benutzer.json.
   *
   * Frueher lag im Sitzungsobjekt eine Kopie vom Anmeldezeitpunkt. Wer gesperrt
   * oder herabgestuft wurde, arbeitete damit bis zu 30 Tage weiter, als waere
   * nichts geschehen. Jetzt entscheidet die Datei, nicht die Erinnerung.
   *
   * Rueckgabe: { gueltig, benutzer }. Der Notzugang (Einzelpasswort, kein
   * Benutzereintrag) hat kein Kuerzel und bleibt unveraendert gueltig.
   */
  function loeseSitzungAuf(sid) {
    if (!sid) return { gueltig: false, benutzer: null };
    purgeExpiredSessions();
    const eintrag = sessions.get(sidHash(sid));
    if (!eintrag) return { gueltig: false, benutzer: null };

    const kuerzel = eintrag.benutzer?.kuerzel || null;
    if (!kuerzel) return { gueltig: true, benutzer: eintrag.benutzer || null };   // Notzugang

    const aktuell = findeAktivenBenutzer(leseBenutzer(benutzerDatei), kuerzel);
    if (!aktuell) {
      // Gesperrt oder geloescht: die Sitzung ist wertlos und verschwindet sofort.
      if (sessions.delete(sidHash(sid))) speichereSitzungen();
      return { gueltig: false, benutzer: null };
    }
    return { gueltig: true, benutzer: { name: aktuell.name, kuerzel: aktuell.kuerzel, rolle: aktuell.rolle } };
  }

  function validSession(sid) {
    return loeseSitzungAuf(sid).gueltig;
  }

  /** Gibt den angemeldeten Benutzer ({name, kuerzel, rolle}) zurueck oder null. */
  function sessionBenutzer(sid) {
    return loeseSitzungAuf(sid).benutzer;
  }

  function destroySession(sid) {
    if (sid && sessions.delete(sidHash(sid))) speichereSitzungen();
  }

  /**
   * Alle Sitzungen eines Zugangs beenden - nach Sperre, Rollenwechsel oder
   * neuem Passwort. Die frische Aufloesung in loeseSitzungAuf() faengt das
   * ohnehin ab; hier verschwindet zusaetzlich der Eintrag, damit niemand mit
   * einem alten Cookie noch auf der Oberflaeche steht.
   */
  function sitzungenVerwerfen(kuerzel) {
    if (!kuerzel) return 0;
    const gesucht = String(kuerzel).trim().toLowerCase();
    let weg = 0;
    for (const [hash, eintrag] of sessions) {
      if (String(eintrag.benutzer?.kuerzel || '').trim().toLowerCase() === gesucht) {
        sessions.delete(hash); weg += 1;
      }
    }
    if (weg) speichereSitzungen();
    return weg;
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
    sitzungenVerwerfen,
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
<meta name="theme-color" content="#0d0c0b">
<style>
  :root { color-scheme:dark; }
  * { box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#0d0c0b; color:#f4efea; display:grid; min-height:100vh; place-items:center; margin:0; padding:24px 16px; }
  body::before { content:""; position:fixed; inset:0; pointer-events:none; background:radial-gradient(circle at 50% -10%,rgba(152,80,47,.28),transparent 34rem); }
  main { position:relative; background:linear-gradient(145deg,#1b1816,#151311); border:1px solid #382f2a; border-radius:22px; padding:34px; width:100%; max-width:430px; box-shadow:0 28px 80px rgba(0,0,0,.46); }
  .brand { display:flex; align-items:center; gap:12px; margin-bottom:28px; }
  .mark { position:relative; width:42px; height:42px; flex:none; overflow:hidden; border-radius:13px; background:linear-gradient(145deg,#d08a5f,#8e4529); box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),0 8px 20px rgba(0,0,0,.28); }
  .mark::before,.mark::after { content:""; position:absolute; inset:8px; border:1px solid rgba(255,255,255,.48); border-radius:5px; transform:rotate(45deg); }
  .mark::after { inset:13px; border-color:rgba(255,255,255,.8); }
  .brand strong { display:block; font-size:1rem; letter-spacing:-.01em; }
  .brand small { display:block; margin-top:1px; color:#aa9c93; font-size:.68rem; font-weight:650; letter-spacing:.13em; text-transform:uppercase; }
  h1 { font-size:1.55rem; letter-spacing:-.025em; margin:0 0 7px; }
  p.hint { color:#b9ada5; font-size:.9rem; line-height:1.5; margin:0 0 24px; }
  label { display:block; font-size:.85rem; font-weight:600; margin-bottom:7px; color:#d5cbc4; }
  input[type=text],input[type=password] { width:100%; padding:12px 13px; border-radius:10px; border:1px solid #4b433d; background:#0f0e0d; color:#f4efea; font:inherit; margin-bottom:16px; outline:none; }
  input:focus { border-color:#d68b65; box-shadow:0 0 0 3px rgba(214,139,101,.16); }
  button { margin-top:18px; width:100%; min-height:46px; padding:11px 14px; border:1px solid #bd704b; border-radius:11px; background:linear-gradient(145deg,#bd6b45,#914729); color:#fff; font-size:1rem; font-weight:650; cursor:pointer; box-shadow:0 8px 22px rgba(0,0,0,.24); }
  button:hover { background:linear-gradient(145deg,#ca7951,#9e4f30); }
  button:disabled { opacity:.6; cursor:default; }
  p.error { color:#ffaaa3; background:#3b1b19; border:1px solid #66302c; border-radius:10px; padding:10px 12px; font-size:.85rem; margin:0 0 18px; }
  p.note { color:#91857d; font-size:.76rem; line-height:1.5; margin:22px 0 0; }
  label.bleiben { display:flex; align-items:flex-start; gap:9px; margin:0; font-size:.85rem; font-weight:500; line-height:1.35; color:#c7bbb3; }
  label.bleiben input { width:auto; margin:0; }
  @media (max-width:480px) { body { padding:12px; } main { padding:25px 22px; border-radius:18px; } .brand { margin-bottom:23px; } }
</style>
</head>
<body>
<main>
  <div class="brand"><span class="mark" aria-hidden="true"></span><span><strong>Teppich Paradies</strong><small>Control Center</small></span></div>
  <h1>Willkommen zurück</h1>
  <p class="hint">Hier arbeiten Inhaber und Mitarbeiter gemeinsam mit Kundenaufträgen, Einkauf und Tagesaufgaben.</p>
  ${errorHtml}
  <form id="loginForm">
    ${mitBenutzern ? `<label for="name">Name oder Kürzel</label>
    <input type="text" id="name" name="name" autocomplete="username" autofocus required>` : ''}
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
