/**
 * Gemeinsame Bausteine fuer die Anmeldung von Control Center (scripts/dashboard-auth.mjs,
 * scripts/serve-dashboard.mjs) und Social-Zentrale (social/scripts/server.mjs).
 * Rundgang 26.10.2026, Massnahme 58:
 *
 * 1. Fingerabdruck des gemeinsamen Passworts (Notzugang): jede Notzugang-Sitzung merkt sich,
 *    mit welchem Passwort sie entstand. Wird das Passwort geaendert (Datei bzw. Umgebung,
 *    danach Dienst-Neustart), passt der Abdruck nicht mehr und die Sitzung ist weg. Vorher
 *    galt eine Notzugang-Sitzung bis zu 30 Tage ohne jede Pruefung weiter.
 * 2. Sperre je Geraet: ueber `tailscale serve` kommt jedes Geraet als 127.0.0.1 an. Fuenf
 *    Tippfehler eines Mitarbeiters sperrten damit alle Geraete. Nur bei Verbindungen von
 *    127.0.0.1 wird der Kopf des Tailscale-Proxys gelesen - von jeder anderen Adresse waere
 *    er faelschbar und bleibt unbeachtet.
 * 3. "Alle anderen Geraete abmelden": ein Zeitstempel im privaten Ordner, den die
 *    Social-Zentrale (eigener Prozess, Sitzungen im Speicher) bei jedem Zugriff beachtet.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

// Fester Zusatz statt Zufallssalz: der Abdruck muss nach jedem Neustart gleich ausfallen.
// Das Passwort selbst liegt ohnehin im selben privaten Ordner (dashboard-passwort.txt);
// der Abdruck verraet nichts darueber hinaus und taugt nicht zum Anmelden.
const ABDRUCK_ZUSATZ = 'tp-notzugang-abdruck-v1';

/** Kurzer, langsam zu berechnender Abdruck des Passworts - null ohne Passwort. */
export function passwortAbdruck(passwort) {
  if (typeof passwort !== 'string' || !passwort) return null;
  return crypto.scryptSync(passwort, ABDRUCK_ZUSATZ, 12).toString('hex');
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Wer versucht sich anzumelden? Gibt { schluessel, anzeige } zurueck.
 * - Direkte Verbindung (LAN, Tailnet-IP auf Port 8001): die Adresse des Geraets, wie bisher.
 * - Von 127.0.0.1 mit Tailscale-Kopf: die Tailnet-Adresse aus X-Forwarded-For (letzter
 *   Eintrag - den setzt der Proxy, fruehere koennte der Browser mitgeschickt haben), sonst
 *   das Tailscale-Konto. Ohne Kopf (Zugriff am Mac selbst) bleibt es 127.0.0.1.
 */
export function anmeldeGeraet(req) {
  const adresse = String(req?.socket?.remoteAddress || 'unbekannt');
  if (!LOOPBACK.has(adresse)) return { schluessel: adresse, anzeige: adresse };
  const kopf = req?.headers || {};
  const weitergeleitet = String(kopf['x-forwarded-for'] || '').split(',').map(t => t.trim()).filter(Boolean).pop();
  if (weitergeleitet && net.isIP(weitergeleitet) && !LOOPBACK.has(weitergeleitet)) {
    return { schluessel: `tailnet:${weitergeleitet}`, anzeige: weitergeleitet };
  }
  const konto = String(kopf['tailscale-user-login'] || '').trim().toLowerCase();
  // Das Konto ist eine Mailadresse: als Sperrschluessel ja, im Protokoll nicht.
  if (konto && konto.length <= 200) return { schluessel: `tailnet-konto:${konto}`, anzeige: 'Tailnet' };
  return { schluessel: adresse, anzeige: adresse };
}

export function abmeldeDatei(dir) {
  return path.join(dir, 'geraete-abgemeldet.json');
}

/** Zeitpunkt (ms) von "Alle anderen Geraete abmelden" - 0, wenn nie geklickt oder unlesbar. */
export function leseAbmeldeStand(dir) {
  try {
    const t = Date.parse(JSON.parse(fs.readFileSync(abmeldeDatei(dir), 'utf8'))?.ab);
    return Number.isFinite(t) ? t : 0;
  } catch { return 0; }
}

export function setzeAbmeldeStand(dir, jetzt = Date.now()) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(abmeldeDatei(dir), JSON.stringify({ ab: new Date(jetzt).toISOString() }), { mode: 0o600 });
  return jetzt;
}

/** Leser mit Merker: liest die Datei nur neu, wenn sie sich geaendert hat (je Anfrage ein stat). */
export function abmeldeStandLeser(dir) {
  let stempel = null;
  let stand = 0;
  return () => {
    let st;
    try { st = fs.statSync(abmeldeDatei(dir)); } catch { stempel = null; stand = 0; return 0; }
    const neu = `${st.mtimeMs}:${st.size}`;
    if (neu !== stempel) { stempel = neu; stand = leseAbmeldeStand(dir); }
    return stand;
  };
}
