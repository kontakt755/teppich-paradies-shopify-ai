/**
 * Wache fuer die Routinelaeufe (PreToolUse-Hook, operations/scripts/routine-wache.mjs):
 * prueft jeden Werkzeugaufruf von `claude -p` gegen eine feste Liste je Lauf und lehnt alles
 * andere ab - auch, was ~/.claude/settings.json kuenftig freigibt (der Postfach-Lauf laedt die
 * Benutzereinstellungen wegen des Gmail-Konnektors). Mails und Meldungstexte sind fremde Daten;
 * die Wache ist die Grenze, die nicht von Freigabelisten abhaengt.
 *
 * Erlaubt je Lauf (LAEUFE[lauf].erlaubt in routinen.mjs):
 *  - Bash: nur die freigegebenen Befehle (Bash(...) aus LAEUFE[lauf].freigaben), verkettet
 *    hoechstens mit `&&`; keine Pipes, Umleitungen, Ersetzungen, Platzhalter; nie `.env`.
 *  - Read/Write: nur im Arbeitsordner (Read zusaetzlich: ausgelagerte grosse Werkzeugergebnisse
 *    von Claude Code unter ~/.claude/projects/<Dienst>/…/tool-results/).
 *  - ArtifactData: nur die Werkbank (Adresse aus dem privaten Auftragstext), collection
 *    "items", keine Loeschung; Dateien nur im Arbeitsordner.
 *  - Artifact: nur `read` der Werkbank und `publish` mit asset: true auf die Werkbank, Datei nur
 *    ein Bildschirmfoto aus $TP_PRIVAT_DIR/fehlermeldungen/.
 *  - ToolSearch und die drei lesenden Gmail-Werkzeuge ohne weitere Pruefung.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LAEUFE, arbeitsOrdner, auftragPfad } from './routinen.mjs';

/** Adresse eines claude.ai-Artefakts (Werkbank) im Auftragstext. */
// Ohne `?` geschrieben: der Geheimnis-Scan (automation/core/secret-scan.mjs) liest sonst eine Abfrage hinein.
const ARTEFAKT = /https:\/\/claude\.ai\/(code\/){0,1}artifact\/[A-Za-z0-9_-]+/g;

/** Die Werkbank-Adresse: genau eine Artefakt-Adresse im Auftragstext, sonst null. */
export function werkbankAus(text) {
  const alle = new Set(String(text || '').match(ARTEFAKT) || []);
  return alle.size === 1 ? [...alle][0] : null;
}

/** Werkbank-Eintraege, die der Lauf schreiben darf: nur Meldungsnummern (F-004). */
const MELDUNG = /^F-\d{3,}$/;

const adresse = u => String(u || '').replace(/[?#].*$/, '').replace(/\/+$/, '');

/** Liegt `datei` (absolut, nach Aufloesen von ..) in `ordner`? */
export function innerhalb(datei, ordner) {
  if (typeof datei !== 'string' || !datei || !ordner || !path.isAbsolute(datei)) return false;
  const d = path.resolve(datei);
  const o = path.resolve(ordner);
  return d.startsWith(o + path.sep);
}

const ENV_DATEI = /(^|[/\s'"=])\.env/;

/**
 * Zerlegt einen Bash-Befehl an `&&` in Teile - oder null, wenn er etwas enthaelt, das eine
 * Freigabeliste nicht mehr ueberblickt: Zeilenumbrueche, `;`, `|`, einzelnes `&`, Umleitungen,
 * Befehls- und Variablenersetzung, Platzhalter, Kommentare, `~`. In einfachen Anfuehrungszeichen
 * ist alles Text; in doppelten sind `$`, Backtick und Backslash verboten.
 */
export function befehlsTeile(befehl) {
  const s = String(befehl ?? '');
  if (!s.trim() || /[\r\n\0]/.test(s)) return null;
  const teile = [];
  let akt = '';
  let q = null;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q === "'") { akt += c; if (c === "'") q = null; continue; }
    if (q === '"') {
      if (c === '$' || c === '`' || c === '\\') return null;
      akt += c; if (c === '"') q = null; continue;
    }
    if (c === "'" || c === '"') { q = c; akt += c; continue; }
    if (c === '&' && s[i + 1] === '&') { teile.push(akt.trim()); akt = ''; i += 1; continue; }
    if (';|&<>`$\\(){}*?[]#~!'.includes(c)) return null;
    akt += c;
  }
  if (q) return null;
  teile.push(akt.trim());
  return teile.every(Boolean) ? teile : null;
}

/** Woerter eines Befehlsteils wie die Shell sie sieht (Anfuehrungszeichen entfernt). */
export function woerter(teil) {
  const r = [];
  let akt = null;
  let q = null;
  for (const c of String(teil)) {
    if (q) { if (c === q) q = null; else akt += c; continue; }
    if (c === "'" || c === '"') { q = c; akt ??= ''; continue; }
    if (c === ' ' || c === '\t') { if (akt !== null) r.push(akt); akt = null; continue; }
    akt = (akt ?? '') + c;
  }
  if (akt !== null) r.push(akt);
  return r;
}

/** Bash(...)-Freigabe eines Laufs als Pruefung: `x *` = x allein oder x mit Argumenten. */
function passt(teil, muster) {
  if (muster.endsWith(' *')) {
    const basis = muster.slice(0, -2);
    return teil === basis || teil.startsWith(`${basis} `);
  }
  return teil === muster;
}

const JQ_OPTIONEN = new Set(['-r', '-c', '-e', '-s', '-M', '-j', '-a', '-S', '-n', '-rc', '-cr', '--raw-output', '--compact-output', '--slurp', '--exit-status', '--sort-keys']);

/**
 * Lesbar: der Arbeitsordner und ausgelagerte grosse Werkzeugergebnisse von Claude Code
 * (…/tool-results/ unter ~/.claude/projects/<Dienst>/) - nicht die Protokolle anderer Sitzungen.
 */
export function lesbar(datei, ctx) {
  if (ENV_DATEI.test(String(datei))) return false;
  return innerhalb(datei, ctx.arbeit)
    || (innerhalb(datei, ctx.ergebnisse) && path.resolve(String(datei)).includes(`${path.sep}tool-results${path.sep}`));
}

/** jq: nur einfache Optionen, kein Zugriff auf Umgebung oder Module, Dateien nur lesbare. */
function pruefeJq(w, ctx) {
  let filter = null;
  for (const x of w.slice(1)) {
    if (x.startsWith('-')) {
      if (!JQ_OPTIONEN.has(x)) return `jq-Option ${x} nicht erlaubt`;
    } else if (filter === null) {
      filter = x;
      if (/\benv\b|\$ENV|\$__|\binput_filename\b|\bimport\b|\binclude\b|\bdebug\b|\bstderr\b/.test(x)) return 'jq-Filter greift auf Umgebung oder Dateien zu';
    } else if (!lesbar(x, ctx)) {
      return `jq liest nur im Arbeitsordner (${x})`;
    }
  }
  return null;
}

/** Bash: jeder Teil muss eine Freigabe des Laufs sein; ein paar Befehle zusaetzlich im Detail. */
export function pruefeBash(befehl, lauf, ctx) {
  if (ENV_DATEI.test(String(befehl))) return '.env-Dateien sind gesperrt';
  const teile = befehlsTeile(befehl);
  if (!teile) return 'nur einfache Befehle, höchstens mit && verbunden (keine Pipes, Umleitungen, Ersetzungen, Platzhalter)';
  const muster = LAEUFE[lauf].freigaben(ctx)
    .filter(f => f.startsWith('Bash(') && f.endsWith(')'))
    .map(f => f.slice(5, -1));
  for (const teil of teile) {
    if (!muster.some(m => passt(teil, m))) return `Befehl nicht freigegeben: ${teil.slice(0, 80)}`;
    const w = woerter(teil);
    if (w[0] === 'date' && !(w.length === 3 && w[1] === '-u' && /^\+[A-Za-z0-9%:.\-_]+$/.test(w[2]))) return 'date nur als `date -u +FORMAT`';
    if (w[0] === 'jq') { const f = pruefeJq(w, ctx); if (f) return f; }
    const datei = w.indexOf('--datei');
    if (datei >= 0 && !innerhalb(w[datei + 1], ctx.arbeit)) return '--datei nur aus dem Arbeitsordner';
    const ordner = w.indexOf('--ordner');
    if (ordner >= 0 && !innerhalb(w[ordner + 1], ctx.arbeit)) return '--ordner nur im Arbeitsordner';
  }
  return null;
}

/** Ordner fuer ausgelagerte grosse Werkzeugergebnisse von Claude Code (je Arbeitsverzeichnis). */
export function werkzeugErgebnisOrdner(dienst, home = os.homedir()) {
  return path.join(home, '.claude', 'projects', dienst.replace(/[^A-Za-z0-9]/g, '-'));
}

function pruefeArtifactData(e, ctx) {
  if (!ctx.werkbank) return 'Werkbank-Adresse unbekannt (privater Auftragstext fehlt oder nennt keine eindeutige)';
  if (adresse(e.url) !== adresse(ctx.werkbank)) return 'ArtifactData nur für die Werkbank';
  if (e.as_level) return 'as_level nicht erlaubt';
  if (e.out_dir && !innerhalb(e.out_dir, ctx.arbeit)) return 'out_dir nur im Arbeitsordner';
  if (e.action === 'batch') {
    const w = Array.isArray(e.writes) ? e.writes : [];
    if (!w.length) return 'leerer batch';
    for (const x of w) {
      if (x?.collection !== 'items') return 'nur collection „items“';
      if (x?.op === 'delete') return 'Löschen ist gesperrt';
      if (!MELDUNG.test(String(x?.doc_id))) return 'schreiben nur Einträge mit Meldungsnummer (F-…)';
      if (x?.file_path && !innerhalb(x.file_path, ctx.arbeit)) return 'file_path nur aus dem Arbeitsordner';
    }
    return null;
  }
  if (!['get', 'list', 'query', 'set', 'update', 'str_replace'].includes(e.action)) return `Aktion „${e.action}“ nicht erlaubt`;
  if (e.collection !== 'items') return 'nur collection „items“';
  if (['set', 'update', 'str_replace'].includes(e.action) && !MELDUNG.test(String(e.doc_id))) return 'schreiben nur Einträge mit Meldungsnummer (F-…)';
  if (e.file_path && !innerhalb(e.file_path, ctx.arbeit)) return 'file_path nur aus dem Arbeitsordner';
  return null;
}

const BILD = /^F-\d{3,}-[1-9]\.(jpg|png|webp)$/;

function pruefeArtifact(e, ctx) {
  if (!ctx.werkbank) return 'Werkbank-Adresse unbekannt (privater Auftragstext fehlt oder nennt keine eindeutige)';
  if (adresse(e.url) !== adresse(ctx.werkbank)) return 'Artifact nur für die Werkbank';
  const aktion = e.action ?? 'publish';
  if (aktion === 'read') {
    if (e.out_dir && !innerhalb(e.out_dir, ctx.arbeit)) return 'out_dir nur im Arbeitsordner';
    return null;
  }
  if (aktion !== 'publish' || e.asset !== true) return 'Artifact nur „read“ oder „publish“ mit asset: true (Bildschirmfoto)';
  for (const k of ['file_paths', 'from_url', 'asset_ids', 'files', 'capabilities', 'type_url', 'root', 'contract', 'force']) {
    if (e[k] !== undefined) return `Artifact-Feld „${k}“ nicht erlaubt`;
  }
  if (!innerhalb(e.file_path, ctx.bilder) || !BILD.test(path.basename(String(e.file_path)))) return 'hochladen nur Bildschirmfotos aus den Fehlermeldungen';
  return null;
}

/**
 * Kontext eines Laufs fuer die Wache. Die Werkbank-Adresse kommt zur Laufzeit aus dem privaten
 * Auftragstext - sie steht nie im Repository.
 */
export function wacheKontext(lauf, { privat, dienst, home = os.homedir() }) {
  const def = LAEUFE[lauf];
  if (!def) throw new Error(`Unbekannter Lauf: ${lauf}`);
  const arbeit = arbeitsOrdner(privat, lauf);
  let werkbank = null;
  if (lauf === 'fehlermeldungen') {
    try { werkbank = werkbankAus(fs.readFileSync(auftragPfad(privat, def.teile[0].aufgabe), 'utf8')); } catch { werkbank = null; }
  }
  return { lauf, privat, dienst, arbeit, werkbank, bilder: path.join(privat, 'fehlermeldungen'), ergebnisse: werkzeugErgebnisOrdner(dienst, home) };
}

/**
 * Prueft einen Werkzeugaufruf ({ tool_name, tool_input } aus dem Hook-Ereignis).
 * Ergebnis: { erlaubt: true } oder { erlaubt: false, grund }.
 */
export function pruefeAufruf(lauf, aufruf, ctx) {
  const def = LAEUFE[lauf];
  const name = String(aufruf?.tool_name || '');
  const e = aufruf?.tool_input && typeof aufruf.tool_input === 'object' ? aufruf.tool_input : {};
  const nein = grund => ({ erlaubt: false, grund: `Wache (${lauf}): ${grund}` });
  if (!def) return nein('unbekannter Lauf');
  if (!def.erlaubt.includes(name)) return nein(`Werkzeug „${name}“ ist in diesem Lauf nicht vorgesehen`);
  let grund = null;
  if (name === 'Bash') grund = pruefeBash(e.command, lauf, ctx);
  else if (name === 'Read') {
    if (!lesbar(e.file_path, ctx)) grund = 'lesen nur im Arbeitsordner';
  } else if (name === 'Write') {
    if (!innerhalb(e.file_path, ctx.arbeit) || ENV_DATEI.test(String(e.file_path))) grund = 'schreiben nur im Arbeitsordner';
  } else if (name === 'ArtifactData') grund = pruefeArtifactData(e, ctx);
  else if (name === 'Artifact') grund = pruefeArtifact(e, ctx);
  return grund ? nein(grund) : { erlaubt: true };
}
