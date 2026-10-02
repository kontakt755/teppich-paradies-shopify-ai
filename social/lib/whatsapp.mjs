/**
 * WhatsApp-Gruppe als Auffangnetz fuer Baustellenfotos.
 *
 * Hauptweg bleibt der persoenliche Upload-Link. Was die Monteure trotzdem nur
 * in die Firmengruppe schicken, holt dieses Modul aus der WhatsApp-App auf dem
 * Betriebsrechner: gelesen werden die Chat-Datenbank der Mac-App
 * (ChatStorage.sqlite, nur als Kopie) und ihr Medienordner. Kein Bot, keine
 * Verbindung zu WhatsApp, nichts wird dort veraendert.
 *
 * macOS schuetzt den Ordner: node braucht Festplattenvollzugriff
 * (Systemeinstellungen -> Datenschutz & Sicherheit). Ohne ihn meldet der Takt
 * das einmal und laeuft sonst normal weiter.
 *
 * Fotos aus der Gruppe kommen ohne Einwilligung herein - es gibt kein Haekchen.
 * Die Freigabe sperrt, bis der Inhaber die Einwilligung vom Auftragszettel in
 * der Zentrale bestaetigt. Ort, Boden und Raum traegt die Redaktion nach.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATEITYPEN, erkenneTyp, trageDateiEin } from './eingang.mjs';
import { medienDir, socialDir } from './pfade.mjs';
import { verarbeiteEingang } from './pruefung.mjs';

export class WhatsAppFehler extends Error {
  constructor(meldung, { zugriff = false } = {}) { super(meldung); this.zugriff = zugriff; }
}

export const standardQuelle = () => path.join(os.homedir(), 'Library', 'Group Containers', 'group.net.whatsapp.WhatsApp.shared');
const standPfad = (dir = socialDir()) => path.join(dir, 'whatsapp-stand.json');

// Core Data zaehlt Sekunden ab dem 1.1.2001.
const APPLE_EPOCHE = 978307200;
export const zuDatum = sekunden => new Date((Number(sekunden) + APPLE_EPOCHE) * 1000);
const zuApple = datum => datum.getTime() / 1000 - APPLE_EPOCHE;

const TYP = { 1: 'bild', 2: 'video' };

function spalten(sql, tabelle, schema = 'main') {
  return new Set(sql.prepare(`PRAGMA ${schema}.table_info(${tabelle})`).all().map(s => s.name));
}

/** Kennung ohne Namen: "4917011@s.whatsapp.net" -> "4917011", anonyme "…@lid" -> "Mitglied …1234". */
export function anzeigeName(wert) {
  const w = String(wert ?? '').trim();
  if (!w) return 'unbekannt';
  const lid = /^(\d+)@lid$/.exec(w);
  if (lid) return `Mitglied …${lid[1].slice(-4)}`;
  return w.replace(/@s\.whatsapp\.net$/, '');
}

/**
 * Liest Bild- und Videonachrichten einer Gruppe. Gearbeitet wird auf einer
 * Kopie der Datenbank samt WAL - die laufende App haelt das Original offen.
 */
export function leseGruppe({ quelle = standardQuelle(), gruppe, abPk = 0, seit = new Date(0) }) {
  const original = path.join(quelle, 'ChatStorage.sqlite');
  try {
    // Zuerst der Ordner: ohne Festplattenvollzugriff meldet macOS dort EPERM,
    // die Datei darin erscheint dagegen einfach als "nicht vorhanden".
    fs.readdirSync(quelle);
    fs.accessSync(original, fs.constants.R_OK);
  } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EACCES') throw new WhatsAppFehler('macOS verweigert den Zugriff auf WhatsApp – node braucht Festplattenvollzugriff (social/WHATSAPP.md)', { zugriff: true });
    throw new WhatsAppFehler(`Keine WhatsApp-Daten unter ${quelle} – ist die Mac-App angemeldet?`);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-wa-'));
  let sql;
  try {
    const kopiere = (name, ziel) => {
      for (const endung of ['', '-wal', '-shm']) {
        const q = path.join(quelle, name + endung);
        if (fs.existsSync(q)) fs.copyFileSync(q, path.join(tmp, ziel + endung));
      }
      return fs.existsSync(path.join(tmp, ziel));
    };
    kopiere('ChatStorage.sqlite', 'c.sqlite');
    sql = new DatabaseSync(path.join(tmp, 'c.sqlite'));
    // Adressbuch des verknuepften Handys: loest die anonymen "@lid"-Kennungen in Namen auf.
    const mitKontakten = kopiere('ContactsV2.sqlite', 'k.sqlite');
    if (mitKontakten) sql.exec(`ATTACH DATABASE '${path.join(tmp, 'k.sqlite').replace(/'/g, "''")}' AS k`);
    const sitzungen = sql.prepare("SELECT Z_PK AS pk FROM ZWACHATSESSION WHERE ZPARTNERNAME = ? AND ZCONTACTJID LIKE '%@g.us'").all(gruppe);
    if (!sitzungen.length) throw new WhatsAppFehler(`WhatsApp-Gruppe „${gruppe}“ nicht gefunden (Name genau wie in der App)`);
    if (sitzungen.length > 1) throw new WhatsAppFehler(`Mehrere WhatsApp-Gruppen heißen „${gruppe}“ – bitte eine umbenennen`);

    // Die App aendert ihr Schema gelegentlich: Namensquellen nur verwenden, wenn es sie gibt.
    // WhatsApp fuer Mac 26 (geprueft 30.09.2026): Mitglieder tragen anonyme "@lid"-Kennungen,
    // die Namensfelder am Mitglied sind leere Texte, ZWAMESSAGE.ZPUSHNAME ist kodiert (kein
    // Name). Namen gibt es nur ueber das Adressbuch (ContactsV2, Spalte ZLID) - nicht fuer jeden.
    // Unterabfragen statt Joins: ein doppelter Kontakt darf keine Nachricht verdoppeln.
    const mitglied = spalten(sql, 'ZWAGROUPMEMBER');
    const pushname = sql.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ZWAPROFILEPUSHNAME'").get();
    const kontakt = mitKontakten ? spalten(sql, 'ZWAADDRESSBOOKCONTACT', 'k') : new Set();
    const leer = n => `NULLIF(TRIM(${n}), '')`;
    const namen = [
      mitglied.has('ZCONTACTNAME') && leer('gm.ZCONTACTNAME'),
      mitglied.has('ZFIRSTNAME') && leer('gm.ZFIRSTNAME'),
      kontakt.has('ZLID') && kontakt.has('ZFULLNAME') && `(SELECT COALESCE(${leer('kc.ZFULLNAME')}${kontakt.has('ZGIVENNAME') ? `, ${leer('kc.ZGIVENNAME')}` : ''}) FROM k.ZWAADDRESSBOOKCONTACT kc WHERE kc.ZLID = gm.ZMEMBERJID AND COALESCE(${leer('kc.ZFULLNAME')}${kontakt.has('ZGIVENNAME') ? `, ${leer('kc.ZGIVENNAME')}` : ''}) IS NOT NULL LIMIT 1)`,
      pushname && `(SELECT ${leer('pn.ZPUSHNAME')} FROM ZWAPROFILEPUSHNAME pn WHERE pn.ZJID = gm.ZMEMBERJID AND ${leer('pn.ZPUSHNAME')} IS NOT NULL LIMIT 1)`,
      mitglied.has('ZMEMBERJID') && leer('gm.ZMEMBERJID'),
    ].filter(Boolean);
    const zeilen = sql.prepare(`
      SELECT m.Z_PK AS pk, m.ZMESSAGEDATE AS datum, m.ZMESSAGETYPE AS typ, m.ZISFROMME AS vonMir,
             mi.ZMEDIALOCALPATH AS pfad, ${namen.length ? `COALESCE(${namen.join(', ')})` : 'NULL'} AS absender
        FROM ZWAMESSAGE m
        JOIN ZWAMEDIAITEM mi ON mi.Z_PK = m.ZMEDIAITEM
        LEFT JOIN ZWAGROUPMEMBER gm ON gm.Z_PK = m.ZGROUPMEMBER
       WHERE m.ZCHATSESSION = ? AND m.ZMESSAGETYPE IN (1, 2) AND m.Z_PK > ? AND m.ZMESSAGEDATE >= ?
       ORDER BY m.Z_PK`).all(sitzungen[0].pk, abPk, zuApple(seit));
    return zeilen.map(z => {
      // Der Pfad ist relativ zum Ordner "Message" - je nach App-Version mit oder ohne diesen Teil.
      const kandidaten = z.pfad ? [path.join(quelle, 'Message', z.pfad), path.join(quelle, z.pfad)] : [];
      return {
        pk: z.pk, datum: zuDatum(z.datum), art: TYP[z.typ],
        absender: z.vonMir ? 'Büro' : anzeigeName(z.absender),
        datei: kandidaten.find(k => fs.existsSync(k)) ?? null,
      };
    });
  } finally {
    try { sql?.close(); } catch { /* schon zu */ }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Fasst Nachrichten zu Baustellen: derselbe Absender, hoechstens drei Stunden Pause dazwischen. */
export function gruppiere(nachrichten, { lueckeMs = 3 * 60 * 60 * 1000 } = {}) {
  const gruppen = [];
  const offen = new Map();
  for (const n of [...nachrichten].sort((a, b) => a.datum - b.datum || a.pk - b.pk)) {
    const g = offen.get(n.absender);
    if (g && n.datum - g.bis <= lueckeMs) { g.nachrichten.push(n); g.bis = n.datum; continue; }
    const neu = { absender: n.absender, von: n.datum, bis: n.datum, nachrichten: [n] };
    gruppen.push(neu); offen.set(n.absender, neu);
  }
  return gruppen;
}

export function liesStand(dir = socialDir()) {
  try { return JSON.parse(fs.readFileSync(standPfad(dir), 'utf8')); } catch { return {}; }
}

function schreibeStand(dir, stand) {
  fs.writeFileSync(standPfad(dir), `${JSON.stringify(stand, null, 2)}\n`);
}

/**
 * Legt aus einer Gruppe von Nachrichten (ein Absender, eine Baustelle) einen Inhalt an
 * und kopiert die Dateien hinein. Gibt es den Schluessel schon, passiert nichts.
 */
function legeBaustelleAn(db, g, { schluessel, dir, pruefe, bericht }) {
  const tag = g.von.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
  const { id, neu } = db.inhaltAnlegen({
    quelle: 'baustelle', typ: 'kundenprojekt',
    titel: `WhatsApp · ${g.absender} · ${tag}`,
    schluessel,
    einwilligung: true, eingereicht_von: g.absender, // Einwilligung liegt mit jedem Auftrag vor (Inhaber 02.10.2026)
    notiz: 'Aus der WhatsApp-Gruppe – Einwilligung vom Auftragszettel bestätigen, Ort und Boden nachtragen.',
    daten: { herkunft: 'whatsapp', ortBekannt: false },
  });
  if (!neu) { bericht.schonDa = (bericht.schonDa ?? 0) + 1; return; }
  const ordner = path.join(medienDir(dir), String(id), 'original');
  fs.mkdirSync(ordner, { recursive: true });
  let nummer = 0;
  for (const n of g.nachrichten) {
    const kopf = Buffer.alloc(16);
    const fd = fs.openSync(n.datei, 'r');
    try { fs.readSync(fd, kopf, 0, 16, 0); } finally { fs.closeSync(fd); }
    const typ = erkenneTyp(kopf);
    if (!DATEITYPEN[typ]) { bericht.fehlend += 1; continue; }
    nummer += 1;
    const ziel = path.join(ordner, `${String(nummer).padStart(2, '0')}.${DATEITYPEN[typ].endung}`);
    fs.copyFileSync(n.datei, ziel);
    trageDateiEin(db, id, { datei: ziel, typ, dir });
  }
  db.ereignis('whatsapp', 'baustelle-eingang', `inhalt:${id}`, { absender: g.absender, dateien: nummer });
  pruefe(db, { dir, nur: id });
  bericht.neu.push({ id, absender: g.absender, dateien: nummer });
  bericht.dateien += nummer;
}

// --- Chat-Export vom Handy ---------------------------------------------------
// Der Mac holt beim Verknuepfen nur einen Teil des Verlaufs und laedt aeltere
// Fotos erst beim Anklicken. Das Handy hat alles: "Chat exportieren" mit Medien,
// per AirDrop an den Betriebsrechner. Zwei Formate: iPhone "[25.09.26, 12:25:31]
// Name: <Anhang: 00000012-PHOTO-….jpg>", Android "25.09.26, 12:25 - Name: IMG-….jpg
// (Datei angehängt)".

const STEUERZEICHEN = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const KOPF_IOS = /^\[(\d{1,2})[./](\d{1,2})[./](\d{2,4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s?([AP]M))?\] ([^:]+?): (.*)$/;
const KOPF_ANDROID = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4}),? (\d{1,2}):(\d{2})(?:\s?([AP]M))? - ([^:]+?): (.*)$/;
const MEDIENENDUNG = /\.(jpe?g|png|heic|webp|mp4|mov)$/i;

function zeitAus(t, m, j, h, mi, s, ampm, amerikanisch) {
  let [tag, monat] = amerikanisch ? [Number(m), Number(t)] : [Number(t), Number(m)];
  let jahr = Number(j); if (jahr < 100) jahr += 2000;
  let stunde = Number(h);
  if (ampm === 'PM' && stunde < 12) stunde += 12;
  if (ampm === 'AM' && stunde === 12) stunde = 0;
  // Ortszeit des Betriebsrechners (Europe/Berlin) - so steht sie im Export.
  return new Date(jahr, monat - 1, tag, stunde, Number(mi), Number(s ?? 0));
}

/**
 * Liest die Chat-Datei eines Exports. Liefert nur Nachrichten mit einer Foto- oder
 * Videodatei, die im Export tatsaechlich liegt.
 * @param dateien  Dateinamen im Export-Ordner
 */
export function leseExportText(text, dateien) {
  const vorhanden = new Set(dateien);
  const zeilen = text.replace(STEUERZEICHEN, '').split(/\r?\n/);
  // Amerikanisches Datum (Monat zuerst, AM/PM) erkennt man an AM/PM.
  const amerikanisch = zeilen.some(z => /^\[?\d{1,2}\/\d{1,2}\/\d{2,4},? \d{1,2}:\d{2}(:\d{2})?\s?[AP]M/.test(z));
  const nachrichten = [];
  zeilen.forEach((zeile, nr) => {
    let m = KOPF_IOS.exec(zeile); let kopf;
    if (m) kopf = { datum: zeitAus(m[1], m[2], m[3], m[4], m[5], m[6], m[7], amerikanisch), absender: m[8].trim(), rest: m[9] };
    else if ((m = KOPF_ANDROID.exec(zeile))) kopf = { datum: zeitAus(m[1], m[2], m[3], m[4], m[5], null, m[6], amerikanisch), absender: m[7].trim(), rest: m[8] };
    if (!kopf) return;
    const datei = kopf.rest.split(/[<>:\s]+/).map(w => w.trim()).find(w => MEDIENENDUNG.test(w) && vorhanden.has(w));
    if (!datei) return;
    nachrichten.push({ pk: nr + 1, datum: kopf.datum, absender: kopf.absender, art: /\.(mp4|mov)$/i.test(datei) ? 'video' : 'bild', datei });
  });
  return nachrichten;
}

/** Sucht den neuesten Export der Gruppe in "Downloads". */
export function findeExport(gruppe, ordner = path.join(os.homedir(), 'Downloads')) {
  let namen = [];
  try { namen = fs.readdirSync(ordner); } catch { return null; }
  const passend = namen.filter(n => /^WhatsApp[ -]Chat/i.test(n) && n.includes(gruppe) && (n.endsWith('.zip') || fs.statSync(path.join(ordner, n)).isDirectory()));
  passend.sort((a, b) => fs.statSync(path.join(ordner, b)).mtimeMs - fs.statSync(path.join(ordner, a)).mtimeMs);
  return passend.length ? path.join(ordner, passend[0]) : null;
}

/**
 * Uebernimmt einen Chat-Export (ZIP oder entpackter Ordner). Alles ist Vergangenheit,
 * es wird nicht gewartet. Dieselbe Baustelle entsteht nie doppelt (Schluessel je erster
 * Datei), und Bilder, die es schon gibt - etwa ueber den Mac schon uebernommen -,
 * sortiert die Bildpruefung als Dublette aus.
 */
export function uebernimmExport(db, quelle, { dir = socialDir(), pruefe = verarbeiteEingang, entpacke = (zip, ziel) => execFileSync('/usr/bin/ditto', ['-x', '-k', zip, ziel]) } = {}) {
  const bericht = { neu: [], dateien: 0, fehlend: 0, schonDa: 0, nachrichten: 0 };
  let ordner = quelle; let tmp = null;
  if (quelle.endsWith('.zip')) { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-wa-export-')); entpacke(quelle, tmp); ordner = tmp; }
  try {
    // Der Chattext liegt je nach Handy direkt im ZIP oder in einem Unterordner.
    const finde = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { const t = finde(p); if (t) return t; } else if (/^(_chat\.txt|WhatsApp[- ]Chat.*\.txt)$/i.test(e.name)) return p; } return null; };
    const chat = finde(ordner);
    if (!chat) throw new WhatsAppFehler('Im Export fehlt der Chatverlauf (_chat.txt) – beim Exportieren „Medien anhängen“ wählen');
    const basis = path.dirname(chat);
    const nachrichten = leseExportText(fs.readFileSync(chat, 'utf8'), fs.readdirSync(basis)).map(n => ({ ...n, datei: path.join(basis, n.datei) }));
    bericht.nachrichten = nachrichten.length;
    for (const g of gruppiere(nachrichten)) {
      legeBaustelleAn(db, g, { schluessel: `whatsapp-export:${path.basename(g.nachrichten[0].datei)}`, dir, pruefe, bericht });
    }
    return bericht;
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Schiebt `letzterPk` so weit vor, wie alle gelesenen Nachrichten erledigt sind. */
function rueckeVor(stand, gelesen, erledigt, jetzt) {
  let letzterPk = stand.letzterPk ?? 0;
  for (const n of [...gelesen].sort((a, b) => a.pk - b.pk)) {
    if (!erledigt.has(n.pk)) break;
    letzterPk = n.pk;
  }
  stand.letzterPk = letzterPk;
  stand.erledigt = [...erledigt].filter(pk => pk > letzterPk).sort((a, b) => a - b);
  stand.fehler = null; stand.zuletzt = jetzt.toISOString();
  return { ...stand };
}

/**
 * Uebernimmt neue Fotos und Videos der Gruppe als Baustellen.
 *
 * Merkt sich, welche Nachrichten erledigt sind: `letzterPk` (alles bis dahin)
 * plus die einzeln erledigten danach. So ueberholt kein Absender einen anderen,
 * dessen Bilder noch warten. Eine Baustelle wartet, bis ihre letzte Nachricht
 * `ruheMs` alt ist (vielleicht kommen noch Bilder) und solange eine Datei
 * fehlt, die WhatsApp noch nicht heruntergeladen hat - hoechstens `downloadMs`
 * ab der Nachricht bzw. ab dem ersten Lauf. Ein frisch verknuepfter Mac holt
 * aeltere Fotos erst, wenn jemand die Gruppe dort oeffnet; die Frist ab dem
 * ersten Lauf laesst dafuer Zeit. Danach wird die Datei uebersprungen und gezaehlt.
 *
 * @returns null, wenn keine Gruppe eingestellt ist, sonst ein Bericht
 */
export function uebernimmWhatsApp(db, { env = process.env, dir = socialDir(), jetzt = new Date(), lese = leseGruppe, pruefe = verarbeiteEingang, ruheMs = 3 * 60 * 60 * 1000, downloadMs = 3 * 24 * 60 * 60 * 1000 } = {}) {
  const gruppe = env.SOCIAL_WHATSAPP_GRUPPE;
  if (!gruppe) return null;
  const stand = liesStand(dir);
  const bericht = { neu: [], dateien: 0, fehlend: 0, wartet: 0, fehler: null, neuerFehler: false };
  // Beim ersten Lauf nur die letzten 14 Tage - nicht das ganze Archiv der Gruppe.
  // Gerechnet ab dem ersten Lauf, damit wartende Bilder nicht aus dem Fenster rutschen.
  const beginn = new Date(stand.beginn ?? jetzt);
  const seit = stand.letzterPk ? new Date(0) : new Date(beginn.getTime() - 14 * 24 * 60 * 60 * 1000);

  let gelesen;
  try {
    gelesen = lese({ quelle: env.SOCIAL_WHATSAPP_DIR || standardQuelle(), gruppe, abPk: stand.letzterPk ?? 0, seit });
  } catch (e) {
    bericht.fehler = e.message;
    // Nur melden, wenn sich etwas geaendert hat - sonst stuende derselbe Satz alle 15 Minuten im Protokoll.
    bericht.neuerFehler = stand.fehler !== e.message;
    schreibeStand(dir, { ...stand, fehler: e.message });
    return bericht;
  }

  stand.beginn = beginn.toISOString();
  const erledigt = new Set(stand.erledigt ?? []);
  const nachrichten = gelesen.filter(n => !erledigt.has(n.pk));
  for (const g of gruppiere(nachrichten)) {
    const zuFrisch = g.nachrichten.some(n => !n.datei && jetzt - Math.max(n.datum, beginn) < downloadMs);
    if (jetzt - g.bis < ruheMs || zuFrisch) { bericht.wartet += g.nachrichten.length; continue; }
    const vorhanden = g.nachrichten.filter(n => n.datei);
    bericht.fehlend += g.nachrichten.length - vorhanden.length;

    if (vorhanden.length) legeBaustelleAn(db, { ...g, nachrichten: vorhanden }, { schluessel: `whatsapp:${g.nachrichten[0].pk}`, dir, pruefe, bericht });
    for (const n of g.nachrichten) erledigt.add(n.pk);
    schreibeStand(dir, rueckeVor(stand, gelesen, erledigt, jetzt));
  }
  schreibeStand(dir, rueckeVor(stand, gelesen, erledigt, jetzt));
  return bericht;
}
