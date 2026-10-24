#!/usr/bin/env node
// Direkter Austausch zwischen Claude Code und Codex ueber die lokal
// angemeldeten Kommandozeilen (Abo-Konten, keine API-Keys).
//
// Beide Seiten fragen die andere nur lesend: Codex laeuft mit
// `--sandbox read-only`, Claude mit `--permission-mode plan`. Arbeit, die
// Dateien aendert, bleibt eine Uebergabe (Vault `Zusammenarbeit/`).
//
//   npm run -s ki:frag -- codex "Frage"            neues Gespraech mit Codex
//   npm run -s ki:frag -- claude "Frage"           neues Gespraech mit Claude (fuer Codex)
//   npm run -s ki:frag -- weiter codex "Rueckfrage" dasselbe Gespraech fortsetzen
//   npm run -s ki:frag -- faeden                    gemerkte Gespraeche anzeigen
//   npm run -s ki:frag -- review 1234 ["Zusatz"]    Codex prueft den PR-Diff, gebunden an den Head-Commit
//   npm run -s ki:frag -- review-stand 1234         gilt das letzte Review noch fuer den aktuellen Head? (Exit 1 = nein)
//
// Optionen: --faden <name> (eigener Gespraechsname, Standard = ki),
//           --modell <m>, --aufwand <low|medium|high|xhigh> (nur Codex),
//           --cd <ordner> (Arbeitsordner, Standard = aktuelle Arbeitskopie).
// Text auf stdin (z. B. ein Diff) wird an die Frage angehaengt.
//
// Gespraechs-IDs liegen im gemeinsamen .git-Ordner (lokal, nicht versioniert,
// fuer alle Worktrees gleich): <git-common-dir>/ki-austausch/faeden.json,
// Reviews daneben unter reviews/pr-<nr>-<sha>.md.
//
// Warum review eigens: Bis 2026-10-24 ging ein Diff per stdin an Codex, ohne dass
// festgehalten wurde, fuer welchen Commit das Ergebnis gilt, und Codex las den
// Kontext aus der Arbeitskopie, in der gerade gefragt wurde - oft ein anderer
// Stand als der PR. 2026-09-30 waren rund zwei Drittel der Review-Befunde
// Rauschen aus dem geteilten Checkout (.claude/README.md). review laesst Codex
// deshalb in einer eigenen Pruefkopie genau auf dem Head-Commit lesen.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIS = ['codex', 'claude'];
const MAX_TIEFE = 2; // Claude -> Codex -> Claude reicht; keine Endlosschleife
const TIMEOUT_MS = 15 * 60 * 1000;

export function kopf(von) {
  return [
    `[Nachricht von ${von} ueber scripts/ki-austausch.mjs im Repository TeppichParadies.`,
    'Du wirst als zweite Meinung befragt: nur lesen, nichts aendern, nichts deployen, nichts in Shopify schreiben.',
    'Regeln stehen in AGENTS.md; Lieferantennamen nur als Pseudonyme. Antworte knapp auf Deutsch.',
    'Wo du unsicher bist oder etwas nicht pruefen konntest, sag es.]',
    '',
  ].join('\n');
}

export function argumente(argv) {
  const a = { optionen: {}, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const name = t.slice(2);
      if (!['faden', 'modell', 'aufwand', 'cd'].includes(name)) throw new Error(`Unbekannte Option ${t}`);
      const wert = argv[++i];
      if (wert === undefined) throw new Error(`${t} braucht einen Wert`);
      a.optionen[name] = wert;
    } else a.rest.push(t);
  }
  let [befehl, ...frage] = a.rest;
  let weiter = false;
  if (befehl === 'weiter') { weiter = true; befehl = frage.shift(); }
  if (befehl === 'faeden') return { befehl, ...a.optionen };
  if (!weiter && (befehl === 'review' || befehl === 'review-stand')) {
    const [nr, ...rest] = frage;
    if (!/^\d+$/.test(nr || '')) throw new Error(`${befehl} braucht eine PR-Nummer, z. B. ${befehl} 1234`);
    return { befehl, pr: Number(nr), frage: rest.join(' ').trim(), ...a.optionen };
  }
  if (!KIS.includes(befehl)) throw new Error(`Erstes Argument: ${KIS.join(' | ')} | weiter <ki> | faeden | review <pr> | review-stand <pr>`);
  return { befehl, weiter, frage: frage.join(' ').trim(), ...a.optionen };
}

/** Codex steckt auf dem Mac in der ChatGPT-App und ist dann nicht im PATH. */
export function codexKandidaten(env = process.env, plattform = process.platform) {
  const k = [];
  if (env.CODEX_BIN) k.push(env.CODEX_BIN);
  k.push('codex');
  if (plattform === 'darwin') {
    k.push('/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex');
    k.push(path.join(os.homedir(), 'Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex'));
  }
  return k;
}

export function claudeKandidaten(env = process.env) {
  return [env.CLAUDE_BIN, 'claude', path.join(os.homedir(), '.local/bin/claude')].filter(Boolean);
}

function finde(kandidaten) {
  for (const k of kandidaten) {
    try { execFileSync(k, ['--version'], { stdio: 'ignore', timeout: 20000 }); return k; } catch { /* naechster */ }
  }
  return null;
}

// Die Frage geht ueber stdin ("-" bei Codex, ohne Argument bei Claude): ein
// grosser Diff als Prozessargument scheitert sonst am Betriebssystemlimit (E2BIG).
export function codexAufruf({ id, modell, aufwand, cd }) {
  const a = ['exec'];
  if (id) a.push('resume');
  a.push('--json', '--skip-git-repo-check', '-c', 'suppress_unstable_features_warning=true');
  // resume kennt --sandbox/--cd nicht; die Sandbox gilt dort per -c
  if (id) a.push('-c', 'sandbox_mode="read-only"');
  else a.push('--sandbox', 'read-only', '--cd', cd);
  if (modell) a.push('--model', modell);
  if (aufwand) a.push('-c', `model_reasoning_effort="${aufwand}"`);
  if (id) a.push(id);
  a.push('-');
  return a;
}

export function claudeAufruf({ id, modell }) {
  const a = ['-p', '--output-format', 'json', '--permission-mode', 'plan'];
  if (id) a.push('--resume', id);
  if (modell) a.push('--model', modell);
  return a;
}

/** Codex --json: eine Zeile je Ereignis. */
export function codexAntwort(ausgabe) {
  let id = null;
  const texte = [];
  const fehler = [];
  for (const zeile of ausgabe.split('\n')) {
    if (!zeile.trim().startsWith('{')) continue;
    let e;
    try { e = JSON.parse(zeile); } catch { continue; }
    if (e.type === 'thread.started') id = e.thread_id;
    if (e.type === 'item.completed' && e.item?.type === 'agent_message') texte.push(e.item.text);
    // Einzelne "error"-Ereignisse sind meist Wiederverbindungen; erst turn.failed ist ein Abbruch
    if (e.type === 'turn.failed') fehler.push(e.error?.message || e.message || JSON.stringify(e));
  }
  // Zwischenmeldungen ("Ich lese ...") weglassen; die letzte Nachricht ist die Antwort
  return { id, text: texte.at(-1) ?? '', fehler };
}

export function claudeAntwort(ausgabe) {
  let j;
  try { j = JSON.parse(ausgabe.trim().split('\n').filter(Boolean).at(-1)); } catch { return { id: null, text: '', fehler: [ausgabe.slice(0, 500)] }; }
  return { id: j.session_id ?? null, text: j.result ?? '', fehler: j.is_error ? [j.result || 'Fehler'] : [] };
}

/**
 * Laeuft das Skript in einer Claude-Desktop-Sitzung, erbt es deren Proxy- und
 * Sitzungsvariablen; die eigenstaendige Claude-CLI meldet sich damit falsch an.
 */
export function kindUmgebung(quelle, ki, tiefe) {
  const env = { ...quelle, TP_KI_TIEFE: String(tiefe + 1) };
  for (const k of Object.keys(env)) {
    if (ki === 'claude' && /^(CLAUDE_CODE_|CLAUDE_AGENT_SDK_|CLAUDECODE$|CLAUDE_PID$|ANTHROPIC_BASE_URL$)/.test(k)) delete env[k];
    if (geheim(k, ki)) delete env[k];
  }
  return env;
}

/**
 * Zugangsdaten der eigenen Sitzung gehen nie an die andere KI (AGENTS.md: keine
 * Live-Zugangsdaten an Codex). Bis 2026-10-24 erbte Codex die volle Umgebung,
 * in Desktop-Sitzungen u. a. CLAUDE_CODE_MESSAGING_TOKEN. Die eigene Anmeldung
 * der Ziel-KI (bei Codex OPENAI_ und CODEX_) bleibt, sonst meldet sie sich anders an.
 * Deutsche Namen zaehlen mit: TP_DASHBOARD_PASSWORT ging bis Runde 1 von #1669 durch.
 */
export function geheim(name, ki) {
  if (ki === 'codex' && /^(OPENAI_|CODEX_)/.test(name)) return false;
  return /TOKEN|SECRET|PASS(WORD|WD|WORT|PHRASE)?($|_)|KENNWORT|CREDENTIAL|API_?KEY|PRIVATE_?KEY|(^|_)KEY$|COOKIE/i.test(name)
    || /^(SHOPIFY_|GH_|GITHUB_|LEXWARE_|SUMUP_|ANTHROPIC_API_KEY$|SSH_AUTH_SOCK$|AWS_)/.test(name)
    || (ki === 'codex' && /^(CLAUDE_CODE_|CLAUDE_AGENT_SDK_)/.test(name));
}

function zustandsDatei() {
  const dir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
  return path.join(dir, 'ki-austausch', 'faeden.json');
}

function lies(datei) {
  try { return JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { return {}; }
}

/**
 * Lesen und Schreiben unter einer Sperre (mkdir ist atomar): parallele Aufrufe
 * mit anderem --faden ueberschreiben sich nicht gegenseitig.
 */
function merke(datei, name, faden) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const sperre = `${datei}.lock`;
  const bis = Date.now() + 10000;
  for (;;) {
    try { fs.mkdirSync(sperre); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (Date.now() > bis) { fs.rmSync(sperre, { recursive: true, force: true }); continue; } // verwaiste Sperre
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    const tmp = `${datei}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ ...lies(datei), [name]: faden }, null, 2) + '\n');
    fs.renameSync(tmp, datei);
  } finally {
    fs.rmSync(sperre, { recursive: true, force: true });
  }
}

function lauf(bin, args, { env, cwd, eingabe }) {
  return new Promise((resolve) => {
    const kind = spawn(bin, args, { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const uhr = setTimeout(() => kind.kill('SIGTERM'), TIMEOUT_MS);
    kind.stdout.on('data', (d) => { out += d; });
    kind.stderr.on('data', (d) => { err += d; });
    kind.on('close', (code) => { clearTimeout(uhr); resolve({ code, out, err }); });
    kind.stdin.on('error', () => {}); // Kind beendet sich frueh (z. B. Anmeldefehler)
    kind.stdin.end(eingabe);
  });
}

/**
 * Agenten-Shells lassen stdin oft als offene, leere Pipe stehen. Kommt in den
 * ersten 2 s nichts, gibt es keinen angehaengten Text - sonst bis zum Ende lesen.
 */
function stdinText(wartezeit = 2000) {
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    let s = '';
    const fertig = () => { clearTimeout(uhr); process.stdin.destroy(); resolve(s); };
    const uhr = setTimeout(() => { if (!s) fertig(); }, wartezeit);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { s += d; });
    process.stdin.on('end', fertig);
    process.stdin.on('error', fertig);
  });
}

async function main() {
  const a = argumente(process.argv.slice(2));
  const datei = zustandsDatei();
  const faeden = lies(datei);

  if (a.befehl === 'faeden') {
    const z = Object.entries(faeden);
    if (!z.length) console.log('Keine gemerkten Gespraeche.');
    for (const [name, f] of z) console.log(`${name.padEnd(20)} ${f.ki.padEnd(7)} ${f.zuletzt}  ${f.id}`);
    return;
  }

  const tiefe = Number(process.env.TP_KI_TIEFE || 0);
  if (tiefe >= MAX_TIEFE) throw new Error(`Austauschtiefe ${tiefe} erreicht - keine weitere Weiterfrage (Schleifenschutz).`);

  if (a.befehl === 'review-stand') return reviewStandMelden(a.pr);
  if (a.befehl === 'review') return reviewAusfuehren(a, { datei, tiefe });

  const ki = a.befehl;
  const name = a.faden || ki;
  let id = null;
  let cd = path.resolve(a.cd || process.cwd());
  if (a.weiter) {
    const f = faeden[name];
    if (!f || f.ki !== ki) throw new Error(`Kein gemerktes ${ki}-Gespraech "${name}" - erst ohne "weiter" fragen.`);
    id = f.id;
    if (!a.cd && f.cd && fs.existsSync(f.cd)) cd = f.cd; // Claude findet Sitzungen nur im selben Ordner
  }

  const zusatz = await stdinText();
  if (!a.frage && !zusatz) throw new Error('Keine Frage angegeben.');
  const von = ki === 'codex' ? 'Claude Code' : 'Codex';
  const frage = (id ? '' : kopf(von)) + (a.frage || 'Siehe Text unten.') + (zusatz ? `\n\n<stdin>\n${zusatz}\n</stdin>` : '');

  const antwort = await frageKi({ ki, id, frage, cd, tiefe, modell: a.modell, aufwand: a.aufwand });
  const neueId = antwort.id || id;
  if (neueId) merke(datei, name, { ki, id: neueId, cd, zuletzt: new Date().toISOString().slice(0, 16) + 'Z' });
  console.log(antwort.text);
  console.error(`\n[${ki} · Gespraech "${name}" · weiter mit: npm run -s ki:frag -- weiter ${ki}${a.faden ? ` --faden ${a.faden}` : ''} "..."]`);
}

/** Kontingent erschoepft: nicht wiederholen (Exit 3), sondern Stand sichern. */
export const KONTINGENT = /usage limit|rate limit|quota|(?:HTTP|status) 429|too many requests|Wochenlimit|weekly limit/i;

async function frageKi({ ki, id, frage, cd, tiefe, modell, aufwand }) {
  const bin = finde(ki === 'codex' ? codexKandidaten() : claudeKandidaten());
  if (!bin) throw new Error(ki === 'codex'
    ? 'Codex-CLI nicht gefunden (ChatGPT-App installiert? sonst CODEX_BIN setzen).'
    : 'Claude-CLI nicht gefunden (CLAUDE_BIN setzen).');

  const args = ki === 'codex'
    ? codexAufruf({ id, modell, aufwand, cd })
    : claudeAufruf({ id, modell });
  const env = kindUmgebung(process.env, ki, tiefe);
  const { code, out, err } = await lauf(bin, args, { env, cwd: cd, eingabe: frage });
  const antwort = ki === 'codex' ? codexAntwort(out) : claudeAntwort(out);

  // Exit != 0 heisst abgebrochen (Timeout, Fehler) - auch wenn schon eine Zwischenmeldung kam
  if (code !== 0 || !antwort.text || antwort.fehler.length) {
    const grund = [...antwort.fehler, err.trim().split('\n').slice(-5).join('\n')].filter(Boolean).join('\n');
    if (KONTINGENT.test(grund)) {
      throw Object.assign(new Error(`${ki}: Kontingent erschoepft - nicht wiederholen. Stand sichern (npm run -s handoff, Uebergabedatei) und spaeter fortsetzen.\n${grund}`), { exitCode: 3 });
    }
    const anmelden = /authenticat|log ?in|sign in|OAuth/i.test(grund)
      ? `\nAnmeldung fehlt: einmal im Terminal \`${ki}\` starten und anmelden (${ki === 'claude' ? '/login, Claude-Abo' : 'mit ChatGPT'}).`
      : '';
    throw new Error(`${ki} hat nicht geantwortet (Exit ${code}).\n${grund}${anmelden}`);
  }
  return antwort;
}

// ---- Review eines PR, gebunden an den Head-Commit ----

const MAX_RUNDEN = 3; // AGENTS.md: hoechstens zwei bis drei gezielte Pruefrunden

export function reviewKopf({ pr, titel, head, basis, kopfRef, runde }) {
  return [
    `Pruefgegenstand: PR #${pr} "${titel}" (${kopfRef} -> ${basis}), Head-Commit ${head}.`,
    `Pruefrunde ${runde}. Die Arbeitskopie, in der du liest, steht genau auf diesem Commit; der Diff gegen die Basis steht unten.`,
    'Pruefe nur diesen Diff und was er beruehrt: Korrektheit, Regressionen, Verstoesse gegen AGENTS.md, fehlende oder falsche Tests. Keine Stilfragen.',
    'Antwortformat:',
    '- je Befund eine Zeile: P1|P2|P3 Datei:Zeile - Problem - Vorschlag',
    '- ohne Befund genau die Zeile: KEINE BEFUNDE',
    '- zuletzt: Geprueft: <was du gelesen oder ausgefuehrt hast, und was nicht>',
  ].join('\n');
}

export function reviewDateiname(pr, sha) {
  return `pr-${pr}-${sha.slice(0, 12)}.md`;
}

/** Reviews eines PR aus dem Ordner, aelteste zuerst (Kopfzeilen der gespeicherten Dateien). */
export function reviewsLesen(ordner, pr) {
  let namen = [];
  try { namen = fs.readdirSync(ordner).filter((n) => n.startsWith(`pr-${pr}-`) && n.endsWith('.md')); } catch { return []; }
  return namen.map((n) => {
    const text = fs.readFileSync(path.join(ordner, n), 'utf8');
    const feld = (k) => new RegExp(`^${k}: (.*)$`, 'm').exec(text)?.[1]?.trim() ?? null;
    const befunde = text.split('\n---\n').slice(1).join('\n---\n').trim();
    return { datei: n, head: feld('head'), zeit: feld('zeit'), runde: Number(feld('runde') || 0), ergebnis: feld('ergebnis'), befunde };
  }).sort((x, y) => String(x.zeit).localeCompare(String(y.zeit)));
}

export const gueltig = (ergebnis) => /^(keine Befunde|\d+ P1, \d+ P2, \d+ P3)$/.test(ergebnis ?? '');
const offeneP1 = (ergebnis) => Number(/^(\d+) P1/.exec(ergebnis ?? '')?.[1] || 0);

/**
 * aktuell: neuestes Review gilt fuer den Head, ist verwertbar und hat keinen P1.
 * Ein P1 ist ein Blocker; haelt Claude ihn fuer falsch, entscheidet der Benutzer.
 */
export function reviewStand(reviews, headSha) {
  const letzte = reviews.at(-1) ?? null;
  if (!letzte) return { status: 'fehlt', letzte };
  if (letzte.head !== headSha) return { status: 'veraltet', letzte };
  if (!gueltig(letzte.ergebnis)) return { status: 'ungueltig', letzte };
  if (offeneP1(letzte.ergebnis)) return { status: 'offen', letzte };
  return { status: 'aktuell', letzte };
}

/** Prompt-Teil mit den Befunden der vorigen Runde, damit Codex sie gezielt nachprueft. */
export function vorigeRunde(r, max = 8000) {
  if (!r?.befunde) return '';
  const text = r.befunde.length > max ? `${r.befunde.slice(0, max)}\n[... gekuerzt]` : r.befunde;
  return `\n\nBefunde deiner vorigen Runde (Runde ${r.runde}, Commit ${String(r.head).slice(0, 12)}). Pruefe zuerst, ob sie behoben sind, und nenne offene erneut:\n<vorige_runde>\n${text}\n</vorige_runde>`;
}

export function ergebnisZeile(text) {
  if (/^\s*KEINE BEFUNDE\s*$/m.test(text)) return 'keine Befunde';
  const n = (p) => (text.match(new RegExp(`^\\s*[-*]*\\s*\\**${p}\\b`, 'gm')) || []).length;
  const zahlen = ['P1', 'P2', 'P3'].map((p) => [p, n(p)]);
  if (!zahlen.some(([, k]) => k > 0)) return 'unklar (Antwortformat nicht eingehalten)';
  return zahlen.map(([p, k]) => `${k} ${p}`).join(', ');
}

function reviewOrdner() {
  const dir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
  return path.join(dir, 'ki-austausch', 'reviews');
}

function prInfo(pr) {
  return JSON.parse(execFileSync('gh', ['pr', 'view', String(pr), '--json', 'number,title,headRefOid,headRefName,baseRefName,state'], { encoding: 'utf8' }));
}

function reviewStandMelden(pr) {
  const info = prInfo(pr);
  const { status, letzte } = reviewStand(reviewsLesen(reviewOrdner(), pr), info.headRefOid);
  const kurz = info.headRefOid.slice(0, 12);
  if (status === 'aktuell') console.log(`Review aktuell: PR #${pr} Head ${kurz}, Runde ${letzte.runde}, ${letzte.ergebnis} (${letzte.datei}).`);
  else if (status === 'offen') console.log(`Review fuer Head ${kurz} hat offene P1 (${letzte.ergebnis}): beheben und neu pruefen lassen, oder den Benutzer entscheiden lassen (${letzte.datei}).`);
  else if (status === 'ungueltig') console.log(`Review fuer Head ${kurz} ist nicht verwertbar (${letzte.ergebnis}). Neu: npm run -s ki:frag -- review ${pr}`);
  else if (status === 'veraltet') console.log(`Review veraltet: letztes fuer ${letzte.head.slice(0, 12)}, PR #${pr} steht jetzt auf ${kurz}. Neu: npm run -s ki:frag -- review ${pr}`);
  else console.log(`Kein Review fuer PR #${pr} (Head ${kurz}). Neu: npm run -s ki:frag -- review ${pr}`);
  process.exitCode = status === 'aktuell' ? 0 : 1;
}

async function reviewAusfuehren(a, { datei, tiefe }) {
  const pr = a.pr;
  const vorher = prInfo(pr);
  if (vorher.state !== 'OPEN') throw new Error(`PR #${pr} ist ${vorher.state} - Review nur fuer offene PRs.`);
  const diff = execFileSync('gh', ['pr', 'diff', String(pr)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const nachher = prInfo(pr);
  if (nachher.headRefOid !== vorher.headRefOid) throw new Error(`PR #${pr} hat sich waehrend des Abrufs geaendert (${vorher.headRefOid.slice(0, 12)} -> ${nachher.headRefOid.slice(0, 12)}). Nochmal starten.`);
  const head = vorher.headRefOid;

  const ordner = reviewOrdner();
  const frueher = reviewsLesen(ordner, pr).filter((r) => gueltig(r.ergebnis));
  const vorige = frueher.at(-1) ?? null;
  const runde = (vorige?.runde || 0) + 1;
  if (runde > MAX_RUNDEN) {
    console.error(`Hinweis: Pruefrunde ${runde} fuer PR #${pr}. AGENTS.md: nach zwei bis drei Runden erst Ursache und Blocker analysieren, statt weiter zu wiederholen.`);
  }

  // Immer eine eigene, frische Pruefkopie genau auf dem Head-Commit. Die eigene
  // Arbeitskopie kann uncommittete Aenderungen haben, eine vorhandene Pruefkopie
  // gehoert womoeglich einem laufenden Review (Codex-Review #1669, Runde 1).
  const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const hier = git(['rev-parse', '--show-toplevel']);
  const haupt = path.dirname(git(['rev-parse', '--path-format=absolute', '--git-common-dir'], hier));
  const pruefkopie = path.join(haupt, '.claude', 'worktrees', `_pruefung-pr${pr}-${head.slice(0, 8)}`);
  if (fs.existsSync(pruefkopie)) throw new Error(`Pruefkopie ${pruefkopie} gibt es schon - laeuft gerade ein Review dieses Commits? Sonst entfernen: git worktree remove --force ${pruefkopie}`);
  try { git(['cat-file', '-e', `${head}^{commit}`], hier); } catch { git(['fetch', '-q', 'origin', `pull/${pr}/head`], hier); }
  git(['worktree', 'add', '-q', '--detach', pruefkopie, head], hier);
  const cd = pruefkopie;

  try {
    if (git(['rev-parse', 'HEAD'], cd) !== head) throw new Error(`Pruefkopie steht nicht auf ${head.slice(0, 12)}.`);
    const frage = kopf('Claude Code') + reviewKopf({ pr, titel: vorher.title, head, basis: vorher.baseRefName, kopfRef: vorher.headRefName, runde })
      + vorigeRunde(vorige) + (a.frage ? `\n\nZusaetzlich: ${a.frage}` : '') + `\n\n<diff>\n${diff}\n</diff>`;
    const antwort = await frageKi({ ki: 'codex', frage, cd, tiefe, modell: a.modell, aufwand: a.aufwand });
    const ergebnis = ergebnisZeile(antwort.text);
    fs.mkdirSync(ordner, { recursive: true });
    if (!gueltig(ergebnis)) {
      // Nicht als Review ablegen: es zaehlte sonst als Runde und ueberschriebe ein gueltiges Review desselben Commits.
      const roh = path.join(ordner, `pr-${pr}-${head.slice(0, 12)}-unverwertbar.txt`);
      fs.writeFileSync(roh, antwort.text);
      console.log(antwort.text);
      console.error(`\n[Codex-Antwort fuer PR #${pr} nicht verwertbar (${ergebnis}) - nicht als Review gezaehlt. Rohtext: ${roh}]`);
      process.exitCode = 1;
      return;
    }
    const ziel = path.join(ordner, reviewDateiname(pr, head));
    const zeit = new Date().toISOString();
    fs.writeFileSync(ziel, [`# Review PR #${pr}`, `pr: ${pr}`, `head: ${head}`, `basis: ${vorher.baseRefName}`, `zeit: ${zeit}`,
      `runde: ${runde}`, `ki: codex`, `faden: ${antwort.id ?? '-'}`, `ergebnis: ${ergebnis}`, '---', antwort.text, ''].join('\n'));
    if (antwort.id) merke(datei, `pr-${pr}`, { ki: 'codex', id: antwort.id, cd: hier, zuletzt: zeit.slice(0, 16) + 'Z' });
    console.log(antwort.text);
    console.error(`\n[Codex-Review PR #${pr} · gilt fuer ${head.slice(0, 12)} · Runde ${runde} · ${ergebnis} · ${ziel}]`);
    console.error(`[Rueckfrage: npm run -s ki:frag -- weiter codex --faden pr-${pr} "..." · vor dem Merge: npm run -s ki:frag -- review-stand ${pr}]`);
  } finally {
    try { git(['worktree', 'remove', pruefkopie], hier); } catch (e) { console.error(`Pruefkopie nicht entfernt (${pruefkopie}): ${e.message.split('\n')[0]}`); }
  }
}

// realpath: bei Leerzeichen im Pfad, Symlinks und unter Windows passte der alte
// Vergleich mit file://argv[1] nie, und das Skript endete still (Codex-Review #1667).
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(e.exitCode || 1); });
}
