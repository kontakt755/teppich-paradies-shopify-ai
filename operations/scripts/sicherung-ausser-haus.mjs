#!/usr/bin/env node
/**
 * Verschluesselte Kopie des neuesten Tagesarchivs ausser Haus (Dropbox-Ordner).
 *
 *   node operations/scripts/sicherung-ausser-haus.mjs                     # nachts per Dienst
 *   node operations/scripts/sicherung-ausser-haus.mjs --schluessel-anlegen # einmalig
 *   node operations/scripts/sicherung-ausser-haus.mjs --probe <ziel-datei> # Kopie nach <ziel-datei> entschluesseln
 *
 * Die Tagesarchive enthalten Kundendaten und Zugaenge, deshalb verlaesst nur die mit gpg
 * (AES-256, symmetrisch) verschluesselte Datei den Mac. Der Schluessel liegt im
 * Anmelde-Schluesselbund und wird nie ausgegeben, nie in eine Datei und nie als
 * Befehlsargument geschrieben. Dieser Schluesselbund liegt nur auf diesem Mac: ohne eine
 * zweite Ablage des Schluessels nuetzt die Kopie nach einem Totalausfall nichts
 * (operations/README.md, "Wiederherstellen aus der Dropbox").
 *
 * Jeder Lauf entschluesselt die fertige Kopie noch einmal aus dem Zielordner und vergleicht
 * die Pruefsumme mit dem Tagesarchiv; erst danach gilt er als Erfolg. Der Stand steht in
 * $TP_PRIVAT_DIR/sicherung-ausser-haus.json. Das Skript nutzt nur Node-Bordmittel, damit es
 * auch ausserhalb des Repositorys laeuft.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SCHLUESSEL_DIENST = 'net.teppich-paradies.sicherung-ausser-haus';
export const SCHLUESSEL_KONTO = 'sicherung';
export const STAND_DATEI = 'sicherung-ausser-haus.json';
export const STANDARD_ZIEL = path.join(os.homedir(), 'Dropbox', 'Teppich Paradies Sicherung');
export const STANDARD_AUFBEWAHRUNG_TAGE = 14;
const ARCHIV_MUSTER = /^(\d{4}-\d{2}-\d{2})\.tar\.gz$/;
const KOPIE_MUSTER = /^(\d{4}-\d{2}-\d{2})\.tar\.gz\.gpg$/;
const GPG_KANDIDATEN = ['/opt/homebrew/bin/gpg', '/usr/local/bin/gpg', '/usr/bin/gpg'];

export function gpgPfad(kandidaten = GPG_KANDIDATEN) {
  const pfad = kandidaten.find((p) => fs.existsSync(p));
  if (!pfad) throw new Error(`gpg nicht gefunden (geprueft: ${kandidaten.join(', ')})`);
  return pfad;
}

/** Liest den Schluessel aus dem Schluesselbund; der Wert bleibt in dieser Funktion und beim Aufrufer. */
export function schluesselLesen() {
  const r = spawnSync('/usr/bin/security', ['find-generic-password', '-s', SCHLUESSEL_DIENST, '-a', SCHLUESSEL_KONTO, '-w'], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout.trim()) throw new Error(`Schluessel ${SCHLUESSEL_DIENST} nicht im Schluesselbund lesbar (Exit ${r.status})`);
  return r.stdout.trim();
}

/** Legt den Schluessel einmalig an und gibt ihn nicht aus. Ein vorhandener wird nie ersetzt: alte Kopien waeren sonst verloren. */
export function schluesselAnlegen() {
  const vorhanden = spawnSync('/usr/bin/security', ['find-generic-password', '-s', SCHLUESSEL_DIENST, '-a', SCHLUESSEL_KONTO], { encoding: 'utf8' });
  if (vorhanden.status === 0) return { angelegt: false };
  const wert = randomBytes(32).toString('hex');
  // Ueber stdin von `security -i`, damit der Wert nicht in der Prozessliste steht.
  const zeile = `add-generic-password -a ${SCHLUESSEL_KONTO} -s ${SCHLUESSEL_DIENST} -l "Teppich Paradies Sicherung ausser Haus" -T /usr/bin/security -w ${wert}\n`;
  const r = spawnSync('/usr/bin/security', ['-i'], { input: zeile, encoding: 'utf8' });
  if (r.status !== 0 || schluesselLesen() !== wert) throw new Error(`Schluessel konnte nicht angelegt werden (Exit ${r.status})`);
  return { angelegt: true };
}

function gpgGrundargumente() {
  return ['--batch', '--yes', '--quiet', '--no-symkey-cache', '--pinentry-mode', 'loopback', '--passphrase-fd', '0'];
}

export function verschluesseln(quelle, ziel, schluessel, gpg = gpgPfad()) {
  execFileSync(gpg, [...gpgGrundargumente(), '--symmetric', '--cipher-algo', 'AES256', '--s2k-digest-algo', 'SHA512', '--compress-algo', 'none', '--output', ziel, quelle], { input: `${schluessel}\n`, stdio: ['pipe', 'ignore', 'pipe'] });
}

export function entschluesseln(quelle, ziel, schluessel, gpg = gpgPfad()) {
  execFileSync(gpg, [...gpgGrundargumente(), '--decrypt', '--output', ziel, quelle], { input: `${schluessel}\n`, stdio: ['pipe', 'ignore', 'pipe'] });
}

export function pruefsumme(datei) {
  const hash = createHash('sha256');
  const fd = fs.openSync(datei, 'r');
  try {
    const puffer = Buffer.alloc(1024 * 1024);
    for (let n = fs.readSync(fd, puffer); n > 0; n = fs.readSync(fd, puffer)) hash.update(puffer.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/** Neuestes Tagesarchiv <datum>.tar.gz; andere Dateien im Ordner zaehlen nicht. */
export function neuestesArchiv(quellDir) {
  const namen = fs.readdirSync(quellDir).filter((n) => ARCHIV_MUSTER.test(n)).sort();
  if (!namen.length) throw new Error(`Kein Tagesarchiv in ${quellDir}`);
  return path.join(quellDir, namen.at(-1));
}

function standLesen(privatDir) {
  try { return JSON.parse(fs.readFileSync(path.join(privatDir, STAND_DATEI), 'utf8')); } catch { return {}; }
}

function standSchreiben(privatDir, inhalt) {
  const datei = path.join(privatDir, STAND_DATEI);
  const tmp = `${datei}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(inhalt), { mode: 0o600 });
  fs.renameSync(tmp, datei);
}

/**
 * Loescht nur eigene Kopien <datum>.tar.gz.gpg jenseits der Frist; fremde Dateien bleiben.
 * `behalten` bleibt immer liegen: Steht die Hauptsicherung laenger als die Frist, ist die eben
 * abgelegte Kopie selbst aelter als die Frist.
 */
export function alteKopienAufraeumen(zielDir, aufbewahrenTage, jetzt, behalten = null) {
  const grenze = jetzt.getTime() - aufbewahrenTage * 86400000;
  const geloescht = [];
  for (const name of fs.readdirSync(zielDir)) {
    const m = KOPIE_MUSTER.exec(name);
    if (m && name !== behalten && Date.parse(`${m[1]}T00:00:00.000Z`) < grenze) {
      fs.unlinkSync(path.join(zielDir, name));
      geloescht.push(name);
    }
  }
  return geloescht;
}

/**
 * Verschluesselt das neueste Tagesarchiv, legt es im Zielordner ab und prueft die abgelegte
 * Datei durch Entschluesseln. Zwischendateien entstehen unter `privatDir`, damit die Dropbox nur
 * fertige, verschluesselte Dateien sieht. Unveraendertes Archiv: nichts zu tun, nur ein alter
 * Fehlervermerk faellt weg, denn die Kopie liegt ja vor.
 */
export function kopieren({ privatDir, zielDir, schluessel, aufbewahrenTage = STANDARD_AUFBEWAHRUNG_TAGE, jetzt = new Date(), gpg = gpgPfad() }) {
  if (!fs.statSync(zielDir, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`Zielordner ${zielDir} nicht erreichbar`);
  const archiv = neuestesArchiv(path.join(privatDir, 'sicherungen'));
  const name = `${path.basename(archiv)}.gpg`;
  const ziel = path.join(zielDir, name);
  const summe = pruefsumme(archiv);
  const alt = standLesen(privatDir);
  if (alt.datei === name && alt.sha256 === summe && fs.existsSync(ziel)) {
    if (alt.letzterFehler) {
      const { letzterFehler: _erledigt, ...ohneFehler } = alt;
      standSchreiben(privatDir, ohneFehler);
    }
    return { datei: name, uebersprungen: true, geloescht: [] };
  }

  const arbeit = fs.mkdtempSync(path.join(privatDir, '.ausser-haus-'));
  fs.chmodSync(arbeit, 0o700);
  try {
    const verschluesselt = path.join(arbeit, name);
    verschluesseln(archiv, verschluesselt, schluessel, gpg);
    const zielTmp = `${ziel}.${process.pid}.tmp`;
    try {
      fs.copyFileSync(verschluesselt, zielTmp);
      fs.chmodSync(zielTmp, 0o600);
      fs.renameSync(zielTmp, ziel);
    } finally {
      fs.rmSync(zielTmp, { force: true });
    }
    const probe = path.join(arbeit, 'probe.tar.gz');
    entschluesseln(ziel, probe, schluessel, gpg);
    if (pruefsumme(probe) !== summe) throw new Error(`Pruefsumme von ${name} weicht nach dem Entschluesseln ab`);
    const bytes = fs.statSync(ziel).size;
    const geloescht = alteKopienAufraeumen(zielDir, aufbewahrenTage, jetzt, name);
    standSchreiben(privatDir, { letzterErfolg: jetzt.toISOString(), datei: name, bytes, sha256: summe, ziel: zielDir });
    return { datei: name, bytes, uebersprungen: false, geloescht };
  } finally {
    fs.rmSync(arbeit, { recursive: true, force: true });
  }
}

/** Haelt einen Fehlschlag fest, ohne den letzten Erfolg zu aendern. */
export function fehlerVermerken(privatDir, jetzt, meldung) {
  standSchreiben(privatDir, { ...standLesen(privatDir), letzterFehler: { am: jetzt.toISOString(), meldung: String(meldung).slice(0, 300) } });
}

function main() {
  const argv = process.argv.slice(2);
  const privatDir = process.env.TP_PRIVAT_DIR || path.join(os.homedir(), 'teppich-paradies-analyse');
  const zielDir = process.env.TP_SICHERUNG_AUSSERHAUS || STANDARD_ZIEL;
  const zeit = () => new Date().toISOString();
  const jetzt = new Date();
  try {
    if (argv[0] === '--schluessel-anlegen') {
      const { angelegt } = schluesselAnlegen();
      console.log(angelegt ? 'Schluessel im Schluesselbund angelegt.' : 'Schluessel war schon da, nichts geaendert.');
      return;
    }
    if (argv[0] === '--probe') {
      const [quelle, ziel] = [argv[1], argv[2]];
      if (!quelle || !ziel) throw new Error('Aufruf: --probe <kopie.tar.gz.gpg> <ziel.tar.gz>');
      entschluesseln(quelle, ziel, schluesselLesen());
      console.log(`Entschluesselt: ${ziel}`);
      return;
    }
    if (argv.length) throw new Error(`Unbekanntes Argument: ${argv[0]}`);
    const e = kopieren({ privatDir, zielDir, schluessel: schluesselLesen(), jetzt });
    if (e.uebersprungen) console.log(`${zeit()} ${e.datei} ist schon abgelegt und unveraendert.`);
    else console.log(`${zeit()} ${e.datei} abgelegt und geprueft (${(e.bytes / 1048576).toFixed(2)} MB).`);
    if (e.geloescht.length) console.log(`Alte Kopien geloescht: ${e.geloescht.join(', ')}`);
  } catch (err) {
    // gpg kann seine Meldung in err.message tragen, nie den Schluessel (der geht nur ueber stdin).
    console.error(`${zeit()} Sicherung ausser Haus fehlgeschlagen: ${err.message}`);
    if (!argv.length) fehlerVermerken(privatDir, jetzt, err.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
