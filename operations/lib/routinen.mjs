/**
 * Mac-Dienst fuer die Routinelaeufe (Inhaber 2026-10-26): was frueher als geplante
 * Aufgabe der Claude-App lief und dort bei jedem Start rund 105k Tokens Kontext kostete,
 * laeuft jetzt per launchd. Ein Skript prueft zuerst ohne KI, Claude startet nur bei
 * echter Arbeit - per `claude -p` mit Abo-Anmeldung, Sonnet und fester Werkzeugliste.
 *
 * Hier steht nur Logik ohne Seiteneffekte nach aussen (Zeitfenster, Vorpruefung,
 * Werkzeuglisten, Prompt-Kopf, Statusdateien, Sperre, Datengesundheit); die Laeufe selbst
 * stehen in operations/scripts/claude-lauf.mjs und operations/scripts/dienst-aktualisieren.mjs.
 *
 * Privat (nie im Repository): die Auftragstexte unter ~/.claude/scheduled-tasks/<name>/SKILL.md
 * (enthalten u. a. die Werkbank-Adresse) und alles unter $TP_PRIVAT_DIR/routinen/
 * (Status, Protokolle, Arbeitsordner mit Mail-Inhalten).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const STANDARD_PRIVAT_DIR = path.join(os.homedir(), 'teppich-paradies-analyse');

export function privatDir(env = process.env) {
  return env.TP_PRIVAT_DIR || STANDARD_PRIVAT_DIR;
}

/** Dienst-Checkout des Control Centers (Zweig dashboard-betrieb). */
export function dienstDir(env = process.env) {
  return env.TP_DIENST_DIR || path.join(os.homedir(), 'tp-dashboard');
}

/** Ordner der Auftragstexte (Claude-App, geplante Aufgaben) - privat, nicht im Repository. */
export function aufgabenDir(env = process.env) {
  return env.TP_AUFGABEN_DIR || path.join(os.homedir(), '.claude', 'scheduled-tasks');
}

export function routinenDir(privat = privatDir()) {
  return path.join(privat, 'routinen');
}

// --- Zeit ----------------------------------------------------------------

const WOCHENTAG = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Wochentag (Mo = 1), Stunde, Minute und Datum in Europe/Berlin - unabhaengig von der Zeitzone des Prozesses. */
export function berlinZeit(jetzt = new Date()) {
  const teile = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(jetzt).map(t => [t.type, t.value]));
  return {
    wochentag: WOCHENTAG[teile.weekday],
    stunde: Number(teile.hour),
    minute: Number(teile.minute),
    datum: `${teile.year}-${teile.month}-${teile.day}`,
  };
}

/** Mo-Sa 7-19 Uhr (die Stunde 19 zaehlt mit, wie bei den bisherigen App-Aufgaben `0 7-19 * * 1-6`). */
export const ARBEITSZEIT = Object.freeze({ tage: [1, 2, 3, 4, 5, 6], von: 7, bis: 19 });

export function imFenster(jetzt = new Date(), fenster = ARBEITSZEIT) {
  const z = berlinZeit(jetzt);
  return fenster.tage.includes(z.wochentag) && z.stunde >= fenster.von && z.stunde <= fenster.bis;
}

// --- Laeufe und Werkzeuglisten ---------------------------------------------

/**
 * Gmail heisst in `claude -p` mcp__claude_ai_Gmail__* (in der App anders, deshalb steht der
 * Name hier und im Prompt-Kopf, nicht in den Auftragstexten). Freigegeben sind nur die drei
 * lesenden Werkzeuge; alle schreibenden sind zusaetzlich ausdruecklich gesperrt - eine Sperre
 * schlaegt jede Freigabe, auch eine aus ~/.claude/settings.json.
 */
export const GMAIL_PREFIX = 'mcp__claude_ai_Gmail__';
export const GMAIL_LESEN = Object.freeze(['search_threads', 'get_thread', 'get_message'].map(n => GMAIL_PREFIX + n));
export const GMAIL_SCHREIBEN = Object.freeze([
  'send_message', 'reply', 'forward', 'create_draft', 'update_draft', 'delete_draft',
  'trash_message', 'trash_thread', 'untrash_message', 'untrash_thread',
  'label_message', 'label_thread', 'unlabel_message', 'unlabel_thread', 'update_message_labels',
  'create_label', 'update_label', 'delete_label',
  'mark_message_spam', 'mark_thread_spam', 'unmark_message_spam', 'unmark_thread_spam',
  'apply_sensitive_message_label', 'apply_sensitive_thread_label',
].map(n => GMAIL_PREFIX + n));

/** Was in keinem Lauf vorkommt - Schutz zusaetzlich zu dontAsk, falls eine Einstellung es doch freigibt. */
const IMMER_GESPERRT = Object.freeze([
  'Bash(git *)', 'Bash(gh *)', 'Bash(shopify *)', 'Bash(curl *)', 'Bash(rm *)', 'Bash(launchctl *)',
  'WebFetch', 'WebSearch', 'Edit(//**/.claude/**)', 'mcp__claude_ai_Shopify',
]);

/** Absoluter Pfad als Regelmuster (`//` = absolut, siehe Claude-Code-Berechtigungen). */
const absolut = p => `/${p.replace(/\/+$/, '')}`;

/**
 * Die Laeufe. `teile` sind getrennte `claude -p`-Aufrufe in einem launchd-Lauf: ein Fehler
 * im ersten verhindert den zweiten nicht, und der zweite schleppt die Mail-Inhalte des ersten
 * nicht im Kontext mit. Gleicher System-Prompt -> der zweite Start liest ihn aus dem Cache.
 */
export const LAEUFE = Object.freeze({
  fehlermeldungen: {
    titel: 'Fehlermeldungen → Werkbank',
    fenster: ARBEITSZEIT,
    zeitlimitMin: 15,
    // --restricted: ignoriert ~/.claude/settings.json und die Projekteinstellungen (dort ist
    // u. a. "Bash" ganz freigegeben) samt Hooks; ohne MCP-Server. Artifact/ArtifactData sind
    // eingebaut. ArtifactData erscheint nur, wenn Artifact auch in --tools steht.
    modus: ['--restricted'],
    teile: [{ id: 'fehlermeldungen', aufgabe: 'fehlermeldungen-werkbank', titel: 'Fehlermeldungen → Werkbank' }],
    werkzeuge: ['Bash', 'ToolSearch', 'Artifact', 'ArtifactData'],
    freigaben: ({ dienst, arbeit, privat }) => [
      `Bash(cd ${dienst})`,
      'Bash(npm run -s fehler -- abgleich)',
      'Bash(npm run -s fehler -- uebernommen *)',
      'Bash(npm run -s fehler -- werkbank-stand *)',
      'Bash(npm run -s fehler -- verworfen *)',
      'Bash(date -u *)',
      'ArtifactData',
      'Artifact',
      // out_dir der Werkbank-Abfrage (Schritt 3) und die Bildschirmfotos (Schritt 2c).
      `Edit(${absolut(arbeit)}/**)`,
      `Read(${absolut(path.join(privat, 'fehlermeldungen'))}/**)`,
    ],
    sperren: () => [...IMMER_GESPERRT, 'ArtifactComments', 'Bash(npm run -s fehler -- behoben *)'],
    zusatzOrdner: ({ arbeit, privat }) => [arbeit, path.join(privat, 'fehlermeldungen')],
    kopfZeilen: () => [
      'Werkbank-Werkzeuge: per ToolSearch „select:ArtifactData,Artifact“ laden.',
    ],
  },
  postfach: {
    titel: 'Postfach (Lieferbelege, Service-Anfragen)',
    fenster: ARBEITSZEIT,
    zeitlimitMin: 20,
    // Nur die Benutzereinstellungen: dort haengen die claude.ai-Konnektoren (Gmail). Die
    // Projekteinstellungen des Dienst-Checkouts (Bash ganz frei) bleiben aussen vor.
    modus: ['--setting-sources', 'user'],
    teile: [
      { id: 'lieferbelege', aufgabe: 'lieferbelege-postfach', titel: 'Lieferbelege aus dem Postfach' },
      { id: 'serviceanfragen', aufgabe: 'serviceanfragen-postfach', titel: 'Service-Anfragen aus dem Postfach' },
    ],
    // ToolSearch muss dabei sein: ohne ihn laedt Claude die Schemata aller MCP-Werkzeuge
    // sofort (gemessen ~240k statt ~20k Tokens je Anfrage).
    werkzeuge: ['Bash', 'Read', 'Write', 'ToolSearch'],
    freigaben: ({ dienst, arbeit }) => [
      `Bash(cd ${dienst})`,
      'Bash(npm run -s belege -- bekannt)',
      'Bash(npm run -s belege -- uebernehmen *)',
      'Bash(npm run -s service -- bekannt)',
      'Bash(npm run -s service -- uebernehmen *)',
      'Bash(date -u *)',
      'Bash(jq *)',
      ...GMAIL_LESEN,
      `Edit(${absolut(arbeit)}/**)`,
    ],
    sperren: () => [
      ...IMMER_GESPERRT, ...GMAIL_SCHREIBEN,
      // ~/.claude/settings.json gibt "npm run -s fehler -- *" und ArtifactData frei - hier nicht.
      'Bash(npm run -s fehler *)', 'Artifact', 'ArtifactData', 'ArtifactComments',
    ],
    zusatzOrdner: ({ arbeit }) => [arbeit],
    kopfZeilen: () => [
      `Gmail-Werkzeuge heißen hier ${GMAIL_LESEN.join(', ')} (per ToolSearch „select:${GMAIL_LESEN.join(',')}“ laden). Alle anderen Gmail-Werkzeuge sind gesperrt.`,
      'Die Zwischendatei NICHT selbst löschen (Schritt „rm …“ entfällt): der Dienst leert den Arbeitsordner nach dem Lauf.',
    ],
  },
});

export function arbeitsOrdner(privat, lauf) {
  return path.join(routinenDir(privat), lauf, 'arbeit');
}

/** Der Auftragstext ohne YAML-Kopf (`---` … `---`). */
export function auftragOhneKopf(text) {
  const t = String(text || '').replace(/^﻿/, '');
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(t);
  return (m ? t.slice(m[0].length) : t).trim();
}

/** Was der Dienst jedem Auftrag voranstellt: wo er laeuft und was dort anders ist als in der App. */
export function promptKopf(lauf, teil, { dienst, arbeit }) {
  const def = LAEUFE[lauf];
  return [
    'LAUFUMGEBUNG (vom Mac-Dienst vorangestellt; gilt zusätzlich zum Auftrag unten):',
    `- Du läufst als Mac-Dienst per \`claude -p\` (launchd, Routine „${teil.titel}“), nicht in der Claude-App. Niemand liest mit, niemand beantwortet Rückfragen oder erteilt Freigaben; nicht freigegebene Werkzeugaufrufe lehnt der Dienst sofort ab.`,
    '- Die Wochenlimit-Bremse aus ~/.claude/CLAUDE.md gilt für diesen Lauf nicht (kritische Routine): kein get_usage laden, direkt mit dem Auftrag beginnen.',
    `- Arbeitsverzeichnis ist der Dienst-Checkout ${dienst}. Befehle genau so ausführen, wie der Auftrag sie nennt – freigegeben sind nur diese; andere Optionen, Pipes oder zusätzliche Befehle werden abgelehnt.`,
    `- Arbeitsordner für Zwischendateien: ${arbeit} . Wo der Auftrag „dein Scratchpad-Verzeichnis“ nennt, nimm genau diesen Ordner. Er existiert schon (nicht anlegen); nie /tmp, nie das Repository.`,
    ...def.kopfZeilen().map(z => `- ${z}`),
    '- Deine Antwort endet mit genau der ABSCHLUSS-Zeile aus dem Auftrag.',
    '',
    'AUFTRAG:',
  ].join('\n');
}

/**
 * Argumente fuer `claude -p`. Der Prompt kommt als letztes Argument (nach `--`), damit ein
 * Auftragstext, der mit "-" beginnt, nie als Option gelesen wird.
 */
export function claudeArgumente(lauf, { dienst, arbeit, privat, prompt, modell = 'sonnet', effort = 'medium' }) {
  const def = LAEUFE[lauf];
  const ctx = { dienst, arbeit, privat };
  return [
    '-p',
    '--model', modell,
    '--effort', effort,
    ...def.modus,
    '--tools', def.werkzeuge.join(','),
    '--allowedTools', ...def.freigaben(ctx),
    '--disallowedTools', ...def.sperren(ctx),
    ...def.zusatzOrdner(ctx).flatMap(d => ['--add-dir', d]),
    '--permission-mode', 'dontAsk',
    '--permission-prompts', 'none',
    '--disable-slash-commands',
    '--exclude-dynamic-system-prompt-sections',
    '--no-session-persistence',
    // stream-json: der Dienst sieht, welche Werkzeuge liefen (nur Namen/Befehle ins Protokoll,
    // keine Mail-Inhalte), und wertet am Ende das result-Ereignis aus.
    '--output-format', 'stream-json', '--verbose',
    '--', prompt,
  ];
}

// --- Ergebnis eines claude-Laufs ------------------------------------------

/** Ein Werkzeugaufruf, der abgelehnt wurde - ohne Inhalte (eine abgelehnte Datei kann Kundendaten tragen). */
function ablehnungKurz(d) {
  const ein = d?.tool_input || {};
  const was = ein.command || ein.file_path || ein.action || '';
  return `${d?.tool_name || '?'}${was ? ` (${String(was).slice(0, 120)})` : ''}`;
}

/**
 * Ein ausgefuehrter Werkzeugaufruf fuers Protokoll: Befehl bzw. Pfad, nie Inhalte. Bei
 * MCP-Werkzeugen (Gmail) nur der Name, bei Artifact/ArtifactData ohne Adresse der Werkbank.
 */
export function aufrufKurz(block) {
  const n = block?.name || '?';
  const e = block?.input || {};
  if (n === 'Bash') return `Bash: ${String(e.command || '').slice(0, 160)}`;
  if (['Write', 'Edit', 'Read'].includes(n)) return `${n}: ${e.file_path || ''}`;
  if (n === 'ToolSearch') return `ToolSearch: ${String(e.query || '').slice(0, 120)}`;
  if (n === 'Artifact' || n === 'ArtifactData') return `${n}: ${[e.action, e.collection, e.doc_id].filter(Boolean).join(' ')}`;
  return n;
}

/** Liest die stream-json-Ausgabe zeilenweise: behaelt nur das result-Ereignis und die Aufrufliste. */
export function neuerSammler() {
  return { ergebnis: null, aufrufe: [], rest: '' };
}

function verarbeite(s, zeile) {
  let j;
  try { j = JSON.parse(zeile); } catch { return; }
  if (j?.type === 'result') s.ergebnis = j;
  else if (j?.type === 'assistant') {
    for (const b of j.message?.content || []) if (b?.type === 'tool_use' && s.aufrufe.length < 80) s.aufrufe.push(aufrufKurz(b));
  }
}

export function sammle(s, stueck) {
  s.rest += stueck;
  const zeilen = s.rest.split('\n');
  s.rest = zeilen.pop();
  for (const z of zeilen) if (z.trim()) verarbeite(s, z);
  return s;
}

export function abschliessen(s) {
  if (s.rest.trim()) verarbeite(s, s.rest);
  s.rest = '';
  return s;
}

export function leseAusgabe(text) {
  return abschliessen(sammle(neuerSammler(), String(text || '')));
}

/** Letzte nicht leere Zeile - die ABSCHLUSS-Zeile des Auftrags. */
export function abschlussZeile(text) {
  const zeilen = String(text || '').split('\n').map(z => z.trim()).filter(Boolean);
  return (zeilen.at(-1) || '').replace(/^\*\*|\*\*$/g, '').slice(0, 300);
}

export function tokensAus(usage = {}) {
  return ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens']
    .reduce((s, k) => s + (Number(usage?.[k]) || 0), 0);
}

/**
 * Bewertet einen Lauf von `claude -p --output-format stream-json`. Ok nur, wenn Claude ohne
 * Fehler endete UND kein Werkzeugaufruf abgelehnt wurde - eine Ablehnung heisst: die Freigaben
 * passen nicht zum Auftrag, und das soll sichtbar werden, nicht still verpuffen.
 * `stdout` (roh) oder `ergebnis`/`aufrufe` (schon gesammelt, siehe starteClaude).
 */
export function bewerteLauf({ exitCode, signal, stdout, ergebnis, aufrufe, zeitlimit = false }) {
  if (ergebnis === undefined) ({ ergebnis, aufrufe } = leseAusgabe(stdout));
  aufrufe = aufrufe || [];
  if (zeitlimit) return { ok: false, art: 'zeitlimit', meldung: 'Zeitlimit überschritten – Lauf abgebrochen.', aufrufe };
  const j = ergebnis;
  if (!j || j.type !== 'result') {
    return { ok: false, art: 'antwort', meldung: `Keine auswertbare Antwort von claude (Exit ${exitCode ?? signal ?? '?'}).`, aufrufe };
  }
  const ablehnungen = (j.permission_denials || []).map(ablehnungKurz);
  const zeile = abschlussZeile(j.result);
  const basis = { tokens: tokensAus(j.usage), runden: j.num_turns ?? null, dauerSek: j.duration_ms ? Math.round(j.duration_ms / 1000) : null, abschluss: zeile, ablehnungen, aufrufe };
  if (j.is_error || j.subtype !== 'success' || exitCode) {
    return { ...basis, ok: false, art: 'fehler', meldung: `claude endete mit Fehler (${j.subtype || 'unbekannt'}${exitCode ? `, Exit ${exitCode}` : ''}): ${zeile || '–'}` };
  }
  if (ablehnungen.length) {
    return { ...basis, ok: false, art: 'abgelehnt', meldung: `Werkzeug abgelehnt: ${ablehnungen.slice(0, 3).join('; ')}${ablehnungen.length > 3 ? ` (+${ablehnungen.length - 3})` : ''} · ${zeile}` };
  }
  if (/noch nicht im Dienst/i.test(zeile)) return { ...basis, ok: false, art: 'skript-fehlt', meldung: zeile };
  return { ...basis, ok: true, art: null, meldung: zeile || 'fertig' };
}

// --- Vorpruefung Fehlermeldungen --------------------------------------------

export const LAUFEND_ABSTAND_MIN = 120;
export const FEHLER_PAUSE_MIN = 60;

/**
 * Startet Claude nur bei echter Arbeit: neue Meldungen sofort; laufende oder kuerzlich
 * erledigte nur, wenn der letzte Claude-Lauf mehr als zwei Stunden her ist (der Stand in der
 * Werkbank aendert sich selten schneller). Nach einem Fehlschlag eine Stunde Pause, damit ein
 * dauerhaftes Problem nicht alle 15 Minuten einen Lauf kostet.
 */
export function vorpruefung(abgleich, status = {}, jetzt = new Date(), opt = {}) {
  const abstand = opt.laufendAbstandMin ?? LAUFEND_ABSTAND_MIN;
  const pause = opt.fehlerPauseMin ?? FEHLER_PAUSE_MIN;
  const neu = abgleich?.neu?.length || 0;
  const offen = (abgleich?.laufend?.length || 0) + (abgleich?.kuerzlichErledigt?.length || 0);
  const letzter = status?.letzterClaudeLauf ? Date.parse(status.letzterClaudeLauf) : NaN;
  const minuten = Number.isFinite(letzter) ? (jetzt.getTime() - letzter) / 60_000 : Infinity;
  if (!neu && !offen) return { starten: false, grund: 'nichts zu tun' };
  if (status?.letzterClaudeOk === false && minuten < pause) {
    return { starten: false, grund: `letzter Claude-Lauf fehlgeschlagen – Pause, nächster Versuch in ${Math.ceil(pause - minuten)} Min.` };
  }
  if (neu) return { starten: true, grund: `${neu} neue Meldung(en)` };
  if (minuten >= abstand) {
    return { starten: true, grund: `Stand zurückmelden (${abgleich.laufend?.length || 0} laufend, ${abgleich.kuerzlichErledigt?.length || 0} kürzlich erledigt)` };
  }
  return { starten: false, grund: `${offen} laufend/kürzlich erledigt – nächster Abgleich in ${Math.ceil(abstand - minuten)} Min.` };
}

// --- Status (eine Datei je Routine, genau ein Schreiber) ----------------------

/**
 * Was das Control Center zeigt. `stummNachStunden`: so lange ohne erfolgreichen Lauf
 * (`letzterErfolg`, sonst `zeit`) gilt die Routine als ausgefallen - auch wenn sie sich in jedem
 * Takt meldet, aber z. B. git fetch dauerhaft scheitert.
 */
export const STATUS_DATEIEN = Object.freeze([
  { id: 'fehlermeldungen', datei: 'fehlermeldungen/status.json', titel: 'Fehlermeldungen → Werkbank' },
  { id: 'lieferbelege', datei: 'postfach/status-lieferbelege.json', titel: 'Lieferbelege aus dem Postfach' },
  { id: 'serviceanfragen', datei: 'postfach/status-serviceanfragen.json', titel: 'Service-Anfragen aus dem Postfach' },
  { id: 'dienst-aktualisieren', datei: 'dienst-aktualisieren/status.json', titel: 'Control Center nachziehen (main)', stummNachStunden: 26 },
  { id: 'daten-gesundheit', datei: 'dienst-aktualisieren/gesundheit.json', titel: 'Datenstand des Sync-Dienstes', stummNachStunden: 3 },
]);

export function statusPfad(privat, id) {
  const def = STATUS_DATEIEN.find(s => s.id === id);
  if (!def) throw new Error(`Unbekannte Routine: ${id}`);
  return path.join(routinenDir(privat), def.datei);
}

/** Fehlt die Datei: {}; ist sie kaputt: Fehler - nie still als leer lesen (Lektion 2026-10-12). */
export function liesStatus(privat, id) {
  const datei = statusPfad(privat, id);
  let text;
  try { text = fs.readFileSync(datei, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
  return JSON.parse(text);
}

/**
 * Schreibt den neuen Stand atomar. `seit` bleibt, solange ok gleich bleibt - so steht im
 * To-do, seit wann etwas klemmt. `mitteilen` ist true, wenn ein Fehler neu ist (vorher ok
 * oder eine andere Fehlerart): nur dann soll eine Mitteilung auf dem Mac erscheinen.
 */
export function schreibStatus(privat, id, neu, jetzt = new Date()) {
  const datei = statusPfad(privat, id);
  let alt = {};
  try { alt = liesStatus(privat, id); } catch { alt = {}; }
  const zeit = jetzt.toISOString();
  // Ein reiner Lebenszeichen-Stand ({} oder ohne ok) aendert weder ok noch seit.
  const okWechsel = 'ok' in neu && alt.ok !== neu.ok;
  const stand = { ...alt, ...neu, schema: 1, id, zeit, seit: okWechsel || !alt.seit ? zeit : alt.seit };
  const mitteilen = neu.ok === false && (alt.ok !== false || alt.art !== neu.art);
  fs.mkdirSync(path.dirname(datei), { recursive: true, mode: 0o700 });
  const tmp = `${datei}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(stand, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, datei);
  return { stand, mitteilen };
}

/** Fuer /api/shopwache/status: alle vorhandenen Routinen mit ihrem letzten Stand. */
export function routinenStand(privat = privatDir()) {
  const liste = [];
  for (const def of STATUS_DATEIEN) {
    let s;
    try { s = liesStatus(privat, def.id); } catch { s = { ok: false, art: 'unlesbar', meldung: 'Statusdatei unlesbar' }; }
    if (!s || !Object.keys(s).length) continue;
    liste.push({
      id: def.id, titel: def.titel, ok: s.ok !== false, art: s.art || null,
      meldung: String(s.meldung || '').slice(0, 300), zeit: s.zeit || null, seit: s.seit || null,
      letzterErfolg: s.letzterErfolg || null, stummNachStunden: def.stummNachStunden ?? null,
    });
  }
  return liste;
}

// --- Sperre gegen Doppelstart ------------------------------------------------

function laeuft(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** Legt die Sperrdatei exklusiv an; eine Sperre eines beendeten Prozesses wird uebernommen. null = besetzt. */
export function nimmSperre(datei, { pid = process.pid, jetzt = new Date() } = {}) {
  fs.mkdirSync(path.dirname(datei), { recursive: true, mode: 0o700 });
  for (let versuch = 0; versuch < 2; versuch += 1) {
    try {
      const fd = fs.openSync(datei, 'wx', 0o600);
      fs.writeSync(fd, JSON.stringify({ pid, seit: jetzt.toISOString() }));
      fs.closeSync(fd);
      return { datei, pid, freigeben: () => gibSperreFrei(datei, pid) };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let halter = null;
      try { halter = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { halter = null; }
      if (halter?.pid && laeuft(halter.pid)) return null;
      fs.rmSync(datei, { force: true });
    }
  }
  return null;
}

export function gibSperreFrei(datei, pid = process.pid) {
  try {
    const halter = JSON.parse(fs.readFileSync(datei, 'utf8'));
    if (halter.pid === pid) fs.rmSync(datei, { force: true });
  } catch { /* schon weg */ }
}

export function sperreBesetzt(datei) {
  try {
    const halter = JSON.parse(fs.readFileSync(datei, 'utf8'));
    return Boolean(halter?.pid && laeuft(halter.pid));
  } catch { return false; }
}

export function sperrPfad(privat, lauf) {
  return path.join(routinenDir(privat), lauf, 'sperre');
}

// --- Datengesundheit (ersetzt den Datenteil von shop-zahlen-export) -------------

/**
 * Der Sync-Dienst erneuert alle 10 Minuten Bestellungen, Kennzahlen, Kunden, Angebote und
 * Warenkoerbe, Lexikon und Bestand stuendlich (operations/scripts/sync-dienst.mjs). Gesund
 * heisst: frischer Gesamtstand, jeder Teil erfolgreich und nicht aelter als seine Grenze.
 */
export const GESUNDHEIT_GRENZEN_MIN = Object.freeze({ gesamt: 60, standard: 60, lexikon: 180, bestand: 180 });

export function pruefeGesundheit(aktualisierung, jetzt = new Date(), grenzen = GESUNDHEIT_GRENZEN_MIN) {
  if (!aktualisierung || !aktualisierung.aktualisiertAm) {
    return { ok: false, art: 'fehlt', meldung: 'aktualisierung.json fehlt oder ist leer – läuft der Sync-Dienst (net.teppich-paradies.sync)?' };
  }
  const alterMin = t => (jetzt.getTime() - Date.parse(t)) / 60_000;
  const gesamt = alterMin(aktualisierung.aktualisiertAm);
  if (!(gesamt <= grenzen.gesamt)) {
    return { ok: false, art: 'alt', meldung: `Sync-Dienst meldet seit ${Math.round(gesamt)} Min. keinen neuen Stand (Grenze ${grenzen.gesamt} Min.).` };
  }
  const fehler = [];
  const alt = [];
  for (const [teil, t] of Object.entries(aktualisierung.teile || {})) {
    if (t?.erfolg === false) fehler.push(`${teil}: ${String(t.meldung || 'Fehler').slice(0, 80)}`);
    else if (t?.zeitpunkt && alterMin(t.zeitpunkt) > (grenzen[teil] ?? grenzen.standard)) alt.push(`${teil} (${Math.round(alterMin(t.zeitpunkt))} Min.)`);
  }
  if (fehler.length) return { ok: false, art: 'teil-fehler', meldung: `Sync-Teil fehlgeschlagen: ${fehler.join(' · ')}` };
  if (alt.length) return { ok: false, art: 'teil-alt', meldung: `Sync-Teil veraltet: ${alt.join(', ')}` };
  return { ok: true, art: null, meldung: `Datenstand frisch (${Math.round(gesamt)} Min. alt, ${Object.keys(aktualisierung.teile || {}).length} Teile ok).` };
}
