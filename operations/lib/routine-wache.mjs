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
 *  - ToolSearch und die lesenden Gmail-Werkzeuge ohne weitere Pruefung.
 *  - create_draft (nur Lauf postfach-entwuerfe): nur als Antwort am Verlauf, genau ein Empfaenger,
 *    und zwar Absender oder Antwort-an der Mail laut Vorpruefung (absender.json), reiner Text ohne
 *    Anhang, Kopie oder HTML, Anfang "Guten Tag", Gruss, keine Betraege, Liefertermine, KI-Saetze,
 *    fremden Links oder Bankverbindungen, je Mail nur einmal, hoechstens ENTWUERFE_MAX_VERLAEUFE
 *    je Lauf.
 *  - label_thread (nur Lauf postfach-entwuerfe): nur die festen Labels aus routinen.mjs.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  LAEUFE, arbeitsOrdner, auftragPfad, entwuerfeLabels, entwuerfeOrdner, sperrPfad,
  ENTWUERFE_LABELS_NIE, ENTWUERFE_MAX_VERLAEUFE, GMAIL_ENTWURF, GMAIL_LABEL_SETZEN,
} from './routinen.mjs';

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

// --- Entwuerfe (nur Lauf postfach-entwuerfe) ---------------------------------

const ENTWURF_FELDER = new Set(['to', 'subject', 'body', 'replyToMessageId', 'includeSignature']);
const ADRESSE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
// Nur Saetze ueber den Entwurf selbst: "Hier ist die Adresse" und ein Kunde namens Claude sind normal.
const KI_SATZ = /hier ist (eine|ein|der|die)\s+(\S+\s+)?(formulierung|antwort|entwurf|vorschlag|text|e-?mail|nachricht|fassung)\b|formulierung\s*:|als ki\b|ki-modell|sprachmodell|ich bin (eine |ein )?(ki\b|claude\b)|anthropic/i;
// Auch ohne Waehrungszeichen. Masse wie "4,50 x 3,20 m" bleiben erlaubt, sie stammen vom Kunden.
const BETRAEGE = Object.freeze([
  /€|\bEUR\b|\bEuro\b/i,
  /\b\d{1,3}(?:\.\d{3})*,\d{2}\b(?!\s*(?:x\b|×|mm\b|cm\b|m\b|m²|qm\b|lfm\b|meter\b|quadratmeter\b))/i,
  /\b\d+,[-–—]/,
  /\b\d+\s*(?:pro|je|\/)\s*(?:m²|qm\b|m\b|lfm\b|meter\b|quadratmeter\b|stück\b|paket\b|rolle\b)/i,
  /\b(?:preis\w*|kostet|kosten|betr[aä]gt|rabatt)\b\D{0,20}\d/i,
  /\d\s*(?:%|prozent\b)/i,
]);
// Der Platzhalter "[Lieferzeit prüfen]" ist gewollt; darum ohne eckige Klammern geprueft.
const LIEFERTERMIN = /\bliefer(?:termin|zeit|datum)\b|\b\d+\s*(?:(?:-|–|bis)\s*\d+\s*)?(?:werktag|arbeitstag|woche)/i;
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,}/;
const EIGENE_HOSTS = new Set(['teppich-paradies.net', 'www.teppich-paradies.net']);
const URL_SCHEMA = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"')\]]+/gi;
const MAIL_IM_TEXT = /[^\s<>,;:"'()[\]]+@[^\s<>,;:"'()[\]]+/g;
const DOMAIN_FORM = /(?<![\w@.-])(?:[a-z0-9-]+\.)+[a-z]{2,}(?![\w-])/gi;

/** Erster Link, erste Mailadresse oder Domain im Text, die nicht uns gehoert; sonst null. */
export function fremdesZiel(text) {
  let rest = String(text ?? '');
  const eigen = (u) => {
    try {
      const a = new URL(u);
      return ['http:', 'https:'].includes(a.protocol) && !a.username && !a.password && EIGENE_HOSTS.has(a.hostname.toLowerCase());
    } catch { return false; }
  };
  for (const m of rest.match(URL_SCHEMA) || []) if (!eigen(m)) return m;
  rest = rest.replace(URL_SCHEMA, ' ');
  for (const m of rest.match(MAIL_IM_TEXT) || []) if (!EIGENE_HOSTS.has(m.split('@').pop().replace(/[.!?]+$/, '').toLowerCase())) return m;
  rest = rest.replace(MAIL_IM_TEXT, ' ');
  for (const m of rest.match(DOMAIN_FORM) || []) if (!EIGENE_HOSTS.has(m.toLowerCase())) return m;
  return null;
}

/** Was eine Mail Claude untergeschoben haben kann: bleibt immer eine Stoerung (Pruefung 03.11.). */
function entwurfZielFehler(e) {
  if (fremdesZiel(e.body) || fremdesZiel(e.subject)) return 'nur Links und Adressen von teppich-paradies.net im Entwurf';
  if (IBAN.test(String(e.body ?? ''))) return 'keine Bankverbindung im Entwurf';
  return null;
}

/** Was Claude selbst korrigieren soll, ohne dass es auf eine fremde Mail hindeutet. */
function entwurfTextFehler(e) {
  const text = typeof e.body === 'string' ? e.body : '';
  if (!/^\s*Guten Tag\b/.test(text)) return 'Text beginnt mit „Guten Tag“';
  if (!text.includes('Mit freundlichen Grüßen') || !text.includes('Teppich Paradies')) return 'Text endet mit Gruß und Firmensignatur';
  if (KI_SATZ.test(text)) return 'keine KI-Sätze im Entwurf';
  if (BETRAEGE.some(b => b.test(text))) return 'keine Preise im Entwurf';
  if (LIEFERTERMIN.test(text.replace(/\[[^\]]*\]/g, ' '))) return 'keine Liefertermine im Entwurf, nur der Platzhalter [Lieferzeit prüfen]';
  return null;
}

/**
 * Lehnt die Wache nur den Wortlaut ab, korrigiert Claude ihn laut Auftrag; das ist keine Stoerung
 * (fuer harmloseAblehnung). Empfaenger, fremde Links und alles andere bleiben eine.
 */
export function entwurfNurTextAbgelehnt(a) {
  if (a?.werkzeug !== GMAIL_ENTWURF || !a.eingabe) return false;
  return Boolean(entwurfTextFehler(a.eingabe)) && !entwurfZielFehler(a.eingabe);
}

/** Merkmal einer Adresse: Der Vergleich braucht die Adresse nicht im Klartext. */
export function adressMerkmal(adresse) {
  return createHash('sha256').update(String(adresse ?? '').trim().toLowerCase()).digest('hex');
}

export function absenderPfad(privat) {
  return path.join(entwuerfeOrdner(privat), 'absender.json');
}

/** Legt fuer die Wache ab, an wen je Mail geantwortet werden darf. Jeder Lauf ersetzt die Datei. */
export function schreibeAbsender(privat, absender) {
  const aus = {};
  for (const { id, adressen } of absender) aus[id] = adressen.map(adressMerkmal);
  fs.mkdirSync(path.dirname(absenderPfad(privat)), { recursive: true, mode: 0o700 });
  const tmp = `${absenderPfad(privat)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(aus), { mode: 0o600 });
  fs.renameSync(tmp, absenderPfad(privat));
}

/** Kaputt oder fehlend heisst leer: Dann gibt es keinen Entwurf, nie einen Entwurf ohne Pruefung. */
function liesAbsender(privat) {
  try { return JSON.parse(fs.readFileSync(absenderPfad(privat), 'utf8')) || {}; } catch { return {}; }
}

function pruefeEntwurf(e, ctx) {
  for (const k of Object.keys(e)) if (!ENTWURF_FELDER.has(k)) return `Feld „${k}“ ist im Entwurf nicht erlaubt`;
  if (typeof e.replyToMessageId !== 'string' || !/^[0-9a-f]{6,32}$/i.test(e.replyToMessageId)) return 'Entwurf nur als Antwort am Verlauf (replyToMessageId)';
  if (!Array.isArray(e.to) || e.to.length !== 1 || !ADRESSE.test(String(e.to[0]))) return 'genau ein Empfänger';
  const an = String(e.to[0]).toLowerCase();
  if (an === 'mailer@shopify.com' || an.endsWith('@teppich-paradies.net')) return 'Empfänger ist die Kundenadresse, nie das Formular oder die eigene Adresse';
  const absender = ctx.absender?.[e.replyToMessageId.toLowerCase()];
  if (!Array.isArray(absender)) return 'diese Mail steht nicht in der Vorprüfung des Laufs';
  if (!absender.includes(adressMerkmal(an))) return 'Empfänger ist nicht Absender oder Antwort-an-Adresse dieser Mail';
  const fehler = entwurfZielFehler(e) || entwurfTextFehler(e);
  if (fehler) return fehler;
  const spuren = ctx.entwurfSpuren || [];
  if (spuren.some(s => s.mailId === e.replyToMessageId)) return 'zu dieser Mail gibt es schon einen Entwurf';
  const inDiesemLauf = spuren.filter(s => !ctx.laufSeit || s.zeit >= ctx.laufSeit).length;
  if (inDiesemLauf >= ENTWUERFE_MAX_VERLAEUFE) return `höchstens ${ENTWUERFE_MAX_VERLAEUFE} Entwürfe je Lauf`;
  return null;
}

function pruefeLabelSetzen(e, ctx) {
  for (const k of Object.keys(e)) if (k !== 'threadId' && k !== 'labelIds') return `Feld „${k}“ nicht erlaubt`;
  if (typeof e.threadId !== 'string' || !e.threadId) return 'threadId fehlt';
  const erlaubt = new Set(Object.values(ctx.labels || {}));
  if (!Array.isArray(e.labelIds) || !e.labelIds.length) return 'labelIds fehlen';
  if (e.labelIds.some(id => ENTWUERFE_LABELS_NIE.includes(id))) return 'das Label Auftrag setzt nie der Lauf';
  if (!e.labelIds.every(id => erlaubt.has(id))) return 'nur die festen Labels des Laufs';
  return null;
}

/** Was vor dem Vergleich zaehlt: Leerraum vereinheitlicht, sonst der Wortlaut. */
export function entwurfNormal(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

export function entwurfSha(text) {
  return createHash('sha256').update(entwurfNormal(text)).digest('hex');
}

export function spurPfad(privat) {
  return path.join(entwuerfeOrdner(privat), 'entwurf-spuren.jsonl');
}

function liesSpurZeilen(privat) {
  let text;
  try { text = fs.readFileSync(spurPfad(privat), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  return text.split('\n').filter(Boolean).map(z => JSON.parse(z));
}

/**
 * Spuren der Entwuerfe: Kennung, Zeit, Laenge und Pruefsumme - nie der Text. Ohne Versuche, die
 * uebernehmen() als gescheitert vermerkt hat.
 */
export function liesSpuren(privat) {
  const aktiv = [];
  for (const z of liesSpurZeilen(privat)) {
    if (!z.gescheitert) { aktiv.push(z); continue; }
    for (let i = aktiv.length - 1; i >= 0; i -= 1) if (aktiv[i].mailId === z.mailId) aktiv.splice(i, 1);
  }
  return aktiv;
}

/** Vermerkt, dass der Versuch zu dieser Mail keinen Entwurf ergab. Gibt die Zahl der Fehlversuche zurueck. */
export function merkeGescheitert(privat, mailId, jetzt = new Date()) {
  fs.appendFileSync(spurPfad(privat), `${JSON.stringify({ zeit: jetzt.toISOString(), mailId, gescheitert: true })}\n`, { mode: 0o600 });
  return liesSpurZeilen(privat).filter(z => z.gescheitert && z.mailId === mailId).length;
}

/** Wie viele Entwurfsversuche seit `start` scheiterten (fuer den Status des Laufs). */
export function gescheitertSeit(privat, start) {
  const ab = Date.parse(start);
  return liesSpurZeilen(privat).filter(z => z.gescheitert && Date.parse(z.zeit) >= ab).length;
}

/**
 * Nur die Wache sieht den Text, der wirklich an create_draft geht. Sie vermerkt die Spur, bevor
 * das Werkzeug laeuft: Die Spur heisst "versucht" und sperrt einen zweiten Versuch im selben Lauf.
 * Ob der Entwurf entstand, klaert uebernehmen() (postfach-entwuerfe.mjs).
 */
export function merkeEntwurf(aufruf, ctx, jetzt = new Date()) {
  if (aufruf?.tool_name !== GMAIL_ENTWURF) return;
  const e = aufruf.tool_input;
  fs.mkdirSync(path.dirname(spurPfad(ctx.privat)), { recursive: true, mode: 0o700 });
  fs.appendFileSync(spurPfad(ctx.privat), `${JSON.stringify({ zeit: jetzt.toISOString(), mailId: e.replyToMessageId, laenge: entwurfNormal(e.body).length, sha: entwurfSha(e.body) })}\n`, { mode: 0o600 });
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
  const ctx = { lauf, privat, dienst, arbeit, werkbank, bilder: path.join(privat, 'fehlermeldungen'), ergebnisse: werkzeugErgebnisOrdner(dienst, home) };
  if (lauf === 'postfach-entwuerfe') {
    ctx.labels = entwuerfeLabels(privat);
    ctx.absender = liesAbsender(privat);
    ctx.entwurfSpuren = liesSpuren(privat);
    try { ctx.laufSeit = JSON.parse(fs.readFileSync(sperrPfad(privat, lauf), 'utf8')).seit || null; } catch { ctx.laufSeit = null; }
  }
  return ctx;
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
  else if (name === GMAIL_ENTWURF) grund = pruefeEntwurf(e, ctx);
  else if (name === GMAIL_LABEL_SETZEN) grund = pruefeLabelSetzen(e, ctx);
  return grund ? nein(grund) : { erlaubt: true };
}
