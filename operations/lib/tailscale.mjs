/**
 * Ist Tailscale auf diesem Rechner verbunden?
 *
 * Von unterwegs (Handy, zu Hause) erreicht man das Control Center nur ueber
 * Tailscale (docs/control-center/ARCHITEKTUR.md, 1d). Ist Tailscale am Mac mini
 * gestoppt, merkt das im Laden niemand - erst der Inhaber am Abend, wenn die
 * Seite nicht laedt. Diese Pruefung liest nur (`tailscale status --json`); sie
 * startet und verbindet nichts.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/** Die Standalone-App legt die CLI nicht in den PATH (ARCHITEKTUR 1d); Homebrew und Linux daneben. */
export const TAILSCALE_PFADE = Object.freeze([
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
  '/opt/homebrew/bin/tailscale',
  '/usr/local/bin/tailscale',
  '/usr/bin/tailscale',
]);

/**
 * Zustand aus der JSON-Antwort. BackendState kennt u. a. Running, Stopped,
 * Starting, NeedsLogin, NeedsMachineAuth, NoState.
 *   laeuft      verbunden
 *   gestoppt    in der App ausgeschaltet ("Tailscale is stopped.")
 *   abgemeldet  Anmeldung oder Freigabe des Geraets noetig
 *   startet     verbindet gerade
 *   unbekannt   alles andere
 */
export function werteAus(antwort) {
  const zustand = String(antwort?.BackendState || '');
  const status = zustand === 'Running' ? 'laeuft'
    : zustand === 'Stopped' ? 'gestoppt'
      : (zustand === 'NeedsLogin' || zustand === 'NeedsMachineAuth') ? 'abgemeldet'
        : zustand === 'Starting' ? 'startet'
          : 'unbekannt';
  return { status, zustand: zustand || null };
}

/** Muss jemand etwas tun? Nur dann zeigt die Oberflaeche ueberhaupt etwas an. */
export function brauchtHandlung(stand) {
  return stand?.status === 'gestoppt' || stand?.status === 'abgemeldet';
}

/**
 * Fragt die CLI. Faellt nie mit einer Ausnahme aus: ohne Tailscale auf dem
 * Rechner heisst das Ergebnis "nicht-installiert", bei einem Fehler "unbekannt".
 * TP_TAILSCALE_PRUEFEN=0 schaltet die Pruefung ab (Tests, andere Rechner).
 */
export async function leseTailscaleStatus({
  pfade = TAILSCALE_PFADE, existiert = fs.existsSync, ausfuehren = execFileP, env = process.env, jetzt = () => new Date(),
} = {}) {
  const geprueftAm = jetzt().toISOString();
  if (env.TP_TAILSCALE_PRUEFEN === '0') return { status: 'nicht-geprueft', zustand: null, geprueftAm };
  const pfad = pfade.find(p => { try { return existiert(p); } catch { return false; } });
  if (!pfad) return { status: 'nicht-installiert', zustand: null, geprueftAm };
  try {
    const { stdout } = await ausfuehren(pfad, ['status', '--json'], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
    return { ...werteAus(JSON.parse(String(stdout))), geprueftAm };
  } catch (e) {
    // Manche Versionen beenden sich bei gestopptem Dienst mit Exit 1, liefern das JSON aber trotzdem.
    try { if (e?.stdout) return { ...werteAus(JSON.parse(String(e.stdout))), geprueftAm }; } catch { /* kein JSON */ }
    return { status: 'unbekannt', zustand: null, geprueftAm, meldung: String(e?.message || e).split('\n')[0].slice(0, 200) };
  }
}
