/**
 * Mitarbeiterzugaenge fuer das Control Center.
 *
 * Ablage ausschliesslich lokal ausserhalb des Repos unter
 * $TP_PRIVAT_DIR/benutzer.json (Standard ~/teppich-paradies-analyse, gleiche
 * Konvention wie dashboard-passwort.txt und auftragsstatus.json). Passwoerter
 * werden nie im Klartext gespeichert - Hash per scrypt (Node-Bordmittel,
 * kein externes Paket).
 *
 * Solange keine benutzer.json existiert, bleibt das bisherige Einzelpasswort
 * (dashboard-auth.mjs) der einzige Zugang - kein Bruch im laufenden Betrieb.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const ROLLEN = Object.freeze(['inhaber', 'mitarbeiter', 'lesen']);

const SCRYPT_KEYLEN = 64;

export function privatDir() {
  return process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
}

export function benutzerDateiPfad() {
  return path.join(privatDir(), 'benutzer.json');
}

export class BenutzerFehler extends Error {}

/** Liest die Benutzerliste. Fehlende Datei -> leere Liste (kein Fehler, das ist der Notzugang-Fall). */
export function leseBenutzer(file = benutzerDateiPfad()) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || !Array.isArray(raw.benutzer)) return [];
    return raw.benutzer;
  } catch {
    return [];
  }
}

export function benutzerDateiExistiert(file = benutzerDateiPfad()) {
  return fs.existsSync(file);
}

/** Schreibt atomar (tmp + rename) und setzt chmod 600 - Datei enthaelt Passwort-Hashes. */
export function schreibeBenutzer(liste, file = benutzerDateiPfad()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, benutzer: liste }, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch { /* best effort, z.B. auf FAT/exFAT */ }
}

export function hashPasswort(klartext) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(klartext), salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

export function pruefePasswort(klartext, hash) {
  if (typeof hash !== 'string') return false;
  const teile = hash.split(':');
  if (teile.length !== 3 || teile[0] !== 'scrypt') return false;
  const [, saltHex, derivedHex] = teile;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const erwartet = Buffer.from(derivedHex, 'hex');
    const kandidat = crypto.scryptSync(String(klartext ?? ''), salt, erwartet.length);
    if (kandidat.length !== erwartet.length) return false;
    return crypto.timingSafeEqual(kandidat, erwartet);
  } catch {
    return false;
  }
}

function normKuerzel(k) {
  return String(k ?? '').trim().toLowerCase();
}

export function findeAktivenBenutzer(liste, kuerzelOderName) {
  const gesucht = normKuerzel(kuerzelOderName);
  if (!gesucht) return null;
  return (
    liste.find(b => b.aktiv !== false && normKuerzel(b.kuerzel) === gesucht) ||
    liste.find(b => b.aktiv !== false && String(b.name ?? '').trim().toLowerCase() === gesucht) ||
    null
  );
}

/** Prueft Name/Kuerzel + Passwort gegen die Benutzerliste. Gibt den Benutzer (ohne Hash) oder null zurueck. */
export function authentifiziere(liste, kuerzelOderName, passwort) {
  const eintrag = findeAktivenBenutzer(liste, kuerzelOderName);
  if (!eintrag) return null;
  if (!pruefePasswort(passwort, eintrag.passwortHash)) return null;
  return { name: eintrag.name, kuerzel: eintrag.kuerzel, rolle: eintrag.rolle };
}

export function validiereRolle(rolle) {
  if (!ROLLEN.includes(rolle)) {
    throw new BenutzerFehler(`Unbekannte Rolle "${rolle}" - erlaubt: ${ROLLEN.join(', ')}`);
  }
}

/** Legt einen neuen Benutzer an oder wirft, wenn Kuerzel schon vergeben ist. */
export function benutzerAnlegen(liste, { name, kuerzel, passwort, rolle }) {
  if (!name || !String(name).trim()) throw new BenutzerFehler('Name ist Pflicht');
  if (!kuerzel || !String(kuerzel).trim()) throw new BenutzerFehler('Kuerzel ist Pflicht');
  if (!passwort || String(passwort).length < 8) throw new BenutzerFehler('Passwort muss mindestens 8 Zeichen haben');
  validiereRolle(rolle);
  const k = normKuerzel(kuerzel);
  if (liste.some(b => normKuerzel(b.kuerzel) === k)) throw new BenutzerFehler(`Kuerzel "${kuerzel}" ist bereits vergeben`);
  const neu = {
    name: String(name).trim(),
    kuerzel: String(kuerzel).trim(),
    passwortHash: hashPasswort(passwort),
    rolle,
    aktiv: true,
  };
  return [...liste, neu];
}

export function passwortSetzen(liste, kuerzel, passwort) {
  if (!passwort || String(passwort).length < 8) throw new BenutzerFehler('Passwort muss mindestens 8 Zeichen haben');
  const k = normKuerzel(kuerzel);
  const idx = liste.findIndex(b => normKuerzel(b.kuerzel) === k);
  if (idx < 0) throw new BenutzerFehler(`Benutzer "${kuerzel}" nicht gefunden`);
  const kopie = liste.slice();
  kopie[idx] = { ...kopie[idx], passwortHash: hashPasswort(passwort) };
  return kopie;
}

export function benutzerDeaktivieren(liste, kuerzel, aktiv = false) {
  const k = normKuerzel(kuerzel);
  const idx = liste.findIndex(b => normKuerzel(b.kuerzel) === k);
  if (idx < 0) throw new BenutzerFehler(`Benutzer "${kuerzel}" nicht gefunden`);
  const kopie = liste.slice();
  kopie[idx] = { ...kopie[idx], aktiv };
  return kopie;
}
