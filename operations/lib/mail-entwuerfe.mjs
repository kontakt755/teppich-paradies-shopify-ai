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
 */

import fs from 'node:fs';
import path from 'node:path';
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
  return { basis, eingang: path.join(basis, 'eingang'), erledigt: path.join(basis, 'erledigt'), fehler: path.join(basis, 'fehler') };
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
  if (summe > ANHAENGE_MAX_BYTES) return { fehler: `Anhänge zu groß (${Math.round(summe / 1048576)} MB, höchstens 20)` };
  return { auftrag: { an, cc, betreff: roh.betreff.trim(), text: roh.text, anhaenge } };
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
export async function durchgang({ privat, zugang, ablegen = entwurfAblegen, jetzt = new Date() }) {
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
    if (p.fehler) {
      verschiebe(mit, o.eingang, path.join(o.fehler, stempel));
      fs.writeFileSync(path.join(o.fehler, stempel, 'FEHLER.txt'), `${p.fehler}\n`);
      ergebnis.push({ datei, status: 'fehler', grund: p.fehler });
      continue;
    }
    const { daten } = baueNachricht({ von: { name: zugang.absenderName, adresse: zugang.absender }, ...p.auftrag, datum: jetzt });
    await ablegen(zugang, daten);
    verschiebe(mit, o.eingang, path.join(o.erledigt, stempel));
    ergebnis.push({ datei, status: 'angelegt' });
  }
  return ergebnis;
}
