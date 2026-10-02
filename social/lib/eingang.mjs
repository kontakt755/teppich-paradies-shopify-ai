/**
 * Content-Eingang: was die Bodenleger von der Baustelle schicken.
 *
 * Der Monteur macht Fotos, tippt hoechstens ein paar Knoepfe an und sendet.
 * Alles Weitere - pruefen, zuschneiden, Text, Freigabe - passiert hier im Haus.
 *
 * Zwei Grundsaetze aus dem bestehenden Konzept
 * (docs/control-center/instagram-baustellenfotos.md) gelten weiter:
 *   - Ohne Einwilligung des Kunden entsteht gar kein Eintrag.
 *   - Nie genauer als der Ort: Strassen und Hausnummern werden nicht gespeichert.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BODENARTEN, ORTE, RAEUME, TAETIGKEITEN } from './konfig.mjs';
import { medienDir, socialDir, zugaengePfad } from './pfade.mjs';

export class EingangFehler extends Error {}

export const DATEITYPEN = Object.freeze({
  'image/jpeg': { endung: 'jpg', art: 'bild' },
  'image/png': { endung: 'png', art: 'bild' },
  'image/heic': { endung: 'heic', art: 'bild' },
  'image/heif': { endung: 'heic', art: 'bild' },
  'image/webp': { endung: 'webp', art: 'bild' },
  'video/mp4': { endung: 'mp4', art: 'video' },
  'video/quicktime': { endung: 'mov', art: 'video' },
});

export const GRENZEN = Object.freeze({
  maxDateien: 25,
  maxBildBytes: 40 * 1024 * 1024,
  maxVideoBytes: 400 * 1024 * 1024,
  maxGesamtBytes: 1536 * 1024 * 1024,   // je Upload - ein verlorener Link soll die Platte nicht fuellen koennen
});

const VORHER_NACHHER = ['', 'vorher', 'nachher', 'beides'];

function kurz(wert, laenge = 120) {
  return String(wert ?? '').replace(/\s+/g, ' ').trim().slice(0, laenge);
}

/**
 * Macht aus der Ortsangabe einen Ort - und nichts Genaueres.
 *
 * Wer "Berliner Str. 12, Oranienburg" eintippt, meint es gut, aber die Adresse
 * eines Kunden hat in einer Social-Media-Datenbank nichts zu suchen. Bekannte
 * Orte werden erkannt, alles mit Hausnummer oder Strassenwort wird verworfen.
 */
export function bereinigeOrt(eingabe, orte = ORTE) {
  const roh = kurz(eingabe, 80);
  if (!roh) return { ort: null, bekannt: false, verworfen: false };
  const norm = s => s.toLowerCase().replace(/ß/g, 'ss').replace(/[^a-zäöü]+/g, ' ').trim();
  const strasse = /(stra(ss|ß)e|str\.?|weg|allee|platz|gasse|ring|damm|chaussee|ufer)\b/i;
  const adresse = /\d/.test(roh) || strasse.test(roh);
  // Als ganzes Wort suchen: "Oranienburger Str." ist eine Strasse, kein Ort.
  // Laengere Namen zuerst: "Berlin-Pankow" soll nicht als "Berlin" enden.
  const finde = (text) => {
    const gesucht = ` ${norm(text)} `;
    return [...orte].sort((a, b) => b.length - a.length).find(o => gesucht.includes(` ${norm(o)} `));
  };
  // Bei einer Adresse steht der Ort hinten ("Berliner Straße 3, Nauen") - die
  // Teile mit Strassenwort oder Hausnummer scheiden aus.
  const teile = adresse ? roh.split(/[,;]/).map(t => t.trim()).filter(t => t && !/\d/.test(t) && !strasse.test(t)) : [roh];
  for (const teil of teile.reverse()) {
    const treffer = finde(teil);
    if (treffer) return { ort: treffer, bekannt: true, verworfen: false };
  }
  if (adresse) return { ort: null, bekannt: false, verworfen: true };
  return { ort: roh.replace(/[^\p{L} ./-]/gu, '').trim() || null, bekannt: false, verworfen: false };
}

function ausListe(wert, liste) {
  const w = kurz(wert, 60);
  if (!w) return null;
  return liste.find(e => e.toLowerCase() === w.toLowerCase()) ?? w;
}

/**
 * Prueft die Angaben des Monteurs. Alles ist freiwillig: die Einwilligung holt
 * der Betrieb mit jedem Auftrag ein (Inhaber 02.10.2026), sie wird nicht mehr abgefragt.
 */
export function pruefeAngaben(roh = {}) {
  const ort = bereinigeOrt(roh.ort);
  const vorherNachher = VORHER_NACHHER.includes(String(roh.vorherNachher ?? '')) ? String(roh.vorherNachher ?? '') : '';
  return {
    einwilligung: true,
    ort: ort.ort,
    ortBekannt: ort.bekannt,
    ortVerworfen: ort.verworfen,
    raum: ausListe(roh.raum, RAEUME),
    bodenart: ausListe(roh.bodenart, BODENARTEN),
    taetigkeit: [].concat(roh.taetigkeit ?? []).map(t => ausListe(t, TAETIGKEITEN)).filter(Boolean).slice(0, 6),
    produkt: kurz(roh.produkt, 100) || null,
    auftrag: kurz(roh.auftrag, 40) || null,
    vorherNachher,
    besonderheit: kurz(roh.besonderheit, 300) || null,
  };
}

export function titelFuer(a, jetzt = new Date()) {
  const teile = [a.ort, a.raum, a.bodenart, a.vorherNachher === 'beides' ? 'vorher/nachher' : null].filter(Boolean);
  return `${teile.length ? teile.join(' – ') : 'Baustelle'} (${jetzt.toLocaleDateString('de-DE')})`;
}

/** Erkennt den Dateityp am Inhalt, nicht am Namen - der Name kommt vom Handy und ist frei waehlbar. */
export function erkenneTyp(kopf) {
  if (kopf.length >= 3 && kopf[0] === 0xff && kopf[1] === 0xd8 && kopf[2] === 0xff) return 'image/jpeg';
  if (kopf.length >= 8 && kopf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (kopf.length >= 12 && kopf.toString('latin1', 0, 4) === 'RIFF' && kopf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (kopf.length >= 12 && kopf.toString('latin1', 4, 8) === 'ftyp') {
    const marke = kopf.toString('latin1', 8, 12);
    if (/^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)$/.test(marke)) return 'image/heic';
    if (marke === 'qt  ') return 'video/quicktime';
    // Nicht jede ftyp-Datei ist ein Video: AVIF-Bilder und reine Tonspuren bleiben draussen.
    if (/^(avif|avis|M4A |M4B |f4a )$/.test(marke)) return null;
    return 'video/mp4';
  }
  return null;
}

// --- Zugaenge der Monteure ----------------------------------------------------
// Jeder Monteur bekommt einen eigenen Link. Der Link IST der Zugang - kein
// Konto, kein Passwort. Gespeichert wird nur der Hash; geht ein Handy verloren,
// wird genau dieser eine Link gesperrt.

function hash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

export function liesZugaenge(datei = zugaengePfad()) {
  try { return JSON.parse(fs.readFileSync(datei, 'utf8')).zugaenge ?? []; } catch { return []; }
}

function schreibZugaenge(liste, datei) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, JSON.stringify({ zugaenge: liste }, null, 2), { mode: 0o600 });
}

export function zugangAnlegen(name, { datei = zugaengePfad(), jetzt = new Date() } = {}) {
  const sauber = kurz(name, 40);
  if (!sauber) throw new EingangFehler('Name fehlt');
  const token = crypto.randomBytes(18).toString('base64url');
  const liste = liesZugaenge(datei);
  liste.push({ name: sauber, tokenHash: hash(token), aktiv: true, angelegt: jetzt.toISOString() });
  schreibZugaenge(liste, datei);
  return { name: sauber, token };
}

export function zugangSperren(name, { datei = zugaengePfad() } = {}) {
  const liste = liesZugaenge(datei);
  let n = 0;
  for (const z of liste) if (z.name.toLowerCase() === String(name).toLowerCase() && z.aktiv) { z.aktiv = false; n += 1; }
  schreibZugaenge(liste, datei);
  return n;
}

export function findeZugang(token, liste = liesZugaenge()) {
  if (typeof token !== 'string' || token.length < 16) return null;
  const h = Buffer.from(hash(token), 'hex');
  for (const z of liste) {
    if (!z.aktiv) continue;
    const vergleich = Buffer.from(z.tokenHash, 'hex');
    if (vergleich.length === h.length && crypto.timingSafeEqual(vergleich, h)) return z;
  }
  return null;
}

// --- Ablage -------------------------------------------------------------------

/** Legt den Inhalt an und liefert den Ordner, in den die Dateien gehoeren. */
export function legeBaustelleAn(db, angaben, { von = null, jetzt = new Date(), dir = socialDir() } = {}) {
  const { id } = db.inhaltAnlegen({
    quelle: 'baustelle',
    typ: angaben.vorherNachher === 'beides' ? 'vorher_nachher' : 'kundenprojekt',
    titel: titelFuer(angaben, jetzt),
    ort: angaben.ort, raum: angaben.raum, bodenart: angaben.bodenart,
    taetigkeit: angaben.taetigkeit.join(', ') || null,
    besonderheit: angaben.besonderheit,
    produkt_titel: angaben.produkt,
    einwilligung: true,
    eingereicht_von: von,
    daten: { auftrag: angaben.auftrag, vorherNachher: angaben.vorherNachher, ortBekannt: angaben.ortBekannt, ortVerworfen: angaben.ortVerworfen },
  });
  const ordner = path.join(medienDir(dir), String(id), 'original');
  fs.mkdirSync(ordner, { recursive: true });
  db.ereignis(von, 'baustelle-eingang', `inhalt:${id}`, { ort: angaben.ort, bodenart: angaben.bodenart });
  return { id, ordner };
}

/** Traegt eine fertig hochgeladene Datei als Medium ein. */
export function trageDateiEin(db, inhaltId, { datei, typ, rolle = null, dir = socialDir() }) {
  const info = DATEITYPEN[typ];
  if (!info) throw new EingangFehler('Dateityp nicht erlaubt');
  const bytes = fs.statSync(datei).size;
  const reihenfolge = db.medien(inhaltId).length;
  return db.mediumAnlegen(inhaltId, {
    art: info.art, rolle, pfad: path.relative(dir, datei), bytes, reihenfolge,
    pruefung: 'offen',
  });
}
