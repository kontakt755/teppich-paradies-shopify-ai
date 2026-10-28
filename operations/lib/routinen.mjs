/**
 * Mac-Dienst fuer die Routinelaeufe (Inhaber 2026-10-26): was frueher als geplante
 * Aufgabe der Claude-App lief und dort bei jedem Start rund 105k Tokens Kontext kostete,
 * laeuft jetzt per launchd. Ein Skript prueft zuerst ohne KI, Claude startet nur bei
 * echter Arbeit - per `claude -p` mit Abo-Anmeldung, Sonnet und fester Werkzeugliste.
 *
 * Hier steht nur Logik ohne Seiteneffekte nach aussen (Zeitfenster, Vorpruefung,
 * Werkzeuglisten, Prompt-Kopf, Statusdateien, Sperre, Datenstand); die Laeufe selbst stehen
 * in operations/scripts/claude-lauf.mjs und operations/scripts/datenstand-pruefen.mjs, die
 * Wache (PreToolUse-Hook) in operations/lib/routine-wache.mjs.
 *
 * Privat (nie im Repository): die Auftragstexte unter $TP_PRIVAT_DIR/routinen/auftraege/
 * (einmalig aus den App-Aufgaben kopiert; enthalten u. a. die Werkbank-Adresse) und alles
 * andere unter $TP_PRIVAT_DIR/routinen/ (Status, Protokolle, Arbeitsordner mit Mail-Inhalten).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STANDARD_PRIVAT_DIR = path.join(os.homedir(), 'teppich-paradies-analyse');

export function privatDir(env = process.env) {
  return env.TP_PRIVAT_DIR || STANDARD_PRIVAT_DIR;
}

/** Dienst-Checkout des Control Centers (Zweig dashboard-betrieb). */
export function dienstDir(env = process.env) {
  return env.TP_DIENST_DIR || path.join(os.homedir(), 'tp-dashboard');
}

export function routinenDir(privat = privatDir()) {
  return path.join(privat, 'routinen');
}

/**
 * Auftragstexte: private Kopien der App-Aufgaben (`dienste-einrichten.sh --routinen` kopiert
 * ~/.claude/scheduled-tasks/<aufgabe>/SKILL.md einmalig hierher). Der Dienst liest nur diese
 * Kopie - eine spaeter geaenderte oder pausierte App-Aufgabe aendert den Dienst nicht.
 */
export function auftragPfad(privat, aufgabe) {
  return path.join(routinenDir(privat), 'auftraege', `${aufgabe}.md`);
}

export const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');

// --- Zeit ----------------------------------------------------------------

const WOCHENTAG = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const BERLIN = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Berlin', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Wochentag (Mo = 1), Stunde, Minute und Datum in Europe/Berlin - unabhaengig von der Zeitzone des Prozesses. */
export function berlinZeit(jetzt = new Date()) {
  const teile = Object.fromEntries(BERLIN.formatToParts(jetzt).map(t => [t.type, t.value]));
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

/**
 * Minuten zwischen `von` und `bis`, die im Zeitfenster liegen (ohne Fenster: alle). In
 * 5-Minuten-Schritten; hoert auf, sobald `grenze` ueberschritten ist (die Stumm-Pruefung
 * braucht nur "mehr als"), und rechnet hoechstens 30 Tage.
 */
export function fensterMinuten(von, bis, fenster = ARBEITSZEIT, grenze = Infinity) {
  const a = new Date(von).getTime();
  const b = new Date(bis).getTime();
  if (!(b > a)) return 0;
  if (!fenster) return (b - a) / 60_000;
  const SCHRITT = 5 * 60_000;
  let summe = 0;
  for (let t = a, n = 0; t < b && n < 8640; t += SCHRITT, n += 1) {
    if (imFenster(new Date(t), fenster)) summe += Math.min(SCHRITT, b - t) / 60_000;
    if (summe > grenze) break;
  }
  return summe;
}

// --- Laeufe und Werkzeuglisten ---------------------------------------------

/**
 * Gmail heisst in `claude -p` mcp__claude_ai_Gmail__* (in der App anders, deshalb steht der
 * Name hier und im Prompt-Kopf, nicht in den Auftragstexten). Freigegeben sind nur die drei
 * lesenden Werkzeuge; alle schreibenden sind zusaetzlich ausdruecklich gesperrt - eine Sperre
 * schlaegt jede Freigabe, auch eine aus ~/.claude/settings.json. Die Wache laesst ohnehin nur
 * die drei lesenden durch.
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

/** Was in keinem Lauf vorkommt - Schutz zusaetzlich zu dontAsk und Wache, falls eine Einstellung es doch freigibt. */
const IMMER_GESPERRT = Object.freeze([
  'Bash(git *)', 'Bash(gh *)', 'Bash(shopify *)', 'Bash(curl *)', 'Bash(rm *)', 'Bash(launchctl *)',
  // Lesende Befehle, die Claude Code im Arbeitsverzeichnis sonst ohne Freigabe ausfuehrt
  // (dort liegt .env.local mit den Shopify-Zugangsdaten).
  'Bash(cat *)', 'Bash(head *)', 'Bash(tail *)', 'Bash(less *)', 'Bash(grep *)', 'Bash(env *)', 'Bash(printenv *)',
  'Read(//**/.env*)',
  'WebFetch', 'WebSearch', 'Edit(//**/.claude/**)', 'mcp__claude_ai_Shopify',
]);

/** Absoluter Pfad als Regelmuster (`//` = absolut, siehe Claude-Code-Berechtigungen). */
const absolut = p => `/${p.replace(/\/+$/, '')}`;

/** Puffer ueber dem Zeitlimit, bis eine Sperre als verwaist gilt (Vorpruefung, Gegenprobe, Aufraeumen). */
export const SPERRE_PUFFER_MIN = 10;

/**
 * Die Laeufe. `teile` sind getrennte `claude -p`-Aufrufe in einem launchd-Lauf: ein Fehler
 * im ersten verhindert den zweiten nicht, und der zweite schleppt die Mail-Inhalte des ersten
 * nicht im Kontext mit. Gleicher System-Prompt -> der zweite Start liest ihn aus dem Cache.
 *
 * `werkzeuge` geht an `--tools`; `pflicht` muss im init-Ereignis von `claude -p` stehen, sonst
 * bricht der Lauf sofort ab (art "werkzeug-fehlt"); `erlaubt` ist die Liste der Wache
 * (PreToolUse-Hook): jeder andere Werkzeugname wird abgelehnt, auch wenn eine Einstellung ihn
 * freigibt.
 */
export const LAEUFE = Object.freeze({
  fehlermeldungen: {
    titel: 'Fehlermeldungen → Werkbank',
    label: 'net.teppich-paradies.fehler-vorpruefung',
    fenster: ARBEITSZEIT,
    zeitlimitMin: 15,
    // --restricted: ignoriert ~/.claude/settings.json und die Projekteinstellungen (dort ist
    // u. a. "Bash" ganz freigegeben) samt deren Hooks; --settings (die Wache) gilt weiter.
    // --strict-mcp-config ohne --mcp-config: keine MCP-Server (--restricted allein laesst sie zu).
    // Artifact/ArtifactData sind eingebaut, aber nur mit CLAUDE_CODE_ENTRYPOINT=claude-desktop
    // (claude-lauf.mjs setzt es); ArtifactData erscheint nur, wenn Artifact auch in --tools steht.
    modus: ['--restricted', '--strict-mcp-config'],
    teile: [{ id: 'fehlermeldungen', aufgabe: 'fehlermeldungen-werkbank', titel: 'Fehlermeldungen → Werkbank' }],
    werkzeuge: ['Bash', 'ToolSearch', 'Artifact', 'ArtifactData'],
    pflicht: ['Bash', 'ToolSearch', 'Artifact', 'ArtifactData'],
    erlaubt: ['Bash', 'ToolSearch', 'Artifact', 'ArtifactData'],
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
    sperren: ({ dienst }) => [...IMMER_GESPERRT, `Read(${absolut(dienst)}/.env*)`, 'ArtifactComments', 'Bash(npm run -s fehler -- behoben *)'],
    zusatzOrdner: ({ arbeit, privat }) => [arbeit, path.join(privat, 'fehlermeldungen')],
    kopfZeilen: () => [
      'Werkbank-Werkzeuge: per ToolSearch „select:ArtifactData,Artifact“ laden.',
    ],
  },
  postfach: {
    titel: 'Postfach (Lieferbelege, Service-Anfragen)',
    label: 'net.teppich-paradies.postfach',
    fenster: ARBEITSZEIT,
    zeitlimitMin: 20,
    // Nur die Benutzereinstellungen: dort haengen die claude.ai-Konnektoren (Gmail). Die
    // Projekteinstellungen des Dienst-Checkouts (Bash ganz frei) bleiben aussen vor. Was die
    // Benutzereinstellungen sonst freigeben, faengt die Wache ab.
    modus: ['--setting-sources', 'user'],
    // Die Benutzereinstellungen bringen alle MCP-Server des Kontos mit (28.10.: 304 Werkzeuge
    // von 8 Servern, Gmail davon 6). --strict-mcp-config entfernt auch die claude.ai-Konnektoren
    // samt Gmail; deshalb sperrt der Lauf alle anderen Server einzeln (mcpSperren), deren Namen
    // eine Werkzeugprobe vor dem Start liefert. Gemessen: 29.472 statt 20.391 Tokens Kontext je Runde.
    nurMcp: ['claude.ai Gmail'],
    teile: [
      { id: 'lieferbelege', aufgabe: 'lieferbelege-postfach', titel: 'Lieferbelege aus dem Postfach' },
      { id: 'serviceanfragen', aufgabe: 'serviceanfragen-postfach', titel: 'Service-Anfragen aus dem Postfach' },
    ],
    // ToolSearch muss dabei sein: ohne ihn laedt Claude die Schemata aller MCP-Werkzeuge
    // sofort (gemessen ~240k statt ~20k Tokens je Anfrage).
    werkzeuge: ['Bash', 'Read', 'Write', 'ToolSearch'],
    pflicht: ['Bash', 'Read', 'Write', 'ToolSearch', ...GMAIL_LESEN],
    erlaubt: ['Bash', 'Read', 'Write', 'ToolSearch', ...GMAIL_LESEN],
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
    sperren: ({ dienst }) => [
      ...IMMER_GESPERRT, `Read(${absolut(dienst)}/.env*)`, ...GMAIL_SCHREIBEN,
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

/** Das Hook-Skript liegt im selben Checkout wie dieser Code (im Dienst: ~/tp-dashboard). */
export const WACHE_SKRIPT = fileURLToPath(new URL('../scripts/routine-wache.mjs', import.meta.url));

const shellWort = s => `'${String(s).replaceAll("'", "'\\''")}'`;

/**
 * `--settings` fuer `claude -p`: die Wache als PreToolUse-Hook fuer jedes Werkzeug. Gilt auch
 * mit --restricted (dort fallen nur die Einstellungsdateien weg, --settings bleibt) - belegt
 * per Probe am 26.10.2026: der Hook bekam den Aufruf und lehnte ihn ab.
 */
export function wacheEinstellungen(lauf, { privat, dienst, node = process.execPath, skript = WACHE_SKRIPT }) {
  const command = [node, skript, lauf, privat, dienst].map(shellWort).join(' ');
  return JSON.stringify({ hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command, timeout: 30 }] }] } });
}

/**
 * Argumente fuer `claude -p`. Der Prompt kommt als letztes Argument (nach `--`), damit ein
 * Auftragstext, der mit "-" beginnt, nie als Option gelesen wird.
 */
export function claudeArgumente(lauf, { dienst, arbeit, privat, prompt, modell = 'sonnet', effort = 'medium', node, skript, mcpGesperrt = [] }) {
  const def = LAEUFE[lauf];
  const ctx = { dienst, arbeit, privat };
  return [
    '-p',
    '--model', modell,
    '--effort', effort,
    ...def.modus,
    '--settings', wacheEinstellungen(lauf, { privat, dienst, node, skript }),
    '--tools', def.werkzeuge.join(','),
    '--allowedTools', ...def.freigaben(ctx),
    '--disallowedTools', ...def.sperren(ctx), ...mcpGesperrt,
    ...def.zusatzOrdner(ctx).flatMap(d => ['--add-dir', d]),
    '--permission-mode', 'dontAsk',
    '--permission-prompts', 'none',
    '--disable-slash-commands',
    '--exclude-dynamic-system-prompt-sections',
    '--no-session-persistence',
    // stream-json: der Dienst sieht das init-Ereignis (welche Werkzeuge da sind) und welche
    // Werkzeuge liefen (nur Namen/Befehle ins Protokoll, keine Mail-Inhalte), und wertet am
    // Ende das result-Ereignis aus.
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

/**
 * Liest die stream-json-Ausgabe zeilenweise: behaelt nur das init-Ereignis (Werkzeugnamen,
 * MCP-Server), das result-Ereignis, die Aufrufliste und die Gruende der Wache.
 */
export function neuerSammler() {
  return { init: null, ergebnis: null, aufrufe: [], wache: [], rest: '' };
}

/** Text eines tool_result-Blocks (String oder Liste von Textteilen). */
function ergebnisText(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(x => (typeof x?.text === 'string' ? x.text : '')).join(' ');
  return '';
}

function verarbeite(s, zeile) {
  let j;
  try { j = JSON.parse(zeile); } catch { return; }
  if (j?.type === 'system' && j.subtype === 'init') {
    s.init = {
      tools: Array.isArray(j.tools) ? j.tools.map(String) : [],
      mcp: (j.mcp_servers || []).map(m => ({ name: String(m?.name || ''), status: String(m?.status || '') })),
    };
  } else if (j?.type === 'result') s.ergebnis = j;
  else if (j?.type === 'assistant') {
    for (const b of j.message?.content || []) if (b?.type === 'tool_use' && s.aufrufe.length < 80) s.aufrufe.push(aufrufKurz(b));
  } else if (j?.type === 'user') {
    // Nur die Ablehnungsgruende der Wache (beginnen mit "PreToolUse:"), nie andere Ergebnisse -
    // die tragen Mail- und Kundendaten.
    for (const b of j.message?.content || []) {
      const t = b?.type === 'tool_result' ? ergebnisText(b.content).trim() : '';
      if (t.startsWith('PreToolUse:') && s.wache.length < 10) s.wache.push(t.slice(0, 200));
    }
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

/** MCP-Servername wie im Werkzeugnamen: "claude.ai Gmail" -> "claude_ai_Gmail". */
const mcpName = n => String(n).replace(/[^A-Za-z0-9_-]/g, '_');

/**
 * Pflichtwerkzeuge gegen das init-Ereignis. Fehlt eines, bricht der Lauf ab - ausser es gehoert
 * zu einem MCP-Server, der beim Start noch verbindet ("pending"): dann laeuft er weiter.
 */
export function pruefeWerkzeuge(init, pflicht = []) {
  const da = new Set(init?.tools || []);
  const fehlt = pflicht.filter(t => !da.has(t));
  const wartend = new Set((init?.mcp || []).filter(m => m.status === 'pending').map(m => `mcp__${mcpName(m.name)}__`));
  const hart = fehlt.filter(t => ![...wartend].some(p => t.startsWith(p)));
  return { ok: hart.length === 0, fehlt: hart, wartet: fehlt.filter(t => !hart.includes(t)) };
}

/**
 * Sperrregeln fuer alle MCP-Server aus dem init-Ereignis, die der Lauf nicht braucht
 * (`behalten`: Servernamen wie im init-Ereignis, z. B. "claude.ai Gmail"). Eine Regel
 * `mcp__<server>` nimmt alle Werkzeuge des Servers aus der Liste (gemessen 28.10.2026).
 */
export function mcpSperren(init, behalten = []) {
  const bleibt = new Set(behalten.map(mcpName));
  return [...new Set((init?.mcp || []).map(m => mcpName(m.name)).filter(n => n && !bleibt.has(n)))].map(n => `mcp__${n}`);
}

/**
 * Eine Ablehnung, die nur einen Dateipfad betraf (Write/Read ausserhalb des Arbeitsordners -
 * 28.10.: Claude wollte zuerst in sein Scratchpad schreiben und nahm dann den Arbeitsordner),
 * ist kein Fehler, wenn das Ergebnis nachweislich da ist. Jede andere Ablehnung (Bash, MCP)
 * bleibt ein Fehler: dort koennten fremde Daten etwas anderes gewollt haben.
 */
export function harmloseAblehnung(bewertung, ergebnisBelegt) {
  if (!bewertung || bewertung.art !== 'abgelehnt' || !ergebnisBelegt) return bewertung;
  const nurPfade = bewertung.ablehnungen?.length && bewertung.ablehnungen.every(a => /^(Write|Read) \(/.test(a));
  if (!nurPfade) return bewertung;
  return {
    ...bewertung, ok: true, art: null,
    meldung: bewertung.abschluss || 'fertig',
    hinweis: `${bewertung.ablehnungen.length} Dateizugriff(e) außerhalb des Arbeitsordners abgelehnt, Ergebnis trotzdem übernommen`,
  };
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
 * passen nicht zum Auftrag (oder fremde Daten wollten etwas anderes), und das soll sichtbar
 * werden, nicht still verpuffen. `stdout` (roh) oder `ergebnis`/`aufrufe` (schon gesammelt,
 * siehe starteClaude). `fehlend`: Pflichtwerkzeuge, die im init-Ereignis fehlten.
 */
export function bewerteLauf({ exitCode, signal, stdout, ergebnis, aufrufe, wache, fehlend, zeitlimit = false }) {
  if (ergebnis === undefined) ({ ergebnis, aufrufe, wache } = leseAusgabe(stdout));
  aufrufe = aufrufe || [];
  wache = wache || [];
  if (fehlend?.length) {
    return { ok: false, art: 'werkzeug-fehlt', meldung: `Pflichtwerkzeug fehlt beim Start von claude -p: ${fehlend.join(', ')} – Lauf abgebrochen, nichts ausgeführt.`, aufrufe };
  }
  if (zeitlimit) return { ok: false, art: 'zeitlimit', meldung: 'Zeitlimit überschritten – Lauf abgebrochen.', aufrufe };
  const j = ergebnis;
  if (!j || j.type !== 'result') {
    return { ok: false, art: 'antwort', meldung: `Keine auswertbare Antwort von claude (Exit ${exitCode ?? signal ?? '?'}).`, aufrufe };
  }
  const ablehnungen = (j.permission_denials || []).map(ablehnungKurz);
  const zeile = abschlussZeile(j.result);
  const basis = { tokens: tokensAus(j.usage), runden: j.num_turns ?? null, dauerSek: j.duration_ms ? Math.round(j.duration_ms / 1000) : null, abschluss: zeile, ablehnungen, wache, aufrufe };
  if (j.is_error || j.subtype !== 'success' || exitCode) {
    return { ...basis, ok: false, art: 'fehler', meldung: `claude endete mit Fehler (${j.subtype || 'unbekannt'}${exitCode ? `, Exit ${exitCode}` : ''}): ${zeile || '–'}` };
  }
  if (ablehnungen.length) {
    const grund = wache.length ? ` · ${wache[0].replace(/^PreToolUse:\S* hook error:\s*/, '')}` : '';
    return { ...basis, ok: false, art: 'abgelehnt', meldung: `Werkzeug abgelehnt: ${ablehnungen.slice(0, 3).join('; ')}${ablehnungen.length > 3 ? ` (+${ablehnungen.length - 3})` : ''}${grund} · ${zeile}` };
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
 * Was das Control Center zeigt. `label`: der launchd-Dienst, der die Datei schreibt - ohne
 * dessen Plist in ~/Library/LaunchAgents gilt die Routine als nicht eingerichtet und erscheint
 * nicht. `stummNachMin`: so viele Minuten im Zeitfenster (`fenster`, null = rund um die Uhr)
 * ohne erfolgreichen Lauf gelten als Ausfall - auch fuer einen eingerichteten Dienst, der nie
 * gestartet ist, und fuer einen, der sich meldet, aber jedes Mal uebersprungen wird.
 */
export const STATUS_DATEIEN = Object.freeze([
  { id: 'fehlermeldungen', datei: 'fehlermeldungen/status.json', titel: 'Fehlermeldungen → Werkbank', label: LAEUFE.fehlermeldungen.label, fenster: ARBEITSZEIT, stummNachMin: 120 },
  { id: 'lieferbelege', datei: 'postfach/status-lieferbelege.json', titel: 'Lieferbelege aus dem Postfach', label: LAEUFE.postfach.label, fenster: ARBEITSZEIT, stummNachMin: 300 },
  { id: 'serviceanfragen', datei: 'postfach/status-serviceanfragen.json', titel: 'Service-Anfragen aus dem Postfach', label: LAEUFE.postfach.label, fenster: ARBEITSZEIT, stummNachMin: 300 },
  { id: 'daten-gesundheit', datei: 'datenstand/status.json', titel: 'Datenstand des Sync-Dienstes', label: 'net.teppich-paradies.datenstand', fenster: null, stummNachMin: 180 },
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
 * To-do, seit wann etwas klemmt. `letzterErfolg` ruckt bei jedem Stand mit ok: true nach.
 * `mitteilen` ist true, wenn ein Fehler neu ist (vorher ok oder eine andere Fehlerart): nur
 * dann soll eine Mitteilung auf dem Mac erscheinen.
 */
export function schreibStatus(privat, id, neu, jetzt = new Date()) {
  const datei = statusPfad(privat, id);
  let alt = {};
  try { alt = liesStatus(privat, id); } catch { alt = {}; }
  const zeit = jetzt.toISOString();
  // Ein reiner Lebenszeichen-Stand ({} oder ohne ok) aendert weder ok noch seit.
  const okWechsel = 'ok' in neu && alt.ok !== neu.ok;
  const stand = { ...alt, ...neu, schema: 1, id, zeit, seit: okWechsel || !alt.seit ? zeit : alt.seit };
  if (neu.ok === true) stand.letzterErfolg = zeit;
  const mitteilen = neu.ok === false && (alt.ok !== false || alt.art !== neu.art);
  fs.mkdirSync(path.dirname(datei), { recursive: true, mode: 0o700 });
  const tmp = `${datei}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(stand, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, datei);
  return { stand, mitteilen };
}

/**
 * Fuer /api/shopwache/status: jede eingerichtete Routine mit ihrem letzten Stand. `stumm`:
 * seit `stummNachMin` Minuten im Zeitfenster kein erfolgreicher Lauf (gezaehlt ab dem letzten
 * Erfolg, frueher nicht als ab der Einrichtung) - deckt nie gestartete, haengende und dauernd
 * uebersprungene Dienste ab.
 */
export function routinenStand(privat = privatDir(), { jetzt = new Date(), agentsDir = LAUNCH_AGENTS_DIR } = {}) {
  const liste = [];
  for (const def of STATUS_DATEIEN) {
    let eingerichtet = null;
    try { eingerichtet = fs.statSync(path.join(agentsDir, `${def.label}.plist`)).mtime; } catch { eingerichtet = null; }
    if (!eingerichtet) continue;
    let s;
    try { s = liesStatus(privat, def.id); } catch { s = { ok: false, art: 'unlesbar', meldung: 'Statusdatei unlesbar' }; }
    const erfolg = s.letzterErfolg && Number.isFinite(Date.parse(s.letzterErfolg)) ? new Date(s.letzterErfolg) : null;
    const bezug = erfolg && erfolg > eingerichtet ? erfolg : eingerichtet;
    const stumm = s.ok !== false && fensterMinuten(bezug, jetzt, def.fenster, def.stummNachMin) > def.stummNachMin;
    const stunden = Math.floor((jetzt.getTime() - bezug.getTime()) / 3_600_000);
    const hinweis = s.hinweis ? String(s.hinweis).slice(0, 160) : null;
    liste.push({
      id: def.id, titel: def.titel, ok: s.ok !== false, art: s.art || null,
      meldung: String(s.meldung || '').slice(0, 300), zeit: s.zeit || null, seit: s.seit || null,
      letzterErfolg: erfolg ? erfolg.toISOString() : null, hinweis,
      stumm, stummSeit: stumm ? bezug.toISOString() : null,
      stummText: stumm ? `${erfolg ? `seit ${stunden} Stunden kein erfolgreicher Lauf` : 'seit der Einrichtung noch kein erfolgreicher Lauf'}${hinweis ? ` (zuletzt: ${hinweis})` : ''}` : null,
    });
  }
  return liste;
}

// --- Sperre gegen Doppelstart ------------------------------------------------

/** Laenger als das darf eine Sperre nicht stehen: Zeitlimit aller Teile plus Puffer. */
export function sperrAlterMs(lauf) {
  const def = LAEUFE[lauf];
  return (def.zeitlimitMin * def.teile.length + SPERRE_PUFFER_MIN) * 60_000;
}

/**
 * Haelt der Prozess die Sperre noch? Nein, wenn sie aelter als `maxAlterMs` ist (eine
 * wiederverwendete PID - auch eine fremde mit EPERM - blockiert so nie dauerhaft) oder der
 * Prozess nachweislich weg ist (ESRCH).
 */
function halterLebt(halter, { jetzt, maxAlterMs, mtimeMs }) {
  const seit = Date.parse(halter?.seit);
  const alter = jetzt.getTime() - (Number.isFinite(seit) ? seit : mtimeMs);
  if (!(alter <= maxAlterMs)) return false;
  if (!Number.isInteger(halter?.pid) || halter.pid <= 0) return false;
  try { process.kill(halter.pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function liesHalter(datei) {
  const st = fs.statSync(datei);
  let halter = null;
  try { halter = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { halter = null; }
  return { halter, mtimeMs: st.mtimeMs };
}

/** Legt die Sperrdatei exklusiv an; eine verwaiste Sperre wird uebernommen. null = besetzt. */
export function nimmSperre(datei, { pid = process.pid, jetzt = new Date(), maxAlterMs = Infinity } = {}) {
  fs.mkdirSync(path.dirname(datei), { recursive: true, mode: 0o700 });
  for (let versuch = 0; versuch < 2; versuch += 1) {
    try {
      const fd = fs.openSync(datei, 'wx', 0o600);
      fs.writeSync(fd, JSON.stringify({ pid, seit: jetzt.toISOString() }));
      fs.closeSync(fd);
      return { datei, pid, freigeben: () => gibSperreFrei(datei, pid) };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let h;
      try { h = liesHalter(datei); } catch { continue; }
      // Gerade angelegt, Inhalt noch nicht geschrieben: besetzt, nicht wegraeumen.
      if (!h.halter && jetzt.getTime() - h.mtimeMs < 60_000) return null;
      if (h.halter && halterLebt(h.halter, { jetzt, maxAlterMs, mtimeMs: h.mtimeMs })) return null;
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

export function sperreBesetzt(datei, { jetzt = new Date(), maxAlterMs = Infinity } = {}) {
  try {
    const h = liesHalter(datei);
    if (!h.halter) return jetzt.getTime() - h.mtimeMs < 60_000;
    return halterLebt(h.halter, { jetzt, maxAlterMs, mtimeMs: h.mtimeMs });
  } catch { return false; }
}

export function sperrPfad(privat, lauf) {
  return path.join(routinenDir(privat), lauf, 'sperre');
}

/**
 * Laeuft gerade eine Claude-Routine im Dienst-Checkout? Name des Laufs oder null. Fuer
 * operations/scripts/betrieb-nachziehen.mjs (#1715): solange eine Routine dort
 * `npm run -s …` ausfuehrt, kein Vorspulen, kein npm ci, kein Neustart.
 */
export function routineLaeuft(privat = privatDir(), { jetzt = new Date() } = {}) {
  for (const lauf of Object.keys(LAEUFE)) {
    if (sperreBesetzt(sperrPfad(privat, lauf), { jetzt, maxAlterMs: sperrAlterMs(lauf) })) return lauf;
  }
  return null;
}

// --- Datenstand (ersetzt den Datenteil von shop-zahlen-export) ------------------

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
