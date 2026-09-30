/**
 * Zentrale Social-Media-Datenbank.
 *
 * Eine SQLite-Datei unter $TP_PRIVAT_DIR/social/social.db - ueber das in Node
 * eingebaute node:sqlite, also ohne zusaetzliche Abhaengigkeit und ohne
 * Dienst. Jeder Agent liest und schreibt hier; niemand fuehrt eine eigene
 * Liste. Die Datei enthaelt Baustellenangaben und gehoert nie ins Repository.
 *
 * Tabellen:
 *   inhalt        das Material (eine Baustelle, ein Produktanlass, eine Referenz)
 *   medium        Bilder und Videos dazu, mit Pruef- und Datenschutzurteil
 *   beitrag       was daraus veroeffentlicht wird (Feed, Karussell, Story, Reel)
 *   kennzahl      Messwerte je Beitrag und Plattform
 *   produkt_stand letzter bekannter Shop-Stand je Produkt (fuer "neu", "neue Farbe")
 *   ereignis      wer hat wann was getan
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dbPfad, pruefePrivat } from './pfade.mjs';
import { BEITRAG_STATUS, INHALT_STATUS, pruefeBeitragWechsel, pruefeInhaltWechsel, TYPEN } from './status.mjs';

const SCHEMA = [
  `CREATE TABLE inhalt (
     id INTEGER PRIMARY KEY,
     erstellt TEXT NOT NULL,
     aktualisiert TEXT NOT NULL,
     quelle TEXT NOT NULL,
     typ TEXT,
     titel TEXT NOT NULL,
     schluessel TEXT UNIQUE,
     status TEXT NOT NULL DEFAULT 'NEU',
     ort TEXT, raum TEXT, bodenart TEXT, taetigkeit TEXT, besonderheit TEXT,
     produkt_handle TEXT, produkt_titel TEXT,
     einwilligung INTEGER NOT NULL DEFAULT 0,
     eingereicht_von TEXT,
     wiederverwendbar INTEGER NOT NULL DEFAULT 1,
     punkte REAL NOT NULL DEFAULT 0,
     notiz TEXT,
     daten TEXT
   )`,
  `CREATE TABLE medium (
     id INTEGER PRIMARY KEY,
     inhalt_id INTEGER NOT NULL REFERENCES inhalt(id) ON DELETE CASCADE,
     art TEXT NOT NULL,
     rolle TEXT,
     pfad TEXT,
     url TEXT,
     beschriftung TEXT,
     breite INTEGER, hoehe INTEGER, bytes INTEGER,
     dhash TEXT, schaerfe REAL, helligkeit REAL,
     pruefung TEXT NOT NULL DEFAULT 'offen',
     pruef_grund TEXT,
     datenschutz TEXT NOT NULL DEFAULT 'ungeprueft',
     datenschutz_notiz TEXT,
     reihenfolge INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE beitrag (
     id INTEGER PRIMARY KEY,
     inhalt_id INTEGER NOT NULL REFERENCES inhalt(id),
     erstellt TEXT NOT NULL,
     aktualisiert TEXT NOT NULL,
     format TEXT NOT NULL,
     plattformen TEXT NOT NULL,
     vorlage TEXT,
     text TEXT NOT NULL,
     text_facebook TEXT,
     hashtags TEXT,
     link TEXT,
     medien TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'FREIGABE',
     geplant_am TEXT,
     veroeffentlicht_am TEXT,
     freigabe_von TEXT,
     freigabe_am TEXT,
     auto_freigabe INTEGER NOT NULL DEFAULT 0,
     hinweise TEXT,
     ergebnis TEXT,
     versuche INTEGER NOT NULL DEFAULT 0,
     fehler TEXT
   )`,
  `CREATE TABLE kennzahl (
     id INTEGER PRIMARY KEY,
     beitrag_id INTEGER NOT NULL REFERENCES beitrag(id) ON DELETE CASCADE,
     plattform TEXT NOT NULL,
     geholt_am TEXT NOT NULL,
     reichweite INTEGER, aufrufe INTEGER, likes INTEGER, kommentare INTEGER,
     geteilt INTEGER, gespeichert INTEGER, profilbesuche INTEGER, link_klicks INTEGER,
     punkte REAL,
     roh TEXT
   )`,
  `CREATE TABLE produkt_stand (
     handle TEXT PRIMARY KEY,
     titel TEXT, familie TEXT, gruppe TEXT,
     erstgesehen TEXT, zuletzt_gesehen TEXT,
     farben TEXT, bilder INTEGER,
     preis_min REAL, vergleich_max REAL,
     zuletzt_beworben TEXT
   )`,
  `CREATE TABLE ereignis (
     id INTEGER PRIMARY KEY,
     zeit TEXT NOT NULL, akteur TEXT, aktion TEXT NOT NULL, objekt TEXT, details TEXT
   )`,
  'CREATE INDEX medium_inhalt ON medium(inhalt_id)',
  'CREATE INDEX beitrag_status ON beitrag(status, geplant_am)',
  'CREATE INDEX kennzahl_beitrag ON kennzahl(beitrag_id, plattform, geholt_am)',
];

const JSON_SPALTEN = {
  inhalt: ['daten'],
  medium: [],
  beitrag: ['plattformen', 'medien', 'hinweise', 'ergebnis'],
  kennzahl: ['roh'],
  produkt_stand: ['farben'],
  ereignis: ['details'],
};

function iso(jetzt = new Date()) { return jetzt.toISOString(); }

export function oeffne(datei = dbPfad(), { jetzt = () => new Date() } = {}) {
  if (datei !== ':memory:') {
    pruefePrivat(datei);
    fs.mkdirSync(path.dirname(datei), { recursive: true });
  }
  const sql = new DatabaseSync(datei);
  sql.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const version = sql.prepare('PRAGMA user_version').get().user_version;
  if (version < 1) {
    sql.exec('BEGIN');
    for (const anweisung of SCHEMA) sql.exec(anweisung);
    sql.exec('PRAGMA user_version = 1; COMMIT');
  }

  const spalten = {};
  for (const tabelle of Object.keys(JSON_SPALTEN)) {
    spalten[tabelle] = new Set(sql.prepare(`PRAGMA table_info(${tabelle})`).all().map(s => s.name));
  }

  function rein(tabelle, felder) {
    const aus = {};
    for (const [k, v] of Object.entries(felder)) {
      if (v === undefined) continue;
      if (!spalten[tabelle].has(k)) throw new Error(`Unbekannte Spalte ${tabelle}.${k}`);
      if (JSON_SPALTEN[tabelle].includes(k)) aus[k] = v === null ? null : JSON.stringify(v);
      else if (typeof v === 'boolean') aus[k] = v ? 1 : 0;
      else aus[k] = v;
    }
    return aus;
  }

  function raus(tabelle, zeile) {
    if (!zeile) return null;
    const aus = { ...zeile };
    for (const k of JSON_SPALTEN[tabelle]) {
      if (typeof aus[k] === 'string') { try { aus[k] = JSON.parse(aus[k]); } catch { /* bleibt Text */ } }
    }
    return aus;
  }

  function einfuegen(tabelle, felder) {
    const f = rein(tabelle, felder);
    const namen = Object.keys(f);
    const r = sql.prepare(`INSERT INTO ${tabelle} (${namen.join(', ')}) VALUES (${namen.map(() => '?').join(', ')})`).run(...namen.map(n => f[n]));
    return Number(r.lastInsertRowid);
  }

  function aendern(tabelle, id, felder, schluessel = 'id') {
    const f = rein(tabelle, felder);
    const namen = Object.keys(f);
    if (!namen.length) return;
    sql.prepare(`UPDATE ${tabelle} SET ${namen.map(n => `${n} = ?`).join(', ')} WHERE ${schluessel} = ?`).run(...namen.map(n => f[n]), id);
  }

  const lies = (tabelle, where = '', ...werte) => sql.prepare(`SELECT * FROM ${tabelle} ${where}`).all(...werte).map(z => raus(tabelle, z));
  const liesEins = (tabelle, where, ...werte) => raus(tabelle, sql.prepare(`SELECT * FROM ${tabelle} ${where}`).get(...werte));

  const db = {
    sql,
    schliessen: () => sql.close(),

    ereignis(akteur, aktion, objekt = null, details = null) {
      einfuegen('ereignis', { zeit: iso(jetzt()), akteur: akteur ?? 'system', aktion, objekt, details });
    },
    ereignisse: (grenze = 100) => lies('ereignis', 'ORDER BY id DESC LIMIT ?', grenze),

    // --- Inhalte -----------------------------------------------------------
    /** Legt einen Inhalt an. Gibt es den Schluessel schon, entsteht nichts Neues. */
    inhaltAnlegen(felder) {
      if (felder.schluessel) {
        const da = liesEins('inhalt', 'WHERE schluessel = ?', felder.schluessel);
        if (da) return { id: da.id, neu: false };
      }
      const zeit = iso(jetzt());
      const id = einfuegen('inhalt', { erstellt: zeit, aktualisiert: zeit, status: INHALT_STATUS.NEU, ...felder });
      return { id, neu: true };
    },
    inhalt: (id) => liesEins('inhalt', 'WHERE id = ?', id),
    inhalte({ status = null, quelle = null, grenze = 500 } = {}) {
      const teile = []; const werte = [];
      if (status) { const s = [].concat(status); teile.push(`status IN (${s.map(() => '?').join(',')})`); werte.push(...s); }
      if (quelle) { teile.push('quelle = ?'); werte.push(quelle); }
      return lies('inhalt', `${teile.length ? `WHERE ${teile.join(' AND ')}` : ''} ORDER BY punkte DESC, id DESC LIMIT ?`, ...werte, grenze);
    },
    inhaltAendern(id, felder) {
      const alt = db.inhalt(id);
      if (!alt) throw new Error(`Inhalt ${id} gibt es nicht`);
      if (felder.status) pruefeInhaltWechsel(alt.status, felder.status);
      aendern('inhalt', id, { ...felder, aktualisiert: iso(jetzt()) });
      return db.inhalt(id);
    },

    // --- Medien ------------------------------------------------------------
    mediumAnlegen: (inhaltId, felder) => einfuegen('medium', { inhalt_id: inhaltId, ...felder }),
    medium: (id) => liesEins('medium', 'WHERE id = ?', id),
    medien: (inhaltId) => lies('medium', 'WHERE inhalt_id = ? ORDER BY reihenfolge, id', inhaltId),
    mediumAendern(id, felder) { aendern('medium', id, felder); return db.medium(id); },
    /** Hashes aller bereits geprueften Bilder - Grundlage der Dublettensuche ueber Baustellen hinweg. */
    bekannteHashes: () => sql.prepare("SELECT id, inhalt_id, dhash FROM medium WHERE dhash IS NOT NULL AND pruefung IN ('ok','unsicher')").all(),

    // --- Beitraege ---------------------------------------------------------
    beitragAnlegen(felder) {
      const zeit = iso(jetzt());
      return einfuegen('beitrag', { erstellt: zeit, aktualisiert: zeit, status: BEITRAG_STATUS.FREIGABE, ...felder });
    },
    beitrag: (id) => liesEins('beitrag', 'WHERE id = ?', id),
    beitraege({ status = null, grenze = 500 } = {}) {
      if (!status) return lies('beitrag', 'ORDER BY COALESCE(geplant_am, erstellt) DESC LIMIT ?', grenze);
      const s = [].concat(status);
      return lies('beitrag', `WHERE status IN (${s.map(() => '?').join(',')}) ORDER BY COALESCE(geplant_am, erstellt) LIMIT ?`, ...s, grenze);
    },
    beitraegeZuInhalt: (inhaltId) => lies('beitrag', 'WHERE inhalt_id = ? ORDER BY id', inhaltId),
    beitragAendern(id, felder) {
      const alt = db.beitrag(id);
      if (!alt) throw new Error(`Beitrag ${id} gibt es nicht`);
      if (felder.status) pruefeBeitragWechsel(alt.status, felder.status);
      aendern('beitrag', id, { ...felder, aktualisiert: iso(jetzt()) });
      return db.beitrag(id);
    },
    /** Faellige, freigegebene Beitraege - die Arbeitsliste des Publishers. */
    faellige(zeitpunkt = jetzt()) {
      return lies('beitrag', 'WHERE status = ? AND geplant_am IS NOT NULL AND geplant_am <= ? ORDER BY geplant_am', BEITRAG_STATUS.GEPLANT, iso(zeitpunkt));
    },

    // --- Kennzahlen --------------------------------------------------------
    kennzahlSpeichern: (felder) => einfuegen('kennzahl', { geholt_am: iso(jetzt()), ...felder }),
    /** Je Beitrag und Plattform der jeweils letzte Messwert. */
    letzteKennzahlen() {
      return sql.prepare(`SELECT k.* FROM kennzahl k JOIN (
          SELECT beitrag_id, plattform, MAX(id) AS id FROM kennzahl GROUP BY beitrag_id, plattform
        ) l ON l.id = k.id`).all().map(z => raus('kennzahl', z));
    },

    // --- Shop-Stand --------------------------------------------------------
    produktStand: () => new Map(lies('produkt_stand').map(p => [p.handle, p])),
    produktStandSetzen(handle, felder) {
      const da = sql.prepare('SELECT handle FROM produkt_stand WHERE handle = ?').get(handle);
      if (da) aendern('produkt_stand', handle, felder, 'handle');
      else einfuegen('produkt_stand', { handle, ...felder });
    },

    // --- Uebersicht fuer die Zentrale -------------------------------------
    uebersicht() {
      const zahl = (q, ...w) => sql.prepare(q).get(...w).n;
      const offen = "('NEU','IN_PRUEFUNG')";
      const geplant = lies('beitrag', 'WHERE status = ? ORDER BY geplant_am LIMIT 20', BEITRAG_STATUS.GEPLANT).map(b => {
        const i = db.inhalt(b.inhalt_id);
        return { id: b.id, geplantAm: b.geplant_am, format: b.format, typ: i?.typ ?? null, typLabel: TYPEN[i?.typ]?.label ?? i?.typ ?? 'Beitrag', titel: i?.titel ?? '' };
      });
      return {
        neu: {
          baustellenbilder: zahl(`SELECT COUNT(*) n FROM medium m JOIN inhalt i ON i.id = m.inhalt_id WHERE i.quelle = 'baustelle' AND i.status IN ${offen} AND m.art = 'bild' AND m.pruefung IN ('offen','ok','unsicher')`),
          videos: zahl(`SELECT COUNT(*) n FROM medium m JOIN inhalt i ON i.id = m.inhalt_id WHERE i.status IN ${offen} AND m.art = 'video'`),
          produkte: zahl(`SELECT COUNT(*) n FROM inhalt WHERE quelle = 'shopify' AND status IN ${offen}`),
          baustellen: zahl(`SELECT COUNT(*) n FROM inhalt WHERE quelle = 'baustelle' AND status IN ${offen}`),
        },
        vorbereitet: {
          posts: zahl("SELECT COUNT(*) n FROM beitrag WHERE status = 'FREIGABE' AND format IN ('feed','karussell')"),
          storys: zahl("SELECT COUNT(*) n FROM beitrag WHERE status = 'FREIGABE' AND format = 'story'"),
          reels: zahl("SELECT COUNT(*) n FROM beitrag WHERE status = 'FREIGABE' AND format = 'reel'"),
        },
        freigabe: zahl("SELECT COUNT(*) n FROM beitrag WHERE status = 'FREIGABE'"),
        fehler: zahl("SELECT COUNT(*) n FROM beitrag WHERE status = 'FEHLER'"),
        veroeffentlicht: zahl("SELECT COUNT(*) n FROM beitrag WHERE status IN ('VEROEFFENTLICHT','ARCHIV')"),
        geplant,
      };
    },
  };
  return db;
}
