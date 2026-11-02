#!/usr/bin/env node
/**
 * Lokaler Server des Control Centers.
 *
 *   npm run dashboard          # issues.json + bodenwissen.json erzeugen + Server
 *   npm run dashboard:serve    # nur Server (nutzt vorhandene issues.json)
 *
 * Liefert docs/ai-dashboard statisch (noetig, weil fetch() unter file://
 * blockiert wird) und stellt unter /api die lokale Aktions-API bereit
 * (scripts/dashboard-api.mjs).
 *
 * Standard: bindet ausschliesslich an 127.0.0.1, kein Verhaltenswechsel ohne
 * Absicht. Ueber TP_DASHBOARD_HOST (z. B. 0.0.0.0) und PORT im Firmennetz
 * erreichbar machen - dafuer MUSS ein Passwort gesetzt sein
 * (TP_DASHBOARD_PASSWORT oder $TP_PRIVAT_DIR/dashboard-passwort.txt), sonst
 * verweigert der Prozess den Start. Ist ein Passwort gesetzt, verlangt JEDE
 * Route (statisch und /api/*) eine gueltige Sitzung - auch auf 127.0.0.1.
 * Siehe scripts/dashboard-auth.mjs und docs/control-center/ARCHITEKTUR.md.
 *
 * Schreibende Requests werden nur als JSON mit passendem Host/Origin
 * akzeptiert - ein fremder Tab im Browser kann die API nicht ueber ein
 * Formular ansprechen.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createApi, ApiError } from './dashboard-api.mjs';
import { leseVersandtarife } from '../operations/lib/versandtarife.mjs';
import { createLadenZahlen } from './laden-zahlen.mjs';
import {
  createAuth, loadConfiguredPassword, parseCookies, sessionCookieHeader,
  clearedCookieHeader, renderLoginPage, sleep, SESSION_COOKIE, privatDir,
} from './dashboard-auth.mjs';
import { leseBenutzer, benutzerDateiExistiert, benutzerDateiPfad } from '../operations/lib/benutzer.mjs';
import { protokollPfad, letzteEintraege, protokolliere } from '../operations/lib/protokoll.mjs';
import { anmeldeGeraet, setzeAbmeldeStand } from '../operations/lib/anmeldeschutz.mjs';
import { logFehler, pfadOhneAbfrage } from './dashboard-log.mjs';
import { beimEndeLoeschen } from './dashboard-datenkopie.mjs';
import { dienstversion } from './dashboard-version.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const ROOT = resolve(REPO_ROOT, 'docs/ai-dashboard');
const DIENSTVERSION = dienstversion(REPO_ROOT);
const PORT = Number(process.env.PORT || 8001);
const HOST = process.env.TP_DASHBOARD_HOST || '127.0.0.1';
const MAX_BODY = 64 * 1024;
/**
 * Fotos und Anhaenge kommen als base64 im JSON an - base64 macht aus drei
 * Bytes vier. Mit 64 KB brach der Server jeden Upload mit 413 ab, waehrend die
 * Oberflaeche "bis 10 MB je Datei" zusagte: der Fotoeingang konnte so nie
 * funktionieren. Nur diese beiden Pfade duerfen mehr; alle anderen bleiben
 * klein, weil dieser Server den Koerper vollstaendig im Speicher haelt und
 * eine grosszuegige Grenze auf jedem Pfad ein bequemer Weg waere, ihn
 * lahmzulegen.
 *
 * Das Frontend verkleinert Bilder vorher auf 2000 px lange Kante (~300 KB je
 * Foto), 24 MB sind damit reichlich Reserve fuer 20 Fotos plus Formularfelder.
 */
const MAX_BODY_UPLOAD = 24 * 1024 * 1024;

const CONFIGURED_PASSWORD = loadConfiguredPassword();
export const auth = createAuth({ password: CONFIGURED_PASSWORD });

/** Wirft, wenn der Netzmodus ohne Passwort gestartet werden soll. Vor jedem listen() pruefen. */
export function assertStartupAllowed({ host = HOST, authObj = auth } = {}) {
  if (host !== '127.0.0.1' && !authObj.required) {
    throw new Error(
      `Start verweigert: TP_DASHBOARD_HOST=${host} (Netzmodus) verlangt ein gesetztes Passwort. ` +
      'TP_DASHBOARD_PASSWORT setzen oder $TP_PRIVAT_DIR/dashboard-passwort.txt anlegen.'
    );
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const execFileP = promisify(execFile);
// Beide Datendateien entstehen seit 2026-09-30 nur noch lokal (nicht mehr per
// Workflow auf main): issues.json aus GitHub (gh), bodenwissen.json aus content/.
async function baueNeu() {
  await execFileP(process.execPath, [join(HERE, 'build-dashboard-data.mjs')], { cwd: REPO_ROOT, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  await execFileP(process.execPath, [join(HERE, 'build-bodenwissen-data.mjs')], { cwd: REPO_ROOT, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
}

/**
 * Nie zwei Neubauten gleichzeitig (beide schreiben dieselbe issues.json).
 * Laeuft schon einer, wartet ein Aufruf darauf und stoesst danach genau einen
 * weiteren an - sonst zeigte eine Schreibaktion, die waehrend des
 * regelmaessigen Neubaus kam, den Stand von vor ihrer Aenderung. Mehrere
 * Wartende teilen sich diesen einen Folgelauf.
 */
let neubauLauf = null;
let neubauFolge = null;
function rebuild() {
  if (!neubauLauf) {
    neubauLauf = baueNeu().finally(() => { neubauLauf = null; });
    return neubauLauf;
  }
  if (!neubauFolge) {
    neubauFolge = neubauLauf.catch(() => {}).then(() => { neubauFolge = null; return rebuild(); });
  }
  return neubauFolge;
}

/**
 * issues.json wurde im Dienst nur beim Start, nach einer Schreibaktion und
 * auf "Jetzt synchronisieren" neu gebaut - im Dauerbetrieb war der
 * Aufgabenstand damit oft Tage alt. Regelmaessig, aber nie ueberlappend: laeuft
 * gerade ein Neubau, faellt dieser Takt aus.
 */
export const NEUBAU_MINUTEN = Number(process.env.TP_DASHBOARD_NEUBAU_MINUTEN ?? 10);
export function regelmaessigNeubauen() {
  if (neubauLauf) return null;
  return rebuild().catch(e => logFehler('neubau', `issues.json konnte nicht neu erzeugt werden: ${String(e?.message || e).split('\n')[0]}`));
}

// sitzungenVerwerfen reicht das Auth-Objekt hinein, statt es zu importieren -
// auth entsteht hier, ein Import in dashboard-api.mjs waere ein Zyklus.
// Servertests ersetzen den Shopify-Zugang (Sonderposten) durch eine Attrappe -
// sonst liefe ein Test mit dem .env.local des Rechners gegen den echten Shop.
let shopifyZugangErsatz = null;
export function ersetzeShopifyZugang(fabrik) { shopifyZugangErsatz = fabrik; }

export const api = createApi({
  root: REPO_ROOT,
  rebuild,
  sitzungenVerwerfen: (kuerzel) => auth.sitzungenVerwerfen(kuerzel),
  shopifyZugang: () => (shopifyZugangErsatz ? shopifyZugangErsatz() : null),
});

// Kachel „Laden" auf „Heute": Zahlen aus der Auftrags-App, serverseitig abgerufen
// (URL und Schluessel aus .env.local des Dienstes, nie im Browser) - scripts/laden-zahlen.mjs.
const ladenZahlen = createLadenZahlen({ root: REPO_ROOT });

/**
 * Kopfzeilen fuer jede Antwort. Das Control Center zeigt Kundendaten und hat
 * Knoepfe, die etwas buchen - keine fremde Seite darf es in einen Rahmen laden
 * und den Benutzer dort klicken lassen (Clickjacking). X-Frame-Options fuer
 * aeltere Browser, frame-ancestors fuer alle neueren.
 */
const SICHERHEITS_KOEPFE = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  if (res.headersSent) { res.end(); return; }
  const koepfe = { 'Content-Type': type, 'Cache-Control': 'no-store', ...SICHERHEITS_KOEPFE };
  // Nach einem zu grossen Koerper die Verbindung schliessen, statt den Rest
  // weiter anzunehmen - die Antwort selbst kommt aber an (siehe readJson).
  if (status === 413) koepfe.Connection = 'close';
  res.writeHead(status, koepfe);
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readJson(req, max = MAX_BODY) {
  return new Promise((resolveBody, reject) => {
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) { reject(new ApiError(415, 'Nur application/json')); return; }
    let size = 0; const chunks = [];
    let zuGross = false;
    req.on('data', c => {
      if (zuGross) return;
      size += c.length;
      if (size > max) {
        // Frueher req.destroy(): die Verbindung war weg, bevor die 413 hinausging -
        // der Browser meldete nur "Netzwerkfehler", nie "zu gross". Jetzt wird der
        // Rest verworfen (nicht gespeichert) und die Antwort schliesst die Verbindung.
        zuGross = true;
        chunks.length = 0;
        req.resume();
        reject(new ApiError(413, `Request zu groß (über ${Math.round(max / 1024)} KB)`));
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (zuGross) return;
      try { resolveBody(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new ApiError(400, 'Ungültiges JSON')); }
    });
    req.on('error', reject);
  });
}

/**
 * Was der Browser im eigenen Fenster anzeigen darf. Der Dateityp eines Anhangs
 * stammt vom Browser beim Hochladen; alles ausser Bildern, PDF und reinem Text
 * kommt deshalb als Download, und nosniff verhindert, dass der Browser aus
 * einem angeblichen Bild doch eine Seite macht.
 */
const INLINE_TYPEN = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain']);
export function dateiKoepfe({ typ, name }) {
  const inline = INLINE_TYPEN.has(typ);
  const anzeigeName = String(name || 'datei');
  const ascii = anzeigeName.replace(/[^\w.\- ]+/g, '_');
  return {
    'Content-Type': inline ? (typ === 'text/plain' ? 'text/plain; charset=utf-8' : typ) : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(anzeigeName)}`,
    'Cache-Control': 'private, no-store',
    ...SICHERHEITS_KOEPFE,
  };
}
function dateiAusliefern(res, { inhalt, typ, name }) {
  res.writeHead(200, dateiKoepfe({ typ, name }));
  res.end(inhalt);
}

/** Fehlerantwort der API samt einer Protokollzeile (Zeit, Status, Methode, Pfad, Meldung - nie Cookies oder Abfrageteil). */
function apiFehler(req, res, pathname, status, body) {
  // Beim 500 steht die eigentliche Ursache in `technisch`, der Text fuer den Laden ist immer derselbe.
  logFehler('api', `${status} ${req.method} ${pfadOhneAbfrage(pathname)}: ${body?.technisch || body?.error || ''}`);
  send(res, status, body);
}

// Firmennetz: private Adressbereiche (RFC 1918) zusaetzlich zu localhost.
// Der Host-Header kommt vom TCP-Ziel der Verbindung, ein fremder Browser-Tab
// kann ihn per fetch()/Formular nicht faelschen - nur der Origin-Header ist
// vom anfragenden Ursprung gesetzt und wird zusaetzlich geprueft.
// `name.local` ist der Bonjour-Name des Rechners im eigenen Netz. Eine fremde
// Domain laesst sich darauf nicht zeigen lassen (mDNS aufloest nur das lokale
// Netz), ein Zugriff vom Tablet im Laden aber schon.
// 100.64.0.0/10 ist der Bereich, aus dem Tailscale seinen Geraeten Adressen
// gibt (CGNAT). Wer darin liegt, ist bereits im eigenen Tailnet - dieselbe
// Vertrauensstufe wie 192.168.x.x im Laden. Der Bereich endet bei 100.127:
// 100.128.x.x gehoert nicht mehr dazu.
const LAN_HOST_RE = /^(127\.0\.0\.1|localhost|[a-z0-9-]+\.local|10(\.\d{1,3}){3}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|192\.168(\.\d{1,3}){2}|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])(\.\d{1,3}){2})(:\d+)?$/i;

/**
 * Namen, die zusaetzlich gelten duerfen - kommagetrennt in
 * TP_DASHBOARD_EXTRA_HOSTS. Gedacht fuer den MagicDNS-Namen des Tailnets
 * (z. B. "macmini.tailXXXX.ts.net"), unter dem `tailscale serve` das Dashboard
 * per HTTPS ausliefert.
 *
 * Bewusst eine Liste ganzer Namen und kein Muster wie *.ts.net: der Host-Check
 * ist der Schutz gegen DNS-Rebinding. Ein Muster wuerde jeden fremden
 * ts.net-Namen mit abdecken; hier steht genau der eine Name, den der Betrieb
 * benutzt.
 */
export function extraHostsAus(wert) {
  return String(wert ?? '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
}
const EXTRA_HOSTS = extraHostsAus(process.env.TP_DASHBOARD_EXTRA_HOSTS);

/** Ein Host-Wert (mit oder ohne Port) aus dem lokalen Netz, dem Tailnet oder der Liste? */
export function hostErlaubt(host, extra = EXTRA_HOSTS) {
  const h = String(host ?? '').trim().toLowerCase();
  if (!h) return false;
  if (LAN_HOST_RE.test(h)) return true;
  // Der Name darf mit oder ohne Port eingetragen sein; hinter `tailscale serve`
  // kommt er ohne, bei direktem Zugriff auf Port 8001 mit.
  return extra.includes(h) || extra.includes(h.replace(/:\d+$/, ''));
}

function sameOrigin(req) {
  const host = req.headers.host || '';
  const origin = req.headers.origin;
  if (!hostErlaubt(host)) return false;
  if (origin) {
    const m = /^https?:\/\/(.+)$/i.exec(origin);
    if (!m || !hostErlaubt(m[1])) return false;
  }
  return true;
}

/**
 * 403-Text. "Nur lokal erlaubt" fuehrt in die Irre, sobald jemand ueber
 * Tailscale kommt und bloss der Name fehlt - dann ist nicht der Ort das
 * Problem, sondern ein nicht eingetragener Name.
 */
function herkunftFehler(req) {
  const host = String(req.headers.host || '');
  if (/\.ts\.net(:\d+)?$/i.test(host)) {
    return 'Host nicht freigegeben - diesen Namen in TP_DASHBOARD_EXTRA_HOSTS eintragen und den Dienst neu starten';
  }
  return 'Nur lokal erlaubt';
}

/**
 * Wer darf welchen Pfad? Bisher gab es nur zwei Stufen - "lesen" durfte nichts
 * schreiben, alles andere durfte alles. Ein Mitarbeiter konnte damit ueber die
 * API GitHub-Aufgaben umhaengen und kommentieren; das laeuft unter dem Konto
 * des Inhabers in ein oeffentliches Repository.
 *
 * Nicht aufgefuehrte Pfade gelten als Arbeit fuer alle Angemeldeten
 * ('mitarbeiter'). Der Notzugang (benutzer === null, Einzelpasswort-Betrieb)
 * gilt weiterhin als Inhaber, sonst sperrt sich der Betrieb selbst aus.
 */
const RANG = { lesen: 0, mitarbeiter: 1, inhaber: 2 };
const NUR_INHABER = new Set([
  'sonderposten/bestand', // Physische Inventur, keine Verkaufsabbuchung.
  'sync',              // GitHub-Issues holen
  'activity',          // Entwicklungsverlauf
  'agent-runs',        // KI-Laeufe
  'benutzer',
  'team/liste',
  'team/aendern',
  // Meldet alle anderen Geraete ab - auch die Ladenrechner (Rundgang 26.10.).
  'sitzungen/abmelden',
  // Ein neuer Upload-Link oeffnet einen Weg von aussen ins Haus.
  'social/link-neu',
  'social/sperren',
  'einkauf/kennzahlen', // Umsatzzahlen
  // Das Protokoll sagt, wer wann was getan hat. Es haengt im Frontend allein an
  // der Ansicht "Aktivitaet" (inhaber-only), stand aber unter keiner
  // Rollenpruefung - als GET griff auch der lesen-Riegel nicht. Wer die Adresse
  // kennt, las damit die Arbeitsschritte aller Kollegen mit.
  'protokoll',
  // Der Aufgabenwaechter laeuft ueber ALLE Eintraege, auch private des
  // Inhabers, gibt deren Titel zurueck und schreibt ihren Status. Der Knopf
  // dafuer traegt im Frontend data-nur-inhaber, der Pfad war es nicht.
  'org/pruefen',
  // Claude-Verbrauch (#671): Sitzungstitel aller KI-Sitzungen - Inhabersache wie "Insights".
  'verbrauch/claude',
]);

function darfPfad(benutzer, simple, taskOp) {
  if (!benutzer) return true;                       // Notzugang = Inhaber
  const rang = RANG[benutzer.rolle] ?? 0;
  // GitHub-Schreibaktionen gehoeren dem Inhaber - sie wirken oeffentlich.
  if (taskOp && ['transition', 'assign', 'comment'].includes(taskOp)) return rang >= RANG.inhaber;
  if (NUR_INHABER.has(simple)) return rang >= RANG.inhaber;
  return true;
}

export async function handleApi(req, res, pathname, benutzer = null) {
  // Pfadliste aus allen Zweigen: Mehrbenutzer/Protokoll, Kundenansicht mit
  // Bestelltabelle, Lexikon samt Mengenhilfe und die neuen Datenarten
  // (Kunden, Angebote, Warenkoerbe, Bestand, Erfuellung) - fehlt einer,
  // antwortet der Server 404.
  const m = pathname.match(/^\/api\/(?:(capabilities|version|sync|activity|agent-runs|benutzer|protokoll|prozesse\/links|einkauf\/kettelversand|einkauf\/versandtarife|einkauf\/bestellungen|einkauf\/produktstatus|einkauf\/klaerung|einkauf\/auftragsstatus|einkauf\/shopify-abgleich|einkauf\/kennzahlen|einkauf\/lieferanten|einkauf\/lieferant|einkauf\/bestellmail|einkauf\/musterlager|einkauf\/musterlager-farben|einkauf\/reste-abgleich|einkauf\/mustersperre|einkauf\/belege|lexikon\/liste|lexikon\/druckliste|lexikon\/etiketten-status|lexikon\/produkt|lexikon\/mengenhilfe|kunden\/suche|kunden\/detail|kunden\/rueckrufe|kunden\/serviceanfragen|kunden\/liste|angebote\/liste|warenkoerbe\/liste|bestand\/liste|erfuellung\/liste|shopwache\/status|verbrauch\/claude|aktualisierung|aktualisierung\/status|aktualisierung\/start|kunden\/bestellungen|kunden\/musteretiketten|kunden\/ratgeber-druck|kunden\/ratgeber-vorlage|kunden\/muster-packen|kunden\/musterwirkung|kunden\/muster-texte|kunden\/nachfassen-abmelden|kunden\/nachfassen-senden|kunden\/bestellung-fertig|kunden\/bestellung-abhaken|kunden\/faelle|kunden\/fall-marke|org\/liste|org\/zu-kunde|org\/eintrag|org\/kennzahlen|org\/export|fotos\/neu|fotos\/liste|fotos\/produkt|team\/liste|team\/aendern|sitzungen\/abmelden|social\/zugaenge|social\/link-neu|social\/sperren|mein-passwort|org\/analyse|org\/neu|org\/aendern|org\/kommentar|org\/pruefen|org\/liste-einfuegen|org\/anhang|org\/anhang-lesen|akquise\/liste|akquise\/aendern|akquise\/referenz|hausverwaltungen\/liste|hausverwaltungen\/speichern|einkauf\/kundentermin|sonderposten\/liste|sonderposten\/verkauft|sonderposten\/bestand|bildrechte\/liste|laden\/zahlen|fehler\/melden|fehler\/liste|fehler\/bild)|tasks\/(\d+)\/(activity|transition|assign|comment))$/);
  if (!m) { apiFehler(req, res, pathname, 404, { error: 'Unbekannter API-Pfad' }); return; }
  const [, simple, number, taskOp] = m;
  // Host-Pruefung fuer JEDEN Aufruf, nicht nur fuer schreibende: sonst kann
  // eine fremde Seite per DNS-Rebinding die Kundendaten auslesen.
  if (!sameOrigin(req)) { apiFehler(req, res, pathname, 403, { error: herkunftFehler(req) }); return; }
  if (!darfPfad(benutzer, simple, taskOp)) {
    apiFehler(req, res, pathname, 403, { error: 'Dafür fehlt dir die Berechtigung – das macht der Inhaber.' });
    return;
  }
  const write = (simple === 'kunden/musteretiketten' && req.method === 'POST') || (simple === 'kunden/muster-packen' && req.method === 'POST') || (simple === 'lexikon/druckliste' && req.method === 'POST') || (simple === 'prozesse/links' && req.method === 'POST') || simple === 'sync' || simple === 'aktualisierung/start' || (simple === 'einkauf/auftragsstatus' && req.method === 'POST') || (simple === 'einkauf/musterlager' && req.method === 'POST') || (simple === 'einkauf/mustersperre' && req.method === 'POST') || (simple === 'einkauf/belege' && req.method === 'POST') || (simple === 'kunden/rueckrufe' && req.method === 'POST') || (simple === 'kunden/serviceanfragen' && req.method === 'POST') || simple === 'kunden/bestellung-fertig' || simple === 'kunden/bestellung-abhaken' || simple === 'kunden/nachfassen-abmelden' || simple === 'kunden/nachfassen-senden' || simple === 'kunden/fall-marke' || ['org/neu', 'org/aendern', 'org/kommentar', 'org/pruefen', 'org/analyse', 'org/liste-einfuegen', 'org/anhang', 'fotos/neu', 'social/link-neu', 'social/sperren', 'sonderposten/verkauft', 'sonderposten/bestand', 'akquise/aendern', 'akquise/referenz', 'hausverwaltungen/speichern', 'einkauf/kundentermin', 'fehler/melden', 'sitzungen/abmelden'].includes(simple) || ['transition', 'assign', 'comment'].includes(taskOp);
  try {
    // Lesen darf jeder. Einrichtungsziele aendern ausschliesslich der Inhaber
    // oder der bestehende Einzelpasswort-Zugang; kein neues Benutzerkonto noetig.
    if (simple === 'prozesse/links' && req.method === 'POST') {
      if (benutzer && benutzer.rolle !== 'inhaber') {
        throw new ApiError(403, 'Prozessverknüpfungen kann nur der Inhaber ändern.');
      }
      // Auch ein anderer freigegebener LAN-Ursprung ist nicht diese Seite.
      const origin = req.headers.origin;
      if (origin && new URL(origin).host.toLowerCase() !== String(req.headers.host).toLowerCase()) {
        throw new ApiError(403, 'Nur von derselben Dashboard-Adresse erlaubt.');
      }
    }
    if (write) {
      if (req.method !== 'POST') { apiFehler(req, res, pathname, 405, { error: 'POST erwartet' }); return; }
      // Rolle "lesen" darf serverseitig nichts veraendern - unabhaengig davon, ob das
      // Frontend die Aktion anzeigt. Ohne Mehrbenutzerbetrieb (kein `benutzer`) gilt
      // weiterhin der bisherige Notzugang (Inhaber, alle Rechte).
      // Einzige Ausnahme: einen Fehler melden darf jeder. Die Meldung aendert keine
      // Betriebsdaten, und gerade wer nur zuschaut, stolpert oft als Erster darueber.
      if (benutzer && benutzer.rolle === 'lesen' && simple !== 'fehler/melden') { apiFehler(req, res, pathname, 403, { error: 'Rolle "lesen" darf keine Aenderungen vornehmen' }); return; }
    } else if (simple === 'social/zugaenge') {
      // Der Upload-Link ist ein Geheimnis: Rolle "lesen" bekommt ihn auch lesend nicht.
      if (benutzer && benutzer.rolle === 'lesen') { apiFehler(req, res, pathname, 403, { error: 'Dafür fehlt dir die Berechtigung.' }); return; }
      if (req.method !== 'GET') { apiFehler(req, res, pathname, 405, { error: 'GET erwartet' }); return; }
    } else if (simple === 'benutzer' || simple === 'team/liste') {
      if (req.method !== 'GET') { apiFehler(req, res, pathname, 405, { error: 'GET erwartet' }); return; }
    } else if (simple === 'team/aendern' || simple === 'mein-passwort') {
      if (req.method !== 'POST') { apiFehler(req, res, pathname, 405, { error: 'POST erwartet' }); return; }
    } else if (req.method !== 'GET') { apiFehler(req, res, pathname, 405, { error: 'GET erwartet' }); return; }
    let result;
    const url = new URL(req.url, `http://${req.headers.host || HOST}`);
    if (simple === 'prozesse/links' && req.method === 'GET') result = api.prozessLinks({ benutzer });
    else if (simple === 'prozesse/links' && req.method === 'POST') result = api.prozessLinksSetzen(await readJson(req), { benutzer });
    else if (simple === 'version') result = { version: DIENSTVERSION };
    else if (simple === 'capabilities') result = await api.capabilities();
    else if (simple === 'sync') result = await api.sync();
    else if (simple === 'activity') result = await api.activity();
    else if (simple === 'agent-runs') result = api.agentRuns();
    else if (simple === 'benutzer') result = benutzerListeOeffentlich();
    else if (simple === 'protokoll') result = { eintraege: letzteEintraege(protokollPfad(), 50) };
    else if (simple === 'einkauf/kettelversand') result = api.einkaufKettelversand({orderId:url.searchParams.get('orderId')});
    else if (simple === 'einkauf/versandtarife') result = leseVersandtarife();
    else if (simple === 'einkauf/bestellungen') result = api.einkaufBestellungen();
    else if (simple === 'einkauf/produktstatus') result = api.einkaufProduktstatus({ page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize'), q: url.searchParams.get('q') || '', gruppe: url.searchParams.get('gruppe') || '', filter: url.searchParams.get('filter') || '' });
    else if (simple === 'einkauf/klaerung') result = api.einkaufKlaerung();
    else if (simple === 'einkauf/kennzahlen') result = api.einkaufKennzahlen();
    else if (simple === 'einkauf/lieferanten') result = api.einkaufLieferanten();
    else if (simple === 'einkauf/lieferant') result = api.einkaufLieferant({ id: url.searchParams.get('id') || '' });
    else if (simple === 'einkauf/bestellmail') result = api.einkaufBestellmail({ lieferant: url.searchParams.get('lieferant') || '', art: url.searchParams.get('art') || 'ware', gruppe: url.searchParams.get('gruppe') || '', ziel: url.searchParams.get('ziel') || '', auftrag: url.searchParams.get('auftrag') || '' });
    else if (simple === 'einkauf/auftragsstatus' && req.method === 'GET') result = api.einkaufAuftragsstatus();
    // Abgleich mit Shopify: nur lesend (nicht in der write-Liste). Nachgebucht wird ueber
    // POST einkauf/auftragsstatus (aktion "shopifyNachbuchen") - der steht in der write-Liste.
    else if (simple === 'einkauf/shopify-abgleich' && req.method === 'GET') result = api.einkaufShopifyAbgleich();
    // Musterlager: lokal, Shopify bleibt unberuehrt. POST steht in der write-Liste (Rolle "lesen": 403).
    else if (simple === 'einkauf/musterlager' && req.method === 'GET') result = api.einkaufMusterlager();
    else if (simple === 'einkauf/musterlager' && req.method === 'POST') result = await api.einkaufMusterlagerSetzen(await readJson(req), benutzer);
    // Mustersperre ("Muster nicht verfuegbar"): GET liest die Liste, POST schreibt nach Shopify (write-Liste, Rolle "lesen": 403).
    else if (simple === 'einkauf/mustersperre' && req.method === 'GET') result = api.einkaufMustersperre();
    else if (simple === 'einkauf/mustersperre' && req.method === 'POST') result = await api.einkaufMustersperreSetzen(await readJson(req), benutzer);
    else if (simple === 'einkauf/musterlager-farben') result = api.einkaufMusterlagerFarben({ handle: url.searchParams.get('handle') || '' });
    else if (simple === 'einkauf/reste-abgleich') result = api.einkaufResteAbgleich({ hersteller: url.searchParams.get('hersteller') || '', qualitaet: url.searchParams.get('qualitaet') || '', farbnummer: url.searchParams.get('farbnummer') || '' });
    else if (simple === 'einkauf/auftragsstatus' && req.method === 'POST') result = await api.einkaufAuftragsstatusSetzen(await readJson(req), benutzer);
    else if (simple === 'lexikon/druckliste' && req.method === 'GET') result = api.lexikonDruckliste();
    else if (simple === 'lexikon/druckliste' && req.method === 'POST') result = await api.lexikonDrucklisteSetzen(await readJson(req), benutzer);
    else if (simple === 'lexikon/etiketten-status' && req.method === 'GET') result = api.lexikonEtikettenStatus({ q: url.searchParams.get('q') || '', status: url.searchParams.get('status') || 'pruefen', page: url.searchParams.get('page') || 1 });
    else if (simple === 'lexikon/liste') result = api.lexikonListe({ q: url.searchParams.get('q') || '', page: url.searchParams.get('page'), pageSize: url.searchParams.get('pageSize') });
    else if (simple === 'lexikon/produkt') result = api.lexikonProdukt(url.searchParams.get('handle') || '');
    else if (simple === 'lexikon/mengenhilfe') result = api.lexikonMengenhilfe({ handle: url.searchParams.get('handle') || '', variantenId: url.searchParams.get('variantenId') || '', kundenmengeM2: url.searchParams.get('kundenmengeM2'), kundenlaengeCm: url.searchParams.get('kundenlaengeCm') });
    else if (simple === 'kunden/suche') result = api.kundenSuche({ q: url.searchParams.get('q') || '', filter: url.searchParams.get('filter') || '' });
    else if (simple === 'kunden/detail') result = api.kundenDetail({ key: url.searchParams.get('key') || '' });
    else if (simple === 'kunden/ratgeber-vorlage') {
      // Leere Vorlage zum Ausdrucken, fertige Datei aus dem Repository. Rein lesend.
      dateiAusliefern(res, api.kundenRatgeberVorlage({ schluessel: url.searchParams.get('schluessel') || '' }));
      return;
    }
    else if (simple === 'kunden/ratgeber-druck') {
      // PDF direkt ausliefern - der Knopf oeffnet es im neuen Tab zum Drucken. Rein lesend.
      dateiAusliefern(res, await api.kundenRatgeberDruck({ orderId: url.searchParams.get('orderId') || '' }));
      return;
    }
    else if (simple === 'kunden/musteretiketten' && req.method === 'GET') result = api.kundenMusteretiketten(url.searchParams.get('orderId') || '');
    // Muster packen (#1572): GET lesend, POST setzt Haken und "gepackt" lokal; `aktion: verschickt` setzt
    // je Bestellung "raus" und bucht in Shopify mit Versandmail (#1811). write-Liste, Rolle "lesen": 403.
    else if (simple === 'kunden/muster-packen' && req.method === 'GET') result = api.kundenMusterPacken();
    else if (simple === 'kunden/muster-packen' && req.method === 'POST') result = await api.kundenMusterPackenSchreiben(await readJson(req), benutzer);
    else if (simple === 'kunden/musteretiketten' && req.method === 'POST') result = await api.kundenMusteretikettenVormerken(await readJson(req), benutzer);
    else if (simple === 'kunden/musterwirkung' && req.method === 'GET') result = api.kundenMusterwirkung();
    else if (simple === 'kunden/bestellungen') result = api.kundenBestellungen();
    else if (simple === 'kunden/muster-texte') result = api.kundenMusterTexte();
    // Stoppliste "Muster nachfassen" (Antwort "Abmelden"): schreibt in den Privatordner - write-Liste, Rolle "lesen": 403.
    else if (simple === 'kunden/nachfassen-abmelden') result = api.kundenNachfassenAbmelden(await readJson(req), benutzer);
    // "Jetzt senden": eine Nachfrage sofort vom Firmenpostfach - write-Liste, nur POST, Rolle "lesen": 403.
    else if (simple === 'kunden/nachfassen-senden' && req.method === 'POST') result = await api.kundenNachfassenEinzeln(await readJson(req), benutzer);
    else if (simple === 'kunden/faelle') result = api.kundenFaelle();
    // Aufgaben & Organisation. `benutzer` kommt aus der Sitzung, nie aus der
    // Anfrage - sonst koennte jemand fremde Notizen anfordern.
    else if (simple === 'org/liste') result = api.orgListe({
      bereich: url.searchParams.get('bereich') || 'meine-aufgaben',
      ansicht: url.searchParams.get('ansicht') || 'offen',
      gruppe: url.searchParams.get('gruppe') ?? 'kunden',
      prioritaet: url.searchParams.get('prioritaet') || '',
      person: url.searchParams.get('person') || '',
      q: url.searchParams.get('q') || '',
      benutzer,
    });
    else if (simple === 'org/eintrag') result = api.orgEintrag({ id: url.searchParams.get('id') || '', benutzer });
    else if (simple === 'org/kennzahlen') result = api.orgKennzahlen({ benutzer });
    else if (simple === 'org/zu-kunde') result = api.orgZuKunde({ key: url.searchParams.get('key') || '', benutzer });
    else if (simple === 'org/export') result = api.orgExportText({ benutzer });
    else if (simple === 'kunden/fall-marke') result = api.fallMarkieren(await readJson(req), { benutzer });
    else if (simple === 'fotos/neu') result = api.fotosNeu(await readJson(req, MAX_BODY_UPLOAD), { benutzer });
    else if (simple === 'fotos/liste') result = api.fotosListe({ offen: url.searchParams.get('offen') === '1', benutzer });
    else if (simple === 'fotos/produkt') result = api.fotosProdukt({ boden: url.searchParams.get('boden') || '' });
    else if (simple === 'social/zugaenge') result = api.socialZugaenge();
    else if (simple === 'social/sperren') result = api.socialSperren(await readJson(req), { benutzer });
    else if (simple === 'social/link-neu') result = api.socialLinkNeu(await readJson(req), { benutzer });
    else if (simple === 'team/liste') result = { ...api.teamListe(), angemeldeteGeraete: auth.required ? auth.sitzungenAnzahl() : null };
    else if (simple === 'sitzungen/abmelden') result = andereGeraeteAbmelden(req, benutzer);
    else if (simple === 'team/aendern') result = { ...api.teamAendern(await readJson(req), { benutzer }), angemeldeteGeraete: auth.required ? auth.sitzungenAnzahl() : null };
    else if (simple === 'mein-passwort') result = api.eigenesPasswort(await readJson(req), { benutzer });
    else if (simple === 'org/analyse') result = api.orgAnalyse({ text: (await readJson(req))?.text || '', benutzer });
    else if (simple === 'org/neu') result = api.orgNeu(await readJson(req), { benutzer });
    else if (simple === 'org/aendern') result = api.orgAendern(await readJson(req), { benutzer });
    else if (simple === 'org/kommentar') result = api.orgKommentar(await readJson(req), { benutzer });
    else if (simple === 'org/pruefen') result = await api.orgPruefen(await readJson(req).catch(() => ({})), { benutzer });
    else if (simple === 'org/liste-einfuegen') result = api.orgListeEinfuegen(await readJson(req), { benutzer });
    else if (simple === 'org/anhang') result = api.orgAnhang(await readJson(req, MAX_BODY_UPLOAD), { benutzer });
    else if (simple === 'org/anhang-lesen') {
      // Datei direkt ausliefern, nicht als JSON - der Browser soll sie anzeigen.
      const { pfad, typ, name } = api.orgAnhangLesen({ id: url.searchParams.get('id') || '', datei: url.searchParams.get('datei') || '', benutzer });
      dateiAusliefern(res, { inhalt: await readFile(pfad), typ, name });
      return;
    }
    else if (simple === 'kunden/bestellung-abhaken') result = api.bestellungAbhaken(await readJson(req), { benutzer });
    else if (simple === 'kunden/bestellung-fertig') result = await api.kundenBestellungFertig(await readJson(req), benutzer);
    else if (simple === 'kunden/rueckrufe' && req.method === 'GET') result = api.kundenRueckrufe();
    else if (simple === 'kunden/rueckrufe' && req.method === 'POST') result = await api.kundenRueckrufSetzen(await readJson(req), benutzer);
    else if (simple === 'einkauf/belege' && req.method === 'GET') result = api.einkaufBelege();
    else if (simple === 'einkauf/belege' && req.method === 'POST') result = api.einkaufBelegSetzen(await readJson(req), benutzer);
    else if (simple === 'kunden/serviceanfragen' && req.method === 'GET') result = await api.kundenServiceanfragen();
    else if (simple === 'kunden/serviceanfragen' && req.method === 'POST') result = api.kundenServiceanfrageSetzen(await readJson(req), benutzer);
    else if (simple === 'kunden/liste') result = api.kundenListe({ q: url.searchParams.get('q') || '' });
    else if (simple === 'angebote/liste') result = api.angeboteListe();
    else if (simple === 'warenkoerbe/liste') result = api.warenkoerbeListe();
    else if (simple === 'bestand/liste') result = api.bestandListe();
    else if (simple === 'shopwache/status') result = await api.shopwacheStatus();
    else if (simple === 'verbrauch/claude') result = api.verbrauchClaude();
    else if (simple === 'laden/zahlen') result = await ladenZahlen.abrufen();
    else if (simple === 'erfuellung/liste') result = api.erfuellungListe();
    // Akquise (#1447): Inhaber und Mitarbeiter (seit 2026-10-20); aendern/referenz stehen in der write-Liste.
    else if (simple === 'akquise/liste') result = await api.akquiseListe();
    else if (simple === 'akquise/aendern') result = await api.akquiseAendern(await readJson(req), benutzer);
    else if (simple === 'akquise/referenz') result = await api.akquiseReferenz(await readJson(req), benutzer);
    else if (simple === 'hausverwaltungen/liste') result = await api.hausverwaltungenListe();
    else if (simple === 'hausverwaltungen/speichern') result = await api.hausverwaltungenSpeichern(await readJson(req), benutzer);
    else if (simple === 'einkauf/kundentermin') result = await api.einkaufKundentermin(await readJson(req), benutzer);
    else if (simple === 'sonderposten/liste') result = await api.sonderpostenListe();
    // Bildrechte: nur lesend (nicht in der write-Liste) - jede Rolle, auch "lesen", darf sie sehen.
    else if (simple === 'bildrechte/liste') result = api.bildrechteListe({ liste: url.searchParams.get('liste') || '', gruppe: url.searchParams.get('gruppe') || '', page: url.searchParams.get('page') });
    // Schreibt nach Shopify (Bestand, Verkaufsfelder) - steht deshalb oben in der write-Liste:
    // Rolle "lesen" bekommt 403, mitarbeiter und inhaber duerfen.
    else if (simple === 'sonderposten/verkauft') result = await api.sonderpostenVerkauft(await readJson(req), benutzer);
    else if (simple === 'sonderposten/bestand') result = await api.sonderpostenBestand(await readJson(req), benutzer);
    // Fehler melden: `benutzer` aus der Sitzung, nie aus der Anfrage - sonst
    // koennte jemand im Namen eines Kollegen melden oder dessen Meldungen lesen.
    // Bis zu drei Bildschirmfotos als base64 - deshalb die Upload-Grenze.
    else if (simple === 'fehler/melden') result = api.fehlerMelden(await readJson(req, MAX_BODY_UPLOAD), { benutzer });
    else if (simple === 'fehler/bild') {
      const { pfad, typ, name } = api.fehlerBild({ id: url.searchParams.get('id') || '', nr: url.searchParams.get('nr') || '', benutzer });
      dateiAusliefern(res, { inhalt: await readFile(pfad), typ, name });
      return;
    }
    else if (simple === 'fehler/liste') result = api.fehlerListe({ benutzer });
    else if (simple === 'aktualisierung') result = api.aktualisierung();
    else if (simple === 'aktualisierung/status') result = api.aktualisierungStatus();
    else if (simple === 'aktualisierung/start') result = api.aktualisierungStarten();
    else if (taskOp === 'activity') result = await api.activityForTask(number);
    else if (taskOp === 'transition') result = await api.transition(number, await readJson(req), benutzer);
    else if (taskOp === 'assign') result = await api.assign(number, await readJson(req), benutzer);
    else if (taskOp === 'comment') result = await api.comment(number, await readJson(req), benutzer);
    send(res, 200, result);
  } catch (e) {
    if (e instanceof ApiError) { apiFehler(req, res, pathname, e.status, { error: e.message, ...e.extra }); return; }
    // Die englische Node-Meldung samt Dateipfad hilft am Ladentresen niemandem.
    // Sie steht im Serverprotokoll und zusaetzlich im Feld `technisch`, damit
    // sie beim Nachfragen nicht verloren ist.
    const msg = String(e?.message || e).split('\n')[0].slice(0, 300);
    apiFehler(req, res, pathname, 500, {
      error: 'Das hat nicht geklappt. Bitte noch einmal versuchen – bleibt es dabei, über „Fehler melden“ (Seitenleiste unten) Bescheid geben.',
      technisch: msg,
      pfad: pathname,
    });
  }
}

/** Benutzerverwaltung im UI: nur Liste (Anlegen/Deaktivieren laeuft ueber das Skript). Nie Hashes ausliefern. */
function benutzerListeOeffentlich() {
  if (!benutzerDateiExistiert()) return { benutzer: [], hinweis: 'Keine benutzer.json - Notzugang per Einzelpasswort aktiv.' };
  const liste = leseBenutzer().map(b => ({ name: b.name, kuerzel: b.kuerzel, rolle: b.rolle, aktiv: b.aktiv !== false }));
  return { benutzer: liste, hinweis: `Anlegen/Deaktivieren: npm run benutzer -- anlegen (Datei: ${benutzerDateiPfad()})` };
}

export async function handleStatic(req, res, pathname) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) { send(res, 403, '403', 'text/plain; charset=utf-8'); return; }
  try {
    const roh = await readFile(file);
    const data = file === join(ROOT, 'index.html') ? roh.toString('utf8').replace('__TP_DIENSTVERSION__', DIENSTVERSION) : roh;
    send(res, 200, data, TYPES[extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, '404 - nicht gefunden', 'text/plain; charset=utf-8');
  }
}

/**
 * "Alle anderen Geraete abmelden" (Zugaenge, nur Inhaber): im Control Center endet jede
 * Sitzung ausser der eigenen; die Social-Zentrale (eigener Prozess) beachtet den
 * Zeitstempel im privaten Ordner und meldet alles ab, was davor angemeldet war.
 */
function andereGeraeteAbmelden(req, benutzer) {
  const abgemeldet = auth.andereSitzungenBeenden(parseCookies(req)[SESSION_COOKIE]);
  let social = true;
  try { setzeAbmeldeStand(privatDir()); } catch (e) {
    social = false;
    logFehler('anmeldung', `Social-Zentrale nicht abgemeldet: ${String(e?.message || e).split('\n')[0]}`);
  }
  try {
    protokolliere(protokollPfad(), { benutzer: benutzer?.name || 'Inhaber', aktion: 'Alle anderen Geräte abgemeldet', objekt: `${abgemeldet} Sitzungen`, jetzt: new Date() });
  } catch { /* Protokoll darf das Abmelden nicht verhindern */ }
  return { ok: true, abgemeldet, social, angemeldeteGeraete: auth.sitzungenAnzahl() };
}

function isAuthed(req) {
  if (!auth.required) return true;
  const cookies = parseCookies(req);
  return auth.validSession(cookies[SESSION_COOKIE]);
}

/** Angemeldeter Benutzer ({name, kuerzel, rolle}) oder null (Standardbetrieb ohne Anmeldung). */
function sessionBenutzer(req) {
  if (!auth.required) return null;
  const cookies = parseCookies(req);
  return auth.sessionBenutzer(cookies[SESSION_COOKIE]);
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') { send(res, 405, { error: 'POST erwartet' }); return; }
  if (!sameOrigin(req)) { send(res, 403, { error: herkunftFehler(req) }); return; }
  // Sperrschluessel je Geraet: hinter `tailscale serve` kaemen sonst alle als 127.0.0.1
  // an, und fuenf Tippfehler eines Mitarbeiters sperrten jedes Geraet (Massnahme 58).
  const geraet = anmeldeGeraet(req);
  const ip = geraet.schluessel;
  let body;
  try { body = await readJson(req); } catch (e) {
    if (e instanceof ApiError) { send(res, e.status, { error: e.message }); return; }
    send(res, 400, { error: 'Ungültige Anfrage' });
    return;
  }
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  // Begrenzung je Benutzer UND je IP: ein Sperrschluessel aus beidem, damit weder ein
  // einzelner Name noch eine einzelne IP-Adresse andere Konten mitsperrt.
  const rateKey = `${ip}::${name.toLowerCase() || 'unbekannt'}`;
  if (auth.isLocked(rateKey) || auth.isLocked(ip)) {
    // Name und Passwort nie ins Protokoll - nur, dass und von wo.
    logFehler('anmeldung', `429 gesperrt nach Fehlversuchen (${geraet.anzeige})`);
    send(res, 429, { error: 'Zu viele Fehlversuche. Kurz warten und erneut versuchen.' });
    return;
  }
  let benutzer;
  try {
    benutzer = auth.required ? auth.verifyLogin({ name, passwort: body?.passwort }) : null;
  } catch (e) {
    // benutzer.json unlesbar: kein "Passwort falsch", sondern was los ist.
    logFehler('anmeldung', `503 Zugangsliste nicht lesbar: ${String(e?.message || e).split('\n')[0]}`);
    await sleep(auth.failDelayMs);
    send(res, 503, { error: 'Anmeldung gerade nicht möglich: die Liste der Zugänge ist nicht lesbar. Bitte dem Inhaber Bescheid geben.' });
    return;
  }
  await sleep(auth.failDelayMs);
  if (!benutzer) {
    auth.registerFailure(rateKey);
    auth.registerFailure(ip);
    logFehler('anmeldung', `401 Name oder Passwort falsch (${geraet.anzeige})`);
    send(res, 401, { error: 'Name oder Passwort falsch' });
    return;
  }
  auth.registerSuccess(rateKey);
  auth.registerSuccess(ip);
  const lang = body?.angemeldetBleiben !== false; // Standard: Ladenrechner bleibt angemeldet
  const sid = auth.createSession(benutzer, { lang });
  res.setHeader('Set-Cookie', sessionCookieHeader(sid, { lang }));
  send(res, 200, { ok: true, benutzer });
}

function handleLogout(req, res) {
  if (req.method !== 'POST') { send(res, 405, { error: 'POST erwartet' }); return; }
  const cookies = parseCookies(req);
  auth.destroySession(cookies[SESSION_COOKIE]);
  res.setHeader('Set-Cookie', clearedCookieHeader());
  send(res, 200, { ok: true });
}

function handleSession(req, res) {
  send(res, 200, { required: auth.required, authenticated: isAuthed(req), benutzer: sessionBenutzer(req) });
}

/**
 * Letzte Linie: ein Fehler, der bis hierher durchschlaegt, wird protokolliert
 * und als 500 beantwortet - er beendet nie den Dienst. Am 2026-10-12 reichte
 * ein Cookie "x=%" ohne Anmeldung, um den ganzen Prozess abstuerzen zu lassen.
 */
function unerwarteterFehler(req, res, e) {
  logFehler('server', `500 ${req.method} ${pfadOhneAbfrage(req.url)}: ${String(e?.stack || e?.message || e).split('\n').slice(0, 2).join(' ')}`);
  try {
    if (res.headersSent) { res.destroy(); return; }
    send(res, 500, { error: 'Das hat nicht geklappt. Bitte noch einmal versuchen – bleibt es dabei, über „Fehler melden“ (Seitenleiste unten) Bescheid geben.' });
  } catch { /* Antwort nicht mehr moeglich - Verbindung ist schon weg */ }
}

export function requestHandler(req, res) {
  try {
    const ergebnis = verteile(req, res);
    if (ergebnis && typeof ergebnis.catch === 'function') return ergebnis.catch(e => unerwarteterFehler(req, res, e));
    return ergebnis;
  } catch (e) {
    unerwarteterFehler(req, res, e);
    return undefined;
  }
}

function verteile(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url || '/', `http://${HOST}`).pathname); } catch { pathname = '/'; }

  if (pathname === '/api/login') return handleLogin(req, res);
  if (pathname === '/api/logout') return handleLogout(req, res);
  if (pathname === '/api/session') return handleSession(req, res);

  if (pathname === '/login') {
    let error = null;
    try { error = new URL(req.url, `http://${HOST}`).searchParams.get('fehler'); } catch { /* ignoriert */ }
    send(res, 200, renderLoginPage({ error }), 'text/html; charset=utf-8');
    return;
  }

  if (!isAuthed(req)) {
    if (pathname.startsWith('/api/')) { send(res, 401, { error: 'Anmeldung erforderlich' }); return; }
    res.writeHead(302, { Location: '/login', 'Cache-Control': 'no-store' });
    res.end();
    return;
  }

  if (pathname.startsWith('/api/')) return handleApi(req, res, pathname, sessionBenutzer(req));
  return handleStatic(req, res, pathname);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Pruef-Instanz von dashboard:pruefen: die Kopie der privaten Daten verschwindet mit
  // dem Server, auch wenn er nach dem Lauf mit `kill <pid>` beendet wird (--offen).
  // Ohne TP_DASHBOARD_DATENKOPIE (echter Dienst) tut der Aufruf nichts.
  beimEndeLoeschen();
  try {
    assertStartupAllowed();
  } catch (e) {
    console.error(`[dashboard] ${e.message}`);
    process.exit(1);
  }
  // Ein Fehler ausserhalb einer Anfrage (Zeitgeber, Kindprozess, vergessenes
  // catch) beendete bisher den Dienst; launchd startete ihn zwar neu, aber
  // laufende Buchungen und Sitzungen im Speicher waren weg. Jetzt: protokollieren
  // und weiterlaufen.
  process.on('uncaughtException', e => logFehler('server', `Unerwarteter Fehler (Dienst laeuft weiter): ${String(e?.stack || e?.message || e).split('\n').slice(0, 3).join(' ')}`));
  process.on('unhandledRejection', e => logFehler('server', `Unbehandelte Ablehnung (Dienst laeuft weiter): ${String(e?.stack || e?.message || e).split('\n').slice(0, 3).join(' ')}`));
  const server = createServer(requestHandler);
  // Faengt der Start selbst (Port belegt), soll der Prozess enden - sonst liefe er
  // dank der Handler oben ohne offenen Port weiter, und launchd startete ihn nie neu.
  server.on('error', e => {
    logFehler('server', `Start fehlgeschlagen: ${e?.message || e}`);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    if (HOST === '127.0.0.1') {
      console.log(`Control Center: http://localhost:${PORT}`);
    } else {
      console.log(`Control Center (Netzmodus): http://${HOST}:${PORT} - erreichbar im Firmennetz.`);
      console.log('Zugriff nur mit Passwort. Jede Route verlangt eine Anmeldung; Sitzung 12 Stunden gültig.');
    }
    console.log('Lokaler Aktionsmodus: Statuswechsel und Kommentare laufen über gh (angemeldetes Konto).');
    // Shopify -> Dashboard nach jedem neuen Bestellexport des Sync-Dienstes, auch wenn gerade
    // niemand das Control Center offen hat (operations/lib/shopify-abgleich.mjs). Prueft nur
    // Groesse und Zeit von orders.json; gerechnet wird erst bei einem neuen Export.
    setInterval(() => { try { api.shopifyAbgleich(); } catch (e) { logFehler('abgleich', String(e?.message || e).split('\n')[0]); } }, 60_000).unref();
    if (!process.env.TP_DASHBOARD_DATENKOPIE) {
      const musterLauf = () => api.musterBestellungenAutomatisch().catch(() => logFehler('muster-bestellung', 'Automatische Musterbestellung unterbrochen. Bestellstand prüfen.'));
      setInterval(musterLauf, 60_000).unref();
      musterLauf();
    }
    if (NEUBAU_MINUTEN > 0) {
      setInterval(regelmaessigNeubauen, NEUBAU_MINUTEN * 60_000).unref();
      console.log(`Aufgabendaten (issues.json) werden alle ${NEUBAU_MINUTEN} Minuten neu geholt.`);
    }
  });
}
