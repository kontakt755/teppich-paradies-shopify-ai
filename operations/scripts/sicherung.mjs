#!/usr/bin/env node
/**
 * Taegliche Sicherung der lokalen Betriebsdaten unter $TP_PRIVAT_DIR.
 *
 *   npm run daten:sichern
 *   npm run daten:sichern -- --ziel /pfad/zu/sicherungen
 *   npm run daten:sichern -- --aufbewahren 14
 *
 * Der Auftragsstatus (operations/lib/auftragsstatus.mjs, "wer hat was
 * bestellt") existiert NUR lokal unter $TP_PRIVAT_DIR/auftragsstatus.json -
 * ohne Sicherung ist er bei einem Festplattenschaden unwiederbringlich weg.
 * Dieses Skript sichert ihn zusammen mit den uebrigen Betriebsdaten
 * (Lexikon, Bestelluebersicht, Kennzahlen, Einkauf-Exporte) taeglich in ein
 * Archiv unter $TP_PRIVAT_DIR/sicherungen/<datum>.tar.gz und loescht
 * Sicherungen, die aelter als die Aufbewahrungsfrist (Standard 30 Tage) sind.
 *
 * Gesichert werden ausschliesslich Dateien/Ordner, die tatsaechlich
 * existieren - eine fehlende Quelle ist kein Fehler, nur eine ausgelassene
 * Position (gleiche Haltung wie operations/scripts/aktualisieren.mjs).
 * Das Sicherungsverzeichnis selbst wird nie mitgesichert (keine Sicherung
 * der Sicherung).
 *
 * Taeglich automatisch: siehe operations/README.md, Abschnitt "Sicherung",
 * bzw. den launchd-Dienst, den operations/scripts/dienste-einrichten.sh
 * einrichtet.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const STANDARD_PRIVAT_DIR = path.join(os.homedir(), 'teppich-paradies-analyse');
export const STANDARD_AUFBEWAHRUNG_TAGE = 30;

/** Relative Pfade unter $TP_PRIVAT_DIR, die die Sicherung umfasst. */
export const SICHERUNGSPFADE = Object.freeze([
  'auftragsstatus.json',
  'lexikon',
  'bestelluebersicht',
  'kennzahlen',
  'einkauf-dryrun',
  'einkauf-klaerung',
  'einkauf-hersteller',
  'einkauf-kollektion',
  'aktualisierung.json',
]);

function parseArgs(argv) {
  const out = { privatDir: process.env.TP_PRIVAT_DIR || STANDARD_PRIVAT_DIR, ziel: null, aufbewahrenTage: STANDARD_AUFBEWAHRUNG_TAGE, jetzt: new Date() };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--privat-dir') out.privatDir = argv[++i];
    else if (a === '--ziel') out.ziel = argv[++i];
    else if (a === '--aufbewahren') out.aufbewahrenTage = Number(argv[++i]);
  }
  return out;
}

function datumSlug(datum) {
  return datum.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Welche der SICHERUNGSPFADE existieren tatsaechlich unter privatDir (Dateien und Ordner). */
export function vorhandeneQuellen(privatDir, pfade = SICHERUNGSPFADE) {
  return pfade.filter((rel) => fs.existsSync(path.join(privatDir, rel)));
}

/**
 * Erzeugt das Archiv <ziel>/<datum>.tar.gz mit allen vorhandenen Quellen.
 * Gibt { archiv, quellen, uebersprungen, bytes } zurueck. Wirft, wenn keine
 * einzige Quelle existiert (nichts zu sichern waere ein stiller Datenverlust,
 * kein normaler Zustand).
 */
export function sichern({ privatDir = STANDARD_PRIVAT_DIR, ziel = null, jetzt = new Date(), tar = execFileSync } = {}) {
  const zielDir = ziel || path.join(privatDir, 'sicherungen');
  fs.mkdirSync(zielDir, { recursive: true });

  const quellen = vorhandeneQuellen(privatDir);
  const uebersprungen = SICHERUNGSPFADE.filter((p) => !quellen.includes(p));
  if (quellen.length === 0) {
    throw new Error(`Keine Betriebsdaten unter ${privatDir} gefunden - nichts zu sichern (geprueft: ${SICHERUNGSPFADE.join(', ')}).`);
  }

  const archiv = path.join(zielDir, `${datumSlug(jetzt)}.tar.gz`);
  const tmp = `${archiv}.${process.pid}.tmp`;
  // -C privatDir: Pfade im Archiv sind relativ (auftragsstatus.json, lexikon/...),
  // nicht der volle absolute Pfad des Rechners.
  tar('tar', ['-czf', tmp, '-C', privatDir, ...quellen]);
  fs.renameSync(tmp, archiv);

  const bytes = fs.statSync(archiv).size;
  return { archiv, quellen, uebersprungen, bytes };
}

/** Loescht Sicherungsdateien <datum>.tar.gz, deren Datum aelter als aufbewahrenTage ist. */
export function alteSicherungenAufraeumen({ ziel, aufbewahrenTage = STANDARD_AUFBEWAHRUNG_TAGE, jetzt = new Date() }) {
  if (!fs.existsSync(ziel)) return { geloescht: [] };
  const grenze = new Date(jetzt.getTime() - aufbewahrenTage * 24 * 60 * 60 * 1000);
  const geloescht = [];
  for (const name of fs.readdirSync(ziel)) {
    const match = /^(\d{4}-\d{2}-\d{2})\.tar\.gz$/.exec(name);
    if (!match) continue; // fremde Dateien im Ordner unangetastet lassen
    const datum = new Date(`${match[1]}T00:00:00.000Z`);
    if (Number.isNaN(datum.getTime())) continue;
    if (datum < grenze) {
      fs.unlinkSync(path.join(ziel, name));
      geloescht.push(name);
    }
  }
  return { geloescht };
}

async function main() {
  const { privatDir, ziel, aufbewahrenTage, jetzt } = parseArgs(process.argv.slice(2));
  const zielDir = ziel || path.join(privatDir, 'sicherungen');

  console.log(`Sichere Betriebsdaten aus ${privatDir} nach ${zielDir} ...`);
  let ergebnis;
  try {
    ergebnis = sichern({ privatDir, ziel: zielDir, jetzt });
  } catch (err) {
    console.error(`Sicherung fehlgeschlagen: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const mb = (ergebnis.bytes / (1024 * 1024)).toFixed(2);
  console.log(`Archiv geschrieben: ${ergebnis.archiv} (${mb} MB)`);
  console.log(`Enthalten: ${ergebnis.quellen.join(', ')}`);
  if (ergebnis.uebersprungen.length > 0) {
    console.log(`Uebersprungen (nicht vorhanden): ${ergebnis.uebersprungen.join(', ')}`);
  }

  const { geloescht } = alteSicherungenAufraeumen({ ziel: zielDir, aufbewahrenTage, jetzt });
  if (geloescht.length > 0) {
    console.log(`Alte Sicherungen geloescht (> ${aufbewahrenTage} Tage): ${geloescht.join(', ')}`);
  } else {
    console.log(`Keine Sicherungen aelter als ${aufbewahrenTage} Tage.`);
  }
}

const istDirekterAufruf = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istDirekterAufruf) {
  main();
}
