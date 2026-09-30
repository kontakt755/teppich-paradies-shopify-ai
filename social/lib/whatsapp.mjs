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

    if (vorhanden.length) {
      const tag = g.von.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
      const { id, neu } = db.inhaltAnlegen({
        quelle: 'baustelle', typ: 'kundenprojekt',
        titel: `WhatsApp · ${g.absender} · ${tag}`,
        schluessel: `whatsapp:${g.nachrichten[0].pk}`,
        einwilligung: false, eingereicht_von: g.absender,
        notiz: 'Aus der WhatsApp-Gruppe – Einwilligung vom Auftragszettel bestätigen, Ort und Boden nachtragen.',
        daten: { herkunft: 'whatsapp', ortBekannt: false },
      });
      if (neu) {
        const ordner = path.join(medienDir(dir), String(id), 'original');
        fs.mkdirSync(ordner, { recursive: true });
        let nummer = 0;
        for (const n of vorhanden) {
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
    }
    for (const n of g.nachrichten) erledigt.add(n.pk);
    schreibeStand(dir, rueckeVor(stand, gelesen, erledigt, jetzt));
  }
  schreibeStand(dir, rueckeVor(stand, gelesen, erledigt, jetzt));
  return bericht;
}
