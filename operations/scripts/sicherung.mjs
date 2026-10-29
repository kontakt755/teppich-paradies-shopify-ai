#!/usr/bin/env node
/**
 * Taegliche Sicherung der lokalen Betriebsdaten unter $TP_PRIVAT_DIR.
 *
 *   npm run daten:sichern
 *   npm run daten:sichern -- --ziel /pfad/zu/sicherungen
 *   npm run daten:sichern -- --aufbewahren 14
 *   npm run daten:sichern -- --kopie /Volumes/<Platte>/teppich-paradies-sicherungen
 *
 * --kopie (oder TP_SICHERUNG_KOPIE) legt jedes fertige Tagesarchiv zusaetzlich in einen
 * zweiten Ordner, z. B. auf einer externen, verschluesselten Platte. Der Ordner muss schon
 * existieren: ist die Platte nicht angesteckt, entsteht sonst unter /Volumes ein
 * gleichnamiger Ordner auf der internen Platte - eine Kopie, die keine ist. Scheitert die
 * Kopie, bleibt das Tagesarchiv gueltig; der Lauf endet mit Exit 1 und vermerkt den Fehler
 * in sicherungsstand.json (`kopie`). Das Skript verschluesselt nicht selbst.
 * Wiederherstellen: operations/README.md, Abschnitt "Wiederherstellen nach einem Ausfall".
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
  'kettelversand.json',
  'auftragsverlauf.json',
  'musterherkunft.json',
  // Gemeinsame Packhaken und manuell abgehakte Bestellungen gibt es nur lokal.
  'muster-packen.json', 'muster-grossbrief.json',
  'bestellmarken.json',
  // Musterlager: welche Muster wir selbst da haben (operations/lib/musterlager.mjs).
  'musterlager.json',
  // Gemeinsam vorgemerkte Musteretiketten samt Druckauftraegen.
  'muster-druckliste.json',
  // Mustersperre: im Shop gesperrte Muster samt Stand vor der Sperre (operations/lib/mustersperre.mjs).
  'mustersperre.json',
  // Private App-/Projektadressen des Arbeitsplatzes.
  'prozesslinks.json',
  'lexikon',
  'bestelluebersicht',
  'kennzahlen',
  'einkauf-dryrun',
  'einkauf-klaerung',
  'einkauf-hersteller',
  'einkauf-kollektion',
  'aktualisierung.json',
  // Service-Anfragen (Kunden > Service-Anfragen): gibt es nur hier.
  'serviceanfragen.json',
  // ... und welche Formular-Mails der Postfach-Abgleich schon geprueft hat.
  'serviceanfragen-postfach.json',
  // Lieferantenbelege aus dem Postfach (AB, Lieferschein, Storno) samt Zuordnung und Haken.
  'lieferbelege',
  // "Fehler melden": Meldungen der Mitarbeiter und ihr Stand in der Werkbank.
  'fehlermeldungen.json',
  'fehlermeldungen-abgleich.json',
  'fehlermeldungen',
  // Social-Media-Modul: taeglicher, in sich stimmiger Abzug der Datenbank
  // (social/lib/ablauf.mjs, sichereDatenbank) und die Upload-Zugaenge. Die
  // Fotos selbst (social/medien) sind zu gross fuer das Tagesarchiv.
  'social/sicherung.db',
  'social/upload-zugaenge.json',
  // ... wie weit die WhatsApp-Gruppe schon eingelesen ist (sonst kommt alles doppelt) und
  // Schrift und Logo fuer die Reels (social/lib/produkt-reel.mjs, zusammen unter 1 MB).
  'social/whatsapp-stand.json',
  'social/werkzeug',
  // Highlights: die Bereichszahlen traegt die Redaktion von Hand ein, dazu die schon einsortierten
  // Storys (social/lib/highlights.mjs) - beides steht nicht in der Datenbank.
  'social/highlights.json',
  // Muster-Nachfassen (operations/lib/nachfass-versand.mjs): wer schon angeschrieben wurde und
  // wer nie wieder angeschrieben werden darf - ohne beides gingen nach einer Wiederherstellung
  // doppelte oder unerwuenschte Kundenmails raus. Dazu die Textvorlage. postfach.json
  // (Zugangsdaten) bleibt draussen, siehe NICHT_GESICHERT.
  'nachfassen/versand.json',
  'nachfassen/stoppliste.json',
  'muster-nachfassen-texte.md',
  // Musterautomatik: Freigabe, Versandprotokoll der Bestellmails an Lieferanten, Laufstand.
  'muster-bestellung',
  // Aenderungsprotokoll des Control Centers: wer hat wann was getan.
  'protokoll.jsonl',
  // Auslauf-Pruefung: letzter Stand samt der beim Lieferanten neu gesehenen Artikel.
  'auslauf/status.json',
  // Betriebsaufgaben (Aufgaben & Organisation), Rueckrufe und Fallmarken gibt es nur hier.
  'organisation',
  'rueckrufe.json',
  'fallmarken.json',
  // Lieferanten-Stammdaten (Bestellweg, Ansprechperson, Kundennummer), die Basisadresse von
  // Lieferant A und die privaten Versandtarife - von Hand gepflegt, nirgends sonst.
  'lieferanten/stammdaten.json',
  'lieferantendaten/lieferant-a.env',
  'versandkosten/tarife.json',
  'versandkosten/portale.json',
  // Bildrechte: die von Hand gepflegten Spalten (Quelle, Lizenz, Freigabe) gibt es nur hier.
  'bildrechte/bildrechte.csv',
  // Neue Auftraege (Genossenschaften): Stand je Firma, Richtpreise, Referenzen.
  'akquise',
  // Hausverwaltungen (w-154): Ansprechpartner, Objekte, Angebote - von Hand gepflegt, nur hier.
  'hausverwaltungen',
  // Stoerungsverlauf der Shop-Wache (Beginn, Ende, Seiten).
  'shopwache/verlauf.jsonl',
  // Abzug der Mac-Dienste (~/Library/LaunchAgents/net.teppich-paradies.*.plist), den jeder Lauf
  // vor dem Archivieren auffrischt (dienstPlistsAbziehen). Vier davon gibt es ohne Vorlage im
  // Repository (Dashboard, Shop-Wache, Aufgabenwaechter, Lieferantenseiten).
  'dienste',
]);

/** Ordner unter $TP_PRIVAT_DIR fuer den Abzug der Mac-Dienste. */
export const DIENSTE_ORDNER = 'dienste';

/**
 * Lokale Ablagen unter $TP_PRIVAT_DIR, die bewusst NICHT ins Tagesarchiv gehoeren - mit Grund.
 * Jede Ablage, die der Code anlegt, steht entweder in SICHERUNGSPFADE oder hier;
 * operations/tests/sicherung.test.mjs sucht im Code nach neuen und schlaegt fehl, solange eine
 * in keiner der beiden Listen steht. Zugaenge werden nach einem Ausfall neu angelegt
 * (operations/README.md, "Wiederherstellen nach einem Ausfall").
 */
export const NICHT_GESICHERT = Object.freeze({
  'nachfassen/postfach.json': 'Zugang zum Firmenpostfach - neu anlegen',
  'benutzer.json': 'Zugaenge zum Control Center - neu anlegen (npm run benutzer)',
  'dashboard-passwort.txt': 'Notpasswort des Control Centers - neu anlegen',
  'dashboard-sitzungen.json': 'Anmeldungen - entstehen neu',
  'geraete-abgemeldet.json': 'Zeitpunkt von "Alle anderen Geraete abmelden" - nach einer Wiederherstellung meldet sich ohnehin jedes Geraet neu an',
  'social/zugang.env': 'Meta-Zugang und Upload-Adresse - neu anlegen (social/META-EINRICHTUNG.md)',
  'social/upload-links.json': 'Upload-Links im Klartext - nach Ausfall neue Links anlegen',
  'social/zentrale-sitzungen.json': 'Anmeldungen der Social-Zentrale - entstehen neu',
  'social/upload-tageszaehler.json': 'Uploadmenge des laufenden Tages',
  'social/social.db': 'laufende Datenbank; gesichert wird ihr stimmiger Abzug social/sicherung.db',
  'social/medien': 'Fotos und Videos - zu gross fuer das Tagesarchiv',
  'social/lernstand.json': 'wird aus der Datenbank neu berechnet',
  'social/highlights': 'Titelbilder der Highlights - entstehen neu (npm run social -- highlights)',
  'anreicherung': 'Plan- und Batchdateien der Anreicherung - jeder Lauf schreibt sie neu (npm run daten:anreichern)',
  'lieferant-i/bestand-status.json': 'Stand des letzten Bestandsabgleichs - der naechste Lauf schreibt ihn neu',
  'teppich-nach-mass-feed': 'erzeugter Zusatzfeed - entsteht neu (npm run feed:teppich-nach-mass)',
  'betrieb-nachziehen.lock': 'Sperre eines laufenden Nachziehens - darf nach einer Wiederherstellung nicht zurueckkommen',
  'angebote': 'Export aus Shopify (Sync-Dienst)',
  'bestand': 'Export aus Shopify (Sync-Dienst)',
  'erfuellung': 'Export aus Shopify (Sync-Dienst)',
  'kunden': 'Export aus Shopify (Sync-Dienst)',
  'warenkoerbe': 'Export aus Shopify (Sync-Dienst)',
  'verbrauch': 'Claude-Verbrauch - wird neu gerechnet',
  'shopwache/status.json': 'stuendlich neu (Shop-Wache)',
  'ausschreibungen/status.json': 'woechentlich neu; danach gelten alle Treffer einmal als neu',
  'routinen': 'Laufstand der Mac-Dienste; Auftragstexte liegen in den App-Aufgaben',
  'betrieb-nachziehen.json': 'Stand des Nachziehens - entsteht neu',
  'sicherungsstand.json': 'Beleg der Sicherung selbst',
  'sicherungen': 'die Sicherungen selbst',
});

export function parseArgs(argv, env = process.env) {
  const out = { privatDir: env.TP_PRIVAT_DIR || STANDARD_PRIVAT_DIR, ziel: null, kopie: env.TP_SICHERUNG_KOPIE || null, aufbewahrenTage: STANDARD_AUFBEWAHRUNG_TAGE, jetzt: new Date() };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--privat-dir') out.privatDir = argv[++i];
    else if (a === '--ziel') out.ziel = argv[++i];
    else if (a === '--kopie') out.kopie = argv[++i];
    else if (a === '--aufbewahren') out.aufbewahrenTage = Number(argv[++i]);
  }
  return out;
}

function datumSlug(datum) {
  return datum.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Kopiert die Plists der Mac-Dienste nach $TP_PRIVAT_DIR/dienste/, damit sie mit ins Archiv gehen.
 * Nur net.teppich-paradies.*.plist; eine Plist, die einen Schluessel mit TOKEN, SECRET, PASSW
 * oder API_KEY im Namen traegt, bleibt draussen (Zugaenge gehoeren nicht ins Archiv).
 * Der Abzug zeigt nur die Dienste von heute: Kopien geloeschter, umbenannter oder inzwischen
 * ausgelassener Dienste raeumt jeder Lauf weg - sonst kaemen sie mit jedem neuen Archiv mit
 * und wuerden nach dem README wieder eingerichtet. Andere Dateien im Ordner bleiben.
 * Fehlt der Ordner (anderer Rechner, Tests), passiert nichts.
 */
export function dienstPlistsAbziehen(launchAgentsDir, privatDir) {
  const kopiert = [];
  const ausgelassen = [];
  if (!launchAgentsDir || !fs.existsSync(launchAgentsDir)) return { kopiert, ausgelassen };
  const ziel = path.join(privatDir, DIENSTE_ORDNER);
  const istDienst = name => /^net\.teppich-paradies\.[a-z0-9-]+\.plist$/.test(name);
  for (const name of fs.readdirSync(launchAgentsDir).sort()) {
    if (!istDienst(name)) continue;
    const inhalt = fs.readFileSync(path.join(launchAgentsDir, name));
    if (/<key>[^<]*(TOKEN|SECRET|PASSW|API_KEY)[^<]*<\/key>/i.test(inhalt.toString('latin1'))) { ausgelassen.push(name); continue; }
    fs.mkdirSync(ziel, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(ziel, name), inhalt, { mode: 0o600 });
    kopiert.push(name);
  }
  if (fs.existsSync(ziel)) {
    for (const name of fs.readdirSync(ziel)) {
      if (istDienst(name) && !kopiert.includes(name)) fs.rmSync(path.join(ziel, name), { force: true });
    }
    // Leerer Abzug: kein leerer Ordner im Archiv.
    if (fs.readdirSync(ziel).length === 0) fs.rmdirSync(ziel);
  }
  return { kopiert, ausgelassen };
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
export function sichern({ privatDir = STANDARD_PRIVAT_DIR, ziel = null, jetzt = new Date(), tar = execFileSync, launchAgentsDir = null } = {}) {
  const zielDir = ziel || path.join(privatDir, 'sicherungen');
  fs.mkdirSync(zielDir, { recursive: true, mode: 0o700 });

  // Erst pruefen, ob unter privatDir ueberhaupt Betriebsdaten liegen - der Abzug der Dienste
  // allein darf einen falschen Ordner nicht zu einer "erfolgreichen" Sicherung machen.
  if (vorhandeneQuellen(privatDir).filter((p) => p !== DIENSTE_ORDNER).length === 0) {
    throw new Error(`Keine Betriebsdaten unter ${privatDir} gefunden - nichts zu sichern (geprueft: ${SICHERUNGSPFADE.join(', ')}).`);
  }
  const dienste = dienstPlistsAbziehen(launchAgentsDir, privatDir);
  const quellen = vorhandeneQuellen(privatDir);
  const uebersprungen = SICHERUNGSPFADE.filter((p) => !quellen.includes(p));

  const archiv = path.join(zielDir, `${datumSlug(jetzt)}.tar.gz`);
  const tmp = `${archiv}.${process.pid}.tmp`;
  // -C privatDir: Pfade im Archiv sind relativ (auftragsstatus.json, lexikon/...),
  // nicht der volle absolute Pfad des Rechners.
  try {
    // Bereits vor tar privat anlegen: das Archiv kann Zugangsdaten enthalten.
    fs.closeSync(fs.openSync(tmp, 'wx', 0o600));
    tar('tar', ['-czf', tmp, '-C', privatDir, ...quellen]);
    const inhalt = String(tar('tar', ['-tzf', tmp], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
    const eintraege = inhalt.split('\n');
    const fehlt = quellen.filter(rel => !eintraege.some(e => e === rel || e.startsWith(`${rel}/`)));
    if (fehlt.length) throw new Error(`Sicherungsarchiv unvollstaendig: ${fehlt.join(', ')}`);
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, archiv);
  } finally {
    fs.rmSync(tmp, { force: true });
  }

  const bytes = fs.statSync(archiv).size;
  // Erst nach fertigem Archiv: die Oberflaeche zeigt einen belegten Erfolg, keinen Versuch.
  const stand = path.join(privatDir, 'sicherungsstand.json');
  const standTmp = `${stand}.${process.pid}.tmp`;
  fs.writeFileSync(standTmp, JSON.stringify({ letzterErfolg: jetzt.toISOString(), bytes, quellenAnzahl: quellen.length }), { mode: 0o600 });
  fs.renameSync(standTmp, stand);
  return { archiv, quellen, uebersprungen, bytes, dienste };
}

/**
 * Legt ein fertiges Archiv zusaetzlich in `kopieDir` (zweites Ziel, z. B. externe Platte).
 * Der Ordner muss existieren - er wird nie angelegt (siehe Kopf: nicht angesteckte Platte).
 * Schreibt erst eine temporaere Datei, prueft die Groesse und benennt dann um.
 * Gibt { ziel, bytes } zurueck oder wirft mit einer klaren Meldung.
 */
export function kopieAblegen(archiv, kopieDir) {
  const dir = path.resolve(kopieDir);
  let st;
  try { st = fs.statSync(dir); } catch { st = null; }
  if (!st?.isDirectory()) throw new Error(`Kopie-Ziel ${dir} nicht erreichbar - Platte angesteckt und Ordner angelegt?`);
  const ziel = path.join(dir, path.basename(archiv));
  if (path.resolve(ziel) === path.resolve(archiv)) throw new Error('Kopie-Ziel ist derselbe Ordner wie die Sicherung');
  const tmp = `${ziel}.${process.pid}.tmp`;
  try {
    fs.copyFileSync(archiv, tmp);
    fs.chmodSync(tmp, 0o600);
    const soll = fs.statSync(archiv).size;
    const ist = fs.statSync(tmp).size;
    if (ist !== soll) throw new Error(`Kopie unvollstaendig (${ist} von ${soll} Bytes)`);
    fs.renameSync(tmp, ziel);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return { ziel, bytes: fs.statSync(ziel).size };
}

/** Haelt das Ergebnis der Kopie im Erfolgsbeleg fest, ohne den Beleg der Sicherung selbst zu aendern. */
export function kopieVermerken(privatDir, vermerk) {
  const stand = path.join(privatDir, 'sicherungsstand.json');
  let roh = {};
  try { roh = JSON.parse(fs.readFileSync(stand, 'utf8')); } catch { return; }
  const tmp = `${stand}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...roh, kopie: vermerk }), { mode: 0o600 });
  fs.renameSync(tmp, stand);
}

/**
 * Haelt einen gescheiterten Lauf in sicherungsstand.json fest (`letzterFehler`), ohne den
 * letzten Erfolg zu aendern - die Oberflaeche zeigt so den Grund, nicht nur ein Alter
 * (Fehlersuche 28.10.2026: das Log hatte keine Uhrzeit, ein Fehlschlag stand nirgends).
 * Der naechste Erfolg schreibt den Stand neu, ohne diesen Vermerk.
 */
export function fehlerVermerken(privatDir, vermerk) {
  const stand = path.join(privatDir, 'sicherungsstand.json');
  let roh = {};
  try { roh = JSON.parse(fs.readFileSync(stand, 'utf8')); } catch (e) { if (e?.code !== 'ENOENT') return; }
  const tmp = `${stand}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify({ ...roh, letzterFehler: vermerk }), { mode: 0o600 });
    fs.renameSync(tmp, stand);
  } catch { fs.rmSync(tmp, { force: true }); /* volle Platte: das Log behaelt den Fehler */ }
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
  const { privatDir, ziel, kopie, aufbewahrenTage, jetzt } = parseArgs(process.argv.slice(2));
  const zielDir = ziel || path.join(privatDir, 'sicherungen');

  // Jede Zeile mit Uhrzeit: das launchd-Log sammelt alle Laeufe in einer Datei.
  const zeit = () => new Date().toISOString();
  console.log(`${zeit()} Sichere Betriebsdaten aus ${privatDir} nach ${zielDir} ...`);
  let ergebnis;
  try {
    ergebnis = sichern({ privatDir, ziel: zielDir, jetzt, launchAgentsDir: path.join(os.homedir(), 'Library', 'LaunchAgents') });
  } catch (err) {
    console.error(`${zeit()} Sicherung fehlgeschlagen: ${err.message}`);
    fehlerVermerken(privatDir, { am: jetzt.toISOString(), meldung: String(err.message).slice(0, 300) });
    process.exitCode = 1;
    return;
  }

  const mb = (ergebnis.bytes / (1024 * 1024)).toFixed(2);
  console.log(`${zeit()} Archiv geschrieben: ${ergebnis.archiv} (${mb} MB)`);
  console.log(`Enthalten: ${ergebnis.quellen.join(', ')}`);
  if (ergebnis.uebersprungen.length > 0) {
    console.log(`Uebersprungen (nicht vorhanden): ${ergebnis.uebersprungen.join(', ')}`);
  }
  if (ergebnis.dienste.ausgelassen.length > 0) {
    console.log(`Mac-Dienste mit Zugangsdaten nicht gesichert: ${ergebnis.dienste.ausgelassen.join(', ')}`);
  }

  const { geloescht } = alteSicherungenAufraeumen({ ziel: zielDir, aufbewahrenTage, jetzt });
  if (geloescht.length > 0) {
    console.log(`Alte Sicherungen geloescht (> ${aufbewahrenTage} Tage): ${geloescht.join(', ')}`);
  } else {
    console.log(`Keine Sicherungen aelter als ${aufbewahrenTage} Tage.`);
  }

  if (kopie) {
    try {
      const k = kopieAblegen(ergebnis.archiv, kopie);
      kopieVermerken(privatDir, { ziel: path.resolve(kopie), ok: true, am: jetzt.toISOString(), bytes: k.bytes });
      console.log(`Kopie geschrieben: ${k.ziel}`);
      const alt = alteSicherungenAufraeumen({ ziel: path.resolve(kopie), aufbewahrenTage, jetzt }).geloescht;
      if (alt.length) console.log(`Alte Kopien geloescht (> ${aufbewahrenTage} Tage): ${alt.join(', ')}`);
    } catch (err) {
      kopieVermerken(privatDir, { ziel: path.resolve(kopie), ok: false, am: jetzt.toISOString(), fehler: err.message });
      console.error(`${zeit()} Kopie fehlgeschlagen (Tagesarchiv ist trotzdem geschrieben): ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`${zeit()} Sicherung ${process.exitCode ? 'mit Fehler beendet' : 'fertig'}.`);
}

const istDirekterAufruf = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (istDirekterAufruf) {
  main();
}
