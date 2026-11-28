/**
 * Zugangs-Waechter: prueft nur lesend, ob die Anmeldungen der Werkzeuge und Dienste noch gelten,
 * damit ein abgelaufener Zugang auffaellt, bevor Arbeit daran haengen bleibt (AGENTS.md,
 * "Anmeldungen und Freigaben"). Er meldet sich nirgends neu an und prueft weder Bank noch
 * Zahlungsdienste.
 *
 * Zustand je Zugang: "ok", "rot" (Anmeldung abgelehnt oder abgelaufen - ein Mensch muss ran) oder
 * "unklar" (Netz, Zeitlimit, Programm fehlt). "unklar" macht aus "rot" nie "ok".
 *
 * Gespeichert werden nur Zugang, Zustand, Zeiten und der feste Handgriff - nie Ausgaben der
 * Befehle, Kontonamen oder Zugangsdaten.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { liesStatus } from './routinen.mjs';

export const STORE = 'sjjyq1-6w.myshopify.com';
const ZEITLIMIT_MS = 60_000;
/** Aeltere Ergebnisse der Postfach-Dienste sagen nichts mehr (Sonntag liegt dazwischen). */
const POSTFACH_GILT_MS = 72 * 3_600_000;
const POSTFACH_DIENSTE = ['lieferbelege', 'serviceanfragen', 'postfach-entwuerfe'];

export function statusPfad(privat) {
  return path.join(privat, 'zugaenge', 'status.json');
}

/** Befehl ausfuehren; Ausgabe und Fehlertext bleiben im Speicher. */
function lauf(ausfuehren, bin, args, optionen) {
  try {
    return { ok: true, text: String(ausfuehren(bin, args, { encoding: 'utf8', timeout: ZEITLIMIT_MS, stdio: ['ignore', 'pipe', 'pipe'], ...optionen }) ?? '') };
  } catch (e) {
    const abgebrochen = e?.code === 'ENOENT' || e?.code === 'ETIMEDOUT' || Boolean(e?.signal);
    return { ok: false, abgebrochen, text: `${e?.stdout || ''}\n${e?.stderr || ''}` };
  }
}

/** Rot nur bei einem erkannten Anmeldefehler, alles andere Gescheiterte ist unklar. */
function ausFehlertext(ergebnis, muster) {
  if (ergebnis.ok) return 'ok';
  return !ergebnis.abgebrochen && muster.test(ergebnis.text) ? 'rot' : 'unklar';
}

/** Ohne USER findet claude die Abo-Anmeldung im Schluesselbund nicht (siehe scripts/claude-lauf.mjs). */
function claudeUmgebung(env) {
  const sauber = Object.fromEntries(Object.entries(env).filter(([k]) => !/^(CLAUDE|ANTHROPIC_)/.test(k)));
  return { ...sauber, USER: env.USER || os.userInfo().username };
}

function pruefeClaude({ ausfuehren, env, heim }) {
  const lokal = path.join(heim, '.local', 'bin', 'claude');
  const r = lauf(ausfuehren, fs.existsSync(lokal) ? lokal : 'claude', ['auth', 'status'], { env: claudeUmgebung(env) });
  // Abgemeldet endet der Befehl mit Exit 1, das JSON steht trotzdem auf stdout.
  try {
    const { loggedIn } = JSON.parse(r.text.trim());
    if (loggedIn === true) return 'ok';
    if (loggedIn === false) return 'rot';
  } catch { /* keine lesbare Antwort */ }
  return 'unklar';
}

function pruefeGithub({ ausfuehren, env }) {
  const r = lauf(ausfuehren, 'gh', ['auth', 'status', '--active', '--hostname', 'github.com'], { env });
  return ausFehlertext(r, /not logged in|is invalid/i);
}

function pruefeAppsScript({ ausfuehren, env, heim }) {
  const app = path.join(heim, 'Developer', 'tp-auftrags-app');
  const r = lauf(ausfuehren, path.join(app, 'node_modules', '.bin', 'clasp'), ['list-versions'], { env, cwd: app });
  return ausFehlertext(r, /invalid_rapt|invalid_grant|no credentials|not logged in|clasp login|reauth/i);
}

function pruefeShopify({ ausfuehren, env }) {
  const r = lauf(ausfuehren, 'shopify', ['store', 'execute', '-s', STORE, '-j', '--no-input', '-q', 'query { shop { id } }'], { env });
  return ausFehlertext(r, /store auth|no stored|\b401\b|unauthorized|invalid[^\n]{0,40}token/i);
}

/**
 * Das Firmenpostfach meldet dieser Waechter nie selbst an: Er liest, was die Postfach-Dienste bei
 * ihrer Vorpruefung festgehalten haben. Die juengste Aussage gilt.
 */
function pruefePostfach({ privat, jetzt }) {
  let juengste = null;
  for (const id of POSTFACH_DIENSTE) {
    let s;
    try { s = liesStatus(privat, id); } catch { continue; }
    const zeit = Date.parse(s.zeit);
    if (!zeit || jetzt.getTime() - zeit > POSTFACH_GILT_MS) continue;
    const text = `${s.vorpruefungGrund || ''}\n${s.meldung || ''}`;
    let zustand = null;
    if (/IMAP-Anmeldung abgelehnt/.test(text)) zustand = 'rot';
    else if (/Vorprüfung nicht möglich|abgeschaltet|erzwungen/.test(text)) zustand = null;
    else if (s.vorpruefungGrund) zustand = 'ok';
    if (zustand && (!juengste || zeit > juengste.zeit)) juengste = { zeit, zustand };
  }
  return juengste?.zustand || 'unklar';
}

export const ZUGAENGE = [
  { id: 'claude', name: 'Claude-Abo (Mac-Dienste)', handgriff: 'Am Mac im Terminal `claude auth login` ausführen und im Browser bestätigen.', pruefen: pruefeClaude },
  { id: 'github', name: 'GitHub', handgriff: 'Im Terminal `gh auth login` ausführen; den angezeigten Code auf github.com/login/device eingeben (geht am Handy).', pruefen: pruefeGithub },
  { id: 'apps-script', name: 'Apps Script (Auftrags-App)', handgriff: 'Am Mac in ~/Developer/tp-auftrags-app `npx clasp login` ausführen und bestätigen.', pruefen: pruefeAppsScript },
  { id: 'shopify', name: 'Shopify CLI', handgriff: 'Am Mac die Store-Anmeldung der Shopify CLI erneuern (`shopify store auth`).', pruefen: pruefeShopify },
  { id: 'postfach', name: 'Firmenpostfach (App-Passwort)', handgriff: 'Neues App-Passwort selbst in nachfassen/postfach.json eintragen bzw. IMAP im Postfach freigeben.', pruefen: pruefePostfach },
];

export function leseStatus(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { zugaenge: {} }; }
}

export function schreibeStatus(file, status) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(status, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Neuer Eintrag aus Ergebnis und Vorstand; `seit` ist der Beginn des aktuellen Zustands. */
function eintrag({ id, name, handgriff }, ergebnis, alt, jetzt) {
  const zustand = ergebnis === 'unklar' && alt?.zustand === 'rot' ? 'rot' : ergebnis;
  const seit = alt?.zustand === zustand && alt.seit ? alt.seit : jetzt;
  return { id, name, handgriff, zustand, seit, geprueft: jetzt };
}

/** @returns {{ status: object, neuRot: object[] }} */
export function pruefeZugaenge({ privat, vorher = { zugaenge: {} }, jetzt = new Date(), heim = os.homedir(), env = process.env, ausfuehren = execFileSync }) {
  const zeit = jetzt.toISOString();
  const zugaenge = {};
  const neuRot = [];
  for (const z of ZUGAENGE) {
    const alt = vorher.zugaenge?.[z.id];
    const neu = eintrag(z, z.pruefen({ ausfuehren, env, heim, privat, jetzt }), alt, zeit);
    zugaenge[z.id] = neu;
    if (neu.zustand === 'rot' && alt?.zustand !== 'rot') neuRot.push(neu);
  }
  return { status: { stand: zeit, zugaenge }, neuRot };
}
