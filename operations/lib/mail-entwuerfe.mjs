/**
 * Gmail-Entwuerfe mit Anhang aus einem Ordner (operations/README.md, "Mail-Entwuerfe aus dem Ordner").
 *
 * Wer einen Entwurf braucht (Cloud-Sitzung, geplante Aufgabe, ChatGPT), legt in
 * $TP_PRIVAT_DIR/mail-entwuerfe/eingang/ die Anhaenge und zuletzt eine JSON-Datei ab:
 *   { "an": ["x@y.de"], "cc": [], "betreff": "...", "text": "...", "anhaenge": ["formular.pdf"] }
 * Der Dienst legt daraus per IMAP APPEND einen Entwurf in den Entwuerfe-Ordner des
 * Firmenpostfachs (Zugang wie der Nachfass-Versand: nachfassen/postfach.json, App-Passwort)
 * und verschiebt Auftrag und Anhaenge nach erledigt/. Er sendet NIE: es gibt hier keinen
 * SMTP-Aufruf, und APPEND geht nur in den Ordner mit dem Kennzeichen \Drafts.
 *
 * Cloud-Chats erreichen den Mac nicht: Sie schreiben den Auftrag als Text in den Dropbox-Ordner
 * (dropboxOrdner()); der Dienst holt ihn von dort nach eingang/. Statt eines fertigen PDFs kann
 * der Auftrag "formular": { "vorlage": "x.pdf", "werte": {Feld: Wert}, "name": "y.pdf" } tragen -
 * der Mac fuellt die Vorlage (aus eingang/ oder vorlagen/) mit scripts/pdf_formular.py.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { adresse, baueNachricht } from './smtp.mjs';
import { anmelden, imapText, ordnerMitKennzeichen, pruefe, verbinde } from './imap-lesen.mjs';

/** Gmail nimmt per IMAP bis rund 35 MB; base64 macht ein Drittel mehr daraus. */
export const ANHAENGE_MAX_BYTES = 20 * 1024 * 1024;
/** So lange darf ein Anhang fehlen (Drive-Sync noch unterwegs), danach ist der Auftrag ein Fehler. */
export const ANHANG_WARTEN_MS = 24 * 3600_000;

const TYPEN = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', txt: 'text/plain',
  csv: 'text/csv', zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function ordner(privat) {
  const basis = path.join(privat, 'mail-entwuerfe');
  return { basis, eingang: path.join(basis, 'eingang'), erledigt: path.join(basis, 'erledigt'), fehler: path.join(basis, 'fehler'), vorlagen: path.join(basis, 'vorlagen') };
}

/** Eingang fuer Cloud-Chats; null, wenn Dropbox auf diesem Rechner fehlt. */
export function dropboxOrdner(env = process.env) {
  if (env.TP_MAIL_DROPBOX) return env.TP_MAIL_DROPBOX;
  const dropbox = path.join(os.homedir(), 'Dropbox');
  return fs.existsSync(dropbox) ? path.join(dropbox, 'TP Mail-Entwuerfe') : null;
}

/**
 * Verschiebt alle Dateien aus dem Dropbox-Ordner nach eingang/ - danach liegen keine Kundendaten
 * mehr in der Dropbox. Was spaeter nachsynchronisiert, holt der naechste Lauf. Unterordner,
 * versteckte Dateien und Namen, die in eingang/ schon belegt sind, bleiben liegen.
 */
export function holeAusDropbox(quelle, eingang) {
  if (!quelle) return [];
  fs.mkdirSync(quelle, { recursive: true });
  fs.mkdirSync(eingang, { recursive: true, mode: 0o700 });
  const geholt = [];
  for (const e of fs.readdirSync(quelle, { withFileTypes: true })) {
    if (!e.isFile() || e.name.startsWith('.') || fs.existsSync(path.join(eingang, e.name))) continue;
    fs.copyFileSync(path.join(quelle, e.name), path.join(eingang, e.name));
    fs.rmSync(path.join(quelle, e.name));
    geholt.push(e.name);
  }
  return geholt;
}

const PDF_FORMULAR = fileURLToPath(new URL('../scripts/pdf_formular.py', import.meta.url));

/** Fuellt die Vorlage per pdf_formular.py; ein Fehler (falscher Feldname, Wert) wirft mit dessen Meldung. */
export function formularFuellen(vorlage, werte, ziel, { python = process.env.TP_PYTHON || path.join(os.homedir(), '.venvs/analyse/bin/python') } = {}) {
  const werteDatei = `${ziel}.werte.json`;
  fs.writeFileSync(werteDatei, JSON.stringify(werte));
  try {
    execFileSync(python, [PDF_FORMULAR, 'ausfuellen', vorlage, werteDatei, ziel], { stdio: 'pipe', timeout: 60_000 });
  } catch (e) {
    throw new Error(`Formular: ${String(e.stderr || e.message).trim().split('\n').pop().slice(0, 160)}`);
  } finally {
    fs.rmSync(werteDatei, { force: true });
  }
}

/** Anzeigename im Mailkopf: smtp.mjs erlaubt nur [A-Za-z0-9._-]. */
export const anzeigeName = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-100);

const liste = w => (w == null ? [] : Array.isArray(w) ? w : [w]);

/**
 * Prueft einen Auftrag. Ergebnis { auftrag } oder { fehler } (Auftrag unbrauchbar) oder
 * { warten } (Anhang noch nicht da).
 */
export function pruefeAuftrag(roh, verzeichnis, { alterMs = 0 } = {}) {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return { fehler: 'kein JSON-Objekt' };
  const an = liste(roh.an).map(adresse);
  const cc = liste(roh.cc).map(adresse);
  if (!an.length || an.some(a => !a)) return { fehler: '"an" fehlt oder enthält eine ungültige Adresse' };
  if (cc.some(a => !a)) return { fehler: '"cc" enthält eine ungültige Adresse' };
  if (typeof roh.betreff !== 'string' || !roh.betreff.trim()) return { fehler: '"betreff" fehlt' };
  if (typeof roh.text !== 'string' || !roh.text.trim()) return { fehler: '"text" fehlt' };
  const anhaenge = [];
  let summe = 0;
  for (const name of liste(roh.anhaenge)) {
    // Nur Dateien direkt daneben: kein Pfad, kein Weg aus dem Ordner hinaus.
    if (typeof name !== 'string' || !name || name !== path.basename(name) || name.startsWith('.')) return { fehler: `Anhang ungültig: ${String(name).slice(0, 60)}` };
    const typ = TYPEN[path.extname(name).slice(1).toLowerCase()];
    if (!typ) return { fehler: `Dateityp nicht erlaubt: ${name}` };
    const datei = path.join(verzeichnis, name);
    if (!fs.existsSync(datei)) return alterMs > ANHANG_WARTEN_MS ? { fehler: `Anhang fehlt seit über 24 h: ${name}` } : { warten: `Anhang fehlt noch: ${name}` };
    const inhalt = fs.readFileSync(datei);
    summe += inhalt.length;
    anhaenge.push({ datei: name, name: anzeigeName(name), typ, inhalt });
  }
  let formular = null;
  if (roh.formular != null) {
    const f = roh.formular;
    const ok = n => typeof n === 'string' && n === path.basename(n) && !n.startsWith('.') && /\.pdf$/i.test(n);
    if (typeof f !== 'object' || !ok(f.vorlage)) return { fehler: '"formular.vorlage" muss ein PDF-Dateiname ohne Pfad sein' };
    if (!f.werte || typeof f.werte !== 'object' || Array.isArray(f.werte)) return { fehler: '"formular.werte" muss ein Objekt {Feld: Wert} sein' };
    if (f.name != null && !ok(f.name)) return { fehler: '"formular.name" muss ein PDF-Dateiname sein' };
    const vorlage = [path.join(verzeichnis, f.vorlage), path.join(verzeichnis, '..', 'vorlagen', f.vorlage)].find(p => fs.existsSync(p));
    if (!vorlage) return alterMs > ANHANG_WARTEN_MS ? { fehler: `Formularvorlage fehlt seit über 24 h: ${f.vorlage}` } : { warten: `Formularvorlage fehlt noch: ${f.vorlage}` };
    formular = { vorlage, werte: f.werte, name: anzeigeName(f.name || f.vorlage) };
  }
  if (summe > ANHAENGE_MAX_BYTES) return { fehler: `Anhänge zu groß (${Math.round(summe / 1048576)} MB, höchstens 20)` };
  return { auftrag: { an, cc, betreff: roh.betreff.trim(), text: roh.text, anhaenge }, formular };
}

/** Legt eine fertige Nachricht (RFC 822) als Entwurf ab: APPEND in den Ordner mit \Drafts. */
export async function entwurfAblegen(zugang, daten, { host = 'imap.gmail.com', port = 993, verbinden, zeitLimitMs = 120_000 } = {}) {
  const v = await verbinde({ host, port, verbinden, zeitLimitMs });
  try {
    await anmelden(v, zugang);
    const entwuerfe = ordnerMitKennzeichen(pruefe(await v.befehl('LIST "" "*"'), 'LIST').zeilen, '\\Drafts');
    if (!entwuerfe) throw new Error('IMAP: Entwürfe-Ordner (\\Drafts) nicht gefunden');
    pruefe(await v.befehl(`APPEND ${imapText(entwuerfe)} (\\Draft \\Seen)`, Buffer.from(daten)), 'APPEND');
  } finally {
    await v.schliessen();
  }
}

function verschiebe(dateien, von, nach) {
  fs.mkdirSync(nach, { recursive: true, mode: 0o700 });
  for (const d of dateien) if (fs.existsSync(path.join(von, d))) fs.renameSync(path.join(von, d), path.join(nach, d));
}

/**
 * Ein Durchgang ueber eingang/. Ergebnis je Auftrag { datei, status: angelegt|fehler|wartet, grund? }.
 * Scheitert das Ablegen (Netz, Anmeldung), bleibt der Auftrag liegen und der Fehler geht nach oben.
 */
export async function durchgang({ privat, zugang, ablegen = entwurfAblegen, fuellen = formularFuellen, jetzt = new Date() }) {
  const o = ordner(privat);
  fs.mkdirSync(o.eingang, { recursive: true, mode: 0o700 });
  const ergebnis = [];
  for (const datei of fs.readdirSync(o.eingang).filter(n => n.endsWith('.json') && !n.startsWith('.')).sort()) {
    const pfad = path.join(o.eingang, datei);
    const stempel = `${jetzt.toISOString().slice(0, 19).replace(/[:T]/g, '-')}-${datei.slice(0, -5)}`;
    let roh;
    try { roh = JSON.parse(fs.readFileSync(pfad, 'utf8')); } catch (e) { roh = { kaputt: e.message }; }
    const alterMs = jetzt.getTime() - fs.statSync(pfad).mtimeMs;
    const p = roh?.kaputt ? { fehler: `JSON nicht lesbar: ${roh.kaputt.slice(0, 80)}` } : pruefeAuftrag(roh, o.eingang, { alterMs });
    const mit = [datei, ...liste(roh?.anhaenge).filter(n => typeof n === 'string' && n === path.basename(n))];
    if (p.warten) { ergebnis.push({ datei, status: 'wartet', grund: p.warten }); continue; }
    // Eine Vorlage aus eingang/ gehoert zum Auftrag, eine aus vorlagen/ bleibt fuer den naechsten.
    if (p.formular && path.dirname(p.formular.vorlage) === o.eingang) mit.push(path.basename(p.formular.vorlage));
    let gefuellt = null;
    if (p.formular) {
      gefuellt = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-formular-'));
      const ziel = path.join(gefuellt, p.formular.name);
      try {
        fuellen(p.formular.vorlage, p.formular.werte, ziel);
        p.auftrag.anhaenge.push({ name: p.formular.name, typ: 'application/pdf', inhalt: fs.readFileSync(ziel) });
      } catch (e) { p.fehler = e.message; }
    }
    if (p.fehler) {
      verschiebe(mit, o.eingang, path.join(o.fehler, stempel));
      fs.writeFileSync(path.join(o.fehler, stempel, 'FEHLER.txt'), `${p.fehler}\n`);
      if (gefuellt) fs.rmSync(gefuellt, { recursive: true, force: true });
      ergebnis.push({ datei, status: 'fehler', grund: p.fehler });
      continue;
    }
    const { daten } = baueNachricht({ von: { name: zugang.absenderName, adresse: zugang.absender }, ...p.auftrag, datum: jetzt });
    try { await ablegen(zugang, daten); } catch (e) { if (gefuellt) fs.rmSync(gefuellt, { recursive: true, force: true }); throw e; }
    verschiebe(mit, o.eingang, path.join(o.erledigt, stempel));
    // Ausgefuelltes Formular samt Vorschau-PNG zum Nachsehen ablegen.
    if (gefuellt) { verschiebe(fs.readdirSync(gefuellt), gefuellt, path.join(o.erledigt, stempel)); fs.rmSync(gefuellt, { recursive: true, force: true }); }
    ergebnis.push({ datei, status: 'angelegt' });
  }
  return ergebnis;
}
