/**
 * Kachel „Laden" auf „Heute": Zahlen aus der Auftrags-App (Laden-Modus, Paket L7).
 *
 * Die Auftrags-App (Google Apps Script, eigenes Repository) beantwortet
 * `<App-URL>?ansicht=zahlen&s=<Schluessel>` mit reinen Zahlen - offene Beratungen,
 * faellige Wiedervorlagen, offene Angebote, Faelle aus dem Shop, gewonnen/verloren und
 * (ab App-Version 43) Faelle aus dem Shop mit Spam-Verdacht. Nie Namen oder Kundendaten.
 *
 * Abgerufen wird hier im Server und nicht im Browser:
 *  - Apps Script schickt keine CORS-Kopfzeilen, ein fetch() aus der Seite scheitert.
 *  - Der Schluessel bleibt auf dem Mac; der Browser bekommt nur die Zahlen und den
 *    Link auf die Laden-Ansicht.
 *
 * URL und Schluessel stehen NICHT im Repository (oeffentlich), sondern wie der
 * Shopify-Zugang in `.env.local` im Ordner des Dienstes (gitignored) oder als
 * Umgebungsvariable:
 *
 *   LADEN_ZAHLEN_URL=https://script.google.com/macros/s/<Deployment-ID>/exec
 *   LADEN_ZAHLEN_SCHLUESSEL=<derselbe Wert wie die Script-Property LADEN_ZAHLEN_SCHLUESSEL>
 *
 * Fehlt eines davon, ist die Kachel „nicht eingerichtet" - kein Fehler.
 * Die Datei wird bei jedem Abruf neu gelesen; ein Eintrag wirkt also ohne Neustart.
 *
 * Antwort an den Browser (GET /api/laden/zahlen):
 *   { eingerichtet: false }
 *   { eingerichtet: true, erreichbar: true,  zahlen: {...}, stand, abgerufen, ladenUrl }
 *   { eingerichtet: true, erreichbar: false, grund, abgerufen, ladenUrl }
 * grund: 'kein-zugriff' (Schluessel passt nicht), 'zeitlimit', 'netz', 'http', 'antwort'.
 *
 * Zwischenspeicher: eine erfolgreiche Antwort gilt 5 Minuten, ein Fehlschlag 1 Minute
 * (sonst haengt jedes Neuzeichnen von „Heute" am Zeitlimit). Gleichzeitige Anfragen
 * teilen sich einen Abruf. Geloggt wird nur der Grund, nie die URL - in ihr steht der
 * Schluessel.
 */
import path from 'node:path';
import { ladeEnvLocal } from '../operations/sync/zugang.mjs';

/** Felder, die durchgereicht werden - alles andere aus der Antwort faellt weg. */
export const LADEN_ZAHLEN_FELDER = Object.freeze([
  'offen', 'neu', 'angebot', 'nachfassen', 'faellig', 'ausShop7Tage', 'gewonnen30Tage', 'verloren30Tage', 'angeboteOffen', 'spamVerdacht',
]);
/**
 * Felder, die aeltere App-Versionen noch nicht liefern (spamVerdacht erst ab Version 43).
 * Fehlen sie, gelten sie als 0 - sonst stuende die Kachel bis zum Update der App auf
 * „nicht erreichbar". Sind sie da, gilt dieselbe Pruefung wie fuer alle anderen.
 */
export const LADEN_ZAHLEN_SPAETER = Object.freeze(['spamVerdacht']);
export const LADEN_CACHE_MS = 5 * 60_000;
export const LADEN_FEHLER_CACHE_MS = 60_000;
export const LADEN_ZEITLIMIT_MS = 15_000;
// Die echte Antwort ist rund 250 Zeichen lang. Alles deutlich Groessere ist keine Zahlenantwort
// (z. B. eine Google-Anmeldeseite, wenn die Web-App nicht oeffentlich ausgerollt ist).
const MAX_ANTWORT = 8 * 1024;

/**
 * Konfiguration lesen: Umgebung vor `.env.local` (wie der Shopify-Zugang in dashboard-api.mjs).
 * TP_ENV_LOCAL nennt eine andere Datei - die Tests zeigen damit ins Leere.
 * Rueckgabe null = nicht eingerichtet. Nur https://script.google.com wird angenommen, damit ein
 * Tippfehler den Schluessel nicht an einen fremden Rechner schickt.
 */
export function ladenKonfig({ root, env = process.env } = {}) {
  const datei = env.TP_ENV_LOCAL || path.join(root || process.cwd(), '.env.local');
  const werte = { ...ladeEnvLocal(datei), ...env };
  const roh = String(werte.LADEN_ZAHLEN_URL || '').trim();
  const schluessel = String(werte.LADEN_ZAHLEN_SCHLUESSEL || '').trim();
  if (!roh || !schluessel) return null;
  let u;
  try { u = new URL(roh); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'script.google.com') return null;
  u.search = '';
  u.hash = '';
  return { basis: u.toString(), schluessel };
}

/** Link auf die Laden-Ansicht der Auftrags-App (ohne Schluessel). */
export function ladenUrl(basis) {
  const u = new URL(basis);
  u.searchParams.set('ansicht', 'laden');
  return u.toString();
}

/**
 * Antwort der Auftrags-App pruefen: genau die bekannten Felder, jedes eine ganze Zahl >= 0.
 * Fehlt eines oder ist eines keine Zahl, gilt die ganze Antwort als unbrauchbar (null) -
 * lieber „nicht erreichbar" als eine halbe, falsche Kachel. Ausnahme: ein fehlendes Feld aus
 * LADEN_ZAHLEN_SPAETER (aeltere App-Version) zaehlt als 0.
 */
export function zahlenAus(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const zahlen = {};
  for (const f of LADEN_ZAHLEN_FELDER) {
    const n = j[f] === undefined && LADEN_ZAHLEN_SPAETER.includes(f) ? 0 : j[f];
    if (!Number.isInteger(n) || n < 0) return null;
    zahlen[f] = n;
  }
  const stand = typeof j.stand === 'string' && !Number.isNaN(Date.parse(j.stand)) ? new Date(j.stand).toISOString() : null;
  return { zahlen, stand };
}

async function holen(konfig, fetchFn, zeitlimitMs) {
  const ziel = new URL(konfig.basis);
  ziel.searchParams.set('ansicht', 'zahlen');
  ziel.searchParams.set('s', konfig.schluessel);
  let r;
  try {
    // Apps Script leitet /exec auf script.googleusercontent.com weiter - folgen.
    r = await fetchFn(ziel, { redirect: 'follow', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(zeitlimitMs) });
  } catch (e) {
    return { erreichbar: false, grund: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'zeitlimit' : 'netz' };
  }
  if (!r.ok) return { erreichbar: false, grund: 'http' };
  let j;
  try {
    const text = await r.text();
    if (text.length > MAX_ANTWORT) return { erreichbar: false, grund: 'antwort' };
    j = JSON.parse(text);
  } catch (e) {
    return { erreichbar: false, grund: e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'zeitlimit' : 'antwort' };
  }
  if (j && j.fehler === 'kein Zugriff') return { erreichbar: false, grund: 'kein-zugriff' };
  const geprueft = zahlenAus(j);
  if (!geprueft) return { erreichbar: false, grund: 'antwort' };
  return { erreichbar: true, ...geprueft };
}

/**
 * Abrufer mit Zwischenspeicher. fetch, jetzt und env sind fuer Tests injizierbar.
 * abrufen() wirft nie.
 */
export function createLadenZahlen({ root, env = process.env, fetch: fetchFn = globalThis.fetch, jetzt = Date.now, zeitlimitMs = LADEN_ZEITLIMIT_MS, log = console } = {}) {
  let cache = null;   // { kennung, bis, antwort }
  let laeuft = null;  // { kennung, promise }

  async function abrufen() {
    const konfig = ladenKonfig({ root, env });
    if (!konfig) return { eingerichtet: false };
    // Andere URL oder anderer Schluessel in .env.local: alten Stand nicht weiter zeigen.
    const kennung = `${konfig.basis}\n${konfig.schluessel}`;
    if (cache && cache.kennung === kennung && jetzt() < cache.bis) return cache.antwort;
    if (laeuft && laeuft.kennung === kennung) return laeuft.promise;
    const promise = (async () => {
      let erg;
      try { erg = await holen(konfig, fetchFn, zeitlimitMs); } catch { erg = { erreichbar: false, grund: 'netz' }; }
      if (!erg.erreichbar) log?.warn?.(`[laden-zahlen] Auftrags-App nicht abrufbar: ${erg.grund}`);
      const antwort = { eingerichtet: true, ...erg, abgerufen: new Date(jetzt()).toISOString(), ladenUrl: ladenUrl(konfig.basis) };
      cache = { kennung, bis: jetzt() + (erg.erreichbar ? LADEN_CACHE_MS : LADEN_FEHLER_CACHE_MS), antwort };
      return antwort;
    })();
    laeuft = { kennung, promise };
    try { return await promise; } finally { if (laeuft?.promise === promise) laeuft = null; }
  }

  return { abrufen, _leeren() { cache = null; } };
}
