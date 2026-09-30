#!/usr/bin/env node
/**
 * Zwei kleine Server in einem Prozess:
 *
 *   Zentrale (Standard 127.0.0.1:8020)  Uebersicht, Freigabe, Plan, Bestand, Auswertung.
 *       Anmeldung mit denselben Zugaengen wie das Control Center
 *       ($TP_PRIVAT_DIR/benutzer.json bzw. Notpasswort). Freigeben darf nur der Inhaber.
 *
 *   Upload  (Standard 127.0.0.1:8021)   Die Seite fuer die Bodenleger.
 *       Kein Konto: der persoenliche Link ist der Zugang. Dieser Port nimmt nur
 *       entgegen - er liefert keine Bilder, keine Listen, keine Kundendaten aus.
 *       Nur er ist dafuer gedacht, von ausserhalb erreichbar zu sein.
 *
 * Bewusst getrennt vom Control Center (Port 8001): das zeigt Bestellungen und
 * Anschriften und laeuft auf einem eigenen Betriebszweig. Ein Fehler hier darf
 * es nicht mitreissen.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { authentifiziere, benutzerDateiExistiert, leseBenutzer } from '../../operations/lib/benutzer.mjs';
import { clientAus, ladeLernstand, planeOffene } from '../lib/ablauf.mjs';
import { oeffne } from '../lib/db.mjs';
import { DATEITYPEN, EingangFehler, erkenneTyp, findeZugang, GRENZEN, legeBaustelleAn, pruefeAngaben, trageDateiEin } from '../lib/eingang.mjs';
import { bearbeiten, freigeben, FreigabeFehler, holeGeplanteZurueck, pruefe, medienZuBeitrag, verwerfen, zurueckholen } from '../lib/freigabe.mjs';
import { BODENARTEN, ORTE, RAEUME, TAETIGKEITEN } from '../lib/konfig.mjs';
import { medienDir, privatDir, sitzungenPfad, socialDir } from '../lib/pfade.mjs';
import { verarbeiteEingang } from '../lib/pruefung.mjs';
import { rendere } from '../lib/rendern.mjs';
import { BEITRAG_STATUS, INHALT_STATUS, STATUS_LABEL, StatusFehler, TYPEN } from '../lib/status.mjs';
import { erstelleEntwurf, WerkstattFehler } from '../lib/werkstatt.mjs';
import { ladeUmgebung } from '../lib/zugang.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const UI = path.resolve(HIER, '..', 'ui');
// Name des Sitzungskekses (kein Geheimnis - der Wert entsteht bei der Anmeldung).
const SITZUNG = 'tp_social_sid';
const SITZUNG_MS = 30 * 24 * 60 * 60 * 1000;

const TYPEN_STATISCH = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };

class HttpFehler extends Error { constructor(status, meldung) { super(meldung); this.status = status; } }

function sende(res, status, body, typ = 'application/json; charset=utf-8', kopf = {}) {
  res.writeHead(status, { 'Content-Type': typ, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', ...kopf });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

/** Mediendatei ausliefern. Videos spielt Safari (iPhone) nur mit Teilabrufen (Range) ab. */
function sendeMedium(req, res, datei) {
  const typ = TYPEN_STATISCH[path.extname(datei).toLowerCase()] ?? 'application/octet-stream';
  const kopf = { 'Cache-Control': 'private, max-age=300', 'Accept-Ranges': 'bytes' };
  const groesse = fs.statSync(datei).size;
  const bereich = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (!bereich || (!bereich[1] && !bereich[2])) return sende(res, 200, fs.readFileSync(datei), typ, kopf);
  let start = bereich[1] ? Number(bereich[1]) : Math.max(0, groesse - Number(bereich[2]));
  let ende = bereich[1] && bereich[2] ? Math.min(Number(bereich[2]), groesse - 1) : groesse - 1;
  if (start >= groesse || start > ende) return sende(res, 416, '', typ, { ...kopf, 'Content-Range': `bytes */${groesse}` });
  const puffer = Buffer.alloc(ende - start + 1);
  const fd = fs.openSync(datei, 'r');
  try { fs.readSync(fd, puffer, 0, puffer.length, start); } finally { fs.closeSync(fd); }
  return sende(res, 206, puffer, typ, { ...kopf, 'Content-Range': `bytes ${start}-${ende}/${groesse}` });
}

function liesJson(req, max = 64 * 1024) {
  return new Promise((ok, fehler) => {
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) { fehler(new HttpFehler(415, 'Nur application/json')); return; }
    let groesse = 0; const teile = [];
    req.on('data', (c) => { groesse += c.length; if (groesse > max) { req.destroy(); fehler(new HttpFehler(413, 'Anfrage zu groß')); } else teile.push(c); });
    req.on('end', () => { try { ok(teile.length ? JSON.parse(Buffer.concat(teile).toString('utf8')) : {}); } catch { fehler(new HttpFehler(400, 'Ungültiges JSON')); } });
    req.on('error', fehler);
  });
}

// Dieselbe Regel wie scripts/serve-dashboard.mjs (hostErlaubt): lokales Netz,
// Tailnet (100.64.0.0/10) und ausdruecklich eingetragene Namen. Schutz gegen
// DNS-Rebinding - eine fremde Seite darf die Zentrale nicht ueber den Browser
// des Inhabers ansprechen.
const NETZ = /^(127\.0\.0\.1|localhost|[a-z0-9-]+\.local|10(\.\d{1,3}){3}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|192\.168(\.\d{1,3}){2}|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])(\.\d{1,3}){2})(:\d+)?$/i;
export function hostErlaubt(host, extra = []) {
  const h = String(host ?? '').trim().toLowerCase();
  if (!h) return false;
  return NETZ.test(h) || extra.includes(h) || extra.includes(h.replace(/:\d+$/, ''));
}

// --- Anmeldung ------------------------------------------------------------------

function ladePasswort(env) {
  if (env.TP_DASHBOARD_PASSWORT) return env.TP_DASHBOARD_PASSWORT;
  try { return fs.readFileSync(path.join(privatDir(env), 'dashboard-passwort.txt'), 'utf8').split('\n')[0].trim() || null; } catch { return null; }
}

export function erstelleAnmeldung({ env = process.env, datei = sitzungenPfad(), jetzt = () => Date.now() } = {}) {
  const passwort = ladePasswort(env);
  const sha = t => crypto.createHash('sha256').update(String(t)).digest();
  const sitzungen = new Map();
  try {
    for (const [h, s] of Object.entries(JSON.parse(fs.readFileSync(datei, 'utf8')).sitzungen ?? {})) if (s.bis > jetzt()) sitzungen.set(h, s);
  } catch { /* keine Datei - dann neu anmelden */ }
  const speichere = () => {
    try { fs.mkdirSync(path.dirname(datei), { recursive: true }); fs.writeFileSync(datei, JSON.stringify({ sitzungen: Object.fromEntries(sitzungen) }), { mode: 0o600 }); } catch { /* Sitzungen ueberleben dann keinen Neustart */ }
  };
  const fehlversuche = new Map();
  return {
    noetig: () => Boolean(passwort) || benutzerDateiExistiert(),
    gesperrt(schluessel) { const f = fehlversuche.get(schluessel); return Boolean(f && f.bis > jetzt()); },
    fehlversuch(schluessel) {
      const f = fehlversuche.get(schluessel) ?? { n: 0, bis: 0 };
      f.n += 1; if (f.n >= 5) { f.bis = jetzt() + 5 * 60 * 1000; f.n = 0; }
      fehlversuche.set(schluessel, f);
    },
    erfolg(schluessel) { fehlversuche.delete(schluessel); },
    pruefe({ name = '', passwort: eingabe = '' } = {}) {
      if (benutzerDateiExistiert()) {
        const b = authentifiziere(leseBenutzer(), name, eingabe);
        if (b) return { name: b.name, kuerzel: b.kuerzel, rolle: b.rolle };
      }
      if (passwort && typeof eingabe === 'string' && eingabe.length) {
        const a = sha(eingabe); const b = sha(passwort);
        if (crypto.timingSafeEqual(a, b)) return { name: 'Inhaber', kuerzel: null, rolle: 'inhaber' };
      }
      return null;
    },
    neueSitzung(benutzer) {
      const sid = crypto.randomBytes(32).toString('base64url');
      sitzungen.set(sha(sid).toString('hex'), { benutzer, bis: jetzt() + SITZUNG_MS });
      speichere();
      return sid;
    },
    benutzer(sid) {
      if (!sid) return null;
      const s = sitzungen.get(sha(sid).toString('hex'));
      if (!s || s.bis <= jetzt()) return null;
      // Notzugang (ohne Kuerzel) bleibt, wie er ist. Alle anderen bei jedem Zugriff
      // frisch aus benutzer.json: wer deaktiviert oder herabgestuft wird, verliert
      // seine Rechte sofort - nicht erst, wenn die Sitzung nach 30 Tagen ablaeuft.
      if (!s.benutzer.kuerzel) return s.benutzer;
      const aktuell = benutzerDateiExistiert() ? leseBenutzer().find(b => b.kuerzel === s.benutzer.kuerzel && b.aktiv !== false) : null;
      return aktuell ? { name: aktuell.name, kuerzel: aktuell.kuerzel, rolle: aktuell.rolle } : null;
    },
    beenden(sid) { if (sid) { sitzungen.delete(sha(sid).toString('hex')); speichere(); } },
  };
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(t => t.trim().split('=')).filter(p => p.length === 2));
}

// --- Zentrale -------------------------------------------------------------------

function beitragAnsicht(db, b) {
  const inhalt = db.inhalt(b.inhalt_id);
  const urteil = b.status === BEITRAG_STATUS.FREIGABE || b.status === BEITRAG_STATUS.FEHLER
    ? pruefe({ beitrag: b, inhalt, medien: medienZuBeitrag(db, b) }) : (b.hinweise ?? { sperren: [], hinweise: [] });
  return {
    id: b.id, status: b.status, statusLabel: STATUS_LABEL[b.status], format: b.format, plattformen: b.plattformen,
    text: b.text, textFacebook: b.text_facebook, hashtags: b.hashtags, link: b.link,
    geplantAm: b.geplant_am, veroeffentlichtAm: b.veroeffentlicht_am, fehler: b.fehler, ergebnis: b.ergebnis,
    bilder: (b.medien ?? []).filter(m => m.art !== 'video').map(m => `/medien/${m.pfad.split(path.sep).join('/')}`),
    video: (b.medien ?? []).filter(m => m.art === 'video').map(m => `/medien/${m.pfad.split(path.sep).join('/')}`)[0] ?? null,
    sperren: urteil.sperren, hinweise: urteil.hinweise,
    inhalt: { id: inhalt.id, titel: inhalt.titel, quelle: inhalt.quelle, typ: inhalt.typ, typLabel: TYPEN[inhalt.typ]?.label ?? inhalt.typ, ort: inhalt.ort, bodenart: inhalt.bodenart, grund: inhalt.notiz, eingereichtVon: inhalt.eingereicht_von },
  };
}

function stand(db, env, dir) {
  const kennzahlen = new Map();
  for (const k of db.letzteKennzahlen()) (kennzahlen.get(k.beitrag_id) ?? kennzahlen.set(k.beitrag_id, []).get(k.beitrag_id)).push({ plattform: k.plattform, reichweite: k.reichweite, likes: k.likes, kommentare: k.kommentare, gespeichert: k.gespeichert, geteilt: k.geteilt, profilbesuche: k.profilbesuche, linkKlicks: k.link_klicks, punkte: k.punkte });
  const ansicht = status => db.beitraege({ status }).map(b => beitragAnsicht(db, b));
  return {
    uebersicht: db.uebersicht(),
    freigabe: ansicht(BEITRAG_STATUS.FREIGABE),
    geplant: ansicht([BEITRAG_STATUS.GEPLANT, BEITRAG_STATUS.IN_ARBEIT]),
    fehler: ansicht(BEITRAG_STATUS.FEHLER),
    veroeffentlicht: db.letzteVeroeffentlichte(30).map(b => ({ ...beitragAnsicht(db, b), kennzahlen: kennzahlen.get(b.id) ?? [] })),
    vorrat: db.inhalte({ status: [INHALT_STATUS.NEU, INHALT_STATUS.IN_PRUEFUNG] }).map(i => ({
      id: i.id, titel: i.titel, quelle: i.quelle, typLabel: TYPEN[i.typ]?.label ?? i.typ, status: STATUS_LABEL[i.status], grund: i.notiz, ort: i.ort, bodenart: i.bodenart,
      erstellt: i.erstellt, eingereichtVon: i.eingereicht_von,
      medien: db.medien(i.id).filter(m => ['ok', 'unsicher'].includes(m.pruefung)).slice(0, 6).map(m => ({ id: m.id, art: m.art, bild: m.pfad ? `/medien/${m.pfad.split(path.sep).join('/')}` : m.url, datenschutz: m.datenschutz, pruefung: m.pruefung })),
    })),
    lernstand: ladeLernstand(dir),
    meta: { bereit: clientAus(env).bereit },
    verlauf: db.ereignisse(25),
  };
}

export function erstelleZentrale({ db, env = process.env, dir = socialDir(), anmeldung = erstelleAnmeldung({ env }), extraHosts = [], renderer = rendere } = {}) {
  async function api(req, res, pfad, benutzer) {
    const schreibend = req.method === 'POST';
    const darfFreigeben = !benutzer || benutzer.rolle === 'inhaber';   // ohne Anmeldung = lokaler Betrieb des Inhabers
    const wer = benutzer?.name ?? 'Inhaber';
    if (pfad === '/api/stand' && req.method === 'GET') return sende(res, 200, { ...stand(db, env, dir), benutzer, darfFreigeben });

    let m;
    if ((m = /^\/api\/beitrag\/(\d+)\/(freigeben|bearbeiten|verwerfen|zurueck)$/.exec(pfad)) && schreibend) {
      if (!darfFreigeben) throw new HttpFehler(403, 'Freigeben und Ändern macht der Inhaber.');
      const id = Number(m[1]); const body = await liesJson(req);
      if (m[2] === 'bearbeiten') bearbeiten(db, id, body, { von: wer });
      if (m[2] === 'freigeben') { if (body.text !== undefined || body.plattformen || body.geplantAm) bearbeiten(db, id, body, { von: wer }); freigeben(db, id, { von: wer }); }
      if (m[2] === 'verwerfen') verwerfen(db, id, { von: wer, grund: body.grund });
      if (m[2] === 'zurueck') zurueckholen(db, id, { von: wer });
      return sende(res, 200, { ok: true, beitrag: beitragAnsicht(db, db.beitrag(id)) });
    }
    if ((m = /^\/api\/inhalt\/(\d+)\/(entwurf|verwerfen)$/.exec(pfad)) && schreibend) {
      if (!darfFreigeben) throw new HttpFehler(403, 'Das macht der Inhaber.');
      const id = Number(m[1]); const body = await liesJson(req);
      if (m[2] === 'verwerfen') { db.inhaltAendern(id, { status: INHALT_STATUS.VERWORFEN }); db.ereignis(wer, 'inhalt-verworfen', `inhalt:${id}`); holeGeplanteZurueck(db, id, 'Das Material wurde verworfen.', { von: wer }); return sende(res, 200, { ok: true }); }
      const b = await erstelleEntwurf(db, { inhaltId: id, format: body.format ?? null, von: wer }, { rendere: renderer, dir, env });
      planeOffene(db, { dir });
      return sende(res, 200, { ok: true, beitrag: beitragAnsicht(db, db.beitrag(b.id)) });
    }
    throw new HttpFehler(404, 'Unbekannter Pfad');
  }

  return async function zentrale(req, res) {
    let pfad;
    try { pfad = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname); } catch { pfad = '/'; }
    try {
      if (!hostErlaubt(req.headers.host, extraHosts)) throw new HttpFehler(403, 'Host nicht freigegeben (TP_DASHBOARD_EXTRA_HOSTS)');
      const herkunft = req.headers.origin;
      if (herkunft && !hostErlaubt(herkunft.replace(/^https?:\/\//i, ''), extraHosts)) throw new HttpFehler(403, 'Herkunft nicht erlaubt');

      const sid = cookies(req)[SITZUNG];
      if (pfad === '/api/login' && req.method === 'POST') {
        const body = await liesJson(req);
        // Zwei Zaehler: je Adresse und je Adresse+Name. Das Notpasswort gilt mit
        // jedem Namen - nur nach Namen zu zaehlen liesse es unbegrenzt raten.
        const adresse = String(req.socket?.remoteAddress);
        const schluessel = `${adresse}::${String(body.name ?? '').toLowerCase()}`;
        if (anmeldung.gesperrt(schluessel) || anmeldung.gesperrt(adresse)) throw new HttpFehler(429, 'Zu viele Fehlversuche – bitte fünf Minuten warten.');
        const b = anmeldung.pruefe(body);
        await new Promise(r => setTimeout(r, 300));
        if (!b) { anmeldung.fehlversuch(schluessel); anmeldung.fehlversuch(adresse); throw new HttpFehler(401, 'Name oder Passwort falsch'); }
        anmeldung.erfolg(schluessel); anmeldung.erfolg(adresse);
        return sende(res, 200, { ok: true }, undefined, { 'Set-Cookie': `${SITZUNG}=${anmeldung.neueSitzung(b)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SITZUNG_MS / 1000}` });
      }
      if (pfad === '/api/logout' && req.method === 'POST') {
        anmeldung.beenden(sid);
        return sende(res, 200, { ok: true }, undefined, { 'Set-Cookie': `${SITZUNG}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
      }
      const benutzer = anmeldung.noetig() ? anmeldung.benutzer(sid) : null;
      if (anmeldung.noetig() && !benutzer) {
        if (pfad.startsWith('/api/') || pfad.startsWith('/medien/')) throw new HttpFehler(401, 'Anmeldung erforderlich');
        if (pfad === '/zentrale.css') return sende(res, 200, fs.readFileSync(path.join(UI, 'zentrale.css')), TYPEN_STATISCH['.css']);
        return sende(res, 200, fs.readFileSync(path.join(UI, 'anmelden.html')), TYPEN_STATISCH['.html']);
      }

      if (pfad.startsWith('/api/')) return await api(req, res, pfad, benutzer);

      if (pfad.startsWith('/medien/')) {
        const wurzel = medienDir(dir);
        const datei = path.resolve(wurzel, pfad.slice('/medien/medien/'.length));
        if (!pfad.startsWith('/medien/medien/') || !datei.startsWith(wurzel + path.sep) || !fs.existsSync(datei)) throw new HttpFehler(404, 'Nicht gefunden');
        return sendeMedium(req, res, datei);
      }

      const name = pfad === '/' ? 'zentrale.html' : pfad.slice(1);
      if (!/^[a-z0-9.-]+$/i.test(name) || name === 'upload.html') throw new HttpFehler(404, 'Nicht gefunden');
      const datei = path.join(UI, name);
      if (!fs.existsSync(datei)) throw new HttpFehler(404, 'Nicht gefunden');
      return sende(res, 200, fs.readFileSync(datei), TYPEN_STATISCH[path.extname(datei)] ?? 'application/octet-stream');
    } catch (e) {
      if (e instanceof HttpFehler) return sende(res, e.status, { error: e.message });
      if (e instanceof FreigabeFehler || e instanceof WerkstattFehler || e instanceof StatusFehler) return sende(res, 409, { error: e.message });
      console.error(`[zentrale] ${pfad}: ${String(e?.message ?? e).split('\n')[0]}`);
      return sende(res, 500, { error: 'Das hat nicht geklappt. Bitte noch einmal versuchen.' });
    }
  };
}

// --- Upload ---------------------------------------------------------------------

export function erstelleUpload({ db, dir = socialDir(), jetzt = () => Date.now(), nachUpload = inhaltId => verarbeiteEingang(db, { dir, nur: inhaltId }) } = {}) {
  const laufend = new Map();       // uploadId -> { inhaltId, ordner, name, dateien, bytes, belegt, bis }
  const jeTag = new Map();         // name|tag -> Anzahl Uploads

  // Bewusst keine Sperre nach Fehlversuchen: der Link hat 144 Bit Zufall und ist
  // nicht zu erraten. Eine Sperre je Adresse wuerde hinter einem Proxy (Funnel)
  // alle Monteure gemeinsam treffen - zehn Aufrufe eines Fremden genuegten.
  function zugang(token) {
    const z = findeZugang(token);
    if (!z) throw new HttpFehler(404, 'Dieser Link ist nicht (mehr) gültig. Bitte im Büro einen neuen geben lassen.');
    return z;
  }

  /**
   * Schreibt den Anfragekoerper direkt auf die Platte - ein 300-MB-Video darf
   * nicht im Speicher landen. pipeline kuemmert sich um Rueckstau (langsame
   * Platte) und um jeden Fehler auf beiden Seiten: volle Platte, abgerissene
   * Verbindung. Ohne das beendete ein Schreibfehler den ganzen Dienst.
   */
  async function speichere(req, ziel, max) {
    let groesse = 0; let kopf = Buffer.alloc(0);
    const waechter = new Transform({
      transform(stueck, _kodierung, weiter) {
        groesse += stueck.length;
        if (kopf.length < 16) kopf = Buffer.concat([kopf, stueck]).subarray(0, 16);
        weiter(groesse > max ? new HttpFehler(413, 'Datei zu groß') : null, stueck);
      },
    });
    try {
      await pipeline(req, waechter, fs.createWriteStream(ziel, { mode: 0o600 }));
    } catch (e) {
      fs.rmSync(ziel, { force: true });
      if (e instanceof HttpFehler) { req.resume(); throw e; }
      if (e?.code === 'ENOSPC') throw new HttpFehler(507, 'Der Speicher im Büro ist voll – bitte Bescheid geben.');
      throw new HttpFehler(400, 'Verbindung abgebrochen – bitte noch einmal senden.');
    }
    return { groesse, kopf };
  }

  return async function upload(req, res) {
    let pfad;
    try { pfad = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname); } catch { pfad = '/'; }
    try {
      const m = /^\/u\/([A-Za-z0-9_-]{16,64})(?:\/(start|datei|fertig)(?:\/([a-f0-9]{16}))?)?$/.exec(pfad);
      if (!m) throw new HttpFehler(404, 'Nicht gefunden');
      const [, token, aktion, uploadId] = m;
      const z = zugang(token);

      if (!aktion && req.method === 'GET') {
        const seite = fs.readFileSync(path.join(UI, 'upload.html'), 'utf8')
          .replace('__NAME__', z.name.replace(/[<>&"]/g, ''))
          .replace('"__LISTEN__"', JSON.stringify({ orte: ORTE, raeume: RAEUME, bodenarten: BODENARTEN, taetigkeiten: TAETIGKEITEN, maxDateien: GRENZEN.maxDateien }));
        return sende(res, 200, seite, TYPEN_STATISCH['.html']);
      }

      if (aktion === 'start' && req.method === 'POST') {
        const tag = `${z.name}|${new Date(jetzt()).toISOString().slice(0, 10)}`;
        if ((jeTag.get(tag) ?? 0) >= 30) throw new HttpFehler(429, 'Für heute sind es genug Uploads – bitte im Büro melden.');
        const angaben = pruefeAngaben(await liesJson(req));
        const { id, ordner } = legeBaustelleAn(db, angaben, { von: z.name, jetzt: new Date(jetzt()), dir });
        const neu = crypto.randomBytes(8).toString('hex');
        laufend.set(neu, { inhaltId: id, ordner, name: z.name, dateien: 0, bytes: 0, belegt: false, bis: jetzt() + 2 * 60 * 60 * 1000 });
        jeTag.set(tag, (jeTag.get(tag) ?? 0) + 1);
        return sende(res, 200, { upload: neu, ortVerworfen: angaben.ortVerworfen });
      }

      const lauf = uploadId ? laufend.get(uploadId) : null;
      if (!lauf || lauf.name !== z.name || lauf.bis < jetzt()) throw new HttpFehler(410, 'Dieser Upload ist abgelaufen – bitte noch einmal starten.');

      if (aktion === 'datei' && req.method === 'PUT') {
        if (lauf.dateien >= GRENZEN.maxDateien) throw new HttpFehler(413, `Höchstens ${GRENZEN.maxDateien} Dateien auf einmal`);
        const rest = GRENZEN.maxGesamtBytes - lauf.bytes;
        if (rest <= 0) throw new HttpFehler(413, 'Zu viel auf einmal – bitte in zwei Uploads aufteilen');
        // Eine Datei nach der anderen: zwei gleichzeitige Sendungen wuerden sich
        // Nummer und Groessenzaehler teilen. Die Seite sendet ohnehin der Reihe nach.
        if (lauf.belegt) throw new HttpFehler(409, 'Es läuft noch eine Übertragung – bitte kurz warten.');
        lauf.belegt = true;
        try {
          const tmp = path.join(lauf.ordner, `${crypto.randomBytes(6).toString('hex')}.teil`);
          const { groesse, kopf } = await speichere(req, tmp, Math.min(GRENZEN.maxVideoBytes, rest));
          const typ = erkenneTyp(kopf);
          const info = DATEITYPEN[typ];
          if (!info || (info.art === 'bild' && groesse > GRENZEN.maxBildBytes)) {
            fs.rmSync(tmp, { force: true });
            throw new HttpFehler(415, info ? 'Bild zu groß' : 'Nur Fotos und Videos (JPG, HEIC, PNG, MP4, MOV)');
          }
          const ziel = path.join(lauf.ordner, `${String(lauf.dateien + 1).padStart(2, '0')}.${info.endung}`);
          fs.renameSync(tmp, ziel);
          lauf.dateien += 1;
          lauf.bytes += groesse;
          trageDateiEin(db, lauf.inhaltId, { datei: ziel, typ, dir });
          return sende(res, 200, { ok: true, art: info.art, nummer: lauf.dateien });
        } finally {
          lauf.belegt = false;
        }
      }

      if (aktion === 'fertig' && req.method === 'POST') {
        laufend.delete(uploadId);
        let bericht = null;
        try { bericht = nachUpload(lauf.inhaltId).find(b => b.inhalt === lauf.inhaltId) ?? null; } catch (e) { console.error(`[upload] Prüfung: ${e.message}`); }
        return sende(res, 200, { ok: true, dateien: lauf.dateien, brauchbar: bericht?.brauchbar ?? null });
      }
      throw new HttpFehler(405, 'So nicht vorgesehen');
    } catch (e) {
      if (e instanceof HttpFehler) return sende(res, e.status, pfad.startsWith('/u/') && req.method === 'GET' ? `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;padding:32px"><h1 style="font-size:20px">${e.message}</h1></body>` : { error: e.message }, req.method === 'GET' ? TYPEN_STATISCH['.html'] : undefined);
      if (e instanceof EingangFehler) return sende(res, 400, { error: e.message });
      console.error(`[upload] ${String(e?.message ?? e).split('\n')[0]}`);
      return sende(res, 500, { error: 'Das hat nicht geklappt. Bitte noch einmal versuchen.' });
    }
  };
}

// --- Start ----------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = ladeUmgebung();
  const dir = socialDir();
  const db = oeffne();
  const anmeldung = erstelleAnmeldung({ env });
  const host = env.TP_SOCIAL_HOST || '127.0.0.1';
  const port = Number(env.TP_SOCIAL_PORT || 8020);
  const uploadHost = env.TP_SOCIAL_UPLOAD_HOST || '127.0.0.1';
  const uploadPort = Number(env.TP_SOCIAL_UPLOAD_PORT || 8021);
  if (host !== '127.0.0.1' && !anmeldung.noetig()) {
    console.error('[social] Start verweigert: Zentrale im Netz verlangt Zugänge (benutzer.json) oder ein Passwort (dashboard-passwort.txt).');
    process.exit(1);
  }
  const extraHosts = String(env.TP_DASHBOARD_EXTRA_HOSTS ?? '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  createServer(erstelleZentrale({ db, env, dir, anmeldung, extraHosts })).listen(port, host, () => console.log(`Social-Zentrale: http://${host}:${port}${anmeldung.noetig() ? ' (Anmeldung wie im Control Center)' : ''}`));
  // Nodes Standard bricht jede Anfrage nach fuenf Minuten ab - ein 150-MB-Video
  // ueber schwaches Netz braucht laenger. Dafuer endet eine Verbindung, auf der
  // zwei Minuten lang gar nichts kommt.
  const uploadServer = createServer({ requestTimeout: 60 * 60 * 1000 }, erstelleUpload({ db, dir }));
  uploadServer.on('connection', socket => socket.setTimeout(2 * 60 * 1000, () => socket.destroy()));
  uploadServer.listen(uploadPort, uploadHost, () => console.log(`Monteur-Upload:  http://${uploadHost}:${uploadPort}/u/<persönlicher Link>`));
}
